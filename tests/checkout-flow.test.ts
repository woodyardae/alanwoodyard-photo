import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import pricingMatrix from '../src/content/pricing-matrix.json';
import {
  buildCheckoutSessionMetadata,
  createEmbeddedCheckoutSession,
  prepareCheckoutCart,
  type CheckoutCartItem,
  type PricingMatrixEntry,
} from '../src/lib/create-checkout-session';
import { clearDispatchReceipts, readDispatchReceipt } from '../src/lib/dispatch-ledger';
import { handleStripeWebhook } from '../src/lib/handle-stripe-webhook';
import {
  buildCustomerReceiptEmail,
  buildOperatorEmail,
  DEFAULT_OPERATOR_EMAIL,
  deliverOrderNotifications,
} from '../src/lib/notifications';

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
  const originalError = console.error;
  const originalFetch = globalThis.fetch;
  let prodigiCalls = 0;
  console.error = (...args: unknown[]) => {
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
    const stored = readDispatchReceipt('cs_test_duplicate');
    assert.ok(stored);
    assert.equal(stored.notified, true);
    assert.equal(prodigiCalls, 1);
    assert.match(logs.join('\n'), /RESEND_API_KEY/);
    const fulfillment = second.body.fulfillment as { parcels: { labOrderId?: string }[] };
    assert.equal(fulfillment.parcels[0].labOrderId, 'ord_once');
  } finally {
    console.error = originalError;
    globalThis.fetch = originalFetch;
  }
});

test('operator emails list the paid order and raise a failure when dispatch breaks', () => {
  const success = buildOperatorEmail({
    kind: 'dispatch',
    sessionId: 'cs_test_notice',
    customerEmail: 'collector@example.com',
    destinationCountry: 'US',
    skus: ['prodigi:rag-16x24', 'prodigi:rag-24x36'],
    supplierOrderIds: ['ord_live_1'],
  });
  assert.deepEqual(success.to, [DEFAULT_OPERATOR_EMAIL]);
  assert.match(success.text, /Session: cs_test_notice/);
  assert.match(success.text, /Customer email: collector@example.com/);
  assert.match(success.text, /Destination country: US/);
  assert.match(success.text, /SKUs: prodigi:rag-16x24, prodigi:rag-24x36/);
  assert.match(success.text, /Supplier order IDs: ord_live_1/);
  assert.equal(success.headers, undefined);

  const failure = buildOperatorEmail({
    kind: 'failure',
    sessionId: 'cs_test_notice',
    customerEmail: 'collector@example.com',
    destinationCountry: 'DE',
    skus: ['prodigi:rag-16x24'],
    supplierOrderIds: ['ord_partial_9'],
    errors: ['Lab prodigi dispatch failed: HTTP 500'],
  });
  assert.equal(failure.headers?.['X-Priority'], '1');
  assert.match(failure.subject, /Supplier dispatch failed/);
  assert.match(failure.text, /Destination country: DE/);
  assert.match(failure.text, /Supplier order IDs: ord_partial_9/);
  assert.match(failure.text, /HTTP 500/);

  const customer = buildCustomerReceiptEmail({
    kind: 'dispatch',
    sessionId: 'cs_test_notice',
    customerEmail: 'collector@example.com',
    destinationCountry: 'US',
    skus: ['prodigi:rag-16x24'],
    supplierOrderIds: ['ord_live_1'],
  });
  assert.deepEqual(customer.to, ['collector@example.com']);
  assert.match(customer.text, /Session: cs_test_notice/);
  assert.match(customer.text, /SKUs: prodigi:rag-16x24/);
});

test('a missing Resend key logs and does not throw', async () => {
  const logs: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    logs.push(args.map(String).join(' '));
  };
  try {
    const skipped = await deliverOrderNotifications(
      {},
      {
        kind: 'dispatch',
        sessionId: 'cs_local',
        customerEmail: 'collector@example.com',
        destinationCountry: 'US',
        skus: ['prodigi:rag-16x24'],
        supplierOrderIds: ['ord_1'],
      }
    );
    assert.equal(skipped.operatorSkipped, true);
    assert.equal(skipped.operatorSent, false);
    assert.match(logs.join('\n'), /RESEND_API_KEY/);
  } finally {
    console.error = original;
  }
});

test('supplier failure sends a high priority operator alert and does not stick the receipt', async () => {
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
    if (url.includes('api.resend.com')) {
      return new Response(JSON.stringify({ id: 'email_fail_1' }), { status: 200 });
    }
    return new Response('unexpected', { status: 500 });
  };

  try {
    const result = await postWebhook(
      event,
      webhookEnv({ RESEND_API_KEY: 're_test_live_shape' })
    );
    assert.equal(result.status, 502);
    assert.equal(result.body.routed, false);
    assert.equal(readDispatchReceipt('cs_test_supplier_fail'), null);
    const email = calls.find((call) => call.url.includes('api.resend.com'));
    assert.ok(email);
    const payload = JSON.parse(email.body) as { subject: string; text: string; headers?: Record<string, string>; to: string[] };
    assert.match(payload.subject, /Supplier dispatch failed cs_test_supplier_fail/);
    assert.equal(payload.headers?.['X-Priority'], '1');
    assert.match(payload.text, /Customer email: collector@example.com/);
    assert.match(payload.text, /Destination country: US/);
    assert.match(payload.text, /SKUs: prodigi:rag-16x24/);
    assert.deepEqual(payload.to, [DEFAULT_OPERATOR_EMAIL]);
  } finally {
    globalThis.fetch = original;
  }
});

test('a Resend failure keeps the dispatch receipt for a later retry', async () => {
  clearDispatchReceipts();
  const prepared = prepareCheckoutCart([cartItem()], matrix, origin, assetConfig);
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  const line = prepared.lines[0];
  const amount = line.orderItem.unitPriceCents;
  const event = paidEvent(amount, JSON.stringify(prepared.orderItems), 'usd', 'paid', 'cs_test_resend_retry');
  const original = globalThis.fetch;
  let prodigiCalls = 0;
  let resendCalls = 0;
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
    if (url.includes('api.resend.com')) {
      resendCalls += 1;
      return new Response('mailbox down', { status: 500 });
    }
    return new Response('unexpected', { status: 500 });
  };

  try {
    const env = webhookEnv({ RESEND_API_KEY: 're_test_live_shape' });
    const first = await postWebhook(event, env);
    assert.equal(first.status, 200);
    assert.equal(first.body.routed, true);
    assert.equal(readDispatchReceipt('cs_test_resend_retry')?.notified, false);
    const second = await postWebhook(event, env);
    assert.equal(second.body.duplicate, true);
    assert.equal(prodigiCalls, 1);
    assert.ok(resendCalls >= 2);
  } finally {
    globalThis.fetch = original;
  }
});
