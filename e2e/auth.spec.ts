import { expect, test } from '@playwright/test';
import { ownClientIp } from './helpers';

const password = 'correct horse battery';

test('sign up lands on the dashboard, sign out returns to login, sign in works again', async ({
  page,
}) => {
  await ownClientIp(page);
  const email = `e2e-${Date.now()}@example.com`;
  await page.goto('/signup');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();

  await page.reload(); // the cookie keeps the session
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});

test('the dashboard redirects anonymous visitors and a wrong password shows one generic error', async ({
  page,
}) => {
  await ownClientIp(page);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email').fill('nobody@example.com');
  await page.getByLabel('Password').fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Incorrect email or password');
});

test('deleting the account needs the password and ends the session', async ({ page }) => {
  await ownClientIp(page);
  const email = `delete-${Date.now()}-${Math.random()}@example.com`;
  await page.goto('/signup');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  await page.getByRole('button', { name: 'Delete my account…' }).click();
  await page.getByLabel('Confirm with your password').fill('not the password');
  await page.getByRole('button', { name: 'Permanently delete my account' }).click();
  await expect(page.getByRole('alert')).toContainText('Incorrect password');

  await page.getByLabel('Confirm with your password').fill(password);
  await page.getByRole('button', { name: 'Permanently delete my account' }).click();
  await expect(page).toHaveURL('/login');

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toContainText('Incorrect email or password');
});

test('the privacy page is public', async ({ page }) => {
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { name: 'Privacy' })).toBeVisible();
  await expect(page.getByText('salted scrypt hash')).toBeVisible();
});
