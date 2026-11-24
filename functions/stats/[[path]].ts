import { proxyUmamiScript, proxyUmamiSend } from '../../src/lib/stats-proxy';

export async function onRequestGet(context: { request: Request }) {
  const pathname = new URL(context.request.url).pathname;
  if (pathname === '/stats/script.js') {
    return proxyUmamiScript(context.request);
  }
  return new Response('Not found', { status: 404 });
}

export async function onRequestPost(context: { request: Request }) {
  const pathname = new URL(context.request.url).pathname;
  if (pathname === '/stats/api/send' || pathname === '/stats/send') {
    return proxyUmamiSend(context.request);
  }
  return new Response('Not found', { status: 404 });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers':
        'Content-Type, x-umami-website-id, x-umami-hostname, x-umami-cache',
    },
  });
}
