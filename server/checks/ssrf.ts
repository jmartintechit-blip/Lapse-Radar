import { lookup as dnsLookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

export class BlockedHostError extends Error {}

const V4_BLOCKED: [string, number][] = [
  ['0.0.0.0', 8], // "this" network
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8],
  ['169.254.0.0', 16], // link-local, includes the cloud metadata address 169.254.169.254
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, includes the broadcast address
];

// IPv6 is an allow-list: only global unicast 2000::/3 passes, minus the special-purpose ranges inside it.
// That rejects ::1, fc00::/7, fe80::/10, multicast and IPv4-mapped (::ffff:a.b.c.d) in one rule.
const V6_BLOCKED: [string, number][] = [
  ['2001::', 32], // Teredo
  ['2001:2::', 48],
  ['2001:10::', 28],
  ['2001:20::', 28],
  ['2001:db8::', 32], // documentation
  ['2002::', 16], // 6to4 (embeds an IPv4 address)
];

const blockedV4 = new BlockList();
for (const [net, bits] of V4_BLOCKED) blockedV4.addSubnet(net, bits, 'ipv4');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
const blockedV6 = new BlockList();
for (const [net, bits] of V6_BLOCKED) blockedV6.addSubnet(net, bits, 'ipv6');

export function isPublicIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return !blockedV4.check(ip, 'ipv4');
  if (family === 6 && !ip.includes('%'))
    return globalV6.check(ip, 'ipv6') && !blockedV6.check(ip, 'ipv6');
  return false;
}

export type Lookup = (host: string) => Promise<{ address: string; family: number }[]>;
const systemLookup: Lookup = (host) => dnsLookup(host, { all: true, verbatim: true });

// Returns the one address the caller must connect to. If any resolved address is not public the whole
// host is rejected, so a name that mixes public and private records cannot be used to reach the private one.
export async function resolvePublicIp(
  host: string,
  lookup: Lookup = systemLookup,
): Promise<string> {
  const addresses = await lookup(host);
  if (addresses.length === 0 || addresses.some((a) => !isPublicIp(a.address))) {
    throw new BlockedHostError('Host does not resolve to a public address');
  }
  return (addresses.find((a) => a.family === 4) ?? addresses[0]!).address;
}
