import fs from 'node:fs';
import path from 'node:path';

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
const shopId = env.PRINTIFY_SHOP_ID;

console.log('Token detected:', token ? `${token.slice(0, 8)}...` : 'MISSING');
console.log('Shop ID detected:', shopId || 'MISSING');

if (!token || token.includes('place') || token.includes('your')) {
  console.log('\n[ACTION REQUIRED] No live Printify token configured.');
  process.exit(0);
}

async function verify() {
  const res = await fetch('https://api.printify.com/v1/shops.json', {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (res.ok) {
    const shops = await res.json();
    console.log('\n[PRINTIFY CONNECTED] HTTP 200 OK');
    shops.forEach((s: any) => console.log(`  Shop ID: ${s.id} | Name: "${s.title}"`));
  } else {
    console.log(`\n[PRINTIFY ERROR] HTTP ${res.status}:`, await res.text());
  }
}

verify().catch(console.error);