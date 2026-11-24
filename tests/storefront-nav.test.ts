import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getEffectiveCatalog, type EffectiveArtwork, type SessionKv } from '../src/lib/artwork-overlay';
import {
  GIFT_CATEGORIES,
  buildPublicArtworks,
  categoryFloors,
  giftCategoryForProduct,
  minPrice,
  renderArtworkRoute,
  renderCatalogRoute,
  resolveStoreOffers,
  selectGiftOffer,
} from '../src/lib/storefront-nav';

function artwork(partial: Partial<EffectiveArtwork> & Pick<EffectiveArtwork, 'id' | 'title' | 'merch_approved'>): EffectiveArtwork {
  return {
    slug: partial.slug || partial.id,
    caption: partial.caption || '',
    description: partial.description || '',
    collections: partial.collections || [],
    tags: partial.tags || [],
    master_file: partial.master_file || 'assets/source-masters/Secret.tif',
    merch_crops: partial.merch_crops || {},
    data: partial.data || {
      id: partial.id,
      title: partial.title,
      solo_display: true,
      print_variants: [
        { sku: 'GLOBAL-FAP-16x24', substrate: 'Hahnemühle Photo Rag', size: '16x24"', price_cents: 19500 },
      ],
    },
    ...partial,
  };
}

test('minPrice comes from resolved merch_approved SKUs and ignores the $195 print fallback', () => {
  const piece = artwork({
    id: 'sample-piece',
    title: 'Sample Piece',
    collections: ['harbor'],
    merch_approved: ['prodigi-mug-11oz', 'printify-deskmat-std', 'not-a-real-sku'],
    merch_crops: {
      '17:7': { panX: -1.5, panY: -82, zoom: 1 },
      '16:7': { panX: 0, panY: -10, zoom: 1 },
    },
  });
  const offers = resolveStoreOffers(piece.merch_approved, piece.merch_crops);
  assert.equal(minPrice(offers), 22);
  assert.equal(offers.some((offer) => offer.sku === 'GLOBAL-FAP-16x24'), false);
  assert.equal(offers.some((offer) => offer.price === 195), false);

  const rejected = resolveStoreOffers(['prodigi-rag-16x24', 'prodigi-mug-11oz'], {
    '2:3': { rejected: true, rejected_at: '2026-11-23T00:00:00.000Z' },
  });
  assert.equal(rejected.some((offer) => offer.sku === 'GLOBAL-FAP-16x24'), false);
  assert.equal(minPrice(rejected), 22);

  const unpublished = artwork({
    id: 'unpublished-piece',
    title: 'Unpublished Piece',
    merch_approved: [],
  });
  const listed = buildPublicArtworks([piece, unpublished]);
  assert.deepEqual(listed.map((item) => item.slug), ['sample-piece']);
  assert.equal(listed[0]?.minPrice, 22);

  const html = renderCatalogRoute({
    catalog: [piece, unpublished],
    route: 'artworks',
    searchParams: new URLSearchParams(),
  }).html;
  assert.equal(html.includes('Inquire'), false);
  assert.equal(html.includes('$195'), false);
  assert.equal(html.includes('19500'), false);
  assert.equal(html.includes('Unpublished Piece'), false);
  assert.equal(html.includes('Secret.tif'), false);
  assert.equal(html.includes('source-masters'), false);
  assert.match(html, /data-min-price="22"/);
  assert.match(html, /From \$22/);
});

