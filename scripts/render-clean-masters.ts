import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const SOURCE_DIR = path.resolve('assets/source-masters');
const CLEAN_DIR = path.resolve('public/images/artworks/clean');
const DISPLAY_DIR = path.resolve('public/images/artworks');

if (!fs.existsSync(CLEAN_DIR)) fs.mkdirSync(CLEAN_DIR, { recursive: true });

function getCanonicalSlug(filename: string): string {
  return path.parse(filename).name
    .toLowerCase()
    .replace(/-(enhanced|upscaled)$/i, '')
    .replace(/[^a-z0-9_-]/g, '-');
}

async function run() {
  const allFiles = fs.readdirSync(SOURCE_DIR).filter(f => /\.(jpe?g|tiff?|dng)$/i.test(f));
  const masterMap = new Map<string, string>();

  for (const file of allFiles) {
    const slug = getCanonicalSlug(file);
    const isEnhanced = /-(enhanced|upscaled)\.[^.]+$/i.test(file);
    if (!masterMap.has(slug) || isEnhanced) {
      masterMap.set(slug, file);
    }
  }

  console.log(`Generating unwatermarked masters for ${masterMap.size} works...`);

  for (const [slug, file] of masterMap.entries()) {
    const srcPath = path.join(SOURCE_DIR, file);
    const cleanPath = path.join(CLEAN_DIR, `${slug}.webp`);
    const displayPath = path.join(DISPLAY_DIR, `${slug}.webp`);

    try {
      await sharp(srcPath, { limitInputPixels: false })
        .rotate()
        .resize({ width: 2400, withoutEnlargement: true })
        .toFormat('webp', { quality: 90 })
        .toFile(cleanPath);

      // Overwrite display directory so no watermarked copy remains anywhere
      fs.copyFileSync(cleanPath, displayPath);
      console.log(`[CLEAN] ${slug}.webp`);
    } catch (err: any) {
      console.warn(`[DEFERRED TO WIC] ${file}: ${err.message}`);
    }
  }
}

run().catch(console.error);