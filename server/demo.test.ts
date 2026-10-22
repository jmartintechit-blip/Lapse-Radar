import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app';
import { DEMO_EMAIL } from './demo';
import { migrate } from './db/migrate';
import { createPgliteDb } from './db/pglite';
import { runDueChecks } from './checks/runner';
import { sendPendingEmails } from './email';

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

const enter = async () => {
  const res = await fetch(`${base}/auth/demo`, {
    method: 'POST',
    headers: { 'x-nf-client-connection-ip': `10.3.0.${++n}` },
  });
  return { status: res.status, cookie: res.headers.get('set-cookie')?.split(';')[0] ?? '' };
};
const call = (cookie: string, method: string, path: string, body?: unknown) =>
  fetch(`${base}${path}`, {
    method,
    headers: { cookie, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe('demo account', () => {
  it('opens a session with fictional items and alerts, and can be entered again', async () => {
    const { status, cookie } = await enter();
    expect(status).toBe(204);
    expect(await (await call(cookie, 'GET', '/me')).json()).toMatchObject({
      email: DEMO_EMAIL,
      isDemo: true,
      emailAlerts: false,
    });
    const items = (await (await call(cookie, 'GET', '/items')).json()) as { label: string }[];
    expect(items).toHaveLength(5);
    const alerts = (await (await call(cookie, 'GET', '/alerts')).json()) as unknown[];
    expect(alerts.length).toBeGreaterThan(0);

    // Entering again rebuilds the data instead of piling it up.
    const again = await enter();
    expect(((await (await call(again.cookie, 'GET', '/items')).json()) as unknown[]).length).toBe(
      5,
    );
    expect(await db.query('select 1 from users where is_demo')).toHaveLength(1);
  });

  it('cannot change anything (invariant 6)', async () => {
    const { cookie } = await enter();
    const attempts: [string, string, unknown?][] = [
      ['POST', '/items', { kind: 'manual', label: 'x', expiresAt: '2030-01-01T00:00:00Z' }],
      ['PATCH', '/settings', { emailAlerts: true }],
      ['POST', '/alerts/read-all'],
    ];
    for (const [method, path, body] of attempts)
      expect((await call(cookie, method, path, body)).status).toBe(403);
    const [item] = (await (await call(cookie, 'GET', '/items')).json()) as { id: string }[];
    expect((await call(cookie, 'DELETE', `/items/${item!.id}`)).status).toBe(403);
    expect((await call(cookie, 'POST', `/items/${item!.id}/check`)).status).toBe(403);
  });

  it('has no password, is never checked over the network and is never emailed', async () => {
    await enter();
    const login = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-nf-client-connection-ip': '10.3.9.9' },
      body: JSON.stringify({ email: DEMO_EMAIL, password: '!' }),
    });
    expect(login.status).toBe(401);
    expect(
      await runDueChecks(db, { check: () => Promise.reject(new Error('must not run')) }),
    ).toMatchObject({
      checked: 0,
    });
    let sent = 0;
    await sendPendingEmails(db, () => {
      sent++;
      return Promise.resolve();
    });
    expect(sent).toBe(0);
  });
});
