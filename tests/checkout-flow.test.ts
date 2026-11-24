import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import pricingMatrix from '../src/content/pricing-matrix.json';
import {
  buildCheckoutSessionMetadata,
  buildStripeSessionParams,
  computeCheckoutIdempotencyKey,
  createEmbeddedCheckoutSession,
  prepareCheckoutCart,
  type CheckoutCartItem,
  type PricingMatrixEntry,
} from '../src/lib/create-checkout-session';
import {
  checkoutSkuForRubricId,
  enabledStorefrontLabs,
  parseAllowedCountriesConfig,
  resolveApprovedStorefront,
  resolveMatrixSku,
} from '../src/lib/checkout-catalog';
import {
  cartFingerprint,
  createCheckoutFlightGuard,
  getOrCreateCheckoutNonce,
  identifyUnavailableCartItem,
  readStoredCartItems,
  storedCartNeedsHeal,
  type CheckoutNonceStorage,
} from '../src/lib/checkout-recovery';
import { PHOTO_RATIO_PRODUCTS, RATIO_KEYS } from '../src/lib/merch-studio-shared';
import { clearDispatchReceipts, readDispatchReceipt } from '../src/lib/dispatch-ledger';
import { handleStripeWebhook } from '../src/lib/handle-stripe-webhook';

const matrix = pricingMatrix as Record<string, PricingMatrixEntry>;
const origin = 'https://alanwoodyard.photo';
const masters = 'https://masters.example.test';
const assetConfig = { printMastersBaseUrl: masters };

function cartItem(overrides: Partial<CheckoutCartItem> = {}): CheckoutCartItem {
  return {
    id: 'norderney-62-prodigi:rag-16x24',
    sku: 'prodigi:rag-16x24',
    artworkId: 'norderney-62',
    artworkTitle: 'Norderney 62',
    variantTitle: '16x24 Fine-Art Print',
    price: 195,
    quantity: 1,
    provider: 'printful',
    packagingType: 'rigid_tube',
    ...overrides,
  };
}

test('catalog SKUs resolve to matrix USD amounts and the configured print master', () => {
  const prepared = prepareCheckoutCart([cartItem()], matrix, origin, assetConfig);
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;

  const item = prepared.orderItems[0];
  assert.equal(item.unitPriceCents, 19500);
  assert.equal(item.lab, 'prodigi');
  assert.equal(item.supplierSku, 'prodigi:GLOBAL-FAP-16x24');
  assert.equal(item.artworkId, 'norderney-62');
  assert.equal(item.printAssetUrl, `${masters}/masters/norderney-62/2-3.tif`);
  assert.equal(prepared.lines[0].productMetadata.provider, 'prodigi');
  assert.equal(prepared.lines[0].productMetadata.crop, '2-3');
  assert.equal(prepared.lines[0].productMetadata.cropRatio, '2:3');
  assert.equal(prepared.lines[0].productMetadata.artworkSlug, 'norderney-62');
  assert.equal(prepared.lines[0].productMetadata.unitAmountCents, '19500');
  assert.equal(prepared.lines[0].matrixSku, 'GLOBAL-FAP-16x24');
});

test('uncropped master requires explicit SKU approval; unapproved formats are rejected', () => {
  const unapproved = prepareCheckoutCart(
    [cartItem({ sku: 'GLOBAL-MUG-11oz', price: 22 })],
    matrix,
    origin,
    { printMastersBaseUrl: masters, artworkCrops: { 'norderney-62': {} } }
  );
  assert.equal(unapproved.ok, false);
  if (!unapproved.ok) assert.match(unapproved.error, /uncropped print master/i);

  const wrongProduct = prepareCheckoutCart(
    [cartItem({ sku: 'GLOBAL-MUG-11oz', price: 22 })],
    matrix,
    origin,
    {
      printMastersBaseUrl: masters,
      artworkCrops: {
        'norderney-62': {
          __uncropped: { approved_products: ['GLOBAL-DESK-8x10'] },
        },
      },
    }
  );
  assert.equal(wrongProduct.ok, false);
  if (!wrongProduct.ok) assert.match(wrongProduct.error, /uncropped print master/i);

  const approved = prepareCheckoutCart(
    [cartItem({ sku: 'GLOBAL-MUG-11oz', price: 22 })],
    matrix,
    origin,
    {
      printMastersBaseUrl: masters,
      artworkCrops: {
        'norderney-62': {
          __uncropped: { approved_products: ['GLOBAL-MUG-11oz'] },
        },
      },
    }
  );
  assert.equal(approved.ok, true);
  if (!approved.ok) return;
  assert.equal(approved.orderItems[0].printAssetUrl, `${masters}/masters/norderney-62.tif`);
  assert.equal(approved.lines[0].productMetadata.crop, undefined);
  assert.equal(approved.lines[0].productMetadata.cropRatio, undefined);

  const spoofedPrefix = prepareCheckoutCart(
    [cartItem({ sku: 'GLOBAL-DESK-8x10:GLOBAL-MUG-11oz', price: 22 })],
    matrix,
    origin,
    {
      printMastersBaseUrl: masters,
      artworkCrops: {
        'norderney-62': {
          __uncropped: { approved_products: ['GLOBAL-DESK-8x10'] },
        },
      },
    }
  );
  assert.equal(spoofedPrefix.ok, false);

  const wrongLabPrefix = prepareCheckoutCart(
    [cartItem({ sku: 'printful:GLOBAL-MUG-11oz', price: 22 })],
    matrix,
    origin,
    {
      printMastersBaseUrl: masters,
      artworkCrops: {
        'norderney-62': {
          __uncropped: { approved_products: ['printful:GLOBAL-MUG-11oz'] },
        },
      },
    }
  );
  assert.equal(wrongLabPrefix.ok, false);
  if (!wrongLabPrefix.ok) assert.match(wrongLabPrefix.error, /uncropped print master/i);

  const looseKey = prepareCheckoutCart(
    [cartItem({ sku: 'GLOBAL-MUG-11oz', price: 22 })],
    matrix,
    origin,
    {
      printMastersBaseUrl: masters,
      artworkCrops: {
        'norderney-62': {
          uncropped: { approved_products: ['GLOBAL-MUG-11oz'] },
        },
      },
    }
  );
  assert.equal(looseKey.ok, false);
  if (!looseKey.ok) assert.match(looseKey.error, /uncropped print master/i);
});

test('webhook rejects unapproved uncropped masters and fulfills approved ones', async () => {
  clearDispatchReceipts();
  const mug = cartItem({ sku: 'GLOBAL-MUG-11oz', price: 22 });
  const approvedCrops = {
    'norderney-62': {
      __uncropped: { approved_products: ['GLOBAL-MUG-11oz'] },
    },
  };
  const prepared = prepareCheckoutCart([mug], matrix, origin, {
    printMastersBaseUrl: masters,
    artworkCrops: approvedCrops,
  });
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  const line = prepared.lines[0];
  const amount = line.orderItem.unitPriceCents;
  const original = globalThis.fetch;
  const prodigiBodies: string[] = [];

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/line_items')) {
      return new Response(
        JSON.stringify({
          data: [
            {
              quantity: 1,
              currency: 'usd',
              price: {
                unit_amount: amount,
                currency: 'usd',
                product: { metadata: line.productMetadata },
              },
            },
          ],
        }),
        { status: 200 }
      );
    }
    if (url.includes('api.prodigi.com')) {
      prodigiBodies.push(typeof init?.body === 'string' ? init.body : '');
      return new Response(JSON.stringify({ order: { id: 'ord_uncropped_1' } }), { status: 200 });
    }
    return new Response('unexpected', { status: 500 });
  };

  try {
    const blocked = await postWebhook(
      paidEvent(amount, undefined, 'usd', 'paid', 'cs_test_uncropped_denied'),
      {
        ...webhookEnv(),
        artworkCrops: { 'norderney-62': {} },
      }
    );
    assert.equal(blocked.body.routed, false);
    assert.match(String(blocked.body.error), /uncropped print master/i);
    assert.equal(prodigiBodies.length, 0);

    const allowed = await postWebhook(
      paidEvent(amount, undefined, 'usd', 'paid', 'cs_test_uncropped_ok'),
      {
        ...webhookEnv(),
        artworkCrops: approvedCrops,
      }
    );
    assert.equal(allowed.status, 200);
    assert.equal(allowed.body.routed, true);
    assert.equal(prodigiBodies.length, 1);
    const payload = JSON.parse(prodigiBodies[0]) as { items: { assets: { url: string }[] }[] };
    assert.equal(payload.items[0].assets[0].url, `${masters}/masters/norderney-62.tif`);
  } finally {
    globalThis.fetch = original;
  }
});

