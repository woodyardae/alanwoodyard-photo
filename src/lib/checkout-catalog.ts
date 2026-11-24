/**
 * Shared catalog resolution for checkout and paid-order fulfillment.
 * Client cart prices are never authoritative. SKUs must resolve to pricing-matrix.json.
 * Print masters use /masters/{slug}/{crop}.{ext} when the SKU size, ratio, or artwork
 * crop mapping names a variant. /masters/{slug}.{ext} is used only when the artwork
 * explicitly approves that uncropped SKU/format under merch_crops.__uncropped.
 */

import { createRequire } from 'node:module';
import type { OrderItem, PodLab } from './fulfillment';
import {
  isAcceptedCropValue,
  isRejectedCropValue,
  parseRetailDollars,
  PHOTO_RATIO_PRODUCTS,
  RATIO_KEYS,
  RATIO_MAP,
  type ProductRubricItem,
  type RatioKey,
} from './merch-studio-shared';

export interface PricingMatrixEntry {
  retail: number;
  category: string;
  size: string;
  vendor: string;
}

const LABS: readonly PodLab[] = ['prodigi', 'printify', 'printful', 'gelato', 'gooten'];

/** Content-collection ids used as clean-master filenames. */
const ARTWORK_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isArtworkSlug(value: string): boolean {
  return ARTWORK_SLUG_RE.test(value) && value.length <= 80;
}

export function printAssetUrlForSlug(origin: string, slug: string): string {
  const base = origin.replace(/\/+$/, '');
  return `${base}/images/artworks/clean/${slug}.webp`;
}

const PRINT_MASTER_EXTENSIONS = new Set(['tif', 'tiff', 'jpg', 'jpeg', 'png']);
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface PrintAssetConfig {
  printMastersBaseUrl?: string;
  printMastersExtension?: string;
  allowCleanPreviewAssets?: boolean;
}

const RATIO_TOLERANCE = 0.02;
const GENERIC_CROP_TOKENS = new Set([
  'global',
  'prodigi',
  'printify',
  'printful',
  'gelato',
  'gooten',
  'displate',
  'photo',
  'print',
  'fine',
  'art',
  'rag',
  'the',
  'and',
  'set',
  'pack',
]);

export function sanitizeCropToken(value: string): string | null {
  const token = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!token || token.length > 80 || !SLUG_RE.test(token)) return null;
  return token;
}

/** Map a catalog size such as `16x24` onto a merch-studio ratio key, including the swapped orientation. */
export function ratioKeyFromSize(size: string | undefined): string | null {
  const match = /(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i.exec(size || '');
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!(width > 0) || !(height > 0)) return null;
  const target = width / height;
  let bestKey: string | null = null;
  let bestError = Number.POSITIVE_INFINITY;
  for (const key of RATIO_KEYS) {
    const ratio = RATIO_MAP[key];
    const direct = Math.abs(target - ratio) / ratio;
    const inverse = Math.abs(target - 1 / ratio) / (1 / ratio);
    const error = Math.min(direct, inverse);
    if (error < bestError) {
      bestError = error;
      bestKey = key;
    }
  }
  return bestKey && bestError <= RATIO_TOLERANCE ? bestKey : null;
}

export function knownRatioKey(value: string | undefined): string | null {
  const raw = (value || '').trim();
  if (!raw) return null;
  if (Object.prototype.hasOwnProperty.call(RATIO_MAP, raw)) return raw;
  const token = sanitizeCropToken(raw);
  if (!token) return null;
  for (const key of RATIO_KEYS) {
    if (sanitizeCropToken(key) === token) return key;
  }
  return null;
}

/**
 * File id for a confirmed merch_crops key under /masters/{slug}/{crop}.{ext}.
 * Ratio cluster keys (e.g. `2:3`) become `2-3`; product labels are sanitized.
 */
export function cropFileToken(productName: string): string | null {
  if (productName === '__rejected' || productName === UNCROPPED_MASTER_CROP_KEY) return null;
  const ratio = knownRatioKey(productName);
  return ratio ? sanitizeCropToken(ratio) : sanitizeCropToken(productName);
}

function cropLabels(key: string, value: unknown): string[] {
  const labels = [key];
  if (!value || typeof value !== 'object') return labels;
  const record = value as Record<string, unknown>;
  const nested =
    record.crop && typeof record.crop === 'object' ? (record.crop as Record<string, unknown>) : record;
  if (typeof nested.productKey === 'string') labels.push(nested.productKey);
  return labels;
}

function distinctiveTokens(value: string): string[] {
  const token = sanitizeCropToken(value);
  if (!token) return [];
  return token
    .split('-')
    .filter((part) => part.length >= 3 && !GENERIC_CROP_TOKENS.has(part) && !/^\d/.test(part));
}

