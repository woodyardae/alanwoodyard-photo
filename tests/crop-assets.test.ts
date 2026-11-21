import test from 'node:test';
import assert from 'node:assert/strict';
import pricingMatrix from '../src/content/pricing-matrix.json';
import {
  cropFileToken,
  isUncroppedMasterApproved,
  printMasterRelativePath,
  ratioKeyFromSize,
  resolveCropSelection,
  resolvePrintAssetUrl,
  UNCROPPED_MASTER_CROP_KEY,
  type PricingMatrixEntry,
} from '../src/lib/checkout-catalog';
import { prepareCheckoutCart, type CheckoutCartItem } from '../src/lib/create-checkout-session';
import {
  AMAZON_HEADERS,
  PHOTO_ETSY_HEADERS,
  SWS_ETSY_HEADERS,
  photoEtsyRows,
  photoHeroes,
  swsEtsyRows,
  swsHeroes,
  type PhotoArtwork,
  type SwsProduct,
} from '../scripts/export-channel-packs';

const matrix = pricingMatrix as Record<string, PricingMatrixEntry>;
const origin = 'https://alanwoodyard.photo';
const masters = 'https://masters.example.test';

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

function photo(overrides: Partial<PhotoArtwork> = {}): PhotoArtwork {
  return {
    slug: 'norderney-62',
    title: 'Norderney 62',
    description: 'Baltic light.',
    tags: ['seascape'],
    collections: ['germany'],
    mood: 'calm',
    width: 8000,
    height: 4500,
    variants: [
      { sku: 'prodigi:rag-16x24', substrate: 'Hahnemühle Photo Rag', size: '16x24', price_cents: 19500 },
    ],
    crops: {},
    ...overrides,
  };
}

test('render-print-crops crop tokens match /masters/{slug}/{crop}.{ext} checkout paths', () => {
  assert.equal(cropFileToken('2:3'), '2-3');
  assert.equal(cropFileToken('16:9'), '16-9');
  assert.equal(cropFileToken('Ceramic Waterfront Mug'), 'ceramic-waterfront-mug');
  assert.equal(cropFileToken('__rejected'), null);
  assert.equal(cropFileToken(UNCROPPED_MASTER_CROP_KEY), null);
  assert.equal(
    printMasterRelativePath('norderney-62', cropFileToken('2:3')),
    '/masters/norderney-62/2-3.tif'
  );
  assert.equal(
    printMasterRelativePath('norderney-62', cropFileToken('Ceramic Waterfront Mug')),
    '/masters/norderney-62/ceramic-waterfront-mug.tif'
  );
});

test('size and ratio metadata select the crop master; uncropped raw file needs explicit approval', () => {
  assert.equal(ratioKeyFromSize('16x24"'), '2:3');
  assert.equal(ratioKeyFromSize('24x36'), '2:3');
  assert.equal(ratioKeyFromSize('8x10'), '4:5');
  assert.equal(ratioKeyFromSize('11oz'), null);

  const sized = resolveCropSelection({ size: '16x24', sku: 'GLOBAL-FAP-16x24', crops: {} });
  assert.equal(sized.ok, true);
  if (!sized.ok) return;
  assert.equal(sized.crop, '2-3');
  assert.equal(sized.ratio, '2:3');
  assert.equal(printMasterRelativePath('norderney-62', sized.crop), '/masters/norderney-62/2-3.tif');

  const cropped = resolvePrintAssetUrl(origin, 'norderney-62', { printMastersBaseUrl: masters }, sized.crop);
  assert.equal(cropped.ok, true);
  if (cropped.ok) assert.equal(cropped.url, `${masters}/masters/norderney-62/2-3.tif`);

  const unapproved = resolveCropSelection({ size: '11oz', sku: 'GLOBAL-MUG-11oz', crops: {} });
  assert.equal(unapproved.ok, false);
  if (!unapproved.ok) assert.match(unapproved.error, /uncropped print master/i);

  const approvedCrops = {
    [UNCROPPED_MASTER_CROP_KEY]: { approved_products: ['GLOBAL-MUG-11oz'] },
  };
  assert.equal(isUncroppedMasterApproved(approvedCrops, 'GLOBAL-MUG-11oz', '11oz'), true);
  const unsized = resolveCropSelection({
    size: '11oz',
    sku: 'GLOBAL-MUG-11oz',
    crops: approvedCrops,
  });
  assert.equal(unsized.ok, true);
  if (!unsized.ok) return;
  assert.equal(unsized.crop, null);
  const raw = resolvePrintAssetUrl(origin, 'norderney-62', { printMastersBaseUrl: masters }, unsized.crop);
  assert.equal(raw.ok, true);
  if (raw.ok) assert.equal(raw.url, `${masters}/masters/norderney-62.tif`);

  const missing = resolvePrintAssetUrl(origin, 'norderney-62', {}, '2-3');
  assert.equal(missing.ok, false);

  const preview = resolvePrintAssetUrl(origin, 'norderney-62', { allowCleanPreviewAssets: true }, '2-3');
  assert.equal(preview.ok, true);
  if (preview.ok) assert.equal(preview.url, `${origin}/images/artworks/clean/norderney-62.webp`);

  const unsafe = resolvePrintAssetUrl(origin, 'norderney-62', { printMastersBaseUrl: masters }, '../secret');
  assert.equal(unsafe.ok, false);

  const blankCrop = resolvePrintAssetUrl(origin, 'norderney-62', { printMastersBaseUrl: masters }, '');
  assert.equal(blankCrop.ok, false);

  const spaceCrop = resolvePrintAssetUrl(origin, 'norderney-62', { printMastersBaseUrl: masters }, '   ');
  assert.equal(spaceCrop.ok, false);
});

