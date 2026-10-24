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
  makeUniforms, makeWorld, growCity, syncCityEnvironmentUniforms,
  applyLook, applyTime, bendWorldPoint,
  buildLandmarks, buildBeacons, buildPlaces, makeLamps,
  makeVehicles, makeSearchlights, makeLightPools,
  buildWater, buildBoulevards, buildBillboards, buildTrees, buildSculptures,
  makeWeather, WEATHER_NAMES, CLOUD_TYPE_NAMES, GLYPH_STYLE_NAMES,
  WATER_MODE_NAMES, TERRAIN_MODE_NAMES, TREE_MODE_NAMES, describeMoonPhase,
  buildSigns, buildHolos,
  buildTransitInfrastructure, buildBridges, buildHarbor, buildSpaceport,
  buildStreetInfrastructure,
} from './scene.js';
import { makePostProcessor, ART_STYLE_NAMES } from './post.js';
import { FlyControls, CAMERA_STYLE_NAMES } from './controls.js';
import { CameraPathRecorder, makeSceneExporter } from './recorder.js';
import { makeMinimap } from './minimap.js';

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

// Multi-order-of-magnitude traffic slider mapping:
// slider [0..1] -> density [0..62.5] (0 -> 0, 0.25 -> 1.0 (~320), 0.60 -> ~2.2k, 1.0 -> 20,000!)
const MAX_TRAFFIC_DENSITY = 62.5;
function sliderToTraffic(s) {
  const x = Math.max(0, Math.min(1, s));
  if (x <= 0.001) return 0;
  if (x <= 0.25) return x / 0.25;
  return Math.pow(MAX_TRAFFIC_DENSITY, (x - 0.25) / 0.75);
}
function trafficToSlider(d) {
  const v = Math.max(0, d);
  if (v <= 0) return 0;
  if (v <= 1) return 0.25 * v;
  return Math.min(1, 0.25 + 0.75 * (Math.log(Math.min(MAX_TRAFFIC_DENSITY, v)) / Math.log(MAX_TRAFFIC_DENSITY)));
}
function formatVehicleCount(cnt) {
  if (cnt >= 10000) return `${(cnt / 1000).toFixed(1)}k`;
  if (cnt >= 1000) return `${(cnt / 1000).toFixed(1)}k`;
  return String(cnt);
}

const $ = (sel) => {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`missing element for selector: ${sel}`);
  return el;
};

const STORAGE_PRESETS_KEY = 'petacity.presets.v1';
const STORAGE_BOOKMARKS_KEY = 'petacity.bookmarks.v1';
const STORAGE_PATH_KEY = 'petacity.campath.v1';

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
let waterMode = initialExact
  ? initialExact.waterMode
  : clampInt(params.get('wm'), 0, 4, 1);
let waterAmount = initialExact
  ? (initialExact.waterAmount ?? 1)
  : (params.get('wa') !== null ? clampFloat(params.get('wa'), 0, 2, 1) : 1);
let shoreDist = initialExact
  ? (initialExact.shoreDist ?? 1)
  : (params.get('sd') !== null ? clampFloat(params.get('sd'), 0.35, 2.5, 1) : 1);
let terrainMode = initialExact
  ? initialExact.terrainMode
  : clampInt(params.get('tm'), 0, 4, 0);
let terrainScale = initialExact
  ? initialExact.terrainScale
  : (params.get('ts') !== null ? clampFloat(params.get('ts'), 0, 2, 1) : 1);
let treeMode = initialExact
  ? initialExact.treeMode
  : clampInt(params.get('tr'), 0, 3, 0);
let vegCover = initialExact
  ? (initialExact.vegCover ?? 1)
  : (params.get('vc') !== null ? clampFloat(params.get('vc'), 0, 2.4, 1) : 1);
let vegScale = initialExact
  ? (initialExact.vegScale ?? 1)
  : (params.get('vs') !== null ? clampFloat(params.get('vs'), 0.4, 4.5, 1) : 1);
let transitAmt = initialExact
  ? (initialExact.transitAmt ?? 1)
  : (params.get('pt') !== null ? clampFloat(params.get('pt'), 0, 2.5, 1) : 1);
let maritimeAmt = initialExact
  ? (initialExact.maritimeAmt ?? 1)
  : (params.get('hr') !== null ? clampFloat(params.get('hr'), 0, 2.5, 1) : 1);
let airAmt = initialExact
  ? (initialExact.airAmt ?? 1)
  : (params.get('ap') !== null ? clampFloat(params.get('ap'), 0, 2.5, 1) : 1);
let signAmt = initialExact
  ? (initialExact.signAmt ?? 1)
  : (params.get('sg') !== null ? clampFloat(params.get('sg'), 0, 2.5, 1) : 1);
let megaWrap = initialExact
  ? (initialExact.megaWrap ?? 1)
  : (params.get('mw') !== null ? clampFloat(params.get('mw'), 0, 2.2, 1) : 1);
let worldCurve = initialExact
  ? initialExact.worldCurve
  : (params.get('curve') !== null ? clampFloat(params.get('curve'), 0, 1, 0) : 0);
let timeOfDay = initialExact
  ? initialExact.timeOfDay
  : (params.get('t') !== null
    ? clampFloat(params.get('t'), 0, 24, LOOK_BY_ID[lookId].defTime)
    : LOOK_BY_ID[lookId].defTime);
let daySpeed = initialExact
  ? (initialExact.daySpeed ?? 1)
  : (params.get('ds') !== null ? clampFloat(params.get('ds'), 0.05, 5, 1) : 1);
let trafficSpeed = initialExact
  ? (initialExact.trafficSpeed ?? 1)
  : (params.get('tsp') !== null ? clampFloat(params.get('tsp'), 0, 3, 1) : 1);
let camSpeed = initialExact
  ? (initialExact.camSpeed ?? 1)
  : (params.get('csp') !== null ? clampFloat(params.get('csp'), 0.2, 3.5, 1) : 1);
let camRadius = initialExact
  ? (initialExact.camRadius ?? 2.2)
  : (params.get('crad') !== null ? clampFloat(params.get('crad'), 0.5, 12, 2.2) : 2.2);
let camSmooth = initialExact
  ? (initialExact.camSmooth ?? 0.72)
  : (params.get('csm') !== null ? clampFloat(params.get('csm'), 0, 1, 0.72) : 0.72);
let camStyle = initialExact
  ? (initialExact.camStyle ?? 0)
  : clampInt(params.get('cst'), 0, 3, 0);
let pathSmooth = initialExact ? (initialExact.pathSmooth ?? 0.65) : 0.65;
let heightScale = initialExact ? initialExact.heightScale : 1;

const initLookDefTint = LOOK_BY_ID[lookId].defTint ?? 0.72;
const tune = initialExact
  ? {
      tint: initLookDefTint,
      searchLight: 1, trafficLight: 1, vehLight: 1,
      cloudSeed: 0, cloudEvol: 0.35, cloudLac: 2.08, cloudElev: 1, cloudRange: 1,
      glyphStyle: 0, signAnim: 1,
      ...initialExact.tune,
    }
  : {
      tint: params.get('tn') !== null ? clampFloat(params.get('tn'), 0, 1, initLookDefTint) : initLookDefTint,
      win: 1, glow: 1, fog: 1, lights: 1, traffic: 1,
      searchLight: params.get('sl') !== null ? clampFloat(params.get('sl'), 0, 2.5, 1) : 1,
      trafficLight: params.get('tl') !== null ? clampFloat(params.get('tl'), 0, 2.5, 1) : 1,
      vehLight: params.get('vl') !== null ? clampFloat(params.get('vl'), 0, 2.5, 1) : 1,
      clouds: params.get('cl') !== null ? clampFloat(params.get('cl'), 0, 2.4, 1) : 1,
      cloudType: clampInt(params.get('ct'), 0, 5, 0),
      cloudStyle: clampInt(params.get('cs'), 0, 6, 0),
      cloudSeed: params.get('cseed') !== null ? clampFloat(params.get('cseed'), 0, 100, 0) : 0,
      cloudEvol: params.get('cevol') !== null ? clampFloat(params.get('cevol'), 0, 2.5, 0.35) : 0.35,
      cloudLac: params.get('clac') !== null ? clampFloat(params.get('clac'), 1.4, 3.2, 2.08) : 2.08,
      cloudElev: params.get('cel') !== null ? clampFloat(params.get('cel'), 0.35, 2.4, 1) : 1,
      cloudRange: params.get('crg') !== null ? clampFloat(params.get('crg'), 0.3, 3.0, 1) : 1,
      glyphStyle: clampInt(params.get('gl'), 0, 2, 0),
      signAnim: params.get('sa') !== null ? clampFloat(params.get('sa'), 0, 2.5, 1) : 1,
      haze: 1, sun: 1, vib: 1,
      moon: 1, moonsz: 1, moonph: 0.85,
    };
