const ACCESS_KEY = 'gymflow.accessToken';
const REFRESH_KEY = 'gymflow.refreshToken';

function hasStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

/**
 * Almacén de tokens en localStorage. Trade-off asumido en el MVP (guía §6.3):
 * si el front y la API no comparten dominio, no podemos usar cookie httpOnly.
 */
export const tokenStore = {
  getAccess(): string | null {
    return hasStorage() ? localStorage.getItem(ACCESS_KEY) : null;
  },
  getRefresh(): string | null {
    return hasStorage() ? localStorage.getItem(REFRESH_KEY) : null;
  },
  set(accessToken: string, refreshToken: string): void {
    if (!hasStorage()) return;
    localStorage.setItem(ACCESS_KEY, accessToken);
    localStorage.setItem(REFRESH_KEY, refreshToken);
  },
  clear(): void {
    if (!hasStorage()) return;
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
  isAuthenticated(): boolean {
    return this.getAccess() !== null;
  },
};
