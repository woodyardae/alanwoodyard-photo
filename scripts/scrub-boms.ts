import fs from 'node:fs';
import path from 'node:path';

function scrubDir(dir: string) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scrubDir(fullPath);
    } else if (/\.(json|md)$/i.test(entry.name)) {
      const raw = fs.readFileSync(fullPath, 'utf-8');
      if (raw.charCodeAt(0) === 0xFEFF) {
        fs.writeFileSync(fullPath, raw.slice(1), 'utf-8');
        console.log(`[STRIPPED BOM] ${path.relative(process.cwd(), fullPath)}`);
      }
    }
  }
}

scrubDir(path.resolve('src/content'));
console.log('BOM scrub complete.');