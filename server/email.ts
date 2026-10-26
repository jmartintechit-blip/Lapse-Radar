import { daysRemaining } from '../shared/expiry';
import type { Db } from './db';

export const DAILY_EMAIL_CAP = 80; // the Resend free plan allows 100 a day; the rest is headroom
export const EMAILS_PER_RUN = 20;
export const USER_DAILY_CAP = 5; // per user, so one account cannot use up everybody's quota
const SEND_TIMEOUT_MS = 3_000;

export type Message = { to: string; subject: string; text: string };
export type Sender = (message: Message) => Promise<void>;

// Resend over plain fetch (no SDK). Without a verified domain Resend only delivers to the account
// owner's own address, so any other recipient fails with an error that is stored on the alert.
export function createResendSender(
  apiKey: string,
  from = 'Lapse Radar <onboarding@resend.dev>',
  doFetch: typeof fetch = fetch,
): Sender {
  return async ({ to, subject, text }) => {
    const response = await doFetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, text }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    // The response body can echo the request, so only the status goes into the error.
    if (!response.ok) throw new Error(`Resend answered ${response.status}`);
  };
}

type Pending = {
  id: string;
  email: string;
  label: string;
  kind: string;
  expiry_snapshot: Date;
};

export function buildMessage(alert: Pending, now: Date): Message {
  const days = daysRemaining(alert.expiry_snapshot, now);
  const when = days <= 0 ? 'has expired' : `expires in ${days} day${days === 1 ? '' : 's'}`;
  const label = alert.label.replace(/[\r\n]+/g, ' ');
  return {
    to: alert.email,
    subject: `[Lapse Radar] ${label} ${when}`,
    text: [
      `Your ${alert.kind} item "${label}" ${when}.`,
      `Expiry date (UTC): ${alert.expiry_snapshot.toISOString().slice(0, 10)}`,
      '',
      'Open Lapse Radar to review it. You can turn these emails off in your settings.',
    ].join('\n'),
  };
}

// Emails the alerts that are still unsent, oldest first, within the daily cap (global) and the time
// left in this run. A failed send is stored on the alert and not retried: the in-app alert remains.
// shortcut: no retry of transient failures; add one if Resend errors turn out to be common.
export async function sendPendingEmails(
  db: Db,
  send: Sender,
  { now = new Date(), deadline = Infinity, limit = EMAILS_PER_RUN } = {},
) {
  const pending = await db.query<Pending>(
    `select id, email, label, kind, expiry_snapshot from (
       select a.id, u.email, i.label, i.kind, a.expiry_snapshot, a.created_at,
              row_number() over (partition by a.user_id order by a.created_at, a.id) as rn,
              (select count(*) from alerts s
               where s.user_id = a.user_id and s.emailed_at > now() - interval '1 day') as sent_today
       from alerts a
       join users u on u.id = a.user_id
       join items i on i.id = a.item_id
       where a.emailed_at is null and a.email_error is null
         and u.email_alerts and not u.is_demo and u.email_verified_at is not null
     ) q
     where rn + sent_today <= $2
     order by created_at, id limit $1`,
    [limit, USER_DAILY_CAP],
  );
  const result = { sent: 0, failed: 0 };
  for (const alert of pending) {
    if (Date.now() + SEND_TIMEOUT_MS > deadline) break;
    // One statement both checks and takes a place in today's quota, so runs cannot overshoot the cap.
    const taken = await db.query(
      `insert into email_quota (day, sent) values ((now() at time zone 'utc')::date, 1)
       on conflict (day) do update set sent = email_quota.sent + 1
       where email_quota.sent < $1 returning sent`,
      [DAILY_EMAIL_CAP],
    );
    if (taken.length === 0) break;
    let error: string | null = null;
    try {
      await send(buildMessage(alert, now));
    } catch (e) {
      error = (e instanceof Error ? e.message : 'Send failed').slice(0, 200);
      // The send did not happen, so give the place back.
      await db.query(
        "update email_quota set sent = sent - 1 where day = (now() at time zone 'utc')::date",
      );
    }
    await db.query(
      `update alerts set emailed_at = case when $2::text is null then now() end, email_error = $2
       where id = $1`,
      [alert.id, error],
    );
    if (error) result.failed++;
    else result.sent++;
  }
  return result;
}
