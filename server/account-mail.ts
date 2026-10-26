import { createHash, randomBytes } from 'node:crypto';
import type { Db } from './db';
import type { Sender } from './email';

// Alerts stop at DAILY_EMAIL_CAP (80); account emails may use the headroom up to this, still under
// the 100 a day of the Resend free plan.
export const ACCOUNT_EMAIL_CAP = 90;

// What the account flows need to send a link: a sender and the public address of the site.
export type Mail = { send: Sender; baseUrl: string };

export type Purpose = 'verify' | 'reset' | 'change_email';
const TTL_SECONDS: Record<Purpose, number> = { verify: 86_400, reset: 3_600, change_email: 3_600 };

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

// A new token replaces the previous one of the same purpose, so only the latest link works.
export async function issueToken(db: Db, userId: string, purpose: Purpose, newEmail?: string) {
  const token = randomBytes(32).toString('base64url');
  await db.query('delete from account_tokens where expires_at < now()');
  await db.query('delete from account_tokens where user_id = $1 and purpose = $2', [
    userId,
    purpose,
  ]);
  await db.query(
    `insert into account_tokens (token_hash, user_id, purpose, new_email, expires_at)
     values ($1, $2, $3, $4, now() + make_interval(secs => $5::int))`,
    [hashToken(token), userId, purpose, newEmail ?? null, TTL_SECONDS[purpose]],
  );
  return token;
}

const TEXTS: Record<Purpose, { subject: string; intro: string; path: string; expiry: string }> = {
  verify: {
    subject: 'Confirm your email address',
    intro: 'Confirm this address to receive expiry alerts by email.',
    path: 'confirm',
    expiry: '24 hours',
  },
  reset: {
    subject: 'Reset your password',
    intro: 'Someone asked to reset the password of this Lapse Radar account.',
    path: 'reset-password',
    expiry: '1 hour',
  },
  change_email: {
    subject: 'Confirm your new email address',
    intro: 'Confirm this address to make it the email of your Lapse Radar account.',
    path: 'confirm',
    expiry: '1 hour',
  },
};

// The token travels in the URL fragment: browsers do not send it to servers, logs or referrers.
export const buildLink = (baseUrl: string, purpose: Purpose, token: string) =>
  `${baseUrl.replace(/\/$/, '')}/${TEXTS[purpose].path}#token=${token}`;

// Sends one account email, taking a place in today's quota first. Returns false if it was not sent.
export async function sendAccountEmail(
  db: Db,
  mail: Mail,
  to: string,
  purpose: Purpose,
  token: string,
) {
  const taken = await db.query(
    `insert into email_quota (day, sent) values ((now() at time zone 'utc')::date, 1)
     on conflict (day) do update set sent = email_quota.sent + 1
     where email_quota.sent < $1 returning sent`,
    [ACCOUNT_EMAIL_CAP],
  );
  if (taken.length === 0) return false;
  const t = TEXTS[purpose];
  try {
    await mail.send({
      to,
      subject: `[Lapse Radar] ${t.subject}`,
      text: [
        t.intro,
        '',
        buildLink(mail.baseUrl, purpose, token),
        '',
        `The link works once and expires in ${t.expiry}. If you did not ask for it, ignore this email.`,
      ].join('\n'),
    });
    return true;
  } catch {
    // The send did not happen, so give the place back.
    await db.query(
      "update email_quota set sent = sent - 1 where day = (now() at time zone 'utc')::date",
    );
    return false;
  }
}

export async function sendVerification(db: Db, mail: Mail, userId: string, to: string) {
  return sendAccountEmail(db, mail, to, 'verify', await issueToken(db, userId, 'verify'));
}
