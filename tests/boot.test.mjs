// Boot smoke test: run src/main.js under jsdom with a fake WebGL2 context so
// startup regressions (like a broken selector killing init) show up headlessly.
// Skips when jsdom is not installed (it is a devDependency: npm install).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { LOOKS } from '../src/looks.js';

const LOOKS_EXPECTED = LOOKS.length;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const realHtml = readFileSync(join(root, 'index.html'), 'utf8')
  .replace(/<script\b[^>]*src=["']\.\/src\/main\.js["'][^>]*><\/script>/i, '');

let JSDOM = null;
try {
  ({ JSDOM } = await import('jsdom'));
} catch {
  /* not installed */
}

test('main.js boots end-to-end (jsdom + fake WebGL)', { skip: JSDOM ? false : 'jsdom not installed (npm install)' }, async () => {
  const dom = new JSDOM(realHtml, { url: 'http://localhost/?seed=42&look=tron', pretendToBeVisual: true });

  const { window } = dom;
  const defineGlobal = (key, value) => Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  defineGlobal('window', window);
  defineGlobal('document', window.document);
  defineGlobal('navigator', window.navigator);
  defineGlobal('location', window.location);
  defineGlobal('history', window.history);
  defineGlobal('requestAnimationFrame', window.requestAnimationFrame.bind(window));
  defineGlobal('cancelAnimationFrame', window.cancelAnimationFrame.bind(window));

  // fake WebGL2 good enough for renderer construction + first frame
  let constantCounter = 1000;
  const constants = new Map();
  const special = {
    getParameter(p) {
      if (p === constants.get('VERSION')) return 'WebGL 2.0 (OpenGL ES 3.0)';
      if (p === constants.get('SHADING_LANGUAGE_VERSION')) return 'WebGL GLSL ES 3.00';
      return 4096;
    },
    getShaderPrecisionFormat: () => ({ precision: 23, rangeMin: 127, rangeMax: 127 }),
    getExtension: () => null,
    getShaderInfoLog: () => '',
    getProgramInfoLog: () => '',
    getProgramParameter: (prog, pname) => {
      if (pname === constants.get('ACTIVE_UNIFORMS') || pname === constants.get('ACTIVE_ATTRIBUTES')) return 0;
      return true;
    },
    getShaderParameter: () => true,
    getError: () => 0,
    isContextLost: () => false,
    checkFramebufferStatus: () => 36053,
    getSupportedExtensions: () => [],
    drawingBufferWidth: 800,
    drawingBufferHeight: 600,
  };
  const fakeGL = () => new Proxy({}, {
    get(t, prop) {
      if (prop in special) return special[prop];
      if (typeof prop === 'string' && /^[A-Z0-9_]+$/.test(prop)) {
        if (!constants.has(prop)) constants.set(prop, constantCounter++);
        return constants.get(prop);
      }
      if (!(prop in t)) t[prop] = typeof prop === 'string' ? function () { return {}; } : undefined;
      return t[prop];
    },
  });
  window.HTMLCanvasElement.prototype.getContext = (type) => (type === 'webgl2' || type === 'webgl' ? fakeGL() : null);

  const pageErrors = [];
  window.addEventListener('error', (e) => pageErrors.push(String(e.error?.stack || e.message)));
  window.addEventListener('unhandledrejection', (e) => pageErrors.push(String(e.reason?.stack || e.reason)));

  const prev = {};
  for (const k of ['uncaughtException', 'unhandledRejection']) {
    prev[k] = process.listeners(k);
    process.removeAllListeners(k);
  }
  const uncaught = [];
  process.on('uncaughtException', (e) => uncaught.push(e));
  process.on('unhandledRejection', (e) => uncaught.push(e));

  try {
    await import('../src/main.js?boot-test');
  } finally {
    for (const k of ['uncaughtException', 'unhandledRejection']) {
      process.removeAllListeners(k);
      for (const fn of prev[k]) process.on(k, fn);
    }
  }
  await new Promise((r) => setTimeout(r, 250));

  // stop the render loop so the test process can exit
  defineGlobal('requestAnimationFrame', () => 0);
  defineGlobal('cancelAnimationFrame', () => 0);
  await new Promise((r) => setTimeout(r, 40));

  const loading = window.document.querySelector('#loading');
  assert.equal(loading.className.includes('out'), true, 'loading overlay should fade out (init completed)');
  assert.equal(loading.querySelector('.boot-error'), null, `boot error overlay should be empty, got: ${loading.textContent}`);
  assert.equal(window.document.querySelectorAll('#sel-look option').length, LOOKS_EXPECTED, 'all look dropdown options built');
  assert.ok(window.document.querySelectorAll('#sel-poi option').length >= 2, 'Places dropdown options built');
  assert.ok(window.document.querySelectorAll('#sel-preset option').length >= 6, 'Whole-config preset options built');
  assert.ok(window.document.querySelectorAll('#sel-bookmark option').length >= 3, 'Default place bookmarks built');
  assert.ok(window.document.querySelector('#stat-towers').textContent.length > 0, 'stats filled');
  assert.ok(window.document.querySelector('#stat-boxes').textContent.length > 0, 'stats filled');

  // Verify Phase-8 traffic density slider scales up to 20.0k live in the HUD
  const slTraffic = window.document.querySelector('#sl-traffic');
  slTraffic.value = '1';
  slTraffic.oninput();
  assert.equal(window.document.querySelector('#traffic-label').textContent, '20.0k', 'traffic slider reaches 20,000 vehicles');

  // Verify Phase-8 camera path recorder keyframe UI enables playback & scrubber
  const bKf = window.document.querySelector('#b-kf-add');
  bKf.click();
  bKf.click();
  assert.equal(window.document.querySelector('#b-play').disabled, false, '2 keyframes enable path playback');
  assert.equal(window.document.querySelector('#sl-scrub').disabled, false, '2 keyframes enable timeline scrubber');

  // Verify Phase-18 minimized startup (`body.ui-off`) + glyph-only buttons even after live JS toggles
  assert.equal(window.document.body.classList.contains('ui-off'), true, 'page boots minimized (body.ui-off)');
  window.document.querySelector('#b-ui').click();
  assert.equal(window.document.body.classList.contains('ui-off'), false, '#b-ui opens panel');
  window.document.querySelector('#b-fold-all').click();
  window.document.querySelector('#b-glide').click();
  window.document.querySelector('#b-collide').click();
  window.document.querySelector('#b-trans-preview').click();
  window.document.querySelector('#b-cull').click();
  for (const btn of window.document.querySelectorAll('button')) {
    const txt = (btn.textContent || '').trim();
    assert.equal(/[A-Za-z0-9]/.test(txt), false, `live button #${btn.id} stays pure glyph after JS toggle (got ${JSON.stringify(txt)})`);
  }

  // Verify Phase-21 live WebMCP SDK (`window.petacity`) controls full scene end-to-end
  assert.ok(window.petacity && window.petacity.listTools().length === 20, '20 WebMCP tools live on window.petacity');
  const fullCtrl = await window.petacity.fullState();
  assert.equal(fullCtrl.state.lookId, 'tron');
  const stepRes = await window.petacity.stepPilot({ forward: 0.5, yawDeltaDeg: 8, dt: 0.2 });
  assert.equal(stepRes.ok, true);
  const perfRes = await window.petacity.setPerformance({ qualityMode: 'low', viewCulling: true });
  assert.equal(perfRes.performance.qualityMode, 'low');
  const presetList = await window.petacity.presets({ action: 'list' });
  assert.ok(presetList.builtinPresets.length >= 6);

  assert.deepEqual(pageErrors, [], 'no page errors');
  assert.deepEqual(uncaught.map((e) => e.stack || String(e)), [], 'no uncaught exceptions');
  window.close();
});
