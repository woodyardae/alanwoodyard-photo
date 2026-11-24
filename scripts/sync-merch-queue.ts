import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { artworkQueueStatus } from '../src/lib/merch-studio-shared';
import { findSeeWhatSticksDir, requireSeeWhatSticksRoot } from './sws-paths';

export interface SwsQueueItem {
  id: string;
  store: 'sws';
  title: string;
  category: string;
  source_path: string;
  img: string;
  width: number;
  height: number;
  crops: Record<string, any>;
  approved: string[];
  rejected: boolean;
  status: 'needs_review' | 'approved' | 'rejected';
}

const OUT_IMG_DIR = path.resolve('public/images/sws-queue');
const OUT_JSON_PATH = path.resolve('src/data/sws-queue.json');
const VALID_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

function sanitizeSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function titleFromFilename(filePath: string): string {
  const base = path.parse(filePath).name;
  return base
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function walkImages(dir: string, results: string[] = []): string[] {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkImages(full, results);
    } else if (VALID_EXTS.has(path.extname(entry.name).toLowerCase())) {
      results.push(full);
    }
  }
  return results;
}

interface DiscoveredDesign {
  id: string;
  title: string;
  category: string;
  absPath: string;
  relSource: string;
}

function discoverSwsDesigns(swsRepoRoot: string): DiscoveredDesign[] {
  const items: DiscoveredDesign[] = [];
  const usedIds = new Set<string>();

  const pushUnique = (rawId: string, title: string, category: string, absPath: string) => {
    let id = rawId;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${rawId}-${suffix++}`;
    }
    usedIds.add(id);
    items.push({
      id,
      title,
      category,
      absPath,
      relSource: path.relative(swsRepoRoot, absPath).replace(/\\/g, '/'),
    });
  };

  // 1. Canonical print-ready masters in the SeeWhatSticks checkout data/products.json
  const rootProductsPath = path.join(swsRepoRoot, 'data/products.json');
  if (fs.existsSync(rootProductsPath)) {
    const products = JSON.parse(fs.readFileSync(rootProductsPath, 'utf8').replace(/^\uFEFF/, ''));
    for (const prod of products) {
      const relAsset = prod.print_ready_asset || prod.mockup_asset;
      if (!relAsset) continue;
      const absPath = path.join(swsRepoRoot, relAsset);
      if (fs.existsSync(absPath)) {
        const id = `sws-master-${sanitizeSlug(prod.slug || prod.sku || path.parse(absPath).name)}`;
        pushUnique(id, prod.title || titleFromFilename(absPath), prod.pillar || 'Print-Ready Master', absPath);
      }
    }
  }

  // 2. Retro pack in seewhatsticks-portal/assets/generated
  const retroDir = path.join(swsRepoRoot, 'web/seewhatsticks-portal/assets/generated');
  for (const absPath of walkImages(retroDir)) {
    const id = `sws-retro-${sanitizeSlug(path.parse(absPath).name)}`;
    pushUnique(id, titleFromFilename(absPath), 'Retro Pack', absPath);
  }

  // 3. Niche POD packs stored with the SeeWhatSticks checkout
  const podAssetsDir = findSeeWhatSticksDir(swsRepoRoot, 'pod-assets');
  for (const absPath of walkImages(podAssetsDir)) {
    const rel = path.relative(podAssetsDir, absPath).replace(/\\/g, '/');
    const folderParts = rel.split('/');
    const topFolder = folderParts.length > 1 ? folderParts[0] : 'POD Asset';
    const catSlug = sanitizeSlug(topFolder.replace(/\s*POD$/i, ''));
    const id = `sws-${catSlug}-${sanitizeSlug(path.parse(absPath).name)}`;
    pushUnique(id, titleFromFilename(absPath), topFolder, absPath);
  }

  // 4. Generated batch outputs stored with the SeeWhatSticks checkout
  const outputsDir = findSeeWhatSticksDir(swsRepoRoot, path.join('public', 'outputs'));
  for (const absPath of walkImages(outputsDir)) {
    const id = `sws-batch-${sanitizeSlug(path.parse(absPath).name)}`;
    pushUnique(id, titleFromFilename(absPath), 'Batch Output', absPath);
  }

  return items;
}

async function main() {
  const swsRepoRoot = requireSeeWhatSticksRoot();
  if (!fs.existsSync(OUT_IMG_DIR)) {
    fs.mkdirSync(OUT_IMG_DIR, { recursive: true });
  }
  fs.mkdirSync(path.dirname(OUT_JSON_PATH), { recursive: true });

  // Load previous queue state to preserve crops/approvals/rejections
  const existingById = new Map<string, SwsQueueItem>();
  if (fs.existsSync(OUT_JSON_PATH)) {
    try {
      const prev = JSON.parse(fs.readFileSync(OUT_JSON_PATH, 'utf8').replace(/^\uFEFF/, ''));
      if (Array.isArray(prev)) {
        for (const item of prev) {
          if (item?.id) existingById.set(item.id, item);
        }
      }
    } catch {
      // ignore corrupted previous file
    }
  }

  const discovered = discoverSwsDesigns(swsRepoRoot);
  const outputQueue: SwsQueueItem[] = [];
  let renderedCount = 0;

  for (const d of discovered) {
    const outWebp = path.join(OUT_IMG_DIR, `${d.id}.webp`);
    const meta = await sharp(d.absPath, { limitInputPixels: false }).metadata();
    const width = meta.width || 2048;
    const height = meta.height || 2048;

    if (!fs.existsSync(outWebp)) {
      await sharp(d.absPath, { limitInputPixels: false })
        .rotate()
        .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toFile(outWebp);
      renderedCount++;
    }

    const prev = existingById.get(d.id);
    const crops = prev?.crops || {};
    const approved = prev?.approved || [];
    const rejected = Boolean(prev?.rejected);
    const status = artworkQueueStatus({ rejected, crops });

    outputQueue.push({
      id: d.id,
      store: 'sws',
      title: prev?.title || d.title,
      category: prev?.category || d.category,
      source_path: d.relSource,
      img: `/images/sws-queue/${d.id}.webp`,
      width,
      height,
      crops,
      approved,
      rejected,
      status,
    });
  }

  fs.writeFileSync(OUT_JSON_PATH, JSON.stringify(outputQueue, null, 2) + '\n', 'utf8');
  console.log(`\n[SWS QUEUE] Discovered ${discovered.length} SeeWhatSticks designs.`);
  console.log(`[SWS QUEUE] Rendered ${renderedCount} new mobile WebP previews -> public/images/sws-queue/`);
  console.log(`[SWS QUEUE] Manifest written -> ${OUT_JSON_PATH}\n`);
}

main().catch((err) => {
  console.error('[SWS QUEUE ERROR]', err);
  process.exit(1);
});
