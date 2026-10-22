import { expect, test } from '@playwright/test';
import { ownClientIp } from './helpers';

test('a close expiry raises an alert that can be read, and settings are saved', async ({
  page,
}) => {
  await ownClientIp(page);
  await page.goto('/signup');
  await page.getByLabel('Email').fill(`alerts-${Date.now()}-${Math.random()}@example.com`);
  await page.getByLabel('Password').fill('correct horse battery');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByText('No alerts yet.')).toBeVisible();

  await page.getByLabel('Type').selectOption('manual');
  await page.getByLabel('Label', { exact: true }).fill('Deploy key');
  const soon = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  await page.getByLabel('Expires on').fill(soon);
  await page.getByRole('button', { name: 'Add item' }).click();

  const alerts = page.getByRole('region', { name: /^Alerts/ });
  await expect(alerts.getByRole('heading')).toContainText('1 unread');
  await expect(alerts).toContainText('Deploy key expires in 7 days or less');
  await alerts.getByRole('button', { name: /Mark as read/ }).click();
  await expect(alerts.getByRole('heading')).not.toContainText('unread');
  await page.reload(); // what was saved is what comes back
  await expect(page.getByRole('region', { name: 'Alerts' })).not.toContainText('New:');

  const settings = page.getByRole('region', { name: 'Alert settings' });
  await settings.getByLabel(/Alert me when/).fill('60, 5');
  await settings.getByLabel('Also send alerts by email').uncheck();
  await settings.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
  await settings.getByLabel(/Alert me when/).fill('0');
  await settings.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.reload();
  await expect(settings.getByLabel(/Alert me when/)).toHaveValue('60, 5');
  await expect(settings.getByLabel('Also send alerts by email')).not.toBeChecked();
});
