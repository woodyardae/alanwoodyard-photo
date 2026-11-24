import type { APIRoute } from 'astro';
import {
  ADMIN_SESSION_COOKIE,
  adminSessionClearOptions,
} from '../../../lib/admin-session';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  context.cookies.delete(ADMIN_SESSION_COOKIE, adminSessionClearOptions(context.url.protocol));
  return new Response(JSON.stringify({ success: true, redirect: '/admin/login/' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