test('client prices, unknown sizes, and unsafe slugs are rejected', () => {
  const tampered = prepareCheckoutCart([cartItem({ price: 1 })], matrix, origin);
  assert.equal(tampered.ok, false);

  const customSize = prepareCheckoutCart([cartItem({ sku: 'prodigi:rag-63x42', price: 185 })], matrix, origin);
  assert.equal(customSize.ok, false);

  const traversal = prepareCheckoutCart([cartItem({ artworkId: '../secrets' })], matrix, origin);
  assert.equal(traversal.ok, false);

  const direct = prepareCheckoutCart(
    [cartItem({ sku: 'GLOBAL-FAP-24x36', price: 340, artworkId: 'norderney-62' })],
    matrix,
    origin,
    assetConfig
  );
  assert.equal(direct.ok, true);
  if (direct.ok) {
    assert.equal(direct.orderItems[0].unitPriceCents, 34000);
    assert.equal(direct.orderItems[0].supplierSku, 'prodigi:GLOBAL-FAP-24x36');
  }
});

test('missing Stripe keys do not open a simulated checkout unless explicitly allowed', async () => {
  const blocked = await createEmbeddedCheckoutSession({
    items: [cartItem()],
    origin,
    stripeSecretKey: 'sk_test_placeholder',
    stripePublishableKey: 'pk_test_placeholder',
    pricingMatrix: matrix,
    printMastersBaseUrl: masters,
  });
  assert.equal(blocked.status, 503);
  assert.equal(blocked.body.simulated, undefined);

  const sandbox = await createEmbeddedCheckoutSession({
    items: [cartItem()],
    origin,
    stripeSecretKey: '',
    pricingMatrix: matrix,
    printMastersBaseUrl: masters,
    allowSimulatedCheckout: true,
  });
  assert.equal(sandbox.status, 200);
  assert.equal(sandbox.body.simulated, true);
  assert.equal(typeof sandbox.body.clientSecret, 'undefined');
});

function sign(body: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${digest}`;
}

function paidEvent(
  amount: number,
  metadataItems?: string,
  currency = 'usd',
  paymentStatus = 'paid',
  sessionId = 'cs_test_paidorder'
) {
  return {
    type: 'checkout.session.completed',
    data: {
      object: {
        id: sessionId,
        payment_status: paymentStatus,
        currency,
        amount_subtotal: amount,
        amount_total: amount,
        metadata: metadataItems ? { items: metadataItems } : { source: 'alanwoodyard.photo' },
        shipping_details: {
          name: 'Alan Collector',
          address: {
            line1: '400 Congress Ave',
            city: 'Austin',
            state: 'TX',
            postal_code: '78701',
            country: 'US',
          },
        },
        customer_details: {
          name: 'Alan Collector',
          email: 'collector@example.com',
        },
      },
    },
  };
}

test('unsigned stripe webhook POST returns HTTP 400 JSON error (fail-closed)', async () => {
  const result = await handleStripeWebhook(
    new Request(`${origin}/api/stripe-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }),
    {
      STRIPE_WEBHOOK_SECRET: 'whsec_test',
      STRIPE_SECRET_KEY: 'sk_test',
      pricingMatrix: matrix,
    }
  );

  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'Missing stripe-signature header');
  assert.equal(result.body.received, undefined);
});

test('invalid stripe-signature header returns HTTP 400 JSON error (fail-closed)', async () => {
  const result = await handleStripeWebhook(
    new Request(`${origin}/api/stripe-webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': 't=1,v1=deadbeef',
      },
      body: '{}',
    }),
    {
      STRIPE_WEBHOOK_SECRET: 'whsec_test',
      STRIPE_SECRET_KEY: 'sk_test',
      pricingMatrix: matrix,
    }
  );

  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'Invalid webhook signature');
  assert.equal(result.body.received, undefined);
});

test('blank stripe-signature header returns HTTP 400 JSON error (fail-closed)', async () => {
  const result = await handleStripeWebhook(
    new Request(`${origin}/api/stripe-webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': '   ',
      },
      body: '{}',
    }),
    {
      STRIPE_WEBHOOK_SECRET: 'whsec_test',
      STRIPE_SECRET_KEY: 'sk_test',
      pricingMatrix: matrix,
    }
  );

  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'Missing stripe-signature header');
});

test('paid webhook fulfills the print master at the catalog amount and ignores mock dispatch', async () => {
  clearDispatchReceipts();
  const prepared = prepareCheckoutCart([cartItem()], matrix, origin, assetConfig);
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;

  const line = prepared.lines[0];
  const amount = line.orderItem.unitPriceCents;
  const event = paidEvent(amount, JSON.stringify(prepared.orderItems));
  const raw = JSON.stringify(event);
  const calls: { url: string; body: string }[] = [];
  const original = globalThis.fetch;

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = typeof init?.body === 'string' ? init.body : '';
    calls.push({ url, body });
    if (url.includes('/line_items')) {
      return new Response(
        JSON.stringify({
          data: [
            {
              quantity: line.orderItem.quantity,
              amount_total: amount,
              currency: 'usd',
              price: {
                unit_amount: amount,
                currency: 'usd',
                product: {
                  name: 'Norderney 62 - 16x24 Fine-Art Print',
                  metadata: line.productMetadata,
                },
              },
            },
          ],
        }),
        { status: 200 }
      );
    }
    if (url.includes('api.prodigi.com')) {
      return new Response(JSON.stringify({ order: { id: 'ord_live_1' } }), { status: 200 });
    }
    return new Response('unexpected', { status: 500 });
  };

  try {
    const result = await handleStripeWebhook(
      new Request(`${origin}/api/stripe-webhook`, {
        method: 'POST',
        headers: { 'stripe-signature': sign(raw, 'whsec_test') },
        body: raw,
      }),
      {
        STRIPE_SECRET_KEY: 'sk_test_live_shape',
        STRIPE_WEBHOOK_SECRET: 'whsec_test',
        PRODIGI_API_KEY: 'prodigi_test',
        ALLOW_MOCK_DISPATCH: '1',
        PRINT_MASTERS_BASE_URL: masters,
        pricingMatrix: matrix,
      }
    );

    assert.equal(result.status, 200);
    assert.equal(result.body.routed, true);
    const fulfillment = result.body.fulfillment as { parcels: { status: string; labOrderId?: string }[] };
    assert.equal(fulfillment.parcels[0].status, 'dispatched');
    assert.equal(fulfillment.parcels[0].labOrderId, 'ord_live_1');

    const prodigi = calls.find((call) => call.url.includes('api.prodigi.com'));
    assert.ok(prodigi);
    const payload = JSON.parse(prodigi.body) as {
      items: { sku: string; assets: { url: string }[] }[];
    };
    assert.equal(payload.items[0].sku, 'GLOBAL-FAP-16x24');
    assert.equal(payload.items[0].assets[0].url, `${masters}/masters/norderney-62/2-3.tif`);
    assert.equal(payload.items[0].assets[0].url.includes('.webp'), false);
    assert.equal(JSON.stringify(result.body).includes('mocked'), false);
  } finally {
    globalThis.fetch = original;
  }
});

