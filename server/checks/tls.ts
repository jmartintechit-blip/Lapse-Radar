import tls from 'node:tls';
import { resolvePublicIp, type Lookup } from './ssrf';

export const TLS_PORT = 443;
export const TIMEOUT_MS = 5000;

export type TlsResult = { expiresAt: Date; trusted: boolean; trustError: string | null };
export type Connect = (options: tls.ConnectionOptions) => tls.TLSSocket;

// Connects to the resolved public IP (never to the name again, so DNS cannot change between check and
// connect) with SNI set to the host name. Port and timeout are fixed: they are not caller input.
// The handshake is not aborted on a bad certificate: an expired or mismatched cert is exactly what we
// report, via `trusted`/`trustError`.
export function checkTls(
  host: string,
  { lookup, connect = tls.connect }: { lookup?: Lookup; connect?: Connect } = {},
): Promise<TlsResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let socket: tls.TLSSocket | undefined;
    const finish = (err: Error | null, result?: TlsResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket?.destroy();
      if (err) reject(err);
      else resolve(result!);
    };
    const timer = setTimeout(() => finish(new Error('Timed out after 5 seconds')), TIMEOUT_MS);

    resolvePublicIp(host, lookup).then((ip) => {
      if (settled) return;
      socket = connect({ host: ip, port: TLS_PORT, servername: host, rejectUnauthorized: false });
      socket.on('error', (e) => finish(e));
      socket.once('secureConnect', () => {
        const validTo = socket!.getPeerCertificate().valid_to;
        const expiresAt = new Date(validTo ?? NaN);
        if (Number.isNaN(expiresAt.getTime()))
          return finish(new Error('Certificate has no expiry date'));
        const trustError = socket!.authorizationError ? String(socket!.authorizationError) : null;
        finish(null, { expiresAt, trusted: trustError === null, trustError });
      });
    }, finish);
  });
}
