import { beforeAll, describe, expect, it, vi } from 'vitest';

type Handler = typeof import('./functions/api').default;
let handler: Handler;
// The edge-case endpoints exist only when EDGE_ROUTES=1, read when the app is created.
beforeAll(async () => {
  vi.stubEnv('EDGE_ROUTES', '1');
  handler = (await import('./functions/api')).default;
});
const ctx = {} as Parameters<Handler>[1];
const call = (path: string, init?: RequestInit) =>
  handler(new Request(`https://lapse.test${path}`, init), ctx);

describe('API through the Netlify adapter', () => {
  it('answers the health check', async () => {
    const res = await call('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('returns a JSON 404 for unknown API routes', async () => {
    const res = await call('/api/nope');
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('not_found');
  });

  it('keeps invalid UTF-8 bytes intact in binary request bodies', async () => {
    const res = await call('/api/_edge/echo-bytes', {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: new Uint8Array([0xff, 0xfe, 0x80, 0x00]),
    });
    expect(await res.json()).toEqual({ length: 4, hex: 'fffe8000' });
  });

  // Known adapter limit: JSON/text bodies are decoded as UTF-8, so an invalid byte becomes U+FFFD
  // (EF BF BD) instead of failing. The API only accepts JSON, so nothing stores raw bytes.
  it('replaces invalid UTF-8 in JSON request bodies without crashing', async () => {
    const res = await call('/api/_edge/echo-bytes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: new Uint8Array([0x7b, 0x22, 0xff, 0x22, 0x7d]),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ length: 7, hex: '7b22efbfbd227d' });
  });

  it('returns 204 with an empty body', async () => {
    const res = await call('/api/_edge/no-content');
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
  });

  it('returns 429 without a body', async () => {
    const res = await call('/api/_edge/rate-limited');
    expect(res.status).toBe(429);
    expect(await res.text()).toBe('');
  });

  it('returns binary bytes unchanged', async () => {
    const res = await call('/api/_edge/binary');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes).toHaveLength(256);
    expect(bytes.every((b, i) => b === i)).toBe(true);
  });
});