test('webhook does not fulfill unpaid, non-usd, or amount-mismatched sessions', async () => {
  clearDispatchReceipts();
  const prepared = prepareCheckoutCart([cartItem()], matrix, origin, assetConfig);
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  const amount = prepared.orderItems[0].unitPriceCents;
  const line = prepared.lines[0];
  const original = globalThis.fetch;
  let fetchCalls = 0;

  globalThis.fetch = async (input: RequestInfo | URL) => {
    fetchCalls += 1;
    const url = String(input);
    if (url.includes('/line_items')) {
      return new Response(
        JSON.stringify({
          data: [
            {
              quantity: 1,
              currency: 'usd',
              price: {
                unit_amount: amount,
                currency: 'usd',
                product: { metadata: line.productMetadata },
              },
            },
          ],
        }),
        { status: 200 }
      );
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  const env = {
    STRIPE_SECRET_KEY: 'sk_test_live_shape',
    STRIPE_WEBHOOK_SECRET: 'whsec_test',
    PRODIGI_API_KEY: 'prodigi_test',
    ALLOW_MOCK_DISPATCH: '1',
    PRINT_MASTERS_BASE_URL: masters,
    pricingMatrix: matrix,
  };

  async function post(event: unknown) {
    const raw = JSON.stringify(event);
    return handleStripeWebhook(
      new Request(`${origin}/api/stripe-webhook`, {
        method: 'POST',
        headers: { 'stripe-signature': sign(raw, 'whsec_test') },
        body: raw,
      }),
      env
    );
  }

  try {
    const unpaid = await post(paidEvent(amount, undefined, 'usd', 'unpaid'));
    assert.equal(unpaid.body.routed, false);
    assert.equal(fetchCalls, 0);

    const euros = await post(paidEvent(amount, undefined, 'eur', 'paid'));
    assert.equal(euros.body.routed, false);
    assert.match(String(euros.body.error), /usd/);
    assert.equal(fetchCalls, 0);

    const shortPaid = await post(paidEvent(100, JSON.stringify(prepared.orderItems), 'usd', 'paid', 'cs_test_amount_guard'));
    assert.equal(shortPaid.status, 200);
    assert.equal(shortPaid.body.routed, false);
    assert.match(String(shortPaid.body.error), /total/i);
  } finally {
    globalThis.fetch = original;
  }
});

test('unknown slugs and unconfigured print masters are rejected', () => {
  const unknown = prepareCheckoutCart([cartItem({ artworkId: 'unknown-print-slug' })], matrix, origin, assetConfig);
  assert.equal(unknown.ok, false);
  if (!unknown.ok) assert.match(unknown.error, /print catalog/);

  const missingMaster = prepareCheckoutCart([cartItem()], matrix, origin);
  assert.equal(missingMaster.ok, false);
  if (!missingMaster.ok) assert.match(missingMaster.error, /print master/i);

  const httpMaster = prepareCheckoutCart([cartItem()], matrix, origin, {
    printMastersBaseUrl: 'http://masters.example.test',
  });
  assert.equal(httpMaster.ok, false);

  const webpMaster = prepareCheckoutCart([cartItem()], matrix, origin, {
    printMastersBaseUrl: masters,
    printMastersExtension: 'webp',
  });
  assert.equal(webpMaster.ok, false);

  const preview = prepareCheckoutCart([cartItem()], matrix, origin, { allowCleanPreviewAssets: true });
  assert.equal(preview.ok, true);
  if (preview.ok) {
    assert.equal(preview.orderItems[0].printAssetUrl, `${origin}/images/artworks/clean/norderney-62.webp`);
  }

  const png = prepareCheckoutCart([cartItem()], matrix, origin, {
    printMastersBaseUrl: masters,
    printMastersExtension: 'png',
  });
  assert.equal(png.ok, true);
  if (png.ok) {
    assert.equal(png.orderItems[0].printAssetUrl, `${masters}/masters/norderney-62/2-3.png`);
  }
});

test('client provider cannot override the catalog vendor', () => {
  const prepared = prepareCheckoutCart([cartItem({ provider: 'printful' })], matrix, origin, assetConfig);
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  assert.equal(prepared.orderItems[0].lab, 'prodigi');
  assert.equal(prepared.lines[0].productMetadata.provider, 'prodigi');
});

test('multi-line carts omit compact metadata once it exceeds 500 characters', () => {
  const items = Array.from({ length: 4 }, (_, index) =>
    cartItem({ id: `line-${index}`, artworkTitle: `Norderney 62 print ${index}` })
  );
  const prepared = prepareCheckoutCart(items, matrix, origin, assetConfig);
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  const metadata = buildCheckoutSessionMetadata(prepared.orderItems);
  assert.ok(JSON.stringify(prepared.orderItems).length > 500);
  assert.equal(metadata.items, undefined);
  assert.equal(metadata.item_count, '4');
  assert.equal(metadata.currency, 'usd');
});

function webhookEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    STRIPE_SECRET_KEY: 'sk_test_live_shape',
    STRIPE_WEBHOOK_SECRET: 'whsec_test',
    PRODIGI_API_KEY: 'prodigi_test',
    ALLOW_MOCK_DISPATCH: '1',
    PRINT_MASTERS_BASE_URL: masters,
    pricingMatrix: matrix,
    ...overrides,
  };
}

async function postWebhook(event: unknown, env: ReturnType<typeof webhookEnv>) {
  const raw = JSON.stringify(event);
  return handleStripeWebhook(
    new Request(`${origin}/api/stripe-webhook`, {
      method: 'POST',
      headers: { 'stripe-signature': sign(raw, 'whsec_test') },
      body: raw,
    }),
    env
  );
}

test('multi-line carts fulfill when compact metadata.items is omitted', async () => {
  clearDispatchReceipts();
  const first = cartItem();
  const second = cartItem({
    id: 'norderney-61-24x36',
    sku: 'prodigi:rag-24x36',
    artworkId: 'norderney-61',
    artworkTitle: 'Norderney 61',
    variantTitle: '24x36 Fine-Art Print',
    price: 340,
  });
  const prepared = prepareCheckoutCart([first, second], matrix, origin, assetConfig);
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  const amount = prepared.orderItems.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
  const event = paidEvent(amount, undefined, 'usd', 'paid', 'cs_test_multiline');
  const calls: { url: string; body: string }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: typeof init?.body === 'string' ? init.body : '' });
    if (url.includes('/line_items')) {
      return new Response(
        JSON.stringify({
          data: prepared.lines.map((line) => ({
            quantity: line.orderItem.quantity,
            currency: 'usd',
            price: {
              unit_amount: line.orderItem.unitPriceCents,
              currency: 'usd',
              product: {
                name: line.orderItem.artworkTitle,
                metadata: line.productMetadata,
              },
            },
          })),
        }),
        { status: 200 }
      );
    }
    if (url.includes('api.prodigi.com')) {
      return new Response(JSON.stringify({ order: { id: 'ord_multi_1' } }), { status: 200 });
    }
    return new Response('unexpected', { status: 500 });
  };

  try {
    const result = await postWebhook(event, webhookEnv());
    assert.equal(result.status, 200);
    assert.equal(result.body.routed, true);
    const prodigi = calls.find((call) => call.url.includes('api.prodigi.com'));
    assert.ok(prodigi);
    const payload = JSON.parse(prodigi.body) as { items: { assets: { url: string }[] }[] };
    assert.equal(payload.items.length, 2);
    assert.deepEqual(
      payload.items.map((item) => item.assets[0].url),
      [`${masters}/masters/norderney-62/2-3.tif`, `${masters}/masters/norderney-61/2-3.tif`]
    );
  } finally {
    globalThis.fetch = original;
  }
});