test('__uncropped approval rejects near-matches, loose keys, and substring spoofing', () => {
  assert.equal(isUncroppedMasterApproved(null, 'GLOBAL-MUG-11oz', '11oz'), false);
  assert.equal(isUncroppedMasterApproved({}, 'GLOBAL-MUG-11oz', '11oz'), false);
  assert.equal(
    isUncroppedMasterApproved({ [UNCROPPED_MASTER_CROP_KEY]: { approved_products: [] } }, 'GLOBAL-MUG-11oz', '11oz'),
    false
  );
  assert.equal(
    isUncroppedMasterApproved({ uncropped: { approved_products: ['GLOBAL-MUG-11oz'] } }, 'GLOBAL-MUG-11oz', '11oz'),
    false
  );
  assert.equal(
    isUncroppedMasterApproved(
      { [UNCROPPED_MASTER_CROP_KEY]: { crop: { approved_products: ['GLOBAL-MUG-11oz'] } } },
      'GLOBAL-MUG-11oz',
      '11oz'
    ),
    false
  );
  assert.equal(
    isUncroppedMasterApproved({ [UNCROPPED_MASTER_CROP_KEY]: { approved_products: ['GLOBAL'] } }, 'GLOBAL-MUG-11oz', '11oz'),
    false
  );
  assert.equal(
    isUncroppedMasterApproved(
      { [UNCROPPED_MASTER_CROP_KEY]: { approved_products: ['GLOBAL-MUG-11oz'] } },
      'GLOBAL-MUG-15oz',
      '15oz'
    ),
    false
  );
  assert.equal(
    isUncroppedMasterApproved(
      { [UNCROPPED_MASTER_CROP_KEY]: { approved_products: ['GLOBAL-MUG-11oz'] } },
      'PRINTIFY-TUMBLER-11oz',
      '11oz'
    ),
    false
  );
  assert.equal(
    isUncroppedMasterApproved(
      { [UNCROPPED_MASTER_CROP_KEY]: { approved_products: ['prodigi:GLOBAL-MUG-11oz'] } },
      'printify:GLOBAL-MUG-11oz',
      '11oz'
    ),
    false
  );
  assert.equal(
    isUncroppedMasterApproved(
      { [UNCROPPED_MASTER_CROP_KEY]: { approved_products: ['prodigi:GLOBAL-MUG-11oz'] } },
      'prodigi:GLOBAL-MUG-11oz',
      '11oz'
    ),
    true
  );
  assert.equal(
    isUncroppedMasterApproved(
      { [UNCROPPED_MASTER_CROP_KEY]: { approved_products: ['GLOBAL-MUG-11oz'] } },
      'prodigi:GLOBAL-MUG-11oz',
      '11oz'
    ),
    true
  );
  assert.equal(
    isUncroppedMasterApproved(
      { [UNCROPPED_MASTER_CROP_KEY]: { approved_products: ['11oz'] } },
      'GLOBAL-MUG-11oz',
      '11oz'
    ),
    true
  );

  const namedBeatsUncropped = resolveCropSelection({
    size: '11oz',
    sku: 'GLOBAL-MUG-11oz',
    crops: {
      'Ceramic Waterfront Mug': { crop: { productKey: 'ceramic-mug', ratio: 2.428 } },
      [UNCROPPED_MASTER_CROP_KEY]: { approved_products: ['GLOBAL-MUG-11oz'] },
    },
  });
  assert.equal(namedBeatsUncropped.ok, true);
  if (namedBeatsUncropped.ok) {
    assert.equal(namedBeatsUncropped.crop, 'ceramic-waterfront-mug');
  }

  const bogusRatio = resolveCropSelection({
    size: '11oz',
    sku: 'GLOBAL-MUG-11oz',
    ratio: '99:1',
    crops: {
      [UNCROPPED_MASTER_CROP_KEY]: { approved_products: ['GLOBAL-MUG-11oz'] },
    },
  });
  assert.equal(bogusRatio.ok, false);
});

