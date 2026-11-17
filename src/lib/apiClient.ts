const TOKEN_STORAGE_KEY = 'crate_session_token';
const OWNER_TOKEN_STORAGE_KEY = 'crate_owner_token';

let inMemorySessionToken = '';
let inMemoryOwnerToken = '';

export function getSessionToken(): string {
  if (inMemorySessionToken) return inMemorySessionToken;
  try {
    const stored = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    if (stored) {
      inMemorySessionToken = stored;
      return stored;
    }
  } catch {
    // Ignore storage access errors in restricted third-party iframes
  }
  return '';
}

export function setSessionToken(token: string | null | undefined): void {
  const clean = (token || '').trim();
  inMemorySessionToken = clean;
  try {
    if (clean) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, clean);
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage access errors in restricted third-party iframes
  }
}

export function clearSessionToken(): void {
  setSessionToken('');
}

export function getOwnerToken(): string {
  if (inMemoryOwnerToken) return inMemoryOwnerToken;
  try {
    const stored = window.localStorage.getItem(OWNER_TOKEN_STORAGE_KEY);
    if (stored) {
      inMemoryOwnerToken = stored;
      return stored;
    }
  } catch {
    // Ignore storage access errors in restricted third-party iframes
  }
  return '';
}

export function setOwnerToken(token: string | null | undefined): void {
  const clean = (token || '').trim();
  inMemoryOwnerToken = clean;
  try {
    if (clean) {
      window.localStorage.setItem(OWNER_TOKEN_STORAGE_KEY, clean);
    } else {
      window.localStorage.removeItem(OWNER_TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage access errors in restricted third-party iframes
  }
}

export function clearOwnerToken(): void {
  setOwnerToken('');
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || undefined);
  const token = getSessionToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const ownerToken = getOwnerToken();
  if (ownerToken && !headers.has('X-Owner-Token')) {
    headers.set('X-Owner-Token', ownerToken);
  }
  return fetch(input, {
    cache: 'no-store',
    ...init,
    headers,
    credentials: 'include',
  });
}

export async function ownerApiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || undefined);
  const ownerToken = getOwnerToken();
  if (ownerToken && !headers.has('X-Owner-Token')) {
    headers.set('X-Owner-Token', ownerToken);
  }
  return fetch(input, {
    cache: 'no-store',
    ...init,
    headers,
    credentials: 'include',
  });
}
