import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from './index';
import { migrate } from './migrate';
import { createPgliteDb } from './pglite';

let db: Db;
beforeEach(async () => {
  db = createPgliteDb();
  await migrate(db);
});
afterEach(() => db.close());

const addUser = async (email: string) =>
  (
    await db.query<{ id: string }>(
      "insert into users (email, password_hash) values ($1, 'x') returning id",
      [email],
    )
  )[0]!.id;

const addManual = async (userId: string, label = 'API key') =>
  (
    await db.query<{ id: string }>(
      "insert into items (user_id, kind, label, expires_at) values ($1, 'manual', $2, now() + interval '30 days') returning id",
      [userId, label],
    )
  )[0]!.id;

const addAlert = (userId: string, itemId: string, days: number, snapshot: string) =>
  db.query(
    'insert into alerts (user_id, item_id, threshold_days, expiry_snapshot) values ($1, $2, $3, $4)',
    [userId, itemId, days, snapshot],
  );

describe('migrations', () => {
  it('are idempotent', async () => {
    expect(await migrate(db)).toEqual([]);
  });
});

describe('schema constraints', () => {
  it('stores emails lowercase and unique', async () => {
    await expect(addUser('Ana@Example.com')).rejects.toThrow();
    await addUser('ana@example.com');
    await expect(addUser('ana@example.com')).rejects.toThrow();
  });

  it('keeps host and expiry consistent with the item kind', async () => {
    const u = await addUser('a@example.com');
    const insert = (kind: string, host: string | null, expires: string | null) =>
      db.query(
        "insert into items (user_id, kind, label, host, expires_at) values ($1, $2, 'x', $3, $4)",
        [u, kind, host, expires],
      );
    await expect(insert('manual', null, null)).rejects.toThrow(); // manual needs a date
    await expect(insert('manual', 'example.com', '2030-01-01')).rejects.toThrow(); // no host
    await expect(insert('tls', null, null)).rejects.toThrow(); // tls needs a host
    await insert('tls', 'example.com', null);
  });

  it('rejects the same host twice for one user but allows it for another', async () => {
    const [a, b] = [await addUser('a@example.com'), await addUser('b@example.com')];
    const tls = (user: string) =>
      db.query(
        "insert into items (user_id, kind, label, host) values ($1, 'tls', 'x', 'example.com')",
        [user],
      );
    await tls(a);
    await expect(tls(a)).rejects.toThrow();
    await tls(b);
  });

  it("refuses an alert that points at another user's item", async () => {
    const [a, b] = [await addUser('a@example.com'), await addUser('b@example.com')];
    const item = await addManual(a);
    await expect(addAlert(b, item, 7, '2030-01-01')).rejects.toThrow();
    await addAlert(a, item, 7, '2030-01-01');
  });

  it('allows one alert per item, threshold and expiry date, and re-arms on a new date', async () => {
    const u = await addUser('a@example.com');
    const item = await addManual(u);
    await addAlert(u, item, 7, '2030-01-01');
    await expect(addAlert(u, item, 7, '2030-01-01')).rejects.toThrow();
    await addAlert(u, item, 7, '2031-01-01'); // renewed item, new expiry
    await addAlert(u, item, 1, '2030-01-01'); // other threshold
  });

  it('deletes everything a user owns with the user', async () => {
    const u = await addUser('a@example.com');
    const item = await addManual(u);
    await addAlert(u, item, 7, '2030-01-01');
    await db.query(
      "insert into sessions (user_id, token_hash, expires_at) values ($1, 'h', now() + interval '1 day')",
      [u],
    );
    await db.query('delete from users where id = $1', [u]);
    for (const table of ['items', 'alerts', 'sessions']) {
      expect(await db.query(`select 1 from ${table}`)).toHaveLength(0);
    }
  });
});