test('artwork crop names apply only when the SKU does not already name a ratio', () => {
  const hijack = resolveCropSelection({
    size: '16x24',
    sku: 'prodigi:rag-16x24',
    crops: {
      'Displate Steel Poster (portrait)': { crop: { ratio: 0.6896551724137931, productKey: 'displate' } },
    },
  });
  assert.equal(hijack.ok, true);
  if (hijack.ok) assert.equal(hijack.crop, '2-3');

  const mug = resolveCropSelection({
    size: '11oz',
    sku: 'GLOBAL-MUG-11oz',
    crops: {
      'Ceramic Waterfront Mug': { crop: { productKey: 'ceramic-mug', ratio: 2.428 } },
      'Hardwood Coaster Set': { crop: { productKey: 'coasters', ratio: 1 } },
    },
  });
  assert.equal(mug.ok, true);
  if (mug.ok) {
    assert.equal(mug.crop, 'ceramic-waterfront-mug');
    assert.equal(mug.ratio, null);
  }

  const invented = resolveCropSelection({ size: '11oz', sku: 'GLOBAL-MUG-11oz', ratio: '1:1', crops: {} });
  assert.equal(invented.ok, false);
});

test('checkout uses the crop master for the matrix size and ignores the client lab', () => {
  const print = prepareCheckoutCart([cartItem({ provider: 'printful' })], matrix, origin, {
    printMastersBaseUrl: masters,
  });
  assert.equal(print.ok, true);
  if (!print.ok) return;
  assert.equal(print.orderItems[0].lab, 'prodigi');
  assert.equal(print.orderItems[0].printAssetUrl, `${masters}/masters/norderney-62/2-3.tif`);
  assert.equal(print.lines[0].productMetadata.provider, 'prodigi');

  const mugOrder = prepareCheckoutCart(
    [cartItem({ sku: 'GLOBAL-MUG-11oz', price: 22, provider: 'gelato' })],
    matrix,
    origin,
    {
      printMastersBaseUrl: masters,
      artworkCrops: {
        'norderney-62': {
          'Ceramic Waterfront Mug': { crop: { productKey: 'ceramic-mug', ratio: 2.428 } },
        },
      },
    }
  );
  assert.equal(mugOrder.ok, true);
  if (!mugOrder.ok) return;
  assert.equal(mugOrder.orderItems[0].lab, 'prodigi');
  assert.equal(
    mugOrder.orderItems[0].printAssetUrl,
    `${masters}/masters/norderney-62/ceramic-waterfront-mug.tif`
  );

  const rejectedMug = prepareCheckoutCart(
    [cartItem({ sku: 'GLOBAL-MUG-11oz', price: 22 })],
    matrix,
    origin,
    { printMastersBaseUrl: masters, artworkCrops: { 'norderney-62': {} } }
  );
  assert.equal(rejectedMug.ok, false);
  if (!rejectedMug.ok) assert.match(rejectedMug.error, /uncropped print master/i);

  const approvedMug = prepareCheckoutCart(
    [cartItem({ sku: 'GLOBAL-MUG-11oz', price: 22 })],
    matrix,
    origin,
    {
      printMastersBaseUrl: masters,
      artworkCrops: {
        'norderney-62': {
          [UNCROPPED_MASTER_CROP_KEY]: { approved_products: ['GLOBAL-MUG-11oz'] },
        },
      },
    }
  );
  assert.equal(approvedMug.ok, true);
  if (approvedMug.ok) {
    assert.equal(approvedMug.orderItems[0].printAssetUrl, `${masters}/masters/norderney-62.tif`);
    assert.equal(approvedMug.lines[0].productMetadata.crop, undefined);
  }
});

