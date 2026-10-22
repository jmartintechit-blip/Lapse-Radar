import { expect, test } from '@playwright/test';
import { ownClientIp } from './helpers';

test('the demo opens read-only with fictional data and alerts', async ({ page }) => {
  await ownClientIp(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the read-only demo' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByText('The demo account is read-only.')).toBeVisible();
  await expect(page.getByRole('row', { name: /Payments API key/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /Office licence/ })).toContainText('expired');
  await expect(page.getByRole('heading', { name: 'Add an item' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: /^Alerts/ })).toContainText(
    'Payments API key expires in 7 days or less',
  );
  await expect(page.getByRole('button', { name: /Mark as read|Save settings/ })).toHaveCount(0);
  await expect(page.getByLabel('Also send alerts by email')).toBeDisabled();
});
