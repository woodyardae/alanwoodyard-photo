import type { APIRoute } from 'astro';
import { proxyUmamiScript } from '../../lib/stats-proxy';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => proxyUmamiScript(request);
