export const BOOTSTRAP_URL = 'https://data.iana.org/rdap/dns.json';
const TIMEOUT_MS = 5000;
const BOOTSTRAP_TTL_MS = 24 * 3600 * 1000;
const MAX_BYTES = 2_000_000;

// The TLD has no RDAP service in the IANA bootstrap (e.g. .es, .io): the user tracks the domain manually.
export class NoRdapError extends Error {}

type Bootstrap = { services: [string[], string[]][] };
let cache: { at: number; byTld: Map<string, string> } | undefined;
export const clearRdapCache = () => (cache = undefined);

// Every URL fetched here is either the fixed IANA one or a registry server listed in it, never user input.
// `redirect: 'error'` stops a registry from bouncing us to some other host.
async function getJson(fetchFn: typeof fetch, url: string, accept: string): Promise<unknown> {
  const res = await fetchFn(url, {
    headers: { accept },
    redirect: 'error',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 404) throw new NotFoundError();
  if (!res.ok) throw new Error(`RDAP server answered ${res.status}`);
  // shortcut: the size is checked after reading; fine for the few trusted registries, tighten with a stream if more are added.
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error('RDAP response too large');
  return JSON.parse(text);
}
class NotFoundError extends Error {}

async function baseUrlFor(tld: string, fetchFn: typeof fetch, now: number): Promise<string> {
  if (!cache || now - cache.at > BOOTSTRAP_TTL_MS) {
    const data = (await getJson(fetchFn, BOOTSTRAP_URL, 'application/json')) as Bootstrap;
    const byTld = new Map<string, string>();
    for (const [tlds, urls] of data.services) {
      const url = urls.find((u) => u.startsWith('https://'));
      if (url)
        for (const t of tlds) byTld.set(t.toLowerCase(), url.endsWith('/') ? url : `${url}/`);
    }
    cache = { at: now, byTld };
  }
  const base = cache.byTld.get(tld);
  if (!base) throw new NoRdapError(`.${tld} has no RDAP service; add this domain as a manual item`);
  return base;
}

export async function checkRdap(
  host: string,
  { fetch: fetchFn = fetch, now = Date.now() }: { fetch?: typeof fetch; now?: number } = {},
): Promise<{ expiresAt: Date }> {
  const base = await baseUrlFor(host.slice(host.lastIndexOf('.') + 1).toLowerCase(), fetchFn, now);
  let body: { events?: { eventAction?: string; eventDate?: string }[] };
  try {
    body = (await getJson(
      fetchFn,
      `${base}domain/${encodeURIComponent(host)}`,
      'application/rdap+json',
    )) as typeof body;
  } catch (e) {
    if (e instanceof NotFoundError) {
      throw new Error('Domain not found in RDAP; enter the registrable domain, e.g. example.com', {
        cause: e,
      });
    }
    throw e;
  }
  const event = body.events?.find((e) => e.eventAction?.toLowerCase() === 'expiration');
  const expiresAt = new Date(event?.eventDate ?? NaN);
  if (Number.isNaN(expiresAt.getTime())) throw new Error('RDAP response has no expiration date');
  return { expiresAt };
}
