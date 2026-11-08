import fs from 'node:fs';
import path from 'node:path';

const MANIFEST_DIR = path.resolve('src/content/artworks');

const TARGET_PRODUCTS = [
  { name: 'Displate Steel Poster', ratio: '20:29', minW: 2900, minH: 4060, lab: 'Displate' },
  { name: 'Large Archival 24x36"', ratio: '2:3', minW: 7200, minH: 10800, lab: 'Prodigi' },
  { name: 'Medium Archival 16x24"', ratio: '2:3', minW: 4800, minH: 7200, lab: 'Prodigi' },
  { name: 'Desk Mat 36x16"', ratio: '16:7', minW: 10800, minH: 4800, lab: 'Printful/Gelato' },
  { name: 'Square Coaster / Acrylic', ratio: '1:1', minW: 3000, minH: 3000, lab: 'Gelato' },
  { name: 'Mug Wrap 15oz', ratio: '2.4:1', minW: 2580, minH: 1110, lab: 'Printify' },
];

function run() {
  const files = fs.readdirSync(MANIFEST_DIR).filter(f => f.endsWith('.json'));
  console.log(`Auditing ${files.length} active catalog items against 300 DPI POD lab specs...\n`);

  let upscaleNeededCount = 0;

  for (const f of files) {
    const raw = fs.readFileSync(path.join(MANIFEST_DIR, f), 'utf-8').replace(/^\uFEFF/, '');
    const data = JSON.parse(raw);
    const nativeW = data.capture?.native_dimensions?.width || 0;
    const nativeH = data.capture?.native_dimensions?.height || 0;
    const maxDim = Math.max(nativeW, nativeH);
    const masterFile = data.master_file || '';

    const deficitProducts: string[] = [];

    for (const prod of TARGET_PRODUCTS) {
      const requiredMax = Math.max(prod.minW, prod.minH);
      if (maxDim < requiredMax) {
        const factor = (requiredMax / maxDim).toFixed(1);
        deficitProducts.push(`${prod.name} (needs ${factor}x)`);
      }
    }

    const isEnhanced = /-(enhanced|upscaled)\.[^.]+$/i.test(masterFile);
    const tag = isEnhanced ? ' [ENHANCED MASTER ACTIVE]' : '';

    if (deficitProducts.length > 0) {
      console.log(`[UPSCALE REQUIRED] ${data.title}${tag} (${nativeW}x${nativeH} px)`);
      deficitProducts.forEach(p => console.log(`   - ${p}`));
      upscaleNeededCount++;
    } else {
      console.log(`[NATIVE READY] ${data.title}${tag} (${nativeW}x${nativeH} px) -> Clears 100% of vendor specs.`);
    }
  }

  console.log(`\nAudit complete: ${upscaleNeededCount} of ${files.length} works require upscaling for large merch.`);
}

run();