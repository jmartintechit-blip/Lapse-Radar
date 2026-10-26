import { defineConfig } from '@playwright/test';

// Locally the installed Chrome is used (no browser download); CI installs Playwright's Chromium.
export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://localhost:5174',
    locale: 'en-US', // the app follows the browser language; the tests read English
    ...(process.env.CI ? {} : { channel: 'chrome' }),
  },
  webServer: {
    command: 'npm run dev -- --port 5174 --strictPort',
    url: 'http://localhost:5174',
    env: {
      LAPSE_DB: 'memory',
      APP_URL: 'http://localhost:5174',
      VITE_CONFIG_NATIVE_IGNORE_WARNING: 'true',
    }, // fresh database, so sign-up limits and old accounts never leak between runs
  },
});
