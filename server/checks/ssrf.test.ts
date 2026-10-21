import { describe, expect, it } from 'vitest';
import { BlockedHostError, isPublicIp, resolvePublicIp } from './ssrf';

describe('isPublicIp', () => {
  it.each([
    '0.0.0.0',
    '10.1.2.3',
    '100.64.0.1',
    '127.0.0.1',
    '127.255.255.254',
    '169.254.169.254', // cloud metadata
    '172.16.0.1',
    '172.31.255.255',
    '192.0.0.1',
    '192.168.1.1',
    '198.18.0.1',
    '224.0.0.1',
    '240.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    '::ffff:127.0.0.1', // IPv4-mapped loopback
    '::ffff:169.254.169.254',
    '::ffff:8.8.8.8', // mapped addresses are rejected even when the IPv4 part is public
    'fe80::1',
    'fe80::1%eth0',
    'fc00::1',
    'fd00:ec2::254', // AWS IPv6 metadata
    'ff02::1',
    '64:ff9b::7f00:1', // NAT64 of 127.0.0.1
    '100::1',
    '2002:7f00:1::', // 6to4 of 127.0.0.1
    '2001::1',
    '2001:db8::1',
    'example.com',
    '',
    '1.2.3',
    '0x7f.1',
    '2130706433',
  ])('rejects %s', (ip) => expect(isPublicIp(ip)).toBe(false));

  it.each([
    '8.8.8.8',
    '1.1.1.1',
    '93.184.216.34',
    '172.15.255.255',
    '172.32.0.1',
    '2606:4700:4700::1111',
    '2001:4860:4860::8888',
  ])('accepts %s', (ip) => expect(isPublicIp(ip)).toBe(true));
});

describe('resolvePublicIp', () => {
  const answer =
    (...addresses: string[]) =>
    async () =>
      addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));

  it('returns the public address, preferring IPv4', async () => {
    expect(await resolvePublicIp('x.com', answer('2606:4700:4700::1111', '1.1.1.1'))).toBe(
      '1.1.1.1',
    );
  });

  it('rejects a host that resolves to a private address', async () => {
    await expect(resolvePublicIp('x.com', answer('10.0.0.5'))).rejects.toBeInstanceOf(
      BlockedHostError,
    );
  });

  it('rejects a host that mixes public and private records', async () => {
    await expect(resolvePublicIp('x.com', answer('8.8.8.8', '127.0.0.1'))).rejects.toBeInstanceOf(
      BlockedHostError,
    );
  });

  it('rejects an empty answer and propagates DNS errors', async () => {
    await expect(resolvePublicIp('x.com', answer())).rejects.toBeInstanceOf(BlockedHostError);
    await expect(
      resolvePublicIp('x.com', () => Promise.reject(new Error('ENOTFOUND'))),
    ).rejects.toThrow('ENOTFOUND');
  });
});
