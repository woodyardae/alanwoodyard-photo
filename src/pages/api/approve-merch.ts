import type { APIRoute } from 'astro';
// @ts-ignore
import { env } from 'cloudflare:workers';

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const sessionKv = (env as any)?.SESSION;
    if (!sessionKv) {
      return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const raw = await sessionKv.get('awp_merch_crops');
    const data = raw ? JSON.parse(raw) : {};

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { id, product, crop, watermark } = body;

    const sessionKv = (env as any)?.SESSION;
    if (!sessionKv) {
      return new Response(JSON.stringify({ error: 'Cloudflare KV (SESSION) binding unavailable' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const raw = await sessionKv.get('awp_merch_crops');
    let data: Record<string, any> = raw ? JSON.parse(raw) : {};

    if (!data[id]) {
      data[id] = {};
    }

    data[id][product] = {
      crop,
      watermark,
      approvedAt: new Date().toISOString(),
    };

    await sessionKv.put('awp_merch_crops', JSON.stringify(data, null, 2));

    return new Response(JSON.stringify({ success: true, count: Object.keys(data).length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};