test('webhook rejects unknown slugs and a provider that disagrees with the catalog', async () => {
  clearDispatchReceipts();
  const prepared = prepareCheckoutCart([cartItem()], matrix, origin, assetConfig);
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  const line = prepared.lines[0];
  const amount = line.orderItem.unitPriceCents;
  const original = globalThis.fetch;
  const prodigiCalls: string[] = [];
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('api.prodigi.com')) prodigiCalls.push(url);
    if (url.includes('/line_items')) {
      const metadata = (globalThis as { __lineMeta?: Record<string, string> }).__lineMeta || line.productMetadata;
      return new Response(
        JSON.stringify({
          data: [
            {
              quantity: 1,
              currency: 'usd',
              price: {
                unit_amount: amount,
                currency: 'usd',
                product: { metadata },
              },
            },
          ],
        }),
        { status: 200 }
      );
    }
    return new Response('unexpected', { status: 500 });
  };

  async function postWith(metadata: Record<string, string>, sessionId: string) {
    (globalThis as { __lineMeta?: Record<string, string> }).__lineMeta = metadata;
    return postWebhook(paidEvent(amount, undefined, 'usd', 'paid', sessionId), webhookEnv());
  }

  try {
    const unknown = await postWith(
      { ...line.productMetadata, artworkSlug: 'unknown-print-slug', artworkId: 'unknown-print-slug' },
      'cs_test_unknown_slug'
    );
    assert.equal(unknown.body.routed, false);
    assert.match(String(unknown.body.error), /print catalog/);

    const locked = await postWith(
      { ...line.productMetadata, provider: 'printful' },
      'cs_test_provider_lock'
    );
    assert.equal(locked.body.routed, false);
    assert.match(String(locked.body.error), /catalog vendor/);

    const wrongCrop = await postWith(
      { ...line.productMetadata, crop: '1-1', cropRatio: '1:1' },
      'cs_test_crop_lock'
    );
    assert.equal(wrongCrop.body.routed, false);
    assert.match(String(wrongCrop.body.error), /crop ratio/i);

    const wrongSize = await postWith(
      { ...line.productMetadata, size: '11oz', crop: '', cropRatio: '' },
      'cs_test_size_lock'
    );
    assert.equal(wrongSize.body.routed, false);
    assert.match(String(wrongSize.body.error), /size/i);

    const unknownRatio = await postWith(
      { ...line.productMetadata, cropRatio: '99:1' },
      'cs_test_unknown_ratio_lock'
    );
    assert.equal(unknownRatio.body.routed, false);
    assert.match(String(unknownRatio.body.error), /crop ratio/i);
    assert.equal(prodigiCalls.length, 0);
  } finally {
    delete (globalThis as { __lineMeta?: Record<string, string> }).__lineMeta;
    globalThis.fetch = original;
  }
});

test('duplicate paid webhooks dispatch the supplier once', async () => {
  clearDispatchReceipts();
  const prepared = prepareCheckoutCart([cartItem()], matrix, origin, assetConfig);
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  const line = prepared.lines[0];
  const amount = line.orderItem.unitPriceCents;
  const event = paidEvent(amount, JSON.stringify(prepared.orderItems), 'usd', 'paid', 'cs_test_duplicate');
  const logs: string[] = [];
  const originalInfo = console.info;
  const originalFetch = globalThis.fetch;
  let prodigiCalls = 0;
  console.info = (...args: unknown[]) => {
    logs.push(args.map(String).join(' '));
  };
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/line_items')) {
      return new Response(
        JSON.stringify({
          data: [
            {
              quantity: 1,
              currency: 'usd',
              price: {
                unit_amount: amount,
                currency: 'usd',
                product: { metadata: line.productMetadata },
              },
            },
          ],
        }),
        { status: 200 }
      );
    }
    if (url.includes('api.prodigi.com')) {
      prodigiCalls += 1;
      return new Response(JSON.stringify({ order: { id: 'ord_once' } }), { status: 200 });
    }
    return new Response('unexpected', { status: 500 });
  };

  try {
    const first = await postWebhook(event, webhookEnv());
    const second = await postWebhook(event, webhookEnv());
    assert.equal(first.status, 200);
    assert.equal(first.body.routed, true);
    assert.equal(second.status, 200);
    assert.equal(second.body.routed, true);
    assert.equal(second.body.duplicate, true);
    const stored = await readDispatchReceipt('cs_test_duplicate');
    assert.ok(stored);
    assert.equal(stored.notified, true);
    assert.equal(prodigiCalls, 1);
    assert.match(logs.join('\n'), /Session: cs_test_duplicate/);
    assert.match(logs.join('\n'), /Supplier order IDs: ord_once/);
    const fulfillment = second.body.fulfillment as { parcels: { labOrderId?: string }[] };
    assert.equal(fulfillment.parcels[0].labOrderId, 'ord_once');
  } finally {
    console.info = originalInfo;
    globalThis.fetch = originalFetch;
  }
});

test('supplier failure sends a Telegram alert and does not stick the receipt', async () => {
  clearDispatchReceipts();
  const prepared = prepareCheckoutCart([cartItem()], matrix, origin, assetConfig);
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  const line = prepared.lines[0];
  const amount = line.orderItem.unitPriceCents;
  const event = paidEvent(amount, undefined, 'usd', 'paid', 'cs_test_supplier_fail');
  const calls: { url: string; body: string }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: typeof init?.body === 'string' ? init.body : '' });
    if (url.includes('/line_items')) {
      return new Response(
        JSON.stringify({
          data: [
            {
              quantity: 1,
              currency: 'usd',
              price: {
                unit_amount: amount,
                currency: 'usd',
                product: { metadata: line.productMetadata },
              },
            },
          ],
        }),
        { status: 200 }
      );
    }
    if (url.includes('api.prodigi.com')) {
      return new Response('lab down', { status: 500 });
    }
    if (url.includes('api.telegram.org') && url.endsWith('/sendMessage')) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    return new Response('unexpected', { status: 500 });
  };

  try {
    const result = await postWebhook(
      event,
      webhookEnv({ TELEGRAM_BOT_TOKEN: '123456:test-token', TELEGRAM_CHAT_ID: '9001' })
    );
    assert.equal(result.status, 502);
    assert.equal(result.body.routed, false);
    assert.equal(await readDispatchReceipt('cs_test_supplier_fail'), null);
    const alert = calls.find((call) => call.url.includes('api.telegram.org') && call.url.endsWith('/sendMessage'));
    assert.ok(alert);
    assert.equal(alert.url, 'https://api.telegram.org/bot123456:test-token/sendMessage');
    const payload = JSON.parse(alert.body) as { chat_id: string; text: string };
    assert.equal(payload.chat_id, '9001');
    assert.match(payload.text, /Supplier dispatch failed cs_test_supplier_fail/);
    assert.match(payload.text, /Customer email: collector@example.com/);
    assert.match(payload.text, /Destination country: US/);
    assert.match(payload.text, /SKUs: prodigi:rag-16x24/);
  } finally {
    globalThis.fetch = original;
  }
});

test('a Telegram failure keeps the dispatch receipt for a later retry', async () => {
  clearDispatchReceipts();
  const prepared = prepareCheckoutCart([cartItem()], matrix, origin, assetConfig);
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  const line = prepared.lines[0];
  const amount = line.orderItem.unitPriceCents;
  const event = paidEvent(amount, JSON.stringify(prepared.orderItems), 'usd', 'paid', 'cs_test_telegram_retry');
  const original = globalThis.fetch;
  let prodigiCalls = 0;
  let telegramCalls = 0;
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/line_items')) {
      return new Response(
        JSON.stringify({
          data: [
            {
              quantity: 1,
              currency: 'usd',
              price: {
                unit_amount: amount,
                currency: 'usd',
                product: { metadata: line.productMetadata },
              },
            },
          ],
        }),
        { status: 200 }
      );
    }
    if (url.includes('api.prodigi.com')) {
      prodigiCalls += 1;
      return new Response(JSON.stringify({ order: { id: 'ord_retry' } }), { status: 200 });
    }
    if (url.includes('api.telegram.org') && url.endsWith('/sendMessage')) {
      telegramCalls += 1;
      return new Response('telegram down', { status: 500 });
    }
    return new Response('unexpected', { status: 500 });
  };

  try {
    const env = webhookEnv({ TELEGRAM_BOT_TOKEN: '123456:test-token', TELEGRAM_CHAT_ID: '9001' });
    const first = await postWebhook(event, env);
    assert.equal(first.status, 200);
    assert.equal(first.body.routed, true);
    assert.equal((await readDispatchReceipt('cs_test_telegram_retry'))?.notified, false);
    const second = await postWebhook(event, env);
    assert.equal(second.body.duplicate, true);
    assert.equal(prodigiCalls, 1);
    assert.ok(telegramCalls >= 2);
  } finally {
    globalThis.fetch = original;
  }
});

