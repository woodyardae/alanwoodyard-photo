/**
 * Download approved merch and print selections into data/ only.
 *
 * Studio saves go to Cloudflare KV binding SESSION:
 *   crops:{artworkId} plus crops:_modified_list
 *   awp_merch_crops as a full-map snapshot
 * GET https://alanwoodyard.photo/api/approve-merch dumps the crops: keys.
 * When that route is down, this script reads the same binding with wrangler.
 *
 * Writes:
 *   data/merch-approvals.json       raw decision map, live or KV only
 *   data/approved-selections.json   approved ids, product keys, and crops
 *
 * Does not open src/content/artworks, product catalogs, assets/source-masters,
 * or scripts/render-print-crops.ts. Apply a downloaded map later with
 * npm run apply-approvals -- --apply.
 *
 * Flags:
 *   --offline     read the local fallback and skip network
 *   --dry-run     print the count and skip file writes
 *   --source      live dump URL
 *   --fallback    local decision JSON
 *   --snapshot    raw map output, default data/merch-approvals.json
 *   --selections  approved list output, default data/approved-selections.json
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectApprovedProducts, normalizeDecisions } from './apply-merch-approvals';

const LIVE_URL = 'https://alanwoodyard.photo/api/approve-merch';
const DEFAULT_FALLBACK = path.resolve('data/merch-approvals.json');
const DEFAULT_SNAPSHOT = path.resolve('data/merch-approvals.json');
const DEFAULT_SELECTIONS = path.resolve('data/approved-selections.json');
const KV_BINDING = 'SESSION';
const SNAPSHOT_KEY = 'awp_merch_crops';
const LIST_KEY = 'crops:_modified_list';

export type PullSource = 'live' | 'kv' | 'fallback' | 'none';

export interface ApprovedSelection {
  id: string;
  products: string[];
  crops: Record<string, unknown>;
}

export interface KvEntry {
  key: string;
  value: string;
}

interface CliFlags {
  offline: boolean;
  dryRun: boolean;
  sourceUrl: string;
  fallbackPath: string;
  snapshotPath: string;
  selectionsPath: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function extractJson(text: string): unknown | null {
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  if (!trimmed) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed === 'string') return extractJson(parsed);
    return parsed;
  } catch {
    const start = trimmed.search(/[{[]/);
    if (start < 0) return null;
    try {
      const parsed: unknown = JSON.parse(trimmed.slice(start));
      if (typeof parsed === 'string') return extractJson(parsed);
      return parsed;
    } catch {
      return null;
    }
  }
}

export function mapFromCropEntries(entries: KvEntry[]): Record<string, unknown> | null {
  const map: Record<string, unknown> = {};
  let count = 0;
  for (const entry of entries) {
    if (!entry.key.startsWith('crops:') || entry.key === LIST_KEY) continue;
    const id = entry.key.slice('crops:'.length);
    if (!id || id.startsWith('_')) continue;
    const parsed = extractJson(entry.value);
    if (!isRecord(parsed)) return null;
    map[id] = parsed;
    count += 1;
  }
  return count > 0 ? map : null;
}

export function approvedSelections(payload: unknown): ApprovedSelection[] | null {
  const decisions = normalizeDecisions(payload);
  if (!decisions) return null;
  const selections: ApprovedSelection[] = [];
  for (const decision of decisions) {
    if (!decision.approved || decision.rejected) continue;
    selections.push({
      id: decision.id,
      products: collectApprovedProducts(decision.crops),
      crops: decision.crops,
    });
  }
  return selections;
}

export function resolveDataOutput(file: string, cwd = process.cwd()): string {
  const root = path.resolve(cwd, 'data');
  const target = path.resolve(cwd, file);
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`output must stay inside data/: ${file}`);
  }
  const folded = relative.toLowerCase();
  if (folded.includes('source-master') || folded.includes('artwork')) {
    throw new Error(`output must not target masters or artwork files: ${file}`);
  }
  return target;
}

function readFlag(argv: string[], name: string): string | undefined {
  const eq = argv.find((arg) => arg.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const index = argv.indexOf(name);
  if (index >= 0) return argv[index + 1];
  return undefined;
}

export function parsePullFlags(argv: string[]): CliFlags {
  return {
    offline: argv.includes('--offline'),
    dryRun: argv.includes('--dry-run'),
    sourceUrl: readFlag(argv, '--source') || process.env.MERCH_APPROVALS_URL || LIVE_URL,
    fallbackPath: path.resolve(readFlag(argv, '--fallback') || process.env.MERCH_APPROVALS_FALLBACK || DEFAULT_FALLBACK),
    snapshotPath: readFlag(argv, '--snapshot') || DEFAULT_SNAPSHOT,
    selectionsPath: readFlag(argv, '--selections') || DEFAULT_SELECTIONS,
  };
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
  if (!dryRun) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, next, 'utf8');
  }
  return true;
}

function readJsonFile(file: string): unknown {
  const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(raw) as unknown;
}

async function fetchLivePayload(url: string): Promise<unknown> {
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const body: unknown = await response.json();
  if (approvedSelections(body) === null) {
    throw new Error('unrecognized decision payload');
  }
  return body;
}

function wranglerBin(): string {
  return path.resolve('node_modules/wrangler/bin/wrangler.js');
}

function readKvKey(key: string): string | null {
  const bin = wranglerBin();
  if (!fs.existsSync(bin)) return null;
  const result = spawnSync(process.execPath, [
    bin,
    'kv',
    'key',
    'get',
    key,
    '--binding',
    KV_BINDING,
    '--remote',
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  if (result.status !== 0) return null;
  const text = result.stdout ?? '';
  return text.trim() ? text : null;
}

function payloadFromKv(): { payload: unknown; note: string } | null {
  const listText = readKvKey(LIST_KEY);
  const list = listText ? extractJson(listText) : null;
  const ids = Array.isArray(list)
    ? list.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];
  if (ids.length > 0) {
    const entries: KvEntry[] = [];
    for (const id of ids) {
      const value = readKvKey(`crops:${id}`);
      if (value) entries.push({ key: `crops:${id}`, value });
    }
    const map = mapFromCropEntries(entries);
    if (map && approvedSelections(map) !== null) {
      return { payload: map, note: `kv ${KV_BINDING} ${LIST_KEY} (${ids.length} ids)` };
    }
  }

  const snapshotText = readKvKey(SNAPSHOT_KEY);
  if (!snapshotText) return null;
  const snapshot = extractJson(snapshotText);
  if (approvedSelections(snapshot) === null) return null;
  return { payload: snapshot, note: `kv ${KV_BINDING} ${SNAPSHOT_KEY}` };
}

function payloadFromFallback(file: string): unknown {
  if (!fs.existsSync(file)) {
    throw new Error(`missing fallback ${file}`);
  }
  const payload = readJsonFile(file);
  if (approvedSelections(payload) === null) {
    throw new Error(`unrecognized fallback payload in ${file}`);
  }
  return payload;
}

async function loadPayload(flags: CliFlags): Promise<{ source: PullSource; payload: unknown; note: string }> {
  if (!flags.offline) {
    try {
      const payload = await fetchLivePayload(flags.sourceUrl);
      return { source: 'live', payload, note: `live ${flags.sourceUrl}` };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'request failed';
      const kv = payloadFromKv();
      if (kv) {
        return { source: 'kv', payload: kv.payload, note: `${kv.note}. Live dump unavailable (${reason}).` };
      }
      if (fs.existsSync(flags.fallbackPath)) {
        const payload = payloadFromFallback(flags.fallbackPath);
        return {
          source: 'fallback',
          payload,
          note: `live dump and KV unavailable (${reason}). Using fallback ${flags.fallbackPath}.`,
        };
      }
      return {
        source: 'none',
        payload: null,
        note: `live dump and KV unavailable (${reason}). No local fallback at ${flags.fallbackPath}.`,
      };
    }
  }

  if (!fs.existsSync(flags.fallbackPath)) {
    return {
      source: 'none',
      payload: null,
      note: `offline. No local fallback at ${flags.fallbackPath}.`,
    };
  }
  return {
    source: 'fallback',
    payload: payloadFromFallback(flags.fallbackPath),
    note: `offline fallback ${flags.fallbackPath}.`,
  };
}

function selectionsDocument(source: PullSource, selections: ApprovedSelection[]): Record<string, unknown> {
  return {
    source,
    pulledAt: new Date().toISOString(),
    selections,
  };
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const flags = parsePullFlags(argv);
  const snapshotPath = resolveDataOutput(flags.snapshotPath);
  const selectionsPath = resolveDataOutput(flags.selectionsPath);
  const loaded = await loadPayload(flags);
  const selections = loaded.payload === null ? null : approvedSelections(loaded.payload);

  console.log(`[pull-approvals] ${loaded.note}`);
  if (!selections) {
    console.error('[pull-approvals] No decision payload to read.');
    return 1;
  }

  console.log(`[pull-approvals] source=${loaded.source} approved=${selections.length} dryRun=${flags.dryRun}`);
  for (const item of selections) {
    const products = item.products.length > 0 ? item.products.join(', ') : 'crop keys only';
    console.log(`[pull-approvals] ${item.id}: ${products}`);
  }

  const selectionBody = selectionsDocument(loaded.source, selections);
  const selectionsChanged = writeJsonIfChanged(selectionsPath, selectionBody, flags.dryRun);
  console.log(`[pull-approvals] selections ${selectionsPath} ${selectionsChanged ? 'updated' : 'unchanged'}`);

  if (loaded.source === 'live' || loaded.source === 'kv') {
    const snapshotChanged = writeJsonIfChanged(snapshotPath, loaded.payload, flags.dryRun);
    console.log(`[pull-approvals] snapshot ${snapshotPath} ${snapshotChanged ? 'updated' : 'unchanged'}`);
  } else {
    console.log('[pull-approvals] Snapshot file left as-is. Live and KV were not read.');
  }

  console.log('[pull-approvals] Artwork JSON, product catalogs, and source masters were not opened.');
  return 0;
}

const invokedDirectly = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (invokedDirectly) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[pull-approvals] ${message}`);
    process.exitCode = 1;
  });
}
