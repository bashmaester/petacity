// Petacity — procedural city scaffolding with swap-able looks, horizon suburbs,
// adjustable plane-to-sphere world curvature, presets, bookmarks & exact-state sharing.
import * as THREE from '../vendor/three.module.js';
import { LOOKS, LOOK_BY_ID, DEFAULT_CUSTOM, syncCustomLook } from './looks.js';
import {
  WORLD_PRESETS, DEFAULT_BOOKMARKS,
  normalizeExactState, encodeExactState, decodeExactState,
} from './presets.js';
import { CELL } from './city.js';
import {
  makeUniforms, makeWorld, growCity, applyLook, applyTime, bendWorldPoint,
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

const STORAGE_PRESETS_KEY = 'petacity.presets.v1';
const STORAGE_BOOKMARKS_KEY = 'petacity.bookmarks.v1';

function readStorageJSON(key, fallback) {
  try {
    const raw = window.localStorage && window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeStorageJSON(key, val) {
  try {
    if (window.localStorage) window.localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* private / sandboxed storage — keep in-memory */
  }
}

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
const initialExact = params.get('s') ? decodeExactState(params.get('s')) : null;

if (initialExact && initialExact.custom) {
  syncCustomLook(initialExact.custom);
} else if (params.get('pal')) {
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

let seed = initialExact ? initialExact.seed : clampInt(params.get('seed'), 1, 999999999, 4417);
let lookId = initialExact
  ? (LOOK_BY_ID[initialExact.lookId] ? initialExact.lookId : 'bladerunner')
  : (LOOK_BY_ID[params.get('look')] ? params.get('look') : 'bladerunner');
let prevPresetLookId = lookId === 'custom' ? 'bladerunner' : lookId;
let cityRadius = initialExact ? initialExact.cityRadius : clampInt(params.get('r'), 1, 15, 5);
let suburbReach = initialExact
  ? initialExact.suburbReach
  : (params.get('sub') !== null ? clampFloat(params.get('sub'), 0, 1.6, 1) : 1);
let worldCurve = initialExact
  ? initialExact.worldCurve
  : (params.get('curve') !== null ? clampFloat(params.get('curve'), 0, 1, 0) : 0);
let timeOfDay = initialExact
  ? initialExact.timeOfDay
  : (params.get('t') !== null
    ? clampFloat(params.get('t'), 0, 24, LOOK_BY_ID[lookId].defTime)
    : LOOK_BY_ID[lookId].defTime);
let heightScale = initialExact ? initialExact.heightScale : 1;

const tune = initialExact
  ? { ...initialExact.tune }
  : {
      win: 1, glow: 1, fog: 1, lights: 1, traffic: 1,
      clouds: 1, cloudStyle: clampInt(params.get('cs'), 0, 6, 0),
      haze: 1, sun: 1, vib: 1,
      moon: 1, moonsz: 1, moonph: 0.85,
    };
let weatherMode = initialExact ? initialExact.weatherMode : clampInt(params.get('w'), 0, 6, 0);
let dustLevel = initialExact ? initialExact.dustLevel : 0.6;
const initGrade = LOOK_BY_ID[lookId].grade || { bloom: 0.85, lens: 0.45, contrast: 1.06, temp: 0, film: 0.16 };
const postState = initialExact
  ? { ...initialExact.post }
  : {
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
  const camera = new THREE.PerspectiveCamera(62, 1, 2, 34000);
  camera.position.set(720, 390, 880);
  camera.lookAt(0, 110, 0);

  const U = makeUniforms();
  const world = makeWorld(U);
  scene.add(world.sky);
  scene.add(world.ground);
  scene.add(world.clouds);

  // everything the seed grows lives in one group so Height scale can stretch it
  const cityGroup = new THREE.Group();
  scene.add(cityGroup);

  // weather & 3D ambient dust motes follow the camera
  const weather = makeWeather(U);
  weather.setDust(dustLevel);
  weather.setMode(weatherMode);
  scene.add(weather.group);

  const controls = new FlyControls(camera, canvas);

  /* --------------------------------------------------- state & storage */

  let userPresets = readStorageJSON(STORAGE_PRESETS_KEY, []);
  let bookmarks = initialExact && initialExact.bookmarks && initialExact.bookmarks.length
    ? initialExact.bookmarks.map((b) => ({ ...b }))
    : readStorageJSON(STORAGE_BOOKMARKS_KEY, null) || DEFAULT_BOOKMARKS.map((b) => ({ ...b }));

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
  let poiList = [];
  let glideOn = initialExact ? !!initialExact.glide : false;
  let collideOn = initialExact ? initialExact.collide !== false : true;
  let activePresetId = '';

  function computePlanetRadius() {
    return Math.max(1500, cityRadius * CELL * 1.05 + suburbReach * 950);
  }

  function syncWorldGeometry() {
    const pR = computePlanetRadius();
    U.uWorldCurve.value = worldCurve;
    U.uPlanetR.value = pR;
    controls.worldCurve = worldCurve;
    controls.planetR = pR;
    const lbl = $('#curve-label');
    if (worldCurve < 0.01) lbl.textContent = 'Plane';
    else if (worldCurve > 0.96) lbl.textContent = '\u25CF Globe';
    else lbl.textContent = `Arc ${Math.round(worldCurve * 100)}%`;
  }

  function rebuild() {
    const grown = growCity(seed, cityRadius, world.towerMat, suburbReach);
    city = grown.city;
    cityCollider = grown.collider;
    U.uCitySpan.value = city.radius * CELL;
    U.uSuburbSpan.value = Math.max(city.radius * CELL + 400, city.suburbSpan || 5200);
    U.uGroundRadius.value = 13500;
    syncWorldGeometry();
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
    trees = buildTrees(city, U);
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

  function syncAllSliders() {
    $('#seed-input').value = String(seed);
    $('#sel-look').value = lookId;
    $('#sl-curve').value = String(worldCurve);
    $('#sl-radius').value = String(cityRadius);
    $('#sl-suburbs').value = String(suburbReach);
    $('#sl-height').value = String(heightScale);
    $('#sl-traffic').value = String(tune.traffic);
    $('#sl-win').value = String(tune.win);
    $('#sl-glow').value = String(tune.glow);
    $('#sl-fog').value = String(tune.fog);
    $('#sl-lights').value = String(tune.lights);
    $('#sl-clouds').value = String(tune.clouds);
    $('#sl-haze').value = String(tune.haze);
    $('#sl-sun').value = String(tune.sun);
    $('#sl-vib').value = String(tune.vib);
    $('#sl-time').value = String(timeOfDay);
    $('#sl-dust').value = String(dustLevel);
    $('#sl-weather').value = String(weatherMode);
    $('#sel-cloudstyle').value = String(tune.cloudStyle);
    $('#sl-moon').value = String(tune.moon);
    $('#sl-moonsz').value = String(tune.moonsz);
    $('#sl-moonph').value = String(tune.moonph);
    syncPostSliders();
    syncWeatherLabel();
    syncWorldGeometry();
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
    $('#look-dot').style.background = look.accent;
    $('#grain').style.opacity = look.post.grain * 0.35;
    $('#scan').style.opacity = look.post.scan;
    $('#vig').style.opacity = look.post.vignette * 0.35;
    $('#custom-box').classList.toggle('on', lookId === 'custom');
    $('#sel-look').value = lookId;
    $('#look-blurb').textContent = look.blurb;
    syncPostUniforms(look);
    syncURL();
  }

  function syncURL(includeExactToken = false) {
    const p = new URLSearchParams();
    p.set('seed', String(seed));
    p.set('look', lookId);
    p.set('r', String(cityRadius));
    p.set('t', timeOfDay.toFixed(1));
    if (Math.abs(suburbReach - 1) > 0.01) p.set('sub', suburbReach.toFixed(2));
    if (worldCurve > 0.005) p.set('curve', worldCurve.toFixed(2));
    if (weatherMode > 0) p.set('w', String(weatherMode));
    if (tune.cloudStyle > 0) p.set('cs', String(tune.cloudStyle));
    if (lookId === 'custom' && LOOK_BY_ID.custom.customConfig) {
      const c = LOOK_BY_ID.custom.customConfig;
      const strip = (h) => String(h).replace('#', '');
      p.set('pal', [strip(c.zen), strip(c.hor), strip(c.base), strip(c.win), strip(c.accent), strip(c.sec), c.style, c.mono ? '1' : '0'].join(','));
    }
    if (includeExactToken) {
      p.set('s', encodeExactState(captureExactState()));
    }
    history.replaceState(null, '', `${location.pathname}?${p}`);
  }

  /* --------------------------------------- exact state & world presets */

  function captureExactState() {
    return normalizeExactState({
      seed,
      lookId,
      cityRadius,
      suburbReach,
      worldCurve,
      heightScale,
      timeOfDay,
      weatherMode,
      dustLevel,
      glide: glideOn,
      collide: collideOn,
      tune: { ...tune },
      post: { ...postState },
      custom: LOOK_BY_ID.custom.customConfig ? { ...LOOK_BY_ID.custom.customConfig } : { ...DEFAULT_CUSTOM },
      camera: controls.getPose(),
      bookmarks,
    });
  }

  function applyStateObject(raw, { applyCamera = true, applyBookmarks = false } = {}) {
    const st = normalizeExactState(raw);
    const needRebuild = st.seed !== seed || st.cityRadius !== cityRadius || Math.abs(st.suburbReach - suburbReach) > 1e-3;
    seed = st.seed;
    lookId = st.lookId;
    if (lookId !== 'custom') prevPresetLookId = lookId;
    cityRadius = st.cityRadius;
    suburbReach = st.suburbReach;
    worldCurve = st.worldCurve;
    heightScale = st.heightScale;
    timeOfDay = st.timeOfDay;
    weatherMode = st.weatherMode;
    dustLevel = st.dustLevel;
    Object.assign(tune, st.tune);
    Object.assign(postState, st.post);
    if (st.custom) {
      syncCustomLook(st.custom);
      syncCustomInputs();
    }
    weather.setMode(weatherMode);
    weather.setDust(dustLevel);
    syncAllSliders();

    if (needRebuild) rebuild();
    else {
      syncWorldGeometry();
      applyHeight();
    }
    refreshLook(false);

    if (st.collide !== collideOn) setCollisionState(st.collide);
    if (st.glide !== glideOn) setGlideState(st.glide);

    if (applyBookmarks && st.bookmarks && st.bookmarks.length) {
      bookmarks = st.bookmarks.map((b) => ({ ...b }));
      writeStorageJSON(STORAGE_BOOKMARKS_KEY, bookmarks);
      renderBookmarks();
    }
    if (applyCamera && st.camera) {
      fly = null;
      controls.setPose(st.camera);
    }
    syncURL();
  }

  function renderPresetOptions() {
    const sel = $('#sel-preset');
    sel.innerHTML = '';
    const ph = document.createElement('option');
    ph.value = '';
    ph.textContent = '\u2726 Choose or save preset…';
    sel.appendChild(ph);

    const gBuilt = document.createElement('optgroup');
    gBuilt.label = 'Curated Worlds';
    for (const P of WORLD_PRESETS) {
      const opt = document.createElement('option');
      opt.value = `b:${P.id}`;
      opt.textContent = P.label;
      opt.title = P.blurb;
      gBuilt.appendChild(opt);
    }
    sel.appendChild(gBuilt);

    if (userPresets.length) {
      const gUser = document.createElement('optgroup');
      gUser.label = 'Saved Presets';
      for (const P of userPresets) {
        const opt = document.createElement('option');
        opt.value = `u:${P.id}`;
        opt.textContent = `\u2605 ${P.label}`;
        gUser.appendChild(opt);
      }
      sel.appendChild(gUser);
    }
    sel.value = activePresetId;
    $('#b-preset-del').disabled = !activePresetId.startsWith('u:');
  }

  renderPresetOptions();
  $('#sel-preset').onchange = (ev) => {
    const val = ev.target.value;
    activePresetId = val;
    $('#b-preset-del').disabled = !val.startsWith('u:');
    if (!val) return;
    if (val.startsWith('b:')) {
      const id = val.slice(2);
      const found = WORLD_PRESETS.find((p) => p.id === id);
      if (found) {
        applyStateObject(found.state, { applyCamera: true, applyBookmarks: false });
        flash(`Preset · ${found.label}`);
      }
    } else if (val.startsWith('u:')) {
      const id = val.slice(2);
      const found = userPresets.find((p) => p.id === id);
      if (found) {
        applyStateObject(found.state, { applyCamera: true, applyBookmarks: false });
        flash(`Preset · ${found.label}`);
      }
    }
  };

  $('#b-preset-save').onclick = () => {
    const row = $('#preset-save-row');
    const open = row.classList.toggle('on');
    if (open) {
      const inp = $('#preset-name');
      inp.value = `${LOOK_BY_ID[lookId].label} #${seed % 1000}`;
      inp.focus();
      inp.select();
    }
  };
  const commitSavePreset = () => {
    const label = ($('#preset-name').value || '').trim() || `Preset ${userPresets.length + 1}`;
    const id = `up-${Date.now().toString(36)}`;
    const state = captureExactState();
    delete state.bookmarks;
    userPresets.push({ id, label, state });
    writeStorageJSON(STORAGE_PRESETS_KEY, userPresets);
    activePresetId = `u:${id}`;
    $('#preset-save-row').classList.remove('on');
    renderPresetOptions();
    flash(`Saved preset · ${label}`);
  };
  $('#b-preset-ok').onclick = commitSavePreset;
  $('#preset-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') commitSavePreset();
    else if (e.key === 'Escape') $('#preset-save-row').classList.remove('on');
  });

  $('#b-preset-del').onclick = () => {
    if (!activePresetId.startsWith('u:')) return;
    const id = activePresetId.slice(2);
    const idx = userPresets.findIndex((p) => p.id === id);
    if (idx >= 0) {
      const removed = userPresets.splice(idx, 1)[0];
      writeStorageJSON(STORAGE_PRESETS_KEY, userPresets);
      activePresetId = '';
      renderPresetOptions();
      flash(`Removed · ${removed.label}`);
    }
  };

  /* --------------------------------------------------- Look dropdown */

  for (const L of LOOKS) {
    const opt = document.createElement('option');
    opt.value = L.id;
    opt.textContent = L.label;
    $('#sel-look').appendChild(opt);
  }
  $('#sel-look').value = lookId;
  $('#sel-look').onchange = (ev) => {
    const nextId = ev.target.value;
    if (!LOOK_BY_ID[nextId]) return;
    if (lookId !== 'custom') prevPresetLookId = lookId;
    lookId = nextId;
    timeOfDay = LOOK_BY_ID[lookId].defTime;
    $('#sl-time').value = String(timeOfDay);
    refreshLook(true);
  };

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
    const src = LOOK_BY_ID[prevPresetLookId] || LOOK_BY_ID.bladerunner;
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

  /* -------------------------------------- Exact-state export / sharing */

  function buildExactShareURL() {
    syncURL(true);
    return location.href;
  }

  async function copyExactShareURL() {
    const url = buildExactShareURL();
    $('#export-text').value = url;
    try {
      await navigator.clipboard.writeText(url);
      flash('Exact state URL copied');
    } catch {
      $('#export-box').classList.add('on');
      $('#b-export').classList.add('on');
      $('#b-export').setAttribute('aria-pressed', 'true');
      $('#export-text').focus();
      $('#export-text').select();
      flash('Exact state URL ready');
    }
  }

  $('#b-export').onclick = () => {
    const box = $('#export-box');
    const open = box.classList.toggle('on');
    $('#b-export').classList.toggle('on', open);
    $('#b-export').setAttribute('aria-pressed', String(open));
    if (open) {
      const url = buildExactShareURL();
      $('#export-text').value = url;
      $('#export-text').select();
    }
  };
  $('#b-copy-exact').onclick = copyExactShareURL;
  $('#b-link').onclick = copyExactShareURL;

  $('#b-dl-json').onclick = () => {
    const json = JSON.stringify(captureExactState(), null, 2);
    $('#export-text').value = json;
    try {
      const blob = new Blob([json], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `petacity-${seed}-${lookId}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1500);
      flash('Downloaded state JSON');
    } catch {
      flash('State JSON written to field');
    }
  };

  $('#b-apply-state').onclick = () => {
    const raw = ($('#export-text').value || '').trim();
    if (!raw) return;
    let token = raw;
    try {
      if (raw.includes('?')) {
        const u = new URL(raw, location.origin);
        token = u.searchParams.get('s') || raw;
      }
    } catch {
      /* treat as raw token or JSON */
    }
    const decoded = decodeExactState(token);
    if (!decoded) {
      flash('Could not parse state');
      return;
    }
    applyStateObject(decoded, { applyCamera: true, applyBookmarks: true });
    flash('Exact state restored');
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
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) return;
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
  bindSlider($('#sl-curve'), (v) => {
    worldCurve = clampFloat(v, 0, 1, 0);
    syncWorldGeometry();
    syncGlideNode();
    syncURL();
  });
  bindSlider($('#sl-radius'), (v) => { cityRadius = clampInt(v, 1, 15, cityRadius); rebuild(); });
  bindSlider($('#sl-suburbs'), (v) => { suburbReach = clampFloat(v, 0, 1.6, suburbReach); rebuild(); });
  bindSlider($('#sl-height'), (v) => { heightScale = v; applyHeight(); });
  bindSlider($('#sl-traffic'), (v) => { tune.traffic = v; if (vehicles) vehicles.update(0, tune.traffic); });
  bindSlider($('#sl-win'), (v) => { tune.win = v; refreshLook(); });
  bindSlider($('#sl-glow'), (v) => { tune.glow = v; refreshLook(); });
  bindSlider($('#sl-fog'), (v) => { tune.fog = v; refreshLook(); });
  bindSlider($('#sl-lights'), (v) => { tune.lights = v; refreshLook(); });
  bindSlider($('#sl-clouds'), (v) => { tune.clouds = v; refreshLook(); });
  bindSlider($('#sl-haze'), (v) => { tune.haze = v; refreshLook(); });
  bindSlider($('#sl-sun'), (v) => { tune.sun = v; refreshLook(); });
  bindSlider($('#sl-vib'), (v) => { tune.vib = v; refreshLook(); });
  bindSlider($('#sl-time'), (v) => { timeOfDay = v; refreshLook(); });
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
  bindSlider($('#sl-bloom'), (v) => { postState.bloom = v; syncPostUniforms(LOOK_BY_ID[lookId]); });
  bindSlider($('#sl-lens'), (v) => { postState.lens = v; syncPostUniforms(LOOK_BY_ID[lookId]); });
  bindSlider($('#sl-contrast'), (v) => { postState.contrast = v; syncPostUniforms(LOOK_BY_ID[lookId]); });
  bindSlider($('#sl-temp'), (v) => { postState.temp = v; syncPostUniforms(LOOK_BY_ID[lookId]); });
  bindSlider($('#sl-film'), (v) => { postState.film = v; syncPostUniforms(LOOK_BY_ID[lookId]); });

  /* ------------------------------------ places dropdown & bookmarks */

  let fly = null;
  let glideIdx = 0;

  function toCurvedVec(x, y, z) {
    const b = bendWorldPoint(x, y, z, worldCurve, U.uPlanetR.value);
    return new THREE.Vector3(b.x, b.y, b.z);
  }

  // Scenic glide nodes: Media Holo-Ad District, landmarks, venues & sky holograms
  function glideNodes() {
    if (!city) return [];
    const nodes = [];
    const pushNode = (x, y, z, name) => {
      const b = bendWorldPoint(x, y, z, worldCurve, U.uPlanetR.value);
      nodes.push({ x: b.x, y: b.y, z: b.z, name });
    };
    if (city.mediaZone) {
      const mz = city.mediaZone;
      pushNode(mz.x + mz.r * 0.95, 110 * heightScale + 20, mz.z + mz.r * 0.95, mz.name);
    }
    for (const lm of city.landmarks) {
      pushNode(lm.x + lm.r * 2.2, Math.max(95, lm.h * 0.65 * heightScale), lm.z + lm.r * 2.2, lm.name);
    }
    for (const pl of city.places) {
      pushNode(pl.x + pl.r * 1.6, 82 * heightScale + 24, pl.z - pl.r * 1.6, pl.name);
    }
    for (const h of city.holos.slice(0, 4)) {
      pushNode(h.x + h.w * 1.4, h.y * heightScale, h.z - h.w * 1.4, 'Sky Hologram');
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

  function setGlideState(on, announce = false) {
    glideOn = !!on;
    fly = null;
    controls.syncFromCamera();
    controls.setGlide(glideOn);
    const b = $('#b-glide');
    b.textContent = '\u2708\uFE0E';
    b.classList.toggle('on', glideOn);
    b.setAttribute('aria-pressed', String(glideOn));
    b.title = (glideOn ? 'Stop' : 'Start') + ' Glide mode — drag to steer, wheel for speed (G)';
    if (announce) {
      if (glideOn) {
        const n = syncGlideNode();
        flash(n ? `\u2708\uFE0E Glide · ${n.name}` : '\u2708\uFE0E Glide on');
      } else {
        flash('Glide off');
      }
    }
  }

  function setCollisionState(on, announce = false) {
    collideOn = !!on;
    controls.collision = collideOn;
    if (vehicles) vehicles.setCollision(collideOn);
    const b = $('#b-collide');
    b.textContent = collideOn ? '\u2B21' : '\u25CC';
    b.classList.toggle('on', collideOn);
    b.setAttribute('aria-pressed', String(collideOn));
    b.title = (collideOn ? 'Collision: on — toggle noclip' : 'Collision: off (noclip) — enable collision') + ' (C)';
    if (announce) flash(collideOn ? '\u2B21 Collision on' : '\u25CC Noclip');
  }

  function toggleGlide() { setGlideState(!glideOn, true); }
  function toggleCollision() { setCollisionState(!collideOn, true); }
  $('#b-glide').onclick = toggleGlide;
  $('#b-collide').onclick = toggleCollision;

  function flyToLandmark(lm) {
    if (!lm) return;
    const dist = lm.kind === 'media' ? Math.max(220, lm.r * 1.15) : Math.max(240, lm.r * 4.6);
    const away = new THREE.Vector3(camera.position.x - lm.x, 0, camera.position.z - lm.z);
    if (away.lengthSq() < 1) away.set(1, 0, 1);
    away.normalize().multiplyScalar(dist);
    const to = toCurvedVec(lm.x + away.x, lm.h * 0.68 * heightScale + 24, lm.z + away.z);
    const look = toCurvedVec(lm.x, lm.h * 0.45 * heightScale, lm.z);
    fly = {
      t: 0,
      from: camera.position.clone(),
      to,
      look,
      toQuat: null,
    };
    flash(lm.name);
  }

  function flyToBookmark(bm) {
    if (!bm) return;
    const to = new THREE.Vector3(bm.x, bm.y, bm.z);
    const toQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(bm.pitch || 0, bm.yaw || 0, 0, 'YXZ'));
    fly = {
      t: 0,
      from: camera.position.clone(),
      fromQuat: camera.quaternion.clone(),
      to,
      look: null,
      toQuat,
      endPose: bm,
    };
    flash(`\u2605 ${bm.name}`);
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
    suburb: '\u2302',
  };

  function buildPois() {
    const sel = $('#sel-poi');
    sel.innerHTML = '';
    const subSpot = {
      kind: 'suburb',
      name: 'Horizon Suburbs',
      x: (city.radius * CELL + (city.suburbSpan || 4200)) * 0.42,
      z: (city.radius * CELL + (city.suburbSpan || 4200)) * 0.34,
      r: 45,
      h: 28,
    };
    poiList = [
      ...(city.mediaZone ? [city.mediaZone] : []),
      ...city.landmarks,
      ...city.places.map((p) => ({ ...p, h: p.kind === 'arena' || p.kind === 'stadium' || p.kind === 'theatre' ? 58 : 42 })),
      ...(suburbReach > 0.05 ? [subSpot] : []),
    ];
    poiList.forEach((lm, idx) => {
      const opt = document.createElement('option');
      opt.value = String(idx);
      const g = POI_GLYPHS[lm.kind] || '\u25C6';
      opt.textContent = `${g} ${lm.name}`;
      sel.appendChild(opt);
    });
  }

  $('#sel-poi').onchange = (ev) => {
    const lm = poiList[parseInt(ev.target.value, 10)];
    if (lm) flyToLandmark(lm);
  };
  $('#b-poi-go').onclick = () => {
    const lm = poiList[parseInt($('#sel-poi').value, 10)];
    if (lm) flyToLandmark(lm);
  };

  // Separate Place Bookmarks system (user camera viewpoints)
  function renderBookmarks(selectIdx = 0) {
    const sel = $('#sel-bookmark');
    sel.innerHTML = '';
    bookmarks.forEach((bm, idx) => {
      const opt = document.createElement('option');
      opt.value = String(idx);
      opt.textContent = `\u2605 ${bm.name}`;
      sel.appendChild(opt);
    });
    if (bookmarks.length) {
      sel.value = String(Math.max(0, Math.min(bookmarks.length - 1, selectIdx)));
    }
    $('#b-bm-del').disabled = bookmarks.length === 0;
    $('#b-bm-go').disabled = bookmarks.length === 0;
  }

  renderBookmarks(0);
  $('#sel-bookmark').onchange = (ev) => {
    const bm = bookmarks[parseInt(ev.target.value, 10)];
    if (bm) flyToBookmark(bm);
  };
  $('#b-bm-go').onclick = () => {
    const bm = bookmarks[parseInt($('#sel-bookmark').value, 10)];
    if (bm) flyToBookmark(bm);
  };
  $('#b-bm-add').onclick = () => {
    const row = $('#bm-save-row');
    const open = row.classList.toggle('on');
    if (open) {
      const inp = $('#bm-name');
      inp.value = `Viewpoint ${bookmarks.length + 1}`;
      inp.focus();
      inp.select();
    }
  };
  const commitSaveBookmark = () => {
    const name = ($('#bm-name').value || '').trim() || `Viewpoint ${bookmarks.length + 1}`;
    const pose = controls.getPose();
    bookmarks.push({ name, ...pose });
    writeStorageJSON(STORAGE_BOOKMARKS_KEY, bookmarks);
    $('#bm-save-row').classList.remove('on');
    renderBookmarks(bookmarks.length - 1);
    flash(`Bookmarked · ${name}`);
  };
  $('#b-bm-ok').onclick = commitSaveBookmark;
  $('#bm-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') commitSaveBookmark();
    else if (e.key === 'Escape') $('#bm-save-row').classList.remove('on');
  });
  $('#b-bm-del').onclick = () => {
    const idx = parseInt($('#sel-bookmark').value, 10);
    if (!Number.isFinite(idx) || idx < 0 || idx >= bookmarks.length) return;
    const removed = bookmarks.splice(idx, 1)[0];
    writeStorageJSON(STORAGE_BOOKMARKS_KEY, bookmarks);
    renderBookmarks(Math.max(0, idx - 1));
    flash(`Deleted bookmark · ${removed.name}`);
  };

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
        fly.t = Math.min(1, fly.t + dt / 1.55);
        const e = fly.t < 0.5 ? 2 * fly.t * fly.t : 1 - Math.pow(-2 * fly.t + 2, 2) / 2;
        camera.position.lerpVectors(fly.from, fly.to, e);
        if (fly.toQuat && fly.fromQuat) {
          camera.quaternion.slerpQuaternions(fly.fromQuat, fly.toQuat, e);
        } else if (fly.look) {
          camera.lookAt(fly.look);
        }
        const interrupted = controls.keys.size || controls._drag;
        if (fly.t >= 1 || interrupted) {
          if (fly.endPose && !interrupted) controls.setPose(fly.endPose);
          else controls.syncFromCamera();
          if (glideOn) controls.setGlide(true);
          fly = null;
        }
      } else {
        if (glideOn && controls.glideTarget) {
          const dx = camera.position.x - controls.glideTarget.x;
          const dy = camera.position.y - controls.glideTarget.y;
          const dz = camera.position.z - controls.glideTarget.z;
          if (Math.hypot(dx, dy * 0.5, dz) < 235) {
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

  syncAllSliders();
  rebuild();
  refreshLook(!initialExact);
  setCollisionState(collideOn, false);
  if (glideOn) setGlideState(true, false);
  if (initialExact && initialExact.camera) {
    controls.setPose(initialExact.camera);
  }
  $('#loading').classList.add('out');
  animate();
}

try {
  boot();
} catch (err) {
  fatal(err);
}
