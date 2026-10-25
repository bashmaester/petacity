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
    'b-ui', 'b-glide', 'b-avoid', 'b-collide', 'b-export',
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

test('Phase-10 landscape, park tree modes, anticipatory steering & artistic/X-ray render style controls exist', () => {
  for (const id of [
    'b-avoid', 'sel-water', 'sel-terrain', 'sl-relief', 'sel-trees', 'sel-art', 'sl-artstr',
  ]) {
    assert.ok(html.includes(`id="${id}"`), `#${id} present in index.html`);
  }
  assert.match(html, /<select[^>]*id="sel-water"/, 'Water mode selector is a <select> dropdown');
  assert.match(html, /<select[^>]*id="sel-terrain"/, 'Terrain mode selector is a <select> dropdown');
  assert.match(html, /<select[^>]*id="sel-trees"/, 'Park tree mode selector is a <select> dropdown');
  assert.match(html, /<select[^>]*id="sel-art"/, 'Artistic & X-Ray render style selector is a <select> dropdown');
  assert.ok(main.includes("e.key === 'v'"), 'V key shortcut wired for anticipatory obstacle avoidance');
});

test('Phase-12 collapsible subpanels, water/cloud/signage/glyph subpanels & feature amount dials exist', () => {
  const subpanelMatches = html.match(/<details\s+class="subpanel"/g) || [];
  assert.ok(subpanelMatches.length >= 8, `expected >=8 minimizable <details class="subpanel"> sections, got ${subpanelMatches.length}`);
  for (const id of [
    'b-fold-all', 'sl-tint', 'tint-label',
    'sl-water-amt', 'water-amt-label', 'sl-shoredist', 'shoredist-label',
    'sl-cloud-seed', 'sl-cloud-evol', 'sl-cloud-lac', 'cloud-label', 'cloud-lac-label',
    'sl-transit', 'transit-label', 'sl-maritime', 'maritime-label', 'sl-air', 'air-label',
    'sl-signs', 'signs-label', 'sl-megawrap', 'megawrap-label', 'sel-glyph', 'sl-sign-anim', 'sign-anim-label',
    'sl-veg-cover', 'veg-cover-label', 'sl-veg-scale', 'veg-scale-label',
  ]) {
    assert.ok(html.includes(`id="${id}"`), `#${id} present in index.html`);
  }
  assert.match(html, /id="sl-clouds"[^>]*min="0"/, 'Cloud cover slider reaches 0 (completely clear sky)');
  assert.match(html, /id="sl-veg-scale"[^>]*max="4\.5"/, 'Vegetation scale slider reaches 4.5x for giant supertrees');
  assert.match(html, /<select[^>]*id="sel-glyph"/, 'Synthetic glyph script selector is a <select> dropdown');
});

test('Phase-13 camera collider/freelook, interactive minimap, path smoothing, dedicated lights section, cloud range & speed controls exist', () => {
  for (const id of [
    'b-freelook', 'minimap-wrap', 'minimap', 'minimap-label', 'b-minimap-zoom',
    'sel-camstyle', 'sl-camspeed', 'camspeed-label', 'sl-camrad', 'camrad-label', 'sl-camsmooth', 'camsmooth-label',
    'sl-pathsmooth', 'pathsmooth-label', 'b-pathsmooth',
    'sl-searchlights', 'searchlights-label', 'sl-trafflights', 'trafflights-label', 'sl-vehlights', 'vehlights-label', 'lights-label',
    'sl-cloudelev', 'cloudelev-label', 'sl-cloudrange', 'cloudrange-label',
    'sl-traffspeed', 'traffspeed-label', 'sl-dayspeed', 'dayspeed-label',
  ]) {
    assert.ok(html.includes(`id="${id}"`), `#${id} present in index.html`);
  }
  assert.match(html, /<summary>Lights, Searchlights &amp; Signals<\/summary>/, 'Dedicated Lights subpanel exists');
  assert.match(html, /<canvas[^>]*id="minimap"/, 'Interactive minimap canvas exists');
  assert.match(html, /id="sl-camrad"[^>]*min="0\.5"[^>]*value="2\.2"/, 'Camera collider defaults small (2.2m) and adjusts down to 0.5m');
  assert.ok(main.includes("e.key === 'l'"), 'L key shortcut wired for separate free look-around mode');
});

