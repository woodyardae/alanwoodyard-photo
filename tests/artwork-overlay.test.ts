import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pricingMatrix from '../src/content/pricing-matrix.json';
import {
  artworkRedirectPath,
  getEffectiveArtwork,
  getEffectiveCatalog,
  type SessionKv,
} from '../src/lib/artwork-overlay';
import {
  createEmbeddedCheckoutSession,
  prepareCheckoutCart,
  type CheckoutCartItem,
  type CheckoutStripeClient,
  type PricingMatrixEntry,
} from '../src/lib/create-checkout-session';
import { clearDispatchReceipts } from '../src/lib/dispatch-ledger';
import { handleStripeWebhook } from '../src/lib/handle-stripe-webhook';
import { applyOverlaysToArtworkDir } from '../scripts/pull-merch-kv';

const matrix = pricingMatrix as Record<string, PricingMatrixEntry>;
const origin = 'https://alanwoodyard.photo';
const masters = 'https://masters.example.test';
const secret = 'whsec_test';

function memoryKv(seed: Record<string, string> = {}): { kv: SessionKv; store: Map<string, string> } {
  const store = new Map<string, string>(Object.entries(seed));
  return {
    store,
    kv: {
      get: async (key) => store.get(key) ?? null,
      put: async (key, value) => {
        store.set(key, value);
      },
    },
  };
}

function writeFixture(dir: string, record: Record<string, unknown>): string {
  const artDir = path.join(dir, 'src', 'content', 'artworks');
  fs.mkdirSync(artDir, { recursive: true });
  const id = String(record.id);
  const file = path.join(artDir, `${id}.json`);
  fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  return file;
}

function fixtureRecord() {
  return {
    id: 'overlay-fixture',
    title: 'Bundled Title',
    caption: 'Bundled caption',
    description: 'Bundled description',
    collections: ['germany'],
    tags: ['bundled'],
    master_file: 'b2://alan-woodyard/masters/overlay-fixture.tif',
    merch_approved: [],
    merch_crops: {
      '2:3': { panX: 0, panY: 0, zoom: 1, approved_products: ['GLOBAL-FAP-16x24'] },
    },
    print_variants: [
      { sku: 'prodigi:rag-16x24', substrate: 'Hahnemühle Photo Rag', size: '16x24', price_cents: 19500 },
    ],
  };
}

test('KV crop edits and metadata overlay the catalog without writing the JSON file', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'awp-overlay-'));
  const file = writeFixture(root, fixtureRecord());
  const before = fs.readFileSync(file, 'utf8');
  const { kv } = memoryKv({
    'crops:_modified_list': JSON.stringify(['overlay-fixture']),
    'crops:overlay-fixture': JSON.stringify({
      id: 'hacked-id',
      master_file: 'b2://evil/hacked.tif',
      title: 'Live Title',
      caption: 'Live caption',
      description: 'Live description',
      collections: ['harbor', 'night'],
      tags: ['live', 'mono'],
      slug: 'overlay-fixture-live',
      merch_crops: {
        '2:3': { panX: 12, panY: -4, zoom: 1.35, approved_products: ['GLOBAL-FAP-16x24'] },
      },
      merch_approved: ['GLOBAL-FAP-16x24'],
    }),
  });

  const artwork = await getEffectiveArtwork({ SESSION: kv }, 'overlay-fixture-live', root);
  assert.ok(artwork);
  assert.equal(artwork.id, 'overlay-fixture');
  assert.equal(artwork.slug, 'overlay-fixture-live');
  assert.equal(artwork.master_file, 'b2://alan-woodyard/masters/overlay-fixture.tif');
  assert.equal(artwork.title, 'Live Title');
  assert.equal(artwork.caption, 'Live caption');
  assert.equal(artwork.description, 'Live description');
  assert.deepEqual(artwork.collections, ['harbor', 'night']);
  assert.deepEqual(artwork.tags, ['live', 'mono']);
  assert.equal(artwork.merch_crops['2:3'] && (artwork.merch_crops['2:3'] as { panX: number }).panX, 12);
  assert.equal(artwork.merch_crops['2:3'] && (artwork.merch_crops['2:3'] as { panY: number }).panY, -4);
  assert.equal(artwork.merch_crops['2:3'] && (artwork.merch_crops['2:3'] as { zoom: number }).zoom, 1.35);
  assert.equal(artwork.data.id, 'overlay-fixture');
  assert.equal(artwork.data.master_file, 'b2://alan-woodyard/masters/overlay-fixture.tif');
  assert.equal(fs.readFileSync(file, 'utf8'), before);

  const catalog = await getEffectiveCatalog({ SESSION: kv }, root);
  assert.equal(artworkRedirectPath('/artwork/overlay-fixture', catalog), '/artwork/overlay-fixture-live');
  assert.equal(artworkRedirectPath('/artwork/overlay-fixture/', catalog), '/artwork/overlay-fixture-live/');
  assert.equal(artworkRedirectPath('/artwork/overlay-fixture-live', catalog), null);
  assert.equal(artworkRedirectPath('/artworks', catalog), null);
});

