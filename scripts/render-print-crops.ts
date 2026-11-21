/**
 * Deterministic crop → print-master renderer.
 *
 * For every confirmed merch_crops entry, extracts the studio crop from the
 * artwork's print master and writes a lab-ready file whose relative path
 * matches checkout's /masters/{slug}/{crop}.{ext} convention:
 *   assets/print-ready/{slug}/{crop}.{ext}
 *
 * Never falls back to clean .webp previews unless ALLOW_CLEAN_PREVIEW_ASSETS=1.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { cropFileToken, printMasterRelativePath } from '../src/lib/checkout-catalog';
import { resolveRatio } from '../src/lib/merch-studio-shared';

const MANIFEST_DIR = path.resolve('src/content/artworks');
const OUT_DIR = path.resolve('assets/print-ready');
const onlyIds = new Set(process.argv.slice(2).filter((arg) => arg && !arg.startsWith('-')));

const BLEED_INCHES = 0.125;
const TARGET_PRINT_DPI = 300;
const BLEED_PX = Math.round(BLEED_INCHES * TARGET_PRINT_DPI); // 38px per edge
const MASTER_EXTENSIONS = new Set(['tif', 'tiff', 'jpg', 'jpeg', 'png']);

interface CropData {
  productKey: string;
  panX: number;
  panY: number;
  zoom: number;
  ratio: number;
}

function resolveOutputExtension(): string {
  const raw = (process.env.PRINT_MASTERS_EXTENSION || 'tif').trim().toLowerCase().replace(/^\./, '');
  return MASTER_EXTENSIONS.has(raw) ? raw : 'tif';
}

function allowCleanPreviewAssets(): boolean {
  return process.env.ALLOW_CLEAN_PREVIEW_ASSETS === '1';
}

async function writePrintMaster(
  sourcePath: string,
  extract: { left: number; top: number; width: number; height: number },
  outFile: string,
  extension: string
): Promise<{ width: number; height: number }> {
  let pipeline = sharp(sourcePath, { limitInputPixels: false })
    .extract(extract)
    .extend({
      top: BLEED_PX,
      bottom: BLEED_PX,
      left: BLEED_PX,
      right: BLEED_PX,
      extendWith: 'mirror',
    })
    .withMetadata({ density: TARGET_PRINT_DPI });

  if (extension === 'tif' || extension === 'tiff') {
    pipeline = pipeline.tiff({
      compression: 'deflate',
      predictor: 'horizontal',
      xres: TARGET_PRINT_DPI / 25.4,
      yres: TARGET_PRINT_DPI / 25.4,
    });
  } else if (extension === 'jpg' || extension === 'jpeg') {
    pipeline = pipeline.jpeg({ quality: 100, chromaSubsampling: '4:4:4' });
  } else {
    pipeline = pipeline.png({ compressionLevel: 9 });
  }

  const info = await pipeline.toFile(outFile);
  return {
    width: info.width || extract.width + BLEED_PX * 2,
    height: info.height || extract.height + BLEED_PX * 2,
  };
}

async function renderCrop() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  const extension = resolveOutputExtension();
  const files = fs.readdirSync(MANIFEST_DIR).filter((f) => f.endsWith('.json'));
  let totalRendered = 0;
  let totalSkipped = 0;

  console.log('\n======================================================');
  console.log('  ALANWOODYARD.PHOTO: HIGH-RES PRINT CROP RENDERER   ');
  console.log('======================================================\n');
  console.log(
    `[CONFIG] Output: assets/print-ready/{slug}/{crop}.${extension} → /masters/{slug}/{crop}.${extension}`
  );
  console.log(`[CONFIG] ${TARGET_PRINT_DPI} DPI + ${BLEED_INCHES}" mirrored bleed (${BLEED_PX}px/edge)\n`);
  if (onlyIds.size > 0) {
    console.log(`[FILTER] Rendering ${onlyIds.size} requested artwork id(s).\n`);
  }

  for (const file of files) {
    const raw = fs.readFileSync(path.join(MANIFEST_DIR, file), 'utf8').replace(/^\uFEFF/, '');
    const data = JSON.parse(raw);
    const id = path.parse(file).name;
    if (onlyIds.size > 0 && !onlyIds.has(id)) continue;

    if (!data.merch_crops || Object.keys(data.merch_crops).length === 0) {
      continue;
    }

    let masterPath = data.master_file ? path.resolve(data.master_file) : null;
    if (!masterPath || !fs.existsSync(masterPath)) {
      if (allowCleanPreviewAssets()) {
        const preview = path.resolve(`public/images/artworks/clean/${id}.webp`);
        if (fs.existsSync(preview)) {
          console.warn(`[PREVIEW] ${id}: master_file missing; using clean webp (ALLOW_CLEAN_PREVIEW_ASSETS=1)`);
          masterPath = preview;
        } else {
          console.warn(`[SKIP] No source asset found for: ${id}`);
          totalSkipped++;
          continue;
        }
      } else {
        console.warn(
          `[SKIP] No print master for ${id} (set master_file, or ALLOW_CLEAN_PREVIEW_ASSETS=1 for preview-only renders)`
        );
        totalSkipped++;
        continue;
      }
    }

    const artworkOutDir = path.join(OUT_DIR, id);
    if (!fs.existsSync(artworkOutDir)) {
      fs.mkdirSync(artworkOutDir, { recursive: true });
    }

    const imageMetadata = await sharp(masterPath, { limitInputPixels: false }).metadata();
    const origW = imageMetadata.width || 4000;
    const origH = imageMetadata.height || 3000;

    for (const [productName, config] of Object.entries(data.merch_crops)) {
      const cropToken = cropFileToken(productName);
      if (!cropToken) continue;

      const rawConfig = config as Record<string, unknown>;
      const isClusterEntry =
        !rawConfig?.crop && (typeof rawConfig?.zoom === 'number' || typeof rawConfig?.panX === 'number');
      const cropInfo: Partial<CropData> | undefined = (rawConfig?.crop as Partial<CropData> | undefined) ||
        (isClusterEntry ? (rawConfig as Partial<CropData>) : undefined);
      if (!cropInfo) continue;

      const { zoom, panX, panY } = cropInfo;
      const safeRatio = resolveRatio(productName, cropInfo);
      const safeZoom = zoom || 1.0;

      // Studio canvas coordinates → master source pixels.
      // Match merch-studio.astro getCanvasDims (700x500 max) for cluster entries; 600px ref for legacy.
      let canvasRefW = 600;
      let canvasRefH = 600 / safeRatio;
      if (isClusterEntry) {
        canvasRefW = 700;
        canvasRefH = canvasRefW / safeRatio;
        if (canvasRefH > 500) {
          canvasRefH = 500;
          canvasRefW = canvasRefH * safeRatio;
        }
      }

      const imgAspect = origW / origH;
      const canvasAspect = safeRatio;

      let baseW: number;
      let baseH: number;
      if (imgAspect > canvasAspect) {
        baseH = canvasRefH;
        baseW = baseH * imgAspect;
      } else {
        baseW = canvasRefW;
        baseH = baseW / imgAspect;
      }

      const drawW = baseW * safeZoom;
      const drawH = baseH * safeZoom;

      const relX = (canvasRefW - drawW) / 2 + (panX || 0);
      const relY = (canvasRefH - drawH) / 2 + (panY || 0);

      const scaleToOrig = origW / drawW;
      let extractX = Math.round(-relX * scaleToOrig);
      let extractY = Math.round(-relY * scaleToOrig);
      let extractW = Math.round(canvasRefW * scaleToOrig);
      let extractH = Math.round(canvasRefH * scaleToOrig);

      extractX = Math.max(0, Math.min(extractX, origW - 10));
      extractY = Math.max(0, Math.min(extractY, origH - 10));
      extractW = Math.min(extractW, origW - extractX);
      extractH = Math.min(extractH, origH - extractY);

      const outFile = path.join(artworkOutDir, `${cropToken}.${extension}`);
      const masterRel = printMasterRelativePath(id, cropToken, extension);

      const dims = await writePrintMaster(
        masterPath,
        { left: extractX, top: extractY, width: extractW, height: extractH },
        outFile,
        extension
      );

      console.log(`[RENDERED ${TARGET_PRINT_DPI} DPI + bleed] ${id} → ${productName}`);
      console.log(`   Trim: ${extractW}x${extractH} px | With bleed: ${dims.width}x${dims.height} px`);
      console.log(`   File: ${outFile}`);
      console.log(`   Path: ${masterRel}`);
      totalRendered++;
    }
  }

  console.log(
    `\n[SUCCESS] Rendered ${totalRendered} print-ready master files to assets/print-ready. Skipped artworks: ${totalSkipped}.\n`
  );
}

const isCliEntrypoint =
  process.argv[1] != null &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isCliEntrypoint) {
  renderCrop().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
