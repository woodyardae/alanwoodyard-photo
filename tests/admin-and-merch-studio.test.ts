import test from 'node:test';
import assert from 'node:assert/strict';
import { GET, POST } from '../src/pages/api/approve-merch';
import fs from 'node:fs';
import path from 'node:path';

const MASTER_PASSWORD = '30S!g%zlxg&gJ2is';

test('POST /api/approve-merch rejects invalid or missing authToken with HTTP 401', async () => {
  const reqNoAuth = new Request('http://localhost:4321/api/approve-merch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      artworkId: 'a-dock-mono',
      ratioKey: '1:1',
      crop: { panX: 0, panY: 0, zoom: 1 }
    })
  });
  const resNoAuth = await POST({ request: reqNoAuth, locals: {} } as any);
  assert.equal(resNoAuth.status, 401);
  const dataNoAuth = await resNoAuth.json();
  assert.match(dataNoAuth.error, /Unauthorized/);

  const reqBadAuth = new Request('http://localhost:4321/api/approve-merch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      artworkId: 'a-dock-mono',
      ratioKey: '1:1',
      crop: { panX: 0, panY: 0, zoom: 1 },
      authToken: 'wrong-pass'
    })
  });
  const resBadAuth = await POST({ request: reqBadAuth, locals: {} } as any);
  assert.equal(resBadAuth.status, 401);
});

test('POST /api/approve-merch returns 400 when missing required parameters', async () => {
  const req = new Request('http://localhost:4321/api/approve-merch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      authToken: MASTER_PASSWORD,
      artworkId: 'a-dock-mono'
      // missing ratioKey and crop
    })
  });
  const res = await POST({ request: req, locals: {} } as any);
  assert.equal(res.status, 400);
});

test('POST /api/approve-merch persists to Cloudflare KV when env.SESSION is available', async () => {
  const mockStorage = new Map<string, string>();
  const mockKv = {
    get: async (key: string) => mockStorage.get(key) || null,
    put: async (key: string, val: string) => { mockStorage.set(key, val); }
  };

  const cropData = {
    panX: 15,
    panY: -20,
    zoom: 1.45,
    approved_products: ['printify-coasters', 'gooten-tile'],
    excluded_products: ['printful-tote']
  };

  const req = new Request('http://localhost:4321/api/approve-merch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      artworkId: 'test-art-kv',
      ratioKey: '1:1',
      crop: cropData,
      authToken: MASTER_PASSWORD
    })
  });

  const locals = {
    runtime: {
      env: {
        SESSION: mockKv
      }
    }
  };

  const res = await POST({ request: req, locals } as any);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.equal(json.mode, 'cloudflare-kv');

  // Verify KV storage contents
  const storedCrop = JSON.parse(mockStorage.get('crops:test-art-kv') || '{}');
  assert.deepEqual(storedCrop['1:1'], cropData);

  const storedList = JSON.parse(mockStorage.get('crops:_modified_list') || '[]');
  assert.ok(storedList.includes('test-art-kv'));

  // Test GET retrieves crops from KV
  const getRes = await GET({ locals } as any);
  assert.equal(getRes.status, 200);
  const getJson = await getRes.json();
  assert.deepEqual(getJson['test-art-kv'], { '1:1': cropData });
});

test('POST /api/approve-merch marks item rejected and restores it cleanly in Cloudflare KV', async () => {
  const mockStorage = new Map<string, string>();
  const mockKv = {
    get: async (key: string) => mockStorage.get(key) || null,
    put: async (key: string, val: string) => { mockStorage.set(key, val); }
  };

  const locals = { runtime: { env: { SESSION: mockKv } } };

  const rejRes = await POST({
    request: new Request('http://localhost:4321/api/approve-merch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        artworkId: 'sws-retro-neon-dreams-bomber',
        store: 'sws',
        action: 'reject',
        authToken: MASTER_PASSWORD
      })
    }),
    locals
  } as any);
  assert.equal(rejRes.status, 200);
  const rejJson = await rejRes.json();
  assert.equal(rejJson.success, true);
  assert.equal(rejJson.rejected, true);
  assert.equal(JSON.parse(mockStorage.get('crops:sws-retro-neon-dreams-bomber') || '{}').__rejected, true);

  const restoreRes = await POST({
    request: new Request('http://localhost:4321/api/approve-merch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        artworkId: 'sws-retro-neon-dreams-bomber',
        store: 'sws',
        action: 'unreject',
        authToken: MASTER_PASSWORD
      })
    }),
    locals
  } as any);
  assert.equal(restoreRes.status, 200);
  const restoreJson = await restoreRes.json();
  assert.equal(restoreJson.success, true);
  assert.equal(restoreJson.rejected, false);
  assert.equal(JSON.parse(mockStorage.get('crops:sws-retro-neon-dreams-bomber') || '{}').__rejected, undefined);
});

