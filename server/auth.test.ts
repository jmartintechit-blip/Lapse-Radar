import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app';
import { MAX_USERS, hashPassword, verifyPassword } from './auth';
import { migrate } from './db/migrate';
import { createPgliteDb } from './db/pglite';

const db = createPgliteDb();
const server = createApp(() => Promise.resolve(db)).listen(0);
let base = '';
let n = 0;

beforeAll(async () => {
  await migrate(db);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
afterAll(async () => {
  server.close();
  await db.close();
});

// Each call gets its own client IP so the per-IP rate limits of other tests never interfere.
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-nf-client-connection-ip': `10.0.0.${++n}`,
      ...headers,
    },
    body: JSON.stringify(body),
  });
const cookieOf = (res: Response) => res.headers.get('set-cookie')?.split(';')[0] ?? '';
const me = (cookie?: string) => fetch(`${base}/me`, { headers: cookie ? { cookie } : {} });
const signup = (email: string, password = 'correct horse battery') =>
  post('/auth/signup', { email, password });

describe('password hashing', () => {
  it('verifies the right password and rejects others', async () => {
    const hash = await hashPassword('s3cret-passphrase');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(hash).not.toContain('s3cret');
    expect(await verifyPassword('s3cret-passphrase', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
    expect(await verifyPassword('x', 'garbage')).toBe(false);
  });
});

describe('sessions', () => {
  it('stores only the token hash and sets a hardened cookie', async () => {
    const res = await signup('Ana@Example.com');
    expect(res.status).toBe(201);
    expect((await res.json()).email).toBe('ana@example.com');
    const setCookie = res.headers.get('set-cookie') ?? '';
    for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/']) {
      expect(setCookie).toContain(flag);
    }
    const token = cookieOf(res).split('=')[1] ?? '';
    const rows = await db.query<{ token_hash: string }>(
      'select token_hash from sessions where token_hash = $1',
      [createHash('sha256').update(token).digest('hex')],
    );
    expect(rows).toHaveLength(1);
    expect(await db.query('select 1 from sessions where token_hash = $1', [token])).toHaveLength(0);
    const [user] = await db.query<{ password_hash: string }>(
      "select password_hash from users where email = 'ana@example.com'",
    );
    expect(user?.password_hash).toMatch(/^scrypt\$/);
  });

  it('answers /me only with a valid session', async () => {
    const cookie = cookieOf(await signup('me@example.com'));
    const ok = await me(cookie);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ email: 'me@example.com', isDemo: false });
    expect((await me()).status).toBe(401);
    expect((await me(`${cookie}x`)).status).toBe(401);
  });

  it('rejects expired sessions and purges them on the next sign-in', async () => {
    const cookie = cookieOf(await signup('old@example.com'));
    await db.query("update sessions set expires_at = now() - interval '1 minute'");
    expect((await me(cookie)).status).toBe(401);
    await post('/auth/login', { email: 'me@example.com', password: 'correct horse battery' });
    const [left] = await db.query<{ n: number }>(
      'select count(*)::int as n from sessions where expires_at < now()',
    );
    expect(left?.n).toBe(0);
  });

  it('logout deletes the session', async () => {
    const cookie = cookieOf(await signup('bye@example.com'));
    const res = await post('/auth/logout', {}, { cookie });
    expect(res.status).toBe(204);
    expect((await me(cookie)).status).toBe(401);
  });
});

describe('login', () => {
  it('gives the same answer for an unknown email and a wrong password', async () => {
    await signup('known@example.com');
    const wrong = await post('/auth/login', {
      email: 'known@example.com',
      password: 'nope-nope-nope',
    });
    const unknown = await post('/auth/login', {
      email: 'ghost@example.com',
      password: 'nope-nope-nope',
    });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await wrong.json()).toEqual(await unknown.json());
  });

  it('is case-insensitive on the email', async () => {
    await signup('Mixed@Example.com');
    const res = await post('/auth/login', {
      email: 'MIXED@example.COM',
      password: 'correct horse battery',
    });
    expect(res.status).toBe(200);
  });

  it('throttles repeated attempts for the same IP and email', async () => {
    const headers = { 'x-nf-client-connection-ip': '192.0.2.1' };
    const attempt = () =>
      post('/auth/login', { email: 'known@example.com', password: 'bad-bad-bad' }, headers);
    for (let i = 0; i < 10; i++) expect((await attempt()).status).toBe(401);
    expect((await attempt()).status).toBe(429);
  });
});

describe('signup validation and quotas', () => {
  it('rejects a duplicate email, a short password and malformed bodies', async () => {
    await signup('dup@example.com');
    expect((await signup('dup@example.com')).status).toBe(409);
    expect((await signup('short@example.com', 'short')).status).toBe(400);
    expect((await signup('not-an-email')).status).toBe(400);
    const badJson = await fetch(`${base}/auth/signup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"email":',
    });
    expect(badJson.status).toBe(400);
    const form = await fetch(`${base}/auth/signup`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'email=form@example.com&password=correct+horse+battery',
    });
    expect(form.status).toBe(400);
    expect(await db.query("select 1 from users where email = 'form@example.com'")).toHaveLength(0);
  });

  it('throttles signups per IP', async () => {
    const headers = { 'x-nf-client-connection-ip': '192.0.2.2' };
    for (let i = 0; i < 5; i++) {
      expect(
        (
          await post(
            '/auth/signup',
            { email: `rl${i}@example.com`, password: 'correct horse battery' },
            headers,
          )
        ).status,
      ).toBe(201);
    }
    const res = await post(
      '/auth/signup',
      { email: 'rl5@example.com', password: 'correct horse battery' },
      headers,
    );
    expect(res.status).toBe(429);
  });

  it('never lets the user count pass the cap, even with simultaneous signups', async () => {
    const [{ n: current } = { n: 0 }] = await db.query<{ n: number }>(
      'select count(*)::int as n from users',
    );
    await db.query(
      `insert into users (email, password_hash)
       select 'fill' || g || '@example.com', 'x' from generate_series(1, $1::int) g`,
      [MAX_USERS - current - 1],
    );
    const results = await Promise.all([1, 2, 3].map((i) => signup(`last${i}@example.com`)));
    expect(results.map((r) => r.status).sort()).toEqual([201, 429, 429]);
    const [after] = await db.query<{ n: number }>('select count(*)::int as n from users');
    expect(after?.n).toBe(MAX_USERS);
  });
});
