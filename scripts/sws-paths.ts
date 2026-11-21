/**
 * Local paths for the SeeWhatSticks checkout and the seewhatsticks-portal storefront.
 * SWS_REPO_ROOT overrides discovery. The preferred checkout folder is C:/dev/repos/SeeWhatSticks.
 * Discovery looks for web/seewhatsticks-portal and does not create a new checkout root.
 */
import fs from 'node:fs';
import path from 'node:path';

const REPOS_ROOT = path.resolve('C:/dev/repos');
const PREFERRED_ROOT = path.join(REPOS_ROOT, 'SeeWhatSticks');
const PORTAL_REL = path.join('web', 'seewhatsticks-portal');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', '.wrangler', 'archive']);

function hasPortal(root: string): boolean {
  return fs.existsSync(path.join(root, PORTAL_REL, 'index.html'));
}

export function resolveSeeWhatSticksRoot(): string {
  const fromEnv = process.env.SWS_REPO_ROOT?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  if (hasPortal(PREFERRED_ROOT)) return PREFERRED_ROOT;
  if (!fs.existsSync(REPOS_ROOT)) return PREFERRED_ROOT;

  for (const entry of fs.readdirSync(REPOS_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
    const candidate = path.join(REPOS_ROOT, entry.name);
    if (hasPortal(candidate)) return candidate;
  }
  return PREFERRED_ROOT;
}

export function requireSeeWhatSticksRoot(): string {
  const root = resolveSeeWhatSticksRoot();
  if (!hasPortal(root)) {
    throw new Error(
      `SeeWhatSticks checkout not found. Set SWS_REPO_ROOT to the folder that contains web/seewhatsticks-portal.`,
    );
  }
  return root;
}

export function seeWhatSticksPortalFile(relativePath: string, root = resolveSeeWhatSticksRoot()): string {
  return path.join(root, PORTAL_REL, relativePath);
}

function collectMatches(dir: string, needle: string, depth: number, matches: string[]): void {
  if (depth < 0 || !fs.existsSync(dir)) return;
  const direct = path.join(dir, needle);
  if (fs.existsSync(direct)) matches.push(direct);
  if (depth === 0) return;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
    collectMatches(path.join(dir, entry.name), needle, depth - 1, matches);
  }
}

function entryCount(dir: string, depth = 2): number {
  if (depth < 0 || !fs.existsSync(dir)) return 0;
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
    count += 1;
    if (entry.isDirectory()) count += entryCount(path.join(dir, entry.name), depth - 1);
  }
  return count;
}

export function findSeeWhatSticksDir(root: string, relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/');
  const matches: string[] = [];
  collectMatches(root, normalized, 4, matches);
  const unique = [...new Set(matches)];
  if (unique.length === 0) return path.join(root, normalized);
  unique.sort((left, right) => entryCount(right) - entryCount(left));
  return unique[0];
}
