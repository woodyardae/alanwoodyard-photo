import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { POST as loginPost } from '../src/pages/api/admin/login';
import { POST as logoutPost } from '../src/pages/api/admin/logout';
import { GET as sessionGet } from '../src/pages/api/admin/session';
import {
  adminSessionCookieOptions,
  decideAdminAccess,
  safeAdminReturnPath,
  signAdminSession,
} from '../src/lib/admin-session';

const PASSWORD = 'studio-test-passphrase';

function cookieJar() {
  const jar = new Map<string, { value: string; options?: { secure?: boolean } }>();
  return {
    jar,
    cookies: {
      set(name: string, value: string, options?: { secure?: boolean }) {
        jar.set(name, { value, options });
      },
      delete(name: string) {
        jar.delete(name);
      },
      get(name: string) {
        const entry = jar.get(name);
        return entry ? { value: entry.value } : undefined;
      },
    },
  };
}

test('login page and both slash forms stay outside the admin gate', async () => {
  for (const pathname of ['/admin/login', '/admin/login/', '/api/admin/login', '/api/admin/logout']) {
    const decision = await decideAdminAccess({
      pathname,
      method: 'GET',
      adminPassword: PASSWORD,
      sessionToken: undefined,
    });
    assert.equal(decision.allow, true, pathname);
  }
});

test('missing session sends the studio to the slashed login page and does not loop', async () => {
  const denied = await decideAdminAccess({
    pathname: '/admin/merch-studio/',
    method: 'GET',
    adminPassword: PASSWORD,
    sessionToken: undefined,
  });
  assert.equal(denied.allow, false);
  if (denied.allow) return;
  assert.equal(denied.clearCookie, false);
  assert.ok(denied.location?.startsWith('/admin/login/?'));
  assert.match(denied.location || '', /redirect=%2Fadmin%2Fmerch-studio%2F/);
  assert.doesNotMatch(denied.location || '', /error=/);

  const nextPath = new URL(denied.location || '', 'https://studio.test').pathname;
  const follow = await decideAdminAccess({
    pathname: nextPath,
    method: 'GET',
    adminPassword: PASSWORD,
    sessionToken: undefined,
  });
  assert.equal(follow.allow, true);
});

test('a rejected session names the failure instead of bouncing silently', async () => {
  const denied = await decideAdminAccess({
    pathname: '/admin/merch-studio',
    method: 'GET',
    adminPassword: PASSWORD,
    sessionToken: '10.not-a-real-signature',
  });
  assert.equal(denied.allow, false);
  if (denied.allow) return;
  assert.equal(denied.clearCookie, true);
  assert.match(denied.location || '', /error=session/);
  assert.match(denied.error, /rejected/);
});

test('API admin calls return JSON errors instead of a login redirect', async () => {
  const missing = await decideAdminAccess({
    pathname: '/api/admin/session',
    method: 'GET',
    adminPassword: PASSWORD,
    sessionToken: undefined,
  });
  assert.equal(missing.allow, false);
  if (missing.allow) return;
  assert.equal(missing.status, 401);
  assert.equal(missing.location, undefined);
  assert.match(missing.error, /Sign-in required/);

  const unconfigured = await decideAdminAccess({
    pathname: '/api/approve-merch',
    method: 'POST',
    adminPassword: undefined,
    sessionToken: undefined,
  });
  assert.equal(unconfigured.allow, false);
  if (unconfigured.allow) return;
  assert.equal(unconfigured.status, 500);
});

test('a signed session opens the studio and an expired one does not', async () => {
  const now = 1_700_000_000_000;
  const token = await signAdminSession(PASSWORD, now);
  const open = await decideAdminAccess({
    pathname: '/admin/merch-studio/',
    method: 'GET',
    adminPassword: PASSWORD,
    sessionToken: token,
    now: now + 1000,
  });
  assert.equal(open.allow, true);

  const expired = await decideAdminAccess({
    pathname: '/admin/merch-studio/',
    method: 'GET',
    adminPassword: PASSWORD,
    sessionToken: token,
    now: now + (60 * 60 * 24 * 30 * 1000),
  });
  assert.equal(expired.allow, false);
});

