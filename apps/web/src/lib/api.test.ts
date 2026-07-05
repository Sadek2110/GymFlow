import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apiFetch, ApiRequestError } from './api';
import { tokenStore } from './tokens';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('apiFetch', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('adjunta el access token y devuelve los datos en una petición correcta', async () => {
    tokenStore.set('access-1', 'refresh-1');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const data = await apiFetch<{ ok: boolean }>('/users/me');

    expect(data).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer access-1');
  });

  it('ante un 401, refresca el token una vez y reintenta la petición', async () => {
    tokenStore.set('access-viejo', 'refresh-1');
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/auth/refresh')) {
        return jsonResponse(200, { accessToken: 'access-nuevo', refreshToken: 'refresh-2' });
      }
      // Primera vez 401 (token viejo), segunda vez 200 (token nuevo).
      const auth = (fetchMock.mock.calls.at(-1)?.[1] as any)?.headers?.Authorization;
      return auth === 'Bearer access-nuevo'
        ? jsonResponse(200, { secret: 42 })
        : jsonResponse(401, { statusCode: 401, message: 'expirado', error: 'Unauthorized' });
    });
    vi.stubGlobal('fetch', fetchMock as any);

    const data = await apiFetch<{ secret: number }>('/users/me');

    expect(data).toEqual({ secret: 42 });
    expect(fetchMock).toHaveBeenCalledTimes(3); // original(401) -> refresh -> reintento
    expect(tokenStore.getAccess()).toBe('access-nuevo');
    expect(tokenStore.getRefresh()).toBe('refresh-2');
  });

  it('si el refresh también falla, limpia los tokens y lanza error', async () => {
    tokenStore.set('access-viejo', 'refresh-malo');
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/auth/refresh')) {
        return jsonResponse(401, { statusCode: 401, message: 'refresh inválido', error: 'Unauthorized' });
      }
      return jsonResponse(401, { statusCode: 401, message: 'expirado', error: 'Unauthorized' });
    });
    vi.stubGlobal('fetch', fetchMock as any);

    await expect(apiFetch('/users/me')).rejects.toBeInstanceOf(ApiRequestError);
    expect(tokenStore.getAccess()).toBeNull();
    expect(tokenStore.getRefresh()).toBeNull();
  });

  it('propaga un error no-401 como ApiRequestError sin intentar refrescar', async () => {
    tokenStore.set('access-1', 'refresh-1');
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(409, { statusCode: 409, message: 'conflicto', error: 'Conflict' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/auth/register', { method: 'POST' })).rejects.toMatchObject({
      status: 409,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1); // no reintenta
  });
});
