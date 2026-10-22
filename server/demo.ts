import { evaluateAlerts } from './alerts';
import type { Db } from './db';

export const DEMO_EMAIL = 'demo@lapse-radar.invalid';
const DEMO_LOCK = 7_315_002;
const DAY_MS = 86_400_000;

// Fictional items, dated relative to now so the demo always shows every state. None is ever checked
// over the network (next_check_at stays null), so the demo makes no outgoing connections.
const ITEMS = [
  { kind: 'tls', label: 'Shop (demo-shop.example.net)', host: 'demo-shop.example.net', days: 4 },
  { kind: 'tls', label: 'Docs (docs.example.net)', host: 'docs.example.net', days: 120 },
  { kind: 'domain', label: 'Brand domain (acme-demo.org)', host: 'acme-demo.org', days: 25 },
  { kind: 'manual', label: 'Payments API key', host: null, days: 2 },
  { kind: 'manual', label: 'Office licence', host: null, days: -3 },
] as const;

// Recreates the demo account's data from scratch and returns its id. Safe to call on every demo
// sign-in: the lock serialises concurrent calls and the reset removes whatever a visitor left.
// Invariant 6: the account has no usable password and emails off; the API refuses its writes.
export function resetDemo(db: Db) {
  return db.transaction(async (tx) => {
    await tx.query('select pg_advisory_xact_lock($1::bigint)', [DEMO_LOCK]);
    const [user] = await tx.query<{ id: string }>(
      // '!' is not a scrypt hash, so verifyPassword always rejects it.
      `insert into users (email, password_hash, is_demo, email_alerts) values ($1, '!', true, false)
       on conflict (email) do update set is_demo = true, email_alerts = false, password_hash = '!'
       returning id`,
      [DEMO_EMAIL],
    );
    const id = user!.id;
    await tx.query('delete from items where user_id = $1', [id]);
    for (const item of ITEMS)
      await tx.query(
        `insert into items (user_id, kind, label, host, expires_at, status, last_checked_at)
         values ($1, $2, $3, $4, $5, 'ok', now())`,
        [id, item.kind, item.label, item.host, new Date(Date.now() + item.days * DAY_MS)],
      );
    await evaluateAlerts(tx, { userId: id });
    return id;
  });
}
