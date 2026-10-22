// Petacity — procedural city scaffolding with swap-able looks.
import * as THREE from '../vendor/three.module.js';
import { LOOKS, LOOK_BY_ID } from './looks.js';
import {
  makeUniforms, makeWorld, growCity, applyLook, applyTime,
  buildLandmarks, buildBeacons, buildPlaces, makeLamps,
  makeVehicles, makeSearchlights, makeLightPools,
  buildWater, buildBillboards, buildTrees, buildSculptures, makeWeather,
} from './scene.js';
import { FlyControls } from './controls.js';

// Colours are authored as plain sRGB and written straight out — keep THREE's
// colour management out of the way.
THREE.ColorManagement.enabled = false;

function clampInt(v, lo, hi, dflt) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
}

function clampFloat(v, lo, hi, dflt) {
  const n = parseFloat(v);
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
// Grow it with ?r=13 (or the City size slider) when we want the full skyline.
let cityRadius = clampInt(params.get('r'), 1, 15, 5);
let timeOfDay = params.get('t') !== null
  ? clampFloat(params.get('t'), 0, 24, LOOK_BY_ID[lookId].defTime)
  : LOOK_BY_ID[lookId].defTime;
let heightScale = 1;
const tune = {
  win: 1, glow: 1, fog: 1, lights: 1, traffic: 1, clouds: 1, haze: 1, sun: 1, vib: 1,
  moon: 1, moonsz: 1, moonph: 0.85,
};
let weatherMode = 0;

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
  const camera = new THREE.PerspectiveCamera(62, 1, 2, 28000);
  camera.position.set(720, 390, 880);
  camera.lookAt(0, 110, 0);

  const U = makeUniforms();
  const world = makeWorld(U);
  scene.add(world.sky);
  scene.add(world.ground);

  // everything the seed grows lives in one group so Height scale can stretch it
  const cityGroup = new THREE.Group();
  scene.add(cityGroup);

  // weather follows the camera, not the city
  const weather = makeWeather(U);
  scene.add(weather.group);

  /* ------------------------------------------------------------- city */

  let cityMesh = null;
  let landmarkGroup = null;
  let placeGroup = null;
  let beacons = null;
  let lamps = null;
  let pools = null;
  let searchlights = null;
  let vehicles = null;
  let waterGroup = null;
  let billboards = null;
  let trees = null;
  let sculptures = null;
  let city = null;

  function rebuild() {
    const grown = growCity(seed, cityRadius, world.towerMat);
    city = grown.city;
    while (cityGroup.children.length) {
      const ch = cityGroup.children.pop();
      ch.traverse?.((o) => o.geometry && o.geometry.dispose());
    }
    cityMesh = grown.mesh;
    landmarkGroup = buildLandmarks(city, U);
    placeGroup = buildPlaces(city, U);
    beacons = buildBeacons(city, world.beaconMat);
    lamps = makeLamps(city, world.lampMat);
    pools = makeLightPools(city, world.poolMat);
    searchlights = makeSearchlights(city, world.beamMat);
    vehicles = makeVehicles(city, world.trailMat);
    waterGroup = buildWater(city, world.waterMat);
    billboards = buildBillboards(city, world.billMat);
    trees = buildTrees(city);
    sculptures = buildSculptures(city, world.beaconMat, world.lampMat);
    if (trees) trees.setNature(LOOK_BY_ID[lookId]);
    cityGroup.add(cityMesh);
    cityGroup.add(landmarkGroup);
    cityGroup.add(placeGroup);
    cityGroup.add(beacons);
    cityGroup.add(lamps);
    cityGroup.add(pools);
    cityGroup.add(searchlights.group);
    cityGroup.add(vehicles.group);
    cityGroup.add(waterGroup);
    cityGroup.add(billboards);
    cityGroup.add(trees.group);
    cityGroup.add(sculptures);
    applyHeight();

    $('#stat-towers').textContent = city.towers.toLocaleString('en-US');
    $('#stat-boxes').textContent = city.count.toLocaleString('en-US');
    $('#stat-seed').textContent = String(seed);
    buildPois();
    syncURL();
  }

  function applyHeight() {
    cityGroup.scale.y = heightScale;
    if (vehicles) vehicles.update(0, tune.traffic);
  }

  /* ------------------------------------------------------------- look */

  function refreshLook() {
    const look = LOOK_BY_ID[lookId];
    applyLook(U, look, tune);
    applyTime(U, look, timeOfDay, tune);
    if (trees) trees.setNature(look);
    document.documentElement.style.setProperty('--accent', look.accent);
    $('#grain').style.opacity = look.post.grain;
    $('#scan').style.opacity = look.post.scan;
    $('#vig').style.opacity = look.post.vignette;
    document.querySelectorAll('#chips button').forEach((b) => {
      const on = b.dataset.look === lookId;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on);
    });
    $('#look-blurb').textContent = look.blurb;
    syncURL();
  }

  function syncURL() {
    const p = new URLSearchParams(location.search);
    p.set('seed', String(seed));
    p.set('look', lookId);
    p.set('r', String(cityRadius));
    p.set('t', timeOfDay.toFixed(1));
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
      timeOfDay = L.defTime; // land on the hour the look was authored for
      $('#sl-time').value = String(timeOfDay);
      refreshLook();
    };
    $('#chips').appendChild(b);
  }

  $('#b-new').onclick = () => {
    seed = 1 + Math.floor(Math.random() * 999999998);
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

  // hide / show the whole interface (H) — clean view for screenshots and flying
  const toggleUI = () => {
    const off = document.body.classList.toggle('ui-off');
    const b = $('#b-ui');
    b.textContent = off ? 'Show UI' : 'Hide UI';
    b.setAttribute('aria-pressed', String(!off));
    b.title = (off ? 'Show' : 'Hide') + ' the interface (H)';
  };
  $('#b-ui').onclick = toggleUI;
  window.addEventListener('keydown', (e) => {
    if (e.key === 'h' || e.key === 'H') {
      if (e.target && e.target.tagName === 'INPUT') return;
      toggleUI();
    }
  });

  function bindSlider(el, fn) {
    el.oninput = () => fn(parseFloat(el.value));
  }
  bindSlider($('#sl-win'), (v) => { tune.win = v; refreshLook(); });
  bindSlider($('#sl-glow'), (v) => { tune.glow = v; refreshLook(); });
  bindSlider($('#sl-fog'), (v) => { tune.fog = v; refreshLook(); });
  bindSlider($('#sl-time'), (v) => { timeOfDay = v; refreshLook(); });
  bindSlider($('#sl-radius'), (v) => { cityRadius = clampInt(v, 1, 15, cityRadius); rebuild(); });
  bindSlider($('#sl-height'), (v) => { heightScale = v; applyHeight(); });
  bindSlider($('#sl-traffic'), (v) => { tune.traffic = v; if (vehicles) vehicles.update(0, tune.traffic); });
  bindSlider($('#sl-lights'), (v) => { tune.lights = v; refreshLook(); });
  bindSlider($('#sl-clouds'), (v) => { tune.clouds = v; refreshLook(); });
  bindSlider($('#sl-haze'), (v) => { tune.haze = v; refreshLook(); });
  bindSlider($('#sl-sun'), (v) => { tune.sun = v; refreshLook(); });
  bindSlider($('#sl-vib'), (v) => { tune.vib = v; refreshLook(); });
  bindSlider($('#sl-weather'), (v) => { weatherMode = v; if (weather) weather.setMode(v); });
  bindSlider($('#sl-moon'), (v) => { tune.moon = v; refreshLook(); });
  bindSlider($('#sl-moonsz'), (v) => { tune.moonsz = v; refreshLook(); });
  bindSlider($('#sl-moonph'), (v) => { tune.moonph = v; refreshLook(); });
  $('#sl-time').value = String(timeOfDay);
  $('#sl-radius').value = String(cityRadius);

  /* -------------------------------------------------- places of interest */

  let fly = null;

  function flyToLandmark(lm) {
    const dist = Math.max(240, lm.r * 4.6);
    const away = new THREE.Vector3(camera.position.x - lm.x, 0, camera.position.z - lm.z);
    if (away.lengthSq() < 1) away.set(1, 0, 1);
    away.normalize().multiplyScalar(dist);
    fly = {
      t: 0,
      from: camera.position.clone(),
      to: new THREE.Vector3(lm.x + away.x, lm.h * 0.72 * heightScale + 26, lm.z + away.z),
      look: new THREE.Vector3(lm.x, lm.h * 0.5 * heightScale, lm.z),
    };
    flash(lm.name);
  }

  function buildPois() {
    const box = $('#pois');
    box.innerHTML = '';
    const spots = [
      ...city.landmarks,
      ...city.places.map((p) => ({ ...p, h: 42 })),
    ];
    for (const lm of spots) {
      const b = document.createElement('button');
      b.title = `${lm.kind} · fly the camera there`;
      b.innerHTML = `<i></i>${lm.name}`;
      b.onclick = () => flyToLandmark(lm);
      box.appendChild(b);
    }
  }

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
      if (fly) {
        fly.t = Math.min(1, fly.t + dt / 1.7);
        const e = fly.t < 0.5 ? 2 * fly.t * fly.t : 1 - Math.pow(-2 * fly.t + 2, 2) / 2;
        camera.position.lerpVectors(fly.from, fly.to, e);
        camera.lookAt(fly.look);
        if (fly.t >= 1 || controls.keys.size || controls._drag) {
          controls.syncFromCamera();
          fly = null;
        }
      } else {
        controls.update(dt);
      }
      if (vehicles) vehicles.update(dt, tune.traffic);
      if (searchlights) searchlights.update(dt);
      if (weather) weather.update(dt, camera.position);
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
