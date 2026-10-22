// Petacity — procedural city scaffolding with swap-able looks.
import * as THREE from '../vendor/three.module.js';
import { LOOKS, LOOK_BY_ID } from './looks.js';
import { makeUniforms, makeWorld, growCity, applyLook } from './scene.js';
import { FlyControls } from './controls.js';

// Colours are authored as plain sRGB and written straight out — keep THREE's
// colour management out of the way.
THREE.ColorManagement.enabled = false;

function clampInt(v, lo, hi, dflt) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
}

const $ = (sel) => {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`missing element for selector: ${sel}`);
  return el;
};

/* ------------------------------------------------- visible error report */

function fatal(err) {
  console.error(err);
  const el = document.querySelector('#loading');
  if (!el) return;
  el.classList.remove('out');
  el.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'boot-error';
  box.innerHTML = '<b>Something broke while starting the city</b><small>the full error is below — reload to try again</small><pre></pre>';
  box.querySelector('pre').textContent = String((err && (err.stack || err.message)) || err);
  el.appendChild(box);
}
window.addEventListener('error', (e) => fatal(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => fatal(e.reason));

const params = new URLSearchParams(location.search);
let seed = clampInt(params.get('seed'), 1, 999999999, 4417);
let lookId = LOOK_BY_ID[params.get('look')] ? params.get('look') : 'bladerunner';
// Deliberately small by default so the app stays fast while we test and debug.
// Grow it with ?r=13 (or edit CITY_RADIUS) when we want the full skyline.
let cityRadius = clampInt(params.get('r'), 1, 15, 5);
const tune = { win: 1, glow: 1, fog: 1 };

function createRenderer(canvas) {
  try {
    return new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (e1) {
    try {
      // some environments reject the preferred attributes but still give a context
      return new THREE.WebGLRenderer({ canvas });
    } catch (e2) {
      throw new Error('Could not create a WebGL context — this preview needs WebGL 2. ' + ((e2 && e2.message) || ''));
    }
  }
}

/* --------------------------------------------------------------- boot */

function boot() {
  const canvas = $('#stage');
  const renderer = createRenderer(canvas);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 2, 22000);
  camera.position.set(720, 390, 880);
  camera.lookAt(0, 110, 0);

  const U = makeUniforms();
  const world = makeWorld(U);
  scene.add(world.sky);
  scene.add(world.ground);

  /* ------------------------------------------------------------- city */

  let cityMesh = null;

  function rebuild() {
    const { city, mesh } = growCity(seed, cityRadius, world.towerMat);
    if (cityMesh) {
      scene.remove(cityMesh);
      cityMesh.geometry.dispose();
    }
    cityMesh = mesh;
    scene.add(cityMesh);

    $('#stat-towers').textContent = city.towers.toLocaleString('en-US');
    $('#stat-boxes').textContent = city.count.toLocaleString('en-US');
    $('#stat-seed').textContent = String(seed);
    syncURL();
  }

  /* ------------------------------------------------------------- look */

  function refreshLook() {
    const ui = applyLook(U, LOOK_BY_ID[lookId], tune);
    document.documentElement.style.setProperty('--accent', ui.accent);
    $('#grain').style.opacity = ui.post.grain;
    $('#scan').style.opacity = ui.post.scan;
    $('#vig').style.opacity = ui.post.vignette;
    document.querySelectorAll('#chips button').forEach((b) => {
      const on = b.dataset.look === lookId;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on);
    });
    $('#look-blurb').textContent = LOOK_BY_ID[lookId].blurb;
    syncURL();
  }

  function syncURL() {
    const p = new URLSearchParams(location.search);
    p.set('seed', String(seed));
    p.set('look', lookId);
    p.set('r', String(cityRadius));
    history.replaceState(null, '', `${location.pathname}?${p}`);
  }

  /* --------------------------------------------------------------- UI */

  for (const L of LOOKS) {
    const b = document.createElement('button');
    b.dataset.look = L.id;
    b.title = L.blurb;
    b.innerHTML = `<i></i>${L.label}`;
    b.querySelector('i').style.background = L.accent;
    b.onclick = () => {
      lookId = L.id;
      refreshLook();
    };
    $('#chips').appendChild(b);
  }

  $('#b-new').onclick = () => {
    seed = 1 + Math.floor(Math.random() * 999998);
    $('#seed-input').value = String(seed);
    rebuild();
  };
  $('#seed-input').value = String(seed);
  $('#seed-input').onchange = (ev) => {
    seed = clampInt(ev.target.value, 1, 999999999, seed);
    ev.target.value = String(seed);
    rebuild();
  };
  $('#b-link').onclick = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      flash('Link copied');
    } catch {
      flash(location.href);
    }
  };

  function bindSlider(el, key) {
    el.oninput = () => {
      tune[key] = parseFloat(el.value);
      refreshLook();
    };
  }
  bindSlider($('#sl-win'), 'win');
  bindSlider($('#sl-glow'), 'glow');
  bindSlider($('#sl-fog'), 'fog');

  function flash(msg) {
    const el = $('#hint-flash');
    el.textContent = msg;
    el.classList.add('on');
    clearTimeout(flash._t);
    flash._t = setTimeout(() => el.classList.remove('on'), 1600);
  }

  /* ------------------------------------------------------------- loop */

  const controls = new FlyControls(camera, canvas);

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  const clock = new THREE.Clock();
  function animate() {
    try {
      const dt = Math.min(clock.getDelta(), 0.05);
      U.uTime.value += dt;
      controls.update(dt);
      world.sky.position.copy(camera.position);
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    } catch (err) {
      fatal(err);
    }
  }

  rebuild();
  refreshLook();
  $('#loading').classList.add('out');
  animate();
}

try {
  boot();
} catch (err) {
  fatal(err);
}
