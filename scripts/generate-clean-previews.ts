import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const SOURCE_DIR = path.resolve('assets/source-masters');
const CLEAN_DIR = path.resolve('public/images/artworks/clean');

function getCanonicalSlug(filename: string): string {
  const parsed = path.parse(filename);
  return parsed.name
    .toLowerCase()
    .replace(/-(enhanced|upscaled)$/i, '')
    .replace(/[^a-z0-9_-]/g, '-');
}

async function generateClean() {
  const files = fs.readdirSync(SOURCE_DIR).filter((f) => /\.(jpe?g|tiff?|dng)$/i.test(f));
  const masterMap = new Map<string, string>();

  for (const file of files) {
    const slug = getCanonicalSlug(file);
    const isEnhanced = /-(enhanced|upscaled)\.[^.]+$/i.test(file);
    if (!masterMap.has(slug) || isEnhanced) {
      masterMap.set(slug, file);
    }
  }

  for (const [slug, file] of masterMap.entries()) {
    const srcPath = path.join(SOURCE_DIR, file);
    const outPath = path.join(CLEAN_DIR, `${slug}.webp`);

    try {
      await sharp(srcPath, { limitInputPixels: false })
        .rotate()
        .resize({ width: 2000, withoutEnlargement: true })
        .toFormat('webp', { quality: 85 })
        .toFile(outPath);
      console.log(`[CLEAN] ${slug}.webp`);
    } catch (err: any) {
      console.warn(`[SKIP] Sharp deferred ${file}: ${err.message}`);
    }
  }
}

generateClean().catch(console.error);