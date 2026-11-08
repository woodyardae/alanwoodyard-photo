import fs from 'node:fs';
import path from 'node:path';

const MANIFEST_DIR = path.resolve('src/content/artworks');
const OUT_CSV = path.resolve('assets/syndication-catalog.csv');

function escapeCsv(val: any): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

function run() {
  const files = fs.readdirSync(MANIFEST_DIR).filter(f => f.endsWith('.json'));
  const headers = [
    'Slug',
    'Title',
    'SoloDisplay',
    'Caption',
    'Description',
    'Tags',
    'AspectRatio',
    'NativeWidth',
    'NativeHeight',
    'MasterFile',
    'DisplayWebP',
    'StartingPriceUSD'
  ];

  const rows: string[] = [headers.join(',')];

  for (const f of files) {
    const raw = fs.readFileSync(path.join(MANIFEST_DIR, f), 'utf-8').replace(/^\uFEFF/, '');
    const data = JSON.parse(raw);

    const price = data.print_variants?.[0]?.price_cents
      ? (data.print_variants[0].price_cents / 100).toFixed(2)
      : '0.00';

    const tags = Array.isArray(data.tags) ? data.tags.join(', ') : '';

    rows.push([
      escapeCsv(data.id || path.parse(f).name),
      escapeCsv(data.title || ''),
      escapeCsv(data.solo_display !== false),
      escapeCsv(data.caption || ''),
      escapeCsv(data.description || ''),
      escapeCsv(tags),
      escapeCsv(data.capture?.aspect_ratio || ''),
      escapeCsv(data.capture?.native_dimensions?.width || ''),
      escapeCsv(data.capture?.native_dimensions?.height || ''),
      escapeCsv(data.master_file || ''),
      escapeCsv(`public/images/artworks/${data.id}.webp`),
      escapeCsv(price)
    ].join(','));
  }

  fs.writeFileSync(OUT_CSV, rows.join('\r\n'), 'utf-8');
  console.log(`Exported ${files.length} catalog records to: ${OUT_CSV}`);
}

run();