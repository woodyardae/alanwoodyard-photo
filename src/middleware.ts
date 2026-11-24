import { defineMiddleware } from 'astro:middleware';
// @ts-ignore cloudflare:workers binding is absent during local Node typecheck.
import { env } from 'cloudflare:workers';
import {
  ADMIN_SESSION_COOKIE,
  adminSessionClearOptions,
  decideAdminAccess,
  normalizeAdminPath,
  readAdminPassword,
  safeDecodePathname,
} from './lib/admin-session';
import { artworkRedirectPath, getEffectiveCatalog, type SessionKv } from './lib/artwork-overlay';

function attachAdminResponseHeaders(response: Response, isAdminPath: boolean): Response {
  if (isAdminPath) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    response.headers.set('Cache-Control', 'no-store');
  }
  return response;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { url, cookies, redirect } = context;
  // Decode first so URL-encoded path variants like /%61dmin/ cannot bypass the
  // admin auth check below, which otherwise only matches the literal /admin/ prefix.
  const decodedPathname = safeDecodePathname(url.pathname);

  if (decodedPathname.startsWith('/artwork/')) {
    try {
      const session = (env as { SESSION?: SessionKv } | undefined)?.SESSION;
      const catalog = await getEffectiveCatalog({ SESSION: session });
      const target = artworkRedirectPath(decodedPathname, catalog);
      if (target) {
        return new Response(null, {
          status: 301,
          headers: {
            Location: `${target}${url.search}`,
            'Cache-Control': 'no-store',
          },
        });
      }
    } catch {
      // A catalog or KV miss still falls through to the artwork route.
    }
  }

  const isAdminPath = normalizeAdminPath(decodedPathname).startsWith('/admin');
  const decision = await decideAdminAccess({
    pathname: decodedPathname,
    method: context.request.method,
    adminPassword: await readAdminPassword(),
    sessionToken: cookies.get(ADMIN_SESSION_COOKIE)?.value,
  });

  if (decision.allow) {
    const response = await next();
    return attachAdminResponseHeaders(response, isAdminPath);
  }

  if (decision.clearCookie) {
    cookies.delete(ADMIN_SESSION_COOKIE, adminSessionClearOptions(url.protocol));
  }

  if (decision.status) {
    return attachAdminResponseHeaders(
      new Response(JSON.stringify({ error: decision.error }), {
        status: decision.status,
        headers: { 'Content-Type': 'application/json' },
      }),
      isAdminPath
    );
  }

  return attachAdminResponseHeaders(redirect(decision.location || '/admin/login/'), isAdminPath);
});
