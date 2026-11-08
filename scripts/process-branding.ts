import path from 'node:path';
import sharp from 'sharp';

const srcPath = path.resolve('assets/watermarks/favicon-huge.png');
const publicDir = path.resolve('public');

async function processBranding() {
  const metadata = await sharp(srcPath).metadata();
  console.log(`Source dimensions: ${metadata.width}x${metadata.height}`);

  // 1. Warm Ivory Header Mark (#f7f4ee)
  const alphaChannel = await sharp(srcPath)
    .extractChannel('alpha')
    .toBuffer();

  const baseW = metadata.width || 1000;
  const baseH = metadata.height || 1000;

  await sharp({
    create: {
      width: baseW,
      height: baseH,
      channels: 4,
      background: { r: 247, g: 244, b: 238, alpha: 1 }
    }
  })
    .joinChannel(alphaChannel)
    .resize(160, 160, { fit: 'contain' })
    .png()
    .toFile(path.join(publicDir, 'logo-mark-light.png'));
  console.log('[OK] Created public/logo-mark-light.png');

  // 2. Favicon (64x64 PNG) with dark badge for high contrast on light/dark browser tabs
  const badgeSvg = Buffer.from(
    `<svg width="128" height="128">
      <rect width="128" height="128" rx="28" fill="#141210" stroke="rgba(197, 160, 89, 0.4)" stroke-width="4" />
    </svg>`
  );

  const resizedIvory = await sharp(path.join(publicDir, 'logo-mark-light.png'))
    .resize(96, 96)
    .toBuffer();

  await sharp(badgeSvg)
    .composite([{ input: resizedIvory, gravity: 'center' }])
    .resize(64, 64)
    .png()
    .toFile(path.join(publicDir, 'favicon.png'));
  console.log('[OK] Created public/favicon.png');

  // 3. Apple Touch Icon (180x180 PNG)
  const appleSvg = Buffer.from(
    `<svg width="180" height="180">
      <rect width="180" height="180" fill="#0a0908" />
      <rect x="6" y="6" width="168" height="168" rx="36" fill="#141210" stroke="rgba(197, 160, 89, 0.5)" stroke-width="4" />
    </svg>`
  );

  const appleLogo = await sharp(path.join(publicDir, 'logo-mark-light.png'))
    .resize(120, 120)
    .toBuffer();

  await sharp(appleSvg)
    .composite([{ input: appleLogo, gravity: 'center' }])
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));
  console.log('[OK] Created public/apple-touch-icon.png');
}

processBranding().catch((err) => {
  console.error(err);
  process.exit(1);
});