test('Phase-14 water shader controls, selectable cloud elevation layers, light number/density & pure-code modular synth radio exist with zero audio sample files', () => {
  for (const id of [
    'sl-water-scale', 'water-scale-label',
    'sl-water-chop', 'water-chop-label',
    'sl-water-foam', 'water-foam-label',
    'sl-water-refl', 'water-refl-label',
    'sl-water-contrast', 'water-contrast-label',
    'sl-water-warp', 'water-warp-label',
    'sel-cloud-layers', 'sel-cloud-edit',
    'sl-clayer-dens', 'clayer-dens-label',
    'sl-clayer-elev', 'clayer-elev-label',
    'sl-clayer-thick', 'clayer-thick-label',
    'win-density-label', 'glow-label',
    'sl-search-count', 'search-count-label',
    'sl-lamp-density', 'lamp-density-label',
    'sl-sig-density', 'sig-density-label',
    'b-radio', 'radio-viz', 'radio-status', 'sel-radio-station',
    'b-radio-play', 'b-radio-next', 'b-radio-seed',
    'sl-radio-vol', 'radio-vol-label',
    'sl-radio-space', 'radio-space-label',
    'sl-radio-warmth', 'radio-warmth-label',
    'sl-radio-pulse', 'radio-pulse-label',
    'sl-radio-react', 'radio-react-label',
  ]) {
    assert.ok(html.includes(`id="${id}"`), `#${id} present in index.html`);
  }
  assert.match(html, /<summary>Modular Synth Radio<\/summary>/, 'Modular Synth Radio subpanel exists');
  assert.ok(main.includes("e.key === 'm'"), 'M key shortcut wired for Modular Synth Radio');
  const audioSrc = readFileSync(new URL('../src/audio.js', import.meta.url), 'utf8');
  assert.equal(/\.(mp3|wav|ogg|flac|m4a|aac)\b/i.test(audioSrc), false, 'audio.js uses 100% pure-code synthesis with zero audio sample files');
  assert.equal(/fetch\(|Audio\(|decodeAudioData/i.test(audioSrc), false, 'audio.js never fetches or decodes external audio samples');
});

test('Phase-15 UI contract: high-frequency water shaders, turn damping, POI auto-look, wind cloud orientation, original radio titles & WebMCP hooks', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const audioSrc = readFileSync(new URL('../src/audio.js', import.meta.url), 'utf8');

  for (const id of [
    'sel-watershader',
    'sl-turnsmooth', 'turnsmooth-label',
    'b-autolook',
    'sl-windang', 'windang-label',
    'sl-windstr', 'windstr-label',
  ]) {
    assert.ok(html.includes(`id="${id}"`), `#${id} present in index.html`);
  }

  // Zero real artist / album / synth brand names in index.html or audio.js
  for (const [label, txt] of [['index.html', html], ['src/audio.js', audioSrc]]) {
    assert.equal(/vangelis|aphex twin|tyrell 2019|selected ambient works|polygon window|cs-80|albedo 0\.39/i.test(txt), false, `${label} is free of real artist/album/synth references`);
  }

  assert.ok(main.includes('registerPetacityWebMCP'), 'main.js registers WebMCP movie-set tools');
  assert.ok(main.includes('MovieSetDirector'), 'main.js wires MovieSetDirector');
});

test('Phase-16 UI contract: camera optics, wide-angle, 360 projections, Dutch roll, anamorphic, tilt-shift & extreme angle presets', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const id of [
    'sel-lens-mode',
    'sel-angle-preset',
    'b-angle-apply',
    'b-opt-reset',
    'sl-cam-fov', 'cam-fov-label',
    'sl-lens-distort', 'lens-distort-label',
    'sl-lens-zoom', 'lens-zoom-label',
    'sl-cam-roll', 'cam-roll-label',
    'sl-anamorphic', 'anamorphic-label',
    'sl-tilt-shift', 'tilt-shift-label',
  ]) {
    assert.ok(html.includes(`id="${id}"`), `#${id} present in index.html`);
  }
  assert.match(html, /id="sl-cam-fov"[^>]*min="15"[^>]*max="150"/, 'FOV slider spans 15 deg telephoto to 150 deg hyper-wide');
  assert.match(html, /id="sl-cam-roll"[^>]*min="-180"[^>]*max="180"/, 'Roll slider spans -180 to +180 deg');

  // Top header simplified: no Petacity brand heading, only 5 buttons (Autopilot, Music, Collapse, Share, Minimize)
  assert.equal(/class="brand"/.test(html), false, 'Petacity brand heading removed from top header');
  const headMatch = html.match(/<div class="panel-head">([\s\S]*?)<\/div>\s*<div class="panel-body">/);
  assert.ok(headMatch, '.panel-head found');
  const headBtnIds = [...headMatch[1].matchAll(/<button[^>]*id="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(
    headBtnIds,
    ['b-glide', 'b-radio', 'b-fold-all', 'b-export', 'b-ui'],
    'top header keeps only Autopilot, Music, Collapse, Share & Minimize',
  );

  // Camera collider, moved camera toggles & camera optics live together in one combined subpanel
  const combinedMatch = html.match(/<details class="subpanel"[^>]*>\s*<summary>Camera, Collider, Optics &amp; Minimap<\/summary>([\s\S]*?)<\/details>/);
  assert.ok(combinedMatch, 'combined Camera, Collider, Optics & Minimap subpanel exists');
  for (const id of ['b-autolook', 'b-freelook', 'b-avoid', 'b-collide', 'sl-camrad', 'sel-lens-mode', 'sl-cam-fov', 'sl-cam-roll']) {
    assert.ok(combinedMatch[1].includes(`id="${id}"`), `#${id} lives inside the combined Camera, Collider, Optics & Minimap subpanel`);
  }
});






