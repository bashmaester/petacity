// Static contract between index.html and src/main.js: every element id the
// script queries must exist in the page, and vice versa for the JS-managed ids.
// Run: node --test tests/ui-contract.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const main = readFileSync(join(root, 'src', 'main.js'), 'utf8');

test('every id main.js queries exists in index.html', () => {
  const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  const queries = [...main.matchAll(/\$\('#([\w-]+)'\)/g)].map((m) => m[1]);
  assert.ok(queries.length > 5, 'expected several element queries');
  for (const id of queries) {
    assert.ok(htmlIds.has(id), `#${id} queried in main.js but missing from index.html`);
  }
});

test('every $() call uses a #-prefixed string literal (no selector typos)', () => {
  // catches bugs like $((id)) where id='sl-win' (missing '#'), which silently
  // returns null and kills startup
  const calls = [...main.matchAll(/\$\(\s*([^)]+?)\s*\)/g)].map((m) => m[1]);
  assert.ok(calls.length > 5, 'expected several $() calls');
  for (const arg of calls) {
    assert.match(arg, /^'#[\w-]+'$/, `$(${arg}) must be a '#id' string literal`);
    assert.ok(html.includes(`id="${arg.slice(2, -1)}"`), `${arg} missing from index.html`);
  }
});

test('script and stylesheet hooks line up', () => {
  assert.ok(html.includes('src="./src/main.js"'));
  // chips are built dynamically in JS
  assert.ok(main.includes("document.createElement('button')"), 'chips are created dynamically');
  // CSS hooks main.js toggles
  for (const cls of ['grain', 'scan', 'vig', 'loading', 'hint-flash', 'look-blurb', 'chips']) {
    assert.ok(html.includes(cls), `.${cls} hook missing from html`);
  }
});

test('index.html has no accidental external network dependencies', () => {
  const externals = [...html.matchAll(/(?:src|href)="(https?:)?\/\/[^"]+"/g)].map((m) => m[0]);
  assert.deepEqual(externals, [], `unexpected external resources: ${externals}`);
});
