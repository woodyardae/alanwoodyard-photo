import fs from 'node:fs';
import path from 'node:path';

const env = {};
const envPath = path.resolve('.env');

if (fs.existsSync(envPath)) {
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      env[key] = val;
    }
  }
}

console.log('\n==========================================================');
console.log('       ALANWOODYARD.PHOTO — PROVIDER LIVE PROBE           ');
console.log('==========================================================');
console.log(`Loaded environment keys: ${Object.keys(env).join(', ')}\n`);

async function testProdigi() {
  const apiKey = env.PRODIGI_API_KEY;
  if (!apiKey) {
    console.log('[PRODIGI] Skipped: PRODIGI_API_KEY is not defined in .env.');
    return;
  }
  
  console.log(`[PRODIGI] Testing key: ${apiKey.slice(0, 6)}...`);
  try {
    const payload = {
      destinationCountryCode: 'US',
      currencyCode: 'USD',
      items: [
        {
          sku: 'GLOBAL-FAP-16x24',
          copies: 1,
          sizing: 'fillPrintArea'
        }
      ]
    };

    const res = await fetch('https://api.prodigi.com/v4.0/Quotes', {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (res.ok && data.outcome === 'Created') {
      const quote = data.quotes?.[0];
      const itemCost = quote?.items?.[0]?.cost || 'N/A';
      const shippingCost = quote?.shippingMethods?.[0]?.cost || 'N/A';
      console.log(`[PRODIGI] ✓ Connected successfully (HTTP ${res.status})`);
      console.log(`          SKU: GLOBAL-FAP-16x24 (16x24" Fine Art Paper)`);
      console.log(`          Wholesale Base: $${itemCost} | Shipping: $${shippingCost}`);
    } else {
      console.log(`[PRODIGI] Response (HTTP ${res.status}):`, data.errorSummary || data.outcome || JSON.stringify(data));
    }
  } catch (err) {
    console.error('[PRODIGI] Connection failed:', err.message);
  }
}

async function testPrintful() {
  const token = env.PRINTFUL_API_KEY || env.PRINTFUL_API_TOKEN;
  if (!token) {
    console.log('[PRINTFUL] Skipped: No token found.');
    return;
  }

  console.log(`[PRINTFUL] Testing token: ${token.slice(0, 6)}...`);
  try {
    const res = await fetch('https://api.printful.com/stores', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (res.ok) {
      const store = data.result?.[0];
      console.log(`[PRINTFUL] ✓ Connected successfully (HTTP ${res.status})`);
      console.log(`           Store: ${store?.name} (ID: ${store?.id})`);
    } else {
      console.log(`[PRINTFUL] Response (HTTP ${res.status}):`, data.error?.message || 'Error');
    }
  } catch (err) {
    console.error('[PRINTFUL] Connection failed:', err.message);
  }
}

async function main() {
  await testProdigi();
  console.log('----------------------------------------------------------');
  await testPrintful();
  console.log('\nProbe complete.\n');
}

main().catch(console.error);