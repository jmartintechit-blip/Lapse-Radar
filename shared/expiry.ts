export const DAY_MS = 86_400_000;

export type ExpiryStatus = 'expired' | 'critical' | 'soon' | 'ok';

// Whole days left, rounded up: 1 ms before expiry still counts as 1 day, and the moment of expiry is 0.
// Plain UTC milliseconds, so daylight-saving changes in the viewer's time zone cannot shift the count.
export function daysRemaining(expiresAt: Date | string, now: Date = new Date()) {
  const days = Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / DAY_MS);
  return days + 0; // turns -0 (expired a moment ago) into 0
}

// Fixed display bands; the user's alert thresholds only decide when alerts fire.
export function expiryStatus(expiresAt: Date | string, now: Date = new Date()): ExpiryStatus {
  if (new Date(expiresAt).getTime() <= now.getTime()) return 'expired';
  const days = daysRemaining(expiresAt, now);
  return days <= 7 ? 'critical' : days <= 30 ? 'soon' : 'ok';
}
