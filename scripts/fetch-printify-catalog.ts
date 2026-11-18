import fs from 'node:fs';
import path from 'node:path';

// 1. Read Printify Token
const env: Record<string, string> = {};
for (const file of ['.env', '.dev.vars']) {
  const p = path.resolve(file);
  if (fs.existsSync(p)) {
    fs.readFileSync(p, 'utf8').split(/\r?\n/).forEach(line => {
      const eq = line.indexOf('=');
      if (eq > 0 && !line.trim().startsWith('#')) {
        const k = line.slice(0, eq).trim();
        const v = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
        if (!env[k]) env[k] = v;
      }
    });
  }
}

const token = env.PRINTIFY_API_KEY || env.PRINTIFY_API_TOKEN;
if (!token) {
  console.error('[ERROR] PRINTIFY_API_TOKEN not found.');
  process.exit(1);
}

async function fetchFullCatalog() {
  console.log('Querying Printify API for complete blueprint database...');
  
  // 1. Fetch all blueprints
  const bpRes = await fetch('https://api.printify.com/v1/catalog/blueprints.json', {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!bpRes.ok) {
    console.error(`[ERROR] HTTP ${bpRes.status}:`, await bpRes.text());
    process.exit(1);
  }

  const blueprints = await bpRes.json();
  console.log(`Fetched ${blueprints.length} total Printify products/blueprints.\n`);

  // Ensure output directory
  const outDir = path.resolve('data');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // 2. Write full raw JSON
  const jsonPath = path.join(outDir, 'printify-catalog-full.json');
  fs.writeFileSync(jsonPath, JSON.stringify(blueprints, null, 2), 'utf8');
  console.log(`[SAVED] Full raw catalog: ${jsonPath}`);

  // 3. Write clean, readable CSV for Excel / Sheets
  const csvPath = path.join(outDir, 'printify-catalog.csv');
  const csvRows = ['"Blueprint ID","Product Title","Brand","Model","Images Count"'];
  
  blueprints.forEach((bp: any) => {
    const title = (bp.title || '').replace(/"/g, '""');
    const brand = (bp.brand || '').replace(/"/g, '""');
    const model = (bp.model || '').replace(/"/g, '""');
    const imgCount = bp.images ? bp.images.length : 0;
    csvRows.push(`${bp.id},"${title}","${brand}","${model}",${imgCount}`);
  });

  fs.writeFileSync(csvPath, csvRows.join('\r\n'), 'utf8');
  console.log(`[SAVED] Searchable CSV: ${csvPath}\n`);

  // 4. Sample preview of top categories in console
  console.log('--- SAMPLE OF AVAILABLE PRINTIFY MERCHANDISE ---');
  const sample = blueprints.slice(0, 25);
  sample.forEach((bp: any) => {
    console.log(`[ID ${String(bp.id).padStart(4, ' ')}] ${bp.title} (${bp.brand || 'Generic'})`);
  });
  console.log(`... and ${blueprints.length - 25} more items in data/printify-catalog.csv`);
}

fetchFullCatalog().catch(console.error);