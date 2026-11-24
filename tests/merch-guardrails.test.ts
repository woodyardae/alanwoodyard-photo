import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PHOTO_RATIO_PRODUCTS,
  SWS_RATIO_PRODUCTS,
  PRICE_FLOORS,
  IP_EXCLUSIONS,
  DESK_MAT_FRAMING,
  assertRubricPriceFloors,
  clampDeskMatPanY,
  isDeskMatFramingRatio,
  textHitsIpExclusion,
  type ProductRubricItem,
} from '../src/lib/merch-studio-shared';

function allProducts(): ProductRubricItem[] {
  return [
    ...Object.values(PHOTO_RATIO_PRODUCTS).flat(),
    ...Object.values(SWS_RATIO_PRODUCTS).flat(),
  ];
}

test('prodigi-rag-12x18 is priced at $125.00 on both storefronts', () => {
  const photo = PHOTO_RATIO_PRODUCTS['2:3'].find((p) => p.id === 'prodigi-rag-12x18');
  const sws = SWS_RATIO_PRODUCTS['2:3'].find((p) => p.id === 'prodigi-rag-12x18');
  assert.equal(photo?.retail, '$125.00');
  assert.equal(sws?.retail, '$125.00');
});

test('Gooten SKUs and vendor routes are removed from merch rubrics', () => {
  for (const item of allProducts()) {
    assert.doesNotMatch(item.id, /^gooten-/i);
    assert.notEqual(item.vendor as string, 'Gooten');
  }
  assert.ok(PHOTO_RATIO_PRODUCTS['1:1'].some((p) => p.id.startsWith('prodigi-acrylic-block')));
  assert.ok(PHOTO_RATIO_PRODUCTS['16:9'].some((p) => p.id === 'prodigi-panoramic-block'));
  assert.ok(SWS_RATIO_PRODUCTS['16:9'].some((p) => p.id === 'prodigi-panoramic-block'));
});

test('price floors hold for mugs, stickers, coasters, CC1717 tees, and hoodies', () => {
  const violations = assertRubricPriceFloors(allProducts());
  assert.deepEqual(violations, []);
  assert.equal(PRICE_FLOORS.mug11ozMin, 22);
  assert.equal(PRICE_FLOORS.hoodieMin, 49.99);
});

test('desk mat framing keeps horizons above the keyboard zone', () => {
  assert.equal(isDeskMatFramingRatio('16:7'), true);
  assert.equal(isDeskMatFramingRatio('2:1'), true);
  assert.equal(isDeskMatFramingRatio('2:3'), false);
  assert.equal(DESK_MAT_FRAMING.keyboardZoneFraction, 0.4);
  const canvasH = 500;
  assert.equal(clampDeskMatPanY(999, canvasH), canvasH * DESK_MAT_FRAMING.maxDownwardPanFraction);
  assert.equal(clampDeskMatPanY(-999, canvasH), -(canvasH * DESK_MAT_FRAMING.keyboardZoneFraction));
  assert.equal(clampDeskMatPanY(10, canvasH), 10);
});

test('IP exclusions block 1984 US merch, agency marks, and D.A.R.E. trade-dress parody', () => {
  assert.equal(IP_EXCLUSIONS.zero1984UsMerch, true);
  assert.equal(IP_EXCLUSIONS.banDareTradeDressParody, true);
  assert.equal(textHitsIpExclusion('Vintage 1984 tee'), true);
  assert.equal(textHitsIpExclusion('ARRL field day mug'), true);
  assert.equal(textHitsIpExclusion('NOAA radar hoodie'), true);
  assert.equal(textHitsIpExclusion('NWS alert poster'), true);
  assert.equal(textHitsIpExclusion('J24 racing sticker'), true);
  assert.equal(textHitsIpExclusion('OEM radio faceplate'), true);
  assert.equal(textHitsIpExclusion('D.A.R.E. to resist parody'), true);
  assert.equal(textHitsIpExclusion('Waterfront dawn print'), false);
});
