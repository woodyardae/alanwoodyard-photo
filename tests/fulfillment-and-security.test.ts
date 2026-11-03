import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateSplitCartShipping,
  generateExternalOrderId,
  routeOrder,
  type OrderItem,
  type FulfillmentOrder
} from '../src/lib/fulfillment';
import { validateCartItems, type CatalogArtwork } from '../src/lib/security';
import { calculatePrintDimensions } from '../scripts/preflight-prints';

test('calculatePrintDimensions enforces 300 DPI for paper and 180 DPI for metal', () => {
  const dims = calculatePrintDimensions(6000, 4000);
  assert.equal(dims.maxPaperWidthInches, 20);
  assert.equal(dims.maxPaperHeightInches, 13.33);
  assert.equal(dims.maxMetalWidthInches, 33.33);
  assert.equal(dims.maxMetalHeightInches, 22.22);
});

test('calculateSplitCartShipping calculates discrete parcels across multiple labs to prevent subsidization', () => {
  const items: OrderItem[] = [
    {
      id: 'item-1',
      sku: 'AWP-AUSTIN-HAG-1624',
      artworkId: 'austin-skyline-rowing-dawn',
      artworkTitle: 'Dawn Shell on Lady Bird Lake',
      substrate: 'hahnemuhle-rag',
      size: '16x24',
      quantity: 1,
      unitPriceCents: 12500,
      lab: 'prodigi',
      supplierSku: 'prodigi:GLOBAL-FAP-16x24',
      printAssetUrl: '/images/artworks/austin-skyline-rowing-dawn.webp'
    },
    {
      id: 'item-2',
      sku: 'AWP-AUSTIN-FRM-1624',
      artworkId: 'austin-skyline-rowing-dawn',
      artworkTitle: 'Dawn Shell on Lady Bird Lake',
      substrate: 'framed-print',
      size: '16x24',
      quantity: 1,
      unitPriceCents: 14500,
      lab: 'printify',
      supplierSku: 'printify:FRAMED-POSTER-1624',
      printAssetUrl: '/images/artworks/austin-skyline-rowing-dawn.webp'
    },
    {
      id: 'item-3',
      sku: 'AWP-CHESAP-CNV-1624',
      artworkId: 'chesapeake-skipjack-twilight',
      artworkTitle: 'Chesapeake Skipjack at Low Mist',
      substrate: 'stretched-canvas',
      size: '16x24',
      quantity: 1,
      unitPriceCents: 13500,
      lab: 'printful',
      supplierSku: 'printful:CANVAS-WRAP-1624',
      printAssetUrl: '/images/artworks/chesapeake-skipjack-twilight.webp'
    }
  ];

  const result = calculateSplitCartShipping(items, 'US');

  assert.equal(result.isMultiVendor, true);
  assert.equal(result.vendorCount, 3);
  assert.equal(result.parcels.length, 3);

  // Check discrete parcels
  const prodigiParcel = result.parcels.find((p) => p.lab === 'prodigi');
  const printifyParcel = result.parcels.find((p) => p.lab === 'printify');
  const printfulParcel = result.parcels.find((p) => p.lab === 'printful');

  assert.ok(prodigiParcel);
  assert.ok(printifyParcel);
  assert.ok(printfulParcel);

  assert.equal(prodigiParcel.totalShippingCents, 1250);
  assert.equal(printifyParcel.totalShippingCents, 750);
  assert.equal(printfulParcel.totalShippingCents, 850);

  // Total shipping must equal sum of discrete parcels
  assert.equal(result.totalShippingCents, 1250 + 750 + 850);
});

test('generateExternalOrderId produces deterministic SHA-256 tokens', async () => {
  const sessionId = 'cs_test_session_12345';
  const id1 = await generateExternalOrderId(sessionId, 'prodigi');
  const id2 = await generateExternalOrderId(sessionId, 'prodigi');
  const idPfy = await generateExternalOrderId(sessionId, 'printify');

  assert.equal(id1, id2);
  assert.match(id1, /^awp_prd_/);
  assert.match(idPfy, /^awp_pfy_/);
  assert.notEqual(id1, idPfy);
});

test('routeOrder routes multi-lab order with mocked fallback', async () => {
  const order: FulfillmentOrder = {
    sessionId: 'cs_test_multi_lab_123',
    orderNumber: 'AWP-TEST1234',
    recipient: {
      name: 'Jane Doe',
      email: 'jane@example.com',
      address1: '123 Main St',
      city: 'Austin',
      state: 'TX',
      postalCode: '78701',
      countryCode: 'US'
    },
    items: [
      {
        id: '1',
        sku: 'AWP-AUSTIN-HAG-1624',
        artworkId: 'austin-skyline-rowing-dawn',
        artworkTitle: 'Dawn Shell',
        substrate: 'hahnemuhle-rag',
        size: '16x24',
        quantity: 1,
        unitPriceCents: 12500,
        lab: 'prodigi',
        supplierSku: 'prodigi:GLOBAL-FAP-16x24',
        printAssetUrl: 'https://alanwoodyard.photo/images/artworks/austin.webp'
      },
      {
        id: '2',
        sku: 'AWP-AUSTIN-DSK-3515',
        artworkId: 'austin-skyline-rowing-dawn',
        artworkTitle: 'Dawn Shell Desk Mat',
        substrate: 'desk-mat',
        size: '35.4x15.7',
        quantity: 1,
        unitPriceCents: 4200,
        lab: 'printify',
        supplierSku: 'printify:DESK-MAT-900400',
        printAssetUrl: 'https://alanwoodyard.photo/images/artworks/austin.webp'
      }
    ]
  };

  const result = await routeOrder(order, { ALLOW_MOCK_DISPATCH: '1' });
  assert.equal(result.success, true);
  assert.equal(result.totalParcels, 2);
  assert.equal(result.parcels[0].status, 'mocked');
  assert.equal(result.parcels[1].status, 'mocked');
});

test('validateCartItems prevents price manipulation and verifies catalog bounds', () => {
  const mockCatalog: CatalogArtwork[] = [
    {
      id: 'art-001',
      slug: 'austin-dawn',
      title: 'Dawn Shell',
      previewImage: '/preview.webp',
      variants: [
        {
          sku: 'AWP-AUSTIN-HAG-1624',
          substrate: 'hahnemuhle-rag',
          substrateName: 'Hahnemühle Rag',
          size: '16x24',
          lab: 'prodigi',
          supplierSku: 'prodigi:GLOBAL-FAP-16x24',
          baseCostUsd: 34,
          retailPriceUsd: 125
        }
      ]
    }
  ];

  // Tampered client price injection is ignored, server authority enforces retailPriceUsd: 125
  const valid = validateCartItems(
    [
      {
        artworkId: 'art-001',
        variantSku: 'AWP-AUSTIN-HAG-1624',
        quantity: 2
      }
    ],
    mockCatalog
  );

  assert.equal(valid.valid, true);
  assert.equal(valid.items[0].unitAmountCents, 12500);
  assert.equal(valid.subtotalCents, 25000);

  // Invalid quantity bounds
  const badQty = validateCartItems(
    [
      {
        artworkId: 'art-001',
        variantSku: 'AWP-AUSTIN-HAG-1624',
        quantity: 0
      }
    ],
    mockCatalog
  );
  assert.equal(badQty.valid, false);

  // Invalid SKU
  const badSku = validateCartItems(
    [
      {
        artworkId: 'art-001',
        variantSku: 'INVALID-SKU',
        quantity: 1
      }
    ],
    mockCatalog
  );
  assert.equal(badSku.valid, false);
});
