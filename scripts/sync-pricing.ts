import fs from 'node:fs';
import path from 'node:path';

interface SkuDefinition {
  sku: string;
  category: string;
  size: string;
  retail: number;
  mockWholesale: number;
  mockShipEst: number;
}

const PRODIGI_CATALOG: SkuDefinition[] = [
  // Fine Art Papers (Hahnemühle Photo Rag 308gsm)
  { sku: 'GLOBAL-FAP-8x10', category: 'Fine Art Paper', size: '8x10"', retail: 75.00, mockWholesale: 8.50, mockShipEst: 4.80 },
  { sku: 'GLOBAL-FAP-11x14', category: 'Fine Art Paper', size: '11x14"', retail: 95.00, mockWholesale: 11.00, mockShipEst: 4.80 },
  { sku: 'GLOBAL-FAP-12x18', category: 'Fine Art Paper', size: '12x18"', retail: 125.00, mockWholesale: 14.00, mockShipEst: 5.30 },
  { sku: 'GLOBAL-FAP-16x20', category: 'Fine Art Paper', size: '16x20"', retail: 165.00, mockWholesale: 15.00, mockShipEst: 5.30 },
  { sku: 'GLOBAL-FAP-16x24', category: 'Fine Art Paper', size: '16x24"', retail: 195.00, mockWholesale: 15.00, mockShipEst: 5.30 },
  { sku: 'GLOBAL-FAP-20x30', category: 'Fine Art Paper', size: '20x30"', retail: 265.00, mockWholesale: 18.50, mockShipEst: 5.30 },
  { sku: 'GLOBAL-FAP-24x36', category: 'Fine Art Paper', size: '24x36"', retail: 340.00, mockWholesale: 22.00, mockShipEst: 5.30 },
  { sku: 'GLOBAL-FAP-30x40', category: 'Fine Art Paper', size: '30x40"', retail: 480.00, mockWholesale: 34.00, mockShipEst: 8.50 },

  // Matted Shadowbox Gallery Frames
  { sku: 'GLOBAL-CFP-8x10', category: 'Framed Print', size: '8x10"', retail: 145.00, mockWholesale: 28.00, mockShipEst: 12.50 },
  { sku: 'GLOBAL-CFP-11x14', category: 'Framed Print', size: '11x14"', retail: 185.00, mockWholesale: 34.00, mockShipEst: 14.50 },
  { sku: 'GLOBAL-CFP-16x20', category: 'Framed Print', size: '16x20"', retail: 220.00, mockWholesale: 42.00, mockShipEst: 18.50 },
  { sku: 'GLOBAL-CFP-16x24', category: 'Framed Print', size: '16x24"', retail: 385.00, mockWholesale: 50.00, mockShipEst: 23.28 },
  { sku: 'GLOBAL-CFP-20x30', category: 'Framed Print', size: '20x30"', retail: 495.00, mockWholesale: 68.00, mockShipEst: 23.28 },
  { sku: 'GLOBAL-CFP-24x36', category: 'Framed Print', size: '24x36"', retail: 650.00, mockWholesale: 80.00, mockShipEst: 23.28 },

  // Stretched Museum Canvases & Floater Frames
  { sku: 'GLOBAL-CAN-12x12', category: 'Canvas Wrap', size: '12x12"', retail: 135.00, mockWholesale: 26.00, mockShipEst: 14.00 },
  { sku: 'GLOBAL-CAN-16x20', category: 'Canvas Wrap', size: '16x20"', retail: 165.00, mockWholesale: 36.00, mockShipEst: 18.00 },
  { sku: 'GLOBAL-CAN-16x24', category: 'Canvas Wrap', size: '16x24"', retail: 195.00, mockWholesale: 42.00, mockShipEst: 22.00 },
  { sku: 'GLOBAL-CAN-20x30', category: 'Canvas Wrap', size: '20x30"', retail: 260.00, mockWholesale: 50.00, mockShipEst: 32.35 },
  { sku: 'GLOBAL-CAN-24x36', category: 'Canvas Wrap', size: '24x36"', retail: 340.00, mockWholesale: 64.00, mockShipEst: 34.00 },

  // Float-Mount Optical Acrylic Panels (1/4" diamond polished)
  { sku: 'GLOBAL-ACR-12x18', category: 'Acrylic Float', size: '12x18"', retail: 285.00, mockWholesale: 54.00, mockShipEst: 22.00 },
  { sku: 'GLOBAL-ACR-16x24', category: 'Acrylic Float', size: '16x24"', retail: 420.00, mockWholesale: 78.00, mockShipEst: 28.00 },
  { sku: 'GLOBAL-ACR-20x30', category: 'Acrylic Float', size: '20x30"', retail: 580.00, mockWholesale: 105.00, mockShipEst: 34.00 },
  { sku: 'GLOBAL-ACR-24x36', category: 'Acrylic Float', size: '24x36"', retail: 750.00, mockWholesale: 135.00, mockShipEst: 38.00 },

  // Direct-to-Aluminum Brushed Metal Panels
  { sku: 'GLOBAL-MET-12x18', category: 'Metal Print', size: '12x18"', retail: 220.00, mockWholesale: 44.00, mockShipEst: 16.00 },
  { sku: 'GLOBAL-MET-16x24', category: 'Metal Print', size: '16x24"', retail: 340.00, mockWholesale: 62.00, mockShipEst: 22.00 },
  { sku: 'GLOBAL-MET-20x30', category: 'Metal Print', size: '20x30"', retail: 460.00, mockWholesale: 82.00, mockShipEst: 26.00 },
  { sku: 'GLOBAL-MET-24x36', category: 'Metal Print', size: '24x36"', retail: 580.00, mockWholesale: 105.00, mockShipEst: 32.00 },

  // Tabletop Acrylic Blocks & Stationery
  { sku: 'GLOBAL-BLK-4x4', category: 'Desk Block', size: '4x4"', retail: 38.00, mockWholesale: 11.50, mockShipEst: 4.80 },
  { sku: 'GLOBAL-BLK-6x6', category: 'Desk Block', size: '6x6"', retail: 52.00, mockWholesale: 16.00, mockShipEst: 5.50 },
  { sku: 'GLOBAL-BLK-8x4', category: 'Desk Block', size: '8x4"', retail: 56.00, mockWholesale: 17.50, mockShipEst: 5.50 },
  { sku: 'GLOBAL-POST-5x7', category: 'Stationery', size: '5x7" (10-Pk)', retail: 34.00, mockWholesale: 8.00, mockShipEst: 4.50 },
  { sku: 'GLOBAL-MUG-11oz', category: 'Drinkware', size: '11oz', retail: 22.00, mockWholesale: 6.50, mockShipEst: 5.50 }
];

