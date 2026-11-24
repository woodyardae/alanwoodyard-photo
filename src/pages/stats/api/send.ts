import type { APIRoute } from 'astro';
import { proxyUmamiSend } from '../../../lib/stats-proxy';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => proxyUmamiSend(request);

export const OPTIONS: APIRoute = async () =>
  new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers':
        'Content-Type, x-umami-website-id, x-umami-hostname, x-umami-cache',
    },
  });
