import express, { Router, type Response } from 'express';
import { z } from 'zod';
import { requireUser, type AuthUser, type GetDb } from './auth';

const fail = (res: Response, status: number, code: string, message: string) =>
  res.status(status).json({ error: { code, message } });
const user = (res: Response) => res.locals.user as AuthUser;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 1 to 6 distinct day counts, stored from the earliest warning to the latest. Expiry itself (0) is
// always alerted on, so it is not part of the list.
const SettingsInput = z
  .object({
    thresholds: z
      .array(z.number().int().min(1).max(365))
      .min(1)
      .max(6)
      .transform((t) => [...new Set(t)].sort((a, b) => b - a)),
    emailAlerts: z.boolean(),
  })
  .partial()
  .refine((s) => Object.keys(s).length > 0, 'Nothing to update');

type AlertRow = {
  id: string;
  item_id: string;
  label: string;
  kind: string;
  threshold_days: number;
  expiry_snapshot: Date;
  created_at: Date;
  read_at: Date | null;
};

export function alertsRouter(getDb: GetDb) {
  const router = Router();
  router.use(['/alerts', '/settings'], requireUser(getDb), express.json({ limit: '10kb' }));
  // The demo account is read-only (invariant 6).
  router.use(['/alerts', '/settings'], (req, res, next) =>
    req.method !== 'GET' && user(res).isDemo
      ? void fail(res, 403, 'demo_readonly', 'The demo account is read-only')
      : next(),
  );
  router.param('id', (_req, res, next, id) =>
    UUID.test(id) ? next() : void fail(res, 404, 'not_found', 'Alert not found'),
  );

  // The 100 newest are enough for an inbox; older ones stay in the table.
  router.get('/alerts', async (_req, res) => {
    const rows = await (
      await getDb()
    ).query<AlertRow>(
      `select a.id, a.item_id, i.label, i.kind, a.threshold_days, a.expiry_snapshot, a.created_at, a.read_at
       from alerts a join items i on i.id = a.item_id and i.user_id = a.user_id
       where a.user_id = $1 order by a.created_at desc, a.id limit 100`,
      [user(res).id],
    );
    res.json(
      rows.map((r) => ({
        id: r.id,
        itemId: r.item_id,
        label: r.label,
        kind: r.kind,
        thresholdDays: r.threshold_days,
        expiresAt: r.expiry_snapshot,
        createdAt: r.created_at,
        readAt: r.read_at,
      })),
    );
  });

  // Declared before /alerts/:id/read so "read-all" is never taken for an id.
  router.post('/alerts/read-all', async (_req, res) => {
    await (
      await getDb()
    ).query('update alerts set read_at = now() where user_id = $1 and read_at is null', [
      user(res).id,
    ]);
    res.status(204).end();
  });

  router.post('/alerts/:id/read', async (req, res) => {
    const rows = await (
      await getDb()
    ).query(
      'update alerts set read_at = coalesce(read_at, now()) where id = $1 and user_id = $2 returning id',
      [req.params.id, user(res).id],
    );
    if (!rows[0]) return void fail(res, 404, 'not_found', 'Alert not found');
    res.status(204).end();
  });

  router.patch('/settings', async (req, res) => {
    const input = SettingsInput.safeParse(req.body);
    if (!input.success) return void fail(res, 400, 'invalid_input', 'Check the settings');
    const [row] = await (
      await getDb()
    ).query<{ thresholds: number[]; email_alerts: boolean }>(
      `update users set thresholds = coalesce($2, thresholds), email_alerts = coalesce($3, email_alerts)
       where id = $1 returning thresholds, email_alerts`,
      [user(res).id, input.data.thresholds ?? null, input.data.emailAlerts ?? null],
    );
    res.json({ thresholds: row?.thresholds, emailAlerts: row?.email_alerts });
  });

  return router;
}
