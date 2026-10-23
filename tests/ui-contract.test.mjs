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
  // dropdown options for looks, presets, places & bookmarks are built dynamically in JS
  assert.ok(main.includes("document.createElement('option')"), 'dropdown options are created dynamically');
  // CSS & DOM hooks main.js toggles
  for (const cls of ['grain', 'scan', 'vig', 'loading', 'hint-flash', 'look-blurb', 'sel-look', 'sel-poi', 'sel-preset', 'sel-bookmark', 'export-box']) {
    assert.ok(html.includes(cls), `${cls} hook missing from html`);
  }
});

test('index.html has no accidental external network dependencies', () => {
  const externals = [...html.matchAll(/(?:src|href)="(https?:)?\/\/[^"]+"/g)].map((m) => m[0]);
  assert.deepEqual(externals, [], `unexpected external resources: ${externals}`);
});

test('the interface is toggleable', () => {
  assert.ok(html.includes('id="b-ui"'), 'toggle button exists');
  assert.ok(main.includes("classList.toggle('ui-off')"), 'main.js toggles the ui-off class');
  assert.ok(html.includes('body.ui-off'), 'css hides chrome under body.ui-off');
  assert.ok(main.includes("e.key === 'h'"), 'H key shortcut wired');
});

test('glide mode and collision detection toggles are wired', () => {
  assert.ok(html.includes('id="b-glide"'), 'glide button exists');
  assert.ok(html.includes('id="b-collide"'), 'collision button exists');
  assert.ok(main.includes("e.key === 'g'"), 'G key shortcut wired');
  assert.ok(main.includes("e.key === 'c'"), 'C key shortcut wired');
});

test('custom palette, StormyClouds weather styles, dust motes & post-processing UI controls exist', () => {
  for (const id of [
    'custom-box', 'cp-zen', 'cp-hor', 'cp-base', 'cp-win', 'cp-accent', 'cp-sec', 'cp-style', 'cp-mono', 'b-seed-pal',
    'sel-cloudstyle', 'sl-dust', 'weather-label',
    'sl-bloom', 'sl-lens', 'sl-contrast', 'sl-temp', 'sl-film',
  ]) {
    assert.ok(html.includes(`id="${id}"`), `#${id} present in index.html`);
  }
});

test('UI toggle sits in top corner of panel, #keys avoids panel overlap, and glyph buttons carry aria-labels', () => {
  const panelMatch = html.match(/<aside class="panel">([\s\S]*?)<\/aside>/);
  assert.ok(panelMatch, 'panel aside exists');
  assert.ok(panelMatch[1].includes('id="b-ui"'), '#b-ui lives inside .panel');
  assert.ok(panelMatch[1].includes('class="panel-head"'), 'panel header row exists');

  const keysRule = html.match(/^#keys\s*\{([\s\S]*?)\}/m);
  assert.ok(keysRule, '#keys CSS rule exists');
  assert.match(keysRule[1], /right:\s*18px/, '#keys anchored on right so it never overlaps .panel');
  assert.match(keysRule[1], /left:\s*auto/, '#keys clears left offset');

  for (const id of [
    'b-ui', 'b-glide', 'b-collide', 'b-export',
    'b-new', 'b-link', 'b-seed-pal',
    'b-preset-save', 'b-preset-del', 'b-poi-go', 'b-bm-go', 'b-bm-add', 'b-bm-del',
    'b-snap', 'b-vid', 'b-path-render', 'b-rec', 'b-kf-add', 'b-play', 'b-loop', 'b-path-exp', 'b-path-clear',
    'b-time-play',
  ]) {
    const tag = html.match(new RegExp(`<button[^>]*id="${id}"[^>]*>`));
    assert.ok(tag, `button #${id} found`);
    assert.match(tag[0], /aria-label="[^"]+"/, `#${id} has aria-label`);
    assert.match(tag[0], /title="[^"]+"/, `#${id} has hover title`);
  }
});

test('Phase-7 dropdowns, whole-config presets, place bookmarks, curvature, suburbs & exact-state export exist', () => {
  for (const id of [
    'sel-look', 'sel-poi', 'b-poi-go',
    'sel-preset', 'b-preset-save', 'b-preset-del', 'preset-save-row', 'preset-name', 'b-preset-ok',
    'sel-bookmark', 'b-bm-go', 'b-bm-add', 'b-bm-del', 'bm-save-row', 'bm-name', 'b-bm-ok',
    'b-export', 'export-box', 'export-text', 'b-copy-exact', 'b-dl-json', 'b-apply-state',
    'sl-curve', 'curve-label', 'sl-suburbs',
  ]) {
    assert.ok(html.includes(`id="${id}"`), `#${id} present in index.html`);
  }
  assert.match(html, /<select[^>]*id="sel-look"/, 'Looks is a <select> dropdown');
  assert.match(html, /<select[^>]*id="sel-poi"/, 'Places is a <select> dropdown');
  assert.match(html, /<select[^>]*id="sel-preset"/, 'Whole-config Presets is a <select> dropdown');
  assert.match(html, /<select[^>]*id="sel-bookmark"/, 'Bookmarks has its own <select> dropdown');
});

test('Phase-8 scene render export, camera path recorder & multi-strata traffic controls exist', () => {
  for (const id of [
    'traffic-label', 'sel-res', 'b-snap', 'b-vid', 'b-path-render',
    'b-rec', 'b-kf-add', 'b-play', 'b-loop', 'b-path-exp', 'b-path-clear',
    'sl-scrub', 'path-label',
  ]) {
    assert.ok(html.includes(`id="${id}"`), `#${id} present in index.html`);
  }
  assert.match(html, /<select[^>]*id="sel-res"/, 'Render resolution selector is a <select> dropdown');
});

test('Phase-9 cloud types, extended cloud cover, complete moon phase readout & live 24h time-cycle controls exist', () => {
  for (const id of ['sel-cloudtype', 'b-time-play', 'time-label', 'moon-label']) {
    assert.ok(html.includes(`id="${id}"`), `#${id} present in index.html`);
  }
  assert.match(html, /<select[^>]*id="sel-cloudtype"/, 'Cloud formation type is a <select> dropdown');
  assert.match(html, /id="sl-clouds"[^>]*max="2\.4"/, 'Cloud cover slider extends up to 2.4 overcast');
  assert.match(html, /id="sl-moonph"[^>]*max="2"/, 'Moon phase slider spans full 0..2 synodic cycle');
});


