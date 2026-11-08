import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const SOURCE_DIR = path.resolve('assets/source-masters');
const WATERMARK_DIR = path.resolve('assets/watermarks');
const MANIFEST_DIR = path.resolve('src/content/artworks');
const DISPLAY_DIR = path.resolve('public/images/artworks');

function computeSha256(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function getAspectRatio(w: number, h: number): string {
  if (!w || !h) return 'N/A';
  const divisor = gcd(w, h);
  const rw = w / divisor;
  const rh = h / divisor;
  if (rw > 50 || rh > 50) return `${(w / h).toFixed(2)}:1`;
  return `${rw}:${rh}`;
}

export async function getBalancedWatermark(targetWidth: number): Promise<Buffer | null> {
  let wmFile = 'alanwoodyard-watermark-sm.png';
  if (targetWidth >= 2000) wmFile = 'alanwoodyard-watermark-lg.png';
  else if (targetWidth >= 1200) wmFile = 'alanwoodyard-watermark-md.png';

  const wmPath = path.join(WATERMARK_DIR, wmFile);
  if (!fs.existsSync(wmPath)) return null;

  const rawBuffer = fs.readFileSync(wmPath);
  const maxWmWidth = Math.round(targetWidth * 0.18);
  const margin = Math.round(targetWidth * 0.025); // Equal 2.5% outer and bottom inset

  // 1. Trim uneven transparent borders from watermark source
  // 2. Resize to calibrated width
  // 3. Extend canvas equally on right and bottom with transparency
  return sharp(rawBuffer)
    .trim()
    .resize({ width: maxWmWidth, withoutEnlargement: true })
    .extend({
      top: 0,
      left: 0,
      right: margin,
      bottom: margin,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .toBuffer();
}

function getCanonicalSlug(filename: string): string {
  const parsed = path.parse(filename);
  return parsed.name
    .toLowerCase()
    .replace(/-(enhanced|upscaled)$/i, '')
    .replace(/[^a-z0-9_-]/g, '-');
}

async function run() {
  const allFiles = fs.readdirSync(SOURCE_DIR).filter((f) => /\.(jpe?g|tiff?|dng)$/i.test(f));
  const masterMap = new Map<string, string>();

  for (const file of allFiles) {
    const slug = getCanonicalSlug(file);
    const isEnhanced = /-(enhanced|upscaled)\.[^.]+$/i.test(file);
    if (!masterMap.has(slug) || isEnhanced) {
      masterMap.set(slug, file);
    }
  }

  console.log(`Re-rendering derivatives for ${masterMap.size} works with equalized margins...\n`);

  for (const [slug, file] of masterMap.entries()) {
    const filePath = path.join(SOURCE_DIR, file);
    const displayOutPath = path.join(DISPLAY_DIR, `${slug}.webp`);

    try {
      const hash = computeSha256(filePath);
      const image = sharp(filePath, { limitInputPixels: false });
      const meta = await image.metadata();
      const width = meta.width || 0;
      const height = meta.height || 0;
      const ratio = getAspectRatio(width, height);

      // Preserve existing manifest data (titles, solo_display, etc.)
      const manifestPath = path.join(MANIFEST_DIR, `${slug}.json`);
      let manifestData: any = {};
      if (fs.existsSync(manifestPath)) {
        try {
          manifestData = JSON.parse(fs.readFileSync(manifestPath, 'utf-8').replace(/^\uFEFF/, ''));
        } catch {}
      }

      manifestData.sha256 = hash;
      manifestData.master_file = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
      if (manifestData.capture) {
        manifestData.capture.native_dimensions = { width, height };
        manifestData.capture.aspect_ratio = ratio;
      }

      fs.writeFileSync(manifestPath, JSON.stringify(manifestData, null, 2), 'utf-8');

      const targetWidth = Math.min(2400, width);
      const wmBuffer = await getBalancedWatermark(targetWidth);

      let pipeline = sharp(filePath, { limitInputPixels: false })
        .rotate()
        .resize({ width: targetWidth, withoutEnlargement: true });

      if (wmBuffer) {
        pipeline = pipeline.composite([{ input: wmBuffer, gravity: 'southeast' }]);
      }

      await pipeline.toFormat('webp', { quality: 85 }).toFile(displayOutPath);
      console.log(`[OK] Rendered: ${slug}.webp (${targetWidth}px)`);
    } catch (err: any) {
      console.warn(`[WARN] Sharp deferred ${file}: ${err.message}. Queuing for WIC fallback.`);
    }
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});