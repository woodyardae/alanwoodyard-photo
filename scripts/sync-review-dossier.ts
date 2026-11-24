import fs from 'node:fs';
import path from 'node:path';

const MANIFEST_DIR = path.resolve('src/content/artworks');
const REVIEW_FILE = path.resolve('CATALOG-REVIEW.md');

if (!fs.existsSync(REVIEW_FILE)) {
  console.error(`[FAIL] Review file not found: ${REVIEW_FILE}`);
  process.exit(1);
}

const content = fs.readFileSync(REVIEW_FILE, 'utf8');
const sections = content.split(/^---\s*$/m).filter(s => s.trim().startsWith('## ['));

let updated = 0;

for (const section of sections) {
  const slugMatch = section.match(/##\s*\[(.*?)\]/);
  if (!slugMatch) continue;
  const slug = slugMatch[1].trim();

  const manifestPath = path.join(MANIFEST_DIR, `${slug}.json`);
  if (!fs.existsSync(manifestPath)) {
    console.warn(`[WARN] Manifest missing for slug: ${slug}`);
    continue;
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  const titleMatch = section.match(/\*\*Title:\*\*\s*(.*)/);
  const locMatch = section.match(/\*\*Location:\*\*\s*(.*)/);
  const yearMatch = section.match(/\*\*Year:\*\*\s*(.*)/);
  const subjMatch = section.match(/\*\*Subject:\*\*\s*(.*)/);

  const captionMatch = section.match(/###\s*Caption\s*\n([\s\S]*?)(?=###\s*Summary|$)/);
  const summaryMatch = section.match(/###\s*Summary\s*\n([\s\S]*?)(?=###\s*Description|$)/);
  const descMatch = section.match(/###\s*Description\s*\n([\s\S]*?)(?=###\s*Tags|$)/);
  const tagsMatch = section.match(/###\s*Tags\s*\n([\s\S]*?)(?=(?:---|$))/);

  if (titleMatch) manifest.title = titleMatch[1].trim();
  if (locMatch) {
    manifest.capture = manifest.capture || {};
    manifest.capture.location = locMatch[1].trim();
  }
  if (yearMatch) {
    manifest.capture = manifest.capture || {};
    manifest.capture.year = parseInt(yearMatch[1].trim(), 10) || manifest.capture.year;
  }
  if (subjMatch) {
    manifest.taxonomies = manifest.taxonomies || {};
    manifest.taxonomies.subject = subjMatch[1].trim();
  }
  if (captionMatch) manifest.caption = captionMatch[1].trim();
  if (summaryMatch) manifest.summary = summaryMatch[1].trim();
  if (descMatch) manifest.description = descMatch[1].trim();
  if (tagsMatch) {
    manifest.taxonomies = manifest.taxonomies || {};
    manifest.taxonomies.tags = tagsMatch[1]
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`✓ Synced: [${slug}]`);
  updated++;
}

console.log(`\n[SUCCESS] Successfully synced ${updated} artworks from CATALOG-REVIEW.md back into src/content/artworks/\n`);