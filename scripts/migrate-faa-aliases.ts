import fs from 'node:fs';
import path from 'node:path';

const MANIFEST_DIR = path.resolve('src/content/artworks');
const CLEAN_DIR = path.resolve('public/images/artworks/clean');
const DISPLAY_DIR = path.resolve('public/images/artworks');

const migrations = [
  {
    oldSlug: '11-01k1imgrev-magentabarreled',
    newSlug: 'austin-in-magenta',
    newTitle: 'Austin in Magenta',
    faaUrl: 'https://fineartamerica.com/featured/austin-in-magenta-alan-woodyard.html'
  },
  {
    oldSlug: '09-01k1imgrev-magentaarches',
    newSlug: 'morning-in-magenta',
    newTitle: 'Morning in Magenta',
    faaUrl: 'https://fineartamerica.com/featured/morning-in-magenta-alan-woodyard.html'
  },
  {
    oldSlug: '12-01k1imgrev-bluebarreled',
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
    
    // Extract og:description or standard meta description
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

  for (const m of migrations) {
    const oldManifestPath = path.join(MANIFEST_DIR, `${m.oldSlug}.json`);
    const newManifestPath = path.join(MANIFEST_DIR, `${m.newSlug}.json`);

    if (fs.existsSync(oldManifestPath)) {
      const data = JSON.parse(fs.readFileSync(oldManifestPath, 'utf8'));

      data.id = m.newSlug;
      data.title = m.newTitle;

      console.log(`[QUERY] Fetching description from FAA for ${m.newTitle}...`);
      const faaDesc = await fetchFaaDescription(m.faaUrl);
      if (faaDesc) {
        console.log(`  ✓ Pulled FAA description (${faaDesc.length} chars)`);
        data.description = faaDesc;
      } else {
        console.log(`  ℹ Retaining existing description`);
      }

      fs.writeFileSync(newManifestPath, JSON.stringify(data, null, 2), 'utf8');
      fs.unlinkSync(oldManifestPath);
      console.log(`[OK] Renamed manifest: ${m.oldSlug}.json -> ${m.newSlug}.json`);

      // Duplicate/rename clean WebP previews
      const oldClean = path.join(CLEAN_DIR, `${m.oldSlug}.webp`);
      const newClean = path.join(CLEAN_DIR, `${m.newSlug}.webp`);
      if (fs.existsSync(oldClean)) {
        fs.copyFileSync(oldClean, newClean);
        console.log(`[OK] Copied clean preview: ${m.newSlug}.webp`);
      }

      // Duplicate/rename display WebP previews if present
      const oldDisplay = path.join(DISPLAY_DIR, `${m.oldSlug}.webp`);
      const newDisplay = path.join(DISPLAY_DIR, `${m.newSlug}.webp`);
      if (fs.existsSync(oldDisplay)) {
        fs.copyFileSync(oldDisplay, newDisplay);
        console.log(`[OK] Copied display preview: ${m.newSlug}.webp`);
      }
    } else if (fs.existsSync(newManifestPath)) {
      console.log(`[SKIP] ${m.newSlug}.json already exists.`);
    } else {
      console.warn(`[WARN] File not found: ${oldManifestPath}`);
    }
    console.log('--------------------------------------------------');
  }

  console.log('\nMigration complete.');
}

run();