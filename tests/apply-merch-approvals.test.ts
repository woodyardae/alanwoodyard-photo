import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  applyApprovalDecisions,
  collectApprovedProducts,
  normalizeDecisions,
  shouldWrite,
} from '../scripts/apply-merch-approvals';
import { seeWhatSticksPortalFile } from '../scripts/sws-paths';

test('normalizeDecisions reads the live KV map and a local decision array', () => {
  const fromKv = normalizeDecisions({
    'a-dock-mono': {
      __rejected: true,
      '2:3': { panX: 1, panY: 2, zoom: 1.1, approved_products: ['print-16x24'] },
    },
    'sws-retro-neon-dreams-bomber': {
      '1:1': { panX: 0, panY: 0, zoom: 1, approved_products: ['bomber'] },
    },
  });
  assert.ok(fromKv);
  assert.equal(fromKv.find((item) => item.id === 'a-dock-mono')?.rejected, true);
  assert.equal(fromKv.find((item) => item.id === 'sws-retro-neon-dreams-bomber')?.approved, true);

  const fromFile = normalizeDecisions([
    { id: 'printful-2011039', decision: 'rejected' },
    { id: 'printify-60c3298fd91d8471c5a932b1', decision: 'approved' },
  ]);
  assert.deepEqual(fromFile?.map((item) => [item.id, item.rejected, item.approved]), [
    ['printful-2011039', true, false],
    ['printify-60c3298fd91d8471c5a932b1', false, true],
  ]);

  assert.equal(normalizeDecisions({ error: 'Unauthorized' }), null);
  assert.deepEqual(normalizeDecisions({}), []);
});

test('collectApprovedProducts keeps explicit product lists and named crop keys', () => {
  assert.deepEqual(collectApprovedProducts({
    '1:1': { approved_products: ['printify-coasters'] },
    'Displate Steel Poster': { crop: { zoom: 1 } },
    '4:5': { approved_products: [] },
  }), ['printify-coasters', 'Displate Steel Poster']);
  assert.deepEqual(collectApprovedProducts({
    '1:1': { rejected: true, rejected_at: '2026-01-01T00:00:00.000Z' },
    '2:3': { approved_products: ['rag-16x24'] },
  }), ['rag-16x24']);
});

test('applyApprovalDecisions stores a rejected ratio without approving the SKU', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'merch-crop-reject-'));
  const artworksDir = path.join(root, 'artworks');
  const productsPath = path.join(root, 'products.json');
  fs.mkdirSync(artworksDir);
  fs.writeFileSync(path.join(artworksDir, 'a-dock-mono.json'), `${JSON.stringify({
    id: 'a-dock-mono',
    title: 'A Dock Mono',
    merch_approved: ['old-print'],
    merch_crops: { '2:3': { panX: 1, panY: 0, zoom: 1, approved_products: ['old-print'] } },
  }, null, 2)}\n`);
  fs.writeFileSync(productsPath, `${JSON.stringify([
    { id: 'printful-keep', name: 'Leave Me Alone', image: 'assets/generated/leave-me.png', approved: true },
  ], null, 2)}\n`);

  const onlyRejected = normalizeDecisions({
    'a-dock-mono': {
      '1:1': { rejected: true, rejected_at: '2026-01-01T00:00:00.000Z' },
    },
  });
  assert.ok(onlyRejected);
  assert.equal(onlyRejected[0].approved, false);
  assert.equal(onlyRejected[0].rejected, false);

  const result = applyApprovalDecisions(onlyRejected, { artworksDir, productsPath }, { dryRun: false, render: false });
  const updated = JSON.parse(fs.readFileSync(path.join(artworksDir, 'a-dock-mono.json'), 'utf8'));
  assert.equal(updated.merch_rejected, undefined);
  assert.equal(updated.merch_crops['1:1'].rejected, true);
  assert.equal(updated.merch_crops['2:3'].zoom, 1);
  assert.deepEqual(updated.merch_approved, ['old-print']);
  assert.deepEqual(result.updatedArtworks, ['a-dock-mono']);
  assert.deepEqual(result.updatedProducts, []);
  assert.deepEqual(result.renderIds, []);
  assert.equal(JSON.parse(fs.readFileSync(productsPath, 'utf8'))[0].approved, true);
});