test('a legacy crops map supplies pan, zoom, and product approvals', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'awp-overlay-legacy-'));
  const file = writeFixture(root, fixtureRecord());
  const before = fs.readFileSync(file, 'utf8');
  const { kv } = memoryKv({
    awp_merch_crops: JSON.stringify({
      'overlay-fixture': {
        '17:7': { panX: 3, panY: 1, zoom: 1.2, approved_products: ['GLOBAL-MUG-11oz'] },
      },
    }),
  });

  const artwork = await getEffectiveArtwork({ SESSION: kv }, 'overlay-fixture', root);
  assert.ok(artwork);
  assert.equal((artwork.merch_crops['17:7'] as { zoom: number }).zoom, 1.2);
  assert.deepEqual(artwork.merch_approved, ['GLOBAL-MUG-11oz']);
  assert.equal(artwork.title, 'Bundled Title');
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('checkout uses KV crop adjustments and approvals and leaves the JSON file untouched', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'awp-overlay-checkout-'));
  const file = writeFixture(root, fixtureRecord());
  const before = fs.readFileSync(file, 'utf8');
  const rejected = memoryKv({
    'crops:_modified_list': JSON.stringify(['overlay-fixture']),
    'crops:overlay-fixture': JSON.stringify({
      slug: 'overlay-fixture-live',
      merch_crops: { '2:3': { rejected: true, rejected_at: '2026-11-24T00:00:00.000Z' } },
    }),
  });

  const item: CheckoutCartItem = {
    id: 'overlay-fixture-print',
    sku: 'prodigi:rag-16x24',
    artworkId: 'overlay-fixture-live',
    artworkTitle: 'Live Title',
    variantTitle: '16x24 Fine-Art Print',
    price: 195,
    quantity: 1,
    provider: 'prodigi',
    packagingType: 'rigid_tube',
  };

  const blocked = await createEmbeddedCheckoutSession({
    items: [item],
    origin,
    stripeSecretKey: 'sk_test_placeholder',
    pricingMatrix: matrix,
    printMastersBaseUrl: masters,
    allowSimulatedCheckout: true,
    session: rejected.kv,
    catalogRoot: root,
  });
  assert.equal(blocked.status, 400);
  assert.match(String(blocked.body.error), /rejected/i);
  assert.equal(fs.readFileSync(file, 'utf8'), before);

  const live = memoryKv({
    'crops:_modified_list': JSON.stringify(['overlay-fixture']),
    'crops:overlay-fixture': JSON.stringify({
      slug: 'overlay-fixture-live',
      title: 'Live Title',
      merch_crops: {
        '2:3': { panX: 8, panY: -2, zoom: 1.5, approved_products: ['GLOBAL-FAP-16x24'] },
      },
    }),
  });
  let seenPan = '';
  const stripeClient: CheckoutStripeClient = {
    checkout: {
      sessions: {
        create: async (params) => {
          const metadata = params.line_items?.[0]?.price_data?.product_data?.metadata;
          seenPan = `${metadata?.cropPanX},${metadata?.cropPanY},${metadata?.cropZoom}`;
          const artworkSlug = metadata?.artworkSlug;
          assert.equal(artworkSlug, 'overlay-fixture');
          return { client_secret: 'cs_test_overlay' };
        },
      },
    },
  };
  const opened = await createEmbeddedCheckoutSession({
    items: [item],
    origin,
    stripeSecretKey: 'sk_test_real',
    stripePublishableKey: 'pk_test_real',
    pricingMatrix: matrix,
    printMastersBaseUrl: masters,
    session: live.kv,
    catalogRoot: root,
    stripeClient,
  });
  assert.equal(opened.status, 200);
  assert.equal(seenPan, '8,-2,1.5');
  assert.equal(fs.readFileSync(file, 'utf8'), before);

  const artwork = await getEffectiveArtwork({ SESSION: live.kv }, 'overlay-fixture', root);
  assert.ok(artwork);
  const prepared = prepareCheckoutCart([item], matrix, origin, {
    printMastersBaseUrl: masters,
    publishedSlugs: new Set([artwork.id]),
    canonicalArtworkIds: new Map([
      ['overlay-fixture', 'overlay-fixture'],
      ['overlay-fixture-live', 'overlay-fixture'],
    ]),
    artworkCrops: { 'overlay-fixture': artwork.merch_crops },
  });
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  assert.equal(prepared.orderItems[0].artworkId, 'overlay-fixture');
  assert.equal(prepared.orderItems[0].printAssetUrl, `${masters}/masters/overlay-fixture/2-3.tif`);
  assert.equal(prepared.lines[0].productMetadata.cropPanX, '8');
  assert.equal(prepared.lines[0].productMetadata.cropZoom, '1.5');
});