test('merch_approved rubric ids resolve to storefront items and checkout SKUs', () => {
  const crops = {
    '2:3': { rejected: true, rejected_at: '2026-11-23T00:00:00.000Z' },
  };
  const resolved = resolveApprovedStorefront(
    [
      'printify-deskmat-std',
      'prodigi-mug-11oz',
      'printify-coasters-4pk',
      'printify-puzzle-500',
      'prodigi-rag-16x24',
      'prodigi-rag-12x18',
      'prodigi-rag-8x10',
      'not-a-rubric-id',
    ],
    {
      matrix,
      crops,
      listedPaperSizes: ['16x24"'],
      listedPaperSkus: ['prodigi:rag-16x24'],
    }
  );

  const goods = new Map(resolved.goods.map((item) => [item.productId, item]));
  const desk = goods.get('printify-deskmat-std');
  const mug = goods.get('prodigi-mug-11oz');
  const coasters = goods.get('printify-coasters-4pk');
  const puzzle = goods.get('printify-puzzle-500');

  assert.ok(desk);
  assert.equal(desk?.title, 'Studio Panoramic Desk Mat (31.5x15.5")');
  assert.equal(desk?.sku, 'PFY-DESKMAT-STD');
  assert.equal(desk?.provider, 'printify');
  assert.equal(desk?.vendor, 'Printify');
  assert.equal(desk?.packaging, 'poly_mailer');
  assert.equal(desk?.price, 48);
  assert.equal(resolveMatrixSku(desk?.sku || '', matrix), 'PFY-DESKMAT-STD');

  assert.ok(mug);
  assert.equal(mug?.sku, 'GLOBAL-MUG-11oz');
  assert.equal(mug?.provider, 'prodigi');
  assert.equal(mug?.packaging, 'corrugated_box');
  assert.equal(mug?.price, 22);
  assert.equal(resolveMatrixSku(mug?.sku || '', matrix), 'GLOBAL-MUG-11oz');

  assert.ok(coasters);
  assert.equal(coasters?.sku, 'PFY-COASTERS-4PK');
  assert.equal(coasters?.provider, 'printify');
  assert.equal(coasters?.packaging, 'corrugated_box');
  assert.equal(coasters?.price, 32);
  assert.equal(resolveMatrixSku(coasters?.sku || '', matrix), 'PFY-COASTERS-4PK');

  assert.ok(puzzle);
  assert.equal(puzzle?.sku, 'PFY-PUZZLE-500');
  assert.equal(puzzle?.provider, 'printify');
  assert.equal(puzzle?.packaging, 'corrugated_box');
  assert.equal(puzzle?.price, 42);
  assert.equal(resolveMatrixSku(puzzle?.sku || '', matrix), 'PFY-PUZZLE-500');

  assert.equal(resolved.prints.some((item) => item.productId === 'prodigi-rag-16x24'), false);
  assert.equal(resolved.goods.some((item) => item.productId === 'prodigi-rag-16x24'), false);
  assert.equal(resolved.prints.some((item) => item.productId === 'prodigi-rag-12x18'), false);
  assert.equal(goods.has('prodigi-rag-8x10'), false);
  assert.equal(resolved.prints.some((item) => item.productId === 'prodigi-rag-8x10'), true);
  const eightByTen = resolved.prints.find((item) => item.productId === 'prodigi-rag-8x10');
  assert.equal(eightByTen?.sku, 'GLOBAL-FAP-8x10');
  assert.equal(eightByTen?.price, 75);
  assert.equal(eightByTen?.provider, 'prodigi');
  assert.equal(eightByTen?.packaging, 'rigid_tube');
});

test('every photo rubric id resolves except rejected ratios and duplicate paper sizes', () => {
  const ids = RATIO_KEYS.flatMap((key) => PHOTO_RATIO_PRODUCTS[key].map((item) => item.id));
  const skus = ids.map((id) => checkoutSkuForRubricId(id));
  const checkoutSkus = skus.filter((sku): sku is string => Boolean(sku));
  assert.equal(new Set(checkoutSkus).size, checkoutSkus.length);

  const resolved = resolveApprovedStorefront(ids, {
    matrix,
    crops: { '1:2': { rejected: true, rejected_at: '2026-11-23T00:00:00.000Z' } },
    listedPaperSizes: ['12x18"'],
    enabledVendors: ['printful', 'gelato'],
  });
  const present = new Set([
    ...resolved.goods.map((item) => item.productId),
    ...resolved.prints.map((item) => item.productId),
    ...resolved.external.map((item) => item.productId),
  ]);

  for (const key of RATIO_KEYS) {
    for (const item of PHOTO_RATIO_PRODUCTS[key]) {
      if (key === '1:2') {
        assert.equal(present.has(item.id), false, item.id);
        continue;
      }
      if (item.id === 'prodigi-rag-12x18') {
        assert.equal(present.has(item.id), false, item.id);
        continue;
      }
      assert.equal(present.has(item.id), true, item.id);
      if (item.vendor === 'Displate') {
        const external = resolved.external.find((entry) => entry.productId === item.id);
        assert.equal(external?.spec, 'Magnetic mount, external platform');
        assert.equal(external?.href, 'https://displate.com/alanwoodyard');
        continue;
      }
      const row = [...resolved.goods, ...resolved.prints].find((entry) => entry.productId === item.id);
      assert.ok(row, item.id);
      assert.ok(row?.title);
      assert.ok(row?.provider);
      assert.ok(row?.packaging);
      assert.equal(typeof row?.price, 'number');
      assert.ok((row?.price || 0) > 0);
      assert.equal(resolveMatrixSku(row?.sku || '', matrix), row?.sku);
      assert.equal(checkoutSkuForRubricId(item.id), row?.sku);
    }
  }
});

test('PFY-DESKMAT-STD checks out on rhythm-and-flow with the approved 16:7 crop', () => {
  const prepared = prepareCheckoutCart(
    [
      cartItem({
        id: 'rhythm-and-flow-PFY-DESKMAT-STD',
        sku: 'PFY-DESKMAT-STD',
        artworkId: 'rhythm-and-flow',
        artworkTitle: 'Rhythm and Flow',
        variantTitle: 'Studio Panoramic Desk Mat (31.5x15.5")',
        price: 48,
        provider: 'printify',
        packagingType: 'poly_mailer',
      }),
    ],
    matrix,
    origin,
    assetConfig
  );
  assert.equal(prepared.ok, true, prepared.ok ? '' : prepared.error);
  if (!prepared.ok) return;
  assert.equal(prepared.lines[0].matrixSku, 'PFY-DESKMAT-STD');
  assert.equal(prepared.orderItems[0].lab, 'printify');
  assert.equal(prepared.lines[0].productMetadata.crop, '16-7');
  assert.equal(prepared.lines[0].productMetadata.cropRatio, '16:7');
  // Printify defaults to the sRGB jpg derivative master.
  assert.equal(prepared.orderItems[0].printAssetUrl, `${masters}/masters/rhythm-and-flow/16-7.jpg`);

  const rejected = prepareCheckoutCart(
    [
      cartItem({
        sku: 'PFY-DESKMAT-STD',
        artworkId: 'rhythm-and-flow',
        price: 48,
        provider: 'printify',
      }),
    ],
    matrix,
    origin,
    {
      ...assetConfig,
      artworkCrops: {
        'rhythm-and-flow': {
          '16:7': { rejected: true, rejected_at: '2026-11-23T00:00:00.000Z' },
        },
      },
    }
  );
  assert.equal(rejected.ok, false);
  if (!rejected.ok) {
    assert.equal(rejected.status, 400);
    assert.match(rejected.error, /rejected for this image/i);
  }
});

