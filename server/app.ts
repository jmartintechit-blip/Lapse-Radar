import express, { type ErrorRequestHandler } from 'express';
import { accountRouter } from './account-router';
import type { Mail } from './account-mail';
import { alertsRouter } from './alerts-router';
import { authRouter, type GetDb } from './auth';
import { edgeRouter } from './edge-routes';
import type { Checker } from './checks/runner';
import { itemsRouter } from './items';

// The database is opened lazily by getDb, so routes that never touch it (health, edge cases) need no connection.
export function createApp(getDb: GetDb, check?: Checker, mail?: Mail) {
  const app = express();
  app.disable('x-powered-by');

  app.use('/api', (req, res, next) => {
    res.set({
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    });
    // CSRF defence on top of SameSite=Lax: a browser always sends Origin on a cross-site write, so
    // a write whose Origin is not this site is refused. Requests without Origin (curl, tests) pass;
    // they carry no ambient cookie from a victim's browser.
    const origin = req.get('origin');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && origin !== undefined) {
      let same = false;
      try {
        same = new URL(origin).host === req.get('host');
      } catch {
        // "null" and malformed origins are not this site
      }
      if (!same)
        return void res
          .status(403)
          .json({ error: { code: 'bad_origin', message: 'Cross-site request refused' } });
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Byte-level test endpoints for the serverless adapter: off unless a deploy gate turns them on.
  if (process.env.EDGE_ROUTES === '1') app.use('/api/_edge', edgeRouter);
  app.use('/api', authRouter(getDb, mail));
  app.use('/api', accountRouter(getDb, mail));
  app.use('/api', itemsRouter(getDb, check));
  app.use('/api', alertsRouter(getDb));

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Not found' } });
  });

  // Never leak internals: log the real error server-side, answer with a generic one.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Express needs the 4-argument signature
  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    const status =
      Number.isInteger(err?.status) && err.status >= 400 && err.status < 500 ? err.status : 500;
    // Only the message: a database error object can carry row data such as an email.
    if (status === 500) console.error(err instanceof Error ? err.message : 'Unknown error');
    res.status(status).json({
      error: { code: status === 500 ? 'internal' : 'bad_request', message: 'Request failed' },
    });
  };
  app.use(errorHandler);
  return app;
}
