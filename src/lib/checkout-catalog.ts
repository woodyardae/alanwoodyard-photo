/**
 * Shared catalog resolution for checkout and paid-order fulfillment.
 * Client cart prices are never authoritative. SKUs must resolve to pricing-matrix.json.
 * Print masters use /masters/{slug}/{crop}.{ext} when the SKU size, ratio, or artwork
 * crop mapping names a variant. /masters/{slug}.{ext} is used only when the artwork
 * explicitly approves that uncropped SKU/format under merch_crops.__uncropped.
 */

import { createRequire } from 'node:module';
import type { OrderItem, PodLab } from './fulfillment';
import { RATIO_KEYS, RATIO_MAP } from './merch-studio-shared';

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
    if (key === '__rejected' || isUncroppedMasterKey(key)) continue;
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
 * Artwork crop names apply when the size has no ratio and exactly one crop matches the SKU.
 * With no crop token, /masters/{slug}.{ext} is allowed only when __uncropped approves the SKU.
 */
export function resolveCropSelection(input: CropSelectionInput): CropSelection {
  const rawRatio = (input.ratio || '').trim();
  const fromSize = ratioKeyFromSize(input.size);
  const declared = knownRatioKey(rawRatio);
  if (rawRatio && !declared) {
    return { ok: false, error: 'Crop ratio does not match the catalog size' };
  }
  if (fromSize && declared && fromSize !== declared) {
    return { ok: false, error: 'Crop ratio does not match the catalog size' };
  }
  if (declared && !fromSize && !input.acceptDeclaredRatio) {
    return { ok: false, error: 'Crop ratio does not match the catalog size' };
  }
  const ratio = fromSize || (input.acceptDeclaredRatio ? declared : null);
  if (ratio) {
    const ratioCrop = sanitizeCropToken(ratio);
    if (!ratioCrop) {
      return { ok: false, error: 'Crop ratio does not match the catalog size' };
    }
    return { ok: true, crop: ratioCrop, ratio };
  }
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
 * Lab files come from PRINT_MASTERS_BASE_URL.
 * A resolved crop uses /masters/{slug}/{crop}.{ext}.
 * crop=null (explicitly approved uncropped SKU) uses /masters/{slug}.{ext}.
 * The clean webp preview is used only when allowCleanPreviewAssets is explicitly true
 * and no master base URL is configured.
 */
export function resolvePrintAssetUrl(
  origin: string,
  slug: string,
  config: PrintAssetConfig = {},
  crop: string | null
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
    const ext = (config.printMastersExtension || 'tif').trim().toLowerCase().replace(/^\./, '');
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

export function mapCategoryToSubstrate(category: string): OrderItem['substrate'] {
  const c = (category || '').toLowerCase();
  if (c.includes('metal') || c.includes('aluminum')) return 'aluminum-panel';
  if (c.includes('acrylic')) return 'acrylic-float';
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
