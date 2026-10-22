import { createResendSender } from './email';

// Sends one real email to Resend's test inbox to check the API key and sender, without touching the
// database or the deployed site. Usage: npm run email:test (reads RESEND_API_KEY from .env).
const key = process.env.RESEND_API_KEY;
if (!key) {
  console.error('RESEND_API_KEY is not set (put it in .env, never in the repo).');
  process.exit(1);
}
try {
  await createResendSender(
    key,
    process.env.EMAIL_FROM || undefined,
  )({
    to: 'delivered@resend.dev',
    subject: '[Lapse Radar] test email',
    text: 'If you can read this, the Resend key and sender work.',
  });
  console.log('Sent to delivered@resend.dev: Resend accepted the message.');
} catch (error) {
  console.error('Failed:', error instanceof Error ? error.message : 'unknown error');
  process.exit(1);
}