test('prodigi:rag-42x63 is reported as an unpublished catalog size', () => {
  assert.equal(resolveMatrixSku('prodigi:rag-16x24', matrix), 'GLOBAL-FAP-16x24');
  assert.equal(resolveMatrixSku('prodigi:rag-42x63', matrix), null);
  const prepared = prepareCheckoutCart(
    [
      cartItem({
        sku: 'prodigi:rag-42x63',
        artworkId: 'lakeshore-blues',
        artworkTitle: 'Lakeshore Blues',
        price: 185,
      }),
    ],
    matrix,
    origin,
    assetConfig
  );
  assert.equal(prepared.ok, false);
  if (!prepared.ok) {
    assert.equal(prepared.status, 400);
    assert.match(prepared.error, /prodigi:rag-42x63/);
    assert.match(prepared.error, /GLOBAL-FAP-42x63/);
    assert.match(prepared.error, /not a published catalog size/i);
    assert.equal(prepared.code, 'unresolved_sku');
    assert.equal(prepared.sku, 'prodigi:rag-42x63');
  }
});

test('printful and gelato stay off the storefront until the enabled vendors flag names them', () => {
  const ids = ['printful-tote-bag', 'gelato-wall-calendar', 'prodigi-mug-11oz', 'printify-coasters-4pk'];
  const closed = resolveApprovedStorefront(ids, { matrix });
  const closedIds = new Set(closed.goods.map((item) => item.productId));
  assert.equal(closedIds.has('printful-tote-bag'), false);
  assert.equal(closedIds.has('gelato-wall-calendar'), false);
  assert.equal(closedIds.has('prodigi-mug-11oz'), true);
  assert.equal(closedIds.has('printify-coasters-4pk'), true);
  assert.equal(enabledStorefrontLabs().has('printful'), false);
  assert.equal(enabledStorefrontLabs().has('gelato'), false);
  assert.equal(enabledStorefrontLabs(['Printful']).has('printful'), true);
  assert.equal(enabledStorefrontLabs(['Printful']).has('gelato'), false);
  assert.equal(enabledStorefrontLabs(['Printful']).has('prodigi'), true);
  assert.equal(enabledStorefrontLabs(['Printful']).has('printify'), true);
  assert.equal(enabledStorefrontLabs(['gooten']).has('gooten'), true);
  assert.equal(enabledStorefrontLabs(['not-a-lab']).has('printful'), false);

  const opened = resolveApprovedStorefront(ids, {
    matrix,
    enabledVendors: ['Printful', 'gelato'],
  });
  const tote = opened.goods.find((item) => item.productId === 'printful-tote-bag');
  const calendar = opened.goods.find((item) => item.productId === 'gelato-wall-calendar');
  assert.equal(tote?.provider, 'printful');
  assert.equal(tote?.sku, 'PFL-TOTE');
  assert.equal(calendar?.provider, 'gelato');
  assert.equal(calendar?.sku, 'GLT-CAL-WALL');
  assert.equal(opened.goods.some((item) => item.productId === 'prodigi-mug-11oz'), true);
});

test('unconfigured printful and gelato carts fail with a removable sku', () => {
  const blocked = prepareCheckoutCart(
    [
      cartItem({
        id: 'norderney-62-PFL-TOTE',
        sku: 'PFL-TOTE',
        price: 38,
        provider: 'printful',
        packagingType: 'poly_mailer',
      }),
    ],
    matrix,
    origin,
    assetConfig
  );
  assert.equal(blocked.ok, false);
  if (!blocked.ok) {
    assert.equal(blocked.status, 400);
    assert.equal(blocked.code, 'unapproved_sku');
    assert.equal(blocked.sku, 'PFL-TOTE');
    assert.equal(blocked.itemId, 'norderney-62-PFL-TOTE');
    assert.match(blocked.error, /Printful fulfillment is not enabled/i);
  }

  const gelatoBlocked = prepareCheckoutCart(
    [cartItem({ id: 'cal-1', sku: 'GLT-CAL-WALL', price: 38, provider: 'gelato' })],
    matrix,
    origin,
    assetConfig
  );
  assert.equal(gelatoBlocked.ok, false);
  if (!gelatoBlocked.ok) {
    assert.equal(gelatoBlocked.code, 'unapproved_sku');
    assert.match(gelatoBlocked.error, /Gelato fulfillment is not enabled/i);
  }

  const opened = prepareCheckoutCart(
    [
      cartItem({
        id: 'norderney-62-PFL-TOTE',
        sku: 'PFL-TOTE',
        price: 38,
        provider: 'printful',
        packagingType: 'poly_mailer',
      }),
    ],
    matrix,
    origin,
    {
      ...assetConfig,
      enabledVendors: ['printful'],
      artworkCrops: {
        'norderney-62': {
          __uncropped: { approved_products: ['PFL-TOTE'] },
        },
      },
    }
  );
  assert.equal(opened.ok, true, opened.ok ? '' : opened.error);
  if (!opened.ok) return;
  assert.equal(opened.orderItems[0].lab, 'printful');
});

test('corrupt and stale carts can be healed and the blocking sku identified', () => {
  const valid = {
    id: 'piece-1',
    artworkId: 'norderney-62',
    artworkTitle: 'Norderney 62',
    variantTitle: '16x24 Fine-Art Print',
    sku: 'GLOBAL-FAP-16x24',
    provider: 'prodigi',
    packagingType: 'rigid_tube',
    price: 195,
    quantity: 1,
    imageSrc: 'https://alanwoodyard.photo/images/artworks/norderney-62.webp',
  };
  const raw = JSON.stringify([valid]);
  assert.equal(storedCartNeedsHeal(raw), false);
  assert.equal(readStoredCartItems(raw)[0]?.sku, 'GLOBAL-FAP-16x24');
  assert.deepEqual(readStoredCartItems(''), []);
  assert.deepEqual(readStoredCartItems('{'), []);
  assert.deepEqual(readStoredCartItems('null'), []);
  assert.deepEqual(readStoredCartItems('{"items":[]}'), []);
  assert.equal(storedCartNeedsHeal(null), false);
  assert.equal(storedCartNeedsHeal(''), true);
  assert.equal(storedCartNeedsHeal('{'), true);

  const mixed = JSON.stringify([
    valid,
    { id: 'broken' },
    {
      ...valid,
      id: 'script-image',
      sku: 'GLOBAL-FAP-12x18',
      imageSrc: 'javascript:alert(1)',
    },
  ]);
  const healed = readStoredCartItems(mixed);
  assert.equal(healed.length, 2);
  assert.equal(healed[1]?.id, 'script-image');
  assert.equal(healed[1]?.imageSrc, '');
  assert.equal(storedCartNeedsHeal(mixed), true);

  const stale = identifyUnavailableCartItem(
    [
      { id: 'keep', sku: 'GLOBAL-FAP-16x24' },
      { id: 'drop', sku: 'prodigi:rag-42x63' },
    ],
    {
      error: 'Cart SKU prodigi:rag-42x63 is not a published catalog size (GLOBAL-FAP-42x63)',
    }
  );
  assert.equal(stale?.id, 'drop');

  const byId = identifyUnavailableCartItem(
    [
      { id: 'keep', sku: 'GLOBAL-FAP-16x24' },
      { id: 'drop', sku: 'PFL-TOTE' },
    ],
    {
      code: 'unapproved_sku',
      itemId: 'drop',
      sku: 'GLOBAL-FAP-16x24',
      error: 'Cart SKU PFL-TOTE is not available. Printful fulfillment is not enabled for this store.',
    }
  );
  assert.equal(byId?.id, 'drop');
});

test('checkout flight guard collapses duplicate mounts', async () => {
  const guard = createCheckoutFlightGuard();
  let runs = 0;
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = guard.start(async () => {
    runs += 1;
    await gate;
  });
  const second = guard.start(async () => {
    runs += 1;
  });
  assert.equal(second, first);
  release();
  await first;
  assert.equal(runs, 1);
  await guard.start(async () => {
    runs += 1;
  });
  assert.equal(runs, 2);
});