function sign(body: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${digest}`;
}

test('webhook dispatch uses KV product approvals without modifying the JSON file', async () => {
  clearDispatchReceipts();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'awp-overlay-webhook-'));
  const file = writeFixture(root, fixtureRecord());
  const before = fs.readFileSync(file, 'utf8');
  const { kv } = memoryKv({
    'crops:_modified_list': JSON.stringify(['overlay-fixture']),
    'crops:overlay-fixture': JSON.stringify({
      slug: 'overlay-fixture-live',
      merch_crops: {
        __uncropped: { approved_products: ['GLOBAL-MUG-11oz'], panX: 1, panY: 2, zoom: 1.1 },
      },
    }),
  });

  const amount = 2200;
  const event = {
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_overlay_mug',
        payment_status: 'paid',
        currency: 'usd',
        amount_subtotal: amount,
        amount_total: amount,
        metadata: { source: 'alanwoodyard.photo' },
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
        customer_details: { name: 'Alan Collector', email: 'collector@example.com' },
      },
    },
  };
  const raw = JSON.stringify(event);
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
                product: {
                  metadata: {
                    sku: 'GLOBAL-MUG-11oz',
                    matrixSku: 'GLOBAL-MUG-11oz',
                    artworkSlug: 'overlay-fixture-live',
                    artworkId: 'overlay-fixture-live',
                  },
                },
              },
            },
          ],
        }),
        { status: 200 }
      );
    }
    if (url.includes('api.prodigi.com')) {
      prodigiBodies.push(typeof init?.body === 'string' ? init.body : '');
      return new Response(JSON.stringify({ order: { id: 'ord_overlay_1' } }), { status: 200 });
    }
    return new Response('unexpected', { status: 500 });
  };

  try {
    const result = await handleStripeWebhook(
      new Request(`${origin}/api/stripe-webhook`, {
        method: 'POST',
        headers: { 'stripe-signature': sign(raw) },
        body: raw,
      }),
      {
        STRIPE_SECRET_KEY: 'sk_test_live_shape',
        STRIPE_WEBHOOK_SECRET: secret,
        PRODIGI_API_KEY: 'prodigi_test',
        ALLOW_MOCK_DISPATCH: '1',
        PRINT_MASTERS_BASE_URL: masters,
        pricingMatrix: matrix,
        SESSION: kv,
        catalogRoot: root,
      }
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.routed, true);
    assert.equal(prodigiBodies.length, 1);
    const payload = JSON.parse(prodigiBodies[0]) as { items: { assets: { url: string }[] }[] };
    assert.equal(payload.items[0].assets[0].url, `${masters}/masters/overlay-fixture.tif`);
    assert.equal(fs.readFileSync(file, 'utf8'), before);
  } finally {
    globalThis.fetch = original;
  }
});

test('pull-merch-kv snapshots overlays into artwork JSON without changing id or master_file', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'awp-overlay-snapshot-'));
  writeFixture(root, fixtureRecord());
  const result = applyOverlaysToArtworkDir(root, {
    'overlay-fixture': {
      id: 'renamed',
      master_file: 'b2://evil/nope.tif',
      title: 'Snap Title',
      caption: 'Snap caption',
      slug: 'overlay-fixture-live',
      merch_crops: { '2:3': { panX: 4, panY: 5, zoom: 1.25 } },
    },
    'missing-piece': { title: 'Nope' },
  });
  assert.deepEqual(result.updated, ['overlay-fixture']);
  assert.deepEqual(result.missing, ['missing-piece']);
  const saved = JSON.parse(fs.readFileSync(path.join(root, 'src', 'content', 'artworks', 'overlay-fixture.json'), 'utf8')) as {
    id: string;
    title: string;
    master_file: string;
    slug: string;
    merch_crops: { '2:3': { zoom: number } };
  };
  assert.equal(saved.id, 'overlay-fixture');
  assert.equal(saved.master_file, 'b2://alan-woodyard/masters/overlay-fixture.tif');
  assert.equal(saved.title, 'Snap Title');
  assert.equal(saved.slug, 'overlay-fixture-live');
  assert.equal(saved.merch_crops['2:3'].zoom, 1.25);
});
