import type { APIRoute } from 'astro';
import {
  artworkQueueStatus,
  isKnownRatioKey,
  isRejectedCropValue,
  rejectedCropRecord,
} from '../../lib/merch-studio-shared';

export const prerender = false;

const MASTER_PASSWORD = '30S!g%zlxg&gJ2is';

type SessionKv = {
  get: (key: string) => Promise<string | null>;
  put: (key: string, value: string) => Promise<void>;
};

/** Test-only override so Node tests can exercise the KV path without Astro locals. */
let sessionKvForTests: SessionKv | undefined;

export function __setSessionKvForTests(kv: SessionKv | undefined): void {
  sessionKvForTests = kv;
}

async function getKvSession(): Promise<SessionKv | undefined> {
  if (sessionKvForTests) return sessionKvForTests;

  try {
    // @ts-ignore cloudflare:workers is provided at runtime on Workers; absent in local tsc.
    const { env } = await import('cloudflare:workers');
    const kv = (env as { SESSION?: SessionKv } | undefined)?.SESSION;
    if (kv) return kv;
  } catch {
    // Local Node and tests do not expose the Cloudflare workers binding.
  }

  return undefined;
}

function collectApprovedProducts(crops: Record<string, any>): string[] {
  const approvedSet = new Set<string>();
  for (const r of Object.keys(crops || {})) {
    const c = crops[r];
    if (!c || typeof c !== 'object' || isRejectedCropValue(c)) continue;
    if (Array.isArray(c.approved_products)) {
      c.approved_products.forEach((p: string) => approvedSet.add(p));
    }
  }
  return Array.from(approvedSet);
}

const SNAPSHOT_KEY = 'awp_merch_crops';
const LIST_KEY = 'crops:_modified_list';

