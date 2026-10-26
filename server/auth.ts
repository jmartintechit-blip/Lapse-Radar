import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import express, { Router, type Request, type RequestHandler, type Response } from 'express';
import { z } from 'zod';
import type { Db } from './db';
import { sendVerification, type Mail } from './account-mail';
import { resetDemo } from './demo';
import { allow } from './rate-limit';

export type GetDb = () => Promise<Db>;
export type AuthUser = {
  id: string;
  email: string;
  thresholds: number[];
  emailAlerts: boolean;
  isDemo: boolean;
  emailVerified: boolean;
};

export const MAX_USERS = 100;
const COOKIE = 'lr_session';
const SESSION_DAYS = 7;
const SIGNUP_LOCK = 7_060_601; // advisory lock key serialising the user-count check
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

const derive = (password: string, salt: Buffer, params: typeof SCRYPT) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, 32, params, (err, key) => (err ? reject(err) : resolve(key))),
  );

// Stored as scrypt$N$r$p$salt$hash so the cost can be raised later without breaking old hashes.
export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await derive(password, salt, SCRYPT);
  const { N, r, p } = SCRYPT;
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [alg, N, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await derive(password, Buffer.from(salt, 'base64'), {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

// Unknown emails are checked against this hash too, so login time does not reveal which exist.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashPassword(randomBytes(16).toString('hex')));

const email = z.string().trim().toLowerCase().max(254).pipe(z.email());
const SignupInput = z.object({ email, password: z.string().min(10).max(128) });
const LoginInput = z.object({ email, password: z.string().min(1).max(128) });

export const fail = (res: Response, status: number, code: string, message: string) =>
  res.status(status).json({ error: { code, message } });

// Netlify sets this header at its edge; the socket address is the fallback for local runs.
// IPv6 clients are keyed by their /64 prefix: one subscriber controls billions of addresses inside it.
export const clientIp = (req: Request) => {
  const ip = req.get('x-nf-client-connection-ip') ?? req.socket.remoteAddress ?? 'unknown';
  if (!ip.includes(':') || ip.startsWith('::ffff:')) return ip;
  const [head = '', tail = ''] = ip.split('::');
  const groups = head ? head.split(':') : [];
  const rest = tail ? tail.split(':') : [];
  const full = ip.includes('::')
    ? [...groups, ...Array<string>(8 - groups.length - rest.length).fill('0'), ...rest]
    : groups;
  return full.slice(0, 4).join(':') + '::/64';
};

const cookieOptions = { httpOnly: true, secure: true, sameSite: 'lax', path: '/' } as const;

export const sessionToken = (req: Request) =>
  req.headers.cookie
    ?.split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);

async function startSession(db: Db, res: Response, userId: string) {
  // Opportunistic purge of expired rows; the hourly scheduled run does the same (server/scheduled.ts).
  await db.query('delete from sessions where expires_at < now()');
  await db.query("delete from rate_limits where window_start < now() - interval '1 day'");
  const token = randomBytes(32).toString('base64url');
  // Only the hash is stored, so a database leak cannot be replayed as a cookie.
  await db.query(
    `insert into sessions (user_id, token_hash, expires_at)
     values ($1, $2, now() + make_interval(days => $3::int))`,
    [userId, sha256(token), SESSION_DAYS],
  );
  res.cookie(COOKIE, token, { ...cookieOptions, maxAge: SESSION_DAYS * 86_400_000 });
}

type UserRow = {
  id: string;
  email: string;
  thresholds: number[];
  email_alerts: boolean;
  is_demo: boolean;
  email_verified_at: Date | null;
};
const toUser = (r: UserRow): AuthUser => ({
  id: r.id,
  email: r.email,
  thresholds: r.thresholds,
  emailAlerts: r.email_alerts,
  isDemo: r.is_demo,
  emailVerified: r.email_verified_at !== null,
});

// Puts the signed-in user on res.locals.user; every other route filters by that id.
export const requireUser =
  (getDb: GetDb): RequestHandler =>
  async (req, res, next) => {
    const token = sessionToken(req);
    const rows = token
      ? await (
          await getDb()
        ).query<UserRow>(
          `select u.id, u.email, u.thresholds, u.email_alerts, u.is_demo, u.email_verified_at
           from sessions s join users u on u.id = s.user_id
           where s.token_hash = $1 and s.expires_at > now()`,
          [sha256(token)],
        )
      : [];
    if (!rows[0]) return void fail(res, 401, 'unauthenticated', 'Sign in to continue');
    res.locals.user = toUser(rows[0]);
    next();
  };

export function authRouter(getDb: GetDb, mail?: Mail) {
  const router = Router();
  // JSON only: a form post from another site is never parsed, and SameSite=Lax withholds the cookie.
  router.use('/auth', express.json({ limit: '10kb' }));

  router.post('/auth/signup', async (req, res) => {
    const db = await getDb();
    if (!(await allow(db, `signup:${clientIp(req)}`, 5, 3600)))
      return void fail(res, 429, 'rate_limited', 'Too many attempts, try again later');
    const input = SignupInput.safeParse(req.body);
    if (!input.success)
      return void fail(res, 400, 'invalid_input', 'Use a valid email and 10 to 128 characters');

    const hash = await hashPassword(input.data.password);
    const result = await db.transaction(async (tx) => {
      await tx.query('select pg_advisory_xact_lock($1::bigint)', [SIGNUP_LOCK]);
      // The demo account is a row in users but is not a person: it does not use up a place.
      const [count] = await tx.query<{ n: number }>(
        'select count(*)::int as n from users where not is_demo',
      );
      if ((count?.n ?? 0) >= MAX_USERS) return 'full' as const;
      const rows = await tx.query<{ id: string }>(
        `insert into users (email, password_hash) values ($1, $2)
         on conflict (email) do nothing returning id`,
        [input.data.email, hash],
      );
      return rows[0]?.id ?? ('taken' as const);
    });
    if (result === 'full') return void fail(res, 429, 'user_limit', 'Registration is full for now');
    if (result === 'taken') return void fail(res, 409, 'email_taken', 'Email already registered');
    await startSession(db, res, result);
    // Best effort: the account works without it, and "resend" is one click away in the dashboard.
    if (mail) await sendVerification(db, mail, result, input.data.email).catch(() => undefined);
    res.status(201).json({ id: result, email: input.data.email });
  });

  router.post('/auth/login', async (req, res) => {
    const db = await getDb();
    const input = LoginInput.safeParse(req.body);
    if (!input.success) return void fail(res, 400, 'invalid_input', 'Enter email and password');
    const { email, password } = input.data;
    const ip = clientIp(req);
    if (
      !(await allow(db, `login:${ip}`, 50, 900)) ||
      !(await allow(db, `login:${ip}:${email}`, 10, 900))
    )
      return void fail(res, 429, 'rate_limited', 'Too many attempts, try again later');

    const [user] = await db.query<{ id: string; password_hash: string }>(
      'select id, password_hash from users where email = $1',
      [email],
    );
    const ok = await verifyPassword(password, user?.password_hash ?? (await getDummyHash()));
    if (!user || !ok)
      return void fail(res, 401, 'invalid_credentials', 'Incorrect email or password');
    await startSession(db, res, user.id);
    res.json({ id: user.id, email });
  });

  // One click into the read-only demo account; its data is rebuilt each time (see demo.ts).
  router.post('/auth/demo', async (req, res) => {
    const db = await getDb();
    if (!(await allow(db, `demo:${clientIp(req)}`, 20, 3600)))
      return void fail(res, 429, 'rate_limited', 'Too many attempts, try again later');
    await startSession(db, res, await resetDemo(db));
    res.status(204).end();
  });

  router.post('/auth/logout', async (req, res) => {
    const token = sessionToken(req);
    if (token)
      await (await getDb()).query('delete from sessions where token_hash = $1', [sha256(token)]);
    res.clearCookie(COOKIE, cookieOptions).status(204).end();
  });

  router.get('/me', requireUser(getDb), (_req, res) => {
    res.json(res.locals.user);
  });

  // Deletes the account and, through the foreign keys, its sessions, items and alerts. The password
  // is asked again so a stolen session alone cannot erase the account.
  router.delete('/me', requireUser(getDb), express.json({ limit: '10kb' }), async (req, res) => {
    const me = res.locals.user as AuthUser;
    if (me.isDemo) return void fail(res, 403, 'demo_readonly', 'The demo account is read-only');
    const password = z.object({ password: z.string().max(128) }).safeParse(req.body);
    const db = await getDb();
    if (!(await allow(db, `delete:${me.id}`, 5, 900)))
      return void fail(res, 429, 'rate_limited', 'Too many attempts, try again later');
    const [row] = await db.query<{ password_hash: string }>(
      'select password_hash from users where id = $1',
      [me.id],
    );
    if (
      !password.success ||
      !row ||
      !(await verifyPassword(password.data.password, row.password_hash))
    )
      return void fail(res, 401, 'invalid_credentials', 'Incorrect password');
    await db.transaction(async (tx) => {
      await tx.query('delete from users where id = $1', [me.id]);
      // Login counters are keyed by IP and email, write and delete counters by user id: remove them all.
      const email = me.email.replace(/[\\%_]/g, '\\$&'); // escape LIKE wildcards ("_" is common in emails)
      await tx.query(
        "delete from rate_limits where key like $1 escape '\\' or key = any($2::text[])",
        [
          `login:%:${email}`,
          [
            `delete:${me.id}`,
            `items:${me.id}`,
            `password:${me.id}`,
            `email:${me.id}`,
            `verify:${me.id}`,
            `forgot:${me.email}`,
          ],
        ],
      );
    });
    res.clearCookie(COOKIE, cookieOptions).status(204).end();
  });

  return router;
}
