/**
 * Runtime overlay of Merch Studio KV edits on the bundled artwork JSON.
 * `id` and Backblaze `master_file` stay on the bundled record.
 * Crop maps written today at crops:{id} and awp_merch_crops are read as merch_crops.
 * A record may also carry title, caption, description, collections, tags, slug, and merch_approved.
 */

import { createRequire } from 'node:module';
import { getPublishedArtworkSlugs } from './artwork-catalog';

/** Public artwork and collection slugs. Lowercase words separated by single hyphens. */
export const ARTWORK_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const ARTWORK_DESCRIPTION_MAX = 320;

const SLUG_RE = ARTWORK_SLUG_RE;

export const MERCH_CROP_SNAPSHOT_KEY = 'awp_merch_crops';
export const MERCH_CROP_LIST_KEY = 'crops:_modified_list';

const OVERLAY_FIELDS = [
  'merch_crops',
  'merch_approved',
  'title',
  'caption',
  'description',
  'collections',
  'tags',
  'slug',
] as const;

export interface ArtworkJson {
  id: string;
  title: string;
  caption?: string;
  description?: string;
  collections?: string[];
  tags?: string[];
  slug?: string;
  master_file?: string;
  merch_approved?: string[];
  merch_crops?: Record<string, unknown>;
  print_variants?: Array<{
    sku: string;
    substrate?: string;
    size?: string;
    price_cents?: number;
  }>;
  capture?: { aspect_ratio?: string; [key: string]: unknown };
  [key: string]: unknown;
}

export interface EffectiveArtwork {
  id: string;
  slug: string;
  title: string;
  caption: string;
  description: string;
  collections: string[];
  tags: string[];
  master_file: string;
  merch_approved: string[];
  merch_crops: Record<string, unknown>;
  data: ArtworkJson;
}

export interface SessionKv {
  get(key: string): Promise<string | null>;
  put?(key: string, value: string): Promise<void>;
}

export interface ArtworkOverlayEnv {
  SESSION?: SessionKv | null;
}

export interface ArtworkOverlay {
  merch_crops?: Record<string, unknown>;
  merch_approved?: string[];
  title?: string;
  caption?: string;
  description?: string;
  collections?: string[];
  tags?: string[];
  slug?: string;
}

export interface CheckoutArtworkState {
  artworkCrops: Record<string, Record<string, unknown>>;
  canonicalArtworkIds: ReadonlyMap<string, string>;
  publishedSlugs: ReadonlySet<string>;
}

interface DiskModules {
  existsSync(path: string): boolean;
  readdirSync(path: string): string[];
  readFileSync(path: string, encoding: 'utf8'): string;
  join(...parts: string[]): string;
}

function diskModules(): DiskModules | null {
  try {
    const require = createRequire(import.meta.url);
    const fs = require('node:fs') as {
      existsSync(path: string): boolean;
      readdirSync(path: string): string[];
      readFileSync(path: string, encoding: 'utf8'): string;
    };
    const path = require('node:path') as { join(...parts: string[]): string };
    return {
      existsSync: (target) => fs.existsSync(target),
      readdirSync: (target) => fs.readdirSync(target),
      readFileSync: (target, encoding) => fs.readFileSync(target, encoding),
      join: (...parts) => path.join(...parts),
    };
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw.replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
}

function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function isCropLike(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.rejected === true) return true;
  if (typeof value.panX === 'number' || typeof value.panY === 'number' || typeof value.zoom === 'number') {
    return true;
  }
  if (typeof value.approved_at === 'string' || typeof value.approvedAt === 'string') return true;
  if (Array.isArray(value.approved_products) || Array.isArray(value.excluded_products)) return true;
  if (isRecord(value.crop)) return true;
  return false;
}

function cropEntries(record: Record<string, unknown>): Record<string, unknown> | undefined {
  const crops: Record<string, unknown> = {};
  let count = 0;
  for (const [key, value] of Object.entries(record)) {
    if ((OVERLAY_FIELDS as readonly string[]).includes(key)) continue;
    if (key === 'id' || key === 'master_file') continue;
    if (key === '__rejected' || isCropLike(value)) {
      crops[key] = value;
      count += 1;
    }
  }
  return count > 0 ? crops : undefined;
}

function approvedProducts(crops: Record<string, unknown>): string[] {
  const approved = new Set<string>();
  for (const value of Object.values(crops)) {
    if (!isRecord(value) || value.rejected === true) continue;
    const list = Array.isArray(value.approved_products) ? value.approved_products : [];
    for (const product of list) {
      if (typeof product === 'string' && product.trim()) approved.add(product.trim());
    }
  }
  return [...approved];
}

function cropsDeclareProducts(crops: Record<string, unknown>): boolean {
  for (const value of Object.values(crops)) {
    if (isRecord(value) && Array.isArray(value.approved_products)) return true;
  }
  return false;
}