/** Sentinel merch_crops key: approved_products listed here may use /masters/{slug}.{ext}. */
export const UNCROPPED_MASTER_CROP_KEY = '__uncropped';

function isUncroppedMasterKey(key: string): boolean {
  if (key === UNCROPPED_MASTER_CROP_KEY) return true;
  return sanitizeCropToken(key) === 'uncropped';
}

function readApprovedProducts(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const record = value as Record<string, unknown>;
  const list = Array.isArray(record.approved_products) ? record.approved_products : [];
  return list.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

function splitLabSku(value: string): { lab: PodLab | null; bare: string } {
  const colon = value.indexOf(':');
  if (colon <= 0) return { lab: null, bare: value };
  const lab = labFromVendor(value.slice(0, colon));
  if (!lab) return { lab: null, bare: value };
  return { lab, bare: value.slice(colon + 1) };
}

function productMatchesSku(product: string, sku?: string, size?: string): boolean {
  const needle = product.trim().toLowerCase();
  if (!needle) return false;

  const needleParts = splitLabSku(needle);
  const skuCandidates = (sku || '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((entry) => entry.length > 0);

  for (const candidate of skuCandidates) {
    if (candidate === needle) return true;
    const candidateParts = splitLabSku(candidate);
    if (!needleParts.lab && candidateParts.lab && candidateParts.bare === needle) {
      return true;
    }
  }

  const sizeNorm = (size || '').trim().toLowerCase();
  if (sizeNorm && !needleParts.lab && sizeNorm === needle) {
    return true;
  }

  return false;
}

/**
 * True when merch_crops.__uncropped.approved_products explicitly lists this SKU or format.
 * Absence of a crop token alone is not enough to use the raw master.
 */
export function isUncroppedMasterApproved(
  crops: Record<string, unknown> | null | undefined,
  sku?: string,
  size?: string
): boolean {
  if (!crops || !Object.prototype.hasOwnProperty.call(crops, UNCROPPED_MASTER_CROP_KEY)) {
    return false;
  }
  const entry = crops[UNCROPPED_MASTER_CROP_KEY];
  for (const product of readApprovedProducts(entry)) {
    if (productMatchesSku(product, sku, size)) return true;
  }
  return false;
}

/** Use an artwork crop file only when one crop key shares a distinctive token with the SKU. */
function matchCropBySku(crops: Record<string, unknown>, sku?: string, size?: string): string | null {
  const wanted = new Set<string>([...distinctiveTokens(sku || ''), ...distinctiveTokens(size || '')]);
  if (wanted.size === 0) return null;
  const hits = new Set<string>();
  for (const [key, value] of Object.entries(crops)) {
    if (key === '__rejected' || isUncroppedMasterKey(key) || isRejectedCropValue(value)) continue;
    const token = sanitizeCropToken(key);
    if (!token) continue;
    const hay = new Set<string>();
    for (const label of cropLabels(key, value)) {
      for (const part of distinctiveTokens(label)) hay.add(part);
    }
    for (const part of wanted) {
      if (hay.has(part)) hits.add(token);
    }
  }
  return hits.size === 1 ? [...hits][0] : null;
}

type SkuRatioBinding = { ratio: RatioKey; productId: string; matrixSku: string };

let skuRatioBindings: Map<string, SkuRatioBinding> | null = null;

function skuRatioIndex(): Map<string, SkuRatioBinding> {
  if (skuRatioBindings) return skuRatioBindings;
  const index = new Map<string, SkuRatioBinding>();
  for (const row of listPhotoRubricCatalogSkus()) {
    const binding: SkuRatioBinding = {
      ratio: row.ratio,
      productId: row.productId,
      matrixSku: row.sku,
    };
    index.set(row.sku, binding);
    index.set(row.sku.toLowerCase(), binding);
    index.set(row.productId, binding);
    index.set(row.productId.toLowerCase(), binding);
  }
  skuRatioBindings = index;
  return index;
}

function bindingForCheckoutSku(sku: string | undefined): SkuRatioBinding | null {
  if (!sku) return null;
  const index = skuRatioIndex();
  for (const part of sku.trim().split(/\s+/)) {
    if (!part) continue;
    const bare = splitLabSku(part).bare;
    const hit = index.get(bare) || index.get(bare.toLowerCase());
    if (hit) return hit;
  }
  return null;
}

function cropListsSku(entry: unknown, binding: SkuRatioBinding, sku?: string): boolean {
  const products = readApprovedProducts(entry);
  const record = entry && typeof entry === 'object' ? (entry as { approved_products?: unknown }) : null;
  if (products.length === 0) return !Array.isArray(record?.approved_products);
  const wanted = new Set<string>([binding.productId.toLowerCase(), binding.matrixSku.toLowerCase()]);
  for (const part of (sku || '').split(/\s+/)) {
    const bare = splitLabSku(part).bare.toLowerCase();
    if (bare) wanted.add(bare);
  }
  return products.some((product) => {
    const needle = product.trim().toLowerCase();
    if (!needle) return false;
    if (wanted.has(needle)) return true;
    return wanted.has(splitLabSku(needle).bare.toLowerCase());
  });
}

/**
 * Desk mats, mugs, coasters, and puzzles do not carry a WxH ratio in the matrix size.
 * Use the rubric RatioKey when that crop is saved and lists the product.
 */
function rubricCropForCheckoutSku(
  sku: string | undefined,
  crops: Record<string, unknown> | null | undefined
): CropSelection | null {
  const binding = bindingForCheckoutSku(sku);
  if (!binding) return null;
  const entry = (crops || {})[binding.ratio];
  if (entry == null) return null;
  if (isRejectedCropValue(entry)) {
    return { ok: false, error: 'This ratio is rejected for this image' };
  }
  if (!isAcceptedCropValue(entry) || !cropListsSku(entry, binding, sku)) return null;
  const ratioCrop = sanitizeCropToken(binding.ratio);
  if (!ratioCrop) return null;
  return { ok: true, crop: ratioCrop, ratio: binding.ratio };
}

export interface CropSelectionInput {
  size?: string;
  sku?: string;
  ratio?: string;
  crops?: Record<string, unknown> | null;
  /**
   * Hero export may name the ratio it already selected.
   * Checkout and paid webhooks leave this unset so metadata cannot invent a crop.
   */
  acceptDeclaredRatio?: boolean;
}

export type CropSelection =
  | { ok: true; crop: string | null; ratio: string | null }
  | { ok: false; error: string };

/**
 * Resolve the crop file id for a SKU.
 * A parsed size or an explicitly accepted ratio becomes /masters/{slug}/{crop}.{ext}.
 * Rubric goods whose matrix size is not a WxH ratio (desk mats, mugs, coasters, puzzles)
 * use the rubric RatioKey when that crop is saved on the artwork.
 * Artwork crop names apply when the size has no ratio and exactly one crop matches the SKU.
 * With no crop token, /masters/{slug}.{ext} is allowed only when __uncropped approves the SKU.
 */
export function resolveCropSelection(input: CropSelectionInput): CropSelection {
  const rawRatio = (input.ratio || '').trim();
  const fromSize = ratioKeyFromSize(input.size);
  const binding = bindingForCheckoutSku(input.sku);
  // A desk mat's physical size can sit near another ratio. The rubric bucket is the crop.
  const sizeRatio = binding && fromSize && binding.ratio !== fromSize ? null : fromSize;
  const declared = knownRatioKey(rawRatio);
  if (rawRatio && !declared) {
    return { ok: false, error: 'Crop ratio does not match the catalog size' };
  }
  if (sizeRatio && declared && sizeRatio !== declared) {
    return { ok: false, error: 'Crop ratio does not match the catalog size' };
  }
  if (declared && !sizeRatio && !input.acceptDeclaredRatio) {
    return { ok: false, error: 'Crop ratio does not match the catalog size' };
  }
  const ratio = sizeRatio || (input.acceptDeclaredRatio ? declared : null);
  if (ratio) {
    const ratioCrop = sanitizeCropToken(ratio);
    if (!ratioCrop) {
      return { ok: false, error: 'Crop ratio does not match the catalog size' };
    }
    if (isRejectedCropValue((input.crops || {})[ratio])) {
      return { ok: false, error: 'This ratio is rejected for this image' };
    }
    return { ok: true, crop: ratioCrop, ratio };
  }
  const catalogRatio = rubricCropForCheckoutSku(input.sku, input.crops);
  if (catalogRatio) return catalogRatio;
  const crops = input.crops || {};
  const named = matchCropBySku(crops, input.sku, input.size);
  if (named) {
    return { ok: true, crop: named, ratio: null };
  }
  if (isUncroppedMasterApproved(crops, input.sku, input.size)) {
    return { ok: true, crop: null, ratio: null };
  }
  return {
    ok: false,
    error: 'SKU is not approved for the uncropped print master',
  };
}

const cropCache = new Map<string, Record<string, unknown>>();

export function resetArtworkCropCache(): void {
  cropCache.clear();
}

function readArtworkCrops(slug: string, root: string): Record<string, unknown> {
  try {
    const require = createRequire(import.meta.url);
    const fs = require('node:fs') as {
      existsSync(path: string): boolean;
      readFileSync(path: string, encoding: 'utf8'): string;
    };
    const path = require('node:path') as { join(...parts: string[]): string };
    const file = path.join(root, 'src', 'content', 'artworks', `${slug}.json`);
    if (!fs.existsSync(file)) return {};
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) as {
      merch_crops?: unknown;
    };
    if (!parsed.merch_crops || typeof parsed.merch_crops !== 'object' || Array.isArray(parsed.merch_crops)) {
      return {};
    }
    return parsed.merch_crops as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function loadArtworkCrops(slug: string, root = process.cwd()): Record<string, unknown> {
  if (!isArtworkSlug(slug)) return {};
  const cacheKey = `${root}\0${slug}`;
  const cached = cropCache.get(cacheKey);
  if (cached) return cached;
  const loaded = readArtworkCrops(slug, root);
  cropCache.set(cacheKey, loaded);
  return loaded;
}

export function artworkCropsForSlug(
  slug: string,
  artworkCrops?: Record<string, Record<string, unknown>>
): Record<string, unknown> {
  if (artworkCrops && Object.prototype.hasOwnProperty.call(artworkCrops, slug)) {
    return artworkCrops[slug] || {};
  }
  return loadArtworkCrops(slug);
}

export function printMasterRelativePath(slug: string, crop?: string | null, extension = 'tif'): string {
  const ext = (extension || 'tif').trim().toLowerCase().replace(/^\./, '');
  if (crop) return `/masters/${slug}/${crop}.${ext}`;
  return `/masters/${slug}.${ext}`;
}

/**
 * Printify and Printful pull the 300 DPI sRGB JPEG derivative (/masters/{slug}/{crop}.jpg)
 * by default. Prodigi, Gelato, and any other lab keep the archival .tif master.
 * PRINT_MASTERS_EXTENSION always wins when explicitly set, for every lab.
 */
const JPEG_DEFAULT_LABS: ReadonlySet<PodLab> = new Set(['printify', 'printful']);

function defaultPrintMasterExtension(provider: PodLab | string | null | undefined): string {
  return provider && JPEG_DEFAULT_LABS.has(provider as PodLab) ? 'jpg' : 'tif';
}

/**
 * Lab files come from PRINT_MASTERS_BASE_URL.
 * A resolved crop uses /masters/{slug}/{crop}.{ext}.
 * crop=null (explicitly approved uncropped SKU) uses /masters/{slug}.{ext}.
 * The clean webp preview is used only when allowCleanPreviewAssets is explicitly true
 * and no master base URL is configured.
 * `provider` selects the per-lab default extension (Printify/Printful -> jpg,
 * everyone else -> tif) when printMastersExtension is not explicitly configured.
 */
export function resolvePrintAssetUrl(
  origin: string,
  slug: string,
  config: PrintAssetConfig = {},
  crop: string | null,
  provider?: PodLab | string | null
): { ok: true; url: string } | { ok: false; error: string } {
  if (!SLUG_RE.test(slug)) {
    return { ok: false, error: 'Artwork slug is not a published print id' };
  }
  let cropToken: string | null = null;
  if (crop !== null) {
    if (typeof crop !== 'string') {
      return { ok: false, error: 'Print crop is not a catalog variant' };
    }
    const trimmed = crop.trim();
    if (!trimmed || !SLUG_RE.test(trimmed)) {
      return { ok: false, error: 'Print crop is not a catalog variant' };
    }
    cropToken = trimmed;
  }

  const base = (config.printMastersBaseUrl || '').trim();
  if (base) {
    let parsed: URL;
    try {
      parsed = new URL(base);
    } catch {
      return { ok: false, error: 'PRINT_MASTERS_BASE_URL is invalid' };
    }
    if (parsed.protocol !== 'https:') {
      return { ok: false, error: 'PRINT_MASTERS_BASE_URL must use https' };
    }
    if (parsed.username || parsed.password) {
      return { ok: false, error: 'PRINT_MASTERS_BASE_URL must not include credentials' };
    }
    const explicitExt = (config.printMastersExtension || '').trim().toLowerCase().replace(/^\./, '');
    const ext = explicitExt || defaultPrintMasterExtension(provider);
    if (!PRINT_MASTER_EXTENSIONS.has(ext)) {
      return { ok: false, error: 'PRINT_MASTERS_EXTENSION must be tif, tiff, jpg, jpeg, or png' };
    }
    parsed.hash = '';
    parsed.search = '';
    const prefix = parsed.pathname.replace(/\/+$/, '');
    parsed.pathname = `${prefix}${printMasterRelativePath(slug, cropToken || null, ext)}`;
    return { ok: true, url: parsed.toString() };
  }

  if (config.allowCleanPreviewAssets === true) {
    return { ok: true, url: printAssetUrlForSlug(origin, slug) };
  }

  return { ok: false, error: 'Print master URL is not configured' };
}

export function catalogUnitAmountCents(entry: PricingMatrixEntry): number | null {
  if (typeof entry.retail !== 'number' || !Number.isFinite(entry.retail) || entry.retail <= 0) {
    return null;
  }
  const cents = Math.round(entry.retail * 100);
  if (!Number.isSafeInteger(cents) || cents <= 0) return null;
  return cents;
}

export function labFromVendor(vendor: string | undefined): PodLab | null {
  const lower = (vendor || '').trim().toLowerCase();
  return LABS.includes(lower as PodLab) ? (lower as PodLab) : null;
}

/** Labs this store can fulfill without an extra flag. */
export const DEFAULT_STOREFRONT_LABS: readonly PodLab[] = ['prodigi', 'printify'];

/** Labs that stay off the buyer catalog until CHECKOUT_ENABLED_VENDORS names them. */
const OPT_IN_STOREFRONT_LABS = new Set<PodLab>(['printful', 'gelato', 'gooten']);

/**
 * Split a CHECKOUT_ENABLED_VENDORS value.
 * Blank means the caller should use the default Prodigi and Printify labs.
 */
export function parseEnabledVendorsConfig(value: string | null | undefined): string[] | undefined {
  if (typeof value !== 'string') return undefined;
  const parts = value
    .split(/[,|\s]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return parts.length > 0 ? parts : undefined;
}

/**
 * Split a CHECKOUT_ALLOWED_COUNTRIES value into ISO 3166-1 alpha-2 codes.
 * Blank or unset means the caller should default to US-only shipping.
 */
export function parseAllowedCountriesConfig(value: string | null | undefined): string[] | undefined {
  if (typeof value !== 'string') return undefined;
  const parts = value
    .split(/[,|\s]+/)
    .map((part) => part.trim().toUpperCase())
    .filter((part) => /^[A-Z]{2}$/.test(part));
  return parts.length > 0 ? parts : undefined;
}

/**
 * Buyer-facing labs. Prodigi and Printify stay on.
 * Printful, Gelato, and Gooten are added only when the enabled-vendors flag names them.
 */
export function enabledStorefrontLabs(enabledVendors?: readonly string[] | null): ReadonlySet<PodLab> {
  const enabled = new Set<PodLab>(DEFAULT_STOREFRONT_LABS);
  if (!enabledVendors) return enabled;
  for (const raw of enabledVendors) {
    const lab = labFromVendor(raw);
    if (lab && OPT_IN_STOREFRONT_LABS.has(lab)) enabled.add(lab);
  }
  return enabled;
}

export function mapCategoryToSubstrate(category: string): OrderItem['substrate'] {
  const c = (category || '').toLowerCase();
  if (c.includes('metal') || c.includes('aluminum')) return 'aluminum-panel';
  // Desk Block / acrylic block SKUs (GLOBAL-BLK-*) before generic "desk" → desk-mat.
  if (c.includes('acrylic') || c.includes('block')) return 'acrylic-float';
  if (c.includes('frame')) return 'framed-print';
  if (c.includes('canvas')) return 'stretched-canvas';
  if (c.includes('card')) return 'linen-art-cards';
  if (c.includes('desk') || c.includes('mat')) return 'desk-mat';
  return 'hahnemuhle-rag';
}

export function normalizeSize(raw: string): string {
  return (raw || '').replace(/"/g, '').trim();
}

/**
 * Map a storefront cart SKU onto a pricing-matrix key.
 * Accepts the matrix key itself, a lab-prefixed matrix key, or Prodigi rag aliases
 * such as `prodigi:rag-16x24` → `GLOBAL-FAP-16x24` when that size is published.
 */
export function resolveMatrixSku(
  sku: string,
  matrix: Record<string, PricingMatrixEntry>
): string | null {
  const raw = (sku || '').trim();
  if (!raw || raw.length > 120 || /[\s/\\]/.test(raw)) return null;
  if (matrix[raw]) return raw;

  const colon = raw.indexOf(':');
  let bare = raw;
  if (colon >= 0) {
    const prefix = raw.slice(0, colon);
    if (!labFromVendor(prefix)) return null;
    bare = raw.slice(colon + 1);
    if (matrix[bare]) return bare;
  }

  const rag = /^rag-(\d+x\d+)$/.exec(bare);
  if (!rag) return null;
  const paperKey = `GLOBAL-FAP-${rag[1]}`;
  return matrix[paperKey] ? paperKey : null;
}

/**
 * Message for a cart SKU that did not resolve.
 * A rag alias such as prodigi:rag-42x63 names the missing GLOBAL-FAP key when that size was never published.
 */
export function describeUnresolvedSku(
  sku: string,
  matrix: Record<string, PricingMatrixEntry>
): string {
  const raw = (sku || '').trim();
  if (!raw) return 'SKU is missing';
  if (raw.length > 120 || /[\s/\\]/.test(raw)) {
    return `SKU is not in the pricing matrix: ${raw}`;
  }
  const colon = raw.indexOf(':');
  let bare = raw;
  if (colon >= 0) {
    const prefix = raw.slice(0, colon);
    if (!labFromVendor(prefix)) {
      return `Cart SKU ${raw} uses an unknown lab prefix`;
    }
    bare = raw.slice(colon + 1);
    if (!bare) return `Cart SKU ${raw} is missing a catalog id`;
  }
  const rag = /^rag-(\d+x\d+)$/i.exec(bare);
  if (rag) {
    const paperKey = `GLOBAL-FAP-${rag[1]}`;
    if (!matrix[paperKey]) {
      return `Cart SKU ${raw} is not a published catalog size (${paperKey})`;
    }
  }
  return `SKU is not in the pricing matrix: ${raw}`;
}

export type StorefrontPackaging = 'rigid_tube' | 'flat_crate' | 'corrugated_box' | 'poly_mailer';

export interface RubricCatalogSku {
  productId: string;
  ratio: RatioKey;
  sku: string;
  category: string;
  size: string;
  retail: number;
  vendor: string;
  packaging: StorefrontPackaging;
  placement: 'goods' | 'print' | 'external';
}

export interface StorefrontGoodsItem {
  productId: string;
  title: string;
  spec: string;
  sku: string;
  price: number;
  provider: PodLab;
  vendor: string;
  packaging: StorefrontPackaging;
  size: string;
}

export type StorefrontPrintItem = StorefrontGoodsItem;

export interface StorefrontExternalItem {
  productId: string;
  title: string;
  spec: string;
  price: number;
  href: string;
}

export interface ApprovedStorefront {
  goods: StorefrontGoodsItem[];
  prints: StorefrontPrintItem[];
  external: StorefrontExternalItem[];
}

const DISPLATE_STORE_HREF = 'https://displate.com/alanwoodyard';

const CHECKOUT_SKU_OVERRIDES: Record<string, string> = {
  'prodigi-blk-8x4': 'GLOBAL-BLK-8x4',
  'prodigi-panoramic-block': 'GLOBAL-BLK-8x45',
  'prodigi-post-10pk': 'GLOBAL-POST-5x7',
  'prodigi-cards-10pk': 'GLOBAL-CARD-5x7',
  'prodigi-folio-5x7': 'GLOBAL-FOLIO-5x7',
  'prodigi-mug-11oz': 'GLOBAL-MUG-11oz',
  'prodigi-mug-15oz': 'GLOBAL-MUG-15oz',
  'printful-tote-bag': 'PFL-TOTE',
  'printful-tee-chest': 'PFL-TEE-CHEST',
  'gelato-wall-calendar': 'GLT-CAL-WALL',
};

interface IndexedRubricProduct {
  ratio: RatioKey;
  item: ProductRubricItem;
}

const photoRubricById = new Map<string, IndexedRubricProduct>();
for (const ratio of RATIO_KEYS) {
  for (const item of PHOTO_RATIO_PRODUCTS[ratio]) {
    if (!photoRubricById.has(item.id)) {
      photoRubricById.set(item.id, { ratio, item });
    }
  }
}

/** Checkout matrix key for a photo-store rubric id. Displate stays off the cart. */
export function checkoutSkuForRubricId(id: string): string | null {
  if (id.startsWith('displate-')) return null;
  const override = CHECKOUT_SKU_OVERRIDES[id];
  if (override) return override;
  const size = /(\d+x\d+)/.exec(id)?.[1];
  if (id.startsWith('prodigi-rag-') && size) return `GLOBAL-FAP-${size}`;
  if (id.startsWith('prodigi-frame-') && size) return `GLOBAL-CFP-${size}`;
  if ((id.startsWith('prodigi-can-') || id.startsWith('prodigi-canvas-')) && size) return `GLOBAL-CAN-${size}`;
  if (id.startsWith('prodigi-acr-') && size) return `GLOBAL-ACR-${size}`;
  if (id.startsWith('prodigi-met-') && size) return `GLOBAL-MET-${size}`;
  if (id.startsWith('prodigi-acrylic-block-') && size) return `GLOBAL-BLK-${size}`;
  if (id.startsWith('printful-can-') && size) return `PFL-CAN-${size}`;
  const prefix = id.startsWith('printify-')
    ? 'PFY'
    : id.startsWith('printful-')
      ? 'PFL'
      : id.startsWith('gelato-')
        ? 'GLT'
        : id.startsWith('prodigi-')
          ? 'GLOBAL'
          : null;
  if (!prefix) return null;
  const body = id
    .replace(/^(printify|printful|gelato|prodigi)-/, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toUpperCase();
  return body ? `${prefix}-${body}` : null;
}

export function isFineArtPaperListing(sku: string, substrate = ''): boolean {
  const hay = `${sku} ${substrate}`.toLowerCase();
  return (
    hay.includes('-rag') ||
    hay.includes('rag-') ||
    hay.includes('fap') ||
    hay.includes('hahnem') ||
    hay.includes('fine art paper') ||
    hay.includes('photo rag')
  );
}

/** Orientation-insensitive inch key such as `12x18` from `12x18"` or `18 x 12`. */
export function canonicalPrintSizeKey(size: string): string | null {
  const match = /(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i.exec(size || '');
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!(width > 0) || !(height > 0)) return null;
  const [lo, hi] = width <= height ? [width, height] : [height, width];
  return `${lo}x${hi}`;
}

function rubricTokens(id: string): string[] {
  return id.toLowerCase().split('-').filter(Boolean);
}

function categoryForRubricId(id: string): string {
  const tokens = rubricTokens(id);
  if (tokens.includes('rag')) return 'Fine Art Paper';
  if (tokens.includes('frame')) return 'Framed Print';
  if (tokens.includes('canvas') || tokens.includes('can')) return 'Canvas Wrap';
  if (tokens.includes('acr')) return 'Acrylic Float';
  if (tokens.includes('met')) return 'Metal Print';
  if (tokens.includes('block') || tokens.includes('blk')) return 'Desk Block';
  if (tokens.some((part) => part === 'mug' || part === 'tumbler' || part === 'bottle' || part === 'waterbottle' || part === 'enamel')) {
    return 'Drinkware';
  }
  if (tokens.includes('coasters')) return 'Coaster Set';
  if (tokens.includes('pillow')) return 'Throw Pillow';
  if (tokens.includes('tote') || tokens.includes('tee')) return 'Apparel';
  if (tokens.includes('puzzle')) return 'Jigsaw Puzzle';
  if (tokens.includes('deskmat')) return 'Desk Mat';
  if (tokens.includes('phone')) return 'Phone Case';
  if (tokens.includes('calendar')) return 'Calendar';
  if (tokens.includes('folio')) return 'Mini Print';
  if (tokens.includes('post') || tokens.includes('cards')) return 'Stationery';
  return 'Studio Goods';
}

function packagingForRubricId(id: string): StorefrontPackaging {
  const tokens = rubricTokens(id);
  if (tokens.includes('rag') || tokens.includes('folio')) return 'rigid_tube';
  if (
    tokens.includes('frame') ||
    tokens.includes('canvas') ||
    tokens.includes('can') ||
    tokens.includes('acr') ||
    tokens.includes('met')
  ) {
    return 'flat_crate';
  }
  if (
    tokens.includes('deskmat') ||
    tokens.includes('pillow') ||
    tokens.includes('tote') ||
    tokens.includes('tee') ||
    tokens.includes('phone')
  ) {
    return 'poly_mailer';
  }
  return 'corrugated_box';
}

function placementForRubricId(id: string): RubricCatalogSku['placement'] {
  const tokens = rubricTokens(id);
  if (tokens.includes('displate') || id.startsWith('displate-')) return 'external';
  if (tokens.includes('rag')) return 'print';
  return 'goods';
}

function sizeForRubric(item: ProductRubricItem): string {
  const inches = /(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*"/i.exec(item.name);
  if (inches) return `${inches[1]}x${inches[2]}"`;
  const oz = /(\d+)\s*oz/i.exec(item.name);
  if (oz) return `${oz[1]}oz`;
  const pieces = /(\d+)\s*-?\s*pc/i.exec(item.name);
  if (pieces) return `${pieces[1]}-pc`;
  const pack = /(\d+)\s*-?\s*Pk/i.exec(item.name);
  if (pack) return `${pack[1]}-Pk`;
  if (item.id.includes('phone-iphone-max')) return 'iPhone Pro Max';
  if (item.id.includes('phone-iphone-pro')) return 'iPhone Pro';
  if (item.id.includes('phone-galaxy')) return 'Galaxy Ultra';
  if (item.id.includes('tee')) return 'Chest print';
  return 'One size';
}

function specForRubricId(id: string): string {
  const tokens = rubricTokens(id);
  if (tokens.includes('displate')) return 'Magnetic mount, external platform';
  if (tokens.includes('rag') || tokens.includes('folio')) return 'Hahnemühle Photo Rag 308gsm';
  if (tokens.includes('frame')) return 'Matted gallery frame';
  if (tokens.includes('canvas') || tokens.includes('can')) return 'Museum stretched canvas';
  if (tokens.includes('acr')) return 'Optical acrylic panel';
  if (tokens.includes('met')) return 'Brushed aluminum plate';
  if (tokens.includes('block') || tokens.includes('blk')) return 'Freestanding optical acrylic';
  if (tokens.some((part) => part === 'mug' || part === 'tumbler' || part === 'bottle' || part === 'waterbottle' || part === 'enamel')) {
    return 'Photo wrap, boxed';
  }
  if (tokens.includes('coasters')) return 'Heat-resistant top, cork base';
  if (tokens.includes('pillow')) return 'Spun poly cover';
  if (tokens.includes('tote') || tokens.includes('tee')) return 'Printed garment';
  if (tokens.includes('puzzle')) return 'Die-cut board, boxed';
  if (tokens.includes('deskmat')) return 'Natural rubber base, stitched border';
  if (tokens.includes('phone')) return 'Tough printed shell';
  if (tokens.includes('post') || tokens.includes('cards')) return 'Archival stock, boxed';
  if (tokens.includes('calendar')) return 'Wire-O wall calendar';
  return 'Studio goods';
}

/** One catalog row per photo rubric product. Existing GLOBAL keys stay shared with the hand matrix. */
export function listPhotoRubricCatalogSkus(): RubricCatalogSku[] {
  const rows: RubricCatalogSku[] = [];
  for (const ratio of RATIO_KEYS) {
    for (const item of PHOTO_RATIO_PRODUCTS[ratio]) {
      const retail = parseRetailDollars(item.retail);
      const sku = checkoutSkuForRubricId(item.id);
      if (retail == null || !sku) continue;
      rows.push({
        productId: item.id,
        ratio,
        sku,
        category: categoryForRubricId(item.id),
        size: sizeForRubric(item),
        retail,
        vendor: item.vendor,
        packaging: packagingForRubricId(item.id),
        placement: placementForRubricId(item.id),
      });
    }
  }
  return rows;
}

export interface ApprovedStorefrontInput {
  matrix: Record<string, PricingMatrixEntry>;
  crops?: Record<string, unknown> | null;
  /** Fine-art paper sizes already rendered in the prints column. */
  listedPaperSizes?: readonly string[];
  /** Fine-art paper SKUs already rendered in the prints column. */
  listedPaperSkus?: readonly string[];
  /**
   * Extra labs named by CHECKOUT_ENABLED_VENDORS.
   * Omitted: Prodigi and Printify only.
   */
  enabledVendors?: readonly string[] | null;
}

/**
 * Turn merch_approved rubric ids into priced storefront rows.
 * Rejected ratio crops are omitted. Fine-art paper sizes already in the prints
 * column are omitted so the same sheet is not offered twice.
 */
export function resolveApprovedStorefront(
  approvedIds: readonly string[],
  input: ApprovedStorefrontInput
): ApprovedStorefront {
  const goods: StorefrontGoodsItem[] = [];
  const prints: StorefrontPrintItem[] = [];
  const external: StorefrontExternalItem[] = [];
  const seen = new Set<string>();
  const listedSizes = new Set(
    (input.listedPaperSizes || [])
      .map((size) => canonicalPrintSizeKey(size))
      .filter((size): size is string => Boolean(size))
  );
  const listedSkus = new Set(
    (input.listedPaperSkus || [])
      .map((sku) => resolveMatrixSku(sku, input.matrix))
      .filter((sku): sku is string => Boolean(sku))
  );
  const enabledLabs = enabledStorefrontLabs(input.enabledVendors);

  for (const rawId of approvedIds) {
    if (typeof rawId !== 'string') continue;
    const productId = rawId.trim();
    if (!productId || seen.has(productId)) continue;
    const indexed = photoRubricById.get(productId);
    if (!indexed) continue;
    seen.add(productId);
    const crops = input.crops || {};
    if (isRejectedCropValue(crops[indexed.ratio])) continue;

    if (indexed.item.vendor === 'Displate' || productId.startsWith('displate-')) {
      const price = parseRetailDollars(indexed.item.retail);
      if (price == null) continue;
      external.push({
        productId,
        title: indexed.item.name,
        spec: specForRubricId(productId),
        price,
        href: DISPLATE_STORE_HREF,
      });
      continue;
    }

    const sku = checkoutSkuForRubricId(productId);
    if (!sku) continue;
    const matrixSku = resolveMatrixSku(sku, input.matrix);
    const entry = matrixSku ? input.matrix[matrixSku] : undefined;
    const provider = entry ? labFromVendor(entry.vendor) : null;
    if (!entry || !matrixSku || !provider || !enabledLabs.has(provider)) continue;
    const size = entry.size || sizeForRubric(indexed.item);
    const row: StorefrontGoodsItem = {
      productId,
      title: indexed.item.name,
      spec: specForRubricId(productId),
      sku: matrixSku,
      price: entry.retail,
      provider,
      vendor: entry.vendor,
      packaging: packagingForRubricId(productId),
      size,
    };

    if (placementForRubricId(productId) === 'print') {
      const sizeKey = canonicalPrintSizeKey(size);
      if ((sizeKey && listedSizes.has(sizeKey)) || listedSkus.has(matrixSku)) continue;
      if (sizeKey) listedSizes.add(sizeKey);
      listedSkus.add(matrixSku);
      prints.push(row);
      continue;
    }

    goods.push(row);
  }

  return { goods, prints, external };
}
