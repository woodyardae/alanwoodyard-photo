import fs from 'node:fs';
import path from 'node:path';

const MANIFEST_DIR = path.resolve('src/content/artworks');
const OUT_FILE = path.resolve('CATALOG-REVIEW.md');

const files = fs.readdirSync(MANIFEST_DIR).filter(f => f.endsWith('.json')).sort();

let md = `# Catalog Curatorial Copy & Review Dossier
> Edit any field below directly in plain text. When finished, run:
> \`npx tsx scripts/sync-review-dossier.ts\`
> 
> * Do not change the \`## [slug]\` headers.
> * Edit Title, Location, Subject, Caption, Summary, Description, and Tags freely.

`;

for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(MANIFEST_DIR, file), 'utf8'));
  const slug = data.id || path.basename(file, '.json');
  const preview = `public/images/artworks/${slug}.webp`;

  md += `---
## [${slug}]
**Title:** ${data.title || ''}
**Location:** ${data.capture?.location || ''}
**Year:** ${data.capture?.year || 2026}
**Subject:** ${data.taxonomies?.subject || ''}
**Preview:** ${preview}

### Caption
${data.caption || ''}

### Summary
${data.summary || ''}

### Description
${data.description || ''}

### Tags
${(data.taxonomies?.tags || []).join(', ')}

`;
}

fs.writeFileSync(OUT_FILE, md, 'utf8');
console.log(`\n[OK] Generated clean review document: ${OUT_FILE}`);
console.log(`Open CATALOG-REVIEW.md in VS Code to review and edit all 31 works.\n`);