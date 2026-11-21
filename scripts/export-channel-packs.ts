/**
 * Local staging files for Etsy and Amazon review.
 * This script reads catalogs on disk and writes dist/channel-exports.
 * It does not call Etsy, Amazon, Stripe, or any print lab.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { printMasterRelativePath, resolveCropSelection } from '../src/lib/checkout-catalog';
import { PHOTO_RATIO_PRODUCTS, RATIO_KEYS, type ProductRubricItem } from '../src/lib/merch-studio-shared';
import { seeWhatSticksPortalFile } from './sws-paths';

const PHOTO_BRAND = 'AlanWoodyard Photo';
const SWS_BRAND = 'SeeWhatSticks';
const ETSY_LISTING_FEE_USD = 0.2;
const ETSY_TRANSACTION_RATE = 0.065;
const ETSY_PEAK_BUFFER_USD = 0.4;
const PHOTO_DISCLOSURE =
  'Alan Woodyard photographs and designs this image. The production partner prints and ships the physical item after the order is placed.';
const SWS_DISCLOSURE =
  'SeeWhatSticks designs this item. The production partner prints and ships it after the order is placed.';
const PHOTO_TAG_FILL = [
  'fine art photo',
  'archival print',
  'photography print',
  'wall art',
  'alan woodyard',
  'giclee print',
  'open edition',
  'made to order',
  'photo print',
  'landscape photo',
  'coastal photo',
  'black and white',
  'nature photo',
];
const SWS_TAG_FILL = [
  'seewhatsticks',
  'graphic tee',
  'retro design',
  'pop culture',
  'made to order',
  'statement shirt',
  'gift idea',
  'casual wear',
  'cotton tee',
  'illustrated tee',
  'fun shirt',
  'weekend wear',
  'art merch',
];

interface PrintVariant {
  sku: string;
  substrate: string;
  size: string;
  price_cents: number;
}

export interface PhotoArtwork {
  slug: string;
  title: string;
  description: string;
  tags: string[];
  collections: string[];
  mood: string;
  width: number;
  height: number;
  variants: PrintVariant[];
  crops: Record<string, unknown>;
}

interface SwsVariant {
  size?: string;
  color?: string;
  supplier_variant_id?: string;
}

export interface SwsProduct {
  id: string;
  name: string;
  tagline: string;
  description: string;
  price: number;
  category: string;
  image: string;
  approved: boolean;
  rating: number;
  supplier: string;
  variants: SwsVariant[];
}

interface AmazonRow {
  brand: string;
  sku: string;
  hero_design_id: string;
  item_name: string;
  product_description: string;
  manufacturer: string;
  standard_price: string;
  quantity: string;
  main_image_url: string;
  external_product_id: string;
  external_product_id_type: string;
  gtin_exemption: string;
  gtin_exemption_reason: string;
  condition_type: string;
  item_type: string;
  aspect_ratio: string;
  crop_ratio: string;
  master_asset_path: string;
  crop_score: number;
  size: string;
  production_partner: string;
  made_to_order: string;
  approved: string;
  aspect_error: number;
}

function plain(value: string): string {
  return value.replace(/\u2014/g, ', ').replace(/\u2013/g, ', ').replace(/\s+/g, ' ').trim();
}

function flatText(value: string): string {
  let text = plain(value);
  let previous = '';
  while (text !== previous) {
    previous = text;
    text = text.replace(/\([^()]*\)/g, ' ');
  }
  return text.replace(/\s+/g, ' ').trim();
}

function etsyListedPrice(catalogRetailUsd: number): number {
  const net = catalogRetailUsd + ETSY_LISTING_FEE_USD + ETSY_PEAK_BUFFER_USD;
  return Math.round((net / (1 - ETSY_TRANSACTION_RATE)) * 100) / 100;
}

function money(amount: number): string {
  return amount.toFixed(2);
}

function csvCell(value: string | number): string {
  let text = String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function toCsv(headers: string[], rows: Record<string, string | number>[]): string {
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((header) => csvCell(row[header] ?? '')).join(','));
  }
  return `\uFEFF${lines.join('\n')}\n`;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function pushTag(tags: string[], raw: string): void {
  const tag = raw.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (tag.length < 3 || tag.length > 20 || tags.includes(tag)) return;
  tags.push(tag);
}

function thirteenTags(sources: string[], fill: string[]): string[] {
  const tags: string[] = [];
  for (const source of sources) {
    pushTag(tags, source);
    for (const word of source.split(' ')) pushTag(tags, word);
  }
  for (const extra of fill) {
    if (tags.length >= 13) break;
    pushTag(tags, extra);
  }
  let index = tags.length + 1;
  while (tags.length < 13) {
    pushTag(tags, `print ${index}`);
    index += 1;
  }
  return tags.slice(0, 13);
}

function limitTitle(parts: string[]): string {
  const joined = flatText(parts.filter(Boolean).join(' '));
  if (joined.length <= 140) return joined;
  const cut = joined.slice(0, 140);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 80 ? cut.slice(0, lastSpace) : cut).trim();
}

function parseMinPx(value: string): { w: number; h: number } | null {
  const match = /^(\d+)x(\d+)$/.exec(value.trim());
  if (!match) return null;
  return { w: Number(match[1]), h: Number(match[2]) };
}

function parseRetail(value: string): number | null {
  const match = /(\d+(?:\.\d+)?)/.exec(value.replace(/,/g, ''));
  if (!match) return null;
  const amount = Number(match[1]);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function scoreFit(
  width: number,
  height: number,
  minW: number,
  minH: number
): { aspectError: number; coverage: number } | null {
  const orientations = [
    { iw: width, ih: height, rw: minW, rh: minH },
    { iw: width, ih: height, rw: minH, rh: minW },
  ];
  let best: { aspectError: number; coverage: number } | null = null;
  for (const opt of orientations) {
    if (opt.iw < opt.rw || opt.ih < opt.rh) continue;
    const imageRatio = opt.iw / opt.ih;
    const target = opt.rw / opt.rh;
    const aspectError = Math.abs(imageRatio - target) / target;
    const coverage = Math.min(opt.iw / opt.rw, opt.ih / opt.rh);
    if (!best || aspectError < best.aspectError || (aspectError === best.aspectError && coverage > best.coverage)) {
      best = { aspectError, coverage };
    }
  }
  return best;
}

function sizeLabel(name: string, ratio: string): string {
  const match = /(\d+(?:\.\d+)?x\d+(?:\.\d+)?)/i.exec(name);
  return match ? match[1] : ratio;
}

function channelAsset(input: {
  slug: string;
  size?: string;
  sku?: string;
  ratio?: string;
  crops?: Record<string, unknown>;
  acceptDeclaredRatio?: boolean;
}): { crop_ratio: string; master_asset_path: string } {
  const selection = resolveCropSelection({
    size: input.size,
    sku: input.sku,
    ratio: input.ratio,
    crops: input.crops,
    acceptDeclaredRatio: input.acceptDeclaredRatio,
  });
  if (!selection.ok) {
    return { crop_ratio: '', master_asset_path: '' };
  }
  return {
    crop_ratio: selection.ratio || selection.crop || '',
    master_asset_path: printMasterRelativePath(input.slug, selection.crop),
  };
}

function loadPhotoArtworks(root: string): PhotoArtwork[] {
  const artDir = path.join(root, 'src', 'content', 'artworks');
  const cleanDir = path.join(root, 'public', 'images', 'artworks', 'clean');
  const artworks: PhotoArtwork[] = [];
  for (const file of fs.readdirSync(artDir)) {
    if (!file.endsWith('.json')) continue;
    const slug = file.slice(0, -'.json'.length).toLowerCase();
    if (!fs.existsSync(path.join(cleanDir, `${slug}.webp`))) continue;
    const data = JSON.parse(
      fs.readFileSync(path.join(artDir, file), 'utf8').replace(/^\uFEFF/, '')
    ) as Record<string, unknown>;
    if (String(data.id || '').trim().toLowerCase() !== slug) continue;
    if (data.merch_rejected === true) continue;
    const capture = data.capture && typeof data.capture === 'object' ? (data.capture as Record<string, unknown>) : {};
    const dims =
      capture.native_dimensions && typeof capture.native_dimensions === 'object'
        ? (capture.native_dimensions as Record<string, unknown>)
        : {};
    const variants: PrintVariant[] = [];
    if (Array.isArray(data.print_variants)) {
      for (const entry of data.print_variants) {
        if (!entry || typeof entry !== 'object') continue;
        const row = entry as Record<string, unknown>;
        const sku = typeof row.sku === 'string' ? row.sku : '';
        const price = typeof row.price_cents === 'number' ? row.price_cents : 0;
        if (!sku || price <= 0) continue;
        variants.push({
          sku,
          substrate: typeof row.substrate === 'string' ? row.substrate : '',
          size: typeof row.size === 'string' ? row.size : '',
          price_cents: price,
        });
      }
    }
    const crops =
      data.merch_crops && typeof data.merch_crops === 'object' && !Array.isArray(data.merch_crops)
        ? (data.merch_crops as Record<string, unknown>)
        : {};
    artworks.push({
      slug,
      title: typeof data.title === 'string' ? data.title : slug,
      description: typeof data.description === 'string' ? data.description : '',
      tags: stringList(data.tags),
      collections: stringList(data.collections),
      mood: typeof data.mood === 'string' ? data.mood : '',
      width: typeof dims.width === 'number' ? dims.width : 0,
      height: typeof dims.height === 'number' ? dims.height : 0,
      variants,
      crops,
    });
  }
  return artworks;
}

function loadSwsProducts(): SwsProduct[] {
  const productsPath = seeWhatSticksPortalFile('data/products.json');
  if (!fs.existsSync(productsPath)) {
    throw new Error(`SeeWhatSticks products.json was not found at ${productsPath}`);
  }
  const parsed = JSON.parse(fs.readFileSync(productsPath, 'utf8').replace(/^\uFEFF/, '')) as unknown;
  if (!Array.isArray(parsed)) throw new Error('SeeWhatSticks products.json must be an array');
  const products: SwsProduct[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id : '';
    const name = typeof row.name === 'string' ? row.name : '';
    const price = typeof row.price === 'number' ? row.price : 0;
    if (!id || !name || price <= 0) continue;
    const specs = row.specs && typeof row.specs === 'object' ? (row.specs as Record<string, unknown>) : {};
    const variants: SwsVariant[] = [];
    if (Array.isArray(row.variants)) {
      for (const variant of row.variants) {
        if (!variant || typeof variant !== 'object') continue;
        const item = variant as Record<string, unknown>;
        variants.push({
          size: typeof item.size === 'string' ? item.size : undefined,
          color: typeof item.color === 'string' ? item.color : undefined,
          supplier_variant_id: typeof item.supplier_variant_id === 'string' ? item.supplier_variant_id : undefined,
        });
      }
    }
    const salePrice = typeof row.salePrice === 'number' ? row.salePrice : 0;
    const listPrice = row.onSale === true && salePrice > 0 ? salePrice : price;
    products.push({
      id,
      name,
      tagline: typeof row.tagline === 'string' ? row.tagline : '',
      description: typeof row.description === 'string' ? row.description : '',
      price: listPrice,
      category: typeof row.category === 'string' ? row.category : '',
      image: typeof row.image === 'string' ? row.image : '',
      approved: row.approved === true,
      rating: typeof row.rating === 'number' ? row.rating : 0,
      supplier: typeof specs.Supplier === 'string' ? specs.Supplier : 'Production partner',
      variants,
    });
  }
  return products;
}

export function photoEtsyRows(artworks: PhotoArtwork[]): Record<string, string | number>[] {
  const rows: Record<string, string | number>[] = [];
  for (const artwork of artworks) {
    for (const variant of artwork.variants) {
      const retail = variant.price_cents / 100;
      const title = limitTitle([artwork.title, variant.size, 'fine art photograph']);
      const tags = thirteenTags(
        [...artwork.tags, ...artwork.collections, artwork.mood, variant.substrate, variant.size],
        PHOTO_TAG_FILL
      );
      const description = [plain(artwork.description) || `${plain(artwork.title)} by Alan Woodyard.`, PHOTO_DISCLOSURE]
        .filter(Boolean)
        .join('\n\n');
      const asset = channelAsset({
        slug: artwork.slug,
        size: variant.size,
        sku: variant.sku,
        crops: artwork.crops,
      });
      rows.push({
        sku: `${artwork.slug}:${variant.sku}`,
        title,
        tags: tags.join('|'),
        description,
        catalog_retail_usd: money(retail),
        etsy_price_usd: money(etsyListedPrice(retail)),
        listing_fee_usd: money(ETSY_LISTING_FEE_USD),
        transaction_rate: String(ETSY_TRANSACTION_RATE),
        peak_buffer_usd: money(ETSY_PEAK_BUFFER_USD),
        currency: 'USD',
        quantity: '',
        brand: PHOTO_BRAND,
        production_partner: variant.sku.toLowerCase().startsWith('prodigi:') ? 'Prodigi' : 'Production partner',
        production_partner_disclosure: PHOTO_DISCLOSURE,
        artwork_slug: artwork.slug,
        size: variant.size,
        substrate: flatText(variant.substrate),
        crop_ratio: asset.crop_ratio,
        master_asset_path: asset.master_asset_path,
        image: `/images/artworks/clean/${artwork.slug}.webp`,
      });
      assertListing(title, tags);
    }
  }
  if (rows.length === 0) throw new Error('No approved photo prints were found for the Etsy export');
  return rows;
}

export function swsEtsyRows(products: SwsProduct[]): Record<string, string | number>[] {
  const rows: Record<string, string | number>[] = [];
  for (const product of products.filter((item) => item.approved)) {
    const title = limitTitle([product.name]);
    const tags = thirteenTags([product.name, product.category, product.tagline, SWS_BRAND], SWS_TAG_FILL);
    const sizes = product.variants.map((variant) => variant.size).filter((size): size is string => Boolean(size));
    const description = [plain(product.description) || plain(product.tagline), SWS_DISCLOSURE].filter(Boolean).join('\n\n');
    const ratio = swsRatio(product);
    rows.push({
      sku: product.id,
      title,
      tags: tags.join('|'),
      description,
      catalog_retail_usd: money(product.price),
      etsy_price_usd: money(etsyListedPrice(product.price)),
      listing_fee_usd: money(ETSY_LISTING_FEE_USD),
      transaction_rate: String(ETSY_TRANSACTION_RATE),
      peak_buffer_usd: money(ETSY_PEAK_BUFFER_USD),
      currency: 'USD',
      quantity: '',
      brand: SWS_BRAND,
      shop_name: SWS_BRAND,
      designer: SWS_BRAND,
      who_made: 'someone_else',
      when_made: 'made_to_order',
      category: product.category,
      sizes: sizes.join('|'),
      production_partner: product.supplier,
      production_partner_disclosure: SWS_DISCLOSURE,
      crop_ratio: ratio.key,
      master_asset_path: product.image,
      image: product.image,
    });
    assertListing(title, tags);
  }
  if (rows.length === 0) throw new Error('No approved SeeWhatSticks products were found for the Etsy export');
  return rows;
}

function assertListing(title: string, tags: string[]): void {
  if (title.length === 0 || title.length > 140) {
    throw new Error(`Etsy title must be 1 to 140 characters: ${title}`);
  }
  if (tags.length !== 13 || tags.some((tag) => tag.length > 20 || tag.length < 3)) {
    throw new Error(`Etsy tags must be 13 values of at most 20 characters: ${tags.join('|')}`);
  }
  const generated = `${title}\n${tags.join('|')}`;
  if (generated.includes('\u2014') || generated.includes('\u2013')) {
    throw new Error('Etsy export text contains a dash character that is not a hyphen');
  }
}

export function photoHeroes(artworks: PhotoArtwork[]): AmazonRow[] {
  const heroes: AmazonRow[] = [];
  for (const artwork of artworks) {
    if (artwork.width < 1 || artwork.height < 1) continue;
    let best: AmazonRow | null = null;
    for (const key of RATIO_KEYS) {
      for (const product of PHOTO_RATIO_PRODUCTS[key] as ProductRubricItem[]) {
        const min = parseMinPx(product.minPx);
        const retail = parseRetail(product.retail);
        if (!min || retail == null) continue;
        const fit = scoreFit(artwork.width, artwork.height, min.w, min.h);
        if (!fit) continue;
        const cropScore = Number((100 / (1 + fit.aspectError * 12) + Math.min(fit.coverage, 3) * 4).toFixed(2));
        const size = sizeLabel(product.name, key);
        const asset = channelAsset({
          slug: artwork.slug,
          ratio: key,
          crops: artwork.crops,
          acceptDeclaredRatio: true,
        });
        const candidate: AmazonRow = {
          brand: PHOTO_BRAND,
          sku: `${artwork.slug}:${product.id}`,
          hero_design_id: artwork.slug,
          item_name: limitTitle([artwork.title, size, flatText(product.name)]),
          product_description: `${plain(artwork.title)}. Photograph printed to order by ${product.vendor}.`,
          manufacturer: 'Alan Woodyard',
          standard_price: money(retail),
          quantity: '',
          main_image_url: `https://alanwoodyard.photo/images/artworks/clean/${artwork.slug}.webp`,
          external_product_id: '',
          external_product_id_type: '',
          gtin_exemption: 'true',
          gtin_exemption_reason: 'Made to order print with no manufacturer barcode.',
          condition_type: 'new',
          item_type: 'fine-art-print',
          aspect_ratio: key,
          crop_ratio: asset.crop_ratio,
          master_asset_path: asset.master_asset_path,
          crop_score: cropScore,
          size,
          production_partner: product.vendor,
          made_to_order: 'true',
          approved: 'true',
          aspect_error: fit.aspectError,
        };
        if (!best || cropScore > best.crop_score || (cropScore === best.crop_score && product.id < best.sku)) {
          best = candidate;
        }
      }
    }
    if (best) heroes.push(best);
  }
  return takeShortlist(PHOTO_BRAND, heroes);
}

function swsRatio(product: SwsProduct): { key: string; error: number } {
  const hay = `${product.name} ${product.category} ${product.tagline}`.toLowerCase();
  if (hay.includes('mug') || hay.includes('tumbler') || hay.includes('bottle')) return { key: '17:7', error: 0.02 };
  if (hay.includes('coaster') || hay.includes('sticker') || hay.includes('ornament')) return { key: '1:1', error: 0.02 };
  if (hay.includes('poster') || hay.includes('print')) return { key: '3:4', error: 0.04 };
  if (hay.includes('jacket') || hay.includes('tee') || hay.includes('shirt') || hay.includes('hoodie')) {
    return { key: '4:5', error: 0.03 };
  }
  return { key: '4:5', error: 0.2 };
}

export function swsHeroes(products: SwsProduct[]): AmazonRow[] {
  const heroes: AmazonRow[] = [];
  for (const product of products) {
    const ratio = swsRatio(product);
    const medium = product.variants.find((variant) => (variant.size || '').toUpperCase() === 'M');
    const chosen = medium || product.variants[0];
    const size = chosen?.size || 'one';
    const supplierId = chosen?.supplier_variant_id || product.id;
    const cropScore = Number((100 / (1 + ratio.error * 12) + product.rating).toFixed(2));
    heroes.push({
      brand: SWS_BRAND,
      sku: `${product.id}:${size}:${supplierId}`,
      hero_design_id: product.id,
      item_name: limitTitle([product.name, size === 'one' ? '' : size]),
      product_description: plain(product.description) || plain(product.tagline),
      manufacturer: SWS_BRAND,
      standard_price: money(product.price),
      quantity: '',
      main_image_url: product.image,
      external_product_id: '',
      external_product_id_type: '',
      gtin_exemption: 'true',
      gtin_exemption_reason: 'Made to order print with no manufacturer barcode.',
      condition_type: 'new',
      item_type: flatText(product.category).toLowerCase().replace(/\s+/g, '-') || 'merchandise',
      aspect_ratio: ratio.key,
      crop_ratio: ratio.key,
      master_asset_path: product.image,
      crop_score: cropScore,
      size,
      production_partner: product.supplier,
      made_to_order: 'true',
      approved: product.approved ? 'true' : 'false',
      aspect_error: ratio.error,
    });
  }
  return takeShortlist(SWS_BRAND, heroes);
}

function takeShortlist(brand: string, rows: AmazonRow[]): AmazonRow[] {
  const ranked = [...rows].sort(
    (left, right) => right.crop_score - left.crop_score || left.hero_design_id.localeCompare(right.hero_design_id)
  );
  const strict = ranked.filter((row) => row.aspect_error <= 0.12);
  const pool = strict.length >= 6 ? strict : ranked.filter((row) => row.aspect_error <= 0.35);
  if (pool.length < 6) {
    throw new Error(`${brand} hero shortlist has ${pool.length} designs. The file needs 6 to 8.`);
  }
  const chosen = pool.slice(0, 8);
  const seen = new Set<string>();
  for (const row of chosen) {
    if (seen.has(row.hero_design_id)) {
      throw new Error(`${brand} shortlist repeated hero design ${row.hero_design_id}`);
    }
    seen.add(row.hero_design_id);
  }
  return chosen;
}

function amazonCsvRow(row: AmazonRow): Record<string, string | number> {
  const { aspect_error: _aspectError, ...rest } = row;
  return rest;
}

export const PHOTO_ETSY_HEADERS = [
  'sku',
  'title',
  'tags',
  'description',
  'catalog_retail_usd',
  'etsy_price_usd',
  'listing_fee_usd',
  'transaction_rate',
  'peak_buffer_usd',
  'currency',
  'quantity',
  'brand',
  'production_partner',
  'production_partner_disclosure',
  'artwork_slug',
  'size',
  'substrate',
  'crop_ratio',
  'master_asset_path',
  'image',
];

export const SWS_ETSY_HEADERS = [
  'sku',
  'title',
  'tags',
  'description',
  'catalog_retail_usd',
  'etsy_price_usd',
  'listing_fee_usd',
  'transaction_rate',
  'peak_buffer_usd',
  'currency',
  'quantity',
  'brand',
  'shop_name',
  'designer',
  'who_made',
  'when_made',
  'category',
  'sizes',
  'production_partner',
  'production_partner_disclosure',
  'crop_ratio',
  'master_asset_path',
  'image',
];

export const AMAZON_HEADERS = [
  'brand',
  'sku',
  'hero_design_id',
  'item_name',
  'product_description',
  'manufacturer',
  'standard_price',
  'quantity',
  'main_image_url',
  'external_product_id',
  'external_product_id_type',
  'gtin_exemption',
  'gtin_exemption_reason',
  'condition_type',
  'item_type',
  'aspect_ratio',
  'crop_ratio',
  'master_asset_path',
  'crop_score',
  'size',
  'production_partner',
  'made_to_order',
  'approved',
];

function main(): void {
  if (etsyListedPrice(195) !== 209.2) {
    throw new Error('Etsy fee formula did not return 209.20 for a 195.00 catalog price');
  }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const outDir = path.join(root, 'dist', 'channel-exports');
  fs.mkdirSync(outDir, { recursive: true });

  const artworks = loadPhotoArtworks(root);
  const products = loadSwsProducts();
  const photoEtsy = photoEtsyRows(artworks);
  const swsEtsy = swsEtsyRows(products);
  const photoAmazon = photoHeroes(artworks);
  const swsAmazon = swsHeroes(products);

  const amazonJson = {
    brands: [
      { brand: PHOTO_BRAND, sku_count: photoAmazon.length, items: photoAmazon.map(amazonCsvRow) },
      { brand: SWS_BRAND, sku_count: swsAmazon.length, items: swsAmazon.map(amazonCsvRow) },
    ],
  };

  const files = [
    ['etsy-alanwoodyard-photo.csv', toCsv(PHOTO_ETSY_HEADERS, photoEtsy)],
    ['etsy-seewhatsticks.csv', toCsv(SWS_ETSY_HEADERS, swsEtsy)],
    ['amazon-hero-shortlist.json', `${JSON.stringify(amazonJson, null, 2)}\n`],
    ['amazon-hero-shortlist.csv', toCsv(AMAZON_HEADERS, [...photoAmazon, ...swsAmazon].map(amazonCsvRow))],
  ] as const;

  for (const [name, contents] of files) {
    const target = path.join(outDir, name);
    fs.writeFileSync(target, contents, 'utf8');
    console.log(`Wrote ${target}`);
  }
  console.log(
    `Etsy photo rows: ${photoEtsy.length}. Etsy SeeWhatSticks rows: ${swsEtsy.length}. Amazon ${PHOTO_BRAND}: ${photoAmazon.length}. Amazon ${SWS_BRAND}: ${swsAmazon.length}.`
  );
}

const entry = process.argv[1]?.replace(/\\/g, '/') ?? '';
if (entry.endsWith('/scripts/export-channel-packs.ts') || entry.endsWith('/scripts/export-channel-packs.js')) {
  main();
}
