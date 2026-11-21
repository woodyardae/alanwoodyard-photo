/**
 * Published print catalog.
 * A slug is sellable only when src/content/artworks/{slug}.json exists,
 * its id matches the filename, and public/images/artworks/clean/{slug}.webp exists.
 * Node reads those files directly. The JSON snapshot is the edge fallback when
 * the content directory is not on disk.
 */

import { createRequire } from 'node:module';
import bundled from '../content/published-artwork-index.json';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const bundledSlugs = new Set(
  (bundled.slugs || []).map((slug) => slug.trim().toLowerCase()).filter((slug) => SLUG_RE.test(slug))
);

let cache: ReadonlySet<string> | null = null;

interface DiskModules {
  existsSync(path: string): boolean;
  readdirSync(path: string): string[];
  readFileSync(path: string, encoding: 'utf8'): string;
  writeFileSync(path: string, data: string, encoding: 'utf8'): void;
  join(...parts: string[]): string;
}

function diskModules(): DiskModules | null {
  try {
    const require = createRequire(import.meta.url);
    const fs = require('node:fs') as {
      existsSync(path: string): boolean;
      readdirSync(path: string): string[];
      readFileSync(path: string, encoding: 'utf8'): string;
      writeFileSync(path: string, data: string, encoding: 'utf8'): void;
    };
    const path = require('node:path') as { join(...parts: string[]): string };
    return {
      existsSync: (target) => fs.existsSync(target),
      readdirSync: (target) => fs.readdirSync(target),
      readFileSync: (target, encoding) => fs.readFileSync(target, encoding),
      writeFileSync: (target, data, encoding) => fs.writeFileSync(target, data, encoding),
      join: (...parts) => path.join(...parts),
    };
  } catch {
    return null;
  }
}

export function loadPublishedArtworkSlugsFromDisk(root = process.cwd()): ReadonlySet<string> | null {
  const disk = diskModules();
  if (!disk) return null;

  try {
    const artDir = disk.join(root, 'src', 'content', 'artworks');
    const cleanDir = disk.join(root, 'public', 'images', 'artworks', 'clean');
    if (!disk.existsSync(artDir)) return null;

    const slugs = new Set<string>();
    if (!disk.existsSync(cleanDir)) return slugs;

    for (const file of disk.readdirSync(artDir)) {
      if (!file.endsWith('.json')) continue;
      const slug = file.slice(0, -'.json'.length).toLowerCase();
      if (!SLUG_RE.test(slug)) continue;
      if (!disk.existsSync(disk.join(cleanDir, `${slug}.webp`))) continue;

      let parsed: { id?: string };
      try {
        parsed = JSON.parse(disk.readFileSync(disk.join(artDir, file), 'utf8')) as { id?: string };
      } catch {
        continue;
      }
      const id = (parsed.id || '').trim().toLowerCase();
      if (id !== slug) continue;
      slugs.add(slug);
    }
    return slugs;
  } catch {
    return null;
  }
}

export function getPublishedArtworkSlugs(): ReadonlySet<string> {
  if (cache) return cache;
  const disk = loadPublishedArtworkSlugsFromDisk();
  cache = disk ?? bundledSlugs;
  return cache;
}

export function resetPublishedArtworkCache(): void {
  cache = null;
}

export function writePublishedArtworkIndex(root = process.cwd()): string[] {
  const disk = diskModules();
  if (!disk) throw new Error('Artwork index can only be written from Node');
  const slugs = loadPublishedArtworkSlugsFromDisk(root);
  if (!slugs) throw new Error('Artwork directory was not found');
  const sorted = [...slugs].sort();
  const target = disk.join(root, 'src', 'content', 'published-artwork-index.json');
  disk.writeFileSync(target, `${JSON.stringify({ slugs: sorted }, null, 2)}\n`, 'utf8');
  resetPublishedArtworkCache();
  return sorted;
}
