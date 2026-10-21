import type { Db } from './db';

// Creates the alerts that are due and returns how many are new. Safe to run any number of times, also
// concurrently: the unique key (item, threshold, expiry date) makes a repeat a no-op (invariant 1).
//
// For each item the threshold is the smallest one (the user's list plus 0 = expired) that its days
// remaining have reached, so an item added when it is already 5 days from expiry gets one alert (7),
// not four. Days are counted as in shared/expiry.ts: whole days, rounded up.
// Renewing an item changes its expiry date, which is part of the key, so the alerts arm again.
// shortcut: no cleanup of old alerts; add a retention rule if the table ever grows.
export async function evaluateAlerts(
  db: Db,
  { now = new Date(), userId = null }: { now?: Date; userId?: string | null } = {},
): Promise<number> {
  const created = await db.query(
    `insert into alerts (user_id, item_id, threshold_days, expiry_snapshot)
     select i.user_id, i.id, t.threshold, i.expires_at
     from items i
     join users u on u.id = i.user_id
     cross join lateral (
       select min(x) as threshold
       from unnest(u.thresholds || 0) as x
       where ceil(extract(epoch from (i.expires_at - $1::timestamptz)) / 86400) <= x
     ) t
     where i.expires_at is not null and t.threshold is not null
       and ($2::uuid is null or i.user_id = $2::uuid)
     on conflict (item_id, threshold_days, expiry_snapshot) do nothing
     returning id`,
    [now, userId],
  );
  return created.length;
}
