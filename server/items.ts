import express, { Router, type Response } from 'express';
import { z } from 'zod';
import { requireUser, type AuthUser, type GetDb } from './auth';

export const MAX_ITEMS = 10;

// Syntax check only: lowercase ASCII labels, a TLD with a letter (so no IP literals), no port or path.
// shortcut: the real anti-SSRF defence (DNS resolution, private ranges) lives in the checker, T11.
const HOST = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/;
const INTERNAL_SUFFIX = /\.(local|localhost|internal|lan|home|corp|invalid|test|example|arpa)$/;
const host = z
  .string()
  .trim()
  .toLowerCase()
  .refine(
    (h) => HOST.test(h) && !INTERNAL_SUFFIX.test(h),
    'Enter a public host name, e.g. example.com',
  );

const label = z.string().trim().min(1).max(100);
const notes = z.string().trim().max(500);
const expiresAt = z.iso
  .datetime({ offset: true })
  .refine((d) => d >= '2000' && d < '2200', 'Date out of range');

const CreateInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('tls'), host, label: label.optional(), notes: notes.optional() }),
  z.object({ kind: z.literal('domain'), host, label: label.optional(), notes: notes.optional() }),
  z.object({ kind: z.literal('manual'), label, expiresAt, notes: notes.optional() }),
]);
const PatchInput = z
  .object({ label, notes: notes.nullable(), expiresAt })
  .partial()
  .refine((p) => Object.keys(p).length > 0, 'Nothing to update');

type ItemRow = {
  id: string;
  kind: 'tls' | 'domain' | 'manual';
  label: string;
  host: string | null;
  expires_at: Date | null;
  status: 'pending' | 'ok' | 'error';
  last_error: string | null;
  last_checked_at: Date | null;
  notes: string | null;
  created_at: Date;
};
const COLUMNS =
  'id, kind, label, host, expires_at, status, last_error, last_checked_at, notes, created_at';
const toItem = (r: ItemRow) => ({
  id: r.id,
  kind: r.kind,
  label: r.label,
  host: r.host,
  expiresAt: r.expires_at,
  status: r.status,
  lastError: r.last_error,
  lastCheckedAt: r.last_checked_at,
  notes: r.notes,
  createdAt: r.created_at,
});

const fail = (res: Response, status: number, code: string, message: string) =>
  res.status(status).json({ error: { code, message } });
const user = (res: Response) => res.locals.user as AuthUser;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function itemsRouter(getDb: GetDb) {
  const router = Router();
  router.use('/items', requireUser(getDb), express.json({ limit: '10kb' }));
  // The demo account is read-only (invariant 6).
  router.use('/items', (req, res, next) =>
    req.method !== 'GET' && user(res).isDemo
      ? void fail(res, 403, 'demo_readonly', 'The demo account is read-only')
      : next(),
  );
  // Anything that is not a valid uuid cannot exist, so it is a 404 and never reaches the database.
  router.param('id', (_req, res, next, id) =>
    UUID.test(id) ? next() : void fail(res, 404, 'not_found', 'Item not found'),
  );

  router.get('/items', async (_req, res) => {
    const rows = await (
      await getDb()
    ).query<ItemRow>(`select ${COLUMNS} from items where user_id = $1 order by created_at, id`, [
      user(res).id,
    ]);
    res.json(rows.map(toItem));
  });

  router.post('/items', async (req, res) => {
    const input = CreateInput.safeParse(req.body);
    if (!input.success) return void fail(res, 400, 'invalid_input', 'Check the item fields');
    const d = input.data;
    const itemHost = d.kind === 'manual' ? null : d.host;
    const result = await (
      await getDb()
    ).transaction(async (tx) => {
      // Locking the owner row serialises concurrent creates, so the cap cannot be overshot.
      await tx.query('select 1 from users where id = $1 for update', [user(res).id]);
      const [count] = await tx.query<{ n: number }>(
        'select count(*)::int as n from items where user_id = $1',
        [user(res).id],
      );
      if ((count?.n ?? 0) >= MAX_ITEMS) return 'full' as const;
      const rows = await tx.query<ItemRow>(
        `insert into items (user_id, kind, label, host, expires_at, notes, next_check_at)
         values ($1, $2, $3, $4, $5, $6, case when $2 = 'manual' then null else now() end)
         on conflict (user_id, kind, host) do nothing
         returning ${COLUMNS}`,
        [
          user(res).id,
          d.kind,
          d.label ?? itemHost,
          itemHost,
          d.kind === 'manual' ? d.expiresAt : null,
          d.notes ?? null,
        ],
      );
      return rows[0] ?? ('taken' as const);
    });
    if (result === 'full')
      return void fail(res, 429, 'item_limit', `You can track up to ${MAX_ITEMS} items`);
    if (result === 'taken') return void fail(res, 409, 'duplicate', 'You already track this host');
    res.status(201).json(toItem(result));
  });

  router.get('/items/:id', async (req, res) => {
    const [row] = await (
      await getDb()
    ).query<ItemRow>(`select ${COLUMNS} from items where id = $1 and user_id = $2`, [
      req.params.id,
      user(res).id,
    ]);
    if (!row) return void fail(res, 404, 'not_found', 'Item not found');
    res.json(toItem(row));
  });

  router.patch('/items/:id', async (req, res) => {
    const input = PatchInput.safeParse(req.body);
    if (!input.success) return void fail(res, 400, 'invalid_input', 'Check the item fields');
    const db = await getDb();
    const [current] = await db.query<ItemRow>(
      `select ${COLUMNS} from items where id = $1 and user_id = $2`,
      [req.params.id, user(res).id],
    );
    if (!current) return void fail(res, 404, 'not_found', 'Item not found');
    const p = input.data;
    // Automatic items get their expiry from the checker, so only manual ones accept a date here.
    if (p.expiresAt !== undefined && current.kind !== 'manual')
      return void fail(res, 400, 'invalid_input', 'Only manual items have an editable expiry');
    const [row] = await db.query<ItemRow>(
      `update items set label = $3, notes = $4, expires_at = $5
       where id = $1 and user_id = $2 returning ${COLUMNS}`,
      [
        req.params.id,
        user(res).id,
        p.label ?? current.label,
        p.notes === undefined ? current.notes : p.notes,
        p.expiresAt ?? current.expires_at,
      ],
    );
    res.json(toItem(row as ItemRow));
  });

  router.delete('/items/:id', async (req, res) => {
    const rows = await (
      await getDb()
    ).query('delete from items where id = $1 and user_id = $2 returning id', [
      req.params.id,
      user(res).id,
    ]);
    if (!rows[0]) return void fail(res, 404, 'not_found', 'Item not found');
    res.status(204).end();
  });

  return router;
}
