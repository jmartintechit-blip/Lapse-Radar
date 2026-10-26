import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashToken, issueToken, type Mail } from './account-mail';
import { createApp } from './app';
import { migrate } from './db/migrate';
import { createPgliteDb } from './db/pglite';
import type { Message } from './email';

const db = createPgliteDb();
const outbox: Message[] = [];
let failSend = false;
const mail: Mail = {
  baseUrl: 'https://radar.test/',
  send: (m) =>
    failSend ? Promise.reject(new Error('down')) : Promise.resolve(void outbox.push(m)),
};
const server = createApp(() => Promise.resolve(db), undefined, mail).listen(0);
const noMail = createApp(() => Promise.resolve(db)).listen(0);
let base = '';
let baseNoMail = '';
let n = 0;
const password = 'correct horse battery';

beforeAll(async () => {
  await migrate(db);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  baseNoMail = `http://127.0.0.1:${(noMail.address() as AddressInfo).port}/api`;
});
afterAll(async () => {
  server.close();
  noMail.close();
  await db.close();
});

const post = (path: string, body?: unknown, cookie = '', url = base) =>
  fetch(`${url}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-nf-client-connection-ip': `10.5.0.${++n}`,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });
const signup = async (email: string) =>
  (await post('/auth/signup', { email, password })).headers.get('set-cookie')?.split(';')[0] ?? '';
const me = async (cookie: string) =>
  fetch(`${base}/me`, { headers: { cookie } }).then(async (r) => ({
    status: r.status,
    body: (await r.json()) as { emailVerified?: boolean; email?: string },
  }));
const tokenIn = (m: Message) => /#token=([\w-]+)/.exec(m.text)![1]!;
const last = (to: string) => [...outbox].reverse().find((m) => m.to === to)!;
const userId = async (email: string) =>
  (await db.query<{ id: string }>('select id from users where email = $1', [email]))[0]!.id;

describe('email verification', () => {
  it('sends a link at sign-up; opening it verifies the address once', async () => {
    const cookie = await signup('verify@example.com');
    expect((await me(cookie)).body.emailVerified).toBe(false);
    const message = last('verify@example.com');
    expect(message.text).toContain('https://radar.test/confirm#token='); // no double slash
    const token = tokenIn(message);

    expect((await post('/auth/confirm', { token })).status).toBe(204);
    expect((await me(cookie)).body.emailVerified).toBe(true);
    expect((await post('/auth/confirm', { token })).status).toBe(400); // one-time
  });

  it('stores only the hash of the token', async () => {
    await signup('hashed@example.com');
    const token = tokenIn(last('hashed@example.com'));
    const rows = await db.query<{ token_hash: string }>('select token_hash from account_tokens');
    expect(rows.map((r) => r.token_hash)).toContain(hashToken(token));
    expect(rows.map((r) => r.token_hash)).not.toContain(token);
  });

  it('can be re-sent by the user, replacing the earlier link, with a limit', async () => {
    const cookie = await signup('resend@example.com');
    const first = tokenIn(last('resend@example.com'));
    expect((await post('/me/verification', {}, cookie)).status).toBe(204);
    const second = tokenIn(last('resend@example.com'));
    expect(second).not.toBe(first);
    expect((await post('/auth/confirm', { token: first })).status).toBe(400);
    expect((await post('/auth/confirm', { token: second })).status).toBe(204);
    expect((await post('/me/verification', {}, cookie)).status).toBe(204); // already verified: no-op

    const other = await signup('resend2@example.com');
    const codes: number[] = [];
    for (let i = 0; i < 4; i++) codes.push((await post('/me/verification', {}, other)).status);
    expect(codes).toEqual([204, 204, 204, 429]);
  });

  it('rejects expired, unknown and malformed tokens', async () => {
    await signup('expired@example.com');
    const token = tokenIn(last('expired@example.com'));
    await db.query("update account_tokens set expires_at = now() - interval '1 second'");
    for (const body of [{ token }, { token: 'nope' }, {}, { token: 5 }])
      expect((await post('/auth/confirm', body)).status).toBe(400);
  });

  it('a reset token cannot be used as a confirm token', async () => {
    await signup('cross@example.com');
    const token = await issueToken(db, await userId('cross@example.com'), 'reset');
    expect((await post('/auth/confirm', { token })).status).toBe(400);
    expect((await post('/auth/reset', { token, password: 'another long password' })).status).toBe(
      204,
    );
  });

  it('signs up even when the email cannot be sent', async () => {
    failSend = true;
    const res = await post('/auth/signup', { email: 'offline@example.com', password });
    failSend = false;
    expect(res.status).toBe(201);
  });

  it('answers 503 on flows that need email when no sender is configured', async () => {
    const cookie =
      (
        await post('/auth/signup', { email: 'nomail@example.com', password }, '', baseNoMail)
      ).headers
        .get('set-cookie')
        ?.split(';')[0] ?? '';
    expect((await post('/me/verification', {}, cookie, baseNoMail)).status).toBe(503);
    expect(
      (await post('/me/email', { newEmail: 'nomail2@example.com', password }, cookie, baseNoMail))
        .status,
    ).toBe(503);
    expect(
      (await post('/auth/forgot', { email: 'nomail@example.com' }, '', baseNoMail)).status,
    ).toBe(204);
  });
});

describe('password reset', () => {
  it('sets a new password, closes every session and verifies the address', async () => {
    const cookie = await signup('forgot@example.com');
    expect((await post('/auth/forgot', { email: 'forgot@example.com' })).status).toBe(204);
    const token = tokenIn(last('forgot@example.com'));
    expect(last('forgot@example.com').subject).toContain('Reset');

    const newPassword = 'a brand new password';
    expect((await post('/auth/reset', { token, password: newPassword })).status).toBe(204);
    expect((await me(cookie)).status).toBe(401); // old session closed
    expect((await post('/auth/login', { email: 'forgot@example.com', password })).status).toBe(401);
    const login = await post('/auth/login', { email: 'forgot@example.com', password: newPassword });
    expect(login.status).toBe(200);
    const fresh = login.headers.get('set-cookie')!.split(';')[0]!;
    expect((await me(fresh)).body.emailVerified).toBe(true);
    expect((await post('/auth/reset', { token, password: newPassword })).status).toBe(400);
  });

  it('answers the same for unknown addresses and sends nothing', async () => {
    const before = outbox.length;
    expect((await post('/auth/forgot', { email: 'ghost@example.com' })).status).toBe(204);
    expect(outbox).toHaveLength(before);
    expect((await post('/auth/forgot', { email: 'not-an-email' })).status).toBe(400);
  });

  it('never resets the demo account', async () => {
    await post('/auth/demo');
    const before = outbox.length;
    const [demo] = await db.query<{ email: string }>('select email from users where is_demo');
    expect((await post('/auth/forgot', { email: demo!.email })).status).toBe(204);
    expect(outbox).toHaveLength(before);
  });

  it('limits requests per address', async () => {
    await signup('flood@example.com');
    const before = outbox.length;
    const codes: number[] = [];
    for (let i = 0; i < 4; i++)
      codes.push((await post('/auth/forgot', { email: 'flood@example.com' })).status);
    expect(codes).toEqual([204, 204, 204, 429]);
    expect(outbox.length - before).toBe(3);
  });

  it('rejects short passwords without burning the token', async () => {
    await signup('short@example.com');
    const token = await issueToken(db, await userId('short@example.com'), 'reset');
    expect((await post('/auth/reset', { token, password: 'short' })).status).toBe(400);
    expect((await post('/auth/reset', { token, password: 'long enough password' })).status).toBe(
      204,
    );
  });
});

describe('change password', () => {
  it('needs the current password and keeps only the current session', async () => {
    const a = await signup('chpw@example.com');
    const b = (await post('/auth/login', { email: 'chpw@example.com', password })).headers
      .get('set-cookie')!
      .split(';')[0]!;
    const body = { currentPassword: 'wrong password!', newPassword: 'the next password' };
    expect((await post('/me/password', body, a)).status).toBe(401);
    expect((await post('/me/password', { ...body, currentPassword: password }, '')).status).toBe(
      401,
    );
    expect((await post('/me/password', { ...body, currentPassword: password }, a)).status).toBe(
      204,
    );
    expect((await me(a)).status).toBe(200);
    expect((await me(b)).status).toBe(401);
    expect(
      (await post('/auth/login', { email: 'chpw@example.com', password: 'the next password' }))
        .status,
    ).toBe(200);
  });

  it('is refused for the demo account and for weak new passwords', async () => {
    const demo = (await post('/auth/demo')).headers.get('set-cookie')!.split(';')[0]!;
    expect(
      (await post('/me/password', { currentPassword: 'x', newPassword: 'y'.repeat(12) }, demo))
        .status,
    ).toBe(403);
    const cookie = await signup('weak@example.com');
    expect(
      (await post('/me/password', { currentPassword: password, newPassword: 'short' }, cookie))
        .status,
    ).toBe(400);
  });
});

describe('change email', () => {
  it('changes the address only after the link sent to the new one is opened', async () => {
    const cookie = await signup('old@example.com');
    const body = { newEmail: 'New@Example.com', password };
    expect((await post('/me/email', { ...body, password: 'wrong password!' }, cookie)).status).toBe(
      401,
    );
    expect((await post('/me/email', body, cookie)).status).toBe(204);
    expect((await me(cookie)).body.email).toBe('old@example.com'); // not yet

    const token = tokenIn(last('new@example.com'));
    expect((await post('/auth/confirm', { token })).status).toBe(204);
    const now = await me(cookie);
    expect(now.body).toMatchObject({ email: 'new@example.com', emailVerified: true });
    expect((await post('/auth/login', { email: 'new@example.com', password })).status).toBe(200);
    expect((await post('/auth/login', { email: 'old@example.com', password })).status).toBe(401);
  });

  it('refuses an address that is already registered, now or when the link is opened', async () => {
    const cookie = await signup('mover@example.com');
    await signup('taken@example.com');
    expect(
      (await post('/me/email', { newEmail: 'taken@example.com', password }, cookie)).status,
    ).toBe(409);

    expect(
      (await post('/me/email', { newEmail: 'race@example.com', password }, cookie)).status,
    ).toBe(204);
    const token = tokenIn(last('race@example.com'));
    await signup('race@example.com'); // someone registers it first
    expect((await post('/auth/confirm', { token })).status).toBe(409);
    expect((await me(cookie)).body.email).toBe('mover@example.com');
  });

  it('cannot be used by the demo account', async () => {
    const demo = (await post('/auth/demo')).headers.get('set-cookie')!.split(';')[0]!;
    expect(
      (await post('/me/email', { newEmail: 'demo2@example.com', password: 'x' }, demo)).status,
    ).toBe(403);
  });
});

describe('deleting an account', () => {
  it('removes its pending tokens', async () => {
    const cookie = await signup('bye@example.com');
    const id = await userId('bye@example.com');
    const rows = () =>
      db.query('select 1 from account_tokens where user_id = $1', [id]).then((r) => r.length);
    expect(await rows()).toBe(1);
    const res = await fetch(`${base}/me`, {
      method: 'DELETE',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    expect(res.status).toBe(204);
    expect(await rows()).toBe(0);
  });
});
