import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const SOURCE_DIR = path.resolve('assets/source-masters');

interface ProductSpec {
  name: string;
  ratioW: number;
  ratioH: number;
  minW: number;
  minH: number;
  allowRotate: boolean;
}

const PRODUCTS: Record<string, ProductSpec> = {
  displate: { name: 'Displate (20:29)', ratioW: 20, ratioH: 29, minW: 2900, minH: 4060, allowRotate: true },
  print_2x3: { name: 'Lab Edition (2:3)', ratioW: 2, ratioH: 3, minW: 3600, minH: 5400, allowRotate: true },
  frame_4x5: { name: 'Archival (4:5)', ratioW: 4, ratioH: 5, minW: 3000, minH: 3750, allowRotate: true },
  deskmat: { name: 'Desk Pad (16:7)', ratioW: 16, ratioH: 7, minW: 3840, minH: 1680, allowRotate: false },
  square: { name: 'Square (1:1)', ratioW: 1, ratioH: 1, minW: 2400, minH: 2400, allowRotate: false },
  wrap_pano: { name: 'Panorama (2:1)', ratioW: 2, ratioH: 1, minW: 4800, minH: 2400, allowRotate: false },
};

function calculateCropLoss(srcW: number, srcH: number, targetW: number, targetH: number): number {
  const srcRatio = srcW / srcH;
  const targetRatio = targetW / targetH;

  let keptFraction = 1.0;
  if (srcRatio > targetRatio) {
    // Cropping sides (width)
    keptFraction = targetRatio / srcRatio;
  } else {
    // Cropping top/bottom (height)
    keptFraction = srcRatio / targetRatio;
  }
  return Math.round((1 - keptFraction) * 100);
}

function getBestCropLoss(srcW: number, srcH: number, prod: ProductSpec): { loss: number; orientation: string; resOk: boolean } {
  const nativeIsLandscape = srcW >= srcH;

  if (!prod.allowRotate) {
    const loss = calculateCropLoss(srcW, srcH, prod.ratioW, prod.ratioH);
    const resOk = srcW >= prod.minW && srcH >= prod.minH;
    return { loss, orientation: prod.ratioW >= prod.ratioH ? 'Landscape' : 'Portrait', resOk };
  }

  // Evaluate both Portrait and Landscape alignments
  const lossPortrait = calculateCropLoss(srcW, srcH, Math.min(prod.ratioW, prod.ratioH), Math.max(prod.ratioW, prod.ratioH));
  const lossLandscape = calculateCropLoss(srcW, srcH, Math.max(prod.ratioW, prod.ratioH), Math.min(prod.ratioW, prod.ratioH));

  const chosenOrientation = nativeIsLandscape ? (lossLandscape <= lossPortrait ? 'Landscape' : 'Portrait') : (lossPortrait <= lossLandscape ? 'Portrait' : 'Landscape');
  const chosenLoss = chosenOrientation === 'Landscape' ? lossLandscape : lossPortrait;

  const reqMinShort = Math.min(prod.minW, prod.minH);
  const reqMinLong = Math.max(prod.minW, prod.minH);
  const srcShort = Math.min(srcW, srcH);
  const srcLong = Math.max(srcW, srcH);

  const resOk = srcShort >= reqMinShort && srcLong >= reqMinLong;
  return { loss: chosenLoss, orientation: chosenOrientation, resOk };
}

async function runSurvey() {
  const files = fs.readdirSync(SOURCE_DIR).filter((f) => /\.(jpe?g|tiff?|png|dng)$/i.test(f));
  
  console.log('\n========================================================================================');
  console.log('                 ALAN WOODYARD PHOTOGRAPHY — MASTER DIMENSION AUDIT                      ');
  console.log('========================================================================================\n');

  const reportData = [];

  for (const file of files) {
    const fullPath = path.join(SOURCE_DIR, file);
    try {
      const meta = await sharp(fullPath).metadata();
      const w = meta.width || 0;
      const h = meta.height || 0;
      const orientation = (meta.orientation && [6, 8].includes(meta.orientation)) ? 'rotated' : 'normal';
      
      const naturalW = orientation === 'rotated' ? h : w;
      const naturalH = orientation === 'rotated' ? w : h;
      
      const aspect = (naturalW / naturalH).toFixed(2);
      const native300w = (naturalW / 300).toFixed(1);
      const native300h = (naturalH / 300).toFixed(1);
      const native240w = (naturalW / 240).toFixed(1);
      const native240h = (naturalH / 240).toFixed(1);

      const evaluations: Record<string, any> = {};
      for (const [key, prod] of Object.entries(PRODUCTS)) {
        evaluations[key] = getBestCropLoss(naturalW, naturalH, prod);
      }

      reportData.push({
        file,
        dimensions: `${naturalW}x${naturalH}`,
        aspect,
        print300: `${native300w}"x${native300h}"`,
        print240: `${native240w}"x${native240h}"`,
        evaluations,
      });

      console.log(`[FILE] ${file.padEnd(32)} | Res: ${String(naturalW).padStart(5)}x${String(naturalH).padEnd(5)} (${aspect}:1)`);
      console.log(`       Max Native Print @ 300 DPI: ${native300w}" x ${native300h}" | @ 240 DPI: ${native240w}" x ${native240h}"`);
      
      const warnings = [];
      for (const [key, evalResult] of Object.entries(evaluations)) {
        const prod = PRODUCTS[key];
        const resFlag = evalResult.resOk ? '✓ RES' : '⚠️ LOW-RES';
        const cropFlag = evalResult.loss > 25 ? `⚠️ CROP -${evalResult.loss}%` : `✓ -${evalResult.loss}%`;
        
        if (evalResult.loss > 35) {
          warnings.push(`DISALLOW CANDIDATE: ${prod.name} cuts ${evalResult.loss}% of pixels`);
        }
        if (!evalResult.resOk) {
          warnings.push(`UNDER MIN SPEC: ${prod.name} below lab target`);
        }

        console.log(`       • ${prod.name.padEnd(20)}: ${evalResult.orientation.padEnd(9)} | Loss: ${cropFlag.padEnd(16)} | ${resFlag}`);
      }

      if (warnings.length > 0) {
        console.log(`       >>> FLAGS: ${warnings.join(' | ')}`);
      }
      console.log('----------------------------------------------------------------------------------------');
    } catch (err: any) {
      console.error(`[FAIL] ${file}: ${err.message}`);
    }
  }

  // Save audit data as JSON for interactive UI consumption
  const outDir = path.resolve('src/content/admin');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'catalog-survey.json'), JSON.stringify(reportData, null, 2));
  console.log(`\nAudit complete: ${reportData.length} master files analyzed. Manifest written to src/content/admin/catalog-survey.json\n`);
}

runSurvey().catch(console.error);