test('gift categories filter the grid and preselect the SKU crop on the artwork page', () => {
  const piece = artwork({
    id: 'sample-piece',
    title: 'Sample Piece',
    collections: ['harbor'],
    merch_approved: ['prodigi-mug-11oz', 'prodigi-mug-15oz', 'printify-deskmat-std', 'printify-coasters-4pk'],
    merch_crops: {
      '17:7': { panX: -1.5, panY: -82, zoom: 1 },
      '16:7': { panX: 4, panY: -70, zoom: 1 },
      '1:1': { panX: 0, panY: 0, zoom: 1 },
    },
  });
  const offers = resolveStoreOffers(piece.merch_approved, piece.merch_crops);
  assert.equal(giftCategoryForProduct('prodigi-mug-11oz'), 'mugs-drinkware');
  assert.equal(giftCategoryForProduct('printify-deskmat-std'), 'coasters-deskmats');
  assert.equal(giftCategoryForProduct('printify-coasters-4pk'), 'coasters-deskmats');
  assert.equal(giftCategoryForProduct('prodigi-acrylic-block-4x4'), 'acrylic-blocks');
  assert.equal(giftCategoryForProduct('prodigi-rag-8x10'), 'prints-frames');
  assert.equal(giftCategoryForProduct('prodigi-frame-16x20'), 'prints-frames');
  assert.equal(giftCategoryForProduct('printify-puzzle-120'), 'puzzles-games');
  assert.equal(giftCategoryForProduct('gelato-wall-calendar'), 'puzzles-games');
  assert.equal(giftCategoryForProduct('printify-pillow-18'), 'home-totes');
  assert.equal(giftCategoryForProduct('printful-tote-bag'), 'home-totes');
  assert.equal(giftCategoryForProduct('prodigi-met-12x18'), 'metal-prints');
  assert.equal(giftCategoryForProduct('displate-steel-m'), 'metal-prints');
  assert.equal(giftCategoryForProduct('prodigi-post-10pk'), 'cards-folios');
  assert.equal(giftCategoryForProduct('prodigi-folio-5x7'), 'cards-folios');
  assert.equal(giftCategoryForProduct('printful-tee-chest'), null);

  const selected = selectGiftOffer(offers, 'mugs-drinkware');
  assert.equal(selected?.sku, 'GLOBAL-MUG-11oz');
  assert.equal(selected?.ratio, '17:7');
  assert.equal(selected?.price, 22);

  const catalog = renderCatalogRoute({
    catalog: [piece],
    route: 'home',
    searchParams: new URLSearchParams('gift=mugs-drinkware'),
  });
  assert.match(catalog.html, /Mugs from \$22/);
  assert.match(catalog.html, /Shop by Gift/);
  assert.match(catalog.html, /Shop by Artwork \/ Collection/);
  assert.match(catalog.html, /href="\/artwork\/sample-piece\?gift=mugs-drinkware"/);
  assert.equal(catalog.html.includes('Inquire'), false);

  const deskOnly = artwork({
    id: 'desk-only',
    title: 'Desk Only',
    merch_approved: ['printify-deskmat-std'],
  });
  const filtered = renderCatalogRoute({
    catalog: [piece, deskOnly],
    route: 'artworks',
    searchParams: new URLSearchParams('gift=mugs-drinkware&collection=harbor'),
  }).html;
  assert.match(filtered, /data-slug="sample-piece"/);
  assert.equal(filtered.includes('data-slug="desk-only"'), false);

  const detail = renderArtworkRoute({
    artwork: piece,
    catalog: [piece],
    searchParams: new URLSearchParams('gift=mugs-drinkware'),
  });
  assert.match(detail.html, /class="crop-preview is-active"/);
  assert.match(detail.html, /data-gift="mugs-drinkware"/);
  assert.match(detail.html, /data-ratio="17:7"/);
  assert.match(detail.html, /data-sku="GLOBAL-MUG-11oz"/);
  assert.match(detail.html, /aspect-ratio: 17 \/ 7/);
  assert.match(detail.html, /--crop-pan-x: -1\.5/);
  assert.match(detail.html, /--crop-pan-y: -82/);
  assert.match(detail.html, /data-selected="true"/);
  assert.match(detail.html, /href="\/artwork\/sample-piece\?gift=mugs-drinkware"/);
  assert.equal(detail.html.includes('data-sku="PFY-DESKMAT-STD"'), false);
  assert.equal(detail.html.includes('Inquire'), false);
  assert.equal(detail.html.includes('purchase-panel') && detail.mainHtml.includes('id="purchase-panel"'), true);
  assert.equal(detail.html.includes('No everyday'), false);
  assert.equal(GIFT_CATEGORIES.length, 8);

  const floors = categoryFloors(buildPublicArtworks([piece]));
  assert.equal(floors.find((floor) => floor.id === 'mugs-drinkware')?.price, 22);
  assert.equal(floors.find((floor) => floor.id === 'coasters-deskmats')?.price, 32);
});

