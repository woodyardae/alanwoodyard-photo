import path from 'node:path';
import sharp from 'sharp';

const publicDir = path.resolve('public');
const lightLogoPath = path.join(publicDir, 'logo-mark-light.png');

async function buildIcons() {
  // 1. Generate Favicon (64x64 PNG) with solid obsidian background (#141210)
  const favSize = 64;
  const favLogoSize = 44;

  const favBase = await sharp({
    create: {
      width: favSize,
      height: favSize,
      channels: 4,
      background: { r: 20, g: 18, b: 16, alpha: 1 } // #141210
    }
  })
    .png()
    .toBuffer();

  const favLogo = await sharp(lightLogoPath)
    .resize(favLogoSize, favLogoSize, { fit: 'contain' })
    .toBuffer();

  await sharp(favBase)
    .composite([{ input: favLogo, gravity: 'center' }])
    .png()
    .toFile(path.join(publicDir, 'favicon.png'));
  console.log('[OK] Created public/favicon.png (64x64)');

  // 2. Generate Apple Touch Icon (180x180 PNG) for mobile home screens
  const appleSize = 180;
  const appleLogoSize = 120;

  const appleBase = await sharp({
    create: {
      width: appleSize,
      height: appleSize,
      channels: 4,
      background: { r: 20, g: 18, b: 16, alpha: 1 } // #141210
    }
  })
    .png()
    .toBuffer();

  const appleLogo = await sharp(lightLogoPath)
    .resize(appleLogoSize, appleLogoSize, { fit: 'contain' })
    .toBuffer();

  await sharp(appleBase)
    .composite([{ input: appleLogo, gravity: 'center' }])
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));
  console.log('[OK] Created public/apple-touch-icon.png (180x180)');
}

buildIcons().catch((err) => {
  console.error(err);
  process.exit(1);
});