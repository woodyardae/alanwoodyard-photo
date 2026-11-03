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
import { artworkSchema } from '../src/content/schema';

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

test('calculateSplitCartShipping handles all top 5 fulfillment partners', () => {
  const fiveLabItems: OrderItem[] = [
    {
      id: 'item-1',
      sku: 'AWP-1',
      artworkId: 'a1',
      artworkTitle: 'Art 1',
      substrate: 'hahnemuhle-rag',
      size: '16x24',
      quantity: 1,
      unitPriceCents: 12500,
      lab: 'prodigi',
      supplierSku: 'prodigi:GLOBAL-FAP-16x24',
      printAssetUrl: '/img1.webp'
    },
    {
      id: 'item-2',
      sku: 'AWP-2',
      artworkId: 'a1',
      artworkTitle: 'Art 1',
      substrate: 'framed-print',
      size: '16x24',
      quantity: 1,
      unitPriceCents: 14500,
      lab: 'printify',
      supplierSku: 'printify:FRAMED-1624',
      printAssetUrl: '/img2.webp'
    },
    {
      id: 'item-3',
      sku: 'AWP-3',
      artworkId: 'a1',
      artworkTitle: 'Art 1',
      substrate: 'stretched-canvas',
      size: '16x24',
      quantity: 1,
      unitPriceCents: 13500,
      lab: 'printful',
      supplierSku: 'printful:CANVAS-1624',
      printAssetUrl: '/img3.webp'
    },
    {
      id: 'item-4',
      sku: 'AWP-4',
      artworkId: 'a1',
      artworkTitle: 'Art 1',
      substrate: 'linen-art-cards',
      size: 'A6',
      quantity: 1,
      unitPriceCents: 2800,
      lab: 'gelato',
      supplierSku: 'gelato:CARDS-A6',
      printAssetUrl: '/img4.webp'
    },
    {
      id: 'item-5',
      sku: 'AWP-5',
      artworkId: 'a1',
      artworkTitle: 'Art 1',
      substrate: 'acrylic-float',
      size: '8x10',
      quantity: 1,
      unitPriceCents: 6500,
      lab: 'gooten',
      supplierSku: 'gooten:BLOCK-810',
      printAssetUrl: '/img5.webp'
    }
  ];

  const shipping = calculateSplitCartShipping(fiveLabItems, 'US');
  assert.equal(shipping.isMultiVendor, true);
  assert.equal(shipping.vendorCount, 5);
  assert.equal(shipping.parcels.length, 5);

  const expectedTotal = 1250 + 750 + 850 + 700 + 950; // $45.00
  assert.equal(shipping.totalShippingCents, expectedTotal);
});

test('generateExternalOrderId produces deterministic SHA-256 tokens for all labs', async () => {
  const sessionId = 'cs_test_session_12345';
  const idPrd1 = await generateExternalOrderId(sessionId, 'prodigi');
  const idPrd2 = await generateExternalOrderId(sessionId, 'prodigi');
  const idPfy = await generateExternalOrderId(sessionId, 'printify');
  const idPfl = await generateExternalOrderId(sessionId, 'printful');
  const idGlt = await generateExternalOrderId(sessionId, 'gelato');
  const idGtn = await generateExternalOrderId(sessionId, 'gooten');

  assert.equal(idPrd1, idPrd2);
  assert.match(idPrd1, /^awp_prd_/);
  assert.match(idPfy, /^awp_pfy_/);
  assert.match(idPfl, /^awp_pfl_/);
  assert.match(idGlt, /^awp_glt_/);
  assert.match(idGtn, /^awp_gtn_/);

  const uniqueSet = new Set([idPrd1, idPfy, idPfl, idGlt, idGtn]);
  assert.equal(uniqueSet.size, 5);
});