test('POST /api/approve-merch falls back to local disk persistence when running in Node mode without KV', async () => {
  const artworkId = 'a-dock-mono';
  const filePath = path.resolve('src/content/artworks', `${artworkId}.json`);
  const originalContent = fs.readFileSync(filePath, 'utf8');

  try {
    const cropData = {
      panX: 5,
      panY: 10,
      zoom: 1.2,
      approved_products: ['printify-coasters', 'printful-tote'],
      excluded_products: []
    };

    const req = new Request('http://localhost:4321/api/approve-merch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        artworkId,
        ratioKey: '1:1',
        crop: cropData,
        authToken: MASTER_PASSWORD
      })
    });

    const res = await POST({ request: req, locals: {} } as any);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.mode, 'local-disk');

    // Verify disk content
    const updated = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.deepEqual(updated.merch_crops['1:1'], cropData);
    assert.ok(updated.merch_approved.includes('printify-coasters'));
    assert.ok(updated.merch_approved.includes('printful-tote'));
  } finally {
    // Restore original file
    fs.writeFileSync(filePath, originalContent, 'utf8');
  }
});

test('iPadOS Multi-Touch: distance, midpoint and zoom clamping engine calculation', () => {
  function getTouchDist(t1: { clientX: number; clientY: number }, t2: { clientX: number; clientY: number }) {
    return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
  }

  function getMidpoint(t1: { clientX: number; clientY: number }, t2: { clientX: number; clientY: number }) {
    return {
      x: (t1.clientX + t2.clientX) / 2,
      y: (t1.clientY + t2.clientY) / 2
    };
  }

  function clampZoom(val: number) {
    return Math.min(Math.max(val, 1.0), 3.0);
  }

  // 1. Distance calculation
  const t1 = { clientX: 100, clientY: 200 };
  const t2 = { clientX: 400, clientY: 600 };
  // 300^2 + 400^2 = 500^2
  assert.equal(getTouchDist(t1, t2), 500);

  // 2. Midpoint calculation for simultaneous pan
  const mid = getMidpoint(t1, t2);
  assert.equal(mid.x, 250);
  assert.equal(mid.y, 400);

  // 3. Pinch scale calculation
  const initialDist = 500;
  const newDist = 750;
  const initialZoom = 1.0;
  const scaledZoom = clampZoom(initialZoom * (newDist / initialDist));
  assert.equal(scaledZoom, 1.5);

  // 4. Zoom clamping bounds (1.0x to 3.0x)
  assert.equal(clampZoom(0.5), 1.0);
  assert.equal(clampZoom(4.2), 3.0);
  assert.equal(clampZoom(2.25), 2.25);
});

test('Internal admin links strictly use trailing slashes to avoid 307 redirects', () => {
  const loginAstro = fs.readFileSync('src/pages/admin/login.astro', 'utf8');
  assert.ok(loginAstro.includes('/admin/merch-studio/'));
  assert.ok(!loginAstro.includes("'/admin/merch-studio'"));

  const merchStudioAstro = fs.readFileSync('src/pages/admin/merch-studio.astro', 'utf8');
  assert.ok(merchStudioAstro.includes('/admin/syndication/'));

  const syndicationAstro = fs.readFileSync('src/pages/admin/syndication.astro', 'utf8');
  assert.ok(syndicationAstro.includes('/admin/merch-studio/'));
});
