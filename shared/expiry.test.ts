import { describe, expect, it } from 'vitest';
import { daysRemaining, expiryStatus } from './expiry';

const at = (iso: string) => new Date(iso);
const now = at('2026-10-21T12:00:00Z');

describe('daysRemaining', () => {
  it('counts whole days and rounds partial days up', () => {
    expect(daysRemaining(at('2026-10-22T12:00:00Z'), now)).toBe(1);
    expect(daysRemaining(at('2026-10-22T12:00:01Z'), now)).toBe(2);
    expect(daysRemaining(at('2026-10-21T12:00:01Z'), now)).toBe(1);
    expect(daysRemaining(at('2026-11-20T12:00:00Z'), now)).toBe(30);
  });

  it('is 0 at the moment of expiry and negative afterwards', () => {
    expect(daysRemaining(now, now)).toBe(0);
    expect(Object.is(daysRemaining(at('2026-10-21T11:59:59.999Z'), now), 0)).toBe(true);
    expect(daysRemaining(at('2026-10-20T12:00:00Z'), now)).toBe(-1);
    expect(daysRemaining(at('2026-10-18T11:00:00Z'), now)).toBe(-3);
  });

  it('accepts the ISO strings the API returns', () => {
    expect(daysRemaining('2026-10-31T12:00:00.000Z', now)).toBe(10);
  });

  it('ignores daylight-saving changes (Europe/Madrid ends DST on 2026-10-25)', () => {
    const before = at('2026-10-24T12:00:00Z');
    expect(daysRemaining(at('2026-10-26T12:00:00Z'), before)).toBe(2);
    expect(daysRemaining(at('2026-10-26T11:00:00Z'), before)).toBe(2);
    expect(daysRemaining(at('2026-10-26T13:00:00Z'), before)).toBe(3);
  });

  it('handles leap days', () => {
    expect(daysRemaining(at('2028-03-01T00:00:00Z'), at('2028-02-28T00:00:00Z'))).toBe(2);
  });
});

describe('expiryStatus', () => {
  it('maps days to bands, with expired starting exactly at the expiry moment', () => {
    expect(expiryStatus(at('2026-10-21T12:00:00Z'), now)).toBe('expired');
    expect(expiryStatus(at('2026-10-21T12:00:01Z'), now)).toBe('critical');
    expect(expiryStatus(at('2026-10-28T12:00:00Z'), now)).toBe('critical'); // 7 days
    expect(expiryStatus(at('2026-10-28T12:00:01Z'), now)).toBe('soon'); // 8 days
    expect(expiryStatus(at('2026-11-20T12:00:00Z'), now)).toBe('soon'); // 30 days
    expect(expiryStatus(at('2026-11-20T12:00:01Z'), now)).toBe('ok'); // 31 days
  });
});
