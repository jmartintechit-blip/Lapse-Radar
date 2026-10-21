import { EventEmitter } from 'node:events';
import type tls from 'node:tls';
import { describe, expect, it, vi } from 'vitest';
import { checkTls, TLS_PORT, type Connect } from './tls';

const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];

function fakeSocket(cert: { valid_to?: string }, authorizationError: Error | string | null = null) {
  const socket = Object.assign(new EventEmitter(), {
    getPeerCertificate: () => cert,
    authorizationError,
    destroy: vi.fn(),
  });
  setImmediate(() => socket.emit('secureConnect'));
  return socket;
}
const connectTo = (socket: object) => vi.fn<Connect>(() => socket as unknown as tls.TLSSocket);

describe('checkTls', () => {
  it('connects to the resolved IP on port 443 with SNI and reads the expiry', async () => {
    const connect = connectTo(fakeSocket({ valid_to: 'Jan  1 00:00:00 2027 GMT' }));
    const result = await checkTls('example.com', { lookup: publicLookup, connect });
    expect(result).toEqual({
      expiresAt: new Date('2027-01-01T00:00:00Z'),
      trusted: true,
      trustError: null,
    });
    expect(connect).toHaveBeenCalledOnce();
    expect(connect.mock.calls[0]![0]).toMatchObject({
      host: '93.184.216.34',
      port: TLS_PORT,
      servername: 'example.com',
    });
  });

  it('still reports the expiry of an untrusted certificate', async () => {
    const connect = connectTo(
      fakeSocket({ valid_to: 'Jan  1 00:00:00 2020 GMT' }, 'CERT_HAS_EXPIRED'),
    );
    const result = await checkTls('example.com', { lookup: publicLookup, connect });
    expect(result).toMatchObject({ trusted: false, trustError: 'CERT_HAS_EXPIRED' });
    expect(result.expiresAt.getUTCFullYear()).toBe(2020);
  });

  it('never opens a connection to a private address', async () => {
    const connect = connectTo(fakeSocket({}));
    const lookup = async () => [{ address: '169.254.169.254', family: 4 }];
    await expect(checkTls('metadata.example.com', { lookup, connect })).rejects.toThrow(
      'public address',
    );
    expect(connect).not.toHaveBeenCalled();
  });

  it('fails when the certificate has no expiry and destroys the socket', async () => {
    const socket = fakeSocket({});
    await expect(
      checkTls('example.com', { lookup: publicLookup, connect: connectTo(socket) }),
    ).rejects.toThrow('no expiry');
    expect(socket.destroy).toHaveBeenCalled();
  });

  it('propagates connection errors', async () => {
    const socket = Object.assign(new EventEmitter(), { destroy: vi.fn() });
    setImmediate(() => socket.emit('error', new Error('ECONNREFUSED')));
    await expect(
      checkTls('example.com', { lookup: publicLookup, connect: connectTo(socket) }),
    ).rejects.toThrow('ECONNREFUSED');
  });

  it('times out after 5 seconds and destroys the socket', async () => {
    vi.useFakeTimers();
    try {
      const socket = Object.assign(new EventEmitter(), { destroy: vi.fn() });
      const pending = checkTls('example.com', {
        lookup: publicLookup,
        connect: connectTo(socket),
      });
      const assertion = expect(pending).rejects.toThrow('Timed out');
      await vi.advanceTimersByTimeAsync(5000);
      await assertion;
      expect(socket.destroy).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

// One real call to a public host; opt in so CI stays independent of the network: LIVE_CHECKS=1 npm test
describe.skipIf(!process.env.LIVE_CHECKS)('checkTls (live)', () => {
  it('reads the certificate of a real public host', async () => {
    const result = await checkTls('example.com');
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now() - 400 * 24 * 3600 * 1000);
    expect(result.trusted).toBe(true);
  });
});
