import { createPgDb } from '../../server/db';
import { runScheduled } from '../../server/scheduled';

// Hourly run on the published deploy only (UTC, 30 s limit; the work itself stops at 25 s).
export default async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const db = createPgDb(url);
  try {
    // Counts only: hosts and emails never go to the logs.
    console.log('scheduled: result', JSON.stringify(await runScheduled(db)));
  } catch (error) {
    console.error('scheduled: failed', error instanceof Error ? error.message : 'unknown error');
    throw error;
  } finally {
    await db.close();
  }
};

export const config = { schedule: '@hourly' };
