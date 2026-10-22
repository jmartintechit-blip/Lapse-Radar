import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app';
import { migrate } from './db/migrate';
import { createPgliteDb } from './db/pglite';

const db = createPgliteDb();
const server = createApp(() => Promise.resolve(db)).listen(0);
let base = '';
let n = 0;
const password = 'correct horse battery';

beforeAll(async () => {
  await migrate(db);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
afterAll(async () => {
  server.close();
  await db.close();
});

const post = (path: string, body?: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-nf-client-connection-ip': `10.4.0.${++n}`,
      ...headers,
    },
    body: JSON.stringify(body ?? {}),
  });
const signup = async (email: string) =>
  (await post('/auth/signup', { email, password })).headers.get('set-cookie')?.split(';')[0] ?? '';
const del = (cookie: string, body?: unknown) =>
  fetch(`${base}/me`, {
    method: 'DELETE',
    headers: { cookie, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const count = async (table: string, where = 'true', params: unknown[] = []) =>
  (
    await db.query<{ n: number }>(`select count(*)::int as n from ${table} where ${where}`, params)
  )[0]!.n;

describe('DELETE /me', () => {
  it('needs a session and the right password', async () => {
    expect((await del('', { password })).status).toBe(401);
    const cookie = await signup('keep@example.com');
    for (const body of [undefined, {}, { password: 'wrong password!' }])
      expect((await del(cookie, body)).status).toBe(401);
    expect((await fetch(`${base}/me`, { headers: { cookie } })).status).toBe(200); // still there
  });

  it('leaves no row of the user and touches nobody else', async () => {
    const gone = await signup('gone@example.com');
    const other = await signup('other@example.com');
    const soon = new Date(Date.now() + 3 * 86_400_000).toISOString();
    for (const cookie of [gone, other])
      await fetch(`${base}/items`, {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'manual', label: 'Token', expiresAt: soon }),
      });
    await post('/auth/login', { email: 'gone@example.com', password: 'bad password!' }); // creates a counter keyed by the email
    const [row] = await db.query<{ id: string }>(
      "select id from users where email = 'gone@example.com'",
    );
    const id = row!.id;
    expect(await count('alerts', 'user_id = $1', [id])).toBe(1);

    expect((await del(gone, { password })).status).toBe(204);

    for (const table of ['users', 'sessions', 'items', 'alerts'])
      expect(await count(table, table === 'users' ? 'id = $1' : 'user_id = $1', [id]), table).toBe(
        0,
      );
    expect(
      await count('rate_limits', "key like '%gone@example.com' or key like '%" + id + "'"),
    ).toBe(0);
    expect((await fetch(`${base}/me`, { headers: { cookie: gone } })).status).toBe(401);
    // The other account keeps its data.
    expect(
      await count('items', "user_id = (select id from users where email = 'other@example.com')"),
    ).toBe(1);
    expect((await post('/auth/login', { email: 'other@example.com', password })).status).toBe(200);
  });

  it('does not clear the counters of another email that only matches a "_" wildcard', async () => {
    const underscore = await signup('a_b@example.com');
    await post('/auth/login', { email: 'axb@example.com', password: 'bad password!' });
    expect((await del(underscore, { password })).status).toBe(204);
    expect(await count('rate_limits', "key like 'login:%:axb@example.com'")).toBe(1);
  });

  it('is refused for the demo account', async () => {
    const res = await post('/auth/demo');
    const cookie = res.headers.get('set-cookie')?.split(';')[0] ?? '';
    expect((await del(cookie, { password: '!' })).status).toBe(403);
    expect(await count('users', 'is_demo')).toBe(1);
  });
});