test('Printify SKUs default to the sRGB jpg print master while Prodigi keeps the archival tif', () => {
  const printifyItem = cartItem({
    id: 'norderney-62-pillow',
    sku: 'PFY-PILLOW-18',
    variantTitle: 'Studio Throw Pillow',
    price: 42,
  });
  const printifyPrepared = prepareCheckoutCart([printifyItem], matrix, origin, assetConfig);
  assert.equal(printifyPrepared.ok, true);
  if (!printifyPrepared.ok) return;
  assert.equal(printifyPrepared.orderItems[0].lab, 'printify');
  assert.equal(printifyPrepared.orderItems[0].printAssetUrl, `${masters}/masters/norderney-62/1-1.jpg`);

  const prodigiPrepared = prepareCheckoutCart([cartItem()], matrix, origin, assetConfig);
  assert.equal(prodigiPrepared.ok, true);
  if (!prodigiPrepared.ok) return;
  assert.equal(prodigiPrepared.orderItems[0].lab, 'prodigi');
  assert.equal(prodigiPrepared.orderItems[0].printAssetUrl, `${masters}/masters/norderney-62/2-3.tif`);
});

test('PRINT_MASTERS_EXTENSION explicitly set wins over the per-lab default for every lab', () => {
  const printifyItem = cartItem({
    id: 'norderney-62-pillow',
    sku: 'PFY-PILLOW-18',
    variantTitle: 'Studio Throw Pillow',
    price: 42,
  });
  const forcedTif = prepareCheckoutCart([printifyItem], matrix, origin, {
    ...assetConfig,
    printMastersExtension: 'tif',
  });
  assert.equal(forcedTif.ok, true);
  if (!forcedTif.ok) return;
  assert.equal(forcedTif.orderItems[0].printAssetUrl, `${masters}/masters/norderney-62/1-1.tif`);

  const prodigiItem = cartItem();
  const forcedJpg = prepareCheckoutCart([prodigiItem], matrix, origin, {
    ...assetConfig,
    printMastersExtension: 'jpg',
  });
  assert.equal(forcedJpg.ok, true);
  if (!forcedJpg.ok) return;
  assert.equal(forcedJpg.orderItems[0].printAssetUrl, `${masters}/masters/norderney-62/2-3.jpg`);
});

test('buildStripeSessionParams enables phone collection, a 4 hour expiry, and US-only default shipping countries', () => {
  const prepared = prepareCheckoutCart([cartItem()], matrix, origin, assetConfig);
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  const nowMs = Date.UTC(2026, 0, 1, 12, 0, 0);
  const params = buildStripeSessionParams(prepared, { origin }, nowMs);

  assert.deepEqual(params.phone_number_collection, { enabled: true });
  assert.deepEqual(params.shipping_address_collection?.allowed_countries, ['US']);
  assert.equal(params.expires_at, Math.floor(nowMs / 1000) + 4 * 60 * 60);
  assert.equal(params.ui_mode, 'embedded');
  assert.equal(params.return_url, `${origin}/order-confirmation?session_id={CHECKOUT_SESSION_ID}`);
});

test('buildStripeSessionParams honors CHECKOUT_ALLOWED_COUNTRIES overrides', () => {
  const prepared = prepareCheckoutCart([cartItem()], matrix, origin, assetConfig);
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  const allowedCountries = parseAllowedCountriesConfig('CA, GB | mx');
  assert.deepEqual(allowedCountries, ['CA', 'GB', 'MX']);
  const params = buildStripeSessionParams(prepared, { origin, allowedCountries });
  assert.deepEqual(params.shipping_address_collection?.allowed_countries, ['CA', 'GB', 'MX']);

  assert.equal(parseAllowedCountriesConfig(undefined), undefined);
  assert.equal(parseAllowedCountriesConfig(''), undefined);
  assert.equal(parseAllowedCountriesConfig('not-a-code'), undefined);
});

test('computeCheckoutIdempotencyKey is deterministic for the same cart and nonce, and changes with either', async () => {
  const items = [cartItem()];
  const keyA = await computeCheckoutIdempotencyKey(items, 'nonce-1');
  const keyB = await computeCheckoutIdempotencyKey(items, 'nonce-1');
  assert.equal(keyA, keyB);
  assert.match(keyA, /^awp_checkout_[0-9a-f]{32}$/);

  const differentNonce = await computeCheckoutIdempotencyKey(items, 'nonce-2');
  assert.notEqual(keyA, differentNonce);

  const differentCart = [cartItem({ quantity: 2 })];
  const differentCartKey = await computeCheckoutIdempotencyKey(differentCart, 'nonce-1');
  assert.notEqual(keyA, differentCartKey);
});

test('getOrCreateCheckoutNonce reuses the stored nonce for an unchanged cart and mints a new one when the cart changes', () => {
  const store = new Map<string, string>();
  const storage: CheckoutNonceStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
  };
  const items = [{ id: 'a', sku: 'GLOBAL-FAP-16x24', quantity: 1 }];

  const first = getOrCreateCheckoutNonce(items, storage);
  const second = getOrCreateCheckoutNonce(items, storage);
  assert.equal(first, second);

  const changedItems = [{ id: 'a', sku: 'GLOBAL-FAP-16x24', quantity: 2 }];
  const third = getOrCreateCheckoutNonce(changedItems, storage);
  assert.notEqual(third, first);

  assert.equal(
    cartFingerprint(items),
    cartFingerprint([...items].reverse())
  );
});

test('checkout.session.async_payment_succeeded is routed the same as checkout.session.completed', async () => {
  clearDispatchReceipts();
  const prepared = prepareCheckoutCart([cartItem()], matrix, origin, assetConfig);
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  const line = prepared.lines[0];
  const amount = line.orderItem.unitPriceCents;
  const event = paidEvent(amount, JSON.stringify(prepared.orderItems), 'usd', 'paid', 'cs_test_async_paid');
  event.type = 'checkout.session.async_payment_succeeded';
  const raw = JSON.stringify(event);
  const original = globalThis.fetch;

  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/line_items')) {
      return new Response(
        JSON.stringify({
          data: [
            {
              quantity: line.orderItem.quantity,
              currency: 'usd',
              price: { unit_amount: amount, currency: 'usd', product: { metadata: line.productMetadata } },
            },
          ],
        }),
        { status: 200 }
      );
    }
    if (url.includes('api.prodigi.com')) {
      return new Response(JSON.stringify({ order: { id: 'ord_async_1' } }), { status: 200 });
    }
    return new Response('unexpected', { status: 500 });
  };

  try {
    const result = await handleStripeWebhook(
      new Request(`${origin}/api/stripe-webhook`, {
        method: 'POST',
        headers: { 'stripe-signature': sign(raw, 'whsec_test') },
        body: raw,
      }),
      webhookEnv()
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.routed, true);
  } finally {
    globalThis.fetch = original;
  }
});

test('an unrelated event type is acknowledged without routing', async () => {
  const event = { type: 'customer.created', data: { object: {} } };
  const raw = JSON.stringify(event);
  const result = await handleStripeWebhook(
    new Request(`${origin}/api/stripe-webhook`, {
      method: 'POST',
      headers: { 'stripe-signature': sign(raw, 'whsec_test') },
      body: raw,
    }),
    webhookEnv()
  );
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { received: true });
});

