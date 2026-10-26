import { expect, test, type Page } from '@playwright/test';
import { ownClientIp } from './helpers';

const password = 'correct horse battery';

async function signUp(page: Page) {
  await ownClientIp(page);
  const email = `acct-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  await page.goto('/signup');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  return email;
}

// Dev server only: the mails it "sent" are readable at /__outbox (see vite.config.ts).
async function lastLink(page: Page, to: string, path: string) {
  const outbox = await page.evaluate(async () => (await fetch('/__outbox')).json());
  const mail = [...(outbox as { to: string; text: string }[])].reverse().find((m) => m.to === to);
  const link = mail?.text.match(new RegExp(`http\\S*/${path}#token=\\S+`))?.[0];
  if (!link) throw new Error(`no ${path} link for ${to}`);
  return link;
}

test('the confirmation link verifies the address after one click', async ({ page }) => {
  const email = await signUp(page);
  await expect(page.getByText('not confirmed yet')).toBeVisible();

  await page.goto(await lastLink(page, email, 'confirm'));
  await expect(page).toHaveURL(/\/confirm$/); // the token is gone from the address bar
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText('Your email is confirmed')).toBeVisible();

  await page.getByRole('link', { name: 'Go to dashboard' }).click();
  await expect(page.getByText('Your email address is confirmed.')).toBeVisible();
});

test('a forgotten password is reset from the emailed link and old sessions end', async ({
  page,
  browser,
}) => {
  const email = await signUp(page);
  // TEMPORARY diagnostics for a CI-only failure
  page.on('pageerror', (e) => console.log('DIAG pageerror', e.message));
  page.on('console', (m) => console.log('DIAG console', m.type(), m.text()));
  page.on('framenavigated', (f) => console.log('DIAG nav', f.url()));
  page.on(
    'request',
    (r) => r.url().includes('/api/') && console.log('DIAG req', r.method(), r.url()),
  );
  page.on('requestfailed', (r) => console.log('DIAG failed', r.url(), r.failure()?.errorText));
  const other = await (await browser.newContext({ locale: 'en-US' })).newPage();
  await ownClientIp(other);
  await other.goto('/login');
  await other.getByLabel('Email').fill(email);
  await other.getByLabel('Password').fill(password);
  await other.getByRole('button', { name: 'Sign in' }).click();
  await expect(other.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('link', { name: 'Forgot your password?' }).click();
  await page.getByLabel('Email').fill(email);
  const forgot = page.waitForResponse((r) => r.url().endsWith('/api/auth/forgot'));
  await page.getByRole('button', { name: 'Send the link' }).click();
  expect((await forgot).status()).toBe(204);
  await expect(page.getByRole('status')).toContainText('a link is on its way');

  await page.goto(await lastLink(page, email, 'reset-password'));
  await page.getByLabel('New password').fill('a brand new password');
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByRole('status')).toContainText('You can sign in now');

  await other.reload();
  await expect(other.getByRole('heading', { name: 'Sign in' })).toBeVisible(); // its session was closed

  await page.getByRole('link', { name: 'Sign in' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a brand new password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});

test('a reset link without a token says so', async ({ page }) => {
  await page.goto('/reset-password');
  await expect(page.getByRole('alert')).toContainText('incomplete');
});

test('changing the password asks for the current one', async ({ page }) => {
  await signUp(page);
  const form = page.getByRole('form', { name: 'Change password' });
  await form.getByLabel('Current password').fill('not the password!');
  await form.getByLabel('New password').fill('another long password');
  await form.getByRole('button', { name: 'Change password' }).click();
  await expect(form.getByRole('alert')).toHaveText('Incorrect password');

  await form.getByLabel('Current password').fill(password);
  await form.getByRole('button', { name: 'Change password' }).click();
  await expect(form.getByText('Password changed')).toBeVisible();
});

test('the language selector switches the whole app and is remembered', async ({ page }) => {
  await ownClientIp(page);
  await page.goto('/');
  await page.getByLabel('Language').selectOption('es');
  await expect(page.getByRole('heading', { name: /Sabe qué caduca/ })).toBeVisible();
  await expect(page).toHaveTitle(/Lapse Radar: sabe qué caduca/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');

  await page.getByRole('link', { name: 'Iniciar sesión' }).click();
  await page.getByLabel('Email').fill('nobody@example.com');
  await page.getByLabel('Contraseña').fill('wrong-password');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByRole('alert')).toHaveText('Email o contraseña incorrectos'); // server error, translated

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  await page.getByLabel('Idioma').selectOption('en');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});