/** Normalize a KV value into overlay fields. Legacy crop maps become merch_crops. */
export function parseArtworkOverlay(value: unknown): ArtworkOverlay | null {
  if (!isRecord(value)) return null;
  const wrapped = OVERLAY_FIELDS.some((key) => Object.prototype.hasOwnProperty.call(value, key));
  if (!wrapped) return { merch_crops: value };

  const overlay: ArtworkOverlay = {};
  if (isRecord(value.merch_crops)) overlay.merch_crops = value.merch_crops;
  if (Array.isArray(value.merch_approved)) overlay.merch_approved = stringList(value.merch_approved) ?? [];
  if (typeof value.title === 'string' && value.title.trim()) overlay.title = value.title.trim();
  if (typeof value.caption === 'string') overlay.caption = value.caption;
  if (typeof value.description === 'string') overlay.description = value.description;
  if (Array.isArray(value.collections)) overlay.collections = stringList(value.collections) ?? [];
  if (Array.isArray(value.tags)) overlay.tags = stringList(value.tags) ?? [];
  if (typeof value.slug === 'string' && SLUG_RE.test(value.slug.trim().toLowerCase())) {
    overlay.slug = value.slug.trim().toLowerCase();
  }
  if (!overlay.merch_crops) {
    const crops = cropEntries(value);
    if (crops) overlay.merch_crops = crops;
  }
  return overlay;
}

/** Merge one KV record onto a bundled artwork. id and master_file stay on the base. */
export function mergeArtworkOverlay(base: ArtworkJson, kvValue: unknown): ArtworkJson {
  const overlay = parseArtworkOverlay(kvValue);
  const next: ArtworkJson = { ...base };
  if (!overlay) {
    next.id = base.id;
    if (base.master_file !== undefined) next.master_file = base.master_file;
    return next;
  }

  if (overlay.title !== undefined) next.title = overlay.title;
  if (overlay.caption !== undefined) next.caption = overlay.caption;
  if (overlay.description !== undefined) next.description = overlay.description;
  if (overlay.collections !== undefined) next.collections = [...overlay.collections];
  if (overlay.tags !== undefined) next.tags = [...overlay.tags];
  if (overlay.slug !== undefined) next.slug = overlay.slug;
  if (overlay.merch_crops) {
    next.merch_crops = overlay.merch_crops;
    if (overlay.merch_approved === undefined && cropsDeclareProducts(overlay.merch_crops)) {
      next.merch_approved = approvedProducts(overlay.merch_crops);
    }
  }
  if (overlay.merch_approved !== undefined) next.merch_approved = [...overlay.merch_approved];

  next.id = base.id;
  if (base.master_file !== undefined) next.master_file = base.master_file;
  else delete next.master_file;
  return next;
}

function bundledSlug(record: ArtworkJson): string {
  const candidate = typeof record.slug === 'string' ? record.slug.trim().toLowerCase() : '';
  return SLUG_RE.test(candidate) ? candidate : record.id;
}

function toEffective(record: ArtworkJson): EffectiveArtwork {
  const crops = isRecord(record.merch_crops) ? record.merch_crops : {};
  const approved = Array.isArray(record.merch_approved)
    ? record.merch_approved.filter((item): item is string => typeof item === 'string')
    : [];
  return {
    id: record.id,
    slug: bundledSlug(record),
    title: record.title,
    caption: typeof record.caption === 'string' ? record.caption : '',
    description: typeof record.description === 'string' ? record.description : '',
    collections: Array.isArray(record.collections)
      ? record.collections.filter((item): item is string => typeof item === 'string')
      : [],
    tags: Array.isArray(record.tags) ? record.tags.filter((item): item is string => typeof item === 'string') : [],
    master_file: typeof record.master_file === 'string' ? record.master_file : '',
    merch_approved: approved,
    merch_crops: crops,
    data: record,
  };
}

function assignUniqueSlugs(records: EffectiveArtwork[]): EffectiveArtwork[] {
  const used = new Set(records.map((record) => record.id));
  return records.map((record) => {
    if (record.slug !== record.id && !used.has(record.slug)) {
      used.add(record.slug);
      return record;
    }
    return { ...record, slug: record.id, data: { ...record.data, slug: record.id } };
  });
}

let globArtworks: ArtworkJson[] | null | undefined;

function loadGlobArtworks(): ArtworkJson[] | null {
  if (globArtworks !== undefined) return globArtworks;
  try {
    // Vite replaces this call in the worker bundle. Node tests fall through to disk.
    const modules = import.meta.glob('../content/artworks/*.json', {
      eager: true,
      import: 'default',
    }) as Record<string, ArtworkJson>;
    globArtworks = Object.values(modules).filter((record) => isRecord(record) && typeof record.id === 'string');
  } catch {
    globArtworks = null;
  }
  return globArtworks;
}

