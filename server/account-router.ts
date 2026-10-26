import express, { Router } from 'express';
import { z } from 'zod';
import {
  hashToken,
  issueToken,
  sendAccountEmail,
  sendVerification,
  type Mail,
} from './account-mail';
import {
  clientIp,
  fail,
  hashPassword,
  requireUser,
  sessionToken,
  sha256,
  verifyPassword,
  type AuthUser,
  type GetDb,
} from './auth';
import { isLang, langOf } from './lang';
import { allow } from './rate-limit';

const json = express.json({ limit: '10kb' });
const email = z.string().trim().toLowerCase().max(254).pipe(z.email());
const password = z.string().min(10).max(128);
const Token = z.object({ token: z.string().min(1).max(100) });

const tooMany = (res: express.Response) =>
  fail(res, 429, 'rate_limited', 'Too many attempts, try again later');
const badLink = (res: express.Response) =>
  fail(res, 400, 'invalid_token', 'This link is invalid or has expired');

// Verification, password reset and the changes of password or email. Links are one-time tokens
// (account-mail.ts). Without a mail sender (no Resend key) the flows that need one answer 503.
export function accountRouter(getDb: GetDb, mail?: Mail) {
  const router = Router();
  const guard = requireUser(getDb);

  // Always 204, so the answer does not say whether the address has an account.
  // shortcut: the extra time an existing account takes (token + send) can still tell them apart;
  // sign-up already answers "email taken", so this adds no new leak.
  router.post('/auth/forgot', json, async (req, res) => {
    const input = z.object({ email }).safeParse(req.body);
    if (!input.success) return void fail(res, 400, 'invalid_input', 'Enter a valid email');
    const db = await getDb();
    if (
      !(await allow(db, `forgot-ip:${clientIp(req)}`, 10, 3600)) ||
      // keyed by address too, so one person cannot be flooded with reset emails
      !(await allow(db, `forgot:${input.data.email}`, 3, 3600))
    )
      return void tooMany(res);
    const [user] = await db.query<{ id: string }>(
      'select id from users where email = $1 and not is_demo',
      [input.data.email],
    );
    if (user && mail)
      await sendAccountEmail(
        db,
        mail,
        input.data.email,
        'reset',
        await issueToken(db, user.id, 'reset'),
        langOf(req),
      );
    res.status(204).end();
  });

  // The new password is set and every session of the account is closed. Opening the link also
  // proves control of the mailbox, so the address counts as verified.
  router.post('/auth/reset', json, async (req, res) => {
    const input = Token.extend({ password }).safeParse(req.body);
    if (!input.success) return void fail(res, 400, 'invalid_input', 'Use 10 to 128 characters');
    const db = await getDb();
    if (!(await allow(db, `reset:${clientIp(req)}`, 20, 3600))) return void tooMany(res);
    const hash = await hashPassword(input.data.password);
    const done = await db.transaction(async (tx) => {
      const [row] = await tx.query<{ user_id: string }>(
        `delete from account_tokens
         where token_hash = $1 and purpose = 'reset' and expires_at > now() returning user_id`,
        [hashToken(input.data.token)],
      );
      if (!row) return false;
      await tx.query(
        `update users set password_hash = $2, email_verified_at = coalesce(email_verified_at, now())
         where id = $1 and not is_demo`,
        [row.user_id, hash],
      );
      await tx.query('delete from sessions where user_id = $1', [row.user_id]);
      return true;
    });
    if (!done) return void badLink(res);
    res.status(204).end();
  });

  // Handles both "verify" and "change_email" links: the token says which one it is.
  router.post('/auth/confirm', json, async (req, res) => {
    const input = Token.safeParse(req.body);
    if (!input.success) return void badLink(res);
    const db = await getDb();
    if (!(await allow(db, `confirm:${clientIp(req)}`, 30, 3600))) return void tooMany(res);
    try {
      const done = await db.transaction(async (tx) => {
        const [row] = await tx.query<{ user_id: string; new_email: string | null }>(
          `delete from account_tokens
           where token_hash = $1 and purpose in ('verify', 'change_email') and expires_at > now()
           returning user_id, new_email`,
          [hashToken(input.data.token)],
        );
        if (!row) return false;
        await tx.query(
          `update users set email = coalesce($2, email), email_verified_at = now()
           where id = $1 and not is_demo`,
          [row.user_id, row.new_email],
        );
        return true;
      });
      if (!done) return void badLink(res);
      res.status(204).end();
    } catch (e) {
      // 23505 = the new address was registered by someone else after the link was sent.
      if ((e as { code?: string }).code === '23505')
        return void fail(res, 409, 'email_taken', 'Email already registered');
      throw e;
    }
  });

  router.post('/me/verification', guard, async (req, res) => {
    const me = res.locals.user as AuthUser;
    if (me.isDemo) return void fail(res, 403, 'demo_readonly', 'The demo account is read-only');
    if (me.emailVerified) return void res.status(204).end();
    const db = await getDb();
    if (!(await allow(db, `verify:${me.id}`, 3, 3600))) return void tooMany(res);
    if (!mail) return void fail(res, 503, 'email_off', 'Email is not available right now');
    if (!(await sendVerification(db, mail, me.id, me.email, langOf(req))))
      return void fail(res, 502, 'email_failed', 'Could not send the email, try again later');
    res.status(204).end();
  });

  // The session that asks stays open; the others are closed, in case one of them was not yours.
  router.post('/me/password', guard, json, async (req, res) => {
    const me = res.locals.user as AuthUser;
    if (me.isDemo) return void fail(res, 403, 'demo_readonly', 'The demo account is read-only');
    const input = z
      .object({ currentPassword: z.string().max(128), newPassword: password })
      .safeParse(req.body);
    if (!input.success) return void fail(res, 400, 'invalid_input', 'Use 10 to 128 characters');
    const db = await getDb();
    if (!(await allow(db, `password:${me.id}`, 5, 900))) return void tooMany(res);
    const [row] = await db.query<{ password_hash: string }>(
      'select password_hash from users where id = $1',
      [me.id],
    );
    if (!row || !(await verifyPassword(input.data.currentPassword, row.password_hash)))
      return void fail(res, 401, 'invalid_credentials', 'Incorrect password');
    const hash = await hashPassword(input.data.newPassword);
    await db.transaction(async (tx) => {
      await tx.query('update users set password_hash = $2 where id = $1', [me.id, hash]);
      await tx.query('delete from sessions where user_id = $1 and token_hash <> $2', [
        me.id,
        sha256(sessionToken(req) ?? ''),
      ]);
    });
    res.status(204).end();
  });

  // The address changes only when the link sent to the NEW address is opened.
  router.post('/me/email', guard, json, async (req, res) => {
    const me = res.locals.user as AuthUser;
    if (me.isDemo) return void fail(res, 403, 'demo_readonly', 'The demo account is read-only');
    const input = z.object({ newEmail: email, password: z.string().max(128) }).safeParse(req.body);
    if (!input.success) return void fail(res, 400, 'invalid_input', 'Enter a valid email');
    const db = await getDb();
    if (
      !(await allow(db, `email:${me.id}`, 5, 3600)) ||
      !(await allow(db, `forgot:${input.data.newEmail}`, 3, 3600))
    )
      return void tooMany(res);
    const [row] = await db.query<{ password_hash: string }>(
      'select password_hash from users where id = $1',
      [me.id],
    );
    if (!row || !(await verifyPassword(input.data.password, row.password_hash)))
      return void fail(res, 401, 'invalid_credentials', 'Incorrect password');
    const [taken] = await db.query('select 1 from users where email = $1', [input.data.newEmail]);
    if (taken) return void fail(res, 409, 'email_taken', 'Email already registered');
    if (!mail) return void fail(res, 503, 'email_off', 'Email is not available right now');
    const token = await issueToken(db, me.id, 'change_email', input.data.newEmail);
    if (
      !(await sendAccountEmail(db, mail, input.data.newEmail, 'change_email', token, langOf(req)))
    )
      return void fail(res, 502, 'email_failed', 'Could not send the email, try again later');
    res.status(204).end();
  });

  // Language of the emails sent to this account (alerts included); follows the selector in the app.
  router.post('/me/language', guard, json, async (req, res) => {
    const me = res.locals.user as AuthUser;
    const lang: unknown = req.body?.lang;
    if (!isLang(lang)) return void fail(res, 400, 'invalid_input', 'Choose a language');
    if (!me.isDemo)
      await (await getDb()).query('update users set lang = $2 where id = $1', [me.id, lang]);
    res.status(204).end();
  });

  return router;
}