test('a rejected crop stays off the image while another ratio stays accepted', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'merch-crop-mixed-'));
  const artworksDir = path.join(root, 'artworks');
  const productsPath = path.join(root, 'products.json');
  fs.mkdirSync(artworksDir);
  fs.writeFileSync(path.join(artworksDir, 'a-dock-mono.json'), `${JSON.stringify({
    id: 'a-dock-mono',
    title: 'A Dock Mono',
    merch_approved: ['rag-16x24', 'printify-coasters'],
    merch_crops: {
      '2:3': { panX: 1, panY: 0, zoom: 1, approved_products: ['rag-16x24'] },
      '4:5': { panX: 0, panY: 2, zoom: 1.05, approved_products: ['frame-16x20'] },
    },
  }, null, 2)}\n`);
  fs.writeFileSync(productsPath, `${JSON.stringify([
    { id: 'a-dock-mono', name: 'A Dock Mono', image: 'assets/generated/a-dock-mono.png', approved: true },
    { id: 'printify-other', name: 'Leave Me Alone', image: 'assets/generated/leave-me.png', approved: false },
  ], null, 2)}\n`);

  const mixed = normalizeDecisions({
    'a-dock-mono': {
      '1:1': {
        rejected: true,
        rejected_at: '2026-01-01T00:00:00.000Z',
        zoom: 1.4,
        panX: 9,
        approved_products: ['printify-coasters'],
      },
      '2:3': { panX: 3, panY: 0, zoom: 1.2, approved_products: ['rag-16x24'] },
    },
  });
  assert.ok(mixed);
  assert.equal(mixed[0].rejected, false);
  assert.equal(mixed[0].approved, true);

  const mixedResult = applyApprovalDecisions(mixed, { artworksDir, productsPath }, { dryRun: false, render: false });
  const mixedFile = JSON.parse(fs.readFileSync(path.join(artworksDir, 'a-dock-mono.json'), 'utf8'));
  assert.equal(mixedFile.merch_rejected, undefined);
  assert.deepEqual(mixedFile.merch_crops['1:1'], {
    rejected: true,
    rejected_at: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(mixedFile.merch_crops['2:3'].zoom, 1.2);
  assert.equal(mixedFile.merch_crops['4:5'].zoom, 1.05);
  assert.deepEqual(mixedFile.merch_approved, ['rag-16x24', 'frame-16x20']);
  assert.deepEqual(mixedResult.renderIds, ['a-dock-mono']);
  assert.deepEqual(mixedResult.updatedProducts, []);
  assert.equal(JSON.parse(fs.readFileSync(productsPath, 'utf8'))[0].approved, true);

  const flagged = normalizeDecisions([
    {
      id: 'a-dock-mono',
      decision: 'approved',
      crops: {
        '16:9': {
          rejected: true,
          rejected_at: '2026-02-02T00:00:00.000Z',
          zoom: 1.8,
          approved_products: ['prodigi-met-18x32'],
        },
      },
    },
  ]);
  assert.ok(flagged);
  assert.equal(flagged[0].approved, true);
  const flaggedResult = applyApprovalDecisions(flagged, { artworksDir, productsPath }, { dryRun: false, render: false });
  const flaggedFile = JSON.parse(fs.readFileSync(path.join(artworksDir, 'a-dock-mono.json'), 'utf8'));
  assert.equal(flaggedFile.merch_rejected, undefined);
  assert.deepEqual(flaggedFile.merch_crops['16:9'], {
    rejected: true,
    rejected_at: '2026-02-02T00:00:00.000Z',
  });
  assert.equal(flaggedFile.merch_crops['2:3'].zoom, 1.2);
  assert.equal(flaggedFile.merch_approved.includes('prodigi-met-18x32'), false);
  assert.equal(flaggedFile.merch_approved.includes('rag-16x24'), true);
  assert.deepEqual(flaggedResult.renderIds, []);
  assert.deepEqual(flaggedResult.updatedProducts, []);
  assert.equal(JSON.parse(fs.readFileSync(productsPath, 'utf8'))[0].approved, true);
});

test('shouldWrite applies a live payload and keeps offline fallback in dry-run', () => {
  assert.equal(shouldWrite('live', { dryRun: false, apply: false }), true);
  assert.equal(shouldWrite('live', { dryRun: true, apply: true }), false);
  assert.equal(shouldWrite('fallback', { dryRun: false, apply: false }), false);
  assert.equal(shouldWrite('fallback', { dryRun: false, apply: true }), true);
  assert.equal(shouldWrite('none', { dryRun: false, apply: true }), false);
});