test('webhook accepts amount_total above the catalog subtotal for Stripe Tax or shipping fees, but still requires an exact subtotal', async () => {
  clearDispatchReceipts();
  const prepared = prepareCheckoutCart([cartItem()], matrix, origin, assetConfig);
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  const line = prepared.lines[0];
  const amount = line.orderItem.unitPriceCents;
  const original = globalThis.fetch;

  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/line_items')) {
      return new Response(
        JSON.stringify({
          data: [
            {
              quantity: line.orderItem.quantity,
              currency: 'usd',
              price: { unit_amount: amount, currency: 'usd', product: { metadata: line.productMetadata } },
            },
          ],
        }),
        { status: 200 }
      );
    }
    if (url.includes('api.prodigi.com')) {
      return new Response(JSON.stringify({ order: { id: 'ord_tax_1' } }), { status: 200 });
    }
    return new Response('unexpected', { status: 500 });
  };

  try {
    const taxInclusive = paidEvent(amount, undefined, 'usd', 'paid', 'cs_test_tax_inclusive');
    taxInclusive.data.object.amount_total = amount + 850; // Stripe Tax or shipping surcharge
    const taxRaw = JSON.stringify(taxInclusive);
    const taxResult = await handleStripeWebhook(
      new Request(`${origin}/api/stripe-webhook`, {
        method: 'POST',
        headers: { 'stripe-signature': sign(taxRaw, 'whsec_test') },
        body: taxRaw,
      }),
      webhookEnv()
    );
    assert.equal(taxResult.status, 200);
    assert.equal(taxResult.body.routed, true);

    const subtotalMismatch = paidEvent(amount, undefined, 'usd', 'paid', 'cs_test_subtotal_mismatch');
    subtotalMismatch.data.object.amount_subtotal = amount - 100;
    subtotalMismatch.data.object.amount_total = amount + 100;
    const mismatchRaw = JSON.stringify(subtotalMismatch);
    const mismatchResult = await handleStripeWebhook(
      new Request(`${origin}/api/stripe-webhook`, {
        method: 'POST',
        headers: { 'stripe-signature': sign(mismatchRaw, 'whsec_test') },
        body: mismatchRaw,
      }),
      webhookEnv()
    );
    assert.equal(mismatchResult.status, 200);
    assert.equal(mismatchResult.body.routed, false);
    assert.match(String(mismatchResult.body.error), /total/i);
  } finally {
    globalThis.fetch = original;
  }
});

test('dispatch receipts persist to Cloudflare KV so a cold worker still dedupes a retried webhook', async () => {
  clearDispatchReceipts();
  const prepared = prepareCheckoutCart([cartItem()], matrix, origin, assetConfig);
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  const line = prepared.lines[0];
  const amount = line.orderItem.unitPriceCents;
  const event = paidEvent(amount, JSON.stringify(prepared.orderItems), 'usd', 'paid', 'cs_test_kv_dedupe');
  const raw = JSON.stringify(event);
  const kvStore = new Map<string, string>();
  const kv = {
    get: async (key: string) => kvStore.get(key) ?? null,
    put: async (key: string, value: string) => {
      kvStore.set(key, value);
    },
  };
  const original = globalThis.fetch;
  let prodigiCalls = 0;

  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/line_items')) {
      return new Response(
        JSON.stringify({
          data: [
            {
              quantity: line.orderItem.quantity,
              currency: 'usd',
              price: { unit_amount: amount, currency: 'usd', product: { metadata: line.productMetadata } },
            },
          ],
        }),
        { status: 200 }
      );
    }
    if (url.includes('api.prodigi.com')) {
      prodigiCalls += 1;
      return new Response(JSON.stringify({ order: { id: 'ord_kv_1' } }), { status: 200 });
    }
    return new Response('unexpected', { status: 500 });
  };

  try {
    const env = { ...webhookEnv(), SESSION: kv };
    const first = await handleStripeWebhook(
      new Request(`${origin}/api/stripe-webhook`, {
        method: 'POST',
        headers: { 'stripe-signature': sign(raw, 'whsec_test') },
        body: raw,
      }),
      env
    );
    assert.equal(first.body.routed, true);
    assert.equal(prodigiCalls, 1);
    assert.ok(kvStore.has('webhook_receipt:cs_test_kv_dedupe'));

    // A cold worker loses the in-memory receipt but keeps the durable KV record.
    clearDispatchReceipts();
    const second = await handleStripeWebhook(
      new Request(`${origin}/api/stripe-webhook`, {
        method: 'POST',
        headers: { 'stripe-signature': sign(raw, 'whsec_test') },
        body: raw,
      }),
      env
    );
    assert.equal(second.body.duplicate, true);
    assert.equal(prodigiCalls, 1);
  } finally {
    globalThis.fetch = original;
  }
});

test('a partially failed multi-lab order only retries the failed lab and never double-orders the succeeded lab', async () => {
  clearDispatchReceipts();
  const prodigiItem = cartItem();
  const printifyItem = cartItem({
    id: 'norderney-62-pillow',
    sku: 'PFY-PILLOW-18',
    variantTitle: 'Studio Throw Pillow',
    price: 42,
  });
  const prepared = prepareCheckoutCart([prodigiItem, printifyItem], matrix, origin, assetConfig);
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  const amount = prepared.orderItems.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
  const event = paidEvent(amount, undefined, 'usd', 'paid', 'cs_test_partial_multilab');
  const raw = JSON.stringify(event);
  const kvStore = new Map<string, string>();
  const kv = {
    get: async (key: string) => kvStore.get(key) ?? null,
    put: async (key: string, value: string) => {
      kvStore.set(key, value);
    },
  };
  const original = globalThis.fetch;
  let printifyShouldFail = true;
  let prodigiCalls = 0;
  let printifyCalls = 0;

  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/line_items')) {
      return new Response(
        JSON.stringify({
          data: prepared.lines.map((line) => ({
            quantity: line.orderItem.quantity,
            currency: 'usd',
            price: {
              unit_amount: line.orderItem.unitPriceCents,
              currency: 'usd',
              product: { name: line.orderItem.artworkTitle, metadata: line.productMetadata },
            },
          })),
        }),
        { status: 200 }
      );
    }
    if (url.includes('api.prodigi.com')) {
      prodigiCalls += 1;
      return new Response(JSON.stringify({ order: { id: 'ord_partial_prodigi' } }), { status: 200 });
    }
    if (url.includes('api.printify.com')) {
      printifyCalls += 1;
      if (printifyShouldFail) {
        return new Response('printify is down', { status: 500 });
      }
      return new Response(JSON.stringify({ id: 'ord_partial_printify' }), { status: 200 });
    }
    return new Response('unexpected', { status: 500 });
  };

  try {
    const env = {
      ...webhookEnv(),
      SESSION: kv,
      PRINTIFY_API_TOKEN: 'pfy_test',
      PRINTIFY_SHOP_ID: '999',
    };

    const firstAttempt = await handleStripeWebhook(
      new Request(`${origin}/api/stripe-webhook`, {
        method: 'POST',
        headers: { 'stripe-signature': sign(raw, 'whsec_test') },
        body: raw,
      }),
      env
    );
    assert.equal(firstAttempt.status, 502);
    assert.equal(firstAttempt.body.routed, false);
    const firstFulfillment = firstAttempt.body.fulfillment as { parcels: { lab: string; status: string }[] };
    assert.equal(firstFulfillment.parcels.find((p) => p.lab === 'prodigi')?.status, 'dispatched');
    assert.equal(firstFulfillment.parcels.find((p) => p.lab === 'printify')?.status, 'failed');
    assert.equal(prodigiCalls, 1);
    assert.equal(printifyCalls, 1);
    assert.ok(kvStore.has('webhook_parcel:cs_test_partial_multilab:prodigi'));
    assert.equal(kvStore.has('webhook_parcel:cs_test_partial_multilab:printify'), false);
    assert.equal(kvStore.has('webhook_receipt:cs_test_partial_multilab'), false);

    printifyShouldFail = false;
    const retryAttempt = await handleStripeWebhook(
      new Request(`${origin}/api/stripe-webhook`, {
        method: 'POST',
        headers: { 'stripe-signature': sign(raw, 'whsec_test') },
        body: raw,
      }),
      env
    );
    assert.equal(retryAttempt.status, 200);
    assert.equal(retryAttempt.body.routed, true);
    const retryFulfillment = retryAttempt.body.fulfillment as { parcels: { lab: string; status: string }[] };
    assert.equal(retryFulfillment.parcels.find((p) => p.lab === 'prodigi')?.status, 'recovered_idempotent');
    assert.equal(retryFulfillment.parcels.find((p) => p.lab === 'printify')?.status, 'dispatched');
    // Prodigi is not redispatched on retry; its saved receipt is replayed instead.
    assert.equal(prodigiCalls, 1);
    assert.equal(printifyCalls, 2);
  } finally {
    globalThis.fetch = original;
  }
});
