import { evaluateAlerts } from './alerts';
import type { Db } from './db';
import { runDueChecks } from './checks/runner';
import { sendPendingEmails, type Sender } from './email';

// Arbitrary constant that identifies "the hourly run" among the database's advisory locks.
export const SCHEDULED_LOCK_KEY = 7_315_001;

export type ScheduledResult =
  | { skipped: true }
  | {
      skipped: false;
      checked: number;
      ok: number;
      failed: number;
      pending: number;
      alerts: number;
      emailed: number;
      emailFailed: number;
    };

// Leaves room for the commit inside the 30 s limit of a scheduled function.
const EMAIL_DEADLINE_MS = 28_000;

// One hourly run: due checks, then alerts. The transaction-level advisory lock keeps two runs from
// overlapping (invariant 5): a second run finds it taken and leaves at once. The whole run shares
// one transaction, so the lock is freed by commit, rollback or a dropped connection, never leaked.
// shortcut: the transaction holds row locks on checked items until it ends (<= 25 s), so a
// concurrent "check now" on the same item waits; move to a dedicated lock connection if that hurts.
export function runScheduled(
  db: Db,
  { send, ...options }: Parameters<typeof runDueChecks>[1] & { send?: Sender } = {},
): Promise<ScheduledResult> {
  const start = Date.now();
  return db.transaction(async (tx) => {
    const [lock] = await tx.query<{ locked: boolean }>(
      'select pg_try_advisory_xact_lock($1) as locked',
      [SCHEDULED_LOCK_KEY],
    );
    if (!lock?.locked) return { skipped: true };
    const { checked, ok, failed, skipped: pending } = await runDueChecks(tx, options);
    const alerts = await evaluateAlerts(tx);
    // Without a Resend key alerts stay unsent and go out once the key exists.
    const mail = send
      ? await sendPendingEmails(tx, send, { deadline: start + EMAIL_DEADLINE_MS })
      : { sent: 0, failed: 0 };
    return {
      skipped: false,
      checked,
      ok,
      failed,
      pending,
      alerts,
      emailed: mail.sent,
      emailFailed: mail.failed,
    };
  });
}
