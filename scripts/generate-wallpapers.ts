import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs';

const PUBLIC_DOWNLOADS_DIR = path.resolve('public/downloads');
if (!fs.existsSync(PUBLIC_DOWNLOADS_DIR)) {
  fs.mkdirSync(PUBLIC_DOWNLOADS_DIR, { recursive: true });
}

async function run() {
  console.log('Generating 4K Collector Wallpapers...');
  const wallpapers = [
    {
      src: 'assets/source-images/austin-skyline-rowing-dawn.png',
      out: 'alanwoodyard-austin-dawn-4k.jpg'
    },
    {
      src: 'assets/source-images/chesapeake-skipjack-twilight.png',
      out: 'alanwoodyard-chesapeake-mist-4k.jpg'
    }
  ];

  for (const w of wallpapers) {
    const srcPath = path.resolve(w.src);
    const outPath = path.join(PUBLIC_DOWNLOADS_DIR, w.out);
    if (fs.existsSync(srcPath)) {
      await sharp(srcPath)
        .resize(3840, 2160, { fit: 'cover' })
        .jpeg({ quality: 92 })
        .toFile(outPath);
      console.log(`Generated: ${w.out}`);
    }
  }
}

run().catch(console.error);
