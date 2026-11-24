import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateSplitCartShipping,
  generateExternalOrderId,
  normalizeStateCode,
  routeOrder,
  type DispatchedParcelResult,
  type OrderItem,
  type FulfillmentOrder
} from '../src/lib/fulfillment';
import { mapCategoryToSubstrate } from '../src/lib/checkout-catalog';
import { validateCartItems, type CatalogArtwork } from '../src/lib/security';
import { calculatePrintDimensions } from '../scripts/preflight-prints';
import { artworkSchema } from '../src/content/schema';
import { deliverOrderNotifications, type DispatchNotice } from '../src/lib/notifications';

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

test('mapCategoryToSubstrate routes Desk Block to acrylic-float (GLOBAL-BLK)', () => {
  assert.equal(mapCategoryToSubstrate('Desk Block'), 'acrylic-float');
  assert.equal(mapCategoryToSubstrate('Optical Acrylic'), 'acrylic-float');
  assert.equal(mapCategoryToSubstrate('Desk Mat'), 'desk-mat');
});

test('routeOrder dispatches GLOBAL-BLK-6x6 with a valid Prodigi v4.0 order payload', async () => {
  const order: FulfillmentOrder = {
    sessionId: 'cs_test_acrylic_blk_6x6',
    orderNumber: 'AWP-BLK6X6',
    recipient: {
      name: 'Alan Collector',
      email: 'collector@example.com',
      phone: '5125550100',
      address1: '400 Congress Ave',
      city: 'Austin',
      state: 'TX',
      postalCode: '78701',
      countryCode: 'US',
    },
    items: [
      {
        id: 'blk-1',
        sku: 'GLOBAL-BLK-6x6',
        artworkId: 'norderney-62',
        artworkTitle: 'Norderney 62',
        substrate: mapCategoryToSubstrate('Desk Block'),
        size: '6x6',
        quantity: 1,
        unitPriceCents: 5200,
        lab: 'prodigi',
        supplierSku: 'prodigi:GLOBAL-BLK-6x6',
        printAssetUrl: 'https://masters.example.test/norderney-62.jpg',
      },
    ],
  };

  assert.equal(order.items[0].substrate, 'acrylic-float');

  const previousFetch = globalThis.fetch;
  let captured: { url: string; body: Record<string, unknown> } | null = null;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const raw = typeof init?.body === 'string' ? init.body : '';
    captured = { url, body: JSON.parse(raw) as Record<string, unknown> };
    return new Response(JSON.stringify({ order: { id: 'ord_blk_6x6' } }), { status: 200 });
  };

  try {
    const result = await routeOrder(order, { PRODIGI_API_KEY: 'prodigi_test_key' });
    assert.equal(result.success, true);
    assert.equal(result.totalParcels, 1);
    assert.equal(result.parcels[0].lab, 'prodigi');
    assert.equal(result.parcels[0].status, 'dispatched');
    assert.equal(result.parcels[0].labOrderId, 'ord_blk_6x6');
    assert.ok(captured, 'expected Prodigi Orders fetch');
    assert.match(captured!.url, /api\.prodigi\.com\/v4\.0\/Orders/);
    assert.equal(captured!.body.shippingMethod, 'Standard');
    assert.equal((captured!.body.recipient as { name?: string }).name, 'Alan Collector');
    const items = captured!.body.items as Array<Record<string, unknown>>;
    assert.equal(items.length, 1);
    assert.equal(items[0].sku, 'GLOBAL-BLK-6x6');
    assert.equal(items[0].copies, 1);
    assert.equal(items[0].sizing, 'fillPrintArea');
    const assets = items[0].assets as Array<Record<string, unknown>>;
    assert.equal(assets[0].printArea, 'default');
    assert.equal(assets[0].url, 'https://masters.example.test/norderney-62.jpg');
  } finally {
    globalThis.fetch = previousFetch;
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

test('normalizeStateCode converts full US state names to 2-letter USPS codes', () => {
  assert.equal(normalizeStateCode('Texas', 'US'), 'TX');
  assert.equal(normalizeStateCode('California', 'US'), 'CA');
  assert.equal(normalizeStateCode('new york', 'US'), 'NY');
  assert.equal(normalizeStateCode('  North Carolina  ', 'US'), 'NC');
  // Already-coded values pass through unchanged (but normalized to uppercase).
  assert.equal(normalizeStateCode('tx', 'US'), 'TX');
  assert.equal(normalizeStateCode('TX', 'US'), 'TX');
  // Defaults to US when countryCode is omitted.
  assert.equal(normalizeStateCode('Texas', undefined), 'TX');
  // Non-US addresses and unmapped values pass through unchanged.
  assert.equal(normalizeStateCode('Ontario', 'CA'), 'Ontario');
  assert.equal(normalizeStateCode('Not A Real State', 'US'), 'Not A Real State');
  assert.equal(normalizeStateCode('', 'US'), '');
  assert.equal(normalizeStateCode(undefined, 'US'), '');
});

test('routeOrder recovers a previously succeeded parcel instead of redispatching it', async () => {
  const order: FulfillmentOrder = {
    sessionId: 'cs_test_recovered_parcel',
    orderNumber: 'AWP-RECOVER1',
    recipient: {
      name: 'Alan Collector',
      email: 'collector@example.com',
      address1: '400 Congress Ave',
      city: 'Austin',
      state: 'TX',
      postalCode: '78701',
      countryCode: 'US',
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
        printAssetUrl: 'https://masters.example.test/preview.tif',
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
        printAssetUrl: 'https://masters.example.test/preview.jpg',
      },
    ],
  };

  const recoveredProdigi: DispatchedParcelResult = {
    lab: 'prodigi',
    providerName: 'Prodigi Fine-Art Lab',
    status: 'dispatched',
    externalOrderId: 'awp_prd_already_sent',
    labOrderId: 'ord_already_sent',
  };

  const previousFetch = globalThis.fetch;
  let printifyCalls = 0;
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('api.printify.com')) {
      printifyCalls += 1;
      return new Response(JSON.stringify({ id: 'ord_new_printify' }), { status: 200 });
    }
    throw new Error(`unexpected fetch to ${url}`);
  };

  try {
    const result = await routeOrder(
      order,
      { PRINTIFY_API_TOKEN: 'pfy_test', PRINTIFY_SHOP_ID: '1' },
      { recoveredParcels: { prodigi: recoveredProdigi } }
    );

    assert.equal(result.success, true);
    assert.equal(result.totalParcels, 2);
    const prodigiParcel = result.parcels.find((p) => p.lab === 'prodigi');
    const printifyParcel = result.parcels.find((p) => p.lab === 'printify');
    assert.equal(prodigiParcel?.status, 'recovered_idempotent');
    assert.equal(prodigiParcel?.labOrderId, 'ord_already_sent');
    assert.equal(printifyParcel?.status, 'dispatched');
    assert.equal(printifyParcel?.labOrderId, 'ord_new_printify');
    // The recovered lab is never redispatched.
    assert.equal(printifyCalls, 1);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

function alertNotice(kind: DispatchNotice['kind'] = 'dispatch'): DispatchNotice {
  return {
    kind,
    sessionId: 'cs_test_telegram',
    customerEmail: 'collector@example.com',
    destinationCountry: 'US',
    skus: ['prodigi:rag-16x24'],
    supplierOrderIds: ['ord_1'],
    errors: kind === 'failure' ? ['Lab prodigi dispatch failed: HTTP 500'] : undefined,
  };
}

test('deliverOrderNotifications posts a Telegram alert when both bindings are set', async () => {
  let captured: { url: string; body: Record<string, unknown> } | null = null;
  const fetchImpl: typeof fetch = async (input, init) => {
    captured = {
      url: String(input),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    };
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  const result = await deliverOrderNotifications(
    { TELEGRAM_BOT_TOKEN: '123456:test-token', TELEGRAM_CHAT_ID: '4242' },
    alertNotice('failure'),
    fetchImpl
  );

  assert.equal(result.operatorSent, true);
  assert.equal(result.operatorSkipped, false);
  assert.equal(result.customerSent, false);
  assert.equal(result.error, undefined);
  const sent = captured;
  assert.ok(sent);
  assert.equal(sent.url, 'https://api.telegram.org/bot123456:test-token/sendMessage');
  assert.equal(sent.body.chat_id, '4242');
  const text = String(sent.body.text);
  assert.match(text, /Supplier dispatch failed cs_test_telegram/);
  assert.match(text, /Session: cs_test_telegram/);
  assert.match(text, /Customer email: collector@example.com/);
  assert.match(text, /Destination country: US/);
  assert.match(text, /SKUs: prodigi:rag-16x24/);
  assert.match(text, /Supplier order IDs: ord_1/);
  assert.match(text, /HTTP 500/);
});

test('deliverOrderNotifications logs a summary when Telegram bindings are unset', async () => {
  const cases: Array<Record<string, string>> = [
    {},
    { TELEGRAM_BOT_TOKEN: '123456:test-token' },
    { TELEGRAM_CHAT_ID: '4242' },
    { TELEGRAM_BOT_TOKEN: '   ', TELEGRAM_CHAT_ID: '   ' },
  ];

  for (const env of cases) {
    const logs: string[] = [];
    const originalInfo = console.info;
    const originalError = console.error;
    let fetches = 0;
    console.info = (...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    };
    console.error = () => {
      logs.push('console.error');
    };
    const fetchImpl: typeof fetch = async () => {
      fetches += 1;
      return new Response('nope', { status: 500 });
    };

    try {
      const result = await deliverOrderNotifications(env, alertNotice(), fetchImpl);
      assert.equal(result.operatorSent, false);
      assert.equal(result.operatorSkipped, true);
      assert.equal(result.customerSent, false);
      assert.equal(result.error, undefined);
      assert.equal(fetches, 0);
      const text = logs.join('\n');
      assert.match(text, /Order dispatched cs_test_telegram/);
      assert.match(text, /Session: cs_test_telegram/);
      assert.match(text, /SKUs: prodigi:rag-16x24/);
      assert.match(text, /Supplier order IDs: ord_1/);
      assert.doesNotMatch(text, /console\.error/);
      assert.doesNotMatch(text, /resend/i);
    } finally {
      console.info = originalInfo;
      console.error = originalError;
    }
  }
});
