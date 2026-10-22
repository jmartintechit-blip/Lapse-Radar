import { createPgDb } from '../../server/db';
import { createResendSender } from '../../server/email';
import { runScheduled } from '../../server/scheduled';

// Hourly run on the published deploy only (UTC, 30 s limit; the work itself stops at 25 s).
export default async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const db = createPgDb(url);
  const key = process.env.RESEND_API_KEY;
  const send = key ? createResendSender(key, process.env.EMAIL_FROM || undefined) : undefined;
  try {
    // Counts only: hosts and emails never go to the logs.
    console.log('scheduled: result', JSON.stringify(await runScheduled(db, { send })));
  } catch (error) {
    console.error('scheduled: failed', error instanceof Error ? error.message : 'unknown error');
    throw error;
  } finally {
    await db.close();
  }
};

export const config = { schedule: '@hourly' };
