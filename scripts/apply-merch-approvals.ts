/**
 * Apply merch approve/reject decisions to local catalogs.
 *
 * Download selections first with npm run pull-approvals. That command
 * writes data/merch-approvals.json and data/approved-selections.json only.
 * This command then writes artwork and product records, and can render
 * print crops. It does not edit assets/source-masters.
 *
 * Live source: GET https://alanwoodyard.photo/api/approve-merch
 * Fallback:    data/merch-approvals.json (or --fallback <file>)
 *
 * A live 2xx decision payload is applied unless --dry-run is set.
 * Offline, unauthorized, or unrecognized responses load the fallback file
 * and report only, unless --apply is also set. --dry-run always wins.
 *
 * Fallback JSON may be the KV map returned by GET, or an array of
 * { id, decision: "approved" | "rejected" | "unreject", crops? }.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isRejectedCropValue, rejectedCropRecord } from '../src/lib/merch-studio-shared';
import { seeWhatSticksPortalFile } from './sws-paths';

const LIVE_URL = 'https://alanwoodyard.photo/api/approve-merch';
const DEFAULT_FALLBACK = path.resolve('data/merch-approvals.json');
const DEFAULT_ARTWORKS_DIR = path.resolve('src/content/artworks');
const DEFAULT_PRODUCTS_PATH = seeWhatSticksPortalFile('data/products.json');
const DEFAULT_QUEUE_PATH = path.resolve('src/data/sws-queue.json');

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SWS_PREFIXES = ['sws-retro-', 'sws-master-', 'sws-aviation-', 'sws-batch-', 'sws-'];

export type DecisionSource = 'live' | 'fallback' | 'none';

export interface NormalizedDecision {
  id: string;
  rejected: boolean;
  unreject: boolean;
  approved: boolean;
  crops: Record<string, unknown>;
}

export interface ProductRecord {
  id?: string;
  name?: string;
  image?: string;
  approved?: boolean;
  [key: string]: unknown;
}

export interface QueueItem {
  id?: string;
  source_path?: string;
  img?: string;
}

export interface ApplyPaths {
  artworksDir: string;
  productsPath: string;
  queuePath?: string;
}

export interface ApplyResult {
  updatedArtworks: string[];
  updatedProducts: string[];
  renderIds: string[];
  unmatched: string[];
  ambiguous: string[];
  skipped: string[];
  dryRun: boolean;
}

interface CliFlags {
  dryRun: boolean;
  apply: boolean;
  sourceUrl: string;
  fallbackPath: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function compactKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function fileStem(value: string): string {
  const base = value.split(/[/\\]/).pop() || value;
  const dot = base.lastIndexOf('.');
  return compactKey(dot > 0 ? base.slice(0, dot) : base);
}

function idStems(id: string): string[] {
  const stems = new Set<string>([compactKey(id), fileStem(id)]);
  const lower = id.toLowerCase();
  for (const prefix of SWS_PREFIXES) {
    if (lower.startsWith(prefix)) {
      const rest = compactKey(lower.slice(prefix.length));
      if (rest.length >= 6) stems.add(rest);
      break;
    }
  }
  return [...stems].filter((stem) => stem.length >= 6);
}

function decisionFromStatus(status: string): { rejected: boolean; unreject: boolean; approved: boolean } {
  const value = status.toLowerCase();
  const rejected = value === 'rejected' || value === 'reject';
  const unreject = value === 'unreject' || value === 'unrejected' || value === 'restore';
  const approved = value === 'approved' || value === 'approve';
  return { rejected, unreject, approved };
}

function cropsFrom(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  const crops: Record<string, unknown> = {};
  for (const [key, crop] of Object.entries(value)) {
    if (key === '__rejected') continue;
    crops[key] = crop;
  }
  return crops;
}

function hasUsableCrop(crops: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(crops)) {
    if (key === '__rejected') continue;
    if (!isRecord(value) || isRejectedCropValue(value)) continue;
    return true;
  }
  return false;
}

function cleanCropValue(value: unknown): unknown {
  if (!isRecord(value) || !isRejectedCropValue(value)) return value;
  const rejectedAt = typeof value.rejected_at === 'string' && value.rejected_at.trim()
    ? value.rejected_at
    : new Date().toISOString();
  return rejectedCropRecord(rejectedAt);
}

function cleanCrops(crops: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(crops)) {
    next[key] = key === '__rejected' ? value : cleanCropValue(value);
  }
  return next;
}

function normalizeEntry(item: unknown): NormalizedDecision | null {
  if (!isRecord(item)) return null;
  const rawId = item.id ?? item.artworkId ?? item.productId;
  if (typeof rawId !== 'string' || !rawId.trim()) return null;

  const status = typeof item.decision === 'string'
    ? item.decision
    : typeof item.status === 'string'
      ? item.status
      : typeof item.action === 'string'
        ? item.action
        : '';
  const flags = decisionFromStatus(status);
  const crops = cropsFrom(item.crops ?? item.merch_crops);
  const rejected = flags.rejected || item.rejected === true || item.__rejected === true;
  const approved = !rejected && (flags.approved || item.approved === true || hasUsableCrop(crops));
  const unreject = !rejected && !approved && (flags.unreject || item.__rejected === false);
  return {
    id: rawId.trim(),
    rejected,
    unreject,
    approved,
    crops,
  };
}

export function normalizeDecisions(payload: unknown): NormalizedDecision[] | null {
  if (Array.isArray(payload)) {
    const decisions: NormalizedDecision[] = [];
    for (const item of payload) {
      const decision = normalizeEntry(item);
      if (!decision) return null;
      decisions.push(decision);
    }
    return decisions;
  }

  if (!isRecord(payload)) return null;
  if (Array.isArray(payload.decisions)) return normalizeDecisions(payload.decisions);
  if (Array.isArray(payload.items)) return normalizeDecisions(payload.items);
  if ('error' in payload) return null;

  if (
    typeof payload.id === 'string' &&
    ('decision' in payload || 'status' in payload || 'action' in payload || 'crops' in payload || 'rejected' in payload)
  ) {
    const decision = normalizeEntry(payload);
    return decision ? [decision] : null;
  }

  const decisions: NormalizedDecision[] = [];
  for (const [id, value] of Object.entries(payload)) {
    if (!isRecord(value)) return null;
    const crops = cropsFrom(value);
    const rejected = value.__rejected === true;
    const approved = !rejected && hasUsableCrop(crops);
    const unreject = !rejected && !approved && value.__rejected === false;
    decisions.push({ id, rejected, unreject, approved, crops });
  }
  return decisions;
}

export function collectApprovedProducts(crops: Record<string, unknown>): string[] {
  const approved = new Set<string>();
  for (const [key, value] of Object.entries(crops)) {
    if (key === '__rejected' || !isRecord(value) || isRejectedCropValue(value)) continue;
    if (Array.isArray(value.approved_products)) {
      for (const product of value.approved_products) {
        if (typeof product === 'string' && product.trim()) approved.add(product);
      }
      continue;
    }
    approved.add(key);
  }
  return [...approved];
}

export function shouldWrite(
  source: DecisionSource,
  flags: { dryRun: boolean; apply: boolean },
): boolean {
  if (flags.dryRun || source === 'none') return false;
  if (source === 'fallback' && !flags.apply) return false;
  return source === 'live' || source === 'fallback';
}

function artworkPath(artworksDir: string, id: string): string | null {
  if (!ID_PATTERN.test(id)) return null;
  const root = path.resolve(artworksDir);
  const file = path.resolve(root, `${id}.json`);
  if (file !== path.join(root, `${id}.json`)) return null;
  return file;
}

function readJson(file: string): unknown {
  const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(raw);
}

function canonicalJson(data: unknown): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

function writeJsonIfChanged(file: string, data: unknown, dryRun: boolean): boolean {
  const next = canonicalJson(data);
  let previous = '';
  if (fs.existsSync(file)) {
    try {
      previous = canonicalJson(JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')));
    } catch {
      previous = '';
    }
  }
  if (previous === next) return false;
  if (!dryRun) fs.writeFileSync(file, next, 'utf8');
  return true;
}

function loadQueue(queuePath: string | undefined): Map<string, QueueItem> {
  const queue = new Map<string, QueueItem>();
  if (!queuePath || !fs.existsSync(queuePath)) return queue;
  const parsed = readJson(queuePath);
  if (!Array.isArray(parsed)) return queue;
  for (const item of parsed) {
    if (!isRecord(item) || typeof item.id !== 'string') continue;
    queue.set(item.id, {
      id: item.id,
      source_path: typeof item.source_path === 'string' ? item.source_path : undefined,
      img: typeof item.img === 'string' ? item.img : undefined,
    });
  }
  return queue;
}

function matchProductIndexes(
  products: ProductRecord[],
  decision: NormalizedDecision,
  queueItem: QueueItem | undefined,
  allowFuzzy: boolean,
): number[] | 'ambiguous' {
  const exact: number[] = [];
  products.forEach((product, index) => {
    if (product.id === decision.id) exact.push(index);
  });
  if (exact.length === 1) return exact;
  if (exact.length > 1) return 'ambiguous';
  if (!allowFuzzy) return [];

  const stems = new Set<string>(idStems(decision.id));
  if (queueItem?.source_path) {
    const stem = fileStem(queueItem.source_path);
    if (stem.length >= 6) stems.add(stem);
  }
  if (queueItem?.img) {
    const stem = fileStem(queueItem.img);
    if (stem.length >= 6) stems.add(stem);
  }

  const hits: number[] = [];
  products.forEach((product, index) => {
    const imageStem = typeof product.image === 'string' ? fileStem(product.image) : '';
    const nameStem = typeof product.name === 'string' ? compactKey(product.name) : '';
    if ((imageStem && stems.has(imageStem)) || (nameStem && stems.has(nameStem))) {
      hits.push(index);
    }
  });
  if (hits.length > 1) return 'ambiguous';
  return hits;
}

function cropRejectionOnly(crops: Record<string, unknown>): boolean {
  return Object.keys(crops).length > 0 && !hasUsableCrop(crops);
}

function applyArtworkDecision(data: Record<string, unknown>, decision: NormalizedDecision): boolean {
  const before = canonicalJson(data);
  const existingCrops = isRecord(data.merch_crops) ? data.merch_crops : {};
  const incoming = cleanCrops(decision.crops);
  const merged = cleanCrops({ ...existingCrops, ...incoming });
  const rejectionOnly = cropRejectionOnly(incoming);

  if (decision.rejected) {
    data.merch_rejected = true;
    if (Object.keys(incoming).length > 0) data.merch_crops = merged;
  } else if (decision.approved && !rejectionOnly) {
    delete data.merch_rejected;
    data.merch_crops = merged;
    data.merch_approved = collectApprovedProducts(merged);
  } else if (decision.unreject) {
    delete data.merch_rejected;
    if (Object.keys(incoming).length > 0) {
      data.merch_crops = merged;
      data.merch_approved = collectApprovedProducts(merged);
    }
  } else if (Object.keys(incoming).length > 0) {
    data.merch_crops = merged;
    data.merch_approved = collectApprovedProducts(merged);
  }

  return canonicalJson(data) !== before;
}

function productApproval(decision: NormalizedDecision): boolean | null {
  if (decision.rejected || decision.unreject) return false;
  if (!decision.approved || cropRejectionOnly(decision.crops)) return null;
  return true;
}

function shouldRenderCrops(decision: NormalizedDecision, stored: unknown): boolean {
  if (!decision.approved || !isRecord(stored) || !hasUsableCrop(stored)) return false;
  if (cropRejectionOnly(decision.crops)) return false;
  return true;
}

export function applyApprovalDecisions(
  decisions: NormalizedDecision[],
  paths: ApplyPaths,
  options: { dryRun: boolean; render?: boolean } = { dryRun: false },
): ApplyResult {
  const result: ApplyResult = {
    updatedArtworks: [],
    updatedProducts: [],
    renderIds: [],
    unmatched: [],
    ambiguous: [],
    skipped: [],
    dryRun: options.dryRun,
  };

  const products: ProductRecord[] = fs.existsSync(paths.productsPath)
    ? (() => {
        const parsed = readJson(paths.productsPath);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(isRecord) as ProductRecord[];
      })()
    : [];
  const productsPresent = fs.existsSync(paths.productsPath);
  let productsChanged = false;
  const queue = loadQueue(paths.queuePath);

  for (const decision of decisions) {
    const file = artworkPath(paths.artworksDir, decision.id);
    const artworkExists = Boolean(file && fs.existsSync(file));

    if (file && artworkExists) {
      const parsed = readJson(file);
      if (!isRecord(parsed)) {
        result.skipped.push(decision.id);
      } else if (applyArtworkDecision(parsed, decision)) {
        if (writeJsonIfChanged(file, parsed, options.dryRun)) {
          result.updatedArtworks.push(decision.id);
        }
        if (shouldRenderCrops(decision, parsed.merch_crops)) {
          result.renderIds.push(decision.id);
        }
      }
    }

    if (!productsPresent) {
      if (!artworkExists) result.unmatched.push(decision.id);
      continue;
    }

    const match = matchProductIndexes(products, decision, queue.get(decision.id), !artworkExists);
    if (match === 'ambiguous') {
      result.ambiguous.push(decision.id);
      continue;
    }

    const approved = productApproval(decision);
    if (approved !== null) {
      for (const index of match) {
        const product = products[index];
        if (!product || product.approved === approved) continue;
        product.approved = approved;
        productsChanged = true;
        if (typeof product.id === 'string') result.updatedProducts.push(product.id);
      }
    }
    if (match.length === 0 && !artworkExists) result.unmatched.push(decision.id);
  }

  if (productsChanged) {
    writeJsonIfChanged(paths.productsPath, products, options.dryRun);
  }

  if (options.render && !options.dryRun && result.renderIds.length > 0) {
    renderPrintCrops(result.renderIds);
  }

  return result;
}

export function renderPrintCrops(ids: string[]): void {
  if (ids.length === 0) return;
  const tsxCli = path.resolve('node_modules/tsx/dist/cli.mjs');
  if (!fs.existsSync(tsxCli)) {
    throw new Error(`tsx CLI not found at ${tsxCli}`);
  }
  const script = path.resolve('scripts/render-print-crops.ts');
  const result = spawnSync(process.execPath, [tsxCli, script, ...ids], {
    cwd: process.cwd(),
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`render-print-crops exited with status ${result.status ?? 'null'}`);
  }
}

function readFlag(argv: string[], name: string): string | undefined {
  const eq = argv.find((arg) => arg.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const index = argv.indexOf(name);
  if (index >= 0) return argv[index + 1];
  return undefined;
}

export function parseCliFlags(argv: string[]): CliFlags {
  return {
    dryRun: argv.includes('--dry-run'),
    apply: argv.includes('--apply'),
    sourceUrl: readFlag(argv, '--source') || process.env.MERCH_APPROVALS_URL || LIVE_URL,
    fallbackPath: path.resolve(readFlag(argv, '--fallback') || process.env.MERCH_APPROVALS_FALLBACK || DEFAULT_FALLBACK),
  };
}

async function fetchLiveDecisions(url: string): Promise<NormalizedDecision[]> {
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (response.status === 401 || response.status === 403) {
    throw new Error(`unauthorized (${response.status})`);
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const body: unknown = await response.json();
  const decisions = normalizeDecisions(body);
  if (!decisions) {
    throw new Error('unrecognized decision payload');
  }
  return decisions;
}

function readFallback(file: string): NormalizedDecision[] {
  if (!fs.existsSync(file)) {
    throw new Error(`missing fallback ${file}`);
  }
  const decisions = normalizeDecisions(readJson(file));
  if (!decisions) {
    throw new Error(`unrecognized fallback payload in ${file}`);
  }
  return decisions;
}

async function loadDecisions(flags: CliFlags): Promise<{ source: DecisionSource; decisions: NormalizedDecision[]; note: string }> {
  try {
    const decisions = await fetchLiveDecisions(flags.sourceUrl);
    return { source: 'live', decisions, note: `live ${flags.sourceUrl}` };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'request failed';
    if (!fs.existsSync(flags.fallbackPath)) {
      return {
        source: 'none',
        decisions: [],
        note: `live source unavailable (${reason}). No local fallback at ${flags.fallbackPath}.`,
      };
    }
    try {
      const decisions = readFallback(flags.fallbackPath);
      return {
        source: 'fallback',
        decisions,
        note: `live source unavailable (${reason}). Using fallback ${flags.fallbackPath}.`,
      };
    } catch (fallbackError) {
      const detail = fallbackError instanceof Error ? fallbackError.message : 'invalid fallback';
      throw new Error(`${reason}; ${detail}`);
    }
  }
}

function logResult(source: DecisionSource, note: string, decisionCount: number, result: ApplyResult): void {
  const mode = result.dryRun ? 'dry-run' : 'write';
  console.log(`[apply-approvals] ${note}`);
  console.log(`[apply-approvals] source=${source} mode=${mode} decisions=${decisionCount}`);
  for (const id of result.updatedArtworks) console.log(`[apply-approvals] artwork ${id}`);
  for (const id of result.updatedProducts) console.log(`[apply-approvals] product ${id}`);
  for (const id of result.unmatched) console.log(`[apply-approvals] unmatched ${id}`);
  for (const id of result.ambiguous) console.log(`[apply-approvals] ambiguous ${id}`);
  if (result.renderIds.length > 0) {
    console.log(`[apply-approvals] render ${result.dryRun ? 'skipped' : 'invoked'} for ${result.renderIds.join(', ')}`);
  }
  if (
    result.updatedArtworks.length === 0 &&
    result.updatedProducts.length === 0 &&
    result.unmatched.length === 0 &&
    result.ambiguous.length === 0
  ) {
    console.log('[apply-approvals] No matching local records changed.');
  }
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const flags = parseCliFlags(argv);
  const loaded = await loadDecisions(flags);
  const dryRun = !shouldWrite(loaded.source, flags);
  const result = applyApprovalDecisions(loaded.decisions, {
    artworksDir: DEFAULT_ARTWORKS_DIR,
    productsPath: DEFAULT_PRODUCTS_PATH,
    queuePath: DEFAULT_QUEUE_PATH,
  }, {
    dryRun,
    render: !dryRun,
  });
  logResult(loaded.source, loaded.note, loaded.decisions.length, result);
  if (loaded.source === 'fallback' && dryRun && loaded.decisions.length > 0) {
    console.log('[apply-approvals] Fallback stayed in dry-run. Re-run with --apply to write those decisions.');
  }
  return 0;
}

const invokedDirectly = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (invokedDirectly) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[apply-approvals] ${message}`);
    process.exitCode = 1;
  });
}
