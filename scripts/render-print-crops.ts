import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const MANIFEST_DIR = path.resolve('src/content/artworks');
const OUT_DIR = path.resolve('assets/print-ready');

interface CropData {
  productKey: string;
  panX: number;
  panY: number;
  zoom: number;
  ratio: number;
}

async function renderCrop() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  const files = fs.readdirSync(MANIFEST_DIR).filter((f) => f.endsWith('.json'));
  let totalRendered = 0;

  console.log('\n======================================================');
  console.log('  ALANWOODYARD.PHOTO — HIGH-RES PRINT CROP RENDERER   ');
  console.log('======================================================\n');

  for (const file of files) {
    const raw = fs.readFileSync(path.join(MANIFEST_DIR, file), 'utf8').replace(/^\uFEFF/, '');
    const data = JSON.parse(raw);
    const id = path.parse(file).name;

    if (!data.merch_crops || Object.keys(data.merch_crops).length === 0) {
      continue;
    }

    // Resolve master source file
    let masterPath = data.master_file ? path.resolve(data.master_file) : null;
    if (!masterPath || !fs.existsSync(masterPath)) {
      // Fallback to webp preview if master raw/tiff is not present
      masterPath = path.resolve(`public/images/artworks/clean/${id}.webp`);
    }

    if (!fs.existsSync(masterPath)) {
      console.warn(`[SKIP] No source asset found for: ${id}`);
      continue;
    }

    const artworkOutDir = path.join(OUT_DIR, id);
    if (!fs.existsSync(artworkOutDir)) {
      fs.mkdirSync(artworkOutDir, { recursive: true });
    }

    const imageMetadata = await sharp(masterPath).metadata();
    const origW = imageMetadata.width || 4000;
    const origH = imageMetadata.height || 3000;

    for (const [productName, config] of Object.entries(data.merch_crops)) {
      const cropInfo = (config as any).crop as CropData;
      if (!cropInfo) continue;

      const { ratio, zoom, panX, panY } = cropInfo;
      const safeRatio = ratio || 1.5;
      const safeZoom = zoom || 1.0;

      // Studio canvas coordinates conversion to master source pixels
      // In Merch Studio: base scaling fits image inside canvas bounds
      const canvasRefW = 600;
      const canvasRefH = 600 / safeRatio;

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

      // Map canvas window back to original image space
      const scaleToOrig = origW / drawW;
      let extractX = Math.round(-relX * scaleToOrig);
      let extractY = Math.round(-relY * scaleToOrig);
      let extractW = Math.round(canvasRefW * scaleToOrig);
      let extractH = Math.round(canvasRefH * scaleToOrig);

      // Clamp within image bounds
      extractX = Math.max(0, Math.min(extractX, origW - 10));
      extractY = Math.max(0, Math.min(extractY, origH - 10));
      extractW = Math.min(extractW, origW - extractX);
      extractH = Math.min(extractH, origH - extractY);

      const sanitizedProd = productName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const outFile = path.join(artworkOutDir, `${sanitizedProd}.png`);

      await sharp(masterPath)
        .extract({ left: extractX, top: extractY, width: extractW, height: extractH })
        .png({ quality: 100 })
        .toFile(outFile);

      console.log(`[RENDERED 300 DPI] ${id} -> ${productName}`);
      console.log(`   Dimensions: ${extractW}x${extractH} px | File: ${outFile}`);
      totalRendered++;
    }
  }

  console.log(`\n[SUCCESS] Completed rendering ${totalRendered} print-ready master files to: assets/print-ready/\n`);
}

renderCrop().catch(console.error);