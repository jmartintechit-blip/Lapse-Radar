import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from './db';
import { migrate } from './db/migrate';
import { createPgliteDb } from './db/pglite';
import { runScheduled } from './scheduled';

const db = createPgliteDb();
let userId = '';

beforeAll(async () => {
  await migrate(db);
  const [user] = await db.query<{ id: string }>(
    "insert into users (email, password_hash) values ('sched@example.com', 'x') returning id",
  );
  userId = user!.id;
});
afterAll(() => db.close());
beforeEach(() => db.query('delete from items'));

describe('runScheduled', () => {
  it('checks due items, then raises the alerts they cause', async () => {
    await db.query(
      `insert into items (user_id, kind, label, host, next_check_at)
       values ($1, 'tls', 'a', 'a.example.com', now() - interval '1 minute')`,
      [userId],
    );
    const check = () => Promise.resolve({ expiresAt: new Date(Date.now() + 3 * 86_400_000) });
    const first = await runScheduled(db, { check });
    expect(first).toEqual({ skipped: false, checked: 1, ok: 1, failed: 0, pending: 0, alerts: 1 });
    // Nothing is due any more and the alert already exists: a second run does nothing.
    expect(await runScheduled(db, { check })).toMatchObject({ checked: 0, alerts: 0 });
  });

  it('leaves at once, doing no work, when another run holds the lock', async () => {
    const queries: string[] = [];
    const busy: Db = {
      ...db,
      query: (sql) => {
        queries.push(sql);
        return Promise.resolve([{ locked: false }]) as never;
      },
      transaction: (fn) => fn(busy),
    };
    expect(await runScheduled(busy)).toEqual({ skipped: true });
    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain('pg_try_advisory_xact_lock');
  });
});
