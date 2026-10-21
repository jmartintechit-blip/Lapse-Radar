import express, { Router } from 'express';

// Fixed edge cases that exercise the serverless adapter (invalid UTF-8 bytes, 204, bodiless 429,
// binary). They return static data only; they are checked on the real URL in the deploy gate.
export const edgeRouter = Router();

edgeRouter.post('/echo-bytes', express.raw({ type: () => true, limit: '100kb' }), (req, res) => {
  const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  res.json({ length: body.length, hex: body.toString('hex') });
});

edgeRouter.get('/no-content', (_req, res) => {
  res.status(204).end();
});

edgeRouter.get('/rate-limited', (_req, res) => {
  res.status(429).end();
});

edgeRouter.get('/binary', (_req, res) => {
  res
    .type('application/octet-stream')
    .send(Buffer.from(Uint8Array.from({ length: 256 }, (_, i) => i)));
});
