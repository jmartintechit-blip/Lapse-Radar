import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrate } from '../db/migrate';
import { createPgliteDb } from '../db/pglite';
import { NoRdapError } from './rdap';
import { checkItem, runDueChecks, type Checker } from './runner';

const db = createPgliteDb();
let userId = '';

beforeAll(async () => {
  await migrate(db);
  const [user] = await db.query<{ id: string }>(
    "insert into users (email, password_hash) values ('runner@example.com', 'x') returning id",
  );
  userId = user!.id;
});
afterAll(() => db.close());
beforeEach(async () => {
  await db.query('delete from items');
});

// dueMinutesAgo: how long the check has been due (negative = due in the future, null = never).
const addItem = async (host: string, kind = 'tls', dueMinutesAgo: number | null = 1) => {
  const [row] = await db.query<{ id: string }>(
    `insert into items (user_id, kind, label, host, expires_at, next_check_at)
     values ($1, $2, $3, case when $2 = 'manual' then null else $3 end,
             case when $2 = 'manual' then now() else null end,
             case when $4::int is null then null else now() - make_interval(mins => $4) end)
     returning id`,
    [userId, kind, host, dueMinutesAgo],
  );
  return row!.id;
};
const state = async (id: string) =>
  (
    await db.query<{
      status: string;
      last_error: string | null;
      expires_at: Date | null;
      hours: number;
    }>(
      `select status, last_error, expires_at,
              round(extract(epoch from next_check_at - now()) / 3600)::int as hours
       from items where id = $1`,
      [id],
    )
  )[0]!;

const ok: Checker = async () => ({ expiresAt: new Date('2031-02-03T04:05:06Z') });

describe('checkItem', () => {
  it('stores the expiry and schedules the next check in 24 hours', async () => {
    const id = await addItem('a.example.com');
    expect(await checkItem(db, { id, kind: 'tls', host: 'a.example.com' }, ok)).toBe('ok');
    expect(await state(id)).toMatchObject({ status: 'ok', last_error: null, hours: 24 });
    expect((await state(id)).expires_at?.toISOString()).toBe('2031-02-03T04:05:06.000Z');
  });

  it('records an untrusted certificate as an error but still stores its expiry', async () => {
    const id = await addItem('b.example.com');
    const check: Checker = async () => ({
      expiresAt: new Date('2020-01-01T00:00:00Z'),
      problem: 'Certificate not trusted: CERT_HAS_EXPIRED',
    });
    expect(await checkItem(db, { id, kind: 'tls', host: 'b.example.com' }, check)).toBe('error');
    expect(await state(id)).toMatchObject({
      status: 'error',
      last_error: 'Certificate not trusted: CERT_HAS_EXPIRED',
      hours: 6,
    });
    expect((await state(id)).expires_at?.getUTCFullYear()).toBe(2020);
  });

  it('keeps the previous expiry when the check fails and retries in 6 hours', async () => {
    const id = await addItem('c.example.com');
    await checkItem(db, { id, kind: 'tls', host: 'c.example.com' }, ok);
    const fail: Checker = () => Promise.reject(new Error('ECONNREFUSED'));
    expect(await checkItem(db, { id, kind: 'tls', host: 'c.example.com' }, fail)).toBe('error');
    expect(await state(id)).toMatchObject({
      status: 'error',
      last_error: 'ECONNREFUSED',
      hours: 6,
    });
    expect((await state(id)).expires_at?.getUTCFullYear()).toBe(2031);
  });

  it('retries a TLD without RDAP only after a week, and clears the error on success', async () => {
    const id = await addItem('d.es', 'domain');
    const noRdap: Checker = () => Promise.reject(new NoRdapError('.es has no RDAP service'));
    await checkItem(db, { id, kind: 'domain', host: 'd.es' }, noRdap);
    expect(await state(id)).toMatchObject({ status: 'error', hours: 168 });
    await checkItem(db, { id, kind: 'domain', host: 'd.es' }, ok);
    expect(await state(id)).toMatchObject({ status: 'ok', last_error: null });
  });
});

describe('runDueChecks', () => {
  it('checks only due automatic items', async () => {
    const due = await addItem('due.example.com');
    const later = await addItem('later.example.com', 'tls', -60); // due in an hour
    const manual = await addItem('Manual key', 'manual', null);
    const check = vi.fn(ok);
    expect(await runDueChecks(db, { check })).toEqual({ checked: 1, ok: 1, failed: 0, skipped: 0 });
    expect(check).toHaveBeenCalledOnce();
    expect((await state(due)).status).toBe('ok');
    expect((await state(later)).status).toBe('pending');
    expect((await state(manual)).status).toBe('pending');
  });

  it('takes at most 50 items per run and never more than 8 at once', async () => {
    for (let i = 0; i < 60; i++) await addItem(`h${i}.example.com`, 'tls', 100 + i);
    let running = 0;
    let peak = 0;
    const check: Checker = async () => {
      peak = Math.max(peak, ++running);
      await new Promise((r) => setTimeout(r, 2));
      running--;
      return { expiresAt: new Date('2031-01-01T00:00:00Z') };
    };
    expect(await runDueChecks(db, { check })).toMatchObject({ checked: 50, skipped: 0 });
    expect(peak).toBe(8);
    const [left] = await db.query<{ n: number }>(
      "select count(*)::int as n from items where status = 'pending'",
    );
    expect(left!.n).toBe(10); // the 10 least overdue wait for the next run
  });

  it('stops starting checks when the time budget is nearly used up', async () => {
    for (let i = 0; i < 10; i++) await addItem(`t${i}.example.com`, 'tls', 100 + i);
    let now = 0;
    const slow: Checker = async () => {
      now += 6000; // each check "takes" 6 s of the 25 s budget
      return { expiresAt: new Date('2031-01-01T00:00:00Z') };
    };
    // Starts are allowed while elapsed < 20 s: at 0, 6, 12 and 18 s.
    const summary = await runDueChecks(db, { check: slow, clock: () => now, concurrency: 1 });
    expect(summary).toEqual({ checked: 4, ok: 4, failed: 0, skipped: 6 });
  });

  it('counts failures without stopping the batch', async () => {
    await addItem('good.example.com', 'tls', 2);
    await addItem('bad.example.com', 'tls', 1);
    const check: Checker = async ({ host }) =>
      host.startsWith('bad')
        ? Promise.reject(new Error('boom'))
        : ok({ id: '', kind: 'tls', host });
    expect(await runDueChecks(db, { check })).toEqual({ checked: 2, ok: 1, failed: 1, skipped: 0 });
  });
});
