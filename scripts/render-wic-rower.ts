import sharp from 'sharp';
async function run() {
  await sharp('C:/dev/repos/alanwoodyard-photo/assets.tmp-wic/rower-clean.png', { limitInputPixels: false })
    .resize({ width: 2400, withoutEnlargement: true })
    .toFormat('webp', { quality: 90 })
    .toFile('public/images/artworks/clean/bridgerowertriptych-2.webp');
  import('node:fs').then(fs => {
    fs.copyFileSync('public/images/artworks/clean/bridgerowertriptych-2.webp', 'public/images/artworks/bridgerowertriptych-2.webp');
    console.log('[OK] Clean bridgerowertriptych-2.webp synced with zero watermarks.');
  });
}
run();