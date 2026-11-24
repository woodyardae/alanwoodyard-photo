/**
 * Public storefront pricing and gift navigation.
 * Prices come only from merch_approved rows that resolve through the pricing matrix.
 * There is no gallery fallback price.
 */

import type { EffectiveArtwork } from './artwork-overlay';
import {
  resolveApprovedStorefront,
  type PricingMatrixEntry,
} from './checkout-catalog';
import {
  PHOTO_RATIO_PRODUCTS,
  RATIO_KEYS,
  type RatioKey,
} from './merch-studio-shared';
import pricingMatrix from '../content/pricing-matrix.json';

export const GIFT_CATEGORIES = [
  { id: 'prints-frames', label: 'Prints & Frames', shortLabel: 'Prints' },
  { id: 'acrylic-blocks', label: 'Acrylic Blocks', shortLabel: 'Acrylic' },
  { id: 'mugs-drinkware', label: 'Mugs & Drinkware', shortLabel: 'Mugs' },
  { id: 'coasters-deskmats', label: 'Coasters & Deskmats', shortLabel: 'Coasters' },
  { id: 'puzzles-games', label: 'Puzzles & Calendars', shortLabel: 'Puzzles' },
  { id: 'home-totes', label: 'Pillows & Totes', shortLabel: 'Pillows' },
  { id: 'metal-prints', label: 'Metal Prints', shortLabel: 'Metal' },
  { id: 'cards-folios', label: 'Cards & Folios', shortLabel: 'Cards' },
] as const;

export type GiftCategoryId = (typeof GIFT_CATEGORIES)[number]['id'];

export interface StoreOffer {
  productId: string;
  sku: string;
  title: string;
  spec: string;
  price: number;
  size: string;
  provider: string;
  packaging: string;
  gift: GiftCategoryId | null;
  ratio: RatioKey | null;
  externalHref: string | null;
  panX: number;
  panY: number;
  zoom: number;
}

export interface PublicArtwork {
  id: string;
  slug: string;
  title: string;
  caption: string;
  description: string;
  collections: string[];
  aspectLabel: string;
  imageSrc: string;
  /** Lowest resolved checkout SKU. Null when the piece has no checkout SKU. */
  minPrice: number | null;
  /** Lowest resolved customer price, including external listings. */
  fromPrice: number;
  offers: StoreOffer[];
  gifts: GiftCategoryId[];
}

export interface StorefrontQuery {
  gift: GiftCategoryId | null;
  collection: string | null;
}

export interface RenderedStorePage {
  title: string;
  navHtml: string;
  mainHtml: string;
  html: string;
}

const MATRIX = pricingMatrix as Record<string, PricingMatrixEntry>;
const COLLECTION_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const ratioByProductId = new Map<string, RatioKey>();
for (const ratio of RATIO_KEYS) {
  for (const item of PHOTO_RATIO_PRODUCTS[ratio]) {
    if (!ratioByProductId.has(item.id)) ratioByProductId.set(item.id, ratio);
  }
}

const giftOrder = new Map<GiftCategoryId, number>(GIFT_CATEGORIES.map((category, index) => [category.id, index]));

export function giftCategoryForProduct(productId: string): GiftCategoryId | null {
  const id = productId.trim().toLowerCase();
  if (!id) return null;
  if (/mug|tumbler|waterbottle|enamel/.test(id)) return 'mugs-drinkware';
  if (/coaster|deskmat/.test(id)) return 'coasters-deskmats';
  if (/puzzle|calendar/.test(id)) return 'puzzles-games';
  if (/pillow|tote/.test(id)) return 'home-totes';
  if (/folio|(^|-)post(-|$)|(^|-)cards(-|$)/.test(id)) return 'cards-folios';
  if (id.startsWith('displate-') || /(^|-)met(-|$)/.test(id)) return 'metal-prints';
  if (/acrylic-block|panoramic-block|(^|-)blk(-|$)|(^|-)acr(-|$)/.test(id)) return 'acrylic-blocks';
  if (/(^|-)rag(-|$)|(^|-)frame(-|$)|canvas|(^|-)can(-|$)/.test(id)) return 'prints-frames';
  return null;
}

export function parseGiftCategory(value: string | null | undefined): GiftCategoryId | null {
  const key = (value || '').trim().toLowerCase();
  if (!key) return null;
  return GIFT_CATEGORIES.some((category) => category.id === key) ? (key as GiftCategoryId) : null;
}

