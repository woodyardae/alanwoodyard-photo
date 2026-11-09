import fs from 'node:fs';
import path from 'node:path';

const CSV_FILE = path.resolve('assets/faa-upload-catalog.csv');
const MASTERS_DIR = path.resolve('assets/source-masters');

function parseCsv(content) {
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const values = [];
    let current = '';
    let inQuotes = false;

    for (let c = 0; c < line.length; c++) {
      const char = line[c];
      if (char === '"' && line[c + 1] === '"') {
        current += '"';
        c++;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current);

    const row = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? '';
    });
    rows.push(row);
  }
  return rows;
}

function run() {
  console.log('\n========================================================================================');
  console.log('              FAA BATCH UPLOAD CATALOG & ASSET VERIFICATION REPORT                      ');
  console.log('========================================================================================\n');

  if (!fs.existsSync(CSV_FILE)) {
    console.error(`[FAIL] CSV file missing: ${CSV_FILE}`);
    process.exit(1);
  }

  const csvContent = fs.readFileSync(CSV_FILE, 'utf8');
  const rows = parseCsv(csvContent);
  const masterFiles = fs.existsSync(MASTERS_DIR) ? fs.readdirSync(MASTERS_DIR) : [];

  let passed = 0;
  let failed = 0;

  console.log(`Auditing ${rows.length} queued upload records against master files on disk:\n`);

  for (const row of rows) {
    const filename = row['File Name'];
    const title = row['Title'];
    const descLen = (row['Description'] || '').length;
    const kwCount = (row['Keywords'] || '').split(',').length;

    // Check file on disk (exact match first, then case-insensitive)
    let diskMatch = masterFiles.find(f => f === filename);
    if (!diskMatch) {
      diskMatch = masterFiles.find(f => f.toLowerCase() === filename.toLowerCase());
    }

    if (!diskMatch) {
      console.log(`❌ FAIL | [MISSING FILE] "${filename}"`);
      console.log(`        Title: "${title}" | Master not found in assets/source-masters/`);
      failed++;
      continue;
    }

    const stat = fs.statSync(path.join(MASTERS_DIR, diskMatch));
    const sizeMB = (stat.size / (1024 * 1024)).toFixed(2);

    const issues = [];
    if (!title) issues.push('Empty Title');
    if (descLen < 20) issues.push(`Short Description (${descLen} chars)`);
    if (kwCount < 3) issues.push(`Few Keywords (${kwCount})`);

    if (issues.length > 0) {
      console.log(`⚠️  WARN | [METADATA] "${diskMatch}" (${sizeMB} MB)`);
      console.log(`        Title: "${title}" | Issues: ${issues.join(', ')}`);
      failed++;
    } else {
      console.log(`✓ PASS | [${diskMatch.padEnd(26)}] (${sizeMB.padStart(6)} MB) | "${title.padEnd(20)}" | ${kwCount} tags | Desc: ${descLen} chars`);
      passed++;
    }
  }

  console.log('\n----------------------------------------------------------------------------------------');
  console.log(`Audit Summary: ${passed} Verified Ready | ${failed} Issues Flagged | Total Rows: ${rows.length}`);
  console.log('----------------------------------------------------------------------------------------\n');
}

run();