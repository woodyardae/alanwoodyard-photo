import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  approvedSelections,
  extractJson,
  mapFromCropEntries,
  resolveDataOutput,
} from '../scripts/pull-merch-approvals';

test('extractJson reads a KV blob and a double-encoded string', () => {
  assert.deepEqual(extractJson('{"a-dock-mono":{"1:1":{"zoom":1}}}'), {
    'a-dock-mono': { '1:1': { zoom: 1 } },
  });
  assert.deepEqual(extractJson('"{\\"id\\":\\"print-16x24\\"}"'), { id: 'print-16x24' });
  assert.equal(extractJson('not json'), null);
});

test('mapFromCropEntries keeps artwork crops and skips the modified list', () => {
  const map = mapFromCropEntries([
    { key: 'crops:_modified_list', value: '["a-dock-mono"]' },
    { key: 'crops:a-dock-mono', value: '{"2:3":{"approved_products":["print-16x24"]}}' },
    { key: 'crops:_draft', value: '{"zoom":1}' },
  ]);
  assert.deepEqual(map, {
    'a-dock-mono': { '2:3': { approved_products: ['print-16x24'] } },
  });
  assert.equal(mapFromCropEntries([{ key: 'crops:bad', value: '[]' }]), null);
});

test('approvedSelections drops rejected rows and keeps product keys', () => {
  const selections = approvedSelections({
    'a-dock-mono': {
      __rejected: true,
      '2:3': { approved_products: ['print-16x24'] },
    },
    'norderney-62': {
      'STEEL PLATE (PORTRAIT)': { crop: { zoom: 1 } },
      '1:1': { approved_products: ['GLOBAL-MUG-11oz'] },
    },
  });
  assert.deepEqual(selections, [
    {
      id: 'norderney-62',
      products: ['STEEL PLATE (PORTRAIT)', 'GLOBAL-MUG-11oz'],
      crops: {
        'STEEL PLATE (PORTRAIT)': { crop: { zoom: 1 } },
        '1:1': { approved_products: ['GLOBAL-MUG-11oz'] },
      },
    },
  ]);
  assert.equal(approvedSelections({ error: 'HTTP 500' }), null);
});

test('resolveDataOutput refuses artwork files and source masters', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pull-approvals-'));
  fs.mkdirSync(path.join(cwd, 'data'));
  assert.equal(
    resolveDataOutput('data/approved-selections.json', cwd),
    path.join(cwd, 'data', 'approved-selections.json'),
  );
  assert.throws(() => resolveDataOutput('src/content/artworks/a-dock-mono.json', cwd), /inside data/);
  assert.throws(() => resolveDataOutput('assets/source-masters/A-Dock-Mono.JPEG', cwd), /inside data/);
  assert.throws(() => resolveDataOutput('data/source-masters/a.tif', cwd), /masters or artwork/);
  assert.throws(() => resolveDataOutput('data/artwork-edits/a.json', cwd), /masters or artwork/);
});
