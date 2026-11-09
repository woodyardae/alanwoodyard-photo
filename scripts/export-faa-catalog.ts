import fs from 'node:fs';
import path from 'node:path';

const MANIFEST_DIR = path.resolve('src/content/artworks');
const OUT_FILE = path.resolve('assets/faa-upload-catalog.csv');

// All 15 works currently live on FAA to exclude from upload
const FAA_EXISTING_SLUGS = [
  'white-wings',
  'austin-in-magenta',
  'morning-in-magenta',
  'portal-to-austin',
  'gold-and-void',
  'bridgerowertriptych-1',
  'bridgerowertriptych-2',
  'bridgerowertriptych-3',
  'vertigo',
  'clawing-at-the-sky',
  'building-wave',
  'twilight-at-kemah-boardwalk',
  'rhythm-and-flow',
  'beneath-the-span-with-title',
  'beneath-the-span-without-title'
];

function escapeCsv(val) {
  if (!val) return '""';
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return `"${val}"`;
}

const files = fs.readdirSync(MANIFEST_DIR).filter(f => f.endsWith('.json'));
const rows = [];

rows.push(['File Name', 'Title', 'Keywords', 'Description', 'Subject', 'Medium'].join(','));

let count = 0;
for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(MANIFEST_DIR, file), 'utf8'));
  
  if (FAA_EXISTING_SLUGS.includes(data.id)) {
    continue;
  }

  const masterFile = path.basename(data.master_file || `${data.id}.jpg`);
  const title = data.title || '';
  const keywords = (data.collections || []).concat(['fine art', 'photography', 'alan woodyard', data.mood || 'landscape']).join(', ');
  const description = data.description || `${title} by Alan Woodyard. Archival fine art photography.`;
  const subject = data.mood === 'maritime' ? 'Maritime' : 'Landscape';
  const medium = 'Photograph';

  rows.push([
    escapeCsv(masterFile),
    escapeCsv(title),
    escapeCsv(keywords),
    escapeCsv(description),
    escapeCsv(subject),
    escapeCsv(medium)
  ].join(','));
  count++;
}

fs.writeFileSync(OUT_FILE, rows.join('\n'), 'utf8');
console.log(`\n[OK] Staged FAA Batch CSV with exactly ${count} new artworks: ${OUT_FILE}\n`);