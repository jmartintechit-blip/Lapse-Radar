import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app';
import { migrate } from './db/migrate';
import { createPgliteDb } from './db/pglite';

const db = createPgliteDb();
const server = createApp(() => Promise.resolve(db)).listen(0);
let host = '';
let base = '';

beforeAll(async () => {
  await migrate(db);
  host = `127.0.0.1:${(server.address() as AddressInfo).port}`;
  base = `http://${host}/api`;
});
afterAll(async () => {
  server.close();
  await db.close();
});

const login = (headers: Record<string, string> = {}) =>
  fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ email: 'nobody@example.com', password: 'x' }),
  });

describe('API headers', () => {
  it('are set on every response, errors included', async () => {
    for (const res of [await fetch(`${base}/health`), await fetch(`${base}/nope`)]) {
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('referrer-policy')).toBe('no-referrer');
      expect(res.headers.get('x-powered-by')).toBeNull();
    }
  });
});

describe('cross-site writes', () => {
  it('are refused when the Origin is another site, null or malformed', async () => {
    for (const origin of [
      'https://evil.example',
      'null',
      'not a url',
      `http://${host}.evil.example`,
    ]) {
      const res = await login({ origin });
      expect(res.status, origin).toBe(403);
      expect(await res.json()).toMatchObject({ error: { code: 'bad_origin' } });
    }
  });

  it('pass from this site and from clients that send no Origin', async () => {
    expect((await login({ origin: `http://${host}` })).status).toBe(401); // reaches the handler
    expect((await login()).status).toBe(401);
  });

  it('never block reads', async () => {
    expect(
      (await fetch(`${base}/health`, { headers: { origin: 'https://evil.example' } })).status,
    ).toBe(200);
  });
});

describe('error responses', () => {
  it('do not leak parser or server details', async () => {
    const res = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"email": ',
    });
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toBe('{"error":{"code":"bad_request","message":"Request failed"}}');
  });

  it('refuse bodies over the size limit', async () => {
    const res = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.co', password: 'x'.repeat(20_000) }),
    });
    expect(res.status).toBe(413);
  });
});

describe('abuse limits', () => {
  const signup = (n: number, ip: string) =>
    fetch(`${base}/auth/signup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-nf-client-connection-ip': ip },
      body: JSON.stringify({ email: `v6-${n}@example.com`, password: 'correct horse battery' }),
    });

  it('treats every address of one IPv6 /64 as one client', async () => {
    for (let n = 0; n < 5; n++)
      expect((await signup(n, `2001:db8:1:2::${n + 1}`)).status).toBe(201);
    expect((await signup(5, '2001:db8:1:2:aaaa:bbbb:cccc:dddd')).status).toBe(429);
    expect((await signup(6, '2001:db8:1:3::1')).status).toBe(201); // another /64 is another client
  });

  it('keeps the demo email from being claimed with a password', async () => {
    const res = await fetch(`${base}/auth/signup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-nf-client-connection-ip': '10.9.9.9' },
      body: JSON.stringify({
        email: 'demo@lapse-radar.invalid',
        password: 'correct horse battery',
      }),
    });
    expect(res.status).toBe(201);
    const enter = await fetch(`${base}/auth/demo`, {
      method: 'POST',
      headers: { 'x-nf-client-connection-ip': '10.9.9.10' },
    });
    expect(enter.status).toBe(204);
    const login = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-nf-client-connection-ip': '10.9.9.11' },
      body: JSON.stringify({
        email: 'demo@lapse-radar.invalid',
        password: 'correct horse battery',
      }),
    });
    expect(login.status).toBe(401);
  });

  it('caps item writes per user', async () => {
    const signed = await fetch(`${base}/auth/signup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-nf-client-connection-ip': '10.9.9.12' },
      body: JSON.stringify({ email: 'writer@example.com', password: 'correct horse battery' }),
    });
    const cookie = signed.headers.get('set-cookie')?.split(';')[0] ?? '';
    const write = () =>
      fetch(`${base}/items`, {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'manual', label: 'x', expiresAt: '2030-01-01T00:00:00Z' }),
      });
    const codes = new Set<string>();
    for (let i = 0; i < 61; i++) {
      const body = (await (await write()).json()) as { error?: { code: string } };
      codes.add(body.error?.code ?? 'created');
    }
    // 10 items fit, then the cap answers item_limit; the 61st write of any kind is rate limited.
    expect([...codes].sort()).toEqual(['created', 'item_limit', 'rate_limited']);
  });
});
