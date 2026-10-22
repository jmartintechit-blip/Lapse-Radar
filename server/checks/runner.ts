import type { Db } from '../db';
import { checkRdap, NoRdapError } from './rdap';
import { checkTls } from './tls';

export const BATCH_SIZE = 50;
export const CONCURRENCY = 8;
export const BUDGET_MS = 25_000;
// checkTls and checkRdap each enforce a 5 s deadline, so no new check may start later than this
// before the budget ends or the run could overshoot the 30 s limit of a scheduled function.
const MAX_CHECK_MS = 5_000;

const SUCCESS_RETRY_HOURS = 24;
const ERROR_RETRY_HOURS = 6;
const NO_RDAP_RETRY_HOURS = 24 * 7;

export type DueItem = { id: string; kind: 'tls' | 'domain'; host: string };
export type Checker = (item: DueItem) => Promise<{ expiresAt: Date; problem?: string }>;

export const defaultChecker: Checker = async ({ kind, host }) => {
  if (kind === 'domain') return checkRdap(host);
  const result = await checkTls(host);
  return {
    expiresAt: result.expiresAt,
    problem: result.trusted
      ? undefined
      : `Certificate not trusted: ${result.trustError}`.slice(0, 200),
  };
};

// Never throws because of the check itself: any failure is stored on the item. Only database errors escape.
export async function checkItem(
  db: Db,
  item: DueItem,
  check: Checker = defaultChecker,
): Promise<'ok' | 'error'> {
  let expiresAt: Date | null = null;
  let error: string | null;
  let retryHours: number | undefined;
  try {
    const result = await check(item);
    expiresAt = result.expiresAt;
    error = result.problem ?? null;
  } catch (e) {
    error = (e instanceof Error ? e.message : 'Check failed').slice(0, 200);
    // A TLD without RDAP will not start working tomorrow, so look again only now and then.
    retryHours = e instanceof NoRdapError ? NO_RDAP_RETRY_HOURS : ERROR_RETRY_HOURS;
  }
  retryHours ??= error ? ERROR_RETRY_HOURS : SUCCESS_RETRY_HOURS;
  // Keeps the last known expiry when a check fails; an untrusted certificate still updates it.
  await db.query(
    `update items
     set status = $2, expires_at = coalesce($3::timestamptz, expires_at), last_error = $4,
         last_checked_at = now(), next_check_at = now() + make_interval(hours => $5)
     where id = $1`,
    [item.id, error ? 'error' : 'ok', expiresAt, error, retryHours],
  );
  return error ? 'error' : 'ok';
}

export async function runDueChecks(
  db: Db,
  {
    check = defaultChecker,
    clock = Date.now,
    limit = BATCH_SIZE,
    concurrency = CONCURRENCY,
    budgetMs = BUDGET_MS,
  }: {
    check?: Checker;
    clock?: () => number;
    limit?: number;
    concurrency?: number;
    budgetMs?: number;
  } = {},
) {
  const start = clock();
  const queue = await db.query<DueItem>(
    `select id, kind, host from items
     where kind <> 'manual' and next_check_at <= now()
     order by next_check_at, id limit $1`,
    [limit],
  );
  const summary = { checked: 0, ok: 0, failed: 0, skipped: 0 };
  const worker = async () => {
    while (clock() - start < budgetMs - MAX_CHECK_MS) {
      const item = queue.shift();
      if (!item) return;
      const outcome = await checkItem(db, item, check);
      summary.checked++;
      if (outcome === 'ok') summary.ok++;
      else summary.failed++;
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  summary.skipped = queue.length; // still due, picked up by the next run
  return summary;
}
