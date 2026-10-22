import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app';
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

type Json = Record<string, unknown>;
const signup = async (email: string) => {
  const res = await fetch(`${base}/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-nf-client-connection-ip': `10.2.0.${++n}` },
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
const alerts = async (cookie: string) =>
  (await (await call(cookie, 'GET', '/alerts')).json()) as Json[];

describe('alerts and settings API', () => {
  it('needs a session', async () => {
    expect((await fetch(`${base}/alerts`)).status).toBe(401);
    expect((await call('', 'POST', '/alerts/read-all')).status).toBe(401);
    expect((await call('', 'PATCH', '/settings', { emailAlerts: false })).status).toBe(401);
  });

  it('raises an alert when a close manual item is added, and keeps alerts per user', async () => {
    const owner = await signup('alerts-owner@example.com');
    const other = await signup('alerts-other@example.com');
    const soon = new Date(Date.now() + 3 * 86_400_000).toISOString();
    expect(
      (await call(owner, 'POST', '/items', { kind: 'manual', label: 'Token', expiresAt: soon }))
        .status,
    ).toBe(201);

    const mine = await alerts(owner);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      label: 'Token',
      kind: 'manual',
      thresholdDays: 7,
      readAt: null,
    });
    expect(await alerts(other)).toEqual([]); // isolation: the other user sees nothing

    // Adding the same item again or editing it must not duplicate the alert (invariant 1).
    await call(owner, 'PATCH', `/items/${(mine[0] as Json).itemId}`, { label: 'Token 2' });
    expect(await alerts(owner)).toHaveLength(1);
  });

  it('marks one or all alerts read, and a foreign or unknown id is a 404', async () => {
    const owner = await signup('read-owner@example.com');
    const other = await signup('read-other@example.com');
    const soon = new Date(Date.now() + 3 * 86_400_000).toISOString();
    for (const label of ['A', 'B'])
      await call(owner, 'POST', '/items', { kind: 'manual', label, expiresAt: soon });
    const [first] = await alerts(owner);

    expect((await call(other, 'POST', `/alerts/${first!.id}/read`)).status).toBe(404);
    expect((await call(owner, 'POST', '/alerts/not-a-uuid/read')).status).toBe(404);
    expect((await call(owner, 'POST', `/alerts/${first!.id}/read`)).status).toBe(204);
    expect((await alerts(owner)).filter((a) => a.readAt)).toHaveLength(1);

    // Another user's read-all touches nothing of mine.
    expect((await call(other, 'POST', '/alerts/read-all')).status).toBe(204);
    expect((await alerts(owner)).filter((a) => a.readAt)).toHaveLength(1);
    expect((await call(owner, 'POST', '/alerts/read-all')).status).toBe(204);
    expect((await alerts(owner)).every((a) => a.readAt)).toBe(true);
  });

  it('updates thresholds and the email switch, and rejects bad values', async () => {
    const cookie = await signup('settings@example.com');
    const ok = await call(cookie, 'PATCH', '/settings', {
      thresholds: [7, 30, 7, 3],
      emailAlerts: false,
    });
    expect(await ok.json()).toEqual({ thresholds: [30, 7, 3], emailAlerts: false });
    expect(await (await call(cookie, 'GET', '/me')).json()).toMatchObject({
      thresholds: [30, 7, 3],
      emailAlerts: false,
    });
    for (const bad of [
      {},
      { thresholds: [] },
      { thresholds: [0] },
      { thresholds: [366] },
      { thresholds: [1.5] },
      { thresholds: [1, 2, 3, 4, 5, 6, 7] },
      { emailAlerts: 'yes' },
    ])
      expect((await call(cookie, 'PATCH', '/settings', bad)).status).toBe(400);
  });

  it('is read-only for the demo account', async () => {
    const cookie = await signup('demo-alerts@example.com');
    await db.query("update users set is_demo = true where email = 'demo-alerts@example.com'");
    expect((await call(cookie, 'GET', '/alerts')).status).toBe(200);
    expect((await call(cookie, 'POST', '/alerts/read-all')).status).toBe(403);
    expect((await call(cookie, 'PATCH', '/settings', { emailAlerts: false })).status).toBe(403);
  });
});