let weatherMode = initialExact ? initialExact.weatherMode : clampInt(params.get('w'), 0, 6, 0);
let dustLevel = initialExact ? initialExact.dustLevel : 0.6;
const initGrade = LOOK_BY_ID[lookId].grade || { bloom: 0.85, lens: 0.45, contrast: 1.06, temp: 0, film: 0.16 };
const postState = initialExact
  ? { artStyle: 0, artStrength: 1.0, ...initialExact.post }
  : {
      bloom: initGrade.bloom,
      lens: initGrade.lens,
      contrast: initGrade.contrast,
      temp: initGrade.temp,
      film: initGrade.film,
      artStyle: clampInt(params.get('art'), 0, 5, 0),
      artStrength: params.get('as') !== null ? clampFloat(params.get('as'), 0, 1.4, 1) : 1.0,
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
  const pathRecorder = new CameraPathRecorder();
  const exporter = makeSceneExporter({
    renderer,
    post,
    scene,
    camera,
    getTime: () => U.uTime.value,
  });

  // Restore saved camera path if present in initial exact state or localStorage
  if (initialExact && initialExact.path) {
    pathRecorder.fromJSON(initialExact.path);
  } else {
    try {
      const rawPath = window.localStorage && window.localStorage.getItem(STORAGE_PATH_KEY);
      if (rawPath) pathRecorder.fromJSON(rawPath);
    } catch {
      /* ignore sandboxed storage */
    }
  }

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
  let transitGroup = null;
  let bridgeGroup = null;
  let harborObj = null;
  let spaceportObj = null;
  let streetInfraObj = null;
  let city = null;
  let cityCollider = null;
  let poiList = [];
  let glideOn = initialExact ? !!initialExact.glide : false;
  let freelookOn = initialExact ? !!initialExact.freelook : false;
  let collideOn = initialExact ? initialExact.collide !== false : true;
  let avoidOn = initialExact ? initialExact.avoidance !== false : true;
  let timeCycleOn = initialExact ? !!initialExact.dayCycle : false;
  let activePresetId = '';

  controls.speedMul = camSpeed;
  controls.colliderRadius = camRadius;
  controls.smoothness = camSmooth;
  controls.motionStyle = camStyle;

  const minimap = makeMinimap({
    canvas: $('#minimap'),
    labelEl: $('#minimap-label'),
    onSelectSpot: (spot) => {
      if (spot && spot.poi) flyToLandmark(spot.poi);
      else if (spot) flyToLandmark(spot);
    },
  });
  const minimapZooms = [1.0, 2.0, 3.5];
  let minimapZoomIdx = 0;
  $('#b-minimap-zoom').onclick = () => {
    minimapZoomIdx = (minimapZoomIdx + 1) % minimapZooms.length;
    const z = minimapZooms[minimapZoomIdx];
    minimap.setZoom(z);
    $('#b-minimap-zoom').textContent = `${z}\u00D7`;
  };

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
    const grown = growCity(seed, cityRadius, world.towerMat, suburbReach, {
      waterMode,
      waterAmount,
      shoreDist,
      terrainMode,
      terrainScale,
      vegCover,
      vegScale,
      transitAmt,
      maritimeAmt,
      airAmt,
      signAmt,
      megaWrap,
      U,
    });
    city = grown.city;
    cityCollider = grown.collider;
    syncCityEnvironmentUniforms(U, city);
    U.uGroundRadius.value = 13500;
    syncWorldGeometry();
    controls.collider = cityCollider;
    controls.collision = collideOn;
    controls.avoidance = avoidOn;
    controls.heightScale = heightScale;
    while (cityGroup.children.length) {
      const ch = cityGroup.children.pop();
      ch.traverse?.((o) => o.geometry && o.geometry.dispose());
    }
    const look = LOOK_BY_ID[lookId];
    cityMesh = grown.mesh;
    landmarkGroup = buildLandmarks(city, U, look);
    placeGroup = buildPlaces(city, U, look);
    beacons = buildBeacons(city, world.beaconMat);
    lamps = makeLamps(city, world.lampMat);
    pools = makeLightPools(city, world.poolMat);
    searchlights = makeSearchlights(city, world.beamMat);
    searchlights.setAmount(tune.searchLight ?? 1);
    vehicles = makeVehicles(city, world.trailMat, 1400, cityCollider, {
      swarmMat: world.swarmMat,
      swarmCount: 18600,
      transitAmt,
      trafficSpeed,
      U,
    });
    vehicles.setCollision(collideOn);
    vehicles.setPalette(look);
    waterGroup = buildWater(city, world.waterMat);
    boulevardGroup = buildBoulevards(city, U);
    billboards = buildBillboards(city, world.billMat);
    signGroup = buildSigns(city, world.billMat);
    holoGroup = buildHolos(city, world.holoMat, world.beamMat);
    trees = buildTrees(city, U);
    sculptures = buildSculptures(city, world.beaconMat, world.lampMat);
    transitGroup = buildTransitInfrastructure(city, U, world.lampMat);
    bridgeGroup = buildBridges(city, U, world.beaconMat, world.lampMat);
    harborObj = buildHarbor(city, U, world.beaconMat, world.lampMat);
    spaceportObj = buildSpaceport(city, U, world.beaconMat, world.lampMat, world.beamMat);
    streetInfraObj = buildStreetInfrastructure(city, U);
    streetInfraObj.setSignalGlow(tune.trafficLight ?? 1);
    trees.setNature(look, treeMode);
    trees.setScale(vegScale);
    transitGroup.setLook(look);
    bridgeGroup.setLook(look);
    harborObj.setLook(look);
    spaceportObj.setLook(look);
    streetInfraObj.setLook(look);
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
    cityGroup.add(transitGroup);
    cityGroup.add(bridgeGroup);
    cityGroup.add(harborObj.group);
    cityGroup.add(spaceportObj.group);
    cityGroup.add(streetInfraObj.group);
    applyHeight();

    $('#stat-towers').textContent = city.towers.toLocaleString('en-US');
    $('#stat-boxes').textContent = city.count.toLocaleString('en-US');
    $('#stat-seed').textContent = String(seed);
    buildPois();
    minimap.setCity(city, LOOK_BY_ID[lookId]);
    syncGlideNode();
    syncURL();
  }

  function syncTrafficLabel() {
    const cnt = vehicles ? vehicles.activeCount : Math.round(tune.traffic * 320);
    const el = $('#traffic-label');
    el.textContent = formatVehicleCount(cnt);
    el.title = `${cnt.toLocaleString('en-US')} active multi-strata vehicles`;
  }

  function applyHeight() {
    cityGroup.scale.y = heightScale;
    U.uHeightScale.value = heightScale;
    controls.heightScale = heightScale;
    syncGlideNode();
    if (vehicles) {
      vehicles.update(0, tune.traffic, heightScale);
      syncTrafficLabel();
    }
  }

  /* ------------------------------------------------------------- look */

  function syncPostSliders() {
    $('#sel-art').value = String(postState.artStyle ?? 0);
    $('#sl-artstr').value = String(postState.artStrength ?? 1.0);
    $('#sl-bloom').value = String(postState.bloom);
    $('#sl-lens').value = String(postState.lens);
    $('#sl-contrast').value = String(postState.contrast);
    $('#sl-temp').value = String(postState.temp);
    $('#sl-film').value = String(postState.film);
  }

  function formatClock(hours) {
    const wrapped = ((hours % 24) + 24) % 24;
    const hh = Math.floor(wrapped);
    const mm = Math.floor((wrapped - hh) * 60);
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  function syncTimeLabel() {
    const el = $('#time-label');
    el.textContent = formatClock(timeOfDay);
    const b = $('#b-time-play');
    b.classList.toggle('on', timeCycleOn);
    b.setAttribute('aria-pressed', String(timeCycleOn));
    b.textContent = timeCycleOn ? '\u275A\u275A' : '\u25B6';
  }

  function syncMoonLabel() {
    const info = describeMoonPhase(tune.moonph);
    const shortName = info.name.replace('Waxing ', 'Wax ').replace('Waning ', 'Wan ').replace(' Moon', '');
    const el = $('#moon-label');
    el.textContent = `${info.glyph} ${shortName}`;
    el.title = `Lunar phase: ${info.name}`;
  }

  function syncFeatureLabels() {
    $('#tint-label').textContent = `Tint ${Math.round((tune.tint ?? 0.72) * 100)}%`;
    $('#water-amt-label').textContent = (waterMode === 4 || waterAmount <= 0.005) ? 'Off' : `${Math.round(waterAmount * 100)}%`;
    $('#shoredist-label').textContent = `${shoreDist.toFixed(1)}\u00D7`;
    $('#cloud-label').textContent = tune.clouds <= 0.005 ? 'Off' : `${Math.round(tune.clouds * 100)}%`;
    $('#cloudelev-label').textContent = `${(tune.cloudElev ?? 1).toFixed(2)}\u00D7`;
    $('#cloudrange-label').textContent = `${(tune.cloudRange ?? 1).toFixed(2)}\u00D7`;
    $('#cloud-lac-label').textContent = `Lac ${(tune.cloudLac ?? 2.08).toFixed(2)}`;
    $('#traffspeed-label').textContent = trafficSpeed <= 0.01 ? 'Paused' : `${trafficSpeed.toFixed(2)}\u00D7`;
    $('#dayspeed-label').textContent = `${daySpeed.toFixed(2)}\u00D7`;
    $('#transit-label').textContent = transitAmt <= 0.01 ? 'Off' : `${Math.round(transitAmt * 100)}%`;
    $('#maritime-label').textContent = maritimeAmt <= 0.01 ? 'Off' : `${Math.round(maritimeAmt * 100)}%`;
    $('#air-label').textContent = airAmt <= 0.01 ? 'Off' : `${Math.round(airAmt * 100)}%`;
    $('#signs-label').textContent = signAmt <= 0.01 ? 'Off' : `${Math.round(signAmt * 100)}%`;
    $('#megawrap-label').textContent = megaWrap <= 0.01 ? 'Off' : `${Math.round(megaWrap * 100)}%`;
    $('#sign-anim-label').textContent = (tune.signAnim ?? 1) <= 0.01 ? 'Static' : `${(tune.signAnim ?? 1).toFixed(1)}\u00D7`;
    $('#searchlights-label').textContent = (tune.searchLight ?? 1) <= 0.01 ? 'Off' : `${Math.round((tune.searchLight ?? 1) * 100)}%`;
    $('#trafflights-label').textContent = (tune.trafficLight ?? 1) <= 0.01 ? 'Off' : `${Math.round((tune.trafficLight ?? 1) * 100)}%`;
    $('#vehlights-label').textContent = (tune.vehLight ?? 1) <= 0.01 ? 'Off' : `${Math.round((tune.vehLight ?? 1) * 100)}%`;
    $('#lights-label').textContent = (tune.lights ?? 1) <= 0.01 ? 'Off' : `${Math.round((tune.lights ?? 1) * 100)}%`;
    $('#veg-cover-label').textContent = vegCover <= 0.01 ? 'Off' : `${Math.round(vegCover * 100)}%`;
    $('#veg-scale-label').textContent = `${vegScale.toFixed(1)}\u00D7`;
    $('#camspeed-label').textContent = `${camSpeed.toFixed(2)}\u00D7`;
    $('#camrad-label').textContent = `${camRadius.toFixed(1)}m`;
    $('#camsmooth-label').textContent = `${Math.round(camSmooth * 100)}%`;
    $('#pathsmooth-label').textContent = `Smooth ${Math.round(pathSmooth * 100)}%`;
  }

  function syncAllSliders() {
    $('#seed-input').value = String(seed);
    $('#sel-look').value = lookId;
    $('#sl-tint').value = String(tune.tint ?? 0.72);
    $('#sel-camstyle').value = String(camStyle);
    $('#sl-camspeed').value = String(camSpeed);
    $('#sl-camrad').value = String(camRadius);
    $('#sl-camsmooth').value = String(camSmooth);
    $('#sl-pathsmooth').value = String(pathSmooth);
    $('#sl-curve').value = String(worldCurve);
    $('#sl-radius').value = String(cityRadius);
    $('#sl-suburbs').value = String(suburbReach);
    $('#sel-water').value = String(waterMode);
    $('#sl-water-amt').value = String(waterAmount);
    $('#sl-shoredist').value = String(shoreDist);
    $('#sel-terrain').value = String(terrainMode);
    $('#sl-relief').value = String(terrainScale);
    $('#sel-trees').value = String(treeMode);
    $('#sl-veg-cover').value = String(vegCover);
    $('#sl-veg-scale').value = String(vegScale);
    $('#sl-height').value = String(heightScale);
    $('#sl-traffic').value = String(trafficToSlider(tune.traffic));
    $('#sl-traffspeed').value = String(trafficSpeed);
    $('#sl-transit').value = String(transitAmt);
    $('#sl-maritime').value = String(maritimeAmt);
    $('#sl-air').value = String(airAmt);
    $('#sl-signs').value = String(signAmt);
    $('#sl-megawrap').value = String(megaWrap);
    $('#sel-glyph').value = String(tune.glyphStyle ?? 0);
    $('#sl-sign-anim').value = String(tune.signAnim ?? 1);
    $('#sl-searchlights').value = String(tune.searchLight ?? 1);
    $('#sl-trafflights').value = String(tune.trafficLight ?? 1);
    $('#sl-vehlights').value = String(tune.vehLight ?? 1);
    $('#sl-win').value = String(tune.win);
    $('#sl-glow').value = String(tune.glow);
    $('#sl-fog').value = String(tune.fog);
    $('#sl-lights').value = String(tune.lights);
    $('#sl-clouds').value = String(tune.clouds);
    $('#sl-cloudelev').value = String(tune.cloudElev ?? 1);
    $('#sl-cloudrange').value = String(tune.cloudRange ?? 1);
    $('#sl-cloud-seed').value = String(tune.cloudSeed ?? 0);
    $('#sl-cloud-evol').value = String(tune.cloudEvol ?? 0.35);
    $('#sl-cloud-lac').value = String(tune.cloudLac ?? 2.08);
    $('#sl-haze').value = String(tune.haze);
    $('#sl-sun').value = String(tune.sun);
    $('#sl-vib').value = String(tune.vib);
    $('#sl-time').value = String(timeOfDay);
    $('#sl-dayspeed').value = String(daySpeed);
    $('#sl-dust').value = String(dustLevel);
    $('#sl-weather').value = String(weatherMode);
    $('#sel-cloudtype').value = String(tune.cloudType ?? 0);
    $('#sel-cloudstyle').value = String(tune.cloudStyle);
    $('#sl-moon').value = String(tune.moon);
    $('#sl-moonsz').value = String(tune.moonsz);
    $('#sl-moonph').value = String(tune.moonph);
    syncPostSliders();
    syncWeatherLabel();
    syncTimeLabel();
    syncMoonLabel();
    syncWorldGeometry();
    syncTrafficLabel();
    syncFeatureLabels();
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
      artStyle: postState.artStyle ?? 0,
      artStrength: postState.artStrength ?? 1.0,
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

  function refreshLook(loadLookGrade = false, skipURL = false) {
    const look = LOOK_BY_ID[lookId];
    if (loadLookGrade && look.grade) {
      postState.bloom = look.grade.bloom;
      postState.lens = look.grade.lens;
      postState.contrast = look.grade.contrast;
      postState.temp = look.grade.temp;
      postState.film = look.grade.film;
      syncPostSliders();
    }
    const effClouds = tune.clouds <= 0.005
      ? 0
      : (weatherMode === 2 || weatherMode === 6 ? Math.max(tune.clouds, 1.35) : tune.clouds);
    const effType = weatherMode === 2 && (tune.cloudType ?? 0) === 0 ? 1 : (tune.cloudType ?? 0);
    const effStyle = weatherMode === 6 && tune.cloudStyle === 0 ? 1 : tune.cloudStyle;
    const lookTune = {
      ...tune,
      clouds: effClouds,
      cloudType: effType,
      cloudStyle: effStyle,
      signAmt,
      megaWrap,
    };
    applyLook(U, look, lookTune);
    applyTime(U, look, timeOfDay, { ...lookTune, sat: tune.vib });
    if (searchlights && searchlights.syncBaseFromLook) {
      searchlights.syncBaseFromLook((look.signals && look.signals.beamK) ?? 0.22);
      searchlights.setAmount(tune.searchLight ?? 1);
    }
    if (streetInfraObj) {
      streetInfraObj.setLook(look);
      streetInfraObj.setSignalGlow(tune.trafficLight ?? 1);
    }
    if (world.clouds) world.clouds.visible = U.uCloud.value > 0.008;
    if (billboards) billboards.visible = signAmt > 0.01;
    if (signGroup) signGroup.visible = signAmt > 0.01;
    if (holoGroup) holoGroup.visible = signAmt > 0.01;
    if (landmarkGroup && landmarkGroup.setLook) landmarkGroup.setLook(look);
    if (placeGroup && placeGroup.setLook) placeGroup.setLook(look);
    if (transitGroup && transitGroup.setLook) transitGroup.setLook(look);
    if (bridgeGroup && bridgeGroup.setLook) bridgeGroup.setLook(look);
    if (harborObj && harborObj.setLook) harborObj.setLook(look);
    if (spaceportObj && spaceportObj.setLook) spaceportObj.setLook(look);
    if (trees) trees.setNature(look, treeMode);
    if (vehicles) vehicles.setPalette(look);
    if (weather) weather.setTint(look);
    if (minimap) minimap.setLook(look);
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
    syncTimeLabel();
    syncMoonLabel();
    syncFeatureLabels();
    syncPostUniforms(look);
    if (!skipURL) syncURL();
  }

  function syncURL(includeExactToken = false) {
    const p = new URLSearchParams();
    p.set('seed', String(seed));
    p.set('look', lookId);
    p.set('r', String(cityRadius));
    p.set('t', timeOfDay.toFixed(1));
    if (Math.abs(suburbReach - 1) > 0.01) p.set('sub', suburbReach.toFixed(2));
    if (waterMode !== 1) p.set('wm', String(waterMode));
    if (Math.abs(waterAmount - 1) > 0.02) p.set('wa', waterAmount.toFixed(2));
    if (Math.abs(shoreDist - 1) > 0.02) p.set('sd', shoreDist.toFixed(2));
    if (terrainMode !== 0) p.set('tm', String(terrainMode));
    if (Math.abs(terrainScale - 1) > 0.02) p.set('ts', terrainScale.toFixed(2));
    if (treeMode > 0) p.set('tr', String(treeMode));
    if (Math.abs(vegCover - 1) > 0.02) p.set('vc', vegCover.toFixed(2));
    if (Math.abs(vegScale - 1) > 0.02) p.set('vs', vegScale.toFixed(2));
    if (Math.abs(transitAmt - 1) > 0.02) p.set('pt', transitAmt.toFixed(2));
    if (Math.abs(maritimeAmt - 1) > 0.02) p.set('hr', maritimeAmt.toFixed(2));
    if (Math.abs(airAmt - 1) > 0.02) p.set('ap', airAmt.toFixed(2));
    if (Math.abs(signAmt - 1) > 0.02) p.set('sg', signAmt.toFixed(2));
    if (Math.abs(megaWrap - 1) > 0.02) p.set('mw', megaWrap.toFixed(2));
    if (Math.abs((tune.clouds ?? 1) - 1) > 0.02) p.set('cl', (tune.clouds ?? 1).toFixed(2));
    if ((tune.glyphStyle ?? 0) > 0) p.set('gl', String(tune.glyphStyle));
    if (worldCurve > 0.005) p.set('curve', worldCurve.toFixed(2));
    if (weatherMode > 0) p.set('w', String(weatherMode));
    if ((tune.cloudType ?? 0) > 0) p.set('ct', String(tune.cloudType));
    if (tune.cloudStyle > 0) p.set('cs', String(tune.cloudStyle));
    if ((postState.artStyle ?? 0) > 0) {
      p.set('art', String(postState.artStyle));
      if (Math.abs((postState.artStrength ?? 1) - 1) > 0.02) {
        p.set('as', (postState.artStrength ?? 1).toFixed(2));
      }
    }
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
      waterMode,
      waterAmount,
      shoreDist,
      terrainMode,
      terrainScale,
      treeMode,
      vegCover,
      vegScale,
      transitAmt,
      maritimeAmt,
      airAmt,
      signAmt,
      megaWrap,
      worldCurve,
      heightScale,
      timeOfDay,
      dayCycle: timeCycleOn,
      daySpeed,
      trafficSpeed,
      weatherMode,
      dustLevel,
      glide: glideOn,
      freelook: freelookOn,
      collide: collideOn,
      avoidance: avoidOn,
      camSpeed,
      camRadius,
      camSmooth,
      camStyle,
      pathSmooth,
      tune: { ...tune },
      post: { ...postState },
      custom: LOOK_BY_ID.custom.customConfig ? { ...LOOK_BY_ID.custom.customConfig } : { ...DEFAULT_CUSTOM },
      camera: controls.getPose(),
      bookmarks,
      path: pathRecorder.hasPath ? pathRecorder.toJSON() : undefined,
    });
  }

  function applyStateObject(raw, { applyCamera = true, applyBookmarks = false } = {}) {
    const st = normalizeExactState(raw);
    const needRebuild = (
      st.seed !== seed ||
      st.cityRadius !== cityRadius ||
      Math.abs(st.suburbReach - suburbReach) > 1e-3 ||
      st.waterMode !== waterMode ||
      Math.abs(st.waterAmount - waterAmount) > 1e-2 ||
      Math.abs(st.shoreDist - shoreDist) > 1e-2 ||
      st.terrainMode !== terrainMode ||
      Math.abs(st.terrainScale - terrainScale) > 1e-2 ||
      Math.abs(st.vegCover - vegCover) > 1e-2 ||
      Math.abs(st.vegScale - vegScale) > 1e-2 ||
      Math.abs(st.transitAmt - transitAmt) > 1e-2 ||
      Math.abs(st.maritimeAmt - maritimeAmt) > 1e-2 ||
      Math.abs(st.airAmt - airAmt) > 1e-2 ||
      Math.abs(st.signAmt - signAmt) > 1e-2 ||
      Math.abs(st.megaWrap - megaWrap) > 1e-2
    );
    seed = st.seed;
    lookId = st.lookId;
    if (lookId !== 'custom') prevPresetLookId = lookId;
    cityRadius = st.cityRadius;
    suburbReach = st.suburbReach;
    waterMode = st.waterMode;
    waterAmount = st.waterAmount;
    shoreDist = st.shoreDist;
    terrainMode = st.terrainMode;
    terrainScale = st.terrainScale;
    treeMode = st.treeMode;
    vegCover = st.vegCover;
    vegScale = st.vegScale;
    transitAmt = st.transitAmt;
    maritimeAmt = st.maritimeAmt;
    airAmt = st.airAmt;
    signAmt = st.signAmt;
    megaWrap = st.megaWrap;
    worldCurve = st.worldCurve;
    heightScale = st.heightScale;
    timeOfDay = st.timeOfDay;
    timeCycleOn = !!st.dayCycle;
    daySpeed = st.daySpeed ?? 1;
    trafficSpeed = st.trafficSpeed ?? 1;
    camSpeed = st.camSpeed ?? 1;
    camRadius = st.camRadius ?? 2.2;
    camSmooth = st.camSmooth ?? 0.72;
    camStyle = st.camStyle ?? 0;
    pathSmooth = st.pathSmooth ?? 0.65;
    controls.speedMul = camSpeed;
    controls.colliderRadius = camRadius;
    controls.smoothness = camSmooth;
    controls.motionStyle = camStyle;
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
      if (vehicles && vehicles.setTrafficSpeed) vehicles.setTrafficSpeed(trafficSpeed);
    }
    refreshLook(false);

    if (st.avoidance !== avoidOn) setAvoidanceState(st.avoidance);
    if (st.collide !== collideOn) setCollisionState(st.collide);
    if (st.glide !== glideOn) setGlideState(st.glide);
    if (!!st.freelook !== freelookOn) setFreelookState(!!st.freelook);

    if (applyBookmarks && st.bookmarks && st.bookmarks.length) {
      bookmarks = st.bookmarks.map((b) => ({ ...b }));
      writeStorageJSON(STORAGE_BOOKMARKS_KEY, bookmarks);
      renderBookmarks();
    }
    if (applyCamera && st.camera) {
      fly = null;
      controls.setPose(st.camera);
    }
    if (st.path) {
      pathRecorder.fromJSON(st.path);
      persistPath();
      syncPathUI();
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
    tune.tint = LOOK_BY_ID[lookId].defTint ?? 0.72;
    $('#sl-time').value = String(timeOfDay);
    $('#sl-tint').value = String(tune.tint);
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
    // Allow pasting a standalone camera path JSON directly into the import field!
    if (raw.startsWith('{')) {
      try {
        const maybeObj = JSON.parse(raw);
        if (maybeObj && (Array.isArray(maybeObj.frames) || Array.isArray(maybeObj.k)) && maybeObj.seed === undefined) {
          if (pathRecorder.fromJSON(maybeObj)) {
            persistPath();
            syncPathUI();
            flash(`Loaded camera path (${pathRecorder.count} kf · ${pathRecorder.duration.toFixed(1)}s)`);
            return;
          }
        }
      } catch {
        /* fall through to full state decode */
      }
    }
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
  $('#b-fold-all').onclick = () => {
    const panels = Array.from(document.querySelectorAll('details.subpanel'));
    const anyOpen = panels.some((d) => d.open);
    panels.forEach((d) => { d.open = !anyOpen; });
    $('#b-fold-all').textContent = anyOpen ? '\u229E' : '\u229F';
    flash(anyOpen ? 'Collapsed subpanels' : 'Expanded all subpanels');
  };
  const toggleTimeCycle = () => {
    timeCycleOn = !timeCycleOn;
    syncTimeLabel();
    if (!timeCycleOn) syncURL();
    flash(timeCycleOn ? '\u25B6 24h Celestial Cycle running' : `Time paused · ${formatClock(timeOfDay)}`);
  };
  $('#b-time-play').onclick = toggleTimeCycle;

  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.key === 'h' || e.key === 'H') toggleUI();
    else if (e.key === 'g' || e.key === 'G') toggleGlide();
    else if (e.key === 'l' || e.key === 'L') toggleFreelook();
    else if (e.key === 'v' || e.key === 'V') toggleAvoidance();
    else if (e.key === 'c' || e.key === 'C') toggleCollision();
    else if (e.key === 't' || e.key === 'T') toggleTimeCycle();
    else if (e.key === 'r' || e.key === 'R') togglePathRecord();
    else if (e.key === 'p' || e.key === 'P') togglePathPlay();
    else if (e.key === 'k' || e.key === 'K') addPathKeyframe();
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
  bindSlider($('#sl-tint'), (v) => {
    tune.tint = clampFloat(v, 0, 1, 0.72);
    refreshLook();
  });
  $('#sel-camstyle').value = String(camStyle);
  $('#sel-camstyle').onchange = (ev) => {
    camStyle = clampInt(ev.target.value, 0, 3, 0);
    controls.motionStyle = camStyle;
    flash(`Camera · ${CAMERA_STYLE_NAMES[camStyle] || 'Cinematic Glide'}`);
  };
  bindSlider($('#sl-camspeed'), (v) => {
    camSpeed = clampFloat(v, 0.2, 3.5, 1);
    controls.speedMul = camSpeed;
    syncFeatureLabels();
  });
  bindSlider($('#sl-camrad'), (v) => {
    camRadius = clampFloat(v, 0.5, 12, 2.2);
    controls.colliderRadius = camRadius;
    syncFeatureLabels();
  });
  bindSlider($('#sl-camsmooth'), (v) => {
    camSmooth = clampFloat(v, 0, 1, 0.72);
    controls.smoothness = camSmooth;
    syncFeatureLabels();
  });
  bindSlider($('#sl-curve'), (v) => {
    worldCurve = clampFloat(v, 0, 1, 0);
    syncWorldGeometry();
    syncGlideNode();
    syncURL();
  });
  bindSlider($('#sl-radius'), (v) => { cityRadius = clampInt(v, 1, 15, cityRadius); rebuild(); });
  bindSlider($('#sl-suburbs'), (v) => { suburbReach = clampFloat(v, 0, 1.6, suburbReach); rebuild(); });
  $('#sel-water').value = String(waterMode);
  $('#sel-water').onchange = (ev) => {
    waterMode = clampInt(ev.target.value, 0, 4, 1);
    rebuild();
    syncFeatureLabels();
    flash(`Water · ${WATER_MODE_NAMES[waterMode] || 'Shoreline'}`);
  };
  bindSlider($('#sl-water-amt'), (v) => {
    waterAmount = clampFloat(v, 0, 2, 1);
    U.uWaterAmt.value = waterAmount;
    if (waterGroup) waterGroup.visible = waterMode !== 4 && waterAmount > 0.005;
    syncFeatureLabels();
  });
  $('#sl-water-amt').onchange = () => {
    waterAmount = clampFloat($('#sl-water-amt').value, 0, 2, 1);
    rebuild();
  };
  bindSlider($('#sl-shoredist'), (v) => {
    shoreDist = clampFloat(v, 0.35, 2.5, 1);
    U.uShoreDist.value = shoreDist;
    syncFeatureLabels();
  });
  $('#sl-shoredist').onchange = () => {
    shoreDist = clampFloat($('#sl-shoredist').value, 0.35, 2.5, 1);
    rebuild();
  };
  $('#sel-terrain').value = String(terrainMode);
  $('#sel-terrain').onchange = (ev) => {
    terrainMode = clampInt(ev.target.value, 0, 4, 0);
    rebuild();
    flash(`Terrain · ${TERRAIN_MODE_NAMES[terrainMode] || 'Relief'}`);
  };
  bindSlider($('#sl-relief'), (v) => {
    terrainScale = clampFloat(v, 0, 2, 1);
    U.uTerrainScale.value = terrainScale;
  });
  $('#sl-relief').onchange = () => {
    terrainScale = clampFloat($('#sl-relief').value, 0, 2, 1);
    rebuild();
  };
  $('#sel-trees').value = String(treeMode);
  $('#sel-trees').onchange = (ev) => {
    treeMode = clampInt(ev.target.value, 0, 3, 0);
    if (trees) trees.setNature(LOOK_BY_ID[lookId], treeMode);
    syncURL();
    flash(`Parks · ${TREE_MODE_NAMES[treeMode] || 'Auto'}`);
  };
  bindSlider($('#sl-veg-cover'), (v) => {
    vegCover = clampFloat(v, 0, 2.4, 1);
    if (trees && trees.group) trees.group.visible = vegCover > 0.008;
    syncFeatureLabels();
  });
  $('#sl-veg-cover').onchange = () => {
    vegCover = clampFloat($('#sl-veg-cover').value, 0, 2.4, 1);
    rebuild();
  };
  bindSlider($('#sl-veg-scale'), (v) => {
    vegScale = clampFloat(v, 0.4, 4.5, 1);
    if (trees && trees.setScale) trees.setScale(vegScale);
    syncFeatureLabels();
  });
  $('#sl-veg-scale').onchange = () => {
    vegScale = clampFloat($('#sl-veg-scale').value, 0.4, 4.5, 1);
    rebuild();
  };
  bindSlider($('#sl-height'), (v) => { heightScale = v; applyHeight(); });
  bindSlider($('#sl-traffic'), (v) => {
    tune.traffic = sliderToTraffic(v);
    if (vehicles) vehicles.update(0, tune.traffic, heightScale);
    syncTrafficLabel();
  });
  bindSlider($('#sl-traffspeed'), (v) => {
    trafficSpeed = clampFloat(v, 0, 3, 1);
    if (vehicles && vehicles.setTrafficSpeed) vehicles.setTrafficSpeed(trafficSpeed);
    else U.uTrafficSpeed.value = trafficSpeed;
    syncFeatureLabels();
  });
  bindSlider($('#sl-transit'), (v) => {
    transitAmt = clampFloat(v, 0, 2.5, 1);
    if (vehicles && vehicles.setTransitAmt) vehicles.setTransitAmt(transitAmt);
    if (transitGroup) transitGroup.visible = transitAmt > 0.01;
    syncFeatureLabels();
  });
  $('#sl-transit').onchange = () => {
    transitAmt = clampFloat($('#sl-transit').value, 0, 2.5, 1);
    rebuild();
  };
  bindSlider($('#sl-maritime'), (v) => {
    maritimeAmt = clampFloat(v, 0, 2.5, 1);
    if (harborObj && harborObj.group) harborObj.group.visible = maritimeAmt > 0.01 && waterMode !== 4 && waterAmount > 0.005;
    syncFeatureLabels();
  });
  $('#sl-maritime').onchange = () => {
    maritimeAmt = clampFloat($('#sl-maritime').value, 0, 2.5, 1);
    rebuild();
  };
  bindSlider($('#sl-air'), (v) => {
    airAmt = clampFloat(v, 0, 2.5, 1);
    if (spaceportObj && spaceportObj.group) spaceportObj.group.visible = airAmt > 0.01;
    syncFeatureLabels();
  });
  $('#sl-air').onchange = () => {
    airAmt = clampFloat($('#sl-air').value, 0, 2.5, 1);
    rebuild();
  };
  bindSlider($('#sl-signs'), (v) => {
    signAmt = clampFloat(v, 0, 2.5, 1);
    U.uSignAmt.value = signAmt;
    if (billboards) billboards.visible = signAmt > 0.01;
    if (signGroup) signGroup.visible = signAmt > 0.01;
    if (holoGroup) holoGroup.visible = signAmt > 0.01;
    syncFeatureLabels();
  });
  $('#sl-signs').onchange = () => {
    signAmt = clampFloat($('#sl-signs').value, 0, 2.5, 1);
    rebuild();
  };
  bindSlider($('#sl-megawrap'), (v) => {
    megaWrap = clampFloat(v, 0, 2.2, 1);
    U.uMegaWrap.value = megaWrap;
    syncFeatureLabels();
  });
  $('#sl-megawrap').onchange = () => {
    megaWrap = clampFloat($('#sl-megawrap').value, 0, 2.2, 1);
    rebuild();
  };
  $('#sel-glyph').value = String(tune.glyphStyle ?? 0);
  $('#sel-glyph').onchange = (ev) => {
    tune.glyphStyle = clampInt(ev.target.value, 0, 2, 0);
    refreshLook();
    flash(`Script · ${GLYPH_STYLE_NAMES[tune.glyphStyle] || 'Linear-Synth'}`);
  };
  bindSlider($('#sl-sign-anim'), (v) => {
    tune.signAnim = clampFloat(v, 0, 2.5, 1);
    refreshLook();
  });
  bindSlider($('#sl-searchlights'), (v) => {
    tune.searchLight = clampFloat(v, 0, 2.5, 1);
    if (searchlights && searchlights.setAmount) searchlights.setAmount(tune.searchLight);
    syncFeatureLabels();
  });
  bindSlider($('#sl-trafflights'), (v) => {
    tune.trafficLight = clampFloat(v, 0, 2.5, 1);
    if (streetInfraObj && streetInfraObj.setSignalGlow) streetInfraObj.setSignalGlow(tune.trafficLight);
    syncFeatureLabels();
  });
  bindSlider($('#sl-vehlights'), (v) => {
    tune.vehLight = clampFloat(v, 0, 2.5, 1);
    U.uVehLight.value = tune.vehLight;
    syncFeatureLabels();
  });
  bindSlider($('#sl-win'), (v) => { tune.win = v; refreshLook(); });
  bindSlider($('#sl-glow'), (v) => { tune.glow = v; refreshLook(); });
  bindSlider($('#sl-fog'), (v) => { tune.fog = v; refreshLook(); });
  bindSlider($('#sl-lights'), (v) => { tune.lights = v; refreshLook(); });
  bindSlider($('#sl-clouds'), (v) => { tune.clouds = v; refreshLook(); });
  bindSlider($('#sl-cloudelev'), (v) => { tune.cloudElev = clampFloat(v, 0.35, 2.4, 1); refreshLook(); });
  bindSlider($('#sl-cloudrange'), (v) => { tune.cloudRange = clampFloat(v, 0.3, 3.0, 1); refreshLook(); });
  bindSlider($('#sl-cloud-seed'), (v) => { tune.cloudSeed = v; refreshLook(); });
  bindSlider($('#sl-cloud-evol'), (v) => { tune.cloudEvol = v; refreshLook(); });
  bindSlider($('#sl-cloud-lac'), (v) => { tune.cloudLac = v; refreshLook(); });
  bindSlider($('#sl-haze'), (v) => { tune.haze = v; refreshLook(); });
  bindSlider($('#sl-sun'), (v) => { tune.sun = v; refreshLook(); });
  bindSlider($('#sl-vib'), (v) => { tune.vib = v; refreshLook(); });
  bindSlider($('#sl-time'), (v) => { timeOfDay = v; refreshLook(); });
  bindSlider($('#sl-dayspeed'), (v) => {
    daySpeed = clampFloat(v, 0.05, 5, 1);
    syncFeatureLabels();
  });
  bindSlider($('#sl-weather'), (v) => {
    weatherMode = Math.round(v);
    weather.setMode(weatherMode);
    syncWeatherLabel();
    refreshLook();
  });
  $('#sel-cloudtype').value = String(tune.cloudType ?? 0);
  $('#sel-cloudtype').onchange = (ev) => {
    tune.cloudType = clampInt(ev.target.value, 0, 5, 0);
    refreshLook();
    flash(`Clouds · ${CLOUD_TYPE_NAMES[tune.cloudType] || 'Cumulus'}`);
  };
  $('#sel-cloudstyle').value = String(tune.cloudStyle);
  $('#sel-cloudstyle').onchange = (ev) => {
    tune.cloudStyle = clampInt(ev.target.value, 0, 6, 0);
    refreshLook();
  };
  bindSlider($('#sl-dust'), (v) => { dustLevel = v; weather.setDust(v); });
  bindSlider($('#sl-moon'), (v) => { tune.moon = v; refreshLook(); });
  bindSlider($('#sl-moonsz'), (v) => { tune.moonsz = v; refreshLook(); });
  bindSlider($('#sl-moonph'), (v) => { tune.moonph = v; refreshLook(); });

  // Artistic & diagnostic render styles + Post-processing & old-film sliders
  $('#sel-art').value = String(postState.artStyle ?? 0);
  $('#sel-art').onchange = (ev) => {
    postState.artStyle = clampInt(ev.target.value, 0, 5, 0);
    syncPostUniforms(LOOK_BY_ID[lookId]);
    syncURL();
    flash(`Render Style · ${ART_STYLE_NAMES[postState.artStyle] || 'Cinema'}`);
  };
  bindSlider($('#sl-artstr'), (v) => {
    postState.artStrength = v;
    syncPostUniforms(LOOK_BY_ID[lookId]);
  });
  bindSlider($('#sl-bloom'), (v) => { postState.bloom = v; syncPostUniforms(LOOK_BY_ID[lookId]); });
  bindSlider($('#sl-lens'), (v) => { postState.lens = v; syncPostUniforms(LOOK_BY_ID[lookId]); });
  bindSlider($('#sl-contrast'), (v) => { postState.contrast = v; syncPostUniforms(LOOK_BY_ID[lookId]); });
  bindSlider($('#sl-temp'), (v) => { postState.temp = v; syncPostUniforms(LOOK_BY_ID[lookId]); });
  bindSlider($('#sl-film'), (v) => { postState.film = v; syncPostUniforms(LOOK_BY_ID[lookId]); });

  /* ------------------------------ scene render export & path recorder */

  let renderingPathVideo = false;
  let savedLoopBeforeRender = true;

  function persistPath() {
    try {
      if (!window.localStorage) return;
      if (pathRecorder.hasPath) {
        window.localStorage.setItem(STORAGE_PATH_KEY, JSON.stringify(pathRecorder.toJSON()));
      } else {
        window.localStorage.removeItem(STORAGE_PATH_KEY);
      }
    } catch {
      /* ignore sandboxed storage */
    }
  }

  function syncPathUI() {
    const rec = pathRecorder.recording;
    const play = pathRecorder.playing;
    const has = pathRecorder.hasPath;
    const kfCount = pathRecorder.count;
    const dur = pathRecorder.duration;

    const bRec = $('#b-rec');
    bRec.classList.toggle('rec-on', rec);
    bRec.setAttribute('aria-pressed', String(rec));
    bRec.textContent = rec ? '\u25A0' : '\u25CF';
    bRec.title = rec ? 'Stop recording camera path (R)' : 'Record live camera flight path (R)';

    const bPlay = $('#b-play');
    bPlay.disabled = !has || rec;
    bPlay.classList.toggle('on', play);
    bPlay.setAttribute('aria-pressed', String(play));
    bPlay.textContent = play ? '\u275A\u275A' : '\u25B6';

    const bLoop = $('#b-loop');
    bLoop.classList.toggle('on', pathRecorder.loop);
    bLoop.setAttribute('aria-pressed', String(pathRecorder.loop));

    $('#b-path-exp').disabled = !has;
    $('#b-path-clear').disabled = kfCount === 0 && !rec;
    $('#b-path-render').disabled = !has || rec || renderingPathVideo;
    $('#b-path-render').classList.toggle('rec-on', renderingPathVideo);
    $('#b-pathsmooth').disabled = !has || rec;

    const scrub = $('#sl-scrub');
    scrub.disabled = !has || rec;
    if (has && dur > 0) {
      scrub.value = String(Math.max(0, Math.min(1, pathRecorder.playhead / dur)));
    } else {
      scrub.value = '0';
    }

    const lbl = $('#path-label');
    if (rec) {
      lbl.textContent = `REC ${dur.toFixed(1)}s`;
    } else if (play && dur > 0) {
      lbl.textContent = `${pathRecorder.playhead.toFixed(1)}/${dur.toFixed(1)}s`;
    } else if (has) {
      lbl.textContent = `${kfCount}kf · ${dur.toFixed(1)}s`;
    } else if (kfCount === 1) {
      lbl.textContent = '1 kf (+1 more)';
    } else {
      lbl.textContent = '0 kf';
    }
  }

  function syncVidBtn() {
    const on = exporter.capturingVideo;
    const b = $('#b-vid');
    b.classList.toggle('rec-on', on);
    b.setAttribute('aria-pressed', String(on));
    b.textContent = on ? '\u25A0 Stop' : '\u25CF Vid';
  }

  function togglePathRecord() {
    if (renderingPathVideo) return;
    if (pathRecorder.recording) {
      pathRecorder.stopRecording(camera);
      persistPath();
      syncPathUI();
      flash(`Recorded path · ${pathRecorder.count} kf (${pathRecorder.duration.toFixed(1)}s)`);
    } else {
      pathRecorder.startRecording(camera);
      syncPathUI();
      flash('\u25CF Recording camera flight path…');
    }
  }

  function addPathKeyframe() {
    if (pathRecorder.recording) return;
    pathRecorder.addKeyframe(camera);
    persistPath();
    syncPathUI();
    flash(`Added keyframe #${pathRecorder.count} (${pathRecorder.duration.toFixed(1)}s)`);
  }

  function togglePathPlay() {
    if (!pathRecorder.hasPath || pathRecorder.recording) return;
    if (pathRecorder.playing) {
      pathRecorder.pause();
      controls.syncFromCamera();
      if (renderingPathVideo) {
        renderingPathVideo = false;
        pathRecorder.loop = savedLoopBeforeRender;
        exporter.stopVideoCapture();
        syncVidBtn();
      }
      syncPathUI();
      flash('Path paused');
    } else {
      fly = null;
      if (glideOn) setGlideState(false, false);
      pathRecorder.play();
      syncPathUI();
      flash('\u25B6 Playing camera path');
    }
  }

  $('#b-rec').onclick = togglePathRecord;
  $('#b-kf-add').onclick = addPathKeyframe;
  $('#b-play').onclick = togglePathPlay;
  $('#b-loop').onclick = () => {
    pathRecorder.loop = !pathRecorder.loop;
    persistPath();
    syncPathUI();
    flash(pathRecorder.loop ? 'Path loop: on' : 'Path loop: once');
  };
  $('#b-path-exp').onclick = () => {
    if (!pathRecorder.hasPath) return;
    const json = JSON.stringify(pathRecorder.toJSON(), null, 2);
    $('#export-text').value = json;
    try {
      const blob = new Blob([json], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `petacity-path-${seed}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1500);
      flash('Exported camera path JSON');
    } catch {
      flash('Path JSON written to export field');
    }
  };
  $('#b-path-clear').onclick = () => {
    pathRecorder.clear();
    persistPath();
    syncPathUI();
    flash('Cleared camera path');
  };
  bindSlider($('#sl-scrub'), (v) => {
    if (!pathRecorder.hasPath) return;
    if (pathRecorder.playing) pathRecorder.pause();
    fly = null;
    const tSec = v * pathRecorder.duration;
    pathRecorder.applyAt(tSec, camera, controls);
    syncPathUI();
  });
  bindSlider($('#sl-pathsmooth'), (v) => {
    pathSmooth = clampFloat(v, 0, 1, 0.65);
    syncFeatureLabels();
    if (pathRecorder.hasPath && !pathRecorder.recording) {
      pathRecorder.smoothPath(pathSmooth);
      if (!pathRecorder.playing) pathRecorder.applyAt(pathRecorder.playhead, camera, controls);
    }
  });
  $('#b-pathsmooth').onclick = () => {
    if (!pathRecorder.hasPath || pathRecorder.recording) return;
    pathRecorder.smoothPath(pathSmooth);
    persistPath();
    if (!pathRecorder.playing) pathRecorder.applyAt(pathRecorder.playhead, camera, controls);
    syncPathUI();
    flash(`Smoothed camera path · ${Math.round(pathSmooth * 100)}% cinematic spline`);
  };

  // Scene Render Export: high-res clean PNG still + live WebM/MP4 video + automated Path->Video render!
  $('#b-snap').onclick = async () => {
    const resPreset = $('#sel-res').value || '1080p';
    const fname = `petacity-${seed}-${lookId}-${resPreset}.png`;
    try {
      const info = await exporter.captureStillPNG(resPreset, fname);
      flash(`Saved ${info.width}\u00D7${info.height} PNG render`);
    } catch (err) {
      flash('PNG render failed: ' + ((err && err.message) || err));
    }
  };

  $('#b-vid').onclick = async () => {
    if (exporter.capturingVideo) {
      renderingPathVideo = false;
      const res = await exporter.stopVideoCapture();
      syncVidBtn();
      syncPathUI();
      flash(res ? 'Saved scene video capture' : 'Video capture stopped');
    } else {
      const fname = `petacity-${seed}-${lookId}.webm`;
      const started = exporter.startVideoCapture({ fps: 60, filename: fname });
      syncVidBtn();
      flash(`Recording ${started.ext.toUpperCase()} scene video…`);
    }
  };

  $('#b-path-render').onclick = () => {
    if (!pathRecorder.hasPath || pathRecorder.recording || renderingPathVideo) return;
    fly = null;
    if (glideOn) setGlideState(false, false);
    savedLoopBeforeRender = pathRecorder.loop;
    pathRecorder.loop = false;
    renderingPathVideo = true;
    pathRecorder.applyAt(0, camera, controls);
    const fname = `petacity-path-${seed}-${lookId}.webm`;
    exporter.startVideoCapture({ fps: 60, filename: fname });
    pathRecorder.play(true);
    syncVidBtn();
    syncPathUI();
    flash(`Rendering ${pathRecorder.duration.toFixed(1)}s camera path to video…`);
  };
  syncPathUI();
  syncVidBtn();

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
    if (city.suburbPOIs && city.suburbPOIs.length) {
      for (const sp of city.suburbPOIs.slice(0, 3)) {
        const gY = cityCollider && cityCollider.groundHeightAt ? cityCollider.groundHeightAt(sp.x, sp.z) : 0;
        pushNode(sp.x, gY + (sp.h || 28) * heightScale + 48, sp.z, sp.name);
      }
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

  function setAvoidanceState(on, announce = false) {
    avoidOn = !!on;
    controls.avoidance = avoidOn;
    const b = $('#b-avoid');
    b.classList.toggle('on', avoidOn);
    b.setAttribute('aria-pressed', String(avoidOn));
    b.title = `Anticipatory shallow-angle obstacle & terrain avoidance: ${avoidOn ? 'on' : 'off'} (V)`;
    if (announce) {
      flash(avoidOn ? '\u2934 Anticipatory steering on' : 'Anticipatory steering off');
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

  function setFreelookState(on, announce = false) {
    freelookOn = !!on;
    controls.setFreelook(freelookOn);
    const b = $('#b-freelook');
    b.classList.toggle('on', freelookOn);
    b.setAttribute('aria-pressed', String(freelookOn));
    b.title = `Free look-around mode — decouple head gaze from flight travel direction: ${freelookOn ? 'on' : 'off'} (L)`;
    if (announce) {
      flash(freelookOn ? '\u25CE Free look-around on (drag to look around freely)' : 'Free look-around off (forward-locked)');
    }
  }

  function toggleGlide() { setGlideState(!glideOn, true); }
  function toggleFreelook() { setFreelookState(!freelookOn, true); }
  function toggleAvoidance() { setAvoidanceState(!avoidOn, true); }
  function toggleCollision() { setCollisionState(!collideOn, true); }
  $('#b-glide').onclick = toggleGlide;
  $('#b-freelook').onclick = toggleFreelook;
  $('#b-avoid').onclick = toggleAvoidance;
  $('#b-collide').onclick = toggleCollision;

  function flyToLandmark(lm) {
    if (!lm) return;
    const dist = lm.kind === 'media' ? Math.max(220, lm.r * 1.15) : Math.max(210, (lm.r || 42) * 4.4);
    const away = new THREE.Vector3(camera.position.x - lm.x, 0, camera.position.z - lm.z);
    if (away.lengthSq() < 1) away.set(1, 0, 1);
    away.normalize().multiplyScalar(dist);
    const terrAtTarget = cityCollider && cityCollider.groundHeightAt ? cityCollider.groundHeightAt(lm.x, lm.z) : 0;
    const terrAtCam = cityCollider && cityCollider.groundHeightAt ? cityCollider.groundHeightAt(lm.x + away.x, lm.z + away.z) : 0;
    const camY = Math.max(terrAtCam + 32, terrAtTarget + (lm.h || 36) * 0.68 * heightScale + 26);
    const lookY = terrAtTarget + (lm.h || 36) * 0.42 * heightScale;
    const to = toCurvedVec(lm.x + away.x, camY, lm.z + away.z);
    const look = toCurvedVec(lm.x, lookY, lm.z);
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
    needle: '\u25B2',
    obelisk: '\u25B2',
    pyramid: '\u25B3',
    cantilever: '\u25E7',
    ziggurat: '\u25EC',
    mast: '\u2316',
    crown: '\u265B',
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
    park: '\u2740',
    station: '\u21C4',
    suburb: '\u2302',
    shop: '\u2302',
    power: '\u26A1\uFE0E',
    farm: '\u25A6',
    shore: '\u2248',
    lighthouse: '\u26EF',
    harbor: '\u2693\uFE0E',
    spaceport: '\u2708\uFE0E',
  };

  function buildPois() {
    const sel = $('#sel-poi');
    sel.innerHTML = '';
    const subSpot = {
      kind: 'suburb',
      name: 'Winding Suburbs',
      x: (city.radius * CELL + (city.suburbSpan || 4200)) * 0.34,
      z: (city.radius * CELL + (city.suburbSpan || 4200)) * 0.28,
      r: 45,
      h: 28,
    };
    const infraSpots = [];
    if (city.harbor) {
      infraSpots.push({
        kind: 'harbor',
        name: 'Deepwater Harbor & Cruise Pier',
        x: city.harbor.x + city.harbor.outX * 85,
        z: city.harbor.z + city.harbor.outZ * 85,
        r: 72,
        h: 48,
      });
    }
    if (city.bridges && city.bridges.length) {
      const b0 = city.bridges[0];
      infraSpots.push({
        kind: 'bridge',
        name: b0.name || 'Grand Estuary Bridge',
        x: b0.cx,
        z: b0.cz,
        r: 55,
        h: b0.towerH || 54,
      });
    }
    if (city.spaceport) {
      infraSpots.push({
        kind: 'spaceport',
        name: 'Orbital Air & Spaceport',
        x: city.spaceport.x,
        z: city.spaceport.z,
        r: 110,
        h: 72,
      });
    }
    if (city.transit && city.transit.stations && city.transit.stations.length) {
      const st0 = city.transit.stations[0];
      infraSpots.push({
        kind: 'station',
        name: st0.name || 'Central Grand Hub',
        x: st0.x,
        z: st0.z,
        r: 36,
        h: st0.y + 18,
      });
    }
    poiList = [
      ...infraSpots,
      ...(city.mediaZone ? [city.mediaZone] : []),
      ...city.landmarks,
      ...city.places.map((p) => ({
        ...p,
        h: p.kind === 'arena' || p.kind === 'stadium' || p.kind === 'theatre' ? 58 : (p.kind === 'park' ? 46 : 42),
      })),
      ...(city.suburbPOIs || []),
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
      // Seamless 120.0s periodic noise cycle — zero jump across wrap!
      U.uTime.value = (U.uTime.value + dt) % 120.0;
      if (timeCycleOn) {
        timeOfDay = (timeOfDay + dt * 0.48 * daySpeed) % 24;
        tune.moonph = ((tune.moonph + dt * 0.032 * daySpeed) % 2 + 2) % 2;
        $('#sl-time').value = String(timeOfDay);
        $('#sl-moonph').value = String(tune.moonph);
        refreshLook(false, true);
      }
      if (pathRecorder.playing) {
        // User manual input gracefully interrupts path playback unless rendering a path video
        const manualBreak = !renderingPathVideo && (controls.keys.size || controls._drag);
        if (manualBreak) {
          pathRecorder.pause();
          controls.syncFromCamera();
          syncPathUI();
        } else {
          const stillPlaying = pathRecorder.updatePlayback(dt, camera, controls);
          syncPathUI();
          if (!stillPlaying && renderingPathVideo) {
            renderingPathVideo = false;
            pathRecorder.loop = savedLoopBeforeRender;
            exporter.stopVideoCapture().then(() => {
              syncVidBtn();
              syncPathUI();
              flash('Camera path video exported!');
            });
          }
        }
      } else if (fly) {
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
      if (pathRecorder.recording) {
        pathRecorder.recordSample(dt, camera);
        syncPathUI();
      }
      if (vehicles) vehicles.update(dt, tune.traffic, heightScale);
      if (harborObj) harborObj.update(dt);
      if (spaceportObj) spaceportObj.update(dt);
      if (streetInfraObj) streetInfraObj.update(dt);
      if (searchlights) searchlights.update(dt);
      if (weather) weather.update(dt, camera.position);
      if (minimap) minimap.render(camera, controls, pathRecorder);
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
  setAvoidanceState(avoidOn, false);
  setCollisionState(collideOn, false);
  setFreelookState(freelookOn, false);
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
