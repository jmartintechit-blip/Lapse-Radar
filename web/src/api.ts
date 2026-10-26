import { getDict, getLang, serverMessage } from './i18n';

export class ApiError extends Error {}

// The server writes emails in the language of the request.
export const jsonHeaders = () => ({
  'content-type': 'application/json',
  'accept-language': getLang(),
});

// Resolves with the parsed JSON (undefined for 204); rejects with an ApiError whose message is safe to show.
export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? { 'accept-language': getLang() } : jsonHeaders(),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(getDict().offline);
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new ApiError(
      data?.error?.message ? serverMessage(data.error.message) : getDict().generic,
    );
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const errorMessage = (e: unknown) => (e instanceof ApiError ? e.message : getDict().generic);
