// Petacity — procedural city scaffolding with swap-able looks.
import * as THREE from '../vendor/three.module.js';
import { LOOKS, LOOK_BY_ID, DEFAULT_CUSTOM, syncCustomLook } from './looks.js';
import { CELL } from './city.js';
import {
  makeUniforms, makeWorld, growCity, applyLook, applyTime,
  buildLandmarks, buildBeacons, buildPlaces, makeLamps,
  makeVehicles, makeSearchlights, makeLightPools,
  buildWater, buildBoulevards, buildBillboards, buildTrees, buildSculptures,
  makeWeather, WEATHER_NAMES, buildSigns, buildHolos,
} from './scene.js';
import { makePostProcessor } from './post.js';
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
if (params.get('pal')) {
  const parts = params.get('pal').split(',');
  if (parts.length >= 6) {
    const normHex = (s, fb) => (/^[0-9a-fA-F]{6}$/.test(s) ? `#${s}` : fb);
    syncCustomLook({
      zen: normHex(parts[0], DEFAULT_CUSTOM.zen),
      hor: normHex(parts[1], DEFAULT_CUSTOM.hor),
      base: normHex(parts[2], DEFAULT_CUSTOM.base),
      win: normHex(parts[3], DEFAULT_CUSTOM.win),
      accent: normHex(parts[4], DEFAULT_CUSTOM.accent),
      sec: normHex(parts[5], DEFAULT_CUSTOM.sec),
      style: ['lit', 'toon', 'flat'].includes(parts[6]) ? parts[6] : 'lit',
      mono: parts[7] === '1',
    });
  }
}

let seed = clampInt(params.get('seed'), 1, 999999999, 4417);
let lookId = LOOK_BY_ID[params.get('look')] ? params.get('look') : 'bladerunner';
let prevPresetId = lookId === 'custom' ? 'bladerunner' : lookId;
// Deliberately small by default so the app stays fast while we test and debug.
// Grow it with ?r=13 (or the City size slider) when we want the full skyline.
let cityRadius = clampInt(params.get('r'), 1, 15, 5);
let timeOfDay = params.get('t') !== null
  ? clampFloat(params.get('t'), 0, 24, LOOK_BY_ID[lookId].defTime)
  : LOOK_BY_ID[lookId].defTime;
let heightScale = 1;
const tune = {
  win: 1, glow: 1, fog: 1, lights: 1, traffic: 1,
  clouds: 1, cloudStyle: clampInt(params.get('cs'), 0, 6, 0),
  haze: 1, sun: 1, vib: 1,
  moon: 1, moonsz: 1, moonph: 0.85,
};
let weatherMode = clampInt(params.get('w'), 0, 6, 0);
let dustLevel = 0.6;
const initGrade = LOOK_BY_ID[lookId].grade || { bloom: 0.85, lens: 0.45, contrast: 1.06, temp: 0, film: 0.16 };
const postState = {
  bloom: initGrade.bloom,
  lens: initGrade.lens,
  contrast: initGrade.contrast,
  temp: initGrade.temp,
  film: initGrade.film,
};