export function parseCollectionSlug(value: string | null | undefined): string | null {
  const key = (value || '').trim().toLowerCase();
  return COLLECTION_RE.test(key) ? key : null;
}

export function parseStorefrontQuery(searchParams: URLSearchParams): StorefrontQuery {
  return {
    gift: parseGiftCategory(searchParams.get('gift')),
    collection: parseCollectionSlug(searchParams.get('collection')),
  };
}

export function formatRetail(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return '';
  const rounded = Math.round(amount * 100) / 100;
  const body = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
  return `$${body}`;
}

/** Lowest checkout-SKU retail in the resolved offer list. Never invents a price. */
export function minPrice(offers: readonly StoreOffer[]): number | null {
  let best: number | null = null;
  for (const offer of offers) {
    if (!offer.sku || !(offer.price > 0)) continue;
    if (best == null || offer.price < best) best = offer.price;
  }
  return best;
}

export function lowestRetail(offers: readonly StoreOffer[]): number | null {
  let best: number | null = null;
  for (const offer of offers) {
    if (!(offer.price > 0) || (!offer.sku && !offer.externalHref)) continue;
    if (best == null || offer.price < best) best = offer.price;
  }
  return best;
}

export function resolveStoreOffers(
  approvedIds: readonly string[],
  crops: Record<string, unknown> | null | undefined,
  options?: {
    matrix?: Record<string, PricingMatrixEntry>;
    enabledVendors?: readonly string[] | null;
  }
): StoreOffer[] {
  const matrix = options?.matrix ?? MATRIX;
  const resolved = resolveApprovedStorefront(approvedIds, {
    matrix,
    crops,
    enabledVendors: options?.enabledVendors,
  });
  const offers: StoreOffer[] = [];
  for (const item of [...resolved.prints, ...resolved.goods]) {
    offers.push(toCheckoutOffer(item, crops));
  }
  for (const item of resolved.external) {
    offers.push(toExternalOffer(item, crops));
  }
  offers.sort((a, b) => {
    const ag = a.gift ? (giftOrder.get(a.gift) ?? 99) : 99;
    const bg = b.gift ? (giftOrder.get(b.gift) ?? 99) : 99;
    if (ag !== bg) return ag - bg;
    return a.price - b.price || a.productId.localeCompare(b.productId);
  });
  return offers;
}

export function buildPublicArtworks(
  catalog: readonly EffectiveArtwork[],
  options?: {
    matrix?: Record<string, PricingMatrixEntry>;
    enabledVendors?: readonly string[] | null;
  }
): PublicArtwork[] {
  const artworks: PublicArtwork[] = [];
  for (const artwork of catalog) {
    if (artwork.data.solo_display === false) continue;
    if (artwork.merch_approved.length === 0) continue;
    const offers = resolveStoreOffers(artwork.merch_approved, artwork.merch_crops, options);
    const fromPrice = lowestRetail(offers);
    if (fromPrice == null) continue;
    const gifts: GiftCategoryId[] = [];
    for (const category of GIFT_CATEGORIES) {
      if (offers.some((offer) => offer.gift === category.id)) gifts.push(category.id);
    }
    const aspect =
      artwork.data.capture && typeof artwork.data.capture.aspect_ratio === 'string'
        ? artwork.data.capture.aspect_ratio
        : '';
    artworks.push({
      id: artwork.id,
      slug: artwork.slug,
      title: artwork.title,
      caption: artwork.caption,
      description: artwork.description,
      collections: artwork.collections.filter((collection) => COLLECTION_RE.test(collection)),
      aspectLabel: aspect,
      imageSrc: `/images/artworks/${artwork.id}.webp`,
      minPrice: minPrice(offers),
      fromPrice,
      offers,
      gifts,
    });
  }
  artworks.sort((a, b) => a.title.localeCompare(b.title) || a.slug.localeCompare(b.slug));
  return artworks;
}

export function filterPublicArtworks(artworks: readonly PublicArtwork[], query: StorefrontQuery): PublicArtwork[] {
  return artworks.filter((artwork) => {
    if (query.collection && !artwork.collections.includes(query.collection)) return false;
    if (!query.gift) return true;
    return artwork.offers.some((offer) => offer.gift === query.gift && offer.price > 0);
  });
}

