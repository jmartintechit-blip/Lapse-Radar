import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { app } from './server/app';

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
