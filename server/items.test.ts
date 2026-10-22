import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from './app';
import type { Checker } from './checks/runner';
import { MAX_ITEMS } from './items';
import { migrate } from './db/migrate';
import { createPgliteDb } from './db/pglite';

const db = createPgliteDb();
const checker = vi.fn<Checker>(async () => ({ expiresAt: new Date('2030-01-01T00:00:00Z') }));
const server = createApp(() => Promise.resolve(db), checker).listen(0);
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

type Json = Record<string, unknown>;
// Every signup gets its own client IP so the signup rate limit never interferes.
const signup = async (email: string) => {
  const res = await fetch(`${base}/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-nf-client-connection-ip': `10.1.0.${++n}` },
    body: JSON.stringify({ email, password: 'correct horse battery' }),
  });
  return res.headers.get('set-cookie')?.split(';')[0] ?? '';
};
const call = (cookie: string, method: string, path: string, body?: unknown) =>
  fetch(`${base}${path}`, {
    method,
    headers: { cookie, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const create = async (cookie: string, body: Json) => {
  const res = await call(cookie, 'POST', '/items', body);
  return { status: res.status, json: (await res.json()) as Json };
};

describe('items API', () => {
  it('needs a session', async () => {
    expect((await fetch(`${base}/items`)).status).toBe(401);
    expect((await call('', 'POST', '/items', { kind: 'tls', host: 'example.com' })).status).toBe(
      401,
    );
  });

  it('creates tls, domain and manual items and lists them', async () => {
    const cookie = await signup('owner@example.com');
    const tls = await create(cookie, { kind: 'tls', host: ' WWW.Example.COM ' });
    expect(tls.status).toBe(201);
    expect(tls.json).toMatchObject({
      kind: 'tls',
      host: 'www.example.com',
      label: 'www.example.com',
      status: 'pending',
      expiresAt: null,
    });
    const domain = await create(cookie, { kind: 'domain', host: 'example.org', label: 'Blog' });
    expect(domain.json).toMatchObject({ kind: 'domain', label: 'Blog' });
    const manual = await create(cookie, {
      kind: 'manual',
      label: 'API key',
      expiresAt: '2030-01-01T00:00:00Z',
    });
    expect(manual.json).toMatchObject({ kind: 'manual', host: null });
    expect(manual.json.expiresAt).toBe('2030-01-01T00:00:00.000Z');
    const list = (await (await call(cookie, 'GET', '/items')).json()) as Json[];
    expect(list.map((i) => i.kind)).toEqual(['tls', 'domain', 'manual']);
    const [due] = await db.query<{ n: number }>(
      "select count(*)::int as n from items where next_check_at is not null and kind <> 'manual'",
    );
    expect(due?.n).toBeGreaterThanOrEqual(2);
  });

  it.each([
    ['an IP literal', { kind: 'tls', host: '127.0.0.1' }],
    ['a host with a port', { kind: 'tls', host: 'example.com:8443' }],
    ['a URL', { kind: 'tls', host: 'https://example.com/path' }],
    ['a single label', { kind: 'domain', host: 'localhost' }],
    ['an internal suffix', { kind: 'tls', host: 'db.internal' }],
    ['a metadata-style name', { kind: 'tls', host: 'metadata.google.internal' }],
    ['a non-ASCII host', { kind: 'tls', host: 'bücher.example.com' }],
    ['a manual item without a date', { kind: 'manual', label: 'x' }],
    ['a manual item with a bad date', { kind: 'manual', label: 'x', expiresAt: 'tomorrow' }],
    ['an unknown kind', { kind: 'ftp', host: 'example.com' }],
    ['an empty label', { kind: 'manual', label: '  ', expiresAt: '2030-01-01T00:00:00Z' }],
    ['notes over 500 characters', { kind: 'tls', host: 'example.com', notes: 'x'.repeat(501) }],
  ])('rejects %s', async (_name, body) => {
    const cookie = await signup(`bad${++n}@example.com`);
    expect((await create(cookie, body)).status).toBe(400);
  });

  it('rejects a duplicate host of the same kind but allows it for another kind or user', async () => {
    const a = await signup('dupa@example.com');
    const b = await signup('dupb@example.com');
    expect((await create(a, { kind: 'tls', host: 'dup.example.com' })).status).toBe(201);
    expect((await create(a, { kind: 'tls', host: 'DUP.example.com' })).status).toBe(409);
    expect((await create(a, { kind: 'domain', host: 'dup.example.com' })).status).toBe(201);
    expect((await create(b, { kind: 'tls', host: 'dup.example.com' })).status).toBe(201);
  });

  it('updates label, notes and (manual only) expiry', async () => {
    const cookie = await signup('edit@example.com');
    const manual = (
      await create(cookie, { kind: 'manual', label: 'Old', expiresAt: '2030-01-01T00:00:00Z' })
    ).json;
    const res = await call(cookie, 'PATCH', `/items/${manual.id}`, {
      label: 'New',
      notes: 'rotate yearly',
      expiresAt: '2031-06-01T00:00:00Z',
    });
    expect(await res.json()).toMatchObject({
      label: 'New',
      notes: 'rotate yearly',
      expiresAt: '2031-06-01T00:00:00.000Z',
    });
    const cleared = await call(cookie, 'PATCH', `/items/${manual.id}`, { notes: null });
    expect(await cleared.json()).toMatchObject({ label: 'New', notes: null });

    const tls = (await create(cookie, { kind: 'tls', host: 'edit.example.com' })).json;
    expect(
      (await call(cookie, 'PATCH', `/items/${tls.id}`, { expiresAt: '2031-06-01T00:00:00Z' }))
        .status,
    ).toBe(400);
    expect((await call(cookie, 'PATCH', `/items/${tls.id}`, {})).status).toBe(400);
    expect((await call(cookie, 'PATCH', `/items/${tls.id}`, { label: 'Edge' })).status).toBe(200);
  });

  it('deletes an item', async () => {
    const cookie = await signup('del@example.com');
    const item = (await create(cookie, { kind: 'tls', host: 'del.example.com' })).json;
    expect((await call(cookie, 'DELETE', `/items/${item.id}`)).status).toBe(204);
    expect((await call(cookie, 'GET', `/items/${item.id}`)).status).toBe(404);
    expect((await call(cookie, 'DELETE', `/items/${item.id}`)).status).toBe(404);
  });
});

describe('isolation between two users', () => {
  it('answers 404 for every operation on someone else’s item and never lists it', async () => {
    const alice = await signup('alice@example.com');
    const bob = await signup('bob@example.com');
    const item = (await create(alice, { kind: 'tls', host: 'alice.example.com' })).json;
    const path = `/items/${item.id}`;

    expect((await call(bob, 'GET', path)).status).toBe(404);
    expect((await call(bob, 'PATCH', path, { label: 'hijacked' })).status).toBe(404);
    expect((await call(bob, 'DELETE', path)).status).toBe(404);
    expect(await (await call(bob, 'GET', '/items')).json()).toEqual([]);

    const mine = (await (await call(alice, 'GET', path)).json()) as Json;
    expect(mine.label).toBe('alice.example.com'); // untouched by Bob's attempts
    expect((await call(alice, 'GET', '/items/not-a-uuid')).status).toBe(404);
  });
});

describe('quotas and the demo account', () => {
  it('caps items per user, even with simultaneous creates', async () => {
    const cookie = await signup('cap@example.com');
    for (let i = 0; i < MAX_ITEMS - 1; i++)
      expect((await create(cookie, { kind: 'tls', host: `h${i}.example.com` })).status).toBe(201);
    const results = await Promise.all(
      [1, 2, 3].map((i) => create(cookie, { kind: 'tls', host: `race${i}.example.com` })),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 429, 429]);
    const list = (await (await call(cookie, 'GET', '/items')).json()) as Json[];
    expect(list).toHaveLength(MAX_ITEMS);
    // Another user is unaffected by this user's cap.
    const other = await signup('capother@example.com');
    expect((await create(other, { kind: 'tls', host: 'free.example.com' })).status).toBe(201);
  });

  it('lets the demo account read but not change anything', async () => {
    const cookie = await signup('demo@example.com');
    const item = (await create(cookie, { kind: 'tls', host: 'demo.example.com' })).json;
    await db.query("update users set is_demo = true where email = 'demo@example.com'");
    expect((await call(cookie, 'GET', '/items')).status).toBe(200);
    expect((await create(cookie, { kind: 'tls', host: 'more.example.com' })).status).toBe(403);
    expect((await call(cookie, 'PATCH', `/items/${item.id}`, { label: 'x' })).status).toBe(403);
    expect((await call(cookie, 'DELETE', `/items/${item.id}`)).status).toBe(403);
    expect((await call(cookie, 'POST', `/items/${item.id}/check`)).status).toBe(403);
  });
});

describe('check now (1 per item per minute)', () => {
  const errorCode = async (res: Response) =>
    ((await res.json()) as { error: { code: string } }).error.code;

  it('runs the check, stores the result and limits the frequency', async () => {
    const cookie = await signup('checknow@example.com');
    const item = (await create(cookie, { kind: 'tls', host: 'check.example.com' })).json;
    checker.mockClear();
    const first = await call(cookie, 'POST', `/items/${item.id}/check`);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({
      status: 'ok',
      expiresAt: '2030-01-01T00:00:00.000Z',
      lastError: null,
    });
    expect(checker).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'tls', host: 'check.example.com' }),
    );
    const second = await call(cookie, 'POST', `/items/${item.id}/check`);
    expect(second.status).toBe(429);
    expect(await errorCode(second)).toBe('check_rate_limited');
    expect(checker).toHaveBeenCalledTimes(1);
  });

  it('lets only one of several simultaneous requests through', async () => {
    const cookie = await signup('checkrace@example.com');
    const item = (await create(cookie, { kind: 'domain', host: 'race-check.example.com' })).json;
    checker.mockClear();
    const results = await Promise.all(
      [1, 2, 3].map(async () => (await call(cookie, 'POST', `/items/${item.id}/check`)).status),
    );
    expect(results.sort()).toEqual([200, 429, 429]);
    expect(checker).toHaveBeenCalledTimes(1);
  });

  it('stores a failed check on the item and keeps the last known expiry', async () => {
    const cookie = await signup('checkfail@example.com');
    const item = (await create(cookie, { kind: 'tls', host: 'fail.example.com' })).json;
    await call(cookie, 'POST', `/items/${item.id}/check`);
    await db.query(
      "update items set last_checked_at = now() - interval '2 minutes' where id = $1",
      [item.id],
    );
    checker.mockRejectedValueOnce(new Error('Timed out after 5 seconds'));
    const res = await call(cookie, 'POST', `/items/${item.id}/check`);
    expect(await res.json()).toMatchObject({
      status: 'error',
      lastError: 'Timed out after 5 seconds',
      expiresAt: '2030-01-01T00:00:00.000Z',
    });
  });

  it('rejects manual items, items of other users and unknown ids', async () => {
    const alice = await signup('checkalice@example.com');
    const bob = await signup('checkbob@example.com');
    const manual = (
      await create(alice, { kind: 'manual', label: 'API key', expiresAt: '2030-05-01T00:00:00Z' })
    ).json;
    const tls = (await create(alice, { kind: 'tls', host: 'alice-only.example.com' })).json;
    checker.mockClear();
    expect((await call(alice, 'POST', `/items/${manual.id}/check`)).status).toBe(400);
    expect((await call(bob, 'POST', `/items/${tls.id}/check`)).status).toBe(404);
    expect((await call(alice, 'POST', '/items/not-a-uuid/check')).status).toBe(404);
    expect((await fetch(`${base}/items/${tls.id}/check`, { method: 'POST' })).status).toBe(401);
    expect(checker).not.toHaveBeenCalled();
  });
});
