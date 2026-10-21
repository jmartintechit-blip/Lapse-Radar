import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { evaluateAlerts } from './alerts';
import { createPgliteDb } from './db/pglite';
import { migrate } from './db/migrate';

const db = createPgliteDb();
const T0 = new Date('2030-06-01T12:00:00Z');
const inDays = (n: number, from = T0) => new Date(from.getTime() + n * 24 * 3600 * 1000);

let alice = '';
let bob = '';
beforeAll(async () => {
  await migrate(db);
  const insert = async (email: string) =>
    (
      await db.query<{ id: string }>(
        'insert into users (email, password_hash) values ($1, $2) returning id',
        [email, 'x'],
      )
    )[0]!.id;
  alice = await insert('alice@example.com');
  bob = await insert('bob@example.com');
});
afterAll(() => db.close());
beforeEach(async () => {
  await db.query('delete from items');
  await db.query("update users set thresholds = '{30,14,7,1}'");
});

const addItem = async (userId: string, expiresAt: Date | null, host = 'a.example.com') =>
  (
    await db.query<{ id: string }>(
      `insert into items (user_id, kind, label, host, expires_at)
       values ($1, 'tls', $2, $2, $3) returning id`,
      [userId, host, expiresAt],
    )
  )[0]!.id;
const thresholds = async (itemId: string) =>
  (
    await db.query<{ threshold_days: number }>(
      'select threshold_days from alerts where item_id = $1 order by threshold_days desc',
      [itemId],
    )
  ).map((r) => r.threshold_days);

describe('evaluateAlerts', () => {
  it('sends nothing while the expiry is further away than the largest threshold', async () => {
    const id = await addItem(alice, inDays(30.5)); // 31 days left
    expect(await evaluateAlerts(db, { now: T0 })).toBe(0);
    expect(await thresholds(id)).toEqual([]);
  });

  it('raises one alert per threshold as the expiry gets closer, and never repeats one', async () => {
    const id = await addItem(alice, inDays(30));
    expect(await evaluateAlerts(db, { now: T0 })).toBe(1);
    expect(await evaluateAlerts(db, { now: T0 })).toBe(0); // same run again
    expect(await evaluateAlerts(db, { now: inDays(1, T0) })).toBe(0); // 29 days left, still the 30 alert
    expect(await evaluateAlerts(db, { now: inDays(16, T0) })).toBe(1); // 14 days left
    expect(await evaluateAlerts(db, { now: inDays(23, T0) })).toBe(1); // 7
    expect(await evaluateAlerts(db, { now: inDays(29, T0) })).toBe(1); // 1
    expect(await evaluateAlerts(db, { now: inDays(30, T0) })).toBe(1); // 0 days: expired
    expect(await evaluateAlerts(db, { now: inDays(40, T0) })).toBe(0); // long expired, nothing new
    expect(await thresholds(id)).toEqual([30, 14, 7, 1, 0]);
  });

  it('emits only the most urgent threshold for an item added close to its expiry', async () => {
    const id = await addItem(alice, inDays(5));
    expect(await evaluateAlerts(db, { now: T0 })).toBe(1);
    expect(await thresholds(id)).toEqual([7]);
  });

  it('counts a partial day as a whole one, like the dashboard', async () => {
    const id = await addItem(alice, inDays(7.2)); // 8 days left: not yet 7
    expect(await evaluateAlerts(db, { now: T0 })).toBe(1);
    expect(await thresholds(id)).toEqual([14]);
    await evaluateAlerts(db, { now: inDays(0.3, T0) }); // 6.9 days left -> 7
    expect(await thresholds(id)).toEqual([14, 7]);
  });

  it('alerts once for an item that is already expired', async () => {
    const id = await addItem(alice, inDays(-3));
    expect(await evaluateAlerts(db, { now: T0 })).toBe(1);
    expect(await evaluateAlerts(db, { now: inDays(1, T0) })).toBe(0);
    expect(await thresholds(id)).toEqual([0]);
  });

  it('re-arms after a renewal because the expiry date is part of the key', async () => {
    const id = await addItem(alice, inDays(3));
    await evaluateAlerts(db, { now: T0 });
    expect(await thresholds(id)).toEqual([7]);
    // Renewed for a year: nothing to say.
    await db.query('update items set expires_at = $2 where id = $1', [id, inDays(365)]);
    expect(await evaluateAlerts(db, { now: T0 })).toBe(0);
    // A year later the new expiry approaches: the 30 alert fires again, with the old ones kept.
    expect(await evaluateAlerts(db, { now: inDays(340, T0) })).toBe(1);
    // Changing the date without crossing a new threshold still re-arms the same threshold.
    await db.query('update items set expires_at = $2 where id = $1', [id, inDays(6.5, T0)]);
    expect(await evaluateAlerts(db, { now: T0 })).toBe(1);
    const rows = await db.query<{ threshold_days: number }>(
      'select threshold_days from alerts where item_id = $1 order by created_at, threshold_days',
      [id],
    );
    expect(rows.map((r) => r.threshold_days).sort((a, b) => a - b)).toEqual([7, 7, 30]);
  });

  it("uses each user's own thresholds plus the expiry alert", async () => {
    await db.query("update users set thresholds = '{10}' where id = $1", [alice]);
    const a = await addItem(alice, inDays(20), 'a.example.com');
    const b = await addItem(bob, inDays(20), 'b.example.com');
    expect(await evaluateAlerts(db, { now: T0 })).toBe(1); // bob's 30; alice's first threshold is 10
    expect(await thresholds(a)).toEqual([]);
    expect(await thresholds(b)).toEqual([30]);
    await evaluateAlerts(db, { now: inDays(12, T0) }); // 8 days left
    expect(await thresholds(a)).toEqual([10]);
  });

  it('ignores items without an expiry yet and works for one user only when asked', async () => {
    await addItem(alice, null, 'pending.example.com');
    const a = await addItem(alice, inDays(2), 'a.example.com');
    const b = await addItem(bob, inDays(2), 'b.example.com');
    expect(await evaluateAlerts(db, { now: T0, userId: alice })).toBe(1);
    expect(await thresholds(a)).toEqual([7]);
    expect(await thresholds(b)).toEqual([]);
    expect(await evaluateAlerts(db, { now: T0 })).toBe(1); // bob's
  });

  it('creates every alert exactly once when runs overlap', async () => {
    for (let i = 0; i < 5; i++) await addItem(alice, inDays(2), `h${i}.example.com`);
    const counts = await Promise.all([1, 2, 3].map(() => evaluateAlerts(db, { now: T0 })));
    expect(counts.reduce((a, b) => a + b, 0)).toBe(5);
    const [total] = await db.query<{ n: number }>('select count(*)::int as n from alerts');
    expect(total!.n).toBe(5);
  });

  it('gives every alert the owner of its item', async () => {
    await addItem(alice, inDays(2), 'a.example.com');
    await addItem(bob, inDays(2), 'b.example.com');
    await evaluateAlerts(db, { now: T0 });
    const mismatched = await db.query(
      'select a.id from alerts a join items i on i.id = a.item_id where a.user_id <> i.user_id',
    );
    expect(mismatched).toEqual([]);
  });
});
