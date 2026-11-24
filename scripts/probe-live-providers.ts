/**
 * Read-only provider probe for alanwoodyard.photo vs SeeWhatSticks.
 * Loads local .env / .dev.vars for both brands, compares shop/store IDs and
 * credential fingerprints, then hits quote/list endpoints only. Never creates
 * orders or charges.
 */
import fs from 'node:fs';
import path from 'node:path';
import { seeWhatSticksPortalFile } from './sws-paths';

type EnvMap = Record<string, string>;

function loadEnvFile(filePath: string, into: EnvMap): void {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in into)) into[key] = val;
  }
}

function loadBrandEnv(label: string, files: string[]): EnvMap {
  const env: EnvMap = {};
  for (const file of files) loadEnvFile(file, env);
  console.log(`[ENV] ${label}: loaded ${Object.keys(env).length} keys from ${files.filter((f) => fs.existsSync(f)).join(', ') || '(none found)'}`);
  return env;
}

function fingerprint(value: string | undefined): string {
  if (!value) return '(missing)';
  if (value.length <= 10) return `${value.slice(0, 4)}…`;
  return `${value.slice(0, 6)}…${value.slice(-4)} (len=${value.length})`;
}

function first(env: EnvMap, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function compareField(label: string, photo: string | undefined, sws: string | undefined): 'ok' | 'overlap' | 'incomplete' {
  if (!photo || !sws) {
    console.log(`[ISOLATION] ${label}: incomplete (photo=${fingerprint(photo)}, sws=${fingerprint(sws)})`);
    return 'incomplete';
  }
  if (photo === sws) {
    console.log(`[ISOLATION] ${label}: OVERLAP — both brands share the same value (${fingerprint(photo)})`);
    return 'overlap';
  }
  console.log(`[ISOLATION] ${label}: distinct (photo=${fingerprint(photo)}, sws=${fingerprint(sws)})`);
  return 'ok';
}

async function probePrintify(label: string, token: string | undefined, shopId: string | undefined): Promise<void> {
  if (!token) {
    console.log(`[PRINTIFY/${label}] Skipped: no API token.`);
    return;
  }
  console.log(`[PRINTIFY/${label}] Token ${fingerprint(token)}; configured shop ${shopId || '(none)'}`);
  try {
    const res = await fetch('https://api.printify.com/v1/shops.json', {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      console.log(`[PRINTIFY/${label}] HTTP ${res.status}: ${JSON.stringify(body)}`);
      return;
    }
    const shops = Array.isArray((body as { data?: unknown })?.data)
      ? (body as { data: Array<{ id?: number | string; title?: string }> }).data
      : Array.isArray(body)
        ? (body as Array<{ id?: number | string; title?: string }>)
        : [];
    if (shops.length === 0) {
      console.log(`[PRINTIFY/${label}] Connected (HTTP ${res.status}) but no shops returned.`);
      return;
    }
    for (const shop of shops) {
      const match = shopId && String(shop.id) === String(shopId) ? ' ← configured' : '';
      console.log(`[PRINTIFY/${label}] Shop ${shop.id} "${shop.title || ''}"${match}`);
    }
  } catch (error) {
    console.error(`[PRINTIFY/${label}] Failed:`, error instanceof Error ? error.message : error);
  }
}

async function probePrintful(label: string, token: string | undefined, storeId: string | undefined): Promise<void> {
  if (!token) {
    console.log(`[PRINTFUL/${label}] Skipped: no API token.`);
    return;
  }
  console.log(`[PRINTFUL/${label}] Token ${fingerprint(token)}; configured store ${storeId || '(none)'}`);
  try {
    const res = await fetch('https://api.printful.com/stores', {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    const body: any = await res.json().catch(() => null);
    if (!res.ok) {
      console.log(`[PRINTFUL/${label}] HTTP ${res.status}:`, body?.error?.message || JSON.stringify(body));
      return;
    }
    const stores = Array.isArray(body?.result) ? body.result : [];
    if (stores.length === 0) {
      console.log(`[PRINTFUL/${label}] Connected (HTTP ${res.status}) but no stores returned.`);
      return;
    }
    for (const store of stores) {
      const match = storeId && String(store.id) === String(storeId) ? ' ← configured' : '';
      console.log(`[PRINTFUL/${label}] Store ${store.id} "${store.name || ''}"${match}`);
    }
  } catch (error) {
    console.error(`[PRINTFUL/${label}] Failed:`, error instanceof Error ? error.message : error);
  }
}

async function probeProdigi(label: string, apiKey: string | undefined): Promise<void> {
  if (!apiKey) {
    console.log(`[PRODIGI/${label}] Skipped: no API key.`);
    return;
  }
  console.log(`[PRODIGI/${label}] Key ${fingerprint(apiKey)}`);
  try {
    const res = await fetch('https://api.prodigi.com/v4.0/Quotes', {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      // Quotes require assets[].printArea. `sizing` alone yields HTTP 400 ModelBindingFailed.
      body: JSON.stringify({
        destinationCountryCode: 'US',
        currencyCode: 'USD',
        items: [
          {
            sku: 'GLOBAL-FAP-16x24',
            copies: 1,
            assets: [{ printArea: 'default' }],
          },
          {
            sku: 'GLOBAL-BLK-6x6',
            copies: 1,
            assets: [{ printArea: 'default' }],
          },
        ],
      }),
      signal: AbortSignal.timeout(10000),
    });
    const data: any = await res.json().catch(() => null);
    if (res.ok && data?.outcome === 'Created') {
      const quote = data.quotes?.[0];
      const items = Array.isArray(quote?.items) ? quote.items : [];
      const summary = items
        .map((item: { sku?: string; cost?: string }) => `${item.sku || '?'} $${item.cost ?? 'n/a'}`)
        .join('; ');
      console.log(
        `[PRODIGI/${label}] Quote OK (HTTP ${res.status}). ${summary || 'no items'}; ship $${quote?.shippingMethods?.[0]?.cost ?? 'n/a'}`,
      );
      return;
    }
    console.log(`[PRODIGI/${label}] HTTP ${res.status}:`, data?.errorSummary || data?.outcome || JSON.stringify(data));
  } catch (error) {
    console.error(`[PRODIGI/${label}] Failed:`, error instanceof Error ? error.message : error);
  }
}

async function main(): Promise<void> {
  const photoRoot = path.resolve('.');
  const portalRoot = path.dirname(seeWhatSticksPortalFile('index.html'));

  console.log('\n==========================================================');
  console.log('  PROVIDER LIVE PROBE — account isolation (read-only)');
  console.log('==========================================================\n');

  const photoEnv = loadBrandEnv('alanwoodyard.photo', [
    path.join(photoRoot, '.env'),
    path.join(photoRoot, '.dev.vars'),
  ]);
  const swsEnv = loadBrandEnv('SeeWhatSticks', [
    path.join(portalRoot, '.env'),
    path.join(portalRoot, '.dev.vars'),
  ]);

  console.log('\n--- Credential isolation ---');
  const results = [
    compareField('PRINTIFY_SHOP_ID', first(photoEnv, 'PRINTIFY_SHOP_ID'), first(swsEnv, 'PRINTIFY_SHOP_ID')),
    compareField(
      'PRINTFUL_STORE_ID',
      first(photoEnv, 'PRINTFUL_STORE_ID'),
      first(swsEnv, 'PRINTFUL_STORE_ID'),
    ),
    compareField(
      'PRINTIFY_API_TOKEN',
      first(photoEnv, 'PRINTIFY_API_TOKEN', 'PRINTIFY_API_KEY'),
      first(swsEnv, 'PRINTIFY_API_TOKEN', 'PRINTIFY_API_KEY'),
    ),
    compareField(
      'PRINTFUL_API_TOKEN',
      first(photoEnv, 'PRINTFUL_API_TOKEN', 'PRINTFUL_API_KEY'),
      first(swsEnv, 'PRINTFUL_API_TOKEN', 'PRINTFUL_API_KEY'),
    ),
    compareField('PRODIGI_API_KEY', first(photoEnv, 'PRODIGI_API_KEY'), first(swsEnv, 'PRODIGI_API_KEY')),
    compareField(
      'STRIPE_SECRET_KEY',
      first(photoEnv, 'STRIPE_SECRET_KEY'),
      first(swsEnv, 'STRIPE_SECRET_KEY'),
    ),
  ];

  console.log('\n--- Live read-only probes (no charges) ---');
  await probePrintify(
    'photo',
    first(photoEnv, 'PRINTIFY_API_TOKEN', 'PRINTIFY_API_KEY'),
    first(photoEnv, 'PRINTIFY_SHOP_ID'),
  );
  console.log('----------------------------------------------------------');
  await probePrintify(
    'sws',
    first(swsEnv, 'PRINTIFY_API_TOKEN', 'PRINTIFY_API_KEY'),
    first(swsEnv, 'PRINTIFY_SHOP_ID'),
  );
  console.log('----------------------------------------------------------');
  await probePrintful(
    'photo',
    first(photoEnv, 'PRINTFUL_API_TOKEN', 'PRINTFUL_API_KEY'),
    first(photoEnv, 'PRINTFUL_STORE_ID'),
  );
  console.log('----------------------------------------------------------');
  await probePrintful(
    'sws',
    first(swsEnv, 'PRINTFUL_API_TOKEN', 'PRINTFUL_API_KEY'),
    first(swsEnv, 'PRINTFUL_STORE_ID'),
  );
  console.log('----------------------------------------------------------');
  await probeProdigi('photo', first(photoEnv, 'PRODIGI_API_KEY'));
  console.log('----------------------------------------------------------');
  await probeProdigi('sws', first(swsEnv, 'PRODIGI_API_KEY'));

  const overlaps = results.filter((r) => r === 'overlap').length;
  const incomplete = results.filter((r) => r === 'incomplete').length;
  console.log('\n==========================================================');
  if (overlaps > 0) {
    console.log(`RESULT: ${overlaps} shared credential(s). Brands are NOT isolated.`);
    process.exitCode = 2;
  } else if (incomplete > 0) {
    console.log(`RESULT: No shared values found among compared fields. ${incomplete} field(s) incomplete.`);
  } else {
    console.log('RESULT: Compared credentials are distinct across brands.');
  }
  console.log('Probe complete. No orders or charges were created.\n');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
