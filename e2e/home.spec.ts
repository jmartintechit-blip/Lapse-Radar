import { expect, test } from '@playwright/test';

test('home page loads and reaches a healthy API', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Know what expires/ })).toBeVisible();
  await expect(page.getByText('API status: ok')).toBeVisible();
  await expect(page).toHaveTitle(/Lapse Radar/);
});

test('unknown routes show a not found page', async ({ page }) => {
  await page.goto('/does-not-exist');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});

test('the theme can be switched and is remembered', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const html = page.locator('html');
  await page.getByRole('button', { name: 'Use dark theme' }).click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(12, 19, 17)');
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark'); // saved choice beats the system setting
  await page.getByRole('button', { name: 'Use light theme' }).click();
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(245, 242, 234)');
});
