import type { APIRoute } from 'astro';
// @ts-ignore
import { env } from 'cloudflare:workers';

export const prerender = false;

async function signHmac(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export const POST: APIRoute = async (context) => {
  try {
    const body = await context.request.json() as { password?: string; redirect?: string };
    const { password, redirect: redirectUrl } = body;

    const adminPassword =
      (env as any)?.ADMIN_PASSWORD ||
      (import.meta.env as any)?.ADMIN_PASSWORD ||
      process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
      return new Response(JSON.stringify({ error: 'ADMIN_PASSWORD not configured on server' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!password || password !== adminPassword) {
      return new Response(JSON.stringify({ error: 'Invalid admin credentials' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const timestamp = Date.now().toString();
    const signature = await signHmac(timestamp, adminPassword);
    const token = `${timestamp}.${signature}`;

    context.cookies.set('awp_admin_session', token, {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return new Response(
      JSON.stringify({ success: true, redirect: redirectUrl || '/admin/merch-studio' }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};