test('live catalog omits zero-SKU artworks and applies KV merch edits without a rebuild', async () => {
  const bundled = await getEffectiveCatalog();
  const home = renderCatalogRoute({
    catalog: bundled,
    route: 'home',
    searchParams: new URLSearchParams(),
  });
  const artworks = renderCatalogRoute({
    catalog: bundled,
    route: 'artworks',
    searchParams: new URLSearchParams(),
  });
  for (const page of [home, artworks]) {
    assert.equal(page.html.includes('Inquire'), false);
    assert.equal(page.html.includes('$195'), false);
    assert.equal(page.html.includes('19500'), false);
    assert.equal(page.html.includes('source-masters'), false);
    assert.match(page.html, /data-slug="rhythm-and-flow"/);
    assert.match(page.html, /data-min-price="22"/);
    assert.match(page.html, /Mugs from \$22/);
    assert.equal(page.html.includes('data-slug="norderney-01"'), false);
    assert.equal(page.html.includes('data-slug="white-wings"'), false);
    assert.equal(page.html.includes('data-slug="caged-heron"'), false);
    assert.equal(page.html.includes('data-slug="a-dock-mono"'), false);
  }
  assert.match(home.html, /href="\/\?gift=mugs-drinkware"/);
  assert.match(artworks.html, /href="\/artworks\?gift=mugs-drinkware"/);

  const rhythm = bundled.find((item) => item.id === 'rhythm-and-flow');
  assert.ok(rhythm);
  const detail = renderArtworkRoute({
    artwork: rhythm,
    catalog: bundled,
    searchParams: new URLSearchParams('gift=mugs-drinkware'),
  });
  assert.match(detail.html, /data-sku="GLOBAL-MUG-11oz"/);
  assert.match(detail.html, /data-ratio="17:7"/);
  assert.match(detail.html, /aspect-ratio: 17 \/ 7/);
  assert.equal(detail.html.includes('Inquire'), false);
  assert.equal(detail.html.includes('$195'), false);
  assert.equal(detail.html.includes(rhythm.master_file), false);
  assert.equal(detail.mainHtml.includes('printful-tote-bag'), false);

  const empty = bundled.find((item) => item.id === 'norderney-01');
  assert.ok(empty);
  assert.equal(empty.merch_approved.length, 0);
  const hidden = renderArtworkRoute({
    artwork: empty,
    catalog: bundled,
    searchParams: new URLSearchParams(),
  });
  assert.equal(hidden.html.includes('Inquire'), false);
  assert.equal(hidden.html.includes('id="purchase-panel"'), false);
  assert.equal(hidden.html.includes('$195'), false);

  const memory = new Map<string, string>([
    [
      'awp_merch_crops',
      JSON.stringify({
        'rhythm-and-flow': {
          title: 'KV Rhythm',
          merch_approved: ['printify-deskmat-std'],
        },
        'norderney-01': {
          title: 'KV North',
          merch_approved: ['prodigi-mug-11oz'],
        },
      }),
    ],
  ]);
  const kv: SessionKv = {
    async get(key: string) {
      return memory.get(key) ?? null;
    },
  };
  const live = await getEffectiveCatalog({ SESSION: kv });
  const liveRhythm = live.find((item) => item.id === 'rhythm-and-flow');
  assert.equal(liveRhythm?.title, 'KV Rhythm');
  assert.equal(liveRhythm?.master_file, rhythm.master_file);
  assert.deepEqual(liveRhythm?.merch_approved, ['printify-deskmat-std']);
  const livePage = renderCatalogRoute({
    catalog: live,
    route: 'artworks',
    searchParams: new URLSearchParams(),
  }).html;
  assert.match(livePage, /KV Rhythm/);
  assert.match(livePage, /KV North/);
  assert.match(livePage, /data-slug="rhythm-and-flow"[^>]*data-min-price="48"/);
  assert.match(livePage, /data-slug="norderney-01"[^>]*data-min-price="22"/);
  assert.equal(livePage.includes('Inquire'), false);
  assert.equal(livePage.includes('$195'), false);
  assert.equal(livePage.includes(rhythm.master_file), false);
});

test('storefront CSS keeps 44px targets, safe areas, and a fluid product grid', () => {
  const css = readFileSync(new URL('../src/styles/storefront-nav.css', import.meta.url), 'utf8');
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /min-width:\s*44px/);
  assert.match(css, /env\(safe-area-inset-top\)/);
  assert.match(css, /env\(safe-area-inset-right\)/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /env\(safe-area-inset-left\)/);
  assert.match(css, /overflow-x:\s*clip/);
  assert.match(css, /max-width:\s*100%/);
  assert.match(css, /scroll-snap-type:\s*x mandatory/);
  assert.match(css, /minmax\(240px,\s*1fr\)/);
  assert.match(css, /@media \(max-width:\s*767px\)/);
  assert.match(css, /@media \(min-width:\s*768px\) and \(max-width:\s*1024px\)/);
  assert.match(css, /@media \(min-width:\s*1025px\)/);
  assert.match(css, /position:\s*sticky/);
  assert.equal(css.includes('--theme-'), false);
  assert.match(css, /var\(--awp-accent\)/);
  assert.equal(/(^|[^-a-zA-Z])width:\s*\d+px/.test(css), false);

  for (const relativePath of ['src/pages/index.astro', 'src/pages/artworks/index.astro', 'src/pages/artwork/[id].astro']) {
    const source = readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
    assert.match(source, /export const prerender = false/);
    assert.match(source, /getEffectiveCatalog\(\{ SESSION: session \}\)/);
    assert.equal(source.includes('Inquire'), false);
    assert.equal(source.includes('19500'), false);
  }
});
