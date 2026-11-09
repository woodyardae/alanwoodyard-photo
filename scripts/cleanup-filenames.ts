import fs from 'node:fs';
import path from 'node:path';

const MASTERS_DIR = path.resolve('assets/source-masters');
const MANIFEST_DIR = path.resolve('src/content/artworks');
const CLEAN_DIR = path.resolve('public/images/artworks/clean');
const DISPLAY_DIR = path.resolve('public/images/artworks');

const rules = [
  {
    pattern: /buildingwave|building-wave/i,
    newMaster: 'Building-Wave.tiff',
    cleanSlug: 'building-wave',
    cleanTitle: 'Building Wave'
  },
  {
    pattern: /clawingatthesky|clawing-at-the-sky/i,
    newMaster: 'Clawing-at-the-Sky.jpg',
    cleanSlug: 'clawing-at-the-sky',
    cleanTitle: 'Clawing at the Sky'
  },
  {
    pattern: /path\./i,
    newMaster: 'Path.tiff',
    cleanSlug: 'path',
    cleanTitle: 'Path'
  },
  {
    pattern: /vertigo/i,
    newMaster: 'Vertigo.tiff',
    cleanSlug: 'vertigo',
    cleanTitle: 'Vertigo'
  },
  {
    pattern: /whitewings|white-wings/i,
    newMaster: 'White-Wings.tiff',
    cleanSlug: 'white-wings',
    cleanTitle: 'White Wings'
  },
  {
    pattern: /austin-in-magenta|magentabarreled|magenta-barreled/i,
    newMaster: 'Austin-in-Magenta.tiff',
    cleanSlug: 'austin-in-magenta',
    cleanTitle: 'Austin in Magenta'
  },
  {
    pattern: /morning-in-magenta|magentaarches|magenta-arches/i,
    newMaster: 'Morning-in-Magenta.tiff',
    cleanSlug: 'morning-in-magenta',
    cleanTitle: 'Morning in Magenta'
  },
  {
    pattern: /portal-to-austin|bluebarreled|blue-barreled/i,
    newMaster: 'Portal-to-Austin.tiff',
    cleanSlug: 'portal-to-austin',
    cleanTitle: 'Portal to Austin'
  },
  {
    pattern: /0994|indie/i,
    newMaster: 'Indie.jpg',
    cleanSlug: 'indie',
    cleanTitle: 'Indie'
  },
  {
    pattern: /0989|lakeshore-blues/i,
    newMaster: 'Lakeshore-Blues.jpg',
    cleanSlug: 'lakeshore-blues',
    cleanTitle: 'Lakeshore Blues'
  },
  {
    pattern: /0993|rayburn-sunset/i,
    newMaster: 'Rayburn-Sunset.jpg',
    cleanSlug: 'rayburn-sunset',
    cleanTitle: 'Rayburn Sunset'
  }
];

function run() {
  console.log('\n=== UNIFYING CATALOG & PURGING RAW FILENAME STEMS ===\n');

  for (const r of rules) {
    console.log(`Processing: [${r.cleanTitle}] -> slug: "${r.cleanSlug}"`);

    // 1. Rename Master in assets/source-masters
    if (fs.existsSync(MASTERS_DIR)) {
      const masters = fs.readdirSync(MASTERS_DIR);
      const oldMaster = masters.find(f => r.pattern.test(f));
      if (oldMaster && oldMaster !== r.newMaster) {
        fs.renameSync(
          path.join(MASTERS_DIR, oldMaster),
          path.join(MASTERS_DIR, r.newMaster)
        );
        console.log(`  ✓ Renamed master: ${oldMaster} -> ${r.newMaster}`);
      }
    }

    // 2. Normalize JSON Manifest
    const manifests = fs.readdirSync(MANIFEST_DIR).filter(f => f.endsWith('.json'));
    const oldManifest = manifests.find(f => r.pattern.test(f));

    if (oldManifest) {
      const oldManifestPath = path.join(MANIFEST_DIR, oldManifest);
      const newManifestPath = path.join(MANIFEST_DIR, `${r.cleanSlug}.json`);
      const data = JSON.parse(fs.readFileSync(oldManifestPath, 'utf8'));

      data.id = r.cleanSlug;
      data.title = r.cleanTitle;
      data.master_file = `assets/source-masters/${r.newMaster}`;

      fs.writeFileSync(newManifestPath, JSON.stringify(data, null, 2), 'utf8');

      if (oldManifestPath !== newManifestPath) {
        fs.unlinkSync(oldManifestPath);
        console.log(`  ✓ Renamed manifest: ${oldManifest} -> ${r.cleanSlug}.json`);
      } else {
        console.log(`  ✓ Updated manifest internals: ${r.cleanSlug}.json`);
      }
    }

    // 3. Clean and Unify public/images/artworks/clean/
    if (fs.existsSync(CLEAN_DIR)) {
      const cleanFiles = fs.readdirSync(CLEAN_DIR);
      const matchedCleans = cleanFiles.filter(f => r.pattern.test(f));
      const targetClean = path.join(CLEAN_DIR, `${r.cleanSlug}.webp`);

      if (matchedCleans.length > 0) {
        const primary = matchedCleans.find(f => f === `${r.cleanSlug}.webp`) || matchedCleans[0];
        if (primary !== `${r.cleanSlug}.webp`) {
          fs.copyFileSync(path.join(CLEAN_DIR, primary), targetClean);
          console.log(`  ✓ Created clean preview: ${r.cleanSlug}.webp`);
        }
        for (const extra of matchedCleans) {
          if (extra !== `${r.cleanSlug}.webp`) {
            fs.unlinkSync(path.join(CLEAN_DIR, extra));
            console.log(`  - Removed legacy clean file: ${extra}`);
          }
        }
      }
    }

    // 4. Clean and Unify public/images/artworks/
    if (fs.existsSync(DISPLAY_DIR)) {
      const displayFiles = fs.readdirSync(DISPLAY_DIR).filter(f => !fs.statSync(path.join(DISPLAY_DIR, f)).isDirectory());
      const matchedDisplays = displayFiles.filter(f => r.pattern.test(f));
      const targetDisplay = path.join(DISPLAY_DIR, `${r.cleanSlug}.webp`);

      if (matchedDisplays.length > 0) {
        const primary = matchedDisplays.find(f => f === `${r.cleanSlug}.webp`) || matchedDisplays[0];
        if (primary !== `${r.cleanSlug}.webp`) {
          fs.copyFileSync(path.join(DISPLAY_DIR, primary), targetDisplay);
          console.log(`  ✓ Created display preview: ${r.cleanSlug}.webp`);
        }
        for (const extra of matchedDisplays) {
          if (extra !== `${r.cleanSlug}.webp`) {
            fs.unlinkSync(path.join(DISPLAY_DIR, extra));
            console.log(`  - Removed legacy display file: ${extra}`);
          }
        }
      }
    }

    console.log('--------------------------------------------------');
  }

  console.log('Catalog filename cleanup complete.\n');
}

run();