export const ADMIN_SESSION_COOKIE = 'awp_admin_session';
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 30;
const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_SEC * 1000;

export type AdminDenyReason = 'unconfigured' | 'required' | 'session';

export type AdminAccess =
  | { allow: true }
  | {
      allow: false;
      clearCookie: boolean;
      error: string;
      status?: number;
      location?: string;
    };

const DENY_COPY: Record<AdminDenyReason, string> = {
  unconfigured: 'The admin password is not set on the server.',
  required: 'Sign-in required.',
  session: 'That session was rejected. Enter the passphrase again.',
};

/**
 * Safely decodes a URL pathname so percent-encoded variants such as
 * `/%61dmin/` (decodes to `/admin/`) cannot bypass admin auth checks that
 * compare against the literal `/admin/` prefix. Decoding repeats up to a
 * small cap to unwrap double-encoding, and any malformed sequence falls back
 * to the last successfully decoded value instead of throwing.
 */
export function safeDecodePathname(pathname: string): string {
  let current = pathname;
  for (let i = 0; i < 3; i += 1) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(current);
    } catch {
      return current;
    }
    if (decoded === current) return decoded;
    current = decoded;
  }
  return current;
}

export function normalizeAdminPath(pathname: string): string {
  if (!pathname) return '/';
  const withLeading = pathname.startsWith('/') ? pathname : `/${pathname}`;
  if (withLeading.length > 1 && withLeading.endsWith('/')) return withLeading.slice(0, -1);
  return withLeading;
}

export function isPublicAdminPath(pathname: string, method: string): boolean {
  const path = normalizeAdminPath(pathname);
  if (path === '/admin/login' || path === '/api/admin/login' || path === '/api/admin/logout') {
    return true;
  }
  return path === '/api/approve-merch' && method.toUpperCase() === 'GET';
}

export function isProtectedAdminPath(pathname: string, method: string): boolean {
  if (isPublicAdminPath(pathname, method)) return false;
  const path = normalizeAdminPath(pathname);
  return (
    path === '/admin' ||
    path.startsWith('/admin/') ||
    path.startsWith('/api/admin/') ||
    path.startsWith('/api/approve-merch')
  );
}

export function safeAdminReturnPath(raw: string | null | undefined): string {
  const fallback = '/admin/merch-studio/';
  if (!raw) return fallback;
  const trimmed = raw.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return fallback;
  if (trimmed.includes('\\') || trimmed.includes('://')) return fallback;
  const hashAt = trimmed.indexOf('#');
  const queryAt = trimmed.indexOf('?');
  let end = trimmed.length;
  if (hashAt >= 0) end = Math.min(end, hashAt);
  if (queryAt >= 0) end = Math.min(end, queryAt);
  const path = normalizeAdminPath(trimmed.slice(0, end));
  if (path === '/admin/login' || !path.startsWith('/admin/')) return fallback;
  return `${path}/`;
}

export function adminSessionCookieOptions(protocol: string) {
  return {
    path: '/',
    httpOnly: true,
    secure: protocol === 'https:',
    sameSite: 'lax' as const,
    maxAge: SESSION_MAX_AGE_SEC,
  };
}

export function adminSessionClearOptions(protocol: string) {
  const { maxAge, ...clearOptions } = adminSessionCookieOptions(protocol);
  void maxAge;
  return clearOptions;
}

async function hmacHex(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function signAdminSession(secret: string, now = Date.now()): Promise<string> {
  const timestamp = String(now);
  const signature = await hmacHex(timestamp, secret);
  return `${timestamp}.${signature}`;
}

export async function readAdminSession(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): Promise<'valid' | 'missing' | 'rejected'> {
  if (!token || !token.includes('.')) return 'missing';
  const splitAt = token.indexOf('.');
  const timestamp = token.slice(0, splitAt);
  const signature = token.slice(splitAt + 1);
  if (!/^\d+$/.test(timestamp) || !/^[0-9a-f]+$/i.test(signature)) return 'rejected';
  const issuedAt = Number(timestamp);
  const age = now - issuedAt;
  if (!Number.isFinite(issuedAt) || age < 0 || age >= SESSION_MAX_AGE_MS) return 'rejected';
  const expected = await hmacHex(timestamp, secret);
  if (expected.length !== signature.length) return 'rejected';
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0 ? 'valid' : 'rejected';
}

function deny(reason: AdminDenyReason, pathname: string, clearCookie: boolean): AdminAccess {
  const path = normalizeAdminPath(pathname);
  if (path.startsWith('/api/')) {
    return {
      allow: false,
      clearCookie,
      error: DENY_COPY[reason],
      status: reason === 'unconfigured' ? 500 : 401,
    };
  }
  const params = new URLSearchParams();
  if (reason !== 'required') params.set('error', reason);
  params.set('redirect', safeAdminReturnPath(pathname));
  return {
    allow: false,
    clearCookie,
    error: DENY_COPY[reason],
    location: `/admin/login/?${params.toString()}`,
  };
}

export async function decideAdminAccess(input: {
  pathname: string;
  method: string;
  adminPassword: string | undefined;
  sessionToken: string | undefined;
  now?: number;
}): Promise<AdminAccess> {
  const method = input.method || 'GET';
  if (!isProtectedAdminPath(input.pathname, method)) return { allow: true };
  if (!input.adminPassword) return deny('unconfigured', input.pathname, false);
  const now = input.now ?? Date.now();
  const state = await readAdminSession(input.sessionToken, input.adminPassword, now);
  if (state === 'missing') return deny('required', input.pathname, false);
  if (state === 'rejected') return deny('session', input.pathname, true);
  return { allow: true };
}

export async function readAdminPassword(): Promise<string | undefined> {
  try {
    // @ts-ignore cloudflare:workers is provided at runtime on Workers; absent in local tsc.
    const cfWorkers = await import('cloudflare:workers');
    const fromCf = (cfWorkers as { env?: { ADMIN_PASSWORD?: string } }).env?.ADMIN_PASSWORD;
    if (typeof fromCf === 'string' && fromCf.length > 0) return fromCf;
  } catch {
    // Local Node and astro dev do not expose the Cloudflare workers binding.
  }

  try {
    const metaPassword = (import.meta as { env?: { ADMIN_PASSWORD?: string } }).env?.ADMIN_PASSWORD;
    if (typeof metaPassword === 'string' && metaPassword.length > 0) return metaPassword;
  } catch {
    // import.meta.env is absent outside Vite.
  }

  const fromProcess = typeof process !== 'undefined' ? process.env.ADMIN_PASSWORD : undefined;
  if (typeof fromProcess === 'string' && fromProcess.length > 0) return fromProcess;
  return undefined;
}
