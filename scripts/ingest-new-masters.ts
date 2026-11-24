import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const SOURCE_DIR = path.resolve('assets/source-masters');
const CLEAN_DIR = path.resolve('public/images/artworks/clean');
const DISPLAY_DIR = path.resolve('public/images/artworks');
const MANIFEST_DIR = path.resolve('src/content/artworks');

[CLEAN_DIR, DISPLAY_DIR, MANIFEST_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

function computeSha256(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function getAspectRatio(w: number, h: number): string {
  if (!w || !h) return '3:2';
  const val = w / h;
  if (Math.abs(val - 1.5) < 0.03) return '3:2';
  if (Math.abs(val - 0.667) < 0.03) return '2:3';
  if (Math.abs(val - 1.333) < 0.03) return '4:3';
  if (Math.abs(val - 0.75) < 0.03) return '3:4';
  if (Math.abs(val - 1.25) < 0.03) return '5:4';
  if (Math.abs(val - 0.8) < 0.03) return '4:5';
  if (Math.abs(val - 1.0) < 0.03) return '1:1';
  if (Math.abs(val - 1.777) < 0.03) return '16:9';
  if (Math.abs(val - 2.285) < 0.05) return '16:7';

  const divisor = gcd(w, h);
  const rw = w / divisor;
  const rh = h / divisor;
  if (rw > 50 || rh > 50) return `${val.toFixed(2)}:1`;
  return `${rw}:${rh}`;
}

function cleanTitle(stem: string): string {
  return stem
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function run() {
  if (!fs.existsSync(SOURCE_DIR)) {
    console.error(`[ERROR] Source folder does not exist: ${SOURCE_DIR}`);
    process.exit(1);
  }

  const allFiles = fs.readdirSync(SOURCE_DIR);
  const masterFiles = allFiles.filter((f) => /\.(jpe?g|tiff?|png|webp)$/i.test(f));

  console.log('================================================================');
  console.log('       ALANWOODYARD.PHOTO — CATALOG INTAKE & PREVIEW ENGINE      ');
  console.log('================================================================');
  console.log(`Total master files in assets/source-masters: ${masterFiles.length}`);

  // Discover existing manifests
  const existingManifests = fs.readdirSync(MANIFEST_DIR).filter((f) => f.endsWith('.json'));
  const existingSlugs = new Set(existingManifests.map((f) => path.parse(f).name.toLowerCase()));

  console.log(`Existing catalog records:                  ${existingSlugs.size}`);

  const toProcess = masterFiles.filter((file) => {
    const slug = path.parse(file).name.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/[-_]+/g, '-');
    const cleanPath = path.join(CLEAN_DIR, `${slug}.webp`);
    const manifestPath = path.join(MANIFEST_DIR, `${slug}.json`);
    return !fs.existsSync(cleanPath) || !fs.existsSync(manifestPath);
  });

  console.log(`New masters pending intake:                ${toProcess.length}`);
  console.log('----------------------------------------------------------------\n');

  if (toProcess.length === 0) {
    console.log('All master files already have manifests and preview derivatives. Nothing to do.');
    return;
  }

  let count = 0;
  for (const file of toProcess) {
    count++;
    const filePath = path.join(SOURCE_DIR, file);
    const parsed = path.parse(file);
    const slug = parsed.name.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/[-_]+/g, '-');

    const manifestPath = path.join(MANIFEST_DIR, `${slug}.json`);
    const cleanOutPath = path.join(CLEAN_DIR, `${slug}.webp`);
    const displayOutPath = path.join(DISPLAY_DIR, `${slug}.webp`);

    try {
      const hash = computeSha256(filePath);
      const image = sharp(filePath, { limitInputPixels: false });
      const meta = await image.metadata();
      const width = meta.width || 0;
      const height = meta.height || 0;
      const ratio = getAspectRatio(width, height);
      const targetWidth = Math.min(2400, width);

      // 1. Generate clean preview for Merch Studio
      await sharp(filePath, { limitInputPixels: false })
        .rotate()
        .resize({ width: targetWidth, withoutEnlargement: true })
        .toFormat('webp', { quality: 88 })
        .toFile(cleanOutPath);

      // 2. Mirror clean preview to display path
      fs.copyFileSync(cleanOutPath, displayOutPath);

      // 3. Create JSON Manifest (preserve if existing)
      if (!fs.existsSync(manifestPath)) {
        const title = cleanTitle(parsed.name);
        const manifestData = {
          id: slug,
          title,
          caption: '',
          description: `${title} by Alan Woodyard. Archival fine-art edition.`,
          mood: 'all',
          collections: ['germany', 'seascape'],
          tags: ['fine art', 'photography', 'germany', 'beach', 'seascape', 'baltic'],
          solo_display: true,
          master_file: path.relative(process.cwd(), filePath).replace(/\\/g, '/'),
          sha256: hash,
          version: 1,
          display: {
            watermark: 'none'
          },
          capture: {
            date: meta.exif ? 'EXIF' : new Date().toISOString().split('T')[0],
            location: 'Germany Coast',
            camera: '',
            lens: '',
            settings: {},
            native_dimensions: { width, height },
            aspect_ratio: ratio
          },
          merch_approved: [],
          merch_crops: {},
          print_variants: [
            {
              sku: `prodigi:rag-16x24`,
              substrate: 'Hahnemühle Photo Rag',
              size: '16x24',
              price_cents: 19500
            },
            {
              sku: `prodigi:rag-24x36`,
              substrate: 'Hahnemühle Photo Rag',
              size: '24x36',
              price_cents: 34000
            }
          ]
        };

        fs.writeFileSync(manifestPath, JSON.stringify(manifestData, null, 2), 'utf-8');
      }

      console.log(`[${count}/${toProcess.length}] ✓ Ingested: ${slug} (${width}x${height}px, ratio ${ratio})`);
    } catch (err: any) {
      console.error(`[FAIL] ${file}: ${err.message}`);
    }
  }

  console.log('\n================================================================');
  console.log(`Successfully processed ${count} new artworks into catalog.`);
  console.log('================================================================\n');
}

run().catch((err) => {
  console.error('Fatal ingestion error:', err);
  process.exit(1);
});