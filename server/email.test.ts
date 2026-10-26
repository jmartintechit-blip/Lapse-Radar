import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrate } from './db/migrate';
import { createPgliteDb } from './db/pglite';
import {
  buildMessage,
  createResendSender,
  DAILY_EMAIL_CAP,
  sendPendingEmails,
  USER_DAILY_CAP,
} from './email';

const db = createPgliteDb();
let userId = '';

beforeAll(async () => {
  await migrate(db);
  const [user] = await db.query<{ id: string }>(
    "insert into users (email, password_hash, email_verified_at) values ('mail@example.com', 'x', now()) returning id",
  );
  userId = user!.id;
});
afterAll(() => db.close());
beforeEach(async () => {
  await db.query('delete from items');
  await db.query('delete from email_quota');
  await db.query('update users set email_alerts = true, is_demo = false');
});

const addAlert = async (label = 'site') => {
  const [item] = await db.query<{ id: string }>(
    `insert into items (user_id, kind, label, host, expires_at)
     values ($1, 'tls', $2, $2 || '.example.com', now() + interval '3 days') returning id`,
    [userId, label],
  );
  await db.query(
    `insert into alerts (user_id, item_id, threshold_days, expiry_snapshot)
     values ($1, $2, 7, now() + interval '3 days')`,
    [userId, item!.id],
  );
};
const states = () =>
  db.query<{ emailed: boolean; error: string | null }>(
    'select emailed_at is not null as emailed, email_error as error from alerts order by created_at, id',
  );

describe('createResendSender', () => {
  it('posts to Resend with the key and reports only the status on failure', async () => {
    const doFetch = vi.fn().mockResolvedValue(new Response('{"secret":"echo"}', { status: 403 }));
    const send = createResendSender('re_key', 'Me <a@b.c>', doFetch);
    await expect(send({ to: 'x@y.z', subject: 's', text: 't' })).rejects.toThrow(
      'Resend answered 403',
    );
    const [url, init] = doFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_key');
    expect(JSON.parse(init.body as string)).toMatchObject({ from: 'Me <a@b.c>', to: ['x@y.z'] });
  });
});

describe('buildMessage', () => {
  const alert = {
    id: '1',
    email: 'a@b.c',
    label: 'my\r\nsite',
    kind: 'tls',
    expiry_snapshot: new Date(Date.UTC(2026, 0, 10)),
    lang: 'en' as const,
  };
  it('says when it expires or that it has, and keeps the subject on one line', () => {
    expect(buildMessage(alert, new Date(Date.UTC(2026, 0, 9))).subject).toBe(
      '[Lapse Radar] my site expires in 1 day',
    );
    expect(buildMessage(alert, new Date(Date.UTC(2026, 0, 11))).subject).toBe(
      '[Lapse Radar] my site has expired',
    );
  });

  it('writes in Spanish for users who chose it', () => {
    const es = { ...alert, lang: 'es' as const };
    const message = buildMessage(es, new Date(Date.UTC(2026, 0, 9)));
    expect(message.subject).toBe('[Lapse Radar] my site caduca en 1 día');
    expect(message.text).toContain('Fecha de caducidad (UTC): 2026-01-10');
    expect(buildMessage(es, new Date(Date.UTC(2026, 0, 11))).subject).toContain('ha caducado');
  });
});

describe('sendPendingEmails', () => {
  it('sends each alert once and marks it', async () => {
    await addAlert();
    const send = vi.fn().mockResolvedValue(undefined);
    expect(await sendPendingEmails(db, send)).toEqual({ sent: 1, failed: 0 });
    expect(await sendPendingEmails(db, send)).toEqual({ sent: 0, failed: 0 });
    expect(send).toHaveBeenCalledOnce();
    expect(await states()).toEqual([{ emailed: true, error: null }]);
  });

  it('sends nothing to an address that is not verified, then sends once it is', async () => {
    await addAlert();
    await db.query('update users set email_verified_at = null');
    const send = vi.fn().mockResolvedValue(undefined);
    expect(await sendPendingEmails(db, send)).toEqual({ sent: 0, failed: 0 });
    await db.query('update users set email_verified_at = now()');
    expect(await sendPendingEmails(db, send)).toEqual({ sent: 1, failed: 0 });
  });

  it('stores a failure, gives the quota place back and does not retry', async () => {
    await addAlert();
    const send = vi.fn().mockRejectedValue(new Error('Resend answered 403'));
    expect(await sendPendingEmails(db, send)).toEqual({ sent: 0, failed: 1 });
    expect(await sendPendingEmails(db, send)).toEqual({ sent: 0, failed: 0 });
    expect(await states()).toEqual([{ emailed: false, error: 'Resend answered 403' }]);
    const [quota] = await db.query<{ sent: number }>('select sent from email_quota');
    expect(quota!.sent).toBe(0);
  });

  it('skips users with emails off and demo users', async () => {
    await addAlert();
    await db.query('update users set email_alerts = false');
    const send = vi.fn();
    expect(await sendPendingEmails(db, send)).toEqual({ sent: 0, failed: 0 });
    await db.query('update users set email_alerts = true, is_demo = true');
    expect(await sendPendingEmails(db, send)).toEqual({ sent: 0, failed: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it('stops at the daily cap', async () => {
    await db.query(
      "insert into email_quota (day, sent) values ((now() at time zone 'utc')::date, $1)",
      [DAILY_EMAIL_CAP - 1],
    );
    await addAlert('a');
    await addAlert('b');
    const send = vi.fn().mockResolvedValue(undefined);
    expect(await sendPendingEmails(db, send)).toEqual({ sent: 1, failed: 0 });
    expect(await sendPendingEmails(db, send)).toEqual({ sent: 0, failed: 0 });
    expect((await states()).filter((s) => s.emailed)).toHaveLength(1);
  });

  it('gives one user at most a few emails a day', async () => {
    for (let i = 0; i < USER_DAILY_CAP + 3; i++) await addAlert(`s${i}`);
    const send = vi.fn().mockResolvedValue(undefined);
    expect(await sendPendingEmails(db, send)).toEqual({ sent: USER_DAILY_CAP, failed: 0 });
    expect(await sendPendingEmails(db, send)).toEqual({ sent: 0, failed: 0 });
  });

  it('stays quiet when the run has no time left', async () => {
    await addAlert();
    const send = vi.fn();
    expect(await sendPendingEmails(db, send, { deadline: Date.now() })).toEqual({
      sent: 0,
      failed: 0,
    });
    expect(send).not.toHaveBeenCalled();
  });
});
