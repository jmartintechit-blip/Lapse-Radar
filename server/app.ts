import express, { type ErrorRequestHandler } from 'express';
import { edgeRouter } from './edge-routes';

export const app = express();
app.disable('x-powered-by');

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/_edge', edgeRouter);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: { code: 'not_found', message: 'Not found' } });
});

// Never leak internals: log the real error server-side, answer with a generic one.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Express needs the 4-argument signature
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status =
    Number.isInteger(err?.status) && err.status >= 400 && err.status < 500 ? err.status : 500;
  if (status === 500) console.error(err);
  res.status(status).json({
    error: { code: status === 500 ? 'internal' : 'bad_request', message: 'Request failed' },
  });
};
app.use(errorHandler);
