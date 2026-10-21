import { expect, test } from '@playwright/test';

test('home page loads and reaches a healthy API', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Lapse Radar' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('API status: ok');
});

test('unknown routes show a not found page', async ({ page }) => {
  await page.goto('/does-not-exist');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});