export interface CategoryFloor {
  id: GiftCategoryId;
  label: string;
  shortLabel: string;
  price: number;
}

export function categoryFloors(artworks: readonly PublicArtwork[]): CategoryFloor[] {
  const floors: CategoryFloor[] = [];
  for (const category of GIFT_CATEGORIES) {
    let best: number | null = null;
    for (const artwork of artworks) {
      const price = lowestRetail(artwork.offers.filter((offer) => offer.gift === category.id));
      if (price == null) continue;
      if (best == null || price < best) best = price;
    }
    if (best == null) continue;
    floors.push({
      id: category.id,
      label: category.label,
      shortLabel: category.shortLabel,
      price: best,
    });
  }
  return floors;
}

export function selectGiftOffer(offers: readonly StoreOffer[], gift: GiftCategoryId | null): StoreOffer | null {
  if (!gift) return null;
  const matches = offers.filter((offer) => offer.gift === gift && offer.price > 0);
  const skus = matches.filter((offer) => offer.sku);
  const pool = skus.length > 0 ? skus : matches;
  return pool.reduce<StoreOffer | null>((best, offer) => {
    if (!best || offer.price < best.price) return offer;
    return best;
  }, null);
}

export function renderCatalogRoute(input: {
  catalog: readonly EffectiveArtwork[];
  route: 'home' | 'artworks';
  searchParams: URLSearchParams;
  enabledVendors?: readonly string[] | null;
}): RenderedStorePage {
  const query = parseStorefrontQuery(input.searchParams);
  const artworks = buildPublicArtworks(input.catalog, { enabledVendors: input.enabledVendors });
  const collectionScoped = query.collection
    ? artworks.filter((artwork) => artwork.collections.includes(query.collection as string))
    : artworks;
  const visible = filterPublicArtworks(artworks, query);
  const floors = categoryFloors(collectionScoped);
  const collections = uniqueCollections(artworks);
  const navHtml = renderStoreNav({
    route: input.route,
    floors,
    collections,
    activeGift: query.gift,
    activeCollection: query.collection,
  });
  const mainHtml = renderProductGrid(visible, query, input.route);
  const title = input.route === 'home' ? 'Alan Woodyard | Selected Works' : 'Alan Woodyard | Artworks';
  return { title, navHtml, mainHtml, html: `${navHtml}\n${mainHtml}` };
}

export function renderArtworkRoute(input: {
  artwork: EffectiveArtwork;
  catalog: readonly EffectiveArtwork[];
  searchParams: URLSearchParams;
  enabledVendors?: readonly string[] | null;
}): RenderedStorePage {
  const query = parseStorefrontQuery(input.searchParams);
  const artworks = buildPublicArtworks(input.catalog, { enabledVendors: input.enabledVendors });
  const offers = resolveStoreOffers(input.artwork.merch_approved, input.artwork.merch_crops, {
    enabledVendors: input.enabledVendors,
  });
  const selected = selectGiftOffer(offers, query.gift);
  const navHtml = renderStoreNav({
    route: 'artwork',
    artworkSlug: input.artwork.slug,
    artworkGifts: giftIds(offers),
    floors: categoryFloors(artworks),
    collections: uniqueCollections(artworks),
    activeGift: selected ? query.gift : null,
    activeCollection: null,
  });
  const mainHtml = renderArtworkMain(input.artwork, offers, selected, query.gift);
  return {
    title: `${input.artwork.title} | Alan Woodyard`,
    navHtml,
    mainHtml,
    html: `${navHtml}\n${mainHtml}`,
  };
}

function toCheckoutOffer(
  item: {
    productId: string;
    title: string;
    spec: string;
    sku: string;
    price: number;
    provider: string;
    packaging: string;
    size: string;
  },
  crops: Record<string, unknown> | null | undefined
): StoreOffer {
  const ratio = ratioByProductId.get(item.productId) ?? null;
  const crop = readCropAdjustments(crops, ratio);
  return {
    productId: item.productId,
    sku: item.sku,
    title: item.title,
    spec: item.spec,
    price: item.price,
    size: item.size,
    provider: item.provider,
    packaging: item.packaging,
    gift: giftCategoryForProduct(item.productId),
    ratio,
    externalHref: null,
    panX: crop.panX,
    panY: crop.panY,
    zoom: crop.zoom,
  };
}

