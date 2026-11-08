import fs from 'node:fs';
import path from 'node:path';

// 1. Load .env credentials
const envPath = path.resolve('.env');
const env: Record<string, string> = {};
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach((line) => {
    const eqIdx = line.indexOf('=');
    if (eqIdx > 0 && !line.trim().startsWith('#')) {
      env[line.slice(0, eqIdx).trim()] = line.slice(eqIdx + 1).trim();
    }
  });
}

interface SkuRule {
  sku: string;
  provider: 'prodigi' | 'printful' | 'printify';
  size: string;
  name: string;
  targetRetail: number;
  minMarginFloor: number;
  packagingAllowance: number;
  attributes?: Record<string, string>;
}

const CATALOG_RULES: SkuRule[] = [
  // Fine Art Paper (Hahnemühle 308gsm)
  { sku: 'GLOBAL-FAP-12x18', provider: 'prodigi', size: '12x18"', name: 'Exhibition Folio Edition', targetRetail: 125, minMarginFloor: 0.70, packagingAllowance: 4.50 },
  { sku: 'GLOBAL-FAP-16x24', provider: 'prodigi', size: '16x24"', name: 'Collector Salon Edition', targetRetail: 195, minMarginFloor: 0.75, packagingAllowance: 5.50 },
  { sku: 'GLOBAL-FAP-24x36', provider: 'prodigi', size: '24x36"', name: 'Grand Master Edition', targetRetail: 340, minMarginFloor: 0.75, packagingAllowance: 8.00 },

  // Stretched Canvas Gallery Wrap
  { sku: 'GLOBAL-CAN-20x30', provider: 'prodigi', size: '20x30"', name: 'Gallery Stretched Canvas Wrap', targetRetail: 210, minMarginFloor: 0.65, packagingAllowance: 12.00, attributes: { wrap: 'MirrorWrap' } },

  // Custom Framed Fine Art
  { sku: 'GLOBAL-CFP-16x24', provider: 'prodigi', size: '16x24"', name: 'Archival Framed Exhibition Print', targetRetail: 385, minMarginFloor: 0.65, packagingAllowance: 18.00, attributes: { color: 'black' } },
  { sku: 'GLOBAL-CFP-24x36', provider: 'prodigi', size: '24x36"', name: 'Archival Framed Grand Master', targetRetail: 650, minMarginFloor: 0.65, packagingAllowance: 28.00, attributes: { color: 'black' } },
];

async function syncProdigiQuotes(rules: SkuRule[]) {
  const apiKey = env.PRODIGI_API_KEY;
  if (!apiKey) throw new Error('Missing PRODIGI_API_KEY in .env');

  const items = rules.map((r) => ({
    sku: r.sku,
    copies: 1,
    attributes: r.attributes || undefined,
    assets: [{ printArea: 'default' }]
  }));

  const res = await fetch('https://api.prodigi.com/v4.0/Quotes', {
    method: 'POST',
    headers: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      destinationCountryCode: 'US',
      currencyCode: 'USD',
      items
    })
  });

  const data = await res.json();
  const validOutcomes = ['Created', 'CreatedWithIssues'];

  if (!res.ok || !validOutcomes.includes(data.outcome)) {
    throw new Error(`Prodigi Quote API failed (HTTP ${res.status}): ${JSON.stringify(data.failures || data, null, 2)}`);
  }

  // Find standard shipping quote (or first available)
  const standardQuote = data.quotes?.find((q: any) => q.shipmentMethod === 'Standard') || data.quotes?.[0];
  const wholesaleMap: Record<string, { cost: number; shippingEstimate: number }> = {};

  standardQuote.items.forEach((item: any) => {
    const normSku = item.sku.toUpperCase();
    const unitAmount = parseFloat(item.unitCost?.amount || item.cost || '0');
    
    // Find matching shipment cost for this item
    let itemShipCost = 15.90;
    const shipment = standardQuote.shipments?.find((s: any) => s.items?.includes(item.id));
    if (shipment) {
      itemShipCost = parseFloat(shipment.cost?.amount || '15.90') / (shipment.items?.length || 1);
    }

    wholesaleMap[normSku] = {
      cost: unitAmount,
      shippingEstimate: Math.round(itemShipCost * 100) / 100
    };
  });

  return wholesaleMap;
}

async function runSync() {
  console.log('\n========================================================================================');
  console.log('       ALANWOODYARD.PHOTO — AUTOMATED VENDOR PRICING SYNC ENGINE        ');
  console.log('========================================================================================\n');

  const prodigiRules = CATALOG_RULES.filter((r) => r.provider === 'prodigi');
  console.log(`[SYNC] Querying live wholesale quotes for ${prodigiRules.length} Prodigi SKUs...`);
  const prodigiRates = await syncProdigiQuotes(prodigiRules);

  const syncedCatalog: Record<string, any> = {};

  console.log('\nSKU                  SIZE     WHOLESALE  SHIP(EST)  RETAIL   PROFIT   MARGIN  STATUS');
  console.log('----------------------------------------------------------------------------------------');

  for (const rule of CATALOG_RULES) {
    let wholesale = 0;
    let freight = 0;
    const normKey = rule.sku.toUpperCase();

    if (rule.provider === 'prodigi' && prodigiRates[normKey]) {
      wholesale = prodigiRates[normKey].cost;
      freight = prodigiRates[normKey].shippingEstimate;
    }

    const totalCogs = wholesale + rule.packagingAllowance;
    const minRequiredRetail = Math.ceil(totalCogs / (1 - rule.minMarginFloor));
    const activeRetail = Math.max(rule.targetRetail, minRequiredRetail);
    const netProfit = activeRetail - wholesale - rule.packagingAllowance;
    const marginPct = ((netProfit / activeRetail) * 100).toFixed(1);

    const isPriceAdjusted = activeRetail > rule.targetRetail;
    const status = isPriceAdjusted ? '⚠️ ELEVATED' : '✓ HEALTHY';

    console.log(
      `${rule.sku.padEnd(20)} ` +
      `${rule.size.padEnd(8)} ` +
      `$${wholesale.toFixed(2).padStart(6)}   ` +
      `$${freight.toFixed(2).padStart(6)}   ` +
      `$${activeRetail.toFixed(2).padStart(6)} ` +
      `$${netProfit.toFixed(2).padStart(7)}  ` +
      `${marginPct.padStart(5)}%  ` +
      `${status}`
    );

    syncedCatalog[rule.sku] = {
      sku: rule.sku,
      provider: rule.provider,
      size: rule.size,
      name: rule.name,
      wholesaleCost: wholesale,
      packagingAllowance: rule.packagingAllowance,
      estimatedFreight: freight,
      retailPrice: activeRetail,
      currency: 'USD',
      marginPct: parseFloat(marginPct),
      lastSyncedAt: new Date().toISOString()
    };
  }

  const outDir = path.resolve('src/content');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const matrixPath = path.join(outDir, 'pricing-matrix.json');
  fs.writeFileSync(matrixPath, JSON.stringify(syncedCatalog, null, 2), 'utf8');

  console.log('----------------------------------------------------------------------------------------');
  console.log(`[SUCCESS] Synchronized pricing matrix written to: src/content/pricing-matrix.json\n`);
}

runSync().catch(console.error);