import { tokenStore } from './tokens';

const API_URL =
  (import.meta.env?.PUBLIC_API_URL as string | undefined) ??
  'http://localhost:4000/api/v1';

export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  error: string;
}

export class ApiRequestError extends Error {
  readonly status: number;
  readonly body: ApiErrorBody | null;

  constructor(status: number, body: ApiErrorBody | null) {
    const msg = Array.isArray(body?.message)
      ? body?.message.join(', ')
      : (body?.message ?? `HTTP ${status}`);
    super(msg);
    this.name = 'ApiRequestError';
    this.status = status;
    this.body = body;
  }
}

async function parseBody(res: Response): Promise<any> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function buildHeaders(
  options: RequestInit,
  token: string | null,
): Record<string, string> {
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) ?? {}),
  };
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

function doFetch(
  path: string,
  options: RequestInit,
  token: string | null,
): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    ...options,
    headers: buildHeaders(options, token),
  });
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = tokenStore.getRefresh();
  if (!refreshToken) return false;

  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    tokenStore.clear();
    return false;
  }
  const data = await parseBody(res);
  if (data?.accessToken && data?.refreshToken) {
    tokenStore.set(data.accessToken, data.refreshToken);
    return true;
  }
  tokenStore.clear();
  return false;
}

/**
 * Cliente fetch central: adjunta el access token y, ante un 401, intenta
 * refrescar UNA vez y reintenta la petición original (guía §6.3).
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let res = await doFetch(path, options, tokenStore.getAccess());

  if (res.status === 401 && tokenStore.getRefresh()) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      res = await doFetch(path, options, tokenStore.getAccess());
    }
  }

  if (!res.ok) {
    throw new ApiRequestError(res.status, await parseBody(res));
  }
  return (await parseBody(res)) as T;
}

// --- Helpers de conveniencia ---

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
};