test('return paths stay on admin pages and keep a trailing slash', () => {
  assert.equal(safeAdminReturnPath('/admin/syndication'), '/admin/syndication/');
  assert.equal(safeAdminReturnPath('/admin/login/'), '/admin/merch-studio/');
  assert.equal(safeAdminReturnPath('https://evil.test/admin/merch-studio/'), '/admin/merch-studio/');
  assert.equal(safeAdminReturnPath('//evil.test'), '/admin/merch-studio/');
});

test('session cookies are secure only on https', () => {
  assert.equal(adminSessionCookieOptions('http:').secure, false);
  assert.equal(adminSessionCookieOptions('https:').secure, true);
  assert.equal(adminSessionCookieOptions('https:').httpOnly, true);
});

test('failed credentials return an explicit error and do not set a session', async () => {
  const previous = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_PASSWORD = PASSWORD;
  try {
    const jar = cookieJar();
    const res = await loginPost({
      request: new Request('http://127.0.0.1/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'wrong-passphrase', redirect: '/admin/merch-studio/' }),
      }),
      url: new URL('http://127.0.0.1/api/admin/login'),
      cookies: jar.cookies,
    } as any);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.match(body.error, /rejected/);
    assert.equal(jar.jar.size, 0);
  } finally {
    if (previous === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = previous;
  }
});

test('accepted credentials set an http session and ignore off-site return paths', async () => {
  const previous = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_PASSWORD = PASSWORD;
  try {
    const jar = cookieJar();
    const res = await loginPost({
      request: new Request('http://127.0.0.1/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: PASSWORD, redirect: 'https://evil.test/steal' }),
      }),
      url: new URL('http://127.0.0.1/api/admin/login'),
      cookies: jar.cookies,
    } as any);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.redirect, '/admin/merch-studio/');
    const saved = jar.jar.get('awp_admin_session');
    assert.ok(saved);
    assert.equal(saved?.options?.secure, false);

    const open = await decideAdminAccess({
      pathname: '/admin/merch-studio/',
      method: 'GET',
      adminPassword: PASSWORD,
      sessionToken: saved?.value,
    });
    assert.equal(open.allow, true);
  } finally {
    if (previous === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = previous;
  }
});

test('logout clears the session cookie', async () => {
  const jar = cookieJar();
  jar.cookies.set('awp_admin_session', 'stale', { secure: false });
  const res = await logoutPost({
    request: new Request('http://127.0.0.1/api/admin/logout', { method: 'POST' }),
    url: new URL('http://127.0.0.1/api/admin/logout'),
    cookies: jar.cookies,
  } as any);
  assert.equal(res.status, 200);
  assert.equal(jar.jar.has('awp_admin_session'), false);
  const body = await res.json();
  assert.equal(body.redirect, '/admin/login/');
});

test('session probe route answers ok when the gate has already allowed it', async () => {
  const res = sessionGet({} as any);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ok, true);
});

test('studio page no longer carries a second client password gate', () => {
  const studio = fs.readFileSync('src/pages/admin/merch-studio.astro', 'utf8');
  const login = fs.readFileSync('src/pages/admin/login.astro', 'utf8');
  const middleware = fs.readFileSync('src/middleware.ts', 'utf8');
  assert.equal(studio.includes('id="authGate"'), false);
  assert.equal(studio.includes('aw_studio_auth'), false);
  assert.match(studio, /\/api\/admin\/logout/);
  assert.match(login, /--awp-/);
  assert.match(login, /That passphrase was rejected/);
  assert.match(login, /Sign-in did not stick/);
  assert.doesNotMatch(login, /\u2014|\u2013/);
  assert.match(middleware, /decideAdminAccess/);
  assert.doesNotMatch(middleware, /pathname === '\/admin\/login'/);
});