function toExternalOffer(
  item: { productId: string; title: string; spec: string; price: number; href: string },
  crops: Record<string, unknown> | null | undefined
): StoreOffer {
  const ratio = ratioByProductId.get(item.productId) ?? null;
  const crop = readCropAdjustments(crops, ratio);
  return {
    productId: item.productId,
    sku: '',
    title: item.title,
    spec: item.spec,
    price: item.price,
    size: '',
    provider: '',
    packaging: '',
    gift: giftCategoryForProduct(item.productId),
    ratio,
    externalHref: item.href,
    panX: crop.panX,
    panY: crop.panY,
    zoom: crop.zoom,
  };
}

function readCropAdjustments(
  crops: Record<string, unknown> | null | undefined,
  ratio: RatioKey | null
): { panX: number; panY: number; zoom: number } {
  const fallback = { panX: 0, panY: 0, zoom: 1 };
  if (!ratio || !crops) return fallback;
  const entry = crops[ratio];
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return fallback;
  const record = entry as Record<string, unknown>;
  if (record.rejected === true) return fallback;
  const nested =
    record.crop && typeof record.crop === 'object' && !Array.isArray(record.crop)
      ? (record.crop as Record<string, unknown>)
      : record;
  const num = (value: unknown, fallbackNumber: number) =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallbackNumber;
  const zoom = num(nested.zoom, 1);
  return {
    panX: num(nested.panX, 0),
    panY: num(nested.panY, 0),
    zoom: Math.min(4, Math.max(0.05, zoom > 0 ? zoom : 1)),
  };
}

function giftIds(offers: readonly StoreOffer[]): GiftCategoryId[] {
  return GIFT_CATEGORIES.map((category) => category.id).filter((id) =>
    offers.some((offer) => offer.gift === id)
  );
}

function uniqueCollections(artworks: readonly PublicArtwork[]): string[] {
  const found = new Set<string>();
  for (const artwork of artworks) {
    for (const collection of artwork.collections) found.add(collection);
  }
  return [...found].sort();
}

