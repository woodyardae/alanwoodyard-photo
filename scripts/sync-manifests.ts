import fs from 'node:fs';
import path from 'node:path';

const MANIFEST_DIR = path.resolve('src/content/artworks');

const files = fs.readdirSync(MANIFEST_DIR).filter(f => f.endsWith('.json'));

for (const file of files) {
  const filePath = path.join(MANIFEST_DIR, file);
  const raw = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '');
  const data = JSON.parse(raw);

  const slug = data.id || path.parse(file).name;

  if (slug === 'bridgerowertriptych-1') {
    data.solo_display = false;
  } else if (slug === 'bridgerowertriptych-2') {
    data.solo_display = true;
    data.title = 'Bridge Rower';
  } else if (slug === 'bridgerowertriptych-3') {
    data.solo_display = false;
  } else if (slug === '06-01k1imgrev-clawingatthesky') {
    data.title = 'Clawing at the Sky';
    data.solo_display = true;
  } else if (data.solo_display === undefined) {
    data.solo_display = true;
  }

  // Write clean UTF-8 without BOM
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}
console.log(`Synced and stripped BOM from ${files.length} manifests.`);