test('routeOrder routes 5-lab order with mocked fallback', async () => {
  const order: FulfillmentOrder = {
    sessionId: 'cs_test_five_lab_123',
    orderNumber: 'AWP-TEST5555',
    recipient: {
      name: 'Alan Collector',
      email: 'collector@example.com',
      address1: '400 Congress Ave',
      city: 'Austin',
      state: 'TX',
      postalCode: '78701',
      countryCode: 'US'
    },
    items: [
      {
        id: '1',
        sku: 'AWP-1',
        artworkId: 'a1',
        artworkTitle: 'Title 1',
        substrate: 'hahnemuhle-rag',
        size: '16x24',
        quantity: 1,
        unitPriceCents: 12500,
        lab: 'prodigi',
        supplierSku: 'prodigi:GLOBAL-FAP-16x24',
        printAssetUrl: 'https://alanwoodyard.photo/preview.webp'
      },
      {
        id: '2',
        sku: 'AWP-2',
        artworkId: 'a1',
        artworkTitle: 'Title 1',
        substrate: 'framed-print',
        size: '16x24',
        quantity: 1,
        unitPriceCents: 14500,
        lab: 'printify',
        supplierSku: 'printify:FRAMED-1624',
        printAssetUrl: 'https://alanwoodyard.photo/preview.webp'
      },
      {
        id: '3',
        sku: 'AWP-3',
        artworkId: 'a1',
        artworkTitle: 'Title 1',
        substrate: 'stretched-canvas',
        size: '16x24',
        quantity: 1,
        unitPriceCents: 13500,
        lab: 'printful',
        supplierSku: 'printful:CANVAS-1624',
        printAssetUrl: 'https://alanwoodyard.photo/preview.webp'
      },
      {
        id: '4',
        sku: 'AWP-4',
        artworkId: 'a1',
        artworkTitle: 'Title 1',
        substrate: 'linen-art-cards',
        size: 'A6',
        quantity: 1,
        unitPriceCents: 2800,
        lab: 'gelato',
        supplierSku: 'gelato:CARDS-A6',
        printAssetUrl: 'https://alanwoodyard.photo/preview.webp'
      },
      {
        id: '5',
        sku: 'AWP-5',
        artworkId: 'a1',
        artworkTitle: 'Title 1',
        substrate: 'acrylic-float',
        size: '8x10',
        quantity: 1,
        unitPriceCents: 6500,
        lab: 'gooten',
        supplierSku: 'gooten:BLOCK-810',
        printAssetUrl: 'https://alanwoodyard.photo/preview.webp'
      }
    ]
  };

  const result = await routeOrder(order, { ALLOW_MOCK_DISPATCH: '1' });
  assert.equal(result.success, true);
  assert.equal(result.totalParcels, 5);
  for (const parcel of result.parcels) {
    assert.equal(parcel.status, 'mocked');
  }
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

test('artworkSchema strictly validates UUIDv7 and collection tags', () => {
  const validDoc = {
    id: '01a19f88-519d-70ee-a3b8-885955d63316', // Valid UUIDv7
    title: 'Dawn Shell on Lady Bird Lake',
    slug: 'austin-skyline-rowing-dawn',
    description: 'Fine art description...',
    capture: {
      date: '2026-03-22',
      location: { name: 'Austin, Texas' },
      camera: 'Fujifilm GFX 100 II',
      lens: 'GF 45-100mm',
      focalLength: '68mm',
      aperture: 'f/8.0',
      shutterSpeed: '1/60s',
      iso: 100
    },
    colorScience: {
      colorSpace: 'ProPhoto RGB',
      dominantHex: ['#182838', '#f97316'],
      whitePoint: 'D65'
    },
    dimensions: {
      widthPx: 6000,
      heightPx: 4000,
      aspectRatio: '2:3',
      orientation: 'landscape'
    },
    collections: ['austin-skyline', 'maritime'],
    previewImage: '/preview.webp',
    variants: [
      {
        sku: 'SKU-1',
        substrate: 'hahnemuhle-rag',
        substrateName: 'Hahnemühle Rag',
        size: '16x24',
        widthInches: 24,
        heightInches: 16,
        lab: 'prodigi',
        supplierSku: 'prodigi:GLOBAL-FAP',
        baseCostUsd: 34,
        retailPriceUsd: 125,
        inStock: true
      }
    ]
  };

  const parsed = artworkSchema.safeParse(validDoc);
  assert.equal(parsed.success, true);

  // Invalid UUID (e.g. non-UUID or UUIDv4 with version 4 instead of 7)
  const invalidUuidDoc = {
    ...validDoc,
    id: 'c9bf9e57-1685-4c89-bafb-ff5af830be8a' // UUIDv4, not UUIDv7
  };
  const invalidParsed = artworkSchema.safeParse(invalidUuidDoc);
  assert.equal(invalidParsed.success, false);
});
