import { expect, test } from '@playwright/test';
import { ownClientIp } from './helpers';

test('each route has its own title and a route change moves focus to the heading', async ({
  page,
}) => {
  await ownClientIp(page);
  await page.goto('/privacy');
  await expect(page).toHaveTitle('Privacy · Lapse Radar');
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the read-only demo' }).click();
  await expect(page).toHaveTitle('Dashboard · Lapse Radar');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeFocused();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL('/login');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeFocused();
});

test('focus returns to a sensible place after edit, delete and mark as read', async ({ page }) => {
  await ownClientIp(page);
  await page.goto('/signup');
  await page.getByLabel('Email').fill(`focus-${Date.now()}-${Math.random()}@example.com`);
  await page.getByLabel('Password').fill('correct horse battery');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByLabel('Type').selectOption('manual');
  await page.getByLabel('Label', { exact: true }).fill('Key');
  await page
    .getByLabel('Expires on')
    .fill(new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10));
  await page.getByRole('button', { name: 'Add item' }).click();
  const row = page.getByRole('row', { name: /Key/ });

  await row.getByRole('button', { name: 'Edit Key' }).click();
  await expect(page.getByRole('form', { name: 'Edit Key' }).getByLabel('Label')).toBeFocused();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(row.getByRole('button', { name: 'Edit Key' })).toBeFocused();

  await page.getByRole('button', { name: /Mark as read/ }).click();
  await expect(page.getByRole('heading', { name: 'Alerts' })).toBeFocused();

  await row.getByRole('button', { name: 'Delete Key' }).click();
  await expect(page.getByRole('button', { name: 'Keep' })).toBeFocused();
  await page.getByRole('button', { name: /Confirm delete Key/ }).click();
  await expect(page.getByRole('heading', { name: 'Your items' })).toBeFocused();
});

test('sign in works with the keyboard alone', async ({ page }) => {
  await ownClientIp(page);
  const email = `keys-${Date.now()}-${Math.random()}@example.com`;
  await page.goto('/signup');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct horse battery');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  // the route change moves focus to the heading; start typing only after that
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeFocused();
  await page.getByLabel('Email').focus();
  await page.keyboard.type(email);
  await page.keyboard.press('Tab');
  await page.keyboard.type('correct horse battery');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});
