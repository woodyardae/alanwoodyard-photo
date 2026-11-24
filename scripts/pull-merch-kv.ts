/**
 * Snapshot Merch Studio KV overlays back into src/content/artworks/*.json.
 *
 * Runtime pages, checkout, and the webhook read KV directly and do not wait
 * for this script. Run it when Alan wants those edits in git.
 * id and master_file are copied from the bundled file and never taken from KV.
 * The artwork filename stays the immutable id. A renamed public slug is stored
 * on the `slug` field.
 *
 * Flags:
 *   --dry-run   print the paths that would change and skip writes
 *   --from      local JSON map of id -> overlay, skips wrangler
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MERCH_CROP_LIST_KEY,
  MERCH_CROP_SNAPSHOT_KEY,
  cropKvKey,
  mergeArtworkOverlay,
  type ArtworkJson,
} from '../src/lib/artwork-overlay';

const KV_BINDING = 'SESSION';

export interface SnapshotResult {
  updated: string[];
  unchanged: string[];
  missing: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJson(text: string): unknown {
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

function canonicalJson(data: unknown): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

export function applyOverlaysToArtworkDir(
  root: string,
  overlays: Record<string, unknown>,
  dryRun = false
): SnapshotResult {
  const dir = path.join(root, 'src', 'content', 'artworks');
  const updated: string[] = [];
  const unchanged: string[] = [];
  const missing: string[] = [];

  for (const [id, overlay] of Object.entries(overlays)) {
    if (!isRecord(overlay)) continue;
    const file = path.join(dir, `${id}.json`);
    if (!fs.existsSync(file)) {
      missing.push(id);
      continue;
    }
    const current = parseJson(fs.readFileSync(file, 'utf8'));
    if (!isRecord(current) || current.id !== id) {
      missing.push(id);
      continue;
    }
    const merged = mergeArtworkOverlay(current as ArtworkJson, overlay);
    merged.id = id;
    if (typeof current.master_file === 'string') merged.master_file = current.master_file;
    const next = canonicalJson(merged);
    const previous = canonicalJson(current);
    if (next === previous) {
      unchanged.push(id);
      continue;
    }
    updated.push(id);
    if (!dryRun) fs.writeFileSync(file, next, 'utf8');
  }

  return { updated, unchanged, missing };
}

function readFlag(argv: string[], name: string): string | undefined {
  const eq = argv.find((arg) => arg.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const index = argv.indexOf(name);
  if (index >= 0) return argv[index + 1];
  return undefined;
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

export function overlaysFromKvTexts(snapshotText: string | null, listed: readonly string[], values: ReadonlyMap<string, string>): Record<string, unknown> | null {
  const snapshot = snapshotText ? parseJson(snapshotText) : null;
  const map: Record<string, unknown> = isRecord(snapshot) ? { ...snapshot } : {};
  for (const id of listed) {
    const text = values.get(id);
    if (!text) continue;
    const parsed = parseJson(text);
    if (isRecord(parsed)) map[id] = parsed;
  }
  return Object.keys(map).length > 0 ? map : null;
}

function overlaysFromWrangler(): Record<string, unknown> | null {
  const listText = readKvKey(MERCH_CROP_LIST_KEY);
  const listParsed = listText ? parseJson(listText) : null;
  const listed = Array.isArray(listParsed)
    ? listParsed.filter((id): id is string => typeof id === 'string' && id.length > 0 && !id.startsWith('_'))
    : [];
  const values = new Map<string, string>();
  for (const id of listed) {
    const text = readKvKey(cropKvKey(id));
    if (text) values.set(id, text);
  }
  return overlaysFromKvTexts(readKvKey(MERCH_CROP_SNAPSHOT_KEY), listed, values);
}

export function main(argv = process.argv.slice(2)): number {
  const dryRun = argv.includes('--dry-run');
  const from = readFlag(argv, '--from');
  let overlays: Record<string, unknown> | null = null;
  if (from) {
    const parsed = parseJson(fs.readFileSync(path.resolve(from), 'utf8'));
    overlays = isRecord(parsed) ? parsed : null;
  } else {
    overlays = overlaysFromWrangler();
  }
  if (!overlays) {
    console.error('[pull-merch-kv] No KV overlay map to read.');
    return 1;
  }
  const result = applyOverlaysToArtworkDir(process.cwd(), overlays, dryRun);
  console.log(`[pull-merch-kv] updated=${result.updated.length} unchanged=${result.unchanged.length} missing=${result.missing.length} dryRun=${dryRun}`);
  for (const id of result.updated) console.log(`[pull-merch-kv] ${id}`);
  console.log('[pull-merch-kv] id and master_file were left on the bundled file.');
  return 0;
}

const invokedDirectly = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (invokedDirectly) {
  try {
    process.exitCode = main();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[pull-merch-kv] ${message}`);
    process.exitCode = 1;
  }
}
