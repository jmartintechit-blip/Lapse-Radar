import type { Page } from '@playwright/test';

// Each test pretends to be a different client, so the per-IP sign-up limit (5 per hour) never trips on retries.
export async function ownClientIp(page: Page) {
  const ip = `10.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;
  await page.route('**/api/auth/**', (route) =>
    route.continue({ headers: { ...route.request().headers(), 'x-nf-client-connection-ip': ip } }),
  );
}
