export class ApiError extends Error {}

// Resolves with the parsed JSON (undefined for 204); rejects with an ApiError whose message is safe to show.
export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Cannot reach the server, check your connection');
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new ApiError(data?.error?.message ?? 'Something went wrong, try again');
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const errorMessage = (e: unknown) =>
  e instanceof ApiError ? e.message : 'Something went wrong, try again';
