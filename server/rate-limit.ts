import type { Db } from './db';

// Fixed-window counter kept in Postgres so the limit holds across stateless function instances.
// shortcut: a burst can straddle two windows (up to 2x the limit), fine for login throttling.
export async function allow(db: Db, key: string, limit: number, windowSeconds: number) {
  const [row] = await db.query<{ count: number }>(
    `insert into rate_limits (key, window_start, count)
     values ($1, to_timestamp(floor(extract(epoch from now()) / $2::int) * $2::int), 1)
     on conflict (key, window_start) do update set count = rate_limits.count + 1
     returning count`,
    [key, windowSeconds],
  );
  return (row?.count ?? Infinity) <= limit; // no row back: fail closed
}
