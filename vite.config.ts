import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { createApp } from './server/app';
import { migrate } from './server/db/migrate';
import { createPgliteDb } from './server/db/pglite';

// Local dev keeps data in .data/dev (PGlite); started on the first request that needs it.
let dev: ReturnType<typeof openDevDb> | undefined;
const openDevDb = async () => {
  const db = createPgliteDb('.data/dev');
  await migrate(db);
  return db;
};
const app = createApp(() => (dev ??= openDevDb()));

export default defineConfig({
  root: 'web',
  plugins: [
    react(),
    // Local dev serves the API inside the Vite process, so one command runs the whole app.
    {
      name: 'lapse-radar-api',
      configureServer(server) {
        server.middlewares.use(app);
      },
    },
  ],
  build: { outDir: '../dist', emptyOutDir: true },
});