test('applyApprovalDecisions updates only the matching artwork and product records', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'merch-approvals-'));
  const artworksDir = path.join(root, 'artworks');
  const productsPath = path.join(root, 'products.json');
  const queuePath = path.join(root, 'queue.json');
  fs.mkdirSync(artworksDir);

  const artwork = {
    id: 'a-dock-mono',
    title: 'A Dock Mono',
    merch_approved: [],
    merch_crops: {},
  };
  const untouchedArtwork = path.join(artworksDir, 'indie.json');
  fs.writeFileSync(path.join(artworksDir, 'a-dock-mono.json'), `${JSON.stringify(artwork, null, 2)}\n`);
  fs.writeFileSync(untouchedArtwork, `${JSON.stringify({ id: 'indie', title: 'Indie' }, null, 2)}\n`);
  const untouchedBefore = fs.readFileSync(untouchedArtwork, 'utf8');

  const products = [
    { id: 'printify-neon', name: 'Neon Dreams Bomber Jacket', image: 'assets/generated/neon_dreams_bomber.png', approved: false },
    { id: 'printful-2011039', name: 'Retro Diner Vintage Coffee Mug', image: 'assets/generated/60s_psychedelic_peace.png', approved: true },
    { id: 'printful-keep', name: 'Leave Me Alone', image: 'assets/generated/leave-me.png', approved: false },
  ];
  fs.writeFileSync(productsPath, `${JSON.stringify(products, null, 2)}\n`);
  fs.writeFileSync(queuePath, JSON.stringify([
    {
      id: 'sws-retro-neon-dreams-bomber',
      source_path: 'web/seewhatsticks-portal/assets/generated/neon_dreams_bomber.png',
    },
  ]));

  const outside = path.join(root, 'outside.json');
  const decisions = normalizeDecisions({
    'a-dock-mono': {
      '2:3': { panX: 4, panY: 0, zoom: 1.2, approved_products: ['rag-16x24'] },
    },
    'sws-retro-neon-dreams-bomber': {
      '1:1': { panX: 0, panY: 0, zoom: 1, approved_products: ['bomber'] },
    },
    'printful-2011039': { __rejected: true },
    '../outside': { __rejected: true },
    'missing-artwork': { '1:1': { zoom: 1, approved_products: ['nope'] } },
  });
  assert.ok(decisions);

  const result = applyApprovalDecisions(decisions, { artworksDir, productsPath, queuePath }, { dryRun: false, render: false });

  const updatedArtwork = JSON.parse(fs.readFileSync(path.join(artworksDir, 'a-dock-mono.json'), 'utf8'));
  assert.equal(updatedArtwork.merch_rejected, undefined);
  assert.deepEqual(updatedArtwork.merch_approved, ['rag-16x24']);
  assert.equal(updatedArtwork.merch_crops['2:3'].zoom, 1.2);
  assert.equal(fs.readFileSync(untouchedArtwork, 'utf8'), untouchedBefore);
  assert.equal(fs.existsSync(outside), false);

  const updatedProducts = JSON.parse(fs.readFileSync(productsPath, 'utf8'));
  assert.equal(updatedProducts[0].approved, true);
  assert.equal(updatedProducts[1].approved, false);
  assert.equal(updatedProducts[2].approved, false);
  assert.deepEqual(result.updatedArtworks, ['a-dock-mono']);
  assert.deepEqual(result.updatedProducts, ['printify-neon', 'printful-2011039']);
  assert.ok(result.unmatched.includes('missing-artwork'));
  assert.ok(result.unmatched.includes('../outside'));
  assert.deepEqual(result.renderIds, ['a-dock-mono']);

  const beforeDry = fs.readFileSync(productsPath, 'utf8');
  const dry = applyApprovalDecisions([
    { id: 'printful-keep', rejected: false, unreject: false, approved: true, crops: {} },
  ], { artworksDir, productsPath, queuePath }, { dryRun: true, render: false });
  assert.equal(fs.readFileSync(productsPath, 'utf8'), beforeDry);
  assert.deepEqual(dry.updatedProducts, ['printful-keep']);
  assert.equal(dry.dryRun, true);
});

test('applyApprovalDecisions does not guess when two products share an image', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'merch-approvals-ambiguous-'));
  const artworksDir = path.join(root, 'artworks');
  const productsPath = path.join(root, 'products.json');
  fs.mkdirSync(artworksDir);
  const products = [
    { id: 'one', name: 'One', image: 'assets/generated/neon_dreams_bomber.png', approved: false },
    { id: 'two', name: 'Two', image: 'assets/generated/neon_dreams_bomber.png', approved: true },
  ];
  fs.writeFileSync(productsPath, `${JSON.stringify(products, null, 2)}\n`);

  const result = applyApprovalDecisions([
    {
      id: 'sws-retro-neon-dreams-bomber',
      rejected: true,
      unreject: false,
      approved: false,
      crops: {},
    },
  ], { artworksDir, productsPath }, { dryRun: false, render: false });

  const after = JSON.parse(fs.readFileSync(productsPath, 'utf8'));
  assert.equal(after[0].approved, false);
  assert.equal(after[1].approved, true);
  assert.deepEqual(result.ambiguous, ['sws-retro-neon-dreams-bomber']);
  assert.deepEqual(result.updatedProducts, []);
});

