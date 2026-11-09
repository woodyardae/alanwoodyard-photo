import fs from 'node:fs';
import path from 'node:path';

const MANIFEST_DIR = path.resolve('src/content/artworks');
const CLEAN_DIR = path.resolve('public/images/artworks/clean');
const DISPLAY_DIR = path.resolve('public/images/artworks');

const migrations = [
  {
    pattern: /magentabarreled|magenta-barreled/i,
    newSlug: 'austin-in-magenta',
    newTitle: 'Austin in Magenta',
    faaUrl: 'https://fineartamerica.com/featured/austin-in-magenta-alan-woodyard.html'
  },
  {
    pattern: /magentaarches|magenta-arches/i,
    newSlug: 'morning-in-magenta',
    newTitle: 'Morning in Magenta',
    faaUrl: 'https://fineartamerica.com/featured/morning-in-magenta-alan-woodyard.html'
  },
  {
    pattern: /bluebarreled|blue-barreled/i,
    newSlug: 'portal-to-austin',
    newTitle: 'Portal to Austin',
    faaUrl: 'https://fineartamerica.com/featured/portal-to-austin-alan-woodyard.html'
  }
];

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
  console.log('\n=== MIGRATING MANIFESTS TO FAA ALIASES ===\n');

  const allManifestFiles = fs.readdirSync(MANIFEST_DIR).filter(f => f.endsWith('.json'));

  for (const m of migrations) {
    const matchedFile = allManifestFiles.find(f => m.pattern.test(f));

    if (!matchedFile) {
      console.warn(`[WARN] Could not find manifest matching pattern ${m.pattern}`);
      continue;
    }

    const oldPath = path.join(MANIFEST_DIR, matchedFile);
    const newPath = path.join(MANIFEST_DIR, `${m.newSlug}.json`);
    const data = JSON.parse(fs.readFileSync(oldPath, 'utf8'));

    data.id = m.newSlug;
    data.title = m.newTitle;

    console.log(`[QUERY] Fetching description from FAA for "${m.newTitle}"...`);
    const faaDesc = await fetchFaaDescription(m.faaUrl);
    if (faaDesc) {
      console.log(`  ✓ Pulled FAA description (${faaDesc.length} chars)`);
      data.description = faaDesc;
    } else {
      console.log(`  ℹ Retaining existing description`);
    }

    fs.writeFileSync(newPath, JSON.stringify(data, null, 2), 'utf8');
    if (oldPath !== newPath) {
      fs.unlinkSync(oldPath);
      console.log(`[OK] Renamed manifest: ${matchedFile} -> ${m.newSlug}.json`);
    }

    // Copy clean preview assets to new slug
    if (fs.existsSync(CLEAN_DIR)) {
      const cleanFiles = fs.readdirSync(CLEAN_DIR);
      const matchedClean = cleanFiles.find(f => m.pattern.test(f));
      if (matchedClean) {
        fs.copyFileSync(path.join(CLEAN_DIR, matchedClean), path.join(CLEAN_DIR, `${m.newSlug}.webp`));
        console.log(`[OK] Clean preview ready: ${m.newSlug}.webp`);
      }
    }

    // Copy display preview assets to new slug
    if (fs.existsSync(DISPLAY_DIR)) {
      const displayFiles = fs.readdirSync(DISPLAY_DIR);
      const matchedDisplay = displayFiles.find(f => m.pattern.test(f) && f.endsWith('.webp'));
      if (matchedDisplay) {
        fs.copyFileSync(path.join(DISPLAY_DIR, matchedDisplay), path.join(DISPLAY_DIR, `${m.newSlug}.webp`));
        console.log(`[OK] Display preview ready: ${m.newSlug}.webp`);
      }
    }

    console.log('--------------------------------------------------');
  }

  console.log('\nMigration complete.');
}

run();