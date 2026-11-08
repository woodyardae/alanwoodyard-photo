import fs from 'node:fs';
import path from 'node:path';

const MANIFEST_DIR = path.resolve('src/content/artworks');

const updates: Record<string, string> = {
  'img_0994': 'Indie',
  'img_0989': 'Lakeshore Blues',
};

for (const [slug, title] of Object.entries(updates)) {
  const filePath = path.join(MANIFEST_DIR, `${slug}.json`);
  if (fs.existsSync(filePath)) {
    const raw = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '');
    const data = JSON.parse(raw);
    data.title = title;
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`Updated ${slug}.json -> Title: "${title}"`);
  } else {
    console.warn(`Manifest not found: ${filePath}`);
  }
}