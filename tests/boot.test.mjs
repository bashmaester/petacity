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

  // Verify Phase-22: P shortcut toggles Autopilot, M shortcut toggles Music, Music->Environment WebMCP, and localStorage state persistence
  assert.equal(window.document.querySelector('#b-glide').getAttribute('aria-pressed'), 'true', '#b-glide was turned ON earlier');
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'p', bubbles: true }));
  assert.equal(window.document.querySelector('#b-glide').getAttribute('aria-pressed'), 'false', 'pressing P toggles Autopilot OFF');
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'P', bubbles: true }));
  assert.equal(window.document.querySelector('#b-glide').getAttribute('aria-pressed'), 'true', 'pressing P again toggles Autopilot back ON');
  const radioBeforeM = window.document.querySelector('#b-radio').getAttribute('aria-pressed');
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'm', bubbles: true }));
  assert.notEqual(
    window.document.querySelector('#b-radio').getAttribute('aria-pressed'),
    radioBeforeM,
    'pressing M toggles Music (#b-radio)',
  );
  const musicRes = await window.petacity.music({
    station: 10,
    syncPreset: 'all',
    syncStrength: 1.1,
  });
  assert.equal(musicRes.stationIndex, 10, 'switched to station #10 via WebMCP');
  assert.equal(musicRes.worldSync.syncPreset, 'all', 'Music->Environment syncPreset enabled via WebMCP');
  assert.equal(musicRes.worldSync.syncTraffic, true);

  // Verify Phase-23: Shift+Left/Right switches previous/next track, Shift+Up/Down steps speed by 0.1 and by 0.01 in 0..0.1
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }));
  assert.equal(window.document.querySelector('#sel-radio-station').value, '11', 'Shift+Right advances to next track (#11)');
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, bubbles: true }));
  assert.equal(window.document.querySelector('#sel-radio-station').value, '10', 'Shift+Left returns to previous track (#10)');

  await window.petacity.callTool('petacity_set_camera_pose', { camSpeed: 0.2 });
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true }));
  assert.equal(window.document.querySelector('#camspeed-label').textContent, '0.10\u00D7', 'Shift+Down steps 0.20x -> 0.10x (0.1 step)');
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true }));
  assert.equal(window.document.querySelector('#camspeed-label').textContent, '0.09\u00D7', 'Shift+Down inside 0..0.1 steps 0.10x -> 0.09x (0.01 step)');
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true, bubbles: true }));
  assert.equal(window.document.querySelector('#camspeed-label').textContent, '0.10\u00D7', 'Shift+Up inside 0..0.1 steps 0.09x -> 0.10x (0.01 step)');
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true, bubbles: true }));
  assert.equal(window.document.querySelector('#camspeed-label').textContent, '0.20\u00D7', 'Shift+Up above 0.1 steps 0.10x -> 0.20x (0.1 step)');

  const savedTok = window.localStorage.getItem('petacity.lastState.v1');
  assert.ok(savedTok && savedTok.length > 8, 'starting state persisted into localStorage (petacity.lastState.v1)');

  assert.deepEqual(pageErrors, [], 'no page errors');
  assert.deepEqual(uncaught.map((e) => e.stack || String(e)), [], 'no uncaught exceptions');
  window.close();

  // Boot a second clean-URL session (`http://localhost/`, no query or hash) with `petacity.lastState.v1` in localStorage
  const dom2 = new JSDOM(realHtml, { url: 'http://localhost/', pretendToBeVisual: true });
  const win2 = dom2.window;
  win2.localStorage.setItem('petacity.lastState.v1', savedTok);
  defineGlobal('window', win2);
  defineGlobal('document', win2.document);
  defineGlobal('navigator', win2.navigator);
  defineGlobal('location', win2.location);
  defineGlobal('history', win2.history);
  defineGlobal('requestAnimationFrame', win2.requestAnimationFrame.bind(win2));
  defineGlobal('cancelAnimationFrame', win2.cancelAnimationFrame.bind(win2));
  win2.HTMLCanvasElement.prototype.getContext = (type) => (type === 'webgl2' || type === 'webgl' ? fakeGL() : null);

  await import('../src/main.js?boot-localstorage-restore');
  await new Promise((r) => setTimeout(r, 150));
  defineGlobal('requestAnimationFrame', () => 0);
  defineGlobal('cancelAnimationFrame', () => 0);
  await new Promise((r) => setTimeout(r, 30));

  const restored = await win2.petacity.fullState();
  assert.equal(restored.state.seed, 42, 'clean URL restores seed from localStorage');
  assert.equal(restored.state.lookId, 'tron', 'clean URL restores lookId from localStorage');
  assert.equal(restored.state.glide, true, 'clean URL restores Autopilot state from localStorage');
  assert.equal(restored.state.radio.station, 10, 'clean URL restores music station from localStorage');
  assert.equal(restored.state.radio.syncPreset, 'all', 'clean URL restores Music->Environment sync from localStorage');
  assert.equal(win2.location.search, '', 'clean URL stays clean so future reloads continue loading localStorage');
  win2.close();
});