function createRenderer(canvas) {
  try {
    return new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (e1) {
    try {
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
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(dpr);
  const post = makePostProcessor(renderer);
  if (renderer.debug) {
    renderer.debug.onShaderError = (gl, program, vs, fs) => {
      const fsSrc = (fs && gl.getShaderSource && gl.getShaderSource(fs)) || '';
      const info = [
        gl.getProgramInfoLog && gl.getProgramInfoLog(program),
        vs && gl.getShaderInfoLog && gl.getShaderInfoLog(vs),
        fs && gl.getShaderInfoLog && gl.getShaderInfoLog(fs),
      ].filter((s) => s && s.trim()).join('\n');
      if (fsSrc.includes('petacity-post-pass')) {
        console.warn('Post-processor shader failed to compile; falling back to direct render:\n' + info);
        post.setBypass(true);
      } else {
        fatal(new Error('WebGL shader failed to compile:\n' + (info || 'unknown shader error')));
      }
    };
  }

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

  // weather & 3D ambient dust motes follow the camera
  const weather = makeWeather(U);
  weather.setDust(dustLevel);
  weather.setMode(weatherMode);
  scene.add(weather.group);

  const controls = new FlyControls(camera, canvas);

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
  let boulevardGroup = null;
  let billboards = null;
  let signGroup = null;
  let holoGroup = null;
  let trees = null;
  let sculptures = null;
  let city = null;
  let cityCollider = null;
  let glideOn = false;
  let collideOn = true;

  function rebuild() {
    const grown = growCity(seed, cityRadius, world.towerMat);
    city = grown.city;
    cityCollider = grown.collider;
    U.uCitySpan.value = city.radius * CELL;
    controls.collider = cityCollider;
    controls.collision = collideOn;
    controls.heightScale = heightScale;
    while (cityGroup.children.length) {
      const ch = cityGroup.children.pop();
      ch.traverse?.((o) => o.geometry && o.geometry.dispose());
    }
    const look = LOOK_BY_ID[lookId];
    cityMesh = grown.mesh;
    landmarkGroup = buildLandmarks(city, U);
    placeGroup = buildPlaces(city, U);
    beacons = buildBeacons(city, world.beaconMat);
    lamps = makeLamps(city, world.lampMat);
    pools = makeLightPools(city, world.poolMat);
    searchlights = makeSearchlights(city, world.beamMat);
    vehicles = makeVehicles(city, world.trailMat, 260, cityCollider);
    vehicles.setCollision(collideOn);
    vehicles.setPalette(look);
    waterGroup = buildWater(city, world.waterMat);
    boulevardGroup = buildBoulevards(city, U);
    billboards = buildBillboards(city, world.billMat);
    signGroup = buildSigns(city, world.billMat);
    holoGroup = buildHolos(city, world.holoMat, world.beamMat);
    trees = buildTrees(city);
    sculptures = buildSculptures(city, world.beaconMat, world.lampMat);
    trees.setNature(look);
    weather.setTint(look);
    if (boulevardGroup && boulevardGroup.userData.lineMat) {
      boulevardGroup.userData.lineMat.color.set(look.ground.line);
    }
    cityGroup.add(cityMesh);
    cityGroup.add(landmarkGroup);
    cityGroup.add(placeGroup);
    cityGroup.add(beacons);
    cityGroup.add(lamps);
    cityGroup.add(pools);
    cityGroup.add(searchlights.group);
    cityGroup.add(vehicles.group);
    cityGroup.add(waterGroup);
    cityGroup.add(boulevardGroup);
    cityGroup.add(billboards);
    cityGroup.add(signGroup);
    cityGroup.add(holoGroup);
    cityGroup.add(trees.group);
    cityGroup.add(sculptures);
    applyHeight();

    $('#stat-towers').textContent = city.towers.toLocaleString('en-US');
    $('#stat-boxes').textContent = city.count.toLocaleString('en-US');
    $('#stat-seed').textContent = String(seed);
    buildPois();
    syncGlideNode();
    syncURL();
  }

  function applyHeight() {
    cityGroup.scale.y = heightScale;
    controls.heightScale = heightScale;
    syncGlideNode();
    if (vehicles) vehicles.update(0, tune.traffic);
  }

  /* ------------------------------------------------------------- look */

  function syncPostSliders() {
    $('#sl-bloom').value = String(postState.bloom);
    $('#sl-lens').value = String(postState.lens);
    $('#sl-contrast').value = String(postState.contrast);
    $('#sl-temp').value = String(postState.temp);
    $('#sl-film').value = String(postState.film);
  }

  function syncPostUniforms(look) {
    const filmActive = weatherMode === 6 ? Math.max(postState.film, 0.78) : postState.film;
    post.configure({
      bloom: postState.bloom,
      lens: postState.lens,
      contrast: postState.contrast,
      temp: postState.temp,
      sat: tune.vib,
      vignette: look.post.vignette,
      film: filmActive,
      tint: look.accent,
    });
  }

  function syncCustomInputs() {
    const cfg = LOOK_BY_ID.custom.customConfig || DEFAULT_CUSTOM;
    $('#cp-zen').value = cfg.zen;
    $('#cp-hor').value = cfg.hor;
    $('#cp-base').value = cfg.base;
    $('#cp-win').value = cfg.win;
    $('#cp-accent').value = cfg.accent;
    $('#cp-sec').value = cfg.sec;
    $('#cp-style').value = cfg.style;
    $('#cp-mono').checked = !!cfg.mono;
  }

  function refreshLook(loadLookGrade = false) {
    const look = LOOK_BY_ID[lookId];
    if (loadLookGrade && look.grade) {
      postState.bloom = look.grade.bloom;
      postState.lens = look.grade.lens;
      postState.contrast = look.grade.contrast;
      postState.temp = look.grade.temp;
      postState.film = look.grade.film;
      syncPostSliders();
    }
    const effClouds = weatherMode === 2 || weatherMode === 6 ? Math.max(tune.clouds, 1.25) : tune.clouds;
    const effStyle = weatherMode === 6 && tune.cloudStyle === 0 ? 1 : tune.cloudStyle;
    applyLook(U, look, { ...tune, cloudStyle: effStyle });
    applyTime(U, look, timeOfDay, { ...tune, clouds: effClouds, cloudStyle: effStyle, sat: tune.vib });
    if (trees) trees.setNature(look);
    if (vehicles) vehicles.setPalette(look);
    if (weather) weather.setTint(look);
    if (boulevardGroup && boulevardGroup.userData.lineMat) {
      boulevardGroup.userData.lineMat.color.set(look.ground.line);
    }
    document.documentElement.style.setProperty('--accent', look.accent);
    // WebGL post-processor handles primary film grain & optical vignette; keep subtle CSS scanlines/grain low
    $('#grain').style.opacity = look.post.grain * 0.35;
    $('#scan').style.opacity = look.post.scan;
    $('#vig').style.opacity = look.post.vignette * 0.35;
    $('#custom-box').classList.toggle('on', lookId === 'custom');
    document.querySelectorAll('#chips button').forEach((b) => {
      const on = b.dataset.look === lookId;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on);
      if (b.dataset.look === 'custom') {
        b.querySelector('i').style.background = LOOK_BY_ID.custom.accent;
      }
    });
    $('#look-blurb').textContent = look.blurb;
    syncPostUniforms(look);
    syncURL();
  }

  function syncURL() {
    const p = new URLSearchParams(location.search);
    p.set('seed', String(seed));
    p.set('look', lookId);
    p.set('r', String(cityRadius));
    p.set('t', timeOfDay.toFixed(1));
    if (weatherMode > 0) p.set('w', String(weatherMode)); else p.delete('w');
    if (tune.cloudStyle > 0) p.set('cs', String(tune.cloudStyle)); else p.delete('cs');
    if (lookId === 'custom' && LOOK_BY_ID.custom.customConfig) {
      const c = LOOK_BY_ID.custom.customConfig;
      const strip = (h) => String(h).replace('#', '');
      p.set('pal', [strip(c.zen), strip(c.hor), strip(c.base), strip(c.win), strip(c.accent), strip(c.sec), c.style, c.mono ? '1' : '0'].join(','));
    } else {
      p.delete('pal');
    }
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
      if (lookId !== 'custom') prevPresetId = lookId;
      lookId = L.id;
      timeOfDay = L.defTime;
      $('#sl-time').value = String(timeOfDay);
      refreshLook(true);
    };
    $('#chips').appendChild(b);
  }

  // Custom theme / palette controls
  syncCustomInputs();
  const applyCustomEdit = () => {
    syncCustomLook({
      zen: $('#cp-zen').value,
      hor: $('#cp-hor').value,
      base: $('#cp-base').value,
      win: $('#cp-win').value,
      accent: $('#cp-accent').value,
      sec: $('#cp-sec').value,
      style: $('#cp-style').value,
      mono: $('#cp-mono').checked,
    });
    if (lookId !== 'custom') lookId = 'custom';
    refreshLook(false);
  };
  $('#cp-zen').oninput = applyCustomEdit;
  $('#cp-hor').oninput = applyCustomEdit;
  $('#cp-base').oninput = applyCustomEdit;
  $('#cp-win').oninput = applyCustomEdit;
  $('#cp-accent').oninput = applyCustomEdit;
  $('#cp-sec').oninput = applyCustomEdit;
  $('#cp-style').onchange = applyCustomEdit;
  $('#cp-mono').onchange = applyCustomEdit;
  $('#b-seed-pal').onclick = () => {
    const src = LOOK_BY_ID[prevPresetId] || LOOK_BY_ID.bladerunner;
    syncCustomLook({
      zen: src.sky.zen,
      hor: src.sky.hor,
      base: src.tower.baseA,
      win: src.tower.winA === '#000000' ? src.accent : src.tower.winA,
      accent: src.accent,
      sec: (src.signals && src.signals.billB) || src.tower.edgeCol,
      style: src.light.flat ? 'flat' : src.light.toon ? 'toon' : 'lit',
      mono: !!(src.signals && src.signals.billMono > 0.5),
    });
    syncCustomInputs();
    lookId = 'custom';
    refreshLook(true);
    flash(`Seeded palette from ${src.label}`);
  };

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

  // hide / show the whole interface (H) — collapses to top-corner glyph button
  const toggleUI = () => {
    const off = document.body.classList.toggle('ui-off');
    const b = $('#b-ui');
    b.textContent = off ? '\u2630' : '\u25E7';
    b.setAttribute('aria-pressed', String(!off));
    b.title = (off ? 'Show' : 'Hide') + ' interface (H)';
  };
  $('#b-ui').onclick = toggleUI;
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
    if (e.key === 'h' || e.key === 'H') toggleUI();
    else if (e.key === 'g' || e.key === 'G') toggleGlide();
    else if (e.key === 'c' || e.key === 'C') toggleCollision();
  });

  const WEATHER_GLYPHS = [
    '\u2600\uFE0E Clear',
    '\u2602\uFE0E Rain',
    '\u26A1\uFE0E Storm',
    '\u2744\uFE0E Snow',
    '\u2668\uFE0E Ash',
    '\u224B Dust',
    '\u2338 Film',
  ];
  function syncWeatherLabel() {
    const el = $('#weather-label');
    el.textContent = WEATHER_GLYPHS[weatherMode] || '\u2600\uFE0E Clear';
    el.title = WEATHER_NAMES[weatherMode] || 'Clear';
  }

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
  bindSlider($('#sl-weather'), (v) => {
    weatherMode = Math.round(v);
    weather.setMode(weatherMode);
    syncWeatherLabel();
    refreshLook();
  });
  $('#sel-cloudstyle').value = String(tune.cloudStyle);
  $('#sel-cloudstyle').onchange = (ev) => {
    tune.cloudStyle = clampInt(ev.target.value, 0, 6, 0);
    refreshLook();
  };
  bindSlider($('#sl-dust'), (v) => { dustLevel = v; weather.setDust(v); });
  bindSlider($('#sl-moon'), (v) => { tune.moon = v; refreshLook(); });
  bindSlider($('#sl-moonsz'), (v) => { tune.moonsz = v; refreshLook(); });
  bindSlider($('#sl-moonph'), (v) => { tune.moonph = v; refreshLook(); });

  // Post-processing & old-film sliders
  syncPostSliders();
  bindSlider($('#sl-bloom'), (v) => { postState.bloom = v; syncPostUniforms(LOOK_BY_ID[lookId]); });
  bindSlider($('#sl-lens'), (v) => { postState.lens = v; syncPostUniforms(LOOK_BY_ID[lookId]); });
  bindSlider($('#sl-contrast'), (v) => { postState.contrast = v; syncPostUniforms(LOOK_BY_ID[lookId]); });
  bindSlider($('#sl-temp'), (v) => { postState.temp = v; syncPostUniforms(LOOK_BY_ID[lookId]); });
  bindSlider($('#sl-film'), (v) => { postState.film = v; syncPostUniforms(LOOK_BY_ID[lookId]); });

  $('#sl-time').value = String(timeOfDay);
  $('#sl-radius').value = String(cityRadius);
  $('#sl-weather').value = String(weatherMode);
  syncWeatherLabel();

  /* -------------------------------------------------- places of interest */

  let fly = null;
  let glideIdx = 0;

  // Scenic glide nodes: Media Holo-Ad District, landmarks, venues & sky holograms
  function glideNodes() {
    if (!city) return [];
    const nodes = [];
    if (city.mediaZone) {
      const mz = city.mediaZone;
      nodes.push({ x: mz.x + mz.r * 0.95, y: 110 * heightScale + 20, z: mz.z + mz.r * 0.95, name: mz.name });
    }
    for (const lm of city.landmarks) {
      nodes.push({ x: lm.x + lm.r * 2.2, y: Math.max(95, lm.h * 0.65 * heightScale), z: lm.z + lm.r * 2.2, name: lm.name });
    }
    for (const pl of city.places) {
      nodes.push({ x: pl.x + pl.r * 1.6, y: 82 * heightScale + 24, z: pl.z - pl.r * 1.6, name: pl.name });
    }
    for (const h of city.holos.slice(0, 4)) {
      nodes.push({ x: h.x + h.w * 1.4, y: h.y * heightScale, z: h.z - h.w * 1.4, name: 'Sky Hologram' });
    }
    return nodes;
  }

  function syncGlideNode() {
    const nodes = glideNodes();
    if (!nodes.length) { controls.glideTarget = null; return null; }
    const node = nodes[glideIdx % nodes.length];
    controls.glideTarget = node;
    return node;
  }

  function toggleGlide() {
    glideOn = !glideOn;
    fly = null;
    controls.syncFromCamera();
    controls.setGlide(glideOn);
    const b = $('#b-glide');
    b.textContent = '\u2708\uFE0E';
    b.classList.toggle('on', glideOn);
    b.setAttribute('aria-pressed', String(glideOn));
    b.title = (glideOn ? 'Stop' : 'Start') + ' Glide mode — drag to steer, wheel for speed (G)';
    if (glideOn) {
      const n = syncGlideNode();
      flash(n ? `\u2708\uFE0E Glide · ${n.name}` : '\u2708\uFE0E Glide on');
    } else {
      flash('Glide off');
    }
  }

  function toggleCollision() {
    collideOn = !collideOn;
    controls.collision = collideOn;
    if (vehicles) vehicles.setCollision(collideOn);
    const b = $('#b-collide');
    b.textContent = collideOn ? '\u2B21' : '\u25CC';
    b.classList.toggle('on', collideOn);
    b.setAttribute('aria-pressed', String(collideOn));
    b.title = (collideOn ? 'Collision: on — toggle noclip' : 'Collision: off (noclip) — enable collision') + ' (C)';
    flash(collideOn ? '\u2B21 Collision on' : '\u25CC Noclip');
  }
  $('#b-glide').onclick = toggleGlide;
  $('#b-collide').onclick = toggleCollision;

  function flyToLandmark(lm) {
    const dist = lm.kind === 'media' ? Math.max(220, lm.r * 1.15) : Math.max(240, lm.r * 4.6);
    const away = new THREE.Vector3(camera.position.x - lm.x, 0, camera.position.z - lm.z);
    if (away.lengthSq() < 1) away.set(1, 0, 1);
    away.normalize().multiplyScalar(dist);
    fly = {
      t: 0,
      from: camera.position.clone(),
      to: new THREE.Vector3(lm.x + away.x, lm.h * 0.68 * heightScale + 24, lm.z + away.z),
      look: new THREE.Vector3(lm.x, lm.h * 0.45 * heightScale, lm.z),
    };
    flash(lm.name);
  }

  const POI_GLYPHS = {
    media: '\u25C8',
    spire: '\u25B2',
    obelisk: '\u25B2',
    pyramid: '\u25B3',
    ring: '\u25CE',
    wheel: '\u25CE',
    dome: '\u25EF',
    sphere: '\u25CF',
    arch: '\u2229',
    bridge: '\u2312',
    arena: '\u2B21',
    stadium: '\u2B21',
    theatre: '\u2726',
    market: '\u229E',
    plaza: '\u25C7',
    station: '\u21C4',
  };

  function buildPois() {
    const box = $('#pois');
    box.innerHTML = '';
    const spots = [
      ...(city.mediaZone ? [city.mediaZone] : []),
      ...city.landmarks,
      ...city.places.map((p) => ({ ...p, h: p.kind === 'arena' || p.kind === 'stadium' || p.kind === 'theatre' ? 58 : 42 })),
    ];
    for (const lm of spots) {
      const b = document.createElement('button');
      b.title = `${lm.kind} · fly to ${lm.name}`;
      const g = POI_GLYPHS[lm.kind] || '\u25C6';
      b.innerHTML = `<i aria-hidden="true">${g}</i>${lm.name}`;
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

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    post.setSize(w, h, renderer.getPixelRatio());
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
        const interrupted = controls.keys.size || controls._drag;
        if (fly.t >= 1 || interrupted) {
          controls.syncFromCamera();
          if (glideOn) controls.setGlide(true);
          fly = null;
        }
      } else {
        if (glideOn && controls.glideTarget) {
          const dx = camera.position.x - controls.glideTarget.x;
          const dz = camera.position.z - controls.glideTarget.z;
          if (Math.hypot(dx, dz) < 220) {
            glideIdx++;
            const next = syncGlideNode();
            if (next && controls._idle > 1.6) flash(next.name);
          }
        }
        controls.update(dt);
      }
      if (vehicles) vehicles.update(dt, tune.traffic);
      if (searchlights) searchlights.update(dt);
      if (weather) weather.update(dt, camera.position);
      world.sky.position.copy(camera.position);
      post.render(scene, camera, U.uTime.value);
      requestAnimationFrame(animate);
    } catch (err) {
      fatal(err);
    }
  }

  rebuild();
  refreshLook(true);
  $('#loading').classList.add('out');
  animate();
}

try {
  boot();
} catch (err) {
  fatal(err);
}
