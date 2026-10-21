import { expect, test, type Page } from '@playwright/test';
import { ownClientIp } from './helpers';

async function signUp(page: Page) {
  await ownClientIp(page);
  await page.goto('/signup');
  await page.getByLabel('Email').fill(`items-${Date.now()}-${Math.random()}@example.com`);
  await page.getByLabel('Password').fill('correct horse battery');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

test('a new account sees the empty state, then adds, edits and deletes items', async ({ page }) => {
  await signUp(page);
  await expect(page.getByText('Nothing tracked yet.')).toBeVisible();

  // A host the server refuses shows its error and keeps the form usable.
  await page.getByLabel('Host name').fill('localhost');
  await page.getByRole('button', { name: 'Add item' }).click();
  await expect(page.getByRole('alert')).toBeVisible();

  await page.getByLabel('Host name').fill('example.com');
  await page.getByRole('button', { name: 'Add item' }).click();
  const row = page.getByRole('row', { name: /example\.com/ });
  await expect(row).toContainText('TLS certificate');
  await expect(row).toContainText('Not checked yet');

  await page.getByLabel('Type').selectOption('manual');
  await page.getByLabel('Label', { exact: true }).fill('API token');
  const year = new Date().getUTCFullYear() + 1;
  await page.getByLabel('Expires on').fill(`${year}-06-01`);
  await page.getByRole('button', { name: 'Add item' }).click();
  const manual = page.getByRole('row', { name: /API token/ });
  await expect(manual).toContainText(`${year}-06-01`);
  await expect(manual).toContainText('days left');

  await manual.getByRole('button', { name: 'Edit API token' }).click();
  const edit = page.getByRole('form', { name: 'Edit API token' });
  await edit.getByLabel('Label').fill('Billing token');
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('row', { name: /Billing token/ })).toBeVisible();

  await page
    .getByRole('row', { name: /example\.com/ })
    .getByRole('button', { name: /Delete/ })
    .click();
  await page.getByRole('button', { name: /Confirm delete/ }).click();
  await expect(page.getByRole('row', { name: /example\.com/ })).toHaveCount(0);
  await page.reload(); // what was saved is what comes back
  await expect(page.getByRole('row', { name: /Billing token/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /example\.com/ })).toHaveCount(0);
});

test('a failing list shows an error with a retry', async ({ page }) => {
  await signUp(page);
  await page.route('**/api/items', (route) => route.abort());
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Cannot reach the server');
  await page.unroute('**/api/items');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('Nothing tracked yet.')).toBeVisible();
});
