import fs from 'node:fs';
import path from 'node:path';
import { requireSeeWhatSticksRoot } from './sws-paths';

const SOURCE_FILE = path.resolve('src/lib/merch-studio-shared.ts');
const TARGET_DIR = path.join(requireSeeWhatSticksRoot(), 'packages', 'pod-merch-studio');
const TARGET_FILE = path.join(TARGET_DIR, 'index.ts');

function syncSharedStudio() {
  if (!fs.existsSync(SOURCE_FILE)) {
    throw new Error(`Shared studio source not found: ${SOURCE_FILE}`);
  }
  if (!fs.existsSync(TARGET_DIR)) {
    fs.mkdirSync(TARGET_DIR, { recursive: true });
  }
  const content = fs.readFileSync(SOURCE_FILE, 'utf8');
  fs.writeFileSync(TARGET_FILE, content, 'utf8');
  console.log(`[SYNC] Copied shared Merch Studio module -> ${TARGET_FILE}`);
}

syncSharedStudio();