test('etsy and amazon rows carry the selected crop and a blank GTIN', () => {
  const etsy = photoEtsyRows([
    photo({
      variants: [
        { sku: 'prodigi:rag-16x24', substrate: 'Hahnemühle Photo Rag', size: '16x24', price_cents: 19500 },
        { sku: 'GLOBAL-MUG-11oz', substrate: 'Drinkware', size: '11oz', price_cents: 2200 },
      ],
      crops: {
        [UNCROPPED_MASTER_CROP_KEY]: { approved_products: ['GLOBAL-MUG-11oz'] },
      },
    }),
  ]);
  assert.equal(etsy[0].crop_ratio, '2:3');
  assert.equal(etsy[0].master_asset_path, '/masters/norderney-62/2-3.tif');
  assert.equal(etsy[1].crop_ratio, '');
  assert.equal(etsy[1].master_asset_path, '/masters/norderney-62.tif');

  const etsyUnapproved = photoEtsyRows([
    photo({
      variants: [
        { sku: 'GLOBAL-MUG-11oz', substrate: 'Drinkware', size: '11oz', price_cents: 2200 },
        { sku: 'GLOBAL-MUG-15oz', substrate: 'Drinkware', size: '15oz', price_cents: 2600 },
        { sku: 'prodigi:rag-50x19', substrate: 'Hahnemühle Photo Rag', size: '50x19', price_cents: 18500 },
      ],
      crops: {
        uncropped: { approved_products: ['GLOBAL-MUG-11oz'] },
        [UNCROPPED_MASTER_CROP_KEY]: { approved_products: ['GLOBAL-DESK-8x10'] },
      },
    }),
  ]);
  for (const row of etsyUnapproved) {
    assert.equal(row.crop_ratio, '');
    assert.equal(row.master_asset_path, '');
  }

  const etsyExplicitFormat = photoEtsyRows([
    photo({
      variants: [
        { sku: 'prodigi:rag-50x19', substrate: 'Hahnemühle Photo Rag', size: '50x19', price_cents: 18500 },
      ],
      crops: {
        [UNCROPPED_MASTER_CROP_KEY]: { approved_products: ['prodigi:rag-50x19'] },
      },
    }),
  ]);
  assert.equal(etsyExplicitFormat[0].crop_ratio, '');
  assert.equal(etsyExplicitFormat[0].master_asset_path, '/masters/norderney-62.tif');
  assert.ok(PHOTO_ETSY_HEADERS.includes('crop_ratio'));
  assert.ok(PHOTO_ETSY_HEADERS.includes('master_asset_path'));

  const heroes = photoHeroes(
    Array.from({ length: 6 }, (_, index) =>
      photo({
        slug: `crop-hero-${index}`,
        title: `Crop Hero ${index}`,
        width: 8000,
        height: 4500,
        variants: [],
      })
    )
  );
  assert.ok(heroes.length >= 6);
  for (const row of heroes) {
    assert.equal(row.crop_ratio, '16:9');
    assert.equal(row.aspect_ratio, '16:9');
    assert.equal(row.master_asset_path, `/masters/${row.hero_design_id}/16-9.tif`);
    assert.equal(row.gtin_exemption, 'true');
    assert.equal(row.external_product_id, '');
    assert.equal(row.external_product_id_type, '');
  }
  assert.ok(AMAZON_HEADERS.includes('crop_ratio'));
  assert.ok(AMAZON_HEADERS.includes('master_asset_path'));
  assert.ok(AMAZON_HEADERS.includes('gtin_exemption'));
  assert.ok(AMAZON_HEADERS.includes('external_product_id'));

  const swsProduct = (index: number): SwsProduct => ({
    id: `sws-tee-${index}`,
    name: `Studio Tee ${index}`,
    tagline: 'Graphic tee',
    description: 'A made to order shirt.',
    price: 34,
    category: 'tee',
    image: `/images/sws/tee-${index}.png`,
    approved: true,
    rating: 4,
    supplier: 'Printify',
    variants: [{ size: 'M', supplier_variant_id: `var-${index}` }],
  });
  const swsEtsy = swsEtsyRows([swsProduct(1)]);
  assert.equal(swsEtsy[0].crop_ratio, '4:5');
  assert.equal(swsEtsy[0].master_asset_path, '/images/sws/tee-1.png');
  assert.ok(SWS_ETSY_HEADERS.includes('crop_ratio'));
  assert.ok(SWS_ETSY_HEADERS.includes('master_asset_path'));

  const swsAmazon = swsHeroes(Array.from({ length: 6 }, (_, index) => swsProduct(index)));
  for (const row of swsAmazon) {
    assert.equal(row.crop_ratio, '4:5');
    assert.equal(row.gtin_exemption, 'true');
    assert.equal(row.external_product_id, '');
    assert.equal(row.external_product_id_type, '');
    assert.match(String(row.master_asset_path), /^\/images\/sws\/tee-/);
  }
});
