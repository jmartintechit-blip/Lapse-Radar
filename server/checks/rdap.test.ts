import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BOOTSTRAP_URL, checkRdap, clearRdapCache, NoRdapError } from './rdap';

// Trimmed from the real IANA bootstrap and registry answers (2026-10-21).
const bootstrap = {
  services: [
    [['com', 'net'], ['https://rdap.verisign.com/com/v1/']],
    [['uk'], ['https://rdap.nominet.uk/uk']], // no trailing slash on purpose
    [['xx'], ['http://insecure.example/']], // not https: ignored
  ],
};
const verisign = {
  events: [
    { eventAction: 'registration', eventDate: '1995-08-14T04:00:00Z' },
    { eventAction: 'expiration', eventDate: '2027-08-13T04:00:00Z' },
  ],
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function fakeFetch(routes: Record<string, () => Response>) {
  return vi.fn<typeof fetch>(async (url) => {
    const route = routes[String(url)];
    if (!route) throw new Error(`unexpected fetch ${String(url)}`);
    return route();
  });
}

beforeEach(clearRdapCache);

describe('checkRdap', () => {
  it('finds the registry in the bootstrap and reads the expiration event', async () => {
    const f = fakeFetch({
      [BOOTSTRAP_URL]: () => json(bootstrap),
      'https://rdap.verisign.com/com/v1/domain/example.com': () => json(verisign),
    });
    expect(await checkRdap('example.com', { fetch: f })).toEqual({
      expiresAt: new Date('2027-08-13T04:00:00Z'),
    });
    expect(f.mock.calls[1]![1]).toMatchObject({ redirect: 'error' });
  });

  it('adds the missing slash to a registry URL', async () => {
    const f = fakeFetch({
      [BOOTSTRAP_URL]: () => json(bootstrap),
      'https://rdap.nominet.uk/uk/domain/bbc.co.uk': () =>
        json({ events: [{ eventAction: 'Expiration', eventDate: '2034-12-13T03:49:48Z' }] }),
    });
    expect((await checkRdap('bbc.co.uk', { fetch: f })).expiresAt.getUTCFullYear()).toBe(2034);
  });

  it('caches the bootstrap for 24 hours', async () => {
    const f = fakeFetch({
      [BOOTSTRAP_URL]: () => json(bootstrap),
      'https://rdap.verisign.com/com/v1/domain/example.com': () => json(verisign),
    });
    await checkRdap('example.com', { fetch: f, now: 0 });
    await checkRdap('example.com', { fetch: f, now: 23 * 3600 * 1000 });
    expect(f.mock.calls.filter(([u]) => u === BOOTSTRAP_URL)).toHaveLength(1);
    await checkRdap('example.com', { fetch: f, now: 25 * 3600 * 1000 });
    expect(f.mock.calls.filter(([u]) => u === BOOTSTRAP_URL)).toHaveLength(2);
  });

  it('reports a TLD without RDAP as NoRdapError, without querying any registry', async () => {
    const f = fakeFetch({ [BOOTSTRAP_URL]: () => json(bootstrap) });
    await expect(checkRdap('example.es', { fetch: f })).rejects.toBeInstanceOf(NoRdapError);
    await expect(checkRdap('example.xx', { fetch: f })).rejects.toBeInstanceOf(NoRdapError);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('explains a 404 and other registry errors', async () => {
    const f = fakeFetch({
      [BOOTSTRAP_URL]: () => json(bootstrap),
      'https://rdap.verisign.com/com/v1/domain/www.example.com': () => json({}, 404),
      'https://rdap.verisign.com/com/v1/domain/down.com': () => json({}, 503),
    });
    await expect(checkRdap('www.example.com', { fetch: f })).rejects.toThrow('registrable domain');
    await expect(checkRdap('down.com', { fetch: f })).rejects.toThrow('answered 503');
  });

  it('fails when the answer has no usable expiration event', async () => {
    const f = fakeFetch({
      [BOOTSTRAP_URL]: () => json(bootstrap),
      'https://rdap.verisign.com/com/v1/domain/a.com': () => json({ events: [] }),
      'https://rdap.verisign.com/com/v1/domain/b.com': () =>
        json({ events: [{ eventAction: 'expiration', eventDate: 'soon' }] }),
      'https://rdap.verisign.com/com/v1/domain/c.com': () => json({}),
    });
    for (const h of ['a.com', 'b.com', 'c.com']) {
      await expect(checkRdap(h, { fetch: f })).rejects.toThrow('no expiration date');
    }
  });
});

// Real calls to IANA and a registry; opt in so CI stays independent of the network: LIVE_CHECKS=1 npm test
describe.skipIf(!process.env.LIVE_CHECKS)('checkRdap (live)', () => {
  it('reads the expiry of a real .com and rejects a TLD without RDAP', async () => {
    const { expiresAt } = await checkRdap('example.com');
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    await expect(checkRdap('example.es')).rejects.toBeInstanceOf(NoRdapError);
  });
});
