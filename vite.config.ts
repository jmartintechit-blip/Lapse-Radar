import { mkdirSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { createApp } from './server/app';
import type { Message } from './server/email';
import { migrate } from './server/db/migrate';
import { createPgliteDb } from './server/db/pglite';

// Local dev keeps data in .data/dev (PGlite); E2E runs use an in-memory database instead.
// Opened on the first request that needs it.
let dev: ReturnType<typeof openDevDb> | undefined;
const openDevDb = async () => {
  const memory = process.env.LAPSE_DB === 'memory';
  if (!memory) mkdirSync('.data', { recursive: true }); // PGlite creates only the last folder
  const db = createPgliteDb(memory ? undefined : '.data/dev');
  await migrate(db);
  return db;
};
// Dev has no Resend: account emails land in this list, readable at /__outbox (never built into the site).
const outbox: Message[] = [];
const mail = {
  send: (message: Message) => Promise.resolve(void outbox.push(message)),
  baseUrl: process.env.APP_URL ?? 'http://localhost:5173',
};
const app = createApp(() => (dev ??= openDevDb()), undefined, mail);

export default defineConfig({
  root: 'web',
  plugins: [
    react(),
    // Local dev serves the API inside the Vite process, so one command runs the whole app.
    {
      name: 'lapse-radar-api',
      configureServer(server) {
        server.middlewares.use('/__outbox', (_req, res) => {
          res.setHeader('content-type', 'application/json').end(JSON.stringify(outbox));
        });
        server.middlewares.use(app);
      },
    },
  ],
  build: { outDir: '../dist', emptyOutDir: true },
});
