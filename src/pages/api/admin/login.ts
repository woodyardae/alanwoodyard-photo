import type { APIRoute } from 'astro';
import {
  ADMIN_SESSION_COOKIE,
  adminSessionCookieOptions,
  readAdminPassword,
  safeAdminReturnPath,
  signAdminSession,
} from '../../../lib/admin-session';

export const prerender = false;

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async (context) => {
  try {
    const body = await context.request.json() as { password?: string; redirect?: string };
    const adminPassword = await readAdminPassword();

    if (!adminPassword) {
      return json({ error: 'The admin password is not set on the server.' }, 500);
    }

    if (!body.password || body.password !== adminPassword) {
      return json({ error: 'That passphrase was rejected.' }, 401);
    }

    const token = await signAdminSession(adminPassword);
    context.cookies.set(
      ADMIN_SESSION_COOKIE,
      token,
      adminSessionCookieOptions(context.url.protocol),
    );

    return json({
      success: true,
      redirect: safeAdminReturnPath(body.redirect),
    }, 200);
  } catch {
    return json({ error: 'The sign-in request could not be read.' }, 400);
  }
};
