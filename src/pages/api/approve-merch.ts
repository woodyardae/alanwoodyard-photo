import type { APIRoute } from 'astro';

export const prerender = false;

const MASTER_PASSWORD = '30S!g%zlxg&gJ2is';

async function getKvSession(locals: any): Promise<any> {
  const runtime = locals?.runtime;
  let kv = runtime?.env?.SESSION;
  if (!kv) {
    try {
      // @ts-ignore
      const cfWorkers = await import('cloudflare:workers');
      kv = (cfWorkers as any)?.env?.SESSION;
    } catch {
      // Not in cloudflare worker environment
    }
  }
  return kv;
}

function collectApprovedProducts(crops: Record<string, any>): string[] {
  const approvedSet = new Set<string>();
  for (const r of Object.keys(crops || {})) {
    const c = crops[r];
    if (c && typeof c === 'object' && Array.isArray(c.approved_products)) {
      c.approved_products.forEach((p: string) => approvedSet.add(p));
    }
  }
  return Array.from(approvedSet);
}

export const GET: APIRoute = async ({ locals }) => {
  try {
    const kv = await getKvSession(locals);
    if (kv) {
      const listRaw = await kv.get('crops:_modified_list');
      const list = JSON.parse(listRaw || '[]');
      const results: Record<string, any> = {};
      for (const id of list) {
        const stored = await kv.get(`crops:${id}`);
        if (stored) results[id] = JSON.parse(stored);
      }
      return new Response(JSON.stringify(results), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({}), {
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

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const body = await request.json();
    const { artworkId, ratioKey, crop, authToken, action, store } = body;

    // Enforce master password on edge writes
    if ((authToken || '').trim() !== MASTER_PASSWORD) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid master password.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const isRejectAction = action === 'reject' || action === 'unreject';
    if (!artworkId || (!isRejectAction && (!ratioKey || !crop))) {
      return new Response(JSON.stringify({ error: 'Missing required parameters.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 1. Production Edge Mode (Cloudflare KV)
    const kv = await getKvSession(locals);
    if (kv) {
      const key = `crops:${artworkId}`;
      let existing: Record<string, any> = {};
      const stored = await kv.get(key);
      if (stored) {
        try { existing = JSON.parse(stored); } catch {}
      }

      if (action === 'reject') {
        existing.__rejected = true;
      } else if (action === 'unreject') {
        delete existing.__rejected;
      } else {
        existing[ratioKey] = crop;
        delete existing.__rejected;
      }

      await kv.put(key, JSON.stringify(existing));

      let modifiedArtworks: string[] = [];
      const storedList = await kv.get('crops:_modified_list');
      if (storedList) {
        try { modifiedArtworks = JSON.parse(storedList); } catch {}
      }
      if (!modifiedArtworks.includes(artworkId)) {
        modifiedArtworks.push(artworkId);
        await kv.put('crops:_modified_list', JSON.stringify(modifiedArtworks));
      }

      return new Response(
        JSON.stringify({
          success: true,
          mode: 'cloudflare-kv',
          ...(isRejectAction ? { rejected: action === 'reject' } : {}),
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // 2. Local Node Mode (Disk Persistence Fallback)
    try {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const isSws = store === 'sws' || String(artworkId).startsWith('sws-');

      if (isSws) {
        const queuePath = path.resolve('src/data/sws-queue.json');
        if (fs.existsSync && fs.existsSync(queuePath)) {
          const raw = fs.readFileSync(queuePath, 'utf8').replace(/^\uFEFF/, '');
          const queue = JSON.parse(raw);
          const item = Array.isArray(queue) ? queue.find((x: any) => x.id === artworkId) : null;
          if (item) {
            if (isRejectAction) {
              item.rejected = action === 'reject';
              item.status = item.rejected
                ? 'rejected'
                : Object.keys(item.crops || {}).length > 0 || (item.approved || []).length > 0
                ? 'approved'
                : 'needs_review';
            } else {
              item.crops = item.crops || {};
              item.crops[ratioKey] = crop;
              item.rejected = false;
              item.approved = collectApprovedProducts(item.crops);
              item.status = 'approved';
            }
            fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2) + '\n', 'utf8');
            return new Response(
              JSON.stringify({
                success: true,
                mode: 'local-disk',
                ...(isRejectAction ? { rejected: item.rejected } : {}),
              }),
              {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              }
            );
          }
        }
      } else {
        const filePath = path.resolve('src/content/artworks', `${artworkId}.json`);
        if (fs.existsSync && fs.existsSync(filePath)) {
          const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
          const data = JSON.parse(raw);
          if (isRejectAction) {
            if (action === 'reject') {
              data.merch_rejected = true;
            } else {
              delete data.merch_rejected;
            }
          } else {
            data.merch_crops = data.merch_crops || {};
            data.merch_crops[ratioKey] = crop;
            delete data.merch_rejected;
            data.merch_approved = collectApprovedProducts(data.merch_crops);
          }
          fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');

          return new Response(
            JSON.stringify({
              success: true,
              mode: 'local-disk',
              ...(isRejectAction ? { rejected: action === 'reject' } : {}),
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }
      }
    } catch {
      // In edge environments without filesystem access, continue to noop
    }

    return new Response(
      JSON.stringify({
        success: true,
        mode: 'noop',
        ...(isRejectAction ? { rejected: action === 'reject' } : {}),
      }),
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