test('storefront banners keep the holiday estimate on existing tokens', () => {
  const header = fs.readFileSync(path.resolve('src/components/Header.astro'), 'utf8');
  const layout = fs.readFileSync(path.resolve('src/layouts/Layout.astro'), 'utf8');
  const checkout = fs.readFileSync(path.resolve('src/pages/checkout.astro'), 'utf8');
  const cart = fs.readFileSync(path.resolve('src/components/CartDrawer.astro'), 'utf8');
  const confirmation = fs.readFileSync(path.resolve('src/pages/order-confirmation.astro'), 'utf8');
  const policies = fs.readFileSync(path.resolve('src/pages/policies.astro'), 'utf8');
  const portal = fs.readFileSync(seeWhatSticksPortalFile('index.html'), 'utf8');
  const tokens = fs.readFileSync(seeWhatSticksPortalFile('css/tokens.css'), 'utf8');
  const phrase = 'Order by Dec\\. 7 for economy, or Dec\\. 9 for standard, for Christmas Delivery';
  const surchargeWindow = /\$0\.40 US shipping surcharge from Oct\. 15, 2026 through Jan\. 17, 2027/;
  const orderCopy = [checkout, cart, confirmation, policies].map((source) => {
    const note = source.match(/<p class="holiday-ship-note[^"]*"[\s\S]*?<\/p>/);
    assert.ok(note, 'order page is missing holiday-ship-note');
    return note[0];
  });

  assert.match(header, new RegExp(phrase));
  assert.match(header, /holiday-ship-banner/);
  assert.match(header, /economy shipping/);
  assert.match(header, /standard shipping/);
  assert.match(header, /not a delivery guarantee/);
  assert.match(header, surchargeWindow);
  assert.match(header, /Alaska, Hawaii, and US territories/);
  assert.doesNotMatch(header, /\u2014|\u2013/);
  assert.match(layout, /--awp-surface/);
  assert.match(layout, /--holiday-banner-bg:\s*var\(--awp-surface\)/);
  assert.match(layout, /var\(--theme-surface\)/);
  assert.match(layout, /\.holiday-ship-note/);
  assert.match(layout, /var\(--awp-surface\)/);
  assert.match(layout, /var\(--awp-border\)/);
  for (const copy of orderCopy) {
    assert.match(copy, new RegExp(phrase));
    assert.match(copy, /holiday-ship-note/);
    assert.match(copy, /economy shipping/);
    assert.match(copy, /standard shipping/);
    assert.match(copy, /not a delivery guarantee/);
    assert.match(copy, surchargeWindow);
    assert.doesNotMatch(copy, /\u2014|\u2013/);
  }
  assert.match(portal, new RegExp(phrase));
  assert.match(portal, /holiday-ship-banner/);
  assert.match(portal, /economy shipping/);
  assert.match(portal, /standard shipping/);
  assert.match(portal, /not a delivery guarantee/);
  assert.match(portal, surchargeWindow);
  assert.doesNotMatch(portal, /sweatshop/i);
  assert.doesNotMatch(portal, /\u2014|\u2013/);

  const bannerCss = tokens.slice(tokens.indexOf('.holiday-ship-banner'));
  assert.match(tokens, /--sws-surface:\s*var\(--surface-glass\)/);
  assert.match(tokens, /--holiday-banner-bg:\s*var\(--sws-surface\)/);
  assert.match(bannerCss, /var\(--sws-text\)/);
  assert.match(bannerCss, /var\(--sws-surface\)/);
  assert.match(bannerCss, /var\(--sws-border\)/);
  assert.doesNotMatch(bannerCss, /#[0-9a-fA-F]{3,8}/);

  const noteCss = layout.slice(
    layout.indexOf('.holiday-ship-note'),
    layout.indexOf('/* 1. WALNUT'),
  );
  assert.match(noteCss, /var\(--awp-text\)/);
  assert.match(noteCss, /var\(--awp-surface\)/);
  assert.match(noteCss, /var\(--awp-border\)/);
  assert.match(noteCss, /var\(--awp-text-muted\)/);
  assert.doesNotMatch(noteCss, /#[0-9a-fA-F]{3,8}/);
});
