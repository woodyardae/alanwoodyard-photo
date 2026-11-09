import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const MASTERS_DIR = path.resolve('assets/source-masters');
const MANIFEST_DIR = path.resolve('src/content/artworks');
const CLEAN_DIR = path.resolve('public/images/artworks/clean');
const DISPLAY_DIR = path.resolve('public/images/artworks');

const incoming = [
  {
    pattern: /kemah/i,
    slug: 'twilight-at-kemah-boardwalk',
    title: 'Twilight at Kemah Boardwalk',
    mood: 'magenta-twilight',
    collections: ['gulf-coast', 'maritime', 'twilight'],
    faaUrl: 'https://fineartamerica.com/featured/twilight-at-kemah-boardwalk-alan-woodyard.html'
  },
  {
    pattern: /rhythm.*flow/i,
    slug: 'rhythm-and-flow',
    title: 'Rhythm and Flow',
    mood: 'coastal-geometry',
    collections: ['nashville', 'architectural', 'geometry'],
    faaUrl: 'https://fineartamerica.com/featured/rhythm-and-flow-alan-woodyard.html'
  },
  {
    pattern: /span.*with-title|rowers-resolve.*with-title/i,
    slug: 'beneath-the-span-with-title',
    title: "Beneath the Span — A Rower's Resolve (With Title)",
    mood: 'austin-horizons',
    collections: ['austin-skyline', 'maritime', 'triptychs'],
    faaUrl: 'https://fineartamerica.com/featured/beneath-the-span-a-rowers-resolve-with-title-alan-woodyard.html'
  },
  {
    pattern: /span.*without-title|rowers-resolve.*without-title/i,
    slug: 'beneath-the-span-without-title',
    title: "Beneath the Span — A Rower's Resolve (Without Title)",
    mood: 'austin-horizons',
    collections: ['austin-skyline', 'maritime', 'triptychs'],
    faaUrl: 'https://fineartamerica.com/featured/beneath-the-span-a-rowers-resolve-without-title-alan-woodyard.html'
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
  console.log('\n=== INGESTING NEW ARCHIVE MASTERS & COMPOSITES ===\n');

  const masterFiles = fs.readdirSync(MASTERS_DIR);

  for (const item of incoming) {
    const matchedMaster = masterFiles.find(f => item.pattern.test(f));

    if (!matchedMaster) {
      console.warn(`[SKIP] Master file not found matching pattern: ${item.pattern}`);
      continue;
    }

    const masterPath = path.join(MASTERS_DIR, matchedMaster);
    console.log(`Processing: [${item.title}]`);
    console.log(`  Source master: ${matchedMaster}`);

    const image = sharp(masterPath, { limitInputPixels: false });
    const metadata = await image.metadata();

    const width = metadata.width || 0;
    const height = metadata.height || 0;
    const ratio = (width / height).toFixed(2);

    const cleanWebp = path.join(CLEAN_DIR, `${item.slug}.webp`);
    const displayWebp = path.join(DISPLAY_DIR, `${item.slug}.webp`);

    await sharp(masterPath, { limitInputPixels: false })
      .resize({ width: 2400, withoutEnlargement: true })
      .webp({ quality: 88 })
      .toFile(cleanWebp);
    console.log(`  ✓ Generated clean preview: ${item.slug}.webp`);

    fs.copyFileSync(cleanWebp, displayWebp);
    console.log(`  ✓ Generated display preview: ${item.slug}.webp`);

    console.log(`  [QUERY] Fetching FAA description for ${item.title}...`);
    const faaDesc = await fetchFaaDescription(item.faaUrl);
    const description = faaDesc || `${item.title} by Alan Woodyard. Archival fine-art edition.`;

    const manifestPath = path.join(MANIFEST_DIR, `${item.slug}.json`);
    const manifestData = {
      id: item.slug,
      title: item.title,
      mood: item.mood,
      collections: item.collections,
      master_file: `assets/source-masters/${matchedMaster}`,
      description,
      capture: {
        dimensions: `${width} x ${height}`,
        aspect_ratio: `${ratio}:1`,
        orientation: width >= height ? 'landscape' : 'portrait'
      },
      merch_approved: []
    };

    fs.writeFileSync(manifestPath, JSON.stringify(manifestData, null, 2), 'utf8');
    console.log(`  ✓ Created manifest: src/content/artworks/${item.slug}.json`);
    console.log('--------------------------------------------------');
  }

  console.log('\nIngestion pass complete.');
}

run();