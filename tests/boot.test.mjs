// Boot smoke test: run src/main.js under jsdom with a fake WebGL2 context so
// startup regressions (like a broken selector killing init) show up headlessly.
// Skips when jsdom is not installed (it is a devDependency: npm install).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOOKS } from '../src/looks.js';

const LOOKS_EXPECTED = LOOKS.length;

let JSDOM = null;
try {
  ({ JSDOM } = await import('jsdom'));
} catch {
  /* not installed */
}

test('main.js boots end-to-end (jsdom + fake WebGL)', { skip: JSDOM ? false : 'jsdom not installed (npm install)' }, async () => {
  const dom = new JSDOM(`<!doctype html><html><body>
    <canvas id="stage"></canvas>
    <div id="vig"></div><div id="grain"></div><div id="scan"></div>
    <div id="chips"></div><p id="look-blurb"></p>
    <input id="sl-win" type="range"><input id="sl-glow" type="range"><input id="sl-fog" type="range">
    <input id="sl-time" type="range"><input id="sl-radius" type="range"><input id="sl-height" type="range">
    <input id="sl-traffic" type="range"><input id="sl-lights" type="range">
    <input id="sl-clouds" type="range"><input id="sl-haze" type="range">
    <input id="sl-sun" type="range"><input id="sl-vib" type="range">
    <input id="sl-weather" type="range"><input id="sl-moon" type="range">
    <input id="sl-moonsz" type="range"><input id="sl-moonph" type="range">
    <div id="pois"></div>
    <input id="seed-input" type="number">
    <button id="b-new"></button><button id="b-link"></button><button id="b-ui"></button>
    <b id="stat-seed"></b><b id="stat-towers"></b><b id="stat-boxes"></b>
    <div id="hint-flash"></div><div id="loading">Growing the city…</div>
    </body></html>`, { url: 'http://localhost/?seed=42&look=tron', pretendToBeVisual: true });

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
  assert.equal(window.document.querySelectorAll('#chips button').length, LOOKS_EXPECTED, 'all look chips built');
  assert.ok(window.document.querySelectorAll('#pois button').length >= 1, 'POI buttons built');
  assert.ok(window.document.querySelector('#stat-towers').textContent.length > 0, 'stats filled');
  assert.ok(window.document.querySelector('#stat-boxes').textContent.length > 0, 'stats filled');
  assert.deepEqual(pageErrors, [], 'no page errors');
  assert.deepEqual(uncaught.map((e) => e.stack || String(e)), [], 'no uncaught exceptions');
  window.close();
});
