import fs from 'node:fs';
import path from 'node:path';

const MANIFEST_DIR = path.resolve('src/content/artworks');
const MASTERS_DIR = path.resolve('assets/source-masters');
const CLEAN_DIR = path.resolve('public/images/artworks/clean');
const DISPLAY_DIR = path.resolve('public/images/artworks');

const FAA_URL = 'https://fineartamerica.com/featured/gold-and-void-alan-woodyard.html';

async function fetchFaaDescription(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    if (!res.ok) return null;
    const html = await res.text();
    
    const ogMatch = html.match(/<meta\s+property=["']og:description["']\s+content=["'](.*?)["']/i);
    if (ogMatch && ogMatch[1] && !ogMatch[1].startsWith('Photograph by')) {
      return ogMatch[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
    }
    
    const metaMatch = html.match(/<meta\s+name=["']description["']\s+content=["'](.*?)["']/i);
    if (metaMatch && metaMatch[1]) {
      return metaMatch[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
    }
    return null;
  } catch {
    return null;
  }
}

async function run() {
  console.log('\n=== MIGRATING PATH -> GOLD AND VOID ===\n');

  // 1. Rename Master file
  if (fs.existsSync(MASTERS_DIR)) {
    const masters = fs.readdirSync(MASTERS_DIR);
    const oldMaster = masters.find(f => /^path\./i.test(f));
    if (oldMaster) {
      const ext = path.extname(oldMaster);
      const newMaster = `Gold-and-Void${ext}`;
      fs.renameSync(path.join(MASTERS_DIR, oldMaster), path.join(MASTERS_DIR, newMaster));
      console.log(`  ✓ Renamed master: ${oldMaster} -> ${newMaster}`);
    }
  }

  // 2. Update Manifest
  const oldManifest = path.join(MANIFEST_DIR, 'path.json');
  const newManifest = path.join(MANIFEST_DIR, 'gold-and-void.json');

  if (fs.existsSync(oldManifest)) {
    const data = JSON.parse(fs.readFileSync(oldManifest, 'utf8'));
    data.id = 'gold-and-void';
    data.title = 'Gold and Void';
    data.master_file = 'assets/source-masters/Gold-and-Void.tiff';

    console.log(`[QUERY] Fetching description from FAA for Gold and Void...`);
    const faaDesc = await fetchFaaDescription(FAA_URL);
    if (faaDesc) {
      console.log(`  ✓ Pulled FAA description (${faaDesc.length} chars)`);
      data.description = faaDesc;
    }

    fs.writeFileSync(newManifest, JSON.stringify(data, null, 2), 'utf8');
    fs.unlinkSync(oldManifest);
    console.log(`  ✓ Manifest updated: path.json -> gold-and-void.json`);
  }

  // 3. Clean Preview
  const oldClean = path.join(CLEAN_DIR, 'path.webp');
  const newClean = path.join(CLEAN_DIR, 'gold-and-void.webp');
  if (fs.existsSync(oldClean)) {
    fs.copyFileSync(oldClean, newClean);
    fs.unlinkSync(oldClean);
    console.log(`  ✓ Clean preview updated: gold-and-void.webp`);
  }

  // 4. Display Preview
  const oldDisplay = path.join(DISPLAY_DIR, 'path.webp');
  const newDisplay = path.join(DISPLAY_DIR, 'gold-and-void.webp');
  if (fs.existsSync(oldDisplay)) {
    fs.copyFileSync(oldDisplay, newDisplay);
    fs.unlinkSync(oldDisplay);
    console.log(`  ✓ Display preview updated: gold-and-void.webp`);
  }

  console.log('\nMigration complete.');
}

run();