function catalogHref(
  route: 'home' | 'artworks',
  params: { gift?: GiftCategoryId | null; collection?: string | null }
): string {
  const path = route === 'home' ? '/' : '/artworks';
  const search = new URLSearchParams();
  if (params.gift) search.set('gift', params.gift);
  if (params.collection) search.set('collection', params.collection);
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

function cardPrice(artwork: PublicArtwork, gift: GiftCategoryId | null): number {
  if (!gift) return artwork.fromPrice;
  return lowestRetail(artwork.offers.filter((offer) => offer.gift === gift)) ?? artwork.fromPrice;
}

function renderStoreNav(input: {
  route: 'home' | 'artworks' | 'artwork';
  artworkSlug?: string;
  artworkGifts?: readonly GiftCategoryId[];
  floors: readonly CategoryFloor[];
  collections: readonly string[];
  activeGift: GiftCategoryId | null;
  activeCollection: string | null;
}): string {
  const allHref =
    input.route === 'artwork'
      ? '/artworks'
      : catalogHref(input.route, { collection: input.activeCollection });
  const pills = [
    `<a class="gift-pill" href="${esc(allHref)}" data-gift-pill="all"${input.activeGift ? '' : ' aria-current="page"'}>All pieces</a>`,
    ...input.floors.map((floor) => {
      const href = pillHref(input, floor.id);
      const current = input.activeGift === floor.id ? ' aria-current="page"' : '';
      const label = `${floor.shortLabel} from ${formatRetail(floor.price)}`;
      return `<a class="gift-pill" href="${esc(href)}" data-gift-pill="${esc(floor.id)}" data-floor-price="${floor.price}"${current}>${esc(label)}</a>`;
    }),
  ];
  const collectionLinks = [
    `<a href="${esc(allHref)}"${input.activeCollection ? '' : ' aria-current="page"'}>All collections</a>`,
    ...input.collections.map((collection) => {
      const href = collectionHref(input, collection);
      const current = input.activeCollection === collection ? ' aria-current="page"' : '';
      return `<a href="${esc(href)}" data-collection="${esc(collection)}"${current}>${esc(labelize(collection))}</a>`;
    }),
  ];
  return `<div class="store-nav" data-store-nav>
  <div class="store-dual-nav">
    <section class="shop-by-gift" aria-label="Shop by Gift">
      <h2>Shop by Gift</h2>
      <div class="gift-scroller">${pills.join('')}</div>
    </section>
    <section class="shop-by-collection" aria-label="Shop by Artwork / Collection">
      <div class="collection-heading">
        <h2>Shop by Artwork / Collection</h2>
        <button type="button" class="collection-toggle" aria-expanded="false" aria-controls="collection-sheet">Collections</button>
      </div>
      <div id="collection-sheet" class="collection-sheet" data-open="false">
        <button type="button" class="collection-close">Close</button>
        ${collectionLinks.join('')}
      </div>
    </section>
  </div>
</div>`;
}

function pillHref(
  input: {
    route: 'home' | 'artworks' | 'artwork';
    artworkSlug?: string;
    artworkGifts?: readonly GiftCategoryId[];
    activeCollection: string | null;
  },
  gift: GiftCategoryId
): string {
  if (input.route === 'artwork' && input.artworkSlug && input.artworkGifts?.includes(gift)) {
    return `/artwork/${input.artworkSlug}?gift=${gift}`;
  }
  if (input.route === 'artwork') return catalogHref('artworks', { gift });
  return catalogHref(input.route, { gift, collection: input.activeCollection });
}

function collectionHref(
  input: { route: 'home' | 'artworks' | 'artwork'; activeGift: GiftCategoryId | null },
  collection: string
): string {
  if (input.route === 'artwork') return catalogHref('artworks', { collection });
  return catalogHref(input.route, { gift: input.activeGift, collection });
}

function renderProductGrid(artworks: readonly PublicArtwork[], query: StorefrontQuery, route: 'home' | 'artworks'): string {
  const heading = route === 'home' ? 'Selected Works' : 'Artworks';
  const cards = artworks.map((artwork) => {
    const price = cardPrice(artwork, query.gift);
    const href = query.gift ? `/artwork/${artwork.slug}?gift=${query.gift}` : `/artwork/${artwork.slug}`;
    const priceText = formatRetail(price);
    const aspect = artwork.aspectLabel
      ? `<p class="card-ratio">Ratio ${esc(artwork.aspectLabel)}</p>`
      : '';
    const minAttr = artwork.minPrice == null ? '' : String(artwork.minPrice);
    return `<article class="store-card" data-store-card data-slug="${esc(artwork.slug)}" data-min-price="${esc(minAttr)}" data-card-price="${price}">
      <a class="card-media" href="${esc(href)}">
        <img src="${esc(artwork.imageSrc)}" alt="${esc(artwork.title)}" loading="lazy" />
      </a>
      <div class="card-copy">
        <h3><a href="${esc(href)}">${esc(artwork.title)}</a></h3>
        ${aspect}
        <p class="card-price">From ${esc(priceText)}</p>
      </div>
    </article>`;
  });
  const empty = cards.length
    ? ''
    : '<p class="store-empty">No pieces in this gift type are approved yet.</p>';
  return `<div class="store-catalog" data-public-count="${artworks.length}">
  <header class="catalog-heading">
    <h1>${esc(heading)}</h1>
    <p>${artworks.length} ${artworks.length === 1 ? 'work' : 'works'}</p>
  </header>
  <div class="product-grid">${cards.join('')}</div>
  ${empty}
</div>`;
}

function renderArtworkMain(
  artwork: EffectiveArtwork,
  offers: readonly StoreOffer[],
  selected: StoreOffer | null,
  requestedGift: GiftCategoryId | null
): string {
  const activeGift = selected ? requestedGift : null;
  const visible = activeGift ? offers.filter((offer) => offer.gift === activeGift) : offers;
  const from = lowestRetail(visible.length > 0 ? visible : offers);
  const skuMin = minPrice(offers);
  const preview = selected ? renderCropPreview(artwork, selected) : renderNativePreview(artwork);
  const purchase = visible.length > 0 ? renderPurchasePanel(artwork, visible, selected, from) : '';
  const aspect = artwork.data.capture?.aspect_ratio
    ? `<p class="artwork-kicker">Ratio ${esc(String(artwork.data.capture.aspect_ratio))}</p>`
    : '';
  const caption = artwork.caption ? `<p class="artwork-caption">${esc(artwork.caption)}</p>` : '';
  const description = artwork.description ? `<p class="artwork-description">${esc(artwork.description)}</p>` : '';
  return `<div class="artwork-layout" data-artwork-id="${esc(artwork.id)}" data-artwork-slug="${esc(artwork.slug)}" data-min-price="${skuMin == null ? '' : String(skuMin)}">
  <div class="artwork-stage">
    <a class="back-link" href="/artworks">Back to Artworks</a>
    ${preview}
    ${aspect}
    <h1>${esc(artwork.title)}</h1>
    ${caption}
    ${description}
  </div>
  ${purchase}
</div>`;
}

function renderNativePreview(artwork: EffectiveArtwork): string {
  return `<img id="artworkImage" class="artwork-native" src="${esc(`/images/artworks/${artwork.id}.webp`)}" alt="${esc(artwork.title)}" />`;
}

function renderCropPreview(artwork: EffectiveArtwork, offer: StoreOffer): string {
  const aspect = offer.ratio ? offer.ratio.replace(':', ' / ') : '1 / 1';
  const style = `aspect-ratio: ${aspect}; --crop-pan-x: ${offer.panX}; --crop-pan-y: ${offer.panY}; --crop-zoom: ${offer.zoom};`;
  return `<figure class="crop-preview is-active" data-gift="${esc(offer.gift || '')}" data-ratio="${esc(offer.ratio || '')}" data-sku="${esc(offer.sku)}" style="${esc(style)}">
    <img id="artworkImage" src="${esc(`/images/artworks/${artwork.id}.webp`)}" alt="${esc(artwork.title)}" />
  </figure>`;
}

function renderPurchasePanel(
  artwork: EffectiveArtwork,
  offers: readonly StoreOffer[],
  selected: StoreOffer | null,
  from: number | null
): string {
  const groups = new Map<string, StoreOffer[]>();
  for (const offer of offers) {
    const key = offer.gift || 'other';
    const list = groups.get(key) || [];
    list.push(offer);
    groups.set(key, list);
  }
  const sections: string[] = [];
  const ordered = [
    ...GIFT_CATEGORIES.map((category) => category.id),
    'other' as const,
  ];
  for (const key of ordered) {
    const rows = groups.get(key);
    if (!rows || rows.length === 0) continue;
    const heading =
      key === 'other' ? 'Other goods' : GIFT_CATEGORIES.find((category) => category.id === key)?.label || 'Goods';
    sections.push(`<section class="offer-group" data-offer-group="${esc(key)}">
      <h2>${esc(heading)}</h2>
      ${rows.map((offer) => renderOfferRow(artwork, offer, selected)).join('')}
    </section>`);
  }
  const fromText = from == null ? '' : `<p class="panel-from">From ${esc(formatRetail(from))}</p>`;
  const selectedSku = selected?.sku || '';
  return `<aside id="purchase-panel" class="purchase-panel" data-selected-sku="${esc(selectedSku)}">
    ${fromText}
    ${sections.join('')}
  </aside>`;
}

function renderOfferRow(artwork: EffectiveArtwork, offer: StoreOffer, selected: StoreOffer | null): string {
  const isSelected = selected?.productId === offer.productId;
  const price = formatRetail(offer.price);
  const action = offer.sku
    ? `<button type="button" class="btn-add-cart" data-sku="${esc(offer.sku)}" data-variant="${esc(offer.title)}" data-price="${offer.price}" data-provider="${esc(offer.provider)}" data-packaging="${esc(offer.packaging)}">Add to Cart</button>`
    : offer.externalHref
      ? `<a class="offer-external" href="${esc(offer.externalHref)}" target="_blank" rel="noopener noreferrer">View</a>`
      : '';
  return `<div class="offer-row" data-selected="${isSelected ? 'true' : 'false'}" data-product-id="${esc(offer.productId)}" data-sku="${esc(offer.sku)}" data-gift="${esc(offer.gift || '')}" data-ratio="${esc(offer.ratio || '')}" data-pan-x="${offer.panX}" data-pan-y="${offer.panY}" data-zoom="${offer.zoom}" data-artwork-id="${esc(artwork.id)}">
    <div class="offer-copy">
      <span class="offer-title">${esc(offer.title)}</span>
      <span class="offer-spec">${esc(offer.spec)}</span>
    </div>
    <span class="offer-price">${esc(price)}</span>
    ${action}
  </div>`;
}

function labelize(slug: string): string {
  return slug
    .split('-')
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(' ');
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
