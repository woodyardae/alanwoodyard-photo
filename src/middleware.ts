import { defineMiddleware } from 'astro:middleware';
// @ts-ignore
import { env } from 'cloudflare:workers';

async function verifyHmac(data: string, signature: string, secret: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const expectedSigBuf = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
    const expectedSig = Array.from(new Uint8Array(expectedSigBuf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return expectedSig === signature;
  } catch {
    return false;
  }
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { url, cookies, redirect } = context;

  const isAdminRoute = url.pathname.startsWith('/admin') || url.pathname.startsWith('/api/approve-merch') || url.pathname.startsWith('/api/admin');
  const isLoginPage = url.pathname === '/admin/login' || url.pathname === '/api/admin/login';

  if (!isAdminRoute || isLoginPage) {
    return next();
  }

  const adminPassword =
    (env as any)?.ADMIN_PASSWORD ||
    (import.meta.env as any)?.ADMIN_PASSWORD ||
    process.env.ADMIN_PASSWORD;

  // Fallback: If no password provisioned yet, require setting it
  if (!adminPassword) {
    console.error('[SECURITY ERROR] ADMIN_PASSWORD is not set in Cloudflare secrets.');
    return redirect('/admin/login?error=unconfigured');
  }

  const sessionCookie = cookies.get('awp_admin_session')?.value;
  if (!sessionCookie || !sessionCookie.includes('.')) {
    return redirect(`/admin/login?redirect=${encodeURIComponent(url.pathname)}`);
  }

  const [timestamp, signature] = sessionCookie.split('.');
  const isValid = await verifyHmac(timestamp, signature, adminPassword);

  // Expire after 30 days
  const maxAgeMs = 1000 * 60 * 60 * 24 * 30;
  const isFresh = Date.now() - parseInt(timestamp, 10) < maxAgeMs;

  if (!isValid || !isFresh) {
    cookies.delete('awp_admin_session', { path: '/' });
    return redirect(`/admin/login?redirect=${encodeURIComponent(url.pathname)}`);
  }

  return next();
});