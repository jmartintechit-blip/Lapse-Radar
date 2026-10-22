import { expect, test, type Page } from '@playwright/test';
import { ownClientIp } from './helpers';

const password = 'correct horse battery';
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

async function signUp(page: Page, prefix: string) {
  await ownClientIp(page);
  await page.goto('/signup');
  await page.getByLabel('Email').fill(`${prefix}-${Date.now()}-${Math.random()}@example.com`);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

// Signed in through the UI, so the browser context carries the session cookie for page.request.
const addManual = (page: Page, label: string, days: number) =>
  page.request.post('/api/items', { data: { kind: 'manual', label, expiresAt: inDays(days) } });

test('full flow: sign up, add items, alerts in the inbox, renewal re-arms, delete cleans up', async ({
  page,
}) => {
  await signUp(page, 'flow');
  const alerts = page.getByRole('region', { name: /^Alerts/ });
  await expect(page.getByText('No alerts yet.')).toBeVisible();

  // Far away: no alert. Close: one alert for the most urgent threshold reached.
  await page.getByLabel('Type').selectOption('manual');
  await page.getByLabel('Label', { exact: true }).fill('Far token');
  await page.getByLabel('Expires on').fill(inDays(200).slice(0, 10));
  await page.getByRole('button', { name: 'Add item' }).click();
  await expect(page.getByRole('row', { name: /Far token/ })).toContainText('days left');
  await expect(page.getByText('No alerts yet.')).toBeVisible();

  await page.getByLabel('Label', { exact: true }).fill('Soon token');
  await page.getByLabel('Expires on').fill(inDays(5).slice(0, 10));
  await page.getByRole('button', { name: 'Add item' }).click();
  await expect(alerts).toContainText('Soon token expires in 7 days or less');
  await expect(alerts.getByRole('listitem')).toHaveCount(1);

  // Editing something that is not the date does not duplicate the alert.
  await page.getByRole('button', { name: 'Edit Soon token' }).click();
  await page.getByRole('form', { name: 'Edit Soon token' }).getByLabel('Label').fill('Soon key');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('row', { name: /Soon key/ })).toBeVisible();
  await expect(alerts.getByRole('listitem')).toHaveCount(1);

  // Renewing moves the date far away; moving it close again raises a fresh alert.
  await page.getByRole('button', { name: 'Edit Soon key' }).click();
  const edit = page.getByRole('form', { name: 'Edit Soon key' });
  await edit.getByLabel('Expires on').fill(inDays(1).slice(0, 10));
  await edit.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(alerts.getByRole('listitem')).toHaveCount(2);
  await expect(alerts).toContainText('Soon key expires in 1 day or less');

  // The inbox survives a reload; deleting the item removes its alerts.
  await page.reload();
  await expect(alerts.getByRole('listitem')).toHaveCount(2);
  await page
    .getByRole('row', { name: /Soon key/ })
    .getByRole('button', { name: /Delete/ })
    .click();
  await page.getByRole('button', { name: /Confirm delete/ }).click();
  await page.reload();
  await expect(page.getByText('No alerts yet.')).toBeVisible();
  await expect(page.getByRole('row', { name: /Far token/ })).toBeVisible();
});

test('limits: the item cap and duplicate hosts show clear errors and keep the form usable', async ({
  page,
}) => {
  await signUp(page, 'limits');
  for (let i = 1; i <= 9; i++) expect((await addManual(page, `Item ${i}`, 90 + i)).ok()).toBe(true);
  await page.reload();
  await page.getByLabel('Host name').fill('example.com');
  await page.getByRole('button', { name: 'Add item' }).click();
  await expect(page.getByRole('row', { name: /example\.com/ })).toBeVisible(); // the 10th fits

  await page.getByLabel('Host name').fill('example.org');
  await page.getByRole('button', { name: 'Add item' }).click();
  await expect(page.getByRole('alert')).toContainText('up to 10 items');
  await expect(page.getByLabel('Host name')).toBeVisible();
});

test('failures: a duplicate host, a failing alert list and a rate-limited check say so', async ({
  page,
}) => {
  await signUp(page, 'failures');
  await page.getByLabel('Host name').fill('example.com');
  await page.getByRole('button', { name: 'Add item' }).click();
  await expect(page.getByRole('row', { name: /example\.com/ })).toBeVisible();
  await page.getByLabel('Host name').fill('example.com');
  await page.getByRole('button', { name: 'Add item' }).click();
  await expect(page.getByRole('alert')).toContainText('already track');

  await page.route('**/api/items/*/check', (route) =>
    route.fulfill({
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'check_rate_limited', message: 'You can check an item once per minute' },
      }),
    }),
  );
  await page.getByRole('button', { name: 'Check now example.com' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'once per minute' })).toBeVisible();

  await page.route('**/api/alerts', (route) => route.abort());
  await page.reload();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Cannot reach the server' }),
  ).toBeVisible();
  await page.unroute('**/api/alerts');
  await page
    .getByRole('region', { name: /^Alerts/ })
    .getByRole('button', { name: 'Try again' })
    .click();
  await expect(page.getByText('No alerts yet.')).toBeVisible();
});