export function loadBundledArtworks(root = process.cwd()): ArtworkJson[] {
  const disk = diskModules();
  if (disk) {
    const dir = disk.join(root, 'src', 'content', 'artworks');
    if (disk.existsSync(dir)) {
      const records: ArtworkJson[] = [];
      for (const file of disk.readdirSync(dir)) {
        if (!file.endsWith('.json')) continue;
        const slug = file.slice(0, -'.json'.length).toLowerCase();
        if (!SLUG_RE.test(slug)) continue;
        try {
          const parsed = parseJson(disk.readFileSync(disk.join(dir, file), 'utf8'));
          if (!isRecord(parsed) || typeof parsed.id !== 'string') continue;
          const id = parsed.id.trim().toLowerCase();
          if (id !== slug || typeof parsed.title !== 'string') continue;
          records.push({ ...(parsed as ArtworkJson), id });
        } catch {
          continue;
        }
      }
      return records;
    }
  }
  return (loadGlobArtworks() || []).filter((record) => {
    const id = record.id.trim().toLowerCase();
    return SLUG_RE.test(id) && id === record.id.trim().toLowerCase() && typeof record.title === 'string';
  });
}

export function cropKvKey(id: string): string {
  return `crops:${id}`;
}

async function readKvOverlayMap(kv: SessionKv | null | undefined): Promise<Record<string, unknown>> {
  if (!kv) return {};
  let snapshot: Record<string, unknown> = {};
  try {
    const parsed = parseJson(await kv.get(MERCH_CROP_SNAPSHOT_KEY));
    if (isRecord(parsed)) snapshot = parsed;
  } catch {
    snapshot = {};
  }

  let listed: string[] = [];
  try {
    const parsed = parseJson(await kv.get(MERCH_CROP_LIST_KEY));
    if (Array.isArray(parsed)) {
      listed = parsed.filter((id): id is string => typeof id === 'string' && id.length > 0 && !id.startsWith('_'));
    }
  } catch {
    listed = [];
  }

  const map: Record<string, unknown> = { ...snapshot };
  for (const id of listed) {
    try {
      const parsed = parseJson(await kv.get(cropKvKey(id)));
      if (isRecord(parsed)) map[id] = parsed;
    } catch {
      // One bad key does not drop the rest of the overlay.
    }
  }
  return map;
}

export async function getEffectiveCatalog(
  env?: ArtworkOverlayEnv | null,
  root = process.cwd()
): Promise<EffectiveArtwork[]> {
  const bundled = loadBundledArtworks(root);
  const overlays = await readKvOverlayMap(env?.SESSION);
  const merged = bundled.map((record) => {
    const kvValue = overlays[record.id];
    return toEffective(kvValue !== undefined ? mergeArtworkOverlay(record, kvValue) : record);
  });
  return assignUniqueSlugs(merged);
}

export async function getEffectiveArtwork(
  env: ArtworkOverlayEnv | null | undefined,
  slug: string,
  root = process.cwd()
): Promise<EffectiveArtwork | null> {
  const key = slug.trim().toLowerCase();
  if (!SLUG_RE.test(key)) return null;
  const catalog = await getEffectiveCatalog(env, root);
  return catalog.find((artwork) => artwork.slug === key) ?? catalog.find((artwork) => artwork.id === key) ?? null;
}

/** 301 target when the request used the bundled id and KV published a different slug. */
export function artworkRedirectPath(pathname: string, catalog: readonly EffectiveArtwork[]): string | null {
  const match = /^\/artwork\/([^/]+)\/?$/.exec(pathname);
  if (!match) return null;
  let requested = match[1];
  try {
    requested = decodeURIComponent(requested);
  } catch {
    return null;
  }
  requested = requested.trim().toLowerCase();
  if (!SLUG_RE.test(requested)) return null;
  if (catalog.some((artwork) => artwork.slug === requested)) return null;
  const byId = catalog.find((artwork) => artwork.id === requested);
  if (!byId || byId.slug === byId.id) return null;
  const slash = pathname.endsWith('/') ? '/' : '';
  return `/artwork/${byId.slug}${slash}`;
}

export async function checkoutArtworkState(
  env?: ArtworkOverlayEnv | null,
  options?: { root?: string; publishedSlugs?: ReadonlySet<string> }
): Promise<CheckoutArtworkState> {
  const root = options?.root;
  const catalog = await getEffectiveCatalog(env, root);
  const published = root
    ? new Set(catalog.map((artwork) => artwork.id))
    : new Set(options?.publishedSlugs ?? getPublishedArtworkSlugs());
  const artworkCrops: Record<string, Record<string, unknown>> = {};
  const canonicalArtworkIds = new Map<string, string>();
  for (const artwork of catalog) {
    if (!published.has(artwork.id)) continue;
    artworkCrops[artwork.id] = artwork.merch_crops;
    canonicalArtworkIds.set(artwork.id, artwork.id);
    if (artwork.slug !== artwork.id && !canonicalArtworkIds.has(artwork.slug)) {
      canonicalArtworkIds.set(artwork.slug, artwork.id);
    }
  }
  return { artworkCrops, canonicalArtworkIds, publishedSlugs: published };
}
