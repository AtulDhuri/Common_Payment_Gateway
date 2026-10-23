// FILE: auth/session.ts
// PURPOSE: Stores the dashboard JWTs for this browser tab only (sessionStorage). Gateway secrets are never stored here
// DEPENDENCIES: none
// PHASE: 5 (payment sandbox)
export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

const KEY = 'paymenthub.session';

export function getTokens(): Tokens | null {
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Tokens>;
    return typeof parsed.accessToken === 'string' && typeof parsed.refreshToken === 'string'
      ? { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken }
      : null;
  } catch {
    return null;
  }
}

export function saveTokens(tokens: Tokens): void {
  sessionStorage.setItem(KEY, JSON.stringify(tokens));
}

export function clearSession(): void {
  sessionStorage.removeItem(KEY);
}