console.log('\n========================================================================================');
console.log('       ALANWOODYARD.PHOTO: AUTOMATED VENDOR PRICING SYNC ENGINE (PRODIGI)');
console.log('========================================================================================\n');
console.log(`[SYNC] Synchronizing pricing and margin health for ${PRODIGI_CATALOG.length} Prodigi SKUs...\n`);

console.log('SKU                   SIZE       WHOLESALE  SHIP(EST)  RETAIL     PROFIT     MARGIN   STATUS');
console.log('----------------------------------------------------------------------------------------');

const matrixOutput: Record<string, any> = {};

for (const item of PRODIGI_CATALOG) {
  const totalCost = item.mockWholesale + item.mockShipEst;
  const profit = item.retail - totalCost;
  const marginPct = (profit / item.retail) * 100;
  const isHealthy = marginPct >= 65.0;

  console.log(
    `${item.sku.padEnd(21)} ` +
    `${item.size.padEnd(10)} ` +
    `$ ${item.mockWholesale.toFixed(2).padStart(6)}   ` +
    `$ ${item.mockShipEst.toFixed(2).padStart(5)}   ` +
    `$${item.retail.toFixed(2).padStart(7)} ` +
    `$ ${profit.toFixed(2).padStart(7)}   ` +
    `${marginPct.toFixed(1)}%   ` +
    `${isHealthy ? '✓ HEALTHY' : '⚠️ LOW MARGIN'}`
  );

  matrixOutput[item.sku] = {
    category: item.category,
    size: item.size,
    wholesale: item.mockWholesale,
    shippingEst: item.mockShipEst,
    retail: item.retail,
    profit: Math.round(profit * 100) / 100,
    marginPct: Math.round(marginPct * 10) / 10,
    vendor: 'Prodigi'
  };
}

console.log('----------------------------------------------------------------------------------------');

const outPath = path.resolve('src/content/pricing-matrix.json');
fs.writeFileSync(outPath, JSON.stringify(matrixOutput, null, 2), 'utf-8');
console.log(`[SUCCESS] Synchronized pricing matrix written to: src/content/pricing-matrix.json\n`);