function parseJsonSafe(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isCropMap(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function mapFromModifiedList(kv: {
  get: (key: string) => Promise<string | null>;
}): Promise<Record<string, unknown>> {
  let listRaw: string | null = null;
  try {
    listRaw = await kv.get(LIST_KEY);
  } catch {
    // Missing or unreadable list key: treat as empty.
    return {};
  }
  const list = parseJsonSafe(listRaw);
  const ids = Array.isArray(list)
    ? list.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];
  const results: Record<string, unknown> = {};
  for (const id of ids) {
    try {
      const stored = await kv.get(`crops:${id}`);
      const parsed = parseJsonSafe(stored);
      if (isCropMap(parsed)) results[id] = parsed;
    } catch {
      // Skip corrupt crop entries so one bad key does not fail the dump.
    }
  }
  return results;
}

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body ?? {}), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function readLocalFallback(): Promise<Record<string, unknown> | null> {
  try {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const filePath = path.resolve('data/merch-approvals.json');
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
    const parsed = JSON.parse(raw);
    return isCropMap(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export const GET: APIRoute = async () => {
  try {
    const kv = await getKvSession();
    if (kv) {
      // Prefer the full-map snapshot so machine pulls stay fast and stable.
      let snapshotRaw: string | null = null;
      try {
        snapshotRaw = await kv.get(SNAPSHOT_KEY);
      } catch {
        snapshotRaw = null;
      }
      const snapshot = parseJsonSafe(snapshotRaw);
      if (isCropMap(snapshot) && Object.keys(snapshot).length > 0) {
        return okJson(snapshot);
      }

      const fromList = await mapFromModifiedList(kv);
      if (Object.keys(fromList).length > 0) {
        try {
          await kv.put(SNAPSHOT_KEY, JSON.stringify(fromList));
        } catch {
          // Snapshot refresh is best-effort; dump still succeeds.
        }
        return okJson(fromList);
      }
    }

    const local = await readLocalFallback();
    return okJson(local || {});
  } catch {
    // On Workers there is no local disk. Missing/empty/malformed KV must
    // still return HTTP 200 JSON so machine pulls do not hard-fail.
    try {
      const local = await readLocalFallback();
      return okJson(local || {});
    } catch {
      return okJson({});
    }
  }
};

export const POST: APIRoute = async ({ request }) => {
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

    const isSkuAction = action === 'reject' || action === 'unreject';
    const isCropReject = action === 'reject-crop';
    const isCropRestore = action === 'restore-crop';
    const isCropAction = isCropReject || isCropRestore;
    if (!artworkId || (isCropAction && !isKnownRatioKey(ratioKey)) || (!isSkuAction && !isCropAction && (!ratioKey || !crop))) {
      return new Response(JSON.stringify({ error: 'Missing required parameters.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const decisionFields = isSkuAction
      ? { rejected: action === 'reject' }
      : isCropAction
        ? { ratioKey, cropDecision: isCropReject ? 'rejected' : 'pending' }
        : {};

    // 1. Production Edge Mode (Cloudflare KV)
    const kv = await getKvSession();
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
      } else if (isCropReject) {
        existing[ratioKey] = rejectedCropRecord(new Date().toISOString());
      } else if (isCropRestore) {
        delete existing[ratioKey];
      } else {
        existing[ratioKey] = crop;
        delete existing.__rejected;
      }

      await kv.put(key, JSON.stringify(existing));

      let modifiedArtworks: string[] = [];
      const storedList = await kv.get(LIST_KEY);
      if (storedList) {
        try { modifiedArtworks = JSON.parse(storedList); } catch {}
      }
      if (!modifiedArtworks.includes(artworkId)) {
        modifiedArtworks.push(artworkId);
        await kv.put(LIST_KEY, JSON.stringify(modifiedArtworks));
      }

      // Keep awp_merch_crops in sync so GET dumps stay non-500 and pullable.
      try {
        const snapshotRaw = await kv.get(SNAPSHOT_KEY);
        const snapshot = parseJsonSafe(snapshotRaw);
        const map = isCropMap(snapshot) ? { ...snapshot } : {};
        map[artworkId] = existing;
        await kv.put(SNAPSHOT_KEY, JSON.stringify(map));
      } catch {
        // Snapshot sync is best-effort.
      }

      return new Response(
        JSON.stringify({
          success: true,
          mode: 'cloudflare-kv',
          ...decisionFields,
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
            item.crops = item.crops || {};
            if (isSkuAction) {
              item.rejected = action === 'reject';
            } else if (isCropReject) {
              item.crops[ratioKey] = rejectedCropRecord(new Date().toISOString());
              item.approved = collectApprovedProducts(item.crops);
            } else if (isCropRestore) {
              delete item.crops[ratioKey];
              item.approved = collectApprovedProducts(item.crops);
            } else {
              item.crops[ratioKey] = crop;
              item.rejected = false;
              delete item.crops.__rejected;
              item.approved = collectApprovedProducts(item.crops);
            }
            item.status = artworkQueueStatus({ rejected: Boolean(item.rejected), crops: item.crops });
            fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2) + '\n', 'utf8');
            return new Response(
              JSON.stringify({
                success: true,
                mode: 'local-disk',
                ...decisionFields,
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
          data.merch_crops = data.merch_crops || {};
          if (isSkuAction) {
            if (action === 'reject') {
              data.merch_rejected = true;
            } else {
              delete data.merch_rejected;
            }
          } else if (isCropReject) {
            data.merch_crops[ratioKey] = rejectedCropRecord(new Date().toISOString());
            data.merch_approved = collectApprovedProducts(data.merch_crops);
          } else if (isCropRestore) {
            delete data.merch_crops[ratioKey];
            data.merch_approved = collectApprovedProducts(data.merch_crops);
          } else {
            data.merch_crops[ratioKey] = crop;
            delete data.merch_rejected;
            data.merch_approved = collectApprovedProducts(data.merch_crops);
          }
          fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');

          return new Response(
            JSON.stringify({
              success: true,
              mode: 'local-disk',
              ...decisionFields,
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
        ...decisionFields,
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
