import fs from 'node:fs';
import path from 'node:path';

const env = {};
const envPath = path.resolve('.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach((line) => {
    const eqIdx = line.indexOf('=');
    if (eqIdx > 0 && !line.trim().startsWith('#')) {
      env[line.slice(0, eqIdx).trim()] = line.slice(eqIdx + 1).trim();
    }
  });
}

const SIZES = [
  { size: '12x18"', sku: 'GLOBAL-FAP-12x18', retailTarget: 125 },
  { size: '16x24"', sku: 'GLOBAL-FAP-16x24', retailTarget: 195 },
  { size: '24x36"', sku: 'GLOBAL-FAP-24x36', retailTarget: 340 },
];

async function fetchLiveQuotes() {
  const apiKey = env.PRODIGI_API_KEY;
  console.log('\n========================================================================');
  console.log('       PRODIGI FINE-ART PAPER (GLOBAL-FAP) — LIVE WHOLESALE MARGINS     ');
  console.log('========================================================================\n');

  // Quotes payload: strictly sku, copies, and printArea definition
  const items = SIZES.map((s) => ({
    sku: s.sku,
    copies: 1,
    assets: [
      {
        printArea: 'default'
      }
    ]
  }));

  const payload = {
    destinationCountryCode: 'US',
    currencyCode: 'USD',
    items
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

  if (!res.ok || data.outcome !== 'Created') {
    console.error(`[FAIL] HTTP ${res.status}:`, JSON.stringify(data, null, 2));
    return;
  }

  const primaryQuote = data.quotes?.[0];
  if (!primaryQuote) {
    console.log('No quote returned.');
    return;
  }

  console.log('SIZE      SKU               WHOLESALE   RETAIL    EST. PROFIT   MARGIN %');
  console.log('------------------------------------------------------------------------');

  primaryQuote.items.forEach((item, idx) => {
    const meta = SIZES[idx];
    const wholesale = parseFloat(item.cost);
    const profit = meta.retailTarget - wholesale;
    const marginPct = ((profit / meta.retailTarget) * 100).toFixed(1);

    console.log(
      `${meta.size.padEnd(9)} ` +
      `${item.sku.padEnd(17)} ` +
      `$${wholesale.toFixed(2).padStart(6)}     ` +
      `$${meta.retailTarget.toFixed(2).padStart(6)}    ` +
      `$${profit.toFixed(2).padStart(8)}    ` +
      `${marginPct.padStart(5)}%`
    );
  });

  console.log('\n------------------------------------------------------------------------');
  console.log('AVAILABLE CARRIER SHIPPING RATES:');
  for (const ship of (primaryQuote.shippingMethods || [])) {
    console.log(`• ${ship.name.padEnd(18)} : $${parseFloat(ship.cost).toFixed(2)} USD (${ship.carrier || 'Standard'})`);
  }
  console.log('------------------------------------------------------------------------\n');
}

fetchLiveQuotes().catch(console.error);