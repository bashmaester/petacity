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
  makeWeather, WEATHER_NAMES, CLOUD_TYPE_NAMES, CLOUD_LAYER_PRESETS, GLYPH_STYLE_NAMES,
  WATER_MODE_NAMES, WATER_SHADER_NAMES, TERRAIN_MODE_NAMES, TREE_MODE_NAMES, TRAIL_MODE_NAMES, describeMoonPhase,
  buildSigns, buildHolos,
  buildTransitInfrastructure, buildBridges, buildHarbor, buildSpaceport,
  buildStreetInfrastructure,
  PERFORMANCE_PROFILES, createSceneViewCuller,
} from './scene.js';
import {
  makePostProcessor, ART_STYLE_NAMES, LENS_MODE_NAMES, CAMERA_ANGLE_PRESETS,
  SCENE_TRANSITION_MODES, SCENE_TRANSITION_NAMES, resolveTransitionMode,
} from './post.js';
import { FlyControls, CAMERA_STYLE_NAMES, CINEMATIC_GAZE_MODES, stepCameraSpeed } from './controls.js';
import { CameraPathRecorder, makeSceneExporter } from './recorder.js';
import { makeMinimap } from './minimap.js';
import { ModularRadioEngine, RADIO_STATIONS, MUSIC_SYNC_PRESETS } from './audio.js';
import { MovieSetDirector } from './director.js';
import { registerPetacityWebMCP } from './webmcp.js';
import { exportStandaloneDemoHTML } from './demo-export.js';

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
const STORAGE_LAST_STATE_KEY = 'petacity.lastState.v1';

const URL_SCENE_PARAM_KEYS = [
  's', 'seed', 'look', 'r', 't', 'sub', 'wm', 'wa', 'sd', 'tm', 'ts', 'tr', 'vc', 'vs',
  'pt', 'hr', 'ap', 'sg', 'mw', 'cl', 'gl', 'curve', 'w', 'ct', 'cs', 'art', 'as', 'pal',
  'ds', 'tsp', 'csp', 'crad', 'csm', 'cst', 'tsm', 'tn', 'sl', 'sc', 'tl', 'sgd', 'vl', 'ld',
  'wsh', 'ws', 'wc', 'wf', 'wr', 'lm', 'lz', 'ana', 'fov', 'roll',
];

function readStoredStartingState() {
  try {
    const raw = window.localStorage && window.localStorage.getItem(STORAGE_LAST_STATE_KEY);
    if (!raw) return null;
    return decodeExactState(raw);
  } catch {
    return null;
  }
}

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

const demoBoot = (typeof window !== 'undefined' && window.__PETACITY_DEMO_BOOT__) ? window.__PETACITY_DEMO_BOOT__ : null;
const params = new URLSearchParams(location.search);
const hashParams = new URLSearchParams((location.hash || '').replace(/^#/, ''));
const initialStateToken = hashParams.get('s') || params.get('s');
const hasExplicitUrlState = Boolean(initialStateToken) || URL_SCENE_PARAM_KEYS.some((k) => params.has(k));
const storedStartingState = (!hasExplicitUrlState && !demoBoot) ? readStoredStartingState() : null;
const initialExact = initialStateToken
  ? decodeExactState(initialStateToken)
  : (demoBoot && demoBoot.state
    ? normalizeExactState(demoBoot.state)
    : storedStartingState);

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
  : (params.get('csp') !== null ? clampFloat(params.get('csp'), 0.02, 5.0, 1) : 1);
let camRadius = initialExact
  ? (initialExact.camRadius ?? 2.2)
  : (params.get('crad') !== null ? clampFloat(params.get('crad'), 0.5, 12, 2.2) : 2.2);
let camSmooth = initialExact
  ? (initialExact.camSmooth ?? 0.88)
  : (params.get('csm') !== null ? clampFloat(params.get('csm'), 0, 1.5, 0.88) : 0.88);
let camStyle = initialExact
  ? (initialExact.camStyle ?? 0)
  : clampInt(params.get('cst'), 0, 4, 0);
let turnSmooth = initialExact
  ? (initialExact.turnSmooth ?? 1.65)
  : (params.get('tsm') !== null ? clampFloat(params.get('tsm'), 0.2, 5.0, 1.65) : 1.65);
let gimbalSmooth = initialExact ? (initialExact.gimbalSmooth ?? 1) : 1;
let leadFraming = initialExact ? (initialExact.leadFraming ?? 0.82) : 0.82;
let editTransition = initialExact && SCENE_TRANSITION_NAMES.includes(initialExact.editTransition)
  ? initialExact.editTransition
  : 'cut';
let transitionDuration = initialExact ? clampFloat(initialExact.transitionDuration, 0.08, 6.0, 0.95) : 0.95;
let qualityMode = initialExact && ['auto', 'low', 'medium', 'high', 'ultra'].includes(initialExact.qualityMode)
  ? initialExact.qualityMode
  : 'auto';
let viewCulling = initialExact ? initialExact.viewCulling !== false : true;
let pathSmooth = initialExact ? (initialExact.pathSmooth ?? 0.65) : 0.65;
let heightScale = initialExact ? initialExact.heightScale : 1;

const initLookDefTint = LOOK_BY_ID[lookId].defTint ?? 0.72;
const defLayerPreset = CLOUD_LAYER_PRESETS[1];
const tune = initialExact
  ? {
      tint: initLookDefTint,
      searchLight: 1, searchCount: 1, trafficLight: 1, sigDensity: 1, vehLight: 1, lampDensity: 1,
      waterShader: 0, waterScale: 1, waterChop: 1, waterFoam: 0.85, waterRefl: 1.15, waterContrast: 0.12, waterWarp: 0.4,
      cloudSeed: 0, cloudEvol: 0.35, cloudLac: 2.08, cloudElev: 1, cloudRange: 1, cloudPuffs: 1,
      cloudLayersMode: 1,
      cloudLayerElev: [...defLayerPreset.elev],
      cloudLayerThick: [...defLayerPreset.thick],
      cloudLayerDens: [...defLayerPreset.dens],
      windAngle: 30, windStrength: 1,
      glyphStyle: 0, signAnim: 1,
      holoDensity: 1, holoScale: 1, holoScan: 1,
      trailMode: 1, trailLength: 1,
      colorVar: 0.45,
      ...initialExact.tune,
    }
  : {
      tint: params.get('tn') !== null ? clampFloat(params.get('tn'), 0, 1, initLookDefTint) : initLookDefTint,
      colorVar: params.get('cv') !== null ? clampFloat(params.get('cv'), 0, 1.2, 0.45) : 0.45,
      win: 1, glow: 1, fog: 1, lights: 1, traffic: 1,
      searchLight: params.get('sl') !== null ? clampFloat(params.get('sl'), 0, 2.5, 1) : 1,
      searchCount: params.get('sc') !== null ? clampFloat(params.get('sc'), 0, 2, 1) : 1,
      trafficLight: params.get('tl') !== null ? clampFloat(params.get('tl'), 0, 2.5, 1) : 1,
      sigDensity: params.get('sgd') !== null ? clampFloat(params.get('sgd'), 0, 1.5, 1) : 1,
      vehLight: params.get('vl') !== null ? clampFloat(params.get('vl'), 0, 2.5, 1) : 1,
      lampDensity: params.get('ld') !== null ? clampFloat(params.get('ld'), 0, 2, 1) : 1,
      waterShader: clampInt(params.get('wsh'), 0, 4, 0),
      waterScale: params.get('ws') !== null ? clampFloat(params.get('ws'), 0.2, 4, 1) : 1,
      waterChop: params.get('wc') !== null ? clampFloat(params.get('wc'), 0, 2.5, 1) : 1,
      waterFoam: params.get('wf') !== null ? clampFloat(params.get('wf'), 0, 2.5, 0.85) : 0.85,
      waterRefl: params.get('wr') !== null ? clampFloat(params.get('wr'), 0, 2.5, 1.15) : 1.15,
      waterContrast: params.get('wk') !== null ? clampFloat(params.get('wk'), 0, 1, 0.12) : 0.12,
      waterWarp: params.get('ww') !== null ? clampFloat(params.get('ww'), 0, 2, 0.4) : 0.4,
      clouds: params.get('cl') !== null ? clampFloat(params.get('cl'), 0, 2.4, 1) : 1,
      cloudPuffs: params.get('cpf') !== null ? clampFloat(params.get('cpf'), 0, 2, 1) : 1,
      cloudType: clampInt(params.get('ct'), 0, 5, 0),
      cloudStyle: clampInt(params.get('cs'), 0, 6, 0),
      cloudSeed: params.get('cseed') !== null ? clampFloat(params.get('cseed'), 0, 100, 0) : 0,
      cloudEvol: params.get('cevol') !== null ? clampFloat(params.get('cevol'), 0, 2.5, 0.35) : 0.35,
      cloudLac: params.get('clac') !== null ? clampFloat(params.get('clac'), 1.4, 3.2, 2.08) : 2.08,
      cloudElev: params.get('cel') !== null ? clampFloat(params.get('cel'), 0.05, 2.4, 1) : 1,
      cloudRange: params.get('crg') !== null ? clampFloat(params.get('crg'), 0.3, 3.0, 1) : 1,
      cloudLayersMode: clampInt(params.get('clm'), 0, 7, 1),
      cloudLayerElev: [...((CLOUD_LAYER_PRESETS[clampInt(params.get('clm'), 0, 7, 1)] || defLayerPreset).elev || defLayerPreset.elev)],
      cloudLayerThick: [...((CLOUD_LAYER_PRESETS[clampInt(params.get('clm'), 0, 7, 1)] || defLayerPreset).thick || defLayerPreset.thick)],
      cloudLayerDens: [...((CLOUD_LAYER_PRESETS[clampInt(params.get('clm'), 0, 7, 1)] || defLayerPreset).dens || defLayerPreset.dens)],
      windAngle: params.get('wang') !== null ? clampFloat(params.get('wang'), 0, 360, 30) : 30,
      windStrength: params.get('wstr') !== null ? clampFloat(params.get('wstr'), 0, 2.5, 1) : 1,
      glyphStyle: clampInt(params.get('gl'), 0, 2, 0),
      signAnim: params.get('sa') !== null ? clampFloat(params.get('sa'), 0, 2.5, 1) : 1,
      holoDensity: params.get('hd') !== null ? clampFloat(params.get('hd'), 0, 2.5, 1) : 1,
      holoScale: params.get('hs') !== null ? clampFloat(params.get('hs'), 0.35, 2.2, 1) : 1,
      holoScan: params.get('hsc') !== null ? clampFloat(params.get('hsc'), 0, 2.5, 1) : 1,
      trailMode: clampInt(params.get('trm'), 0, 5, 1),
      trailLength: params.get('trl') !== null ? clampFloat(params.get('trl'), 0, 2.5, 1) : 1,
      haze: 1, sun: 1, vib: 1,
      moon: 1, moonsz: 1, moonph: 0.85,
    };
let cloudEditLayer = 1;
const DEF_RADIO_INIT = {
  station: 0, volume: 0.68, space: 0.9, warmth: 0.8, pulse: 0.55, react: 0.65,
  playlistMode: 'seq', playlistInterval: 75, playing: false,
  syncPreset: 'off', syncStrength: 0,
  syncTraffic: false, syncClouds: false, syncDiurnal: false, syncLights: false, syncAtmo: false,
};
const radioState = initialExact && initialExact.radio
  ? { ...DEF_RADIO_INIT, ...initialExact.radio }
  : { ...DEF_RADIO_INIT };
let weatherMode = initialExact ? initialExact.weatherMode : clampInt(params.get('w'), 0, 6, 0);
let weatherAutoMode = initialExact && ['off', 'seq', 'shuffle', 'cinematic'].includes(initialExact.weatherAutoMode)
  ? initialExact.weatherAutoMode
  : 'off';
let weatherInterval = initialExact && Number.isFinite(initialExact.weatherInterval)
  ? clampInt(initialExact.weatherInterval, 15, 240, 60)
  : 60;
let dustLevel = initialExact ? initialExact.dustLevel : 0.6;
const initGrade = LOOK_BY_ID[lookId].grade || { bloom: 0.85, lens: 0.45, contrast: 1.06, temp: 0, film: 0.16 };
const postState = initialExact
  ? {
      artStyle: 0, artStrength: 1.0,
      lensMode: 0, lensDistort: 0, lensZoom: 1.0, anamorphic: 0, tiltShift: 0,
      ...initialExact.post,
    }
  : {
      bloom: initGrade.bloom,
      lens: initGrade.lens,
      contrast: initGrade.contrast,
      temp: initGrade.temp,
      film: initGrade.film,
      artStyle: clampInt(params.get('art'), 0, 5, 0),
      artStrength: params.get('as') !== null ? clampFloat(params.get('as'), 0, 1.4, 1) : 1.0,
      lensMode: clampInt(params.get('lm'), 0, 9, 0),
      lensDistort: params.get('ld') !== null ? clampFloat(params.get('ld'), -1, 1.25, 0) : 0,
      lensZoom: params.get('lz') !== null ? clampFloat(params.get('lz'), 0.35, 2.5, 1) : 1.0,
      anamorphic: params.get('ana') !== null ? clampFloat(params.get('ana'), 0, 1, 0) : 0,
      tiltShift: params.get('ts') !== null ? clampFloat(params.get('ts'), 0, 1, 0) : 0,
    };
let camFov = (initialExact && initialExact.camera && Number.isFinite(initialExact.camera.fov))
  ? clampFloat(initialExact.camera.fov, 15, 150, 58)
  : clampFloat(params.get('fov'), 15, 150, 58);
let camRollDeg = (initialExact && initialExact.camera && Number.isFinite(initialExact.camera.roll))
  ? clampFloat((initialExact.camera.roll * 180) / Math.PI, -180, 180, 0)
  : clampFloat(params.get('roll'), -180, 180, 0);

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
  const radioEngine = new ModularRadioEngine({
    station: radioState.station,
    volume: radioState.volume,
    space: radioState.space,
    warmth: radioState.warmth,
    pulse: radioState.pulse,
    cityReactivity: radioState.react,
    playlistMode: radioState.playlistMode || 'seq',
    playlistInterval: radioState.playlistInterval || 75,
    seed: (seed % 997) + 1,
  });
  radioEngine.onStationAutoSwitch = (st, idx) => {
    radioState.station = idx;
    syncRadioUI();
    flash(`\u266B ${st.name}`);
  };
  const radioVizCanvas = $('#radio-viz');
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
  let glideOn = (demoBoot && demoBoot.forceAutoloop) ? true : (initialExact ? !!initialExact.glide : false);
  let gazeMode = initialExact
    ? clampInt(initialExact.gazeMode ?? (initialExact.autoLook === false ? 0 : 1), 0, 5, 1)
    : 1;
  let autoLookOn = gazeMode > 0;
  let freelookOn = initialExact ? !!initialExact.freelook : false;
  let collideOn = initialExact ? initialExact.collide !== false : true;
  let avoidOn = initialExact ? initialExact.avoidance !== false : true;
  let timeCycleOn = initialExact ? !!initialExact.dayCycle : false;
  let weatherAutoTimer = 0;
  let weatherArcIdx = 0;
  const CINEMATIC_WEATHER_ARC = [0, 1, 2, 0, 3, 5, 6];
  let vidAudioOn = true;
  let userLoopOverride = (initialExact && Array.isArray(initialExact.autoLoop) && initialExact.autoLoop.length >= 3)
    ? initialExact.autoLoop.map((p) => ({ ...p }))
    : null;
  let activePresetId = '';

  controls.speedMul = camSpeed;
  controls.colliderRadius = camRadius;
  controls.smoothness = camSmooth;
  controls.turnSmooth = turnSmooth;
  controls.gimbalSmooth = gimbalSmooth;
  controls.leadFraming = leadFraming;
  controls.motionStyle = camStyle;

  let autoTier = 'high';
  let frameMsEMA = 16.67;
  let lowFpsTimer = 0;
  let highFpsTimer = 0;
  let frameCounter = 0;
  let perfWarmupFrames = 12;
  let bootCompleted = false;
  let storageSaveTimer = 0;

  // Non-destructive baseline snapshot for live Music -> Environment modulation
  const baseUniformSnap = {
    winGlow: 1,
    billK: 1,
    cloud: 0.3,
    cloudSeed: 0,
    cloudEvol: 0.35,
    holoScale: 1,
  };
  let lastMusicChordSeq = -1;
  let musicTrafficMul = 1.0;
  let musicCloudOffset = 0;
  let musicCloudTargetOffset = 0;
  let musicDiurnalPendingHours = 0;
  let musicLightEnv = 0;
  let musicAtmoEnv = 0;

  const viewCuller = createSceneViewCuller();
  viewCuller.setEnabled(viewCulling);

  function getEffectiveQualityTier() {
    return qualityMode === 'auto' ? autoTier : (PERFORMANCE_PROFILES[qualityMode] ? qualityMode : 'high');
  }

  function applyPerformanceProfile() {
    const tierName = getEffectiveQualityTier();
    const prof = PERFORMANCE_PROFILES[tierName] || PERFORMANCE_PROFILES.high;
    viewCuller.setProfile(prof);
    viewCuller.setEnabled(viewCulling);
    U.uPerfQuality.value = prof.perfQuality;
    if (world.clouds && world.clouds.setQualityFrac) {
      world.clouds.setQualityFrac(prof.cloudPuffFrac);
    }
    if (weather && weather.group && weather.group.children && weather.group.children[0] && weather.group.children[0].geometry) {
      const wg = weather.group.children[0].geometry;
      if (wg.attributes && wg.attributes.position) {
        const total = wg.attributes.position.count;
        wg.setDrawRange(0, Math.max(256, Math.round(total * prof.weatherCapFrac)));
      }
    }
    post.setQuality({
      bloomPasses: prof.bloomPasses,
      bloomScale: prof.bloomScale,
      cubeMax: prof.cubeMax,
    });
    if (!exporter.lockedResolution) {
      const rawDpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;
      const targetDpr = Math.min(rawDpr, prof.dprCap);
      if (Math.abs(renderer.getPixelRatio() - targetDpr) > 0.02) {
        renderer.setPixelRatio(targetDpr);
        post.setSize(window.innerWidth, window.innerHeight, targetDpr);
      }
    }
  }

  function triggerSceneTransition(opts = {}) {
    const type = opts.type !== undefined ? opts.type : editTransition;
    const duration = Number.isFinite(opts.duration) ? opts.duration : transitionDuration;
    return post.startTransition({
      type,
      duration,
      feather: opts.feather,
      hold: opts.hold,
      color: opts.color,
      scene,
      camera,
      time: U.uTime.value,
      onCut: opts.onCut,
      onComplete: opts.onComplete,
    });
  }

  const director = new MovieSetDirector({
    scene,
    camera,
    controls,
    uniforms: U,
    getCity: () => city,
    getVehicles: () => vehicles,
    onEditTransition: (opts) => triggerSceneTransition(opts),
  });

  controls.getLiveProjections = () => {
    const out = [];
    if (director && director._projectedHolos) {
      for (const h of director._projectedHolos.values()) {
        if (h && h.group) {
          out.push({
            name: h.text || 'Projected Hologram',
            x: h.group.position.x,
            y: h.group.position.y,
            lookY: h.group.position.y,
            z: h.group.position.z,
            live: true,
            priority: 2.6,
          });
        }
      }
    }
    return out;
  };

  function enqueueSpotRoute(rawSpot, opts = {}) {
    if (!rawSpot) return;
    const spot = rawSpot.poi ? rawSpot.poi : rawSpot;
    director.stopCameraScript();
    if (pathRecorder && pathRecorder.playing) {
      pathRecorder.pause();
      syncPathUI();
    }
    fly = null; // never quick-jump teleport; route smoothly at current camera speed!
    if (camSpeed <= 0.005) {
      camSpeed = 0.5;
      controls.rampSpeedMultiplier(camSpeed);
      $('#sl-camspeed').value = String(camSpeed);
      syncFeatureLabels();
    }

    const isDirectMapPin = !!(opts.fromMinimap && !spot.kind);
    const isRaycastHit = !!(opts.fromRaycast && Number.isFinite(spot.y));
    const terrAtTarget = cityCollider && cityCollider.groundHeightAt ? cityCollider.groundHeightAt(spot.x, spot.z) : 0;
    let targetX = spot.x;
    let targetZ = spot.z;
    let cruiseY;
    let lookY;
    let lookX = spot.x;
    let lookZ = spot.z;

    if (isRaycastHit) {
      targetX = spot.x;
      targetZ = spot.z;
      cruiseY = spot.y;
      lookX = Number.isFinite(spot.lookX) ? spot.lookX : spot.x;
      lookY = Number.isFinite(spot.lookY) ? spot.lookY : spot.y;
      lookZ = Number.isFinite(spot.lookZ) ? spot.lookZ : spot.z;
    } else if (isDirectMapPin) {
      const roofNear = cityCollider && cityCollider.maxHeightNear
        ? cityCollider.maxHeightNear(spot.x, spot.z, 18) * heightScale
        : 0;
      const keepAlt = Math.max(72, Math.min(260, camera.position.y));
      cruiseY = Math.max(terrAtTarget + 56, roofNear + 34, keepAlt);
      lookY = Math.max(terrAtTarget + 28, cruiseY - 26);
    } else {
      const dist = spot.kind === 'media' ? Math.max(190, (spot.r || 90) * 1.05) : Math.max(150, (spot.r || 32) * 3.2);
      const away = new THREE.Vector3(camera.position.x - spot.x, 0, camera.position.z - spot.z);
      if (away.lengthSq() < 1) away.set(1, 0, 1);
      away.normalize().multiplyScalar(dist * 0.65);
      targetX = spot.x + away.x;
      targetZ = spot.z + away.z;
      const baseH = spot.h || spot.y || 65;
      cruiseY = Math.max(terrAtTarget + 44, terrAtTarget + baseH * 0.68 * heightScale + 26);
      lookY = terrAtTarget + baseH * 0.52 * heightScale;
    }

    const curved = bendWorldPoint(targetX, cruiseY, targetZ, worldCurve, U.uPlanetR.value);
    const curvedLook = bendWorldPoint(lookX, lookY, lookZ, worldCurve, U.uPlanetR.value);

    // Engage Autopilot BEFORE enqueueing so syncFromCamera() doesn't overwrite the queued course!
    if (!glideOn) setGlideState(true, false);

    const queued = controls.enqueueWaypoint(
      {
        name: spot.name || 'Map Pin',
        x: curved.x,
        y: curved.y,
        z: curved.z,
        lookX: curvedLook.x,
        lookY: curvedLook.y,
        lookZ: curvedLook.z,
      },
      { append: !!opts.append, stopOnArrive: !!opts.stopOnArrive }
    );
    const userStops = Array.isArray(queued) ? (queued.filter((q) => !q.via).length || queued.length) : 1;
    persistStartingState();
    flash(opts.append && userStops > 1
      ? `\u2708\uFE0E Route +Stop #${userStops} \u00B7 ${spot.name || 'Map Pin'}`
      : `\u2708\uFE0E Flying to \u2192 ${spot.name || 'Map Pin'}`);
  }

  // Double-click anywhere in the 3D view (#stage):
  // - If the ray hits a building, landmark, bridge, transit deck, harbor ship/pier, or city street/water,
  //   compute a collision-safe stand-off destination and fly smoothly there (Shift+DblClick appends!).
  // - If the ray misses (open sky / distant horizon), smoothly set the flight heading along that ray!
  const viewRaycaster = new THREE.Raycaster();
  const viewNdc = new THREE.Vector2();
  const hitWorldNormal = new THREE.Vector3();
  const hitRotMat = new THREE.Matrix3();
  function handleViewportDoubleClick(ev) {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect || rect.width < 4 || rect.height < 4) return;
    viewNdc.set(
      ((ev.clientX - rect.left) / rect.width) * 2 - 1,
      -((ev.clientY - rect.top) / rect.height) * 2 + 1
    );
    camera.updateMatrixWorld();
    viewRaycaster.setFromCamera(viewNdc, camera);

    const structTargets = [
      cityMesh,
      landmarkGroup,
      placeGroup,
      bridgeGroup,
      transitGroup,
      harborObj && harborObj.group,
      spaceportObj && spaceportObj.group,
    ].filter(Boolean);
    let hit = null;
    let hitLabel = 'View Spot';
    const structHits = viewRaycaster.intersectObjects(structTargets, true);
    if (structHits.length > 0 && structHits[0].distance < 11000) {
      hit = structHits[0];
      if (hit.object === cityMesh) hitLabel = 'Tower Overlook';
      else if (landmarkGroup && landmarkGroup.getObjectById(hit.object.id)) hitLabel = 'Landmark';
      else if (bridgeGroup && bridgeGroup.getObjectById(hit.object.id)) hitLabel = 'Bridge Span';
      else if (harborObj && harborObj.group && harborObj.group.getObjectById(hit.object.id)) hitLabel = 'Harbor';
    } else {
      const groundTargets = [waterGroup, world && world.ground].filter(Boolean);
      const groundHits = viewRaycaster.intersectObjects(groundTargets, true);
      const maxGroundR = Math.max(1500, (controls.cityLimitRadius || 2400) * 1.18);
      if (groundHits.length > 0 && groundHits[0].distance < 9500) {
        const gh = groundHits[0];
        if (Math.hypot(gh.point.x, gh.point.z) <= maxGroundR) {
          hit = gh;
          hitLabel = (waterGroup && waterGroup.getObjectById(gh.object.id)) ? 'Waterfront' : 'Street Spot';
        }
      }
    }

    if (hit) {
      hitWorldNormal.set(0, 1, 0);
      if (hit.face && hit.face.normal) {
        hitWorldNormal.copy(hit.face.normal);
        if (hit.object === cityMesh && Number.isInteger(hit.instanceId) && city && city.rot) {
          const rY = city.rot[hit.instanceId] || 0;
          if (rY !== 0) {
            const cR = Math.cos(rY), sR = Math.sin(rY);
            const nx = hitWorldNormal.x * cR + hitWorldNormal.z * sR;
            const nz = -hitWorldNormal.x * sR + hitWorldNormal.z * cR;
            hitWorldNormal.set(nx, hitWorldNormal.y, nz);
          }
        } else if (hit.object && hit.object.matrixWorld) {
          hitRotMat.getNormalMatrix(hit.object.matrixWorld);
          hitWorldNormal.applyMatrix3(hitRotMat);
        }
        hitWorldNormal.normalize();
      }
      const safe = controls.computeSafeDestinationFromHit(
        { point: hit.point, normal: hitWorldNormal },
        camera.position
      );
      if (safe) {
        enqueueSpotRoute(
          {
            name: hitLabel,
            x: safe.x,
            y: safe.y,
            z: safe.z,
            lookX: safe.lookX,
            lookY: safe.lookY,
            lookZ: safe.lookZ,
          },
          { fromRaycast: true, append: !!ev.shiftKey }
        );
        return;
      }
    }

    // No 3D intersection (sky / open horizon): set flight heading smoothly along the ray!
    const dir = viewRaycaster.ray.direction;
    const targetYaw = Math.atan2(-dir.x, -dir.z);
    const targetPitch = Math.max(-0.78, Math.min(0.78, Math.asin(Math.max(-1, Math.min(1, dir.y)))));
    director.stopCameraScript();
    if (pathRecorder && pathRecorder.playing) {
      pathRecorder.pause();
      syncPathUI();
    }
    fly = null;
    if (camSpeed <= 0.005) {
      camSpeed = 0.5;
      controls.rampSpeedMultiplier(camSpeed);
      $('#sl-camspeed').value = String(camSpeed);
      syncFeatureLabels();
    }
    if (!glideOn) setGlideState(true, false);
    controls.setCourseHeading(targetYaw, targetPitch, { engageGlide: true, holdSec: 4.5 });
    const compassDeg = Math.round(((((-targetYaw * 180) / Math.PI) % 360) + 360) % 360);
    flash(`\u2708\uFE0E Heading \u2192 ${compassDeg}\u00B0`);
  }
  canvas.addEventListener('dblclick', handleViewportDoubleClick);

  controls.onRouteArrive = (wp) => {
    if (wp && wp.name) flash(`Arrived \u00B7 ${wp.name}`);
  };

  controls.onCourseReorient = (camPos, headingYaw) => {
    const nodes = glideNodes();
    if (!nodes.length) return null;
    const fx = -Math.sin(headingYaw);
    const fz = -Math.cos(headingYaw);
    let bestIdx = glideIdx % nodes.length;
    let bestScore = -Infinity;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const dx = n.x - camPos.x;
      const dz = n.z - camPos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 180) continue;
      const align = (dx * fx + dz * fz) / dist;
      const score = align * 2.2 - dist * 0.00025;
      if (score > bestScore) { bestScore = score; bestIdx = i; }
    }
    glideIdx = bestIdx;
    return nodes[bestIdx];
  };

  function buildDefaultAutopilotLoop() {
    if (!city) return [];
    const span = Math.max(460, cityRadius * CELL * 0.78);
    const candidates = [];
    if (city.mediaZone) {
      candidates.push({ name: city.mediaZone.name, x: city.mediaZone.x, z: city.mediaZone.z, baseY: 118 });
    }
    for (const lm of (city.landmarks || []).slice(0, 6)) {
      candidates.push({
        name: lm.name,
        x: lm.x + (lm.r || 36) * 1.4,
        z: lm.z + (lm.r || 36) * 1.1,
        baseY: Math.max(92, Math.min(205, (lm.h || 110) * 0.62)),
      });
    }
    for (const pl of (city.places || []).slice(0, 4)) {
      candidates.push({
        name: pl.name,
        x: pl.x,
        z: pl.z,
        baseY: 108,
      });
    }
    if (city.harbor) {
      candidates.push({ name: city.harbor.name || 'Harbor', x: city.harbor.x * 0.85, z: city.harbor.z * 0.85, baseY: 112 });
    }
    if (city.spaceport) {
      candidates.push({ name: city.spaceport.name || 'Spaceport', x: city.spaceport.x * 0.72, z: city.spaceport.z * 0.72, baseY: 138 });
    }

    // Build 8 angular sectors around city core and circularly smooth radii/altitudes
    // so the closed Catmull-Rom loop forms a sweeping, graceful grand arc with zero S-bend wobble!
    const rawPts = [];
    const nSectors = 8;
    for (let s = 0; s < nSectors; s++) {
      const targetAng = -Math.PI + (s / nSectors) * Math.PI * 2;
      let best = null;
      let bestDiff = 0.48;
      for (const c of candidates) {
        const r = Math.hypot(c.x, c.z);
        if (r < span * 0.42 || r > span * 1.35) continue;
        let diff = Math.atan2(c.z, c.x) - targetAng;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        if (Math.abs(diff) < bestDiff) {
          bestDiff = Math.abs(diff);
          best = c;
        }
      }
      const baseRad = span * (0.78 + 0.08 * Math.sin(s * Math.PI * 0.5));
      const candRad = best ? Math.hypot(best.x, best.z) : baseRad;
      const blendedRad = baseRad * 0.68 + candRad * 0.32;
      rawPts.push({
        ang: targetAng,
        rad: blendedRad,
        alt: (best ? Math.max(105, Math.min(185, best.baseY)) : 132) * heightScale,
        name: best ? best.name : `Loop ${s + 1}`,
      });
    }
    const loop = [];
    for (let s = 0; s < nSectors; s++) {
      const prev = rawPts[(s - 1 + nSectors) % nSectors];
      const cur = rawPts[s];
      const next = rawPts[(s + 1) % nSectors];
      const smRad = prev.rad * 0.25 + cur.rad * 0.5 + next.rad * 0.25;
      const smAlt = prev.alt * 0.25 + cur.alt * 0.5 + next.alt * 0.25;
      const wx = Math.cos(cur.ang) * smRad;
      const wz = Math.sin(cur.ang) * smRad;
      const terrY = cityCollider && cityCollider.groundHeightAt ? cityCollider.groundHeightAt(wx, wz) : 0;
      const wy = Math.max(terrY + 68, smAlt);
      const curved = bendWorldPoint(wx, wy, wz, worldCurve, U.uPlanetR.value);
      loop.push({
        name: cur.name,
        x: Math.round(curved.x * 10) / 10,
        y: Math.round(curved.y * 10) / 10,
        z: Math.round(curved.z * 10) / 10,
      });
    }
    return loop;
  }

  function syncAutopilotLoop() {
    const loop = (userLoopOverride && userLoopOverride.length >= 3)
      ? userLoopOverride
      : buildDefaultAutopilotLoop();
    controls.setAutopilotLoop(loop);
    return loop;
  }

  const minimap = makeMinimap({
    canvas: $('#minimap'),
    labelEl: $('#minimap-label'),
    onSelectSpot: (spot, opts) => {
      enqueueSpotRoute(spot, opts || {});
    },
    onLoopEdited: (updatedLoop) => {
      userLoopOverride = updatedLoop.map((p) => ({ ...p }));
      syncURL();
    },
  });
  minimap.setControls(controls);

  const minimapZooms = [1.0, 2.0, 3.5];
  let minimapZoomIdx = 0;
  $('#b-minimap-follow').onclick = () => {
    if (pathRecorder && pathRecorder.playing) {
      pathRecorder.pause();
      syncPathUI();
    }
    if (!glideOn) {
      if (camSpeed <= 0.005) {
        camSpeed = 0.5;
        controls.rampSpeedMultiplier(camSpeed);
        $('#sl-camspeed').value = String(camSpeed);
        syncFeatureLabels();
      }
      setGlideState(true, false);
      const nStops = controls.routeQueue.filter((q) => !q.via).length || controls.routeQueue.length;
      flash(nStops > 0
        ? `\u25B6 Following Route (${nStops} stop${nStops > 1 ? 's' : ''})`
        : `\u25B6 Following Cyan Loop (${controls.autopilotLoop.length} pts)`);
    } else {
      setGlideState(false, false);
      flash('\u23F8 Paused flight path (press \u25B6 or P to resume)');
    }
  };
  $('#b-route-clear').onclick = () => {
    if (controls.routeQueue.length > 0) {
      controls.clearRoute();
      if (controls.autopilotLoop.length >= 3) controls._syncNearestLoopParam(true);
      flash(glideOn ? 'Cleared dashed Route \u00B7 Back on Cyan Loop' : 'Cleared dashed Route');
      return;
    }
    if (pathRecorder && pathRecorder.frames && pathRecorder.frames.length > 0) {
      pathRecorder.clear();
      syncPathUI();
      persistStartingState();
      flash('Cleared recorded Gold camera path');
      return;
    }
    flash('No dashed Route or recorded path to clear');
  };
  $('#b-minimap-zoom').onclick = () => {
    minimapZoomIdx = (minimapZoomIdx + 1) % minimapZooms.length;
    const z = minimapZooms[minimapZoomIdx];
    minimap.setZoom(z);
    $('#b-minimap-zoom').title = `Cycle minimap zoom (current: ${z}\u00D7)`;
    flash(`Minimap zoom \u00B7 ${z}\u00D7`);
  };
  $('#b-loop-add').onclick = () => {
    const loop = controls.autopilotLoop;
    if (!Array.isArray(loop) || loop.length < 3) return;
    // Insert a new waypoint 160m ahead of camera onto the nearest loop segment
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const wx = camera.position.x + fwd.x * 140;
    const wy = Math.max(36, camera.position.y + fwd.y * 40);
    const wz = camera.position.z + fwd.z * 140;
    let bestIdx = 0;
    let bestD2 = Infinity;
    for (let i = 0; i < loop.length; i++) {
      const dx = loop[i].x - wx;
      const dz = loop[i].z - wz;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) { bestD2 = d2; bestIdx = i; }
    }
    minimap.insertLoopNodeAfter(bestIdx, wx, wz, wy);
    flash(`Added loop waypoint #${controls.autopilotLoop.length}`);
  };
  $('#b-loop-reset').onclick = () => {
    userLoopOverride = null;
    const loop = syncAutopilotLoop();
    syncURL();
    flash(`Reset autopilot loop (${loop.length} waypoints)`);
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
      lampDensity: 2.0,
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
    controls.cityLimitRadius = Math.max(1350, (city.suburbSpan || city.span || 1200) * 1.18);
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
    if (lamps.setDensity) lamps.setDensity(tune.lampDensity ?? 1);
    if (pools.setDensity) pools.setDensity(tune.lampDensity ?? 1);
    if (beacons.setDensity) beacons.setDensity(tune.lampDensity ?? 1);
    searchlights = makeSearchlights(city, world.beamMat);
    searchlights.setAmount(tune.searchLight ?? 1);
    if (searchlights.setCountFactor) searchlights.setCountFactor(tune.searchCount ?? 1);
    vehicles = makeVehicles(city, world.trailMat, 1400, cityCollider, {
      swarmMat: world.swarmMat,
      swarmCount: 18600,
      transitAmt,
      trafficSpeed,
      U,
      ribbonTrailMat: world.ribbonTrailMat,
      swarmTrailMat: world.swarmTrailMat,
      trailMode: tune.trailMode ?? 1,
      trailLength: tune.trailLength ?? 1,
    });
    vehicles.setCollision(collideOn);
    vehicles.setPalette(look);
    waterGroup = buildWater(city, world.waterMat);
    boulevardGroup = buildBoulevards(city, U);
    billboards = buildBillboards(city, world.billMat);
    signGroup = buildSigns(city, world.billMat);
    holoGroup = buildHolos(city, world.holoMat, world.beamMat, {
      density: signAmt <= 0.01 ? 0 : (tune.holoDensity ?? 1),
    });
    trees = buildTrees(city, U);
    sculptures = buildSculptures(city, world.beaconMat, world.lampMat);
    transitGroup = buildTransitInfrastructure(city, U, world.lampMat);
    bridgeGroup = buildBridges(city, U, world.beaconMat, world.lampMat);
    harborObj = buildHarbor(city, U, world.beaconMat, world.lampMat, {
      ribbonTrailMat: world.ribbonTrailMat,
      trailMode: tune.trailMode ?? 1,
      trailLength: tune.trailLength ?? 1,
    });
    spaceportObj = buildSpaceport(city, U, world.beaconMat, world.lampMat, world.beamMat, {
      ribbonTrailMat: world.ribbonTrailMat,
      trailMode: tune.trailMode ?? 1,
      trailLength: tune.trailLength ?? 1,
    });
    streetInfraObj = buildStreetInfrastructure(city, U);
    streetInfraObj.setSignalGlow(tune.trafficLight ?? 1);
    if (streetInfraObj.setDensity) streetInfraObj.setDensity(tune.sigDensity ?? 1);
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
    viewCuller.registerCity({
      city,
      landmarks: landmarkGroup,
      places: placeGroup,
      bridges: bridgeGroup,
      transitInfra: transitGroup,
      harborObj,
      spaceportObj,
      beams: searchlights,
      holoGroup,
      streetInfraObj,
      vehicles,
    });
    applyPerformanceProfile();
    perfWarmupFrames = 12;
    applyHeight();

    $('#stat-towers').textContent = city.towers.toLocaleString('en-US');
    $('#stat-boxes').textContent = city.count.toLocaleString('en-US');
    $('#stat-seed').textContent = String(seed);
    director.onCityRebuilt();
    U.uWaterShader.value = tune.waterShader ?? 0;
    U.uWindAngle.value = ((tune.windAngle ?? 30) * Math.PI) / 180;
    U.uWindStrength.value = tune.windStrength ?? 1.0;
    buildPois();
    minimap.setCity(city, LOOK_BY_ID[lookId]);
    syncAutopilotLoop();
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

  function syncCameraOptics() {
    const lMode = clampInt(postState.lensMode ?? 0, 0, 9, 0);
    // In single-pass wide/distorted modes (0..3), expand effective pinhole FOV slightly when
    // Panini or barrel distortion is active so real peripheral skyline enters the lens!
    const paniniBoost = lMode === 1 ? 14 : 0;
    const barrelBoost = Math.max(0, postState.lensDistort || 0) * 16;
    const effFov = lMode >= 4
      ? 90
      : Math.max(12, Math.min(162, camFov + paniniBoost + barrelBoost));
    if (Math.abs(camera.fov - effFov) > 0.05) {
      camera.fov = effFov;
      camera.updateProjectionMatrix();
    }
    controls.setCameraRoll((camRollDeg * Math.PI) / 180);
    post.configure({
      lensMode: lMode,
      lensDistort: postState.lensDistort ?? 0,
      lensZoom: postState.lensZoom ?? 1.0,
      anamorphic: postState.anamorphic ?? 0,
      tiltShift: postState.tiltShift ?? 0,
      tiltAngle: -(camRollDeg * Math.PI) / 180,
    });
    $('#cam-fov-label').textContent = lMode >= 4 ? (lMode === 4 ? '180\u00B0' : (lMode === 8 ? '250\u00B0' : '360\u00B0')) : `FOV ${Math.round(camFov)}\u00B0`;
    const dPct = Math.round((postState.lensDistort ?? 0) * 100);
    $('#lens-distort-label').textContent = `Dist ${dPct > 0 ? '+' : ''}${dPct}%`;
    $('#lens-zoom-label').textContent = `Zoom ${(postState.lensZoom ?? 1).toFixed(2)}\u00D7`;
    $('#cam-roll-label').textContent = `Roll ${camRollDeg > 0 ? '+' : ''}${Math.round(camRollDeg)}\u00B0`;
    $('#anamorphic-label').textContent = `Ana ${Math.round((postState.anamorphic ?? 0) * 100)}%`;
    $('#tilt-shift-label').textContent = `Tilt ${Math.round((postState.tiltShift ?? 0) * 100)}%`;
  }

  function syncPostSliders() {
    $('#sel-art').value = String(postState.artStyle ?? 0);
    $('#sl-artstr').value = String(postState.artStrength ?? 1.0);
    $('#sl-bloom').value = String(postState.bloom);
    $('#sl-lens').value = String(postState.lens);
    $('#sl-contrast').value = String(postState.contrast);
    $('#sl-temp').value = String(postState.temp);
    $('#sl-film').value = String(postState.film);
    $('#sel-lens-mode').value = String(postState.lensMode ?? 0);
    $('#sl-cam-fov').value = String(camFov);
    $('#sl-lens-distort').value = String(postState.lensDistort ?? 0);
    $('#sl-lens-zoom').value = String(postState.lensZoom ?? 1.0);
    $('#sl-cam-roll').value = String(camRollDeg);
    $('#sl-anamorphic').value = String(postState.anamorphic ?? 0);
    $('#sl-tilt-shift').value = String(postState.tiltShift ?? 0);
    syncCameraOptics();
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

  function syncCloudLayerInspector() {
    const idx = Math.max(0, Math.min(2, cloudEditLayer));
    const dArr = Array.isArray(tune.cloudLayerDens) ? tune.cloudLayerDens : [0.0, 1.0, 0.72];
    const eArr = Array.isArray(tune.cloudLayerElev) ? tune.cloudLayerElev : [210, 680, 1620];
    const tArr = Array.isArray(tune.cloudLayerThick) ? tune.cloudLayerThick : [220, 620, 540];
    $('#sel-cloud-layers').value = String(tune.cloudLayersMode ?? 1);
    $('#sel-cloud-edit').value = String(idx);
    $('#sl-clayer-dens').value = String(dArr[idx]);
    $('#sl-clayer-elev').value = String(eArr[idx]);
    $('#sl-clayer-thick').value = String(tArr[idx]);
    $('#clayer-dens-label').textContent = dArr[idx] <= 0.005 ? 'Off' : `${Math.round(dArr[idx] * 100)}%`;
    $('#clayer-elev-label').textContent = `${Math.round(eArr[idx])}m`;
    $('#clayer-thick-label').textContent = `${Math.round(tArr[idx])}m`;
  }

  function inferMusicSyncPreset() {
    const anyOn = Boolean(
      radioState.syncTraffic || radioState.syncClouds || radioState.syncDiurnal || radioState.syncLights || radioState.syncAtmo
    );
    if (!anyOn || (radioState.syncStrength ?? 0) <= 0.005) return 'off';
    for (const pr of MUSIC_SYNC_PRESETS) {
      if (pr.id === 'off' || pr.id === 'custom') continue;
      if (
        pr.traffic === !!radioState.syncTraffic &&
        pr.clouds === !!radioState.syncClouds &&
        pr.diurnal === !!radioState.syncDiurnal &&
        pr.lights === !!radioState.syncLights &&
        pr.atmo === !!radioState.syncAtmo
      ) {
        return pr.id;
      }
    }
    return 'custom';
  }

  function applyMusicSyncPreset(presetId) {
    const pr = MUSIC_SYNC_PRESETS.find((p) => p.id === presetId);
    if (!pr) return;
    radioState.syncPreset = pr.id;
    if (pr.id !== 'custom') {
      radioState.syncStrength = pr.strength;
      radioState.syncTraffic = pr.traffic;
      radioState.syncClouds = pr.clouds;
      radioState.syncDiurnal = pr.diurnal;
      radioState.syncLights = pr.lights;
      radioState.syncAtmo = pr.atmo;
    } else if ((radioState.syncStrength ?? 0) <= 0.01) {
      radioState.syncStrength = 1.0;
    }
    if (pr.id === 'off') {
      // Restore unmodulated baselines immediately
      if (vehicles && vehicles.setTrafficSpeed) vehicles.setTrafficSpeed(trafficSpeed);
      refreshLook(false, true);
    }
  }

  function syncRadioUI() {
    const on = radioEngine.playing;
    const dispIdx = radioEngine.effectiveStationIndex;
    const st = RADIO_STATIONS[dispIdx] || radioEngine.station;
    $('#b-radio').classList.toggle('on', on);
    $('#b-radio').setAttribute('aria-pressed', String(on));
    $('#b-radio-play').classList.toggle('on', on);
    $('#b-radio-play').setAttribute('aria-pressed', String(on));
    $('#b-radio-play').textContent = on ? '\u23F8' : '\u25B6';
    $('#sel-radio-station').value = String(dispIdx);
    $('#sel-radio-playlist').value = String(radioState.playlistMode || 'seq');
    $('#sl-radio-interval').value = String(radioState.playlistInterval || 75);
    const intSec = Math.round(radioState.playlistInterval || 75);
    $('#radio-interval-label').textContent = (radioState.playlistMode === 'loop')
      ? 'Hold'
      : (intSec >= 60 ? `${Math.floor(intSec / 60)}m ${String(intSec % 60).padStart(2, '0')}s` : `${intSec}s`);
    $('#sl-radio-vol').value = String(radioState.volume);
    $('#sl-radio-space').value = String(radioState.space);
    $('#sl-radio-warmth').value = String(radioState.warmth);
    $('#sl-radio-pulse').value = String(radioState.pulse);
    $('#sl-radio-react').value = String(radioState.react);
    $('#radio-vol-label').textContent = radioState.volume <= 0.005 ? 'Muted' : `Vol ${Math.round(radioState.volume * 100)}%`;
    $('#radio-space-label').textContent = `Space ${Math.round(radioState.space * 100)}%`;
    $('#radio-warmth-label').textContent = `Tone ${Math.round(radioState.warmth * 100)}%`;
    $('#radio-pulse-label').textContent = radioState.pulse <= 0.01 ? 'Beatless' : `Pulse ${Math.round(radioState.pulse * 100)}%`;
    $('#radio-react-label').textContent = `City ${Math.round(radioState.react * 100)}%`;

    const syncPres = radioState.syncPreset || inferMusicSyncPreset();
    $('#sel-music-sync').value = syncPres;
    const syncMap = [
      [$('#b-msync-traffic'), !!radioState.syncTraffic],
      [$('#b-msync-clouds'), !!radioState.syncClouds],
      [$('#b-msync-diurnal'), !!radioState.syncDiurnal],
      [$('#b-msync-lights'), !!radioState.syncLights],
      [$('#b-msync-atmo'), !!radioState.syncAtmo],
    ];
    let activeSyncChannels = 0;
    for (const [btn, active] of syncMap) {
      btn.classList.toggle('on', active);
      btn.setAttribute('aria-pressed', String(active));
      if (active) activeSyncChannels++;
    }
    const syncK = radioState.syncStrength ?? 0;
    $('#sl-music-env').value = String(syncK);
    $('#music-env-label').textContent = (syncK <= 0.005 || activeSyncChannels === 0)
      ? 'Sync Off'
      : `Sync ${Math.round(syncK * 100)}%`;

    $('#radio-status').textContent = on
      ? `\u266B ${st.shortName} \u00B7 ${st.bpm} BPM \u00B7 ${radioEngine.currentChordName} \u00B7 ${radioEngine.movementName}`
      : `Standby \u00B7 ${st.shortName} (press M)`;
  }

  function syncFeatureLabels() {
    $('#tint-label').textContent = `Tint ${Math.round((tune.tint ?? 0.72) * 100)}%`;
    $('#color-var-label').textContent = `Var ${Math.round((tune.colorVar ?? 0.45) * 100)}%`;
    $('#water-amt-label').textContent = (waterMode === 4 || waterAmount <= 0.005) ? 'Off' : `${Math.round(waterAmount * 100)}%`;
    $('#shoredist-label').textContent = `${shoreDist.toFixed(1)}\u00D7`;
    $('#water-scale-label').textContent = `Scale ${(tune.waterScale ?? 1).toFixed(2)}\u00D7`;
    $('#water-chop-label').textContent = (tune.waterChop ?? 1) <= 0.01 ? 'Mirror' : `Chop ${Math.round((tune.waterChop ?? 1) * 100)}%`;
    $('#water-foam-label').textContent = (tune.waterFoam ?? 0.85) <= 0.01 ? 'No Foam' : `Foam ${Math.round((tune.waterFoam ?? 0.85) * 100)}%`;
    $('#water-refl-label').textContent = `Refl ${Math.round((tune.waterRefl ?? 1.15) * 100)}%`;
    $('#water-contrast-label').textContent = `Tint ${Math.round((tune.waterContrast ?? 0.12) * 100)}%`;
    $('#water-warp-label').textContent = `Warp ${Math.round((tune.waterWarp ?? 0.4) * 100)}%`;
    $('#cloud-label').textContent = tune.clouds <= 0.005 ? 'Off' : `${Math.round(tune.clouds * 100)}%`;
    $('#cloud-puffs-label').textContent = (tune.cloudPuffs ?? 1) <= 0.005 ? 'Off' : `Puffs ${Math.round((tune.cloudPuffs ?? 1) * 100)}%`;
    $('#cloudelev-label').textContent = `${(tune.cloudElev ?? 1).toFixed(2)}\u00D7`;
    $('#cloudrange-label').textContent = `${(tune.cloudRange ?? 1).toFixed(2)}\u00D7`;
    $('#cloud-lac-label').textContent = `Lac ${(tune.cloudLac ?? 2.08).toFixed(2)}`;
    $('#windang-label').textContent = `${Math.round(tune.windAngle ?? 30)}\u00B0`;
    $('#windstr-label').textContent = (tune.windStrength ?? 1) <= 0.02 ? 'Calm' : `${(tune.windStrength ?? 1).toFixed(2)}\u00D7`;
    syncCloudLayerInspector();
    $('#sel-weather-auto').value = weatherAutoMode;
    $('#sl-weather-interval').value = String(weatherInterval);
    $('#weather-interval-label').textContent = weatherAutoMode === 'off'
      ? 'Hold'
      : (weatherInterval >= 60 ? `${Math.floor(weatherInterval / 60)}m ${String(weatherInterval % 60).padStart(2, '0')}s` : `${weatherInterval}s`);
    $('#traffspeed-label').textContent = trafficSpeed <= 0.01 ? 'Paused' : `${trafficSpeed.toFixed(2)}\u00D7`;
    $('#dayspeed-label').textContent = `${daySpeed.toFixed(2)}\u00D7`;
    $('#transit-label').textContent = transitAmt <= 0.01 ? 'Off' : `${Math.round(transitAmt * 100)}%`;
    $('#maritime-label').textContent = maritimeAmt <= 0.01 ? 'Off' : `${Math.round(maritimeAmt * 100)}%`;
    $('#air-label').textContent = airAmt <= 0.01 ? 'Off' : `${Math.round(airAmt * 100)}%`;
    const trMode = tune.trailMode ?? 1;
    const trLen = tune.trailLength ?? 1;
    $('#trail-len-label').textContent = (trMode === 0 || trLen <= 0.01) ? 'Off' : `${trLen.toFixed(1)}\u00D7`;
    $('#signs-label').textContent = signAmt <= 0.01 ? 'Off' : `${Math.round(signAmt * 100)}%`;
    $('#megawrap-label').textContent = megaWrap <= 0.01 ? 'Off' : `${Math.round(megaWrap * 100)}%`;
    $('#sign-anim-label').textContent = (tune.signAnim ?? 1) <= 0.01 ? 'Static' : `${(tune.signAnim ?? 1).toFixed(1)}\u00D7`;
    const hDens = tune.holoDensity ?? 1;
    const actHolos = holoGroup && holoGroup.userData ? holoGroup.userData.activeHoloCount : null;
    $('#holo-density-label').textContent = (hDens <= 0.01 || signAmt <= 0.01)
      ? 'Off'
      : (Number.isFinite(actHolos) ? `${actHolos} holos` : `${Math.round(hDens * 100)}%`);
    $('#holo-scale-label').textContent = `${(tune.holoScale ?? 1).toFixed(2)}\u00D7`;
    $('#holo-scan-label').textContent = (tune.holoScan ?? 1) <= 0.01 ? 'Smooth' : `Scan ${(tune.holoScan ?? 1).toFixed(1)}\u00D7`;
    $('#win-density-label').textContent = (tune.win ?? 1) <= 0.01 ? 'Blackout' : `Win # ${Math.round((tune.win ?? 1) * 100)}%`;
    $('#glow-label').textContent = (tune.glow ?? 1) <= 0.01 ? 'Off' : `Glow ${Math.round((tune.glow ?? 1) * 100)}%`;
    const activeBeams = searchlights ? searchlights.activeCount : Math.round(34 * (tune.searchCount ?? 1));
    $('#search-count-label').textContent = activeBeams <= 0 ? '0 beams' : `${activeBeams} beams`;
    $('#searchlights-label').textContent = (tune.searchLight ?? 1) <= 0.01 ? 'Off' : `${Math.round((tune.searchLight ?? 1) * 100)}%`;
    $('#lamp-density-label').textContent = (tune.lampDensity ?? 1) <= 0.01 ? 'Off' : `Lamps ${Math.round((tune.lampDensity ?? 1) * 100)}%`;
    $('#sig-density-label').textContent = (tune.sigDensity ?? 1) <= 0.01 ? 'Off' : `Sig # ${Math.round((tune.sigDensity ?? 1) * 100)}%`;
    $('#trafflights-label').textContent = (tune.trafficLight ?? 1) <= 0.01 ? 'Off' : `${Math.round((tune.trafficLight ?? 1) * 100)}%`;
    $('#vehlights-label').textContent = (tune.vehLight ?? 1) <= 0.01 ? 'Off' : `${Math.round((tune.vehLight ?? 1) * 100)}%`;
    $('#lights-label').textContent = (tune.lights ?? 1) <= 0.01 ? 'Off' : `${Math.round((tune.lights ?? 1) * 100)}%`;
    $('#veg-cover-label').textContent = vegCover <= 0.01 ? 'Off' : `${Math.round(vegCover * 100)}%`;
    $('#veg-scale-label').textContent = `${vegScale.toFixed(1)}\u00D7`;
    $('#camspeed-label').textContent = `${camSpeed.toFixed(2)}\u00D7`;
    $('#camrad-label').textContent = `${camRadius.toFixed(1)}m`;
    $('#camsmooth-label').textContent = `${Math.round(camSmooth * 100)}%`;
    $('#turnsmooth-label').textContent = `${turnSmooth.toFixed(2)}\u00D7`;
    $('#pathsmooth-label').textContent = `Smooth ${Math.round(pathSmooth * 100)}%`;
    const tdEl = $('#trans-dur-label');
    if (tdEl) {
      tdEl.textContent = editTransition === 'cut' ? 'Instant' : `${transitionDuration.toFixed(2)}s`;
    }
    const bCull = $('#b-cull');
    if (bCull) {
      bCull.classList.toggle('on', viewCulling);
      bCull.setAttribute('aria-pressed', String(viewCulling));
      bCull.title = `Frustum & distance view culling: ${viewCulling ? 'on' : 'off'}`;
    }
    syncRadioUI();
  }

  function syncAllSliders() {
    $('#seed-input').value = String(seed);
    $('#sel-look').value = lookId;
    $('#sl-tint').value = String(tune.tint ?? 0.72);
    $('#sl-color-var').value = String(tune.colorVar ?? 0.45);
    $('#sel-camstyle').value = String(camStyle);
    $('#sel-gaze-mode').value = String(gazeMode);
    if ($('#sel-edit-trans')) $('#sel-edit-trans').value = editTransition;
    if ($('#sl-trans-dur')) $('#sl-trans-dur').value = String(transitionDuration);
    if ($('#sel-quality')) $('#sel-quality').value = qualityMode;
    $('#sl-camspeed').value = String(camSpeed);
    $('#sl-camrad').value = String(camRadius);
    $('#sl-camsmooth').value = String(camSmooth);
    $('#sl-turnsmooth').value = String(turnSmooth);
    $('#sl-pathsmooth').value = String(pathSmooth);
    $('#sl-curve').value = String(worldCurve);
    $('#sl-radius').value = String(cityRadius);
    $('#sl-suburbs').value = String(suburbReach);
    $('#sel-water').value = String(waterMode);
    $('#sel-watershader').value = String(tune.waterShader ?? 0);
    $('#sl-water-amt').value = String(waterAmount);
    $('#sl-shoredist').value = String(shoreDist);
    $('#sl-water-scale').value = String(tune.waterScale ?? 1);
    $('#sl-water-chop').value = String(tune.waterChop ?? 1);
    $('#sl-water-foam').value = String(tune.waterFoam ?? 0.85);
    $('#sl-water-refl').value = String(tune.waterRefl ?? 1.15);
    $('#sl-water-contrast').value = String(tune.waterContrast ?? 0.12);
    $('#sl-water-warp').value = String(tune.waterWarp ?? 0.4);
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
    $('#sel-trail-mode').value = String(tune.trailMode ?? 1);
    $('#sl-trail-len').value = String(tune.trailLength ?? 1);
    $('#sl-signs').value = String(signAmt);
    $('#sl-megawrap').value = String(megaWrap);
    $('#sel-glyph').value = String(tune.glyphStyle ?? 0);
    $('#sl-sign-anim').value = String(tune.signAnim ?? 1);
    $('#sl-holo-density').value = String(tune.holoDensity ?? 1);
    $('#sl-holo-scale').value = String(tune.holoScale ?? 1);
    $('#sl-holo-scan').value = String(tune.holoScan ?? 1);
    $('#sl-searchlights').value = String(tune.searchLight ?? 1);
    $('#sl-search-count').value = String(tune.searchCount ?? 1);
    $('#sl-lamp-density').value = String(tune.lampDensity ?? 1);
    $('#sl-sig-density').value = String(tune.sigDensity ?? 1);
    $('#sl-trafflights').value = String(tune.trafficLight ?? 1);
    $('#sl-vehlights').value = String(tune.vehLight ?? 1);
    $('#sl-win').value = String(tune.win);
    $('#sl-glow').value = String(tune.glow);
    $('#sl-fog').value = String(tune.fog);
    $('#sl-lights').value = String(tune.lights);
    $('#sl-clouds').value = String(tune.clouds);
    $('#sl-cloud-puffs').value = String(tune.cloudPuffs ?? 1);
    $('#sl-cloudelev').value = String(tune.cloudElev ?? 1);
    $('#sl-cloudrange').value = String(tune.cloudRange ?? 1);
    syncCloudLayerInspector();
    $('#sl-cloud-seed').value = String(tune.cloudSeed ?? 0);
    $('#sl-cloud-evol').value = String(tune.cloudEvol ?? 0.35);
    $('#sl-cloud-lac').value = String(tune.cloudLac ?? 2.08);
    $('#sl-windang').value = String(tune.windAngle ?? 30);
    $('#sl-windstr').value = String(tune.windStrength ?? 1);
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
      lensMode: postState.lensMode ?? 0,
      lensDistort: postState.lensDistort ?? 0,
      lensZoom: postState.lensZoom ?? 1.0,
      anamorphic: postState.anamorphic ?? 0,
      tiltShift: postState.tiltShift ?? 0,
      tiltAngle: -(camRollDeg * Math.PI) / 180,
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
    const stormB = weather && typeof weather.stormBlend === 'number'
      ? weather.stormBlend
      : ((weatherMode === 2 || weatherMode === 6) ? 1 : 0);
    const effClouds = tune.clouds <= 0.005
      ? 0
      : tune.clouds + Math.max(0, 1.35 - tune.clouds) * stormB;
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
      if (searchlights.setCountFactor) searchlights.setCountFactor(tune.searchCount ?? 1);
    }
    if (lamps && lamps.setDensity) lamps.setDensity(tune.lampDensity ?? 1);
    if (pools && pools.setDensity) pools.setDensity(tune.lampDensity ?? 1);
    if (beacons && beacons.setDensity) beacons.setDensity(tune.lampDensity ?? 1);
    if (streetInfraObj) {
      streetInfraObj.setLook(look);
      streetInfraObj.setSignalGlow(tune.trafficLight ?? 1);
      if (streetInfraObj.setDensity) streetInfraObj.setDensity(tune.sigDensity ?? 1);
    }
    if (world.clouds) {
      const maxLayerD = Array.isArray(tune.cloudLayerDens) ? Math.max(...tune.cloudLayerDens) : 1;
      world.clouds.visible = U.uCloud.value > 0.008 && (tune.cloudPuffs ?? 1) > 0.008 && maxLayerD > 0.008;
    }
    if (billboards) billboards.visible = signAmt > 0.01;
    if (signGroup) signGroup.visible = signAmt > 0.01;
    if (holoGroup) {
      if (holoGroup.setHoloDensity) holoGroup.setHoloDensity(signAmt <= 0.01 ? 0 : (tune.holoDensity ?? 1));
      else holoGroup.visible = signAmt > 0.01 && (tune.holoDensity ?? 1) > 0.005;
    }
    if (vehicles && vehicles.setTrailConfig) {
      vehicles.setTrailConfig(tune.trailMode ?? 1, tune.trailLength ?? 1);
    }
    if (harborObj && harborObj.setTrailConfig) {
      harborObj.setTrailConfig(tune.trailMode ?? 1, tune.trailLength ?? 1);
    }
    if (spaceportObj && spaceportObj.setTrailConfig) {
      spaceportObj.setTrailConfig(tune.trailMode ?? 1, tune.trailLength ?? 1);
    }
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
    baseUniformSnap.winGlow = U.uWinGlow.value;
    baseUniformSnap.billK = U.uBillK.value;
    baseUniformSnap.cloud = U.uCloud.value;
    baseUniformSnap.cloudSeed = U.uCloudSeed.value;
    baseUniformSnap.cloudEvol = U.uCloudEvol.value;
    baseUniformSnap.holoScale = U.uHoloScale.value;
    if (!skipURL) syncURL();
  }

  function persistStartingState() {
    if (!bootCompleted || demoBoot) return;
    try {
      if (window.localStorage) {
        const compactTok = encodeExactState(captureExactState(), { compact: true });
        window.localStorage.setItem(STORAGE_LAST_STATE_KEY, compactTok);
      }
    } catch {
      /* sandboxed / quota storage — keep in-memory */
    }
  }

  function syncURL(includeExactToken = false) {
    persistStartingState();
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
      const hashToken = buildCompactShareToken();
      const shortP = new URLSearchParams();
      shortP.set('seed', String(seed));
      shortP.set('look', lookId);
      history.replaceState(null, '', `${location.pathname}?${shortP}#s=${hashToken}`);
      return;
    }
    // Keep clean root URL intact when booted without explicit URL state so browser reload
    // restores the complete saved starting state from localStorage (`petacity.lastState.v1`)!
    if (hasExplicitUrlState) {
      history.replaceState(null, '', `${location.pathname}?${p}`);
    }
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
      weatherAutoMode,
      weatherInterval,
      dustLevel,
      glide: glideOn,
      gazeMode,
      autoLook: autoLookOn,
      freelook: freelookOn,
      collide: collideOn,
      avoidance: avoidOn,
      camSpeed,
      camRadius,
      camSmooth,
      turnSmooth,
      gimbalSmooth,
      leadFraming,
      camStyle,
      pathSmooth,
      editTransition,
      transitionDuration,
      qualityMode,
      viewCulling,
      tune: { ...tune },
      post: { ...postState },
      radio: {
        ...radioState,
        station: radioEngine.stationIndex,
        playing: !!radioEngine.playing,
      },
      custom: LOOK_BY_ID.custom.customConfig ? { ...LOOK_BY_ID.custom.customConfig } : { ...DEFAULT_CUSTOM },
      camera: { ...controls.getPose(), fov: camFov },
      bookmarks,
      autoLoop: userLoopOverride && userLoopOverride.length >= 3 ? userLoopOverride : undefined,
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
    turnSmooth = st.turnSmooth ?? 1.25;
    gimbalSmooth = st.gimbalSmooth ?? 1;
    leadFraming = st.leadFraming ?? 0.82;
    camStyle = st.camStyle ?? 0;
    pathSmooth = st.pathSmooth ?? 0.65;
    editTransition = st.editTransition || 'cut';
    transitionDuration = st.transitionDuration ?? 0.95;
    qualityMode = st.qualityMode || 'auto';
    viewCulling = st.viewCulling !== false;
    controls.speedMul = camSpeed;
    controls.colliderRadius = camRadius;
    controls.smoothness = camSmooth;
    controls.turnSmooth = turnSmooth;
    controls.gimbalSmooth = gimbalSmooth;
    controls.leadFraming = leadFraming;
    controls.motionStyle = camStyle;
    applyPerformanceProfile();
    weatherMode = st.weatherMode;
    weatherAutoMode = st.weatherAutoMode || 'off';
    weatherInterval = st.weatherInterval || 60;
    weatherAutoTimer = 0;
    dustLevel = st.dustLevel;
    Object.assign(tune, st.tune);
    if (!Array.isArray(tune.cloudLayerElev) || tune.cloudLayerElev.length !== 3) {
      const pr = CLOUD_LAYER_PRESETS[clampInt(tune.cloudLayersMode ?? 1, 0, 7, 1)] || defLayerPreset;
      tune.cloudLayerElev = [...pr.elev];
      tune.cloudLayerThick = [...pr.thick];
      tune.cloudLayerDens = [...pr.dens];
    }
    if (st.radio) {
      Object.assign(radioState, st.radio);
      radioEngine.setStation(radioState.station);
      radioEngine.setVolume(radioState.volume);
      radioEngine.setSpace(radioState.space);
      radioEngine.setWarmth(radioState.warmth);
      radioEngine.setPulse(radioState.pulse);
      radioEngine.setCityReactivity(radioState.react);
      radioEngine.setPlaylist({
        mode: radioState.playlistMode || 'seq',
        interval: radioState.playlistInterval || 75,
      });
      if (st.radio.playing && !radioEngine.playing) radioEngine.start();
      else if (st.radio.playing === false && radioEngine.playing) radioEngine.stop();
    }
    if (Array.isArray(st.autoLoop) && st.autoLoop.length >= 3) {
      userLoopOverride = st.autoLoop.map((p) => ({ ...p }));
    } else {
      userLoopOverride = null;
    }
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
      syncAutopilotLoop();
      if (vehicles && vehicles.setTrafficSpeed) vehicles.setTrafficSpeed(trafficSpeed);
    }
    refreshLook(false);

    if (st.avoidance !== avoidOn) setAvoidanceState(st.avoidance);
    if (st.collide !== collideOn) setCollisionState(st.collide);
    if (st.glide !== glideOn) setGlideState(st.glide);
    if (st.gazeMode !== undefined) setGazeModeState(st.gazeMode, false);
    else if (!!st.autoLook !== autoLookOn) setAutoLookState(!!st.autoLook);
    if (!!st.freelook !== freelookOn) setFreelookState(!!st.freelook);

    if (applyBookmarks && st.bookmarks && st.bookmarks.length) {
      bookmarks = st.bookmarks.map((b) => ({ ...b }));
      writeStorageJSON(STORAGE_BOOKMARKS_KEY, bookmarks);
      renderBookmarks();
    }
    if (applyCamera && st.camera) {
      fly = null;
      if (Number.isFinite(st.camera.fov)) camFov = clampFloat(st.camera.fov, 15, 150, 58);
      if (Number.isFinite(st.camera.roll)) camRollDeg = clampFloat((st.camera.roll * 180) / Math.PI, -180, 180, 0);
      controls.setPose(st.camera);
      syncPostSliders();
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
    const savedTrans = editTransition;
    const savedTransDur = transitionDuration;
    const applyFound = (found) => {
      const doCut = () => {
        applyStateObject(found.state, { applyCamera: true, applyBookmarks: false });
        // Preserve user's chosen edit transition if preset didn't explicitly specify one
        if (!found.state || !found.state.editTransition || found.state.editTransition === 'cut') {
          editTransition = savedTrans;
          transitionDuration = savedTransDur;
          syncAllSliders();
        }
      };
      if (savedTrans !== 'cut') {
        triggerSceneTransition({ type: savedTrans, duration: savedTransDur, onCut: doCut });
      } else {
        doCut();
      }
      flash(`Preset · ${found.label}`);
    };
    if (val.startsWith('b:')) {
      const id = val.slice(2);
      const found = WORLD_PRESETS.find((p) => p.id === id);
      if (found) applyFound(found);
    } else if (val.startsWith('u:')) {
      const id = val.slice(2);
      const found = userPresets.find((p) => p.id === id);
      if (found) applyFound(found);
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
    const doLookSwitch = () => {
      if (lookId !== 'custom') prevPresetLookId = lookId;
      lookId = nextId;
      timeOfDay = LOOK_BY_ID[lookId].defTime;
      tune.tint = LOOK_BY_ID[lookId].defTint ?? 0.72;
      $('#sl-time').value = String(timeOfDay);
      $('#sl-tint').value = String(tune.tint);
      refreshLook(true);
    };
    if (editTransition !== 'cut') {
      triggerSceneTransition({ type: editTransition, duration: transitionDuration, onCut: doLookSwitch });
    } else {
      doLookSwitch();
    }
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

  function subsampleFrames(frames, maxCount) {
    if (!Array.isArray(frames) || frames.length <= maxCount) return frames;
    const out = [];
    for (let i = 0; i < maxCount; i++) {
      const idx = Math.round((i / (maxCount - 1)) * (frames.length - 1));
      out.push(frames[idx]);
    }
    return out;
  }

  function buildCompactShareToken() {
    const st = captureExactState();
    let token = encodeExactState(st);
    // Keep share URLs well under ~1,400 chars for chat apps, SMS, QR & proxies
    if (token.length > 1250 && st.path && Array.isArray(st.path.frames)) {
      const sub = { ...st, path: { ...st.path, frames: subsampleFrames(st.path.frames, 20) } };
      token = encodeExactState(sub);
    }
    if (token.length > 1350 && st.path) {
      const noPath = { ...st };
      delete noPath.path;
      token = encodeExactState(noPath);
    }
    if (token.length > 1350 && st.bookmarks) {
      const minimal = { ...st };
      delete minimal.path;
      delete minimal.bookmarks;
      delete minimal.autoLoop;
      token = encodeExactState(minimal);
    }
    return token;
  }

  function buildExactShareURL() {
    syncURL(true);
    return location.href;
  }

  async function copyExactShareURL() {
    const url = buildExactShareURL();
    $('#export-text').value = url;
    try {
      await navigator.clipboard.writeText(url);
      flash(`Share URL copied (${url.length} chars)`);
    } catch {
      $('#export-box').classList.add('on');
      $('#b-export').classList.add('on');
      $('#b-export').setAttribute('aria-pressed', 'true');
      $('#export-text').focus();
      $('#export-text').select();
      flash('Share URL ready');
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
    const decoded = decodeExactState(raw);
    if (!decoded) {
      flash('Could not parse state');
      return;
    }
    applyStateObject(decoded, { applyCamera: true, applyBookmarks: true });
    flash('Exact state restored');
  };

  window.addEventListener('hashchange', () => {
    const hp = new URLSearchParams((location.hash || '').replace(/^#/, ''));
    const tok = hp.get('s');
    if (!tok) return;
    const decoded = decodeExactState(tok);
    if (decoded) {
      applyStateObject(decoded, { applyCamera: true, applyBookmarks: true });
      flash('Exact state restored from URL');
    }
  });

  $('#b-new').onclick = () => {
    const doNewCity = () => {
      seed = 1 + Math.floor(Math.random() * 999999998);
      $('#seed-input').value = String(seed);
      rebuild();
    };
    if (editTransition !== 'cut') {
      triggerSceneTransition({ type: editTransition, duration: transitionDuration, onCut: doNewCity });
    } else {
      doNewCity();
    }
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
  async function triggerStandaloneDemoExport() {
    flash('Bundling single-file HTML autoloop demo…');
    try {
      const demoState = {
        ...captureExactState(),
        glide: true,
        autoLoop: Array.isArray(controls.autopilotLoop) && controls.autopilotLoop.length >= 3
          ? controls.autopilotLoop
          : undefined,
      };
      const fname = `petacity-demo-${seed}-${lookId}.html`;
      const res = await exportStandaloneDemoHTML({ demoState, filename: fname });
      flash(`Exported standalone demo · ${(res.byteLength / (1024 * 1024)).toFixed(2)} MB HTML`);
    } catch (err) {
      flash('HTML demo export failed: ' + ((err && err.message) || err));
    }
  }
  $('#b-demo-html').onclick = triggerStandaloneDemoExport;
  $('#b-demo-export').onclick = triggerStandaloneDemoExport;

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

  const toggleRadio = () => {
    const on = radioEngine.toggle();
    radioState.playing = on;
    syncRadioUI();
    persistStartingState();
    flash(on
      ? `\u266B Music ON \u00B7 ${radioEngine.station.name}`
      : '\u266B Synth music paused');
  };
  $('#b-radio').onclick = toggleRadio;
  $('#b-radio-play').onclick = toggleRadio;
  const stepRadioTrack = (delta) => {
    const wasPlaying = radioEngine.playing;
    const st = delta < 0
      ? radioEngine.prevStation({ smooth: wasPlaying })
      : radioEngine.nextStation({ smooth: wasPlaying });
    radioState.station = radioEngine.effectiveStationIndex;
    if (!wasPlaying) {
      radioEngine.start();
      radioState.playing = true;
    }
    syncRadioUI();
    persistStartingState();
    const arrow = delta < 0 ? '\u2190' : '\u2192';
    flash(wasPlaying ? `\u266B Crossfading ${arrow} ${st.name}` : `\u266B ${st.name}`);
  };
  $('#b-radio-prev').onclick = () => stepRadioTrack(-1);
  $('#b-radio-next').onclick = () => stepRadioTrack(1);
  $('#b-radio-seed').onclick = () => {
    radioEngine.reseed();
    syncRadioUI();
    flash('\u21BB New generative synth sequence seed');
  };
  $('#sel-radio-station').onchange = (ev) => {
    const idx = clampInt(ev.target.value, 0, RADIO_STATIONS.length - 1, 0);
    const st = radioEngine.setStation(idx);
    radioState.station = radioEngine.stationIndex;
    syncRadioUI();
    persistStartingState();
    flash(`\u266B ${st.name}`);
  };
  $('#sel-radio-playlist').onchange = (ev) => {
    const mode = ['loop', 'seq', 'shuffle'].includes(ev.target.value) ? ev.target.value : 'seq';
    radioState.playlistMode = mode;
    radioEngine.setPlaylist({ mode });
    syncRadioUI();
    persistStartingState();
    flash(mode === 'shuffle'
      ? '\u266B Playlist · Shuffle Crossfade'
      : (mode === 'seq' ? '\u266B Playlist · Sequential Crossfade' : '\u266B Playlist · Hold Current Station'));
  };
  bindSlider($('#sl-radio-interval'), (v) => {
    const sec = clampInt(v, 20, 240, 75);
    radioState.playlistInterval = sec;
    radioEngine.setPlaylist({ interval: sec });
    syncRadioUI();
    persistStartingState();
  });

  // Music -> Environment mapping preset, per-channel toggles & coupling strength
  $('#sel-music-sync').onchange = (ev) => {
    applyMusicSyncPreset(ev.target.value);
    syncRadioUI();
    persistStartingState();
    const pr = MUSIC_SYNC_PRESETS.find((p) => p.id === radioState.syncPreset);
    flash(`\u266B ${pr ? pr.label : 'World Sync updated'}`);
  };
  const bindMusicSyncChannel = (btnEl, field, label) => {
    btnEl.onclick = () => {
      radioState[field] = !radioState[field];
      if (radioState[field] && (radioState.syncStrength ?? 0) <= 0.01) {
        radioState.syncStrength = 1.0;
      }
      radioState.syncPreset = inferMusicSyncPreset();
      if (radioState.syncPreset === 'off') {
        if (vehicles && vehicles.setTrafficSpeed) vehicles.setTrafficSpeed(trafficSpeed);
        refreshLook(false, true);
      }
      syncRadioUI();
      persistStartingState();
      flash(`\u266B ${label} \u00B7 ${radioState[field] ? 'ON' : 'OFF'}`);
    };
  };
  bindMusicSyncChannel($('#b-msync-traffic'), 'syncTraffic', 'Traffic Tempo \u2190 Music BPM');
  bindMusicSyncChannel($('#b-msync-clouds'), 'syncClouds', 'Cloud Shifts \u2190 Chord Changes');
  bindMusicSyncChannel($('#b-msync-diurnal'), 'syncDiurnal', 'Diurnal Sky \u2190 Chord Changes');
  bindMusicSyncChannel($('#b-msync-lights'), 'syncLights', 'City Lights & Holos \u2190 Beat');
  bindMusicSyncChannel($('#b-msync-atmo'), 'syncAtmo', 'Atmosphere & Bloom \u2190 Harmony');
  bindSlider($('#sl-music-env'), (v) => {
    const nextK = clampFloat(v, 0, 1.5, 0);
    radioState.syncStrength = nextK;
    if (nextK > 0.01 && !radioState.syncTraffic && !radioState.syncClouds && !radioState.syncDiurnal && !radioState.syncLights && !radioState.syncAtmo) {
      // Enabling strength from 0 turns on Full Symphonic City channels automatically
      radioState.syncTraffic = true;
      radioState.syncClouds = true;
      radioState.syncDiurnal = true;
      radioState.syncLights = true;
      radioState.syncAtmo = true;
    }
    radioState.syncPreset = inferMusicSyncPreset();
    if (nextK <= 0.005) {
      if (vehicles && vehicles.setTrafficSpeed) vehicles.setTrafficSpeed(trafficSpeed);
      refreshLook(false, true);
    }
    syncRadioUI();
    persistStartingState();
  });

  const nudgeCameraSpeed = (dir) => {
    camSpeed = stepCameraSpeed(camSpeed, dir, { min: 0, max: 3.5 });
    controls.rampSpeedMultiplier(camSpeed);
    $('#sl-camspeed').value = String(camSpeed);
    syncFeatureLabels();
    persistStartingState();
    flash(camSpeed <= 0.001
      ? '\u00BB Speed \u00B7 0.00\u00D7 (Hover)'
      : `\u00BB Speed \u00B7 ${camSpeed.toFixed(2)}\u00D7`);
  };

  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.shiftKey && e.key === 'ArrowUp') {
      e.preventDefault();
      nudgeCameraSpeed(1);
      return;
    }
    if (e.shiftKey && e.key === 'ArrowDown') {
      e.preventDefault();
      nudgeCameraSpeed(-1);
      return;
    }
    if (e.shiftKey && e.key === 'ArrowRight') {
      e.preventDefault();
      stepRadioTrack(1);
      return;
    }
    if (e.shiftKey && e.key === 'ArrowLeft') {
      e.preventDefault();
      stepRadioTrack(-1);
      return;
    }
    if (e.key === 'h' || e.key === 'H') toggleUI();
    else if ((e.key === 'p' || e.key === 'P') && e.shiftKey) togglePathPlay();
    else if (e.key === 'p' || e.key === 'P') toggleGlide();
    else if (e.key === 'g' || e.key === 'G') toggleGlide();
    else if (e.key === 'm' || e.key === 'M') toggleRadio();
    else if (e.key === 'o' || e.key === 'O') toggleAutoLook();
    else if (e.key === 'l' || e.key === 'L') toggleFreelook();
    else if (e.key === 'v' || e.key === 'V') toggleAvoidance();
    else if (e.key === 'c' || e.key === 'C') toggleCollision();
    else if (e.key === 't' || e.key === 'T') toggleTimeCycle();
    else if (e.key === 'r' || e.key === 'R') togglePathRecord();
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
  bindSlider($('#sl-color-var'), (v) => {
    tune.colorVar = clampFloat(v, 0, 1.2, 0.45);
    refreshLook();
  });
  $('#sel-camstyle').value = String(camStyle);
  $('#sel-camstyle').onchange = (ev) => {
    camStyle = clampInt(ev.target.value, 0, 4, 0);
    controls.motionStyle = camStyle;
    flash(`Camera · ${CAMERA_STYLE_NAMES[camStyle] || 'Cinema Drone'}`);
  };
  bindSlider($('#sl-camspeed'), (v) => {
    camSpeed = clampFloat(v, 0, 5.0, 1);
    controls.speedMul = camSpeed;
    syncFeatureLabels();
    persistStartingState();
  });
  bindSlider($('#sl-camrad'), (v) => {
    camRadius = clampFloat(v, 0.5, 12, 2.2);
    controls.colliderRadius = camRadius;
    syncFeatureLabels();
  });
  bindSlider($('#sl-camsmooth'), (v) => {
    camSmooth = clampFloat(v, 0, 1.5, 0.88);
    controls.smoothness = camSmooth;
    syncFeatureLabels();
  });
  bindSlider($('#sl-turnsmooth'), (v) => {
    turnSmooth = clampFloat(v, 0.2, 5.0, 1.65);
    controls.turnSmooth = turnSmooth;
    syncFeatureLabels();
  });

  // Camera Optics, Wide-Angle, 360-deg Projections & Strange Angles
  $('#sel-lens-mode').onchange = (ev) => {
    postState.lensMode = clampInt(ev.target.value, 0, 9, 0);
    syncCameraOptics();
    syncURL();
    flash(`Optics \u00B7 ${LENS_MODE_NAMES[postState.lensMode] || 'Rectilinear'}`);
  };
  const applyAnglePresetByIndex = (idx) => {
    const pr = CAMERA_ANGLE_PRESETS[clampInt(idx, 0, CAMERA_ANGLE_PRESETS.length - 1, 0)];
    if (!pr) return;
    postState.lensMode = pr.lensMode;
    camFov = pr.fov;
    postState.lensDistort = pr.distort;
    postState.lensZoom = pr.zoom;
    camRollDeg = pr.roll;
    postState.anamorphic = pr.anamorphic;
    postState.tiltShift = pr.tiltShift;
    const pose = controls.getPose();
    if (pr.pitchDeg !== undefined) pose.pitch = (pr.pitchDeg * Math.PI) / 180;
    if (pr.altitude !== undefined) {
      const terrY = cityCollider && cityCollider.groundHeightAt
        ? cityCollider.groundHeightAt(pose.x, pose.z)
        : 0;
      const roofNear = cityCollider && cityCollider.maxHeightNear
        ? cityCollider.maxHeightNear(pose.x, pose.z, 6) * heightScale
        : 0;
      pose.y = Math.max(terrY + pr.altitude, pr.altitude < 60 ? roofNear + 12 : terrY + pr.altitude);
    }
    pose.roll = (camRollDeg * Math.PI) / 180;
    controls.setPose(pose);
    syncPostSliders();
    syncURL();
    flash(`Shot \u00B7 ${pr.label}`);
  };
  $('#sel-angle-preset').onchange = (ev) => applyAnglePresetByIndex(ev.target.value);
  $('#b-angle-apply').onclick = () => applyAnglePresetByIndex($('#sel-angle-preset').value);
  $('#b-opt-reset').onclick = () => {
    $('#sel-angle-preset').value = '0';
    applyAnglePresetByIndex(0);
  };
  bindSlider($('#sl-cam-fov'), (v) => {
    camFov = clampFloat(v, 15, 150, 58);
    if ((postState.lensMode ?? 0) >= 4) {
      postState.lensMode = 0;
      $('#sel-lens-mode').value = '0';
    }
    syncCameraOptics();
  });
  bindSlider($('#sl-lens-distort'), (v) => {
    postState.lensDistort = clampFloat(v, -1, 1.25, 0);
    syncCameraOptics();
  });
  bindSlider($('#sl-lens-zoom'), (v) => {
    postState.lensZoom = clampFloat(v, 0.35, 2.5, 1);
    syncCameraOptics();
  });
  bindSlider($('#sl-cam-roll'), (v) => {
    camRollDeg = clampFloat(v, -180, 180, 0);
    syncCameraOptics();
  });
  bindSlider($('#sl-anamorphic'), (v) => {
    postState.anamorphic = clampFloat(v, 0, 1, 0);
    syncCameraOptics();
  });
  bindSlider($('#sl-tilt-shift'), (v) => {
    postState.tiltShift = clampFloat(v, 0, 1, 0);
    syncCameraOptics();
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
  $('#sel-watershader').value = String(tune.waterShader ?? 0);
  $('#sel-watershader').onchange = (ev) => {
    tune.waterShader = clampInt(ev.target.value, 0, 4, 0);
    U.uWaterShader.value = tune.waterShader;
    refreshLook();
    flash(`Water Shader · ${WATER_SHADER_NAMES[tune.waterShader] || 'Capillary Micro-Facet'}`);
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
  $('#sel-trail-mode').value = String(tune.trailMode ?? 1);
  $('#sel-trail-mode').onchange = (ev) => {
    tune.trailMode = clampInt(ev.target.value, 0, 5, 1);
    refreshLook();
    flash(`Trails \u00B7 ${TRAIL_MODE_NAMES[tune.trailMode] || 'Classic'}`);
  };
  bindSlider($('#sl-trail-len'), (v) => {
    tune.trailLength = clampFloat(v, 0, 2.5, 1);
    refreshLook();
  });
  bindSlider($('#sl-signs'), (v) => {
    signAmt = clampFloat(v, 0, 2.5, 1);
    U.uSignAmt.value = signAmt;
    if (billboards) billboards.visible = signAmt > 0.01;
    if (signGroup) signGroup.visible = signAmt > 0.01;
    if (holoGroup) {
      if (holoGroup.setHoloDensity) holoGroup.setHoloDensity(signAmt <= 0.01 ? 0 : (tune.holoDensity ?? 1));
      else holoGroup.visible = signAmt > 0.01;
    }
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
  bindSlider($('#sl-holo-density'), (v) => {
    tune.holoDensity = clampFloat(v, 0, 2.5, 1);
    if (holoGroup && holoGroup.setHoloDensity) {
      holoGroup.setHoloDensity(signAmt <= 0.01 ? 0 : tune.holoDensity);
    }
    syncFeatureLabels();
    syncURL();
  });
  bindSlider($('#sl-holo-scale'), (v) => {
    tune.holoScale = clampFloat(v, 0.35, 2.2, 1);
    refreshLook();
  });
  bindSlider($('#sl-holo-scan'), (v) => {
    tune.holoScan = clampFloat(v, 0, 2.5, 1);
    refreshLook();
  });
  bindSlider($('#sl-searchlights'), (v) => {
    tune.searchLight = clampFloat(v, 0, 2.5, 1);
    if (searchlights && searchlights.setAmount) searchlights.setAmount(tune.searchLight);
    syncFeatureLabels();
  });
  bindSlider($('#sl-search-count'), (v) => {
    tune.searchCount = clampFloat(v, 0, 2, 1);
    if (searchlights && searchlights.setCountFactor) searchlights.setCountFactor(tune.searchCount);
    syncFeatureLabels();
  });
  bindSlider($('#sl-lamp-density'), (v) => {
    tune.lampDensity = clampFloat(v, 0, 2, 1);
    if (lamps && lamps.setDensity) lamps.setDensity(tune.lampDensity);
    if (pools && pools.setDensity) pools.setDensity(tune.lampDensity);
    if (beacons && beacons.setDensity) beacons.setDensity(tune.lampDensity);
    syncFeatureLabels();
  });
  bindSlider($('#sl-sig-density'), (v) => {
    tune.sigDensity = clampFloat(v, 0, 1.5, 1);
    if (streetInfraObj && streetInfraObj.setDensity) streetInfraObj.setDensity(tune.sigDensity);
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
  bindSlider($('#sl-water-scale'), (v) => { tune.waterScale = clampFloat(v, 0.2, 4, 1); refreshLook(); });
  bindSlider($('#sl-water-chop'), (v) => { tune.waterChop = clampFloat(v, 0, 2.5, 1); refreshLook(); });
  bindSlider($('#sl-water-foam'), (v) => { tune.waterFoam = clampFloat(v, 0, 2.5, 0.85); refreshLook(); });
  bindSlider($('#sl-water-refl'), (v) => { tune.waterRefl = clampFloat(v, 0, 2.5, 1.15); refreshLook(); });
  bindSlider($('#sl-water-contrast'), (v) => { tune.waterContrast = clampFloat(v, 0, 1, 0.12); refreshLook(); });
  bindSlider($('#sl-water-warp'), (v) => { tune.waterWarp = clampFloat(v, 0, 2, 0.4); refreshLook(); });
  bindSlider($('#sl-win'), (v) => { tune.win = clampFloat(v, 0, 2.5, 1); refreshLook(); });
  bindSlider($('#sl-glow'), (v) => { tune.glow = v; refreshLook(); });
  bindSlider($('#sl-fog'), (v) => { tune.fog = v; refreshLook(); });
  bindSlider($('#sl-lights'), (v) => { tune.lights = v; refreshLook(); });
  bindSlider($('#sl-clouds'), (v) => { tune.clouds = v; refreshLook(); });
  bindSlider($('#sl-cloud-puffs'), (v) => { tune.cloudPuffs = clampFloat(v, 0, 2, 1); refreshLook(); });
  bindSlider($('#sl-cloudelev'), (v) => { tune.cloudElev = clampFloat(v, 0.05, 2.4, 1); refreshLook(); });
  bindSlider($('#sl-cloudrange'), (v) => { tune.cloudRange = clampFloat(v, 0.3, 3.0, 1); refreshLook(); });
  $('#sel-cloud-layers').onchange = (ev) => {
    const mode = clampInt(ev.target.value, 0, CLOUD_LAYER_PRESETS.length - 1, 1);
    tune.cloudLayersMode = mode;
    if (mode < 7) {
      const pr = CLOUD_LAYER_PRESETS[mode];
      tune.cloudLayerElev = [...pr.elev];
      tune.cloudLayerThick = [...pr.thick];
      tune.cloudLayerDens = [...pr.dens];
      if (mode === 3) cloudEditLayer = 0;
      else if (mode === 4) cloudEditLayer = 1;
      else if (mode === 5) cloudEditLayer = 2;
    }
    refreshLook();
    flash(`Clouds \u00B7 ${(CLOUD_LAYER_PRESETS[mode] && CLOUD_LAYER_PRESETS[mode].name) || 'Custom Layers'}`);
  };
  $('#sel-cloud-edit').onchange = (ev) => {
    cloudEditLayer = clampInt(ev.target.value, 0, 2, 1);
    syncCloudLayerInspector();
  };
  bindSlider($('#sl-clayer-dens'), (v) => {
    if (!Array.isArray(tune.cloudLayerDens)) tune.cloudLayerDens = [...defLayerPreset.dens];
    tune.cloudLayerDens[cloudEditLayer] = clampFloat(v, 0, 2, 1);
    tune.cloudLayersMode = 7;
    refreshLook();
  });
  bindSlider($('#sl-clayer-elev'), (v) => {
    if (!Array.isArray(tune.cloudLayerElev)) tune.cloudLayerElev = [...defLayerPreset.elev];
    tune.cloudLayerElev[cloudEditLayer] = clampFloat(v, 5, 2800, 680);
    tune.cloudLayersMode = 7;
    refreshLook();
  });
  bindSlider($('#sl-clayer-thick'), (v) => {
    if (!Array.isArray(tune.cloudLayerThick)) tune.cloudLayerThick = [...defLayerPreset.thick];
    tune.cloudLayerThick[cloudEditLayer] = clampFloat(v, 25, 1600, 620);
    tune.cloudLayersMode = 7;
    refreshLook();
  });
  bindSlider($('#sl-radio-vol'), (v) => {
    radioState.volume = clampFloat(v, 0, 1, 0.68);
    radioEngine.setVolume(radioState.volume);
    syncRadioUI();
  });
  bindSlider($('#sl-radio-space'), (v) => {
    radioState.space = clampFloat(v, 0, 1.5, 0.9);
    radioEngine.setSpace(radioState.space);
    syncRadioUI();
  });
  bindSlider($('#sl-radio-warmth'), (v) => {
    radioState.warmth = clampFloat(v, 0.1, 1.5, 0.8);
    radioEngine.setWarmth(radioState.warmth);
    syncRadioUI();
  });
  bindSlider($('#sl-radio-pulse'), (v) => {
    radioState.pulse = clampFloat(v, 0, 1.5, 0.55);
    radioEngine.setPulse(radioState.pulse);
    syncRadioUI();
  });
  bindSlider($('#sl-radio-react'), (v) => {
    radioState.react = clampFloat(v, 0, 1, 0.65);
    radioEngine.setCityReactivity(radioState.react);
    syncRadioUI();
  });
  bindSlider($('#sl-cloud-seed'), (v) => { tune.cloudSeed = v; refreshLook(); });
  bindSlider($('#sl-cloud-evol'), (v) => { tune.cloudEvol = v; refreshLook(); });
  bindSlider($('#sl-cloud-lac'), (v) => { tune.cloudLac = v; refreshLook(); });
  bindSlider($('#sl-windang'), (v) => {
    tune.windAngle = clampFloat(v, 0, 360, 30);
    U.uWindAngle.value = (tune.windAngle * Math.PI) / 180;
    refreshLook();
  });
  bindSlider($('#sl-windstr'), (v) => {
    tune.windStrength = clampFloat(v, 0, 2.5, 1);
    U.uWindStrength.value = tune.windStrength;
    refreshLook();
  });
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
    weatherAutoTimer = 0;
    weather.setMode(weatherMode);
    syncWeatherLabel();
    refreshLook();
  });
  $('#sel-weather-auto').value = weatherAutoMode;
  $('#sel-weather-auto').onchange = (ev) => {
    const m = String(ev.target.value || 'off');
    weatherAutoMode = ['off', 'seq', 'shuffle', 'cinematic'].includes(m) ? m : 'off';
    weatherAutoTimer = 0;
    syncFeatureLabels();
    syncURL();
    flash(weatherAutoMode === 'off'
      ? 'Weather Cycle \u00B7 Hold Current Mode'
      : `\u21BB Weather Auto-Cycle \u00B7 ${weatherAutoMode} (${weatherInterval}s)`);
  };
  bindSlider($('#sl-weather-interval'), (v) => {
    weatherInterval = clampInt(v, 15, 240, 60);
    weatherAutoTimer = Math.min(weatherAutoTimer, weatherInterval * 0.9);
    syncFeatureLabels();
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

  // Scene Edit Transitions & Low-End Performance / View Culling controls
  if ($('#sel-edit-trans')) {
    $('#sel-edit-trans').value = editTransition;
    $('#sel-edit-trans').onchange = (ev) => {
      const next = SCENE_TRANSITION_NAMES.includes(ev.target.value) ? ev.target.value : 'cut';
      editTransition = next;
      syncFeatureLabels();
      syncURL();
      flash(`Scene Edit · ${editTransition.replace(/_/g, ' ')}`);
    };
  }
  if ($('#b-trans-preview')) {
    $('#b-trans-preview').onclick = () => {
      const previewType = editTransition === 'cut' ? 'dissolve' : editTransition;
      triggerSceneTransition({ type: previewType, duration: transitionDuration });
      flash(`Transition Preview · ${previewType.replace(/_/g, ' ')} (${transitionDuration.toFixed(2)}s)`);
    };
  }
  if ($('#sl-trans-dur')) {
    bindSlider($('#sl-trans-dur'), (v) => {
      transitionDuration = clampFloat(v, 0.15, 3.5, 0.95);
      syncFeatureLabels();
    });
  }
  if ($('#sel-quality')) {
    $('#sel-quality').value = qualityMode;
    $('#sel-quality').onchange = (ev) => {
      const q = ['auto', 'low', 'medium', 'high', 'ultra'].includes(ev.target.value) ? ev.target.value : 'auto';
      qualityMode = q;
      lowFpsTimer = 0;
      highFpsTimer = 0;
      applyPerformanceProfile();
      syncFeatureLabels();
      syncURL();
      flash(`Quality Tier · ${qualityMode === 'auto' ? `Auto (${autoTier})` : qualityMode}`);
    };
  }
  if ($('#b-cull')) {
    $('#b-cull').onclick = () => {
      viewCulling = !viewCulling;
      viewCuller.setEnabled(viewCulling);
      syncFeatureLabels();
      syncURL();
      flash(viewCulling ? '\u25C9 View Culling ON' : '\u25CB View Culling OFF');
    };
  }

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
    b.textContent = on ? '\u25A0' : '\u23FA';
    b.title = on ? 'Stop scene video recording' : 'Start high-bitrate scene video capture';
    const ba = $('#b-vid-audio');
    ba.classList.toggle('on', vidAudioOn);
    ba.setAttribute('aria-pressed', String(vidAudioOn));
    ba.title = `Record pure-code synth soundtrack in video export: ${vidAudioOn ? 'on' : 'off'}`;
  }

  function buildVideoCaptureOpts(filename) {
    const resPreset = $('#sel-res').value || '1080p';
    const fps = clampInt($('#sel-vid-fps').value, 24, 60, 60);
    const quality = $('#sel-vid-quality').value || 'ultra';
    const codec = $('#sel-vid-codec').value || 'auto';
    let audioStream = null;
    if (vidAudioOn) {
      audioStream = radioEngine.getAudioStream({ autoStart: true });
      syncRadioUI();
    }
    return {
      fps,
      resolution: resPreset,
      quality,
      codec,
      audioStream,
      filename,
    };
  }

  $('#b-vid-audio').onclick = () => {
    vidAudioOn = !vidAudioOn;
    syncVidBtn();
    flash(vidAudioOn ? '\u266B Video export sound: ON' : 'Video export sound: muted');
  };

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
      flash(res ? `Saved ${res.filename}` : 'Video capture stopped');
    } else {
      const resTag = $('#sel-res').value || '1080p';
      const fname = `petacity-${seed}-${lookId}-${resTag}.webm`;
      const started = exporter.startVideoCapture(buildVideoCaptureOpts(fname));
      syncVidBtn();
      flash(`Recording ${started.ext.toUpperCase()} (${resTag}${started.hasAudio ? ' + Sound' : ''})…`);
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
    const resTag = $('#sel-res').value || '1080p';
    const fname = `petacity-path-${seed}-${lookId}-${resTag}.webm`;
    const started = exporter.startVideoCapture(buildVideoCaptureOpts(fname));
    pathRecorder.play(true);
    syncVidBtn();
    syncPathUI();
    flash(`Rendering ${pathRecorder.duration.toFixed(1)}s path (${resTag}${started.hasAudio ? ' + Sound' : ''})…`);
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
    b.title = (glideOn ? 'Stop' : 'Start') + ' Autopilot Loop Glide — drag to steer, wheel for speed (P)';
    const bMapFollow = $('#b-minimap-follow');
    if (bMapFollow) {
      bMapFollow.textContent = glideOn ? '\u23F8' : '\u25B6';
      bMapFollow.classList.toggle('on', glideOn);
      bMapFollow.setAttribute('aria-pressed', String(glideOn));
      bMapFollow.title = (glideOn ? 'Pause' : 'Follow') + ' active minimap Route or Cyan Loop (P)';
    }
    persistStartingState();
    if (announce) {
      if (glideOn) {
        const nStops = controls.routeQueue.filter((q) => !q.via).length || controls.routeQueue.length;
        if (nStops > 0) {
          flash(`\u2708\uFE0E Following Route (${nStops} stop${nStops > 1 ? 's' : ''})`);
        } else {
          const n = syncGlideNode();
          flash(controls.autopilotLoop.length >= 3
            ? `\u2708\uFE0E Autopilot Loop (${controls.autopilotLoop.length} pts)`
            : (n ? `\u2708\uFE0E Glide · ${n.name}` : '\u2708\uFE0E Glide on'));
        }
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

  function setGazeModeState(mode, announce = false) {
    const m = clampInt(mode, 0, CINEMATIC_GAZE_MODES.length - 1, 1);
    gazeMode = controls.setGazeMode(m);
    autoLookOn = gazeMode > 0;
    const b = $('#b-autolook');
    b.classList.toggle('on', autoLookOn);
    b.setAttribute('aria-pressed', String(autoLookOn));
    b.title = `Strategic Cinematic Gaze — realistically admire nearby landmarks, projections, street canyons & spires: ${autoLookOn ? CINEMATIC_GAZE_MODES[gazeMode] : 'off'} (O)`;
    $('#sel-gaze-mode').value = String(gazeMode);
    if (autoLookOn && !glideOn && announce) {
      setGlideState(true, false);
    }
    if (announce) {
      flash(autoLookOn
        ? `\u29BF Gaze \u00B7 ${CINEMATIC_GAZE_MODES[gazeMode]}`
        : 'Cinematic Gaze \u00B7 Off (Locked Forward Nose)');
    }
  }

  function setAutoLookState(on, announce = false) {
    if (on) {
      const restore = gazeMode > 0 ? gazeMode : (controls._lastActiveGazeMode || 1);
      setGazeModeState(restore, announce);
    } else {
      setGazeModeState(0, announce);
    }
  }

  $('#sel-gaze-mode').value = String(gazeMode);
  $('#sel-gaze-mode').onchange = (ev) => {
    setGazeModeState(clampInt(ev.target.value, 0, CINEMATIC_GAZE_MODES.length - 1, 1), true);
    syncURL();
  };

  function toggleGlide() { setGlideState(!glideOn, true); }
  function toggleAutoLook() { setAutoLookState(!autoLookOn, true); }
  function toggleFreelook() { setFreelookState(!freelookOn, true); }
  function toggleAvoidance() { setAvoidanceState(!avoidOn, true); }
  function toggleCollision() { setCollisionState(!collideOn, true); }
  $('#b-glide').onclick = toggleGlide;
  $('#b-autolook').onclick = toggleAutoLook;
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

  function flyToBookmark(bm, opts = {}) {
    if (!bm) return;
    const useTrans = opts.skipTransition
      ? 'cut'
      : (opts.transition !== undefined ? opts.transition : editTransition);
    if (opts.instant || useTrans !== 'cut') {
      const jump = () => {
        fly = null;
        controls.setPose(bm);
      };
      if (useTrans !== 'cut') {
        triggerSceneTransition({ type: useTrans, duration: opts.transitionDuration ?? transitionDuration, onCut: jump });
      } else {
        jump();
      }
      flash(`\u2605 ${bm.name}`);
      return;
    }
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
    ziggurat: '\u25EC',
    hanging_gardens: '\u2740',
    brutalist_habitat: '\u25A6',
    neo_ziggurat: '\u25EC',
    inverted_ziggurat: '\u25BD',
    helix_arcology: '\u29BF',
    torus_ring: '\u25EF',
    metabolism_tree: '\u2618\uFE0E',
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
    const creativeKinds = new Set([
      'hanging_gardens', 'brutalist_habitat', 'neo_ziggurat', 'ziggurat',
      'inverted_ziggurat', 'helix_arcology', 'torus_ring', 'metabolism_tree',
    ]);
    controls.poiList = poiList.map((lm) => ({
      name: lm.name,
      x: lm.x,
      y: (lm.h || lm.y || 75) * heightScale,
      lookY: (lm.h || lm.y || 75) * 0.62 * heightScale,
      z: lm.z,
      priority: creativeKinds.has(lm.kind)
        ? 1.65
        : (lm.kind === 'media' || lm.kind === 'spaceport' || lm.kind === 'harbor' ? 1.45 : 1.0),
    }));

    // Populate 3D Hologram & Hero Projection targets for Strategic Cinematic Gaze!
    const projTargets = [];
    const activeHolosPool = holoGroup && holoGroup.userData && Array.isArray(holoGroup.userData.allHolos)
      ? holoGroup.userData.allHolos.slice(0, holoGroup.userData.activeHoloCount ?? (city.holos ? city.holos.length : 0))
      : (Array.isArray(city.holos) ? city.holos : []);
    activeHolosPool.forEach((H, idx) => {
      projTargets.push({
        name: H.label || `Hologram #${idx + 1}`,
        x: H.x,
        y: (H.y || 55) * heightScale,
        lookY: (H.y || 55) * heightScale,
        z: H.z,
        priority: (H.kind !== 'panel' && H.kind !== 'disc') ? 1.85 : 1.55,
      });
    });
    if (Array.isArray(city.bills)) {
      const step = Math.max(1, Math.floor(city.bills.length / 24));
      for (let bi = 0; bi < city.bills.length && projTargets.length < 48; bi += step) {
        const B = city.bills[bi];
        if (B && Number.isFinite(B.x) && Number.isFinite(B.z)) {
          projTargets.push({
            name: `Neon Projection #${bi + 1}`,
            x: B.x,
            y: (B.y || 48) * heightScale,
            lookY: (B.y || 48) * heightScale,
            z: B.z,
            priority: 1.15,
          });
        }
      }
    }
    controls.projectionList = projTargets;
  }

  $('#sel-poi').onchange = (ev) => {
    const lm = poiList[parseInt(ev.target.value, 10)];
    if (lm) enqueueSpotRoute(lm);
  };
  $('#b-poi-go').onclick = (ev) => {
    const lm = poiList[parseInt($('#sel-poi').value, 10)];
    if (lm) enqueueSpotRoute(lm, { append: !!(ev && ev.shiftKey) });
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
    if (exporter && exporter.lockedResolution) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const prof = PERFORMANCE_PROFILES[getEffectiveQualityTier()] || PERFORMANCE_PROFILES.high;
    const rawDpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;
    const targetDpr = Math.min(rawDpr, prof.dprCap);
    renderer.setPixelRatio(targetDpr);
    renderer.setSize(w, h, false);
    post.setSize(w, h, targetDpr);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  const clock = new THREE.Clock();
  function animate() {
    try {
      const rawDt = clock.getDelta();
      const dt = Math.min(rawDt, 0.05);
      frameCounter = (frameCounter + 1) | 0;

      // Rolling frame-time telemetry + gentle adaptive FPS governor in `auto` mode
      if (perfWarmupFrames > 0) {
        perfWarmupFrames--;
      } else if (rawDt > 0.001 && rawDt < 0.25) {
        frameMsEMA += (rawDt * 1000 - frameMsEMA) * 0.08;
        if (qualityMode === 'auto' && !(exporter && exporter.lockedResolution)) {
          if (frameMsEMA > 27.5 && autoTier !== 'low') {
            lowFpsTimer += dt;
            highFpsTimer = 0;
            if (lowFpsTimer > 1.8) {
              autoTier = autoTier === 'high' ? 'medium' : 'low';
              lowFpsTimer = 0;
              applyPerformanceProfile();
            }
          } else if (frameMsEMA < 14.5 && autoTier !== 'high') {
            highFpsTimer += dt;
            lowFpsTimer = 0;
            if (highFpsTimer > 5.0) {
              autoTier = autoTier === 'low' ? 'medium' : 'high';
              highFpsTimer = 0;
              applyPerformanceProfile();
            }
          } else {
            lowFpsTimer = Math.max(0, lowFpsTimer - dt * 0.5);
            highFpsTimer = Math.max(0, highFpsTimer - dt * 0.5);
          }
        }
      }

      // Seamless 120.0s periodic noise cycle — zero jump across wrap!
      U.uTime.value = (U.uTime.value + dt) % 120.0;
      if (timeCycleOn) {
        timeOfDay = (timeOfDay + dt * 0.48 * daySpeed) % 24;
        tune.moonph = ((tune.moonph + dt * 0.032 * daySpeed) % 2 + 2) % 2;
        $('#sl-time').value = String(timeOfDay);
        $('#sl-moonph').value = String(tune.moonph);
        refreshLook(false, true);
      }
      if (weatherAutoMode !== 'off') {
        weatherAutoTimer += dt;
        if (weatherAutoTimer >= weatherInterval) {
          weatherAutoTimer = 0;
          let nextW = weatherMode;
          if (weatherAutoMode === 'seq') {
            nextW = (weatherMode + 1) % WEATHER_NAMES.length;
          } else if (weatherAutoMode === 'shuffle') {
            const delta = 1 + Math.floor(Math.random() * Math.max(1, WEATHER_NAMES.length - 1));
            nextW = (weatherMode + delta) % WEATHER_NAMES.length;
          } else if (weatherAutoMode === 'cinematic') {
            weatherArcIdx = (weatherArcIdx + 1) % CINEMATIC_WEATHER_ARC.length;
            nextW = CINEMATIC_WEATHER_ARC[weatherArcIdx];
            if (nextW === weatherMode) {
              weatherArcIdx = (weatherArcIdx + 1) % CINEMATIC_WEATHER_ARC.length;
              nextW = CINEMATIC_WEATHER_ARC[weatherArcIdx];
            }
          }
          weatherMode = nextW;
          $('#sl-weather').value = String(weatherMode);
          syncWeatherLabel();
          weather.transitionTo(weatherMode, Math.min(6.0, Math.max(2.5, weatherInterval * 0.22)));
          refreshLook(false, true);
          flash(`\u2602\uFE0E Weather \u2192 ${WEATHER_NAMES[weatherMode]}`);
        }
      }
      if (weather && weather.isTransitioning && !timeCycleOn) {
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
        const directorDriving = Boolean(director._activeShot || director._followSpec || director._orbitSpec);
        if (!directorDriving) {
          if (glideOn && controls.autopilotLoop.length < 3 && controls.glideTarget && controls.routeQueue.length === 0) {
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
      }
      director.update(dt);
      if (pathRecorder.recording) {
        pathRecorder.recordSample(dt, camera);
        syncPathUI();
      }

      // Frustum & distance view culling pass before CPU/GPU world updates
      viewCuller.update(camera, {
        heightScale,
        lensMode: postState.lensMode ?? 0,
        worldCurve,
      });

      if (vehicles) vehicles.update(dt, tune.traffic, heightScale);
      if (harborObj) {
        if (!viewCuller.enabled || viewCuller.harborVisible) harborObj.update(dt);
        else if ((frameCounter & 7) === 0) harborObj.update(dt * 8);
      }
      if (spaceportObj) {
        if (!viewCuller.enabled || viewCuller.spaceportVisible) spaceportObj.update(dt);
        else if ((frameCounter & 7) === 0) spaceportObj.update(dt * 8);
      }
      if (streetInfraObj) streetInfraObj.update(dt);
      if (searchlights && (!viewCuller.enabled || searchlights.group.visible)) {
        searchlights.update(dt);
      }
      if (weather) weather.update(dt, camera.position);
      if (minimap) minimap.render(camera, controls, pathRecorder);
      const nightAmt = 0.5 + 0.5 * Math.cos(((timeOfDay % 24) / 24) * Math.PI * 2);
      const camSpd = controls.velocity ? controls.velocity.length() : 0;
      radioEngine.update(dt, {
        altitude: Math.max(0, camera.position.y),
        speed: camSpd,
        night: nightAmt,
      });

      // Live Music -> Environment Coupling (Tempo->Traffic, Chords->Clouds/Diurnal, Beat->Lights/Holos, Harmony->Atmo)
      const mt = radioEngine.getMusicalTelemetry();
      const anyMusicSync = Boolean(
        radioState.syncTraffic || radioState.syncClouds || radioState.syncDiurnal || radioState.syncLights || radioState.syncAtmo
      );
      const syncK = (mt.playing && anyMusicSync) ? Math.max(0, Math.min(1.5, radioState.syncStrength ?? 0)) : 0;

      if (mt.playing) {
        if (lastMusicChordSeq < 0) {
          lastMusicChordSeq = mt.chordChangeSeq;
        } else if (mt.chordChangeSeq !== lastMusicChordSeq) {
          const chordSteps = Math.max(1, Math.min(4, Math.abs(mt.chordChangeSeq - lastMusicChordSeq)));
          lastMusicChordSeq = mt.chordChangeSeq;
          if (syncK > 0.005) {
            if (radioState.syncClouds) {
              musicCloudTargetOffset += (0.88 + 0.45 * mt.chordBrightness) * syncK * chordSteps;
            }
            if (radioState.syncDiurnal) {
              musicDiurnalPendingHours += (mt.isMinor ? 0.65 : 1.08) * syncK * chordSteps;
            }
          }
          if (!document.body.classList.contains('ui-off')) syncRadioUI();
        }
      } else {
        lastMusicChordSeq = -1;
      }

      // 1. Traffic & Transit Tempo <- Music BPM & Beat Pulse
      const wantTraffMul = (syncK > 0.005 && radioState.syncTraffic)
        ? (1.0 + (Math.max(0.42, Math.min(1.70, mt.tempoRatio)) * (1.0 + 0.16 * mt.beatPulse) - 1.0) * Math.min(1.25, syncK))
        : 1.0;
      musicTrafficMul += (wantTraffMul - musicTrafficMul) * (1 - Math.exp(-dt * 4.5));
      if (vehicles && vehicles.setTrafficSpeed && (Math.abs(musicTrafficMul - 1.0) > 1e-3 || radioState.syncTraffic)) {
        vehicles.setTrafficSpeed(trafficSpeed * musicTrafficMul);
      }

      // 2. Diurnal Sun/Moon Cycle <- Chord Changes (smooth glide, zero step snap!)
      if (musicDiurnalPendingHours > 1e-4) {
        const stepH = musicDiurnalPendingHours * (1 - Math.exp(-dt * 1.35));
        musicDiurnalPendingHours = Math.max(0, musicDiurnalPendingHours - stepH);
        timeOfDay = (timeOfDay + stepH) % 24;
        tune.moonph = ((tune.moonph + stepH * 0.065) % 2 + 2) % 2;
        $('#sl-time').value = String(timeOfDay);
        $('#sl-moonph').value = String(tune.moonph);
        refreshLook(false, true);
      }

      // 3. Volumetric Cloud Shifts <- Chord Changes & Musical Breathing
      musicCloudOffset += (musicCloudTargetOffset - musicCloudOffset) * (1 - Math.exp(-dt * 1.15));
      if (syncK > 0.005 && radioState.syncClouds) {
        U.uCloudSeed.value = (baseUniformSnap.cloudSeed + musicCloudOffset * 1.35) % 1000;
        U.uCloudEvol.value = baseUniformSnap.cloudEvol + 0.28 * mt.chordFlash * syncK;
        if (baseUniformSnap.cloud > 0.008) {
          U.uCloud.value = baseUniformSnap.cloud * (1.0 + (0.10 * mt.chordFlash + 0.06 * (mt.chordBrightness - 0.5)) * syncK);
        }
      } else if (Math.abs(U.uCloudEvol.value - baseUniformSnap.cloudEvol) > 1e-4) {
        U.uCloudSeed.value = baseUniformSnap.cloudSeed;
        U.uCloudEvol.value = baseUniformSnap.cloudEvol;
        U.uCloud.value = baseUniformSnap.cloud;
      }

      // 4. City Neon, Windows, Searchlights & Holograms <- Beat & Spectral Energy
      const wantLightEnv = (syncK > 0.005 && radioState.syncLights)
        ? (mt.beatPulse * 0.36 + mt.lowEnergy * 0.22 + mt.highEnergy * 0.20) * syncK
        : 0;
      musicLightEnv += (wantLightEnv - musicLightEnv) * (1 - Math.exp(-dt * 10.0));
      if (musicLightEnv > 1e-3) {
        U.uWinGlow.value = baseUniformSnap.winGlow * (1.0 + musicLightEnv * 0.52);
        U.uBillK.value = baseUniformSnap.billK * (1.0 + musicLightEnv * 0.72);
        U.uHoloScale.value = baseUniformSnap.holoScale * (1.0 + mt.beatPulse * 0.075 * syncK);
        if (searchlights && searchlights.setAmount) {
          searchlights.setAmount((tune.searchLight ?? 1) * (1.0 + musicLightEnv * 0.65));
        }
      } else if (Math.abs(U.uHoloScale.value - baseUniformSnap.holoScale) > 1e-4) {
        U.uWinGlow.value = baseUniformSnap.winGlow;
        U.uBillK.value = baseUniformSnap.billK;
        U.uHoloScale.value = baseUniformSnap.holoScale;
        if (searchlights && searchlights.setAmount) searchlights.setAmount(tune.searchLight ?? 1);
      }

      // 5. Atmospheric Bloom & Harmonic Warmth <- Musical Movements
      const wantAtmoEnv = (syncK > 0.005 && radioState.syncAtmo)
        ? (mt.chordFlash * 0.22 + mt.midEnergy * 0.20) * syncK
        : 0;
      musicAtmoEnv += (wantAtmoEnv - musicAtmoEnv) * (1 - Math.exp(-dt * 4.0));
      if (musicAtmoEnv > 1e-3) {
        const curLook = LOOK_BY_ID[lookId];
        const tempShift = curLook.monochrome ? 0 : (mt.chordBrightness - 0.5) * 0.26 * syncK;
        post.configure({
          bloom: Math.min(2.4, postState.bloom + musicAtmoEnv * 0.42),
          temp: Math.max(-1, Math.min(1, postState.temp + tempShift)),
        });
      }

      // Periodically persist exact starting state (including live flight pose) to localStorage
      storageSaveTimer += dt;
      if (storageSaveTimer >= 2.0) {
        storageSaveTimer = 0;
        persistStartingState();
      }

      if (radioVizCanvas && !document.body.classList.contains('ui-off')) {
        radioEngine.renderScope(radioVizCanvas, LOOK_BY_ID[lookId].accent || '#6be4ff');
      }
      world.sky.position.copy(camera.position);
      post.updateTransition(dt);
      post.render(scene, camera, U.uTime.value);
      requestAnimationFrame(animate);
    } catch (err) {
      fatal(err);
    }
  }

  function getPerformanceStats() {
    const fps = frameMsEMA > 0.1 ? +(1000 / frameMsEMA).toFixed(1) : 60;
    return {
      qualityMode,
      effectiveTier: getEffectiveQualityTier(),
      viewCulling,
      postBypass: !!post.bypass,
      fps,
      frameMs: +frameMsEMA.toFixed(2),
      pixelRatio: +renderer.getPixelRatio().toFixed(2),
      shaderQuality: +U.uPerfQuality.value.toFixed(2),
      culler: { ...viewCuller.stats },
    };
  }

  function setPerformanceOptions(opts = {}) {
    if (opts.qualityMode !== undefined && ['auto', 'low', 'medium', 'high', 'ultra'].includes(opts.qualityMode)) {
      qualityMode = opts.qualityMode;
      lowFpsTimer = 0;
      highFpsTimer = 0;
    }
    if (opts.viewCulling !== undefined) {
      viewCulling = !!opts.viewCulling;
    }
    if (opts.postBypass !== undefined) {
      post.bypass = !!opts.postBypass;
    }
    applyPerformanceProfile();
    if (Number.isFinite(opts.maxDrawDist) || Number.isFinite(opts.vehDrawDist)) {
      viewCuller.configure({
        maxDrawDist: Number.isFinite(opts.maxDrawDist) ? Math.max(600, Math.min(30000, opts.maxDrawDist)) : undefined,
        vehDrawDist: Number.isFinite(opts.vehDrawDist) ? Math.max(350, Math.min(20000, opts.vehDrawDist)) : undefined,
      });
    }
    viewCuller.update(camera, { heightScale, lensMode: postState.lensMode ?? 0, worldCurve });
    syncAllSliders();
    return { ok: true, performance: getPerformanceStats() };
  }

  function managePresetsAndBookmarks(input = {}) {
    const act = input.action || 'list';
    const useTrans = input.skipTransition
      ? 'cut'
      : (input.transition !== undefined ? input.transition : 'cut');
    const transDur = Number.isFinite(input.transitionDuration) ? input.transitionDuration : transitionDuration;

    if (act === 'list') {
      return {
        ok: true,
        builtinPresets: WORLD_PRESETS.map((p, index) => ({ index, id: p.id, name: p.label, blurb: p.blurb })),
        userPresets: userPresets.map((p, index) => ({ index, id: p.id, name: p.label })),
        bookmarks: bookmarks.map((b, index) => ({ index, name: b.name, x: b.x, y: b.y, z: b.z, yaw: b.yaw, pitch: b.pitch })),
        uiVisible: !document.body.classList.contains('ui-off'),
      };
    }
    if (act === 'apply_preset') {
      const q = String(input.name || '').toLowerCase();
      let found = null;
      let isUser = false;
      if (Number.isInteger(input.index) && input.index >= 0 && input.index < WORLD_PRESETS.length) {
        found = WORLD_PRESETS[input.index];
      } else if (q) {
        found = WORLD_PRESETS.find((p) => p.id.toLowerCase() === q || p.label.toLowerCase().includes(q));
        if (!found) {
          found = userPresets.find((p) => p.id.toLowerCase() === q || p.label.toLowerCase().includes(q));
          if (found) isUser = true;
        }
      }
      if (!found) throw new Error(`Preset not found: ${input.name ?? input.index}`);
      const doApply = () => {
        activePresetId = `${isUser ? 'u' : 'b'}:${found.id}`;
        renderPresetOptions();
        applyStateObject(found.state, { applyCamera: input.applyCamera !== false, applyBookmarks: false });
      };
      if (useTrans !== 'cut') triggerSceneTransition({ type: useTrans, duration: transDur, onCut: doApply });
      else doApply();
      return { ok: true, preset: found.label };
    }
    if (act === 'save_preset') {
      const label = (input.name || '').trim() || `Agent Preset ${userPresets.length + 1}`;
      const id = `up-${Date.now().toString(36)}`;
      const state = captureExactState();
      delete state.bookmarks;
      userPresets.push({ id, label, state });
      writeStorageJSON(STORAGE_PRESETS_KEY, userPresets);
      activePresetId = `u:${id}`;
      renderPresetOptions();
      return { ok: true, id, name: label, totalUserPresets: userPresets.length };
    }
    if (act === 'delete_preset') {
      const q = String(input.name || '').toLowerCase();
      const idx = Number.isInteger(input.index)
        ? input.index
        : userPresets.findIndex((p) => p.id.toLowerCase() === q || p.label.toLowerCase().includes(q));
      if (idx < 0 || idx >= userPresets.length) throw new Error('User preset not found');
      const removed = userPresets.splice(idx, 1)[0];
      writeStorageJSON(STORAGE_PRESETS_KEY, userPresets);
      activePresetId = '';
      renderPresetOptions();
      return { ok: true, removed: removed.label, totalUserPresets: userPresets.length };
    }
    if (act === 'go_bookmark') {
      const q = String(input.name || '').toLowerCase();
      const idx = Number.isInteger(input.index)
        ? input.index
        : bookmarks.findIndex((b) => (b.name || '').toLowerCase().includes(q));
      if (idx < 0 || idx >= bookmarks.length) throw new Error('Bookmark not found');
      flyToBookmark(bookmarks[idx], {
        instant: !!input.instant,
        transition: useTrans,
        transitionDuration: transDur,
        skipTransition: !!input.skipTransition,
      });
      return { ok: true, bookmark: bookmarks[idx] };
    }
    if (act === 'add_bookmark') {
      const name = (input.name || '').trim() || `Viewpoint ${bookmarks.length + 1}`;
      const pose = controls.getPose();
      const entry = { name, ...pose };
      bookmarks.push(entry);
      writeStorageJSON(STORAGE_BOOKMARKS_KEY, bookmarks);
      renderBookmarks(bookmarks.length - 1);
      return { ok: true, index: bookmarks.length - 1, bookmark: entry };
    }
    if (act === 'delete_bookmark') {
      const idx = Number.isInteger(input.index) ? input.index : -1;
      if (idx < 0 || idx >= bookmarks.length) throw new Error('Bookmark index out of range');
      const removed = bookmarks.splice(idx, 1)[0];
      writeStorageJSON(STORAGE_BOOKMARKS_KEY, bookmarks);
      renderBookmarks(Math.max(0, idx - 1));
      return { ok: true, removed: removed.name, remaining: bookmarks.length };
    }
    if (act === 'export_state') {
      const state = captureExactState();
      const token = buildCompactShareToken();
      const shareUrl = buildExactShareURL();
      return { ok: true, shareToken: token, shareUrl, tokenLength: token.length, state };
    }
    if (act === 'import_state') {
      const decoded = decodeExactState(input.tokenOrJson || '');
      if (!decoded) throw new Error('Could not decode state token or JSON');
      const doImport = () => applyStateObject(decoded, { applyCamera: input.applyCamera !== false, applyBookmarks: true });
      if (useTrans !== 'cut') triggerSceneTransition({ type: useTrans, duration: transDur, onCut: doImport });
      else doImport();
      return { ok: true, seed, lookId };
    }
    if (act === 'new_seed') {
      const nextSeed = Number.isInteger(input.index) && input.index > 0
        ? input.index
        : (1 + Math.floor(Math.random() * 999999998));
      const doRebuild = () => {
        seed = nextSeed;
        $('#seed-input').value = String(seed);
        rebuild();
        refreshLook(false);
      };
      if (useTrans !== 'cut') triggerSceneTransition({ type: useTrans, duration: transDur, onCut: doRebuild });
      else doRebuild();
      return { ok: true, seed };
    }
    if (act === 'set_hud') {
      const wantVis = input.hudVisible !== undefined ? !!input.hudVisible : document.body.classList.contains('ui-off');
      const isOff = document.body.classList.contains('ui-off');
      if (wantVis === isOff) toggleUI();
      return { ok: true, uiVisible: !document.body.classList.contains('ui-off') };
    }
    throw new Error(`Unsupported preset/bookmark action: ${act}`);
  }

  function resolveGazeModeInput(val) {
    if (typeof val === 'number' && Number.isFinite(val)) return clampInt(val, 0, 5, 1);
    const s = String(val || '').toLowerCase().trim();
    const map = {
      off: 0, locked: 0, none: 0,
      drone: 1, drone_cinema: 1, cinema: 1, balanced: 1,
      architectural: 2, landmarks: 2, towers: 2,
      skyline: 3, canyons: 3, vertical: 3,
      projections: 4, holograms: 4, neon: 4,
      kinetic: 5, sweep: 5, bank: 5,
    };
    if (s in map) return map[s];
    const parsed = parseInt(s, 10);
    return Number.isFinite(parsed) ? clampInt(parsed, 0, 5, 1) : 1;
  }

  function resolveMotionStyleInput(val) {
    if (typeof val === 'number' && Number.isFinite(val)) return clampInt(val, 0, 4, 0);
    const s = String(val || '').toLowerCase().trim();
    const map = { silk: 0, chase: 1, fpv: 2, orbit: 3, dolly: 4 };
    if (s in map) return map[s];
    const parsed = parseInt(s, 10);
    return Number.isFinite(parsed) ? clampInt(parsed, 0, 4, 0) : 0;
  }

  function resolveArtStyleInput(val) {
    if (typeof val === 'number' && Number.isFinite(val)) return clampInt(val, 0, ART_STYLE_NAMES.length - 1, 0);
    const s = String(val || '').toLowerCase().trim();
    const map = { cinema: 0, xray: 1, 'x-ray': 1, blueprint: 2, sketch: 3, ink: 3, watercolor: 4, oil: 5 };
    if (s in map) return map[s];
    const parsed = parseInt(s, 10);
    return Number.isFinite(parsed) ? clampInt(parsed, 0, ART_STYLE_NAMES.length - 1, 0) : 0;
  }

  function applyPartialWebMCPState(patch = {}) {
    if (!patch || typeof patch !== 'object') return;
    let needRebuild = false;
    let needRefreshLook = false;

    const nextLook = patch.look ?? patch.lookId;
    if (nextLook !== undefined && LOOK_BY_ID[nextLook]) {
      lookId = nextLook;
      needRefreshLook = true;
    }
    if (patch.tint !== undefined) {
      tune.tint = clampFloat(patch.tint, 0, 1, tune.tint ?? 0.72);
      needRefreshLook = true;
    }
    if (patch.colorVar !== undefined) {
      tune.colorVar = clampFloat(patch.colorVar, 0, 1.2, tune.colorVar ?? 0.45);
      needRefreshLook = true;
    }
    if (patch.customPalette && typeof patch.customPalette === 'object') {
      const cp = patch.customPalette;
      const curCfg = { ...(LOOK_BY_ID.custom.customConfig || DEFAULT_CUSTOM) };
      if (cp.seedFromLook && LOOK_BY_ID[cp.seedFromLook] && cp.seedFromLook !== 'custom') {
        const src = LOOK_BY_ID[cp.seedFromLook];
        curCfg.zen = src.sky.zenith;
        curCfg.hor = src.sky.horizon;
        curCfg.base = src.building.base;
        curCfg.win = src.building.warm;
        curCfg.accent = src.accent;
        curCfg.sec = src.building.cool;
      }
      for (const k of ['zen', 'hor', 'base', 'win', 'accent', 'sec']) {
        if (typeof cp[k] === 'string' && /^#[0-9a-fA-F]{6}$/.test(cp[k])) curCfg[k] = cp[k];
      }
      if (cp.style !== undefined) curCfg.style = clampInt(cp.style, 0, 6, curCfg.style);
      if (cp.mono !== undefined) curCfg.mono = !!cp.mono;
      syncCustomLook(curCfg);
      syncCustomInputs();
      if (cp.activate !== false) lookId = 'custom';
      needRefreshLook = true;
    }

    const artVal = patch.artStyle ?? patch.postStyle;
    if (artVal !== undefined) {
      postState.artStyle = resolveArtStyleInput(artVal);
      needRefreshLook = true;
    }
    if (patch.artStrength !== undefined) { postState.artStrength = clampFloat(patch.artStrength, 0, 1.4, 1); needRefreshLook = true; }
    if (patch.bloom !== undefined) { postState.bloom = clampFloat(patch.bloom, 0, 2.2, postState.bloom); needRefreshLook = true; }
    if (patch.lens !== undefined) { postState.lens = clampFloat(patch.lens, 0, 1.5, postState.lens); needRefreshLook = true; }
    if (patch.contrast !== undefined) { postState.contrast = clampFloat(patch.contrast, 0.7, 1.5, postState.contrast); needRefreshLook = true; }
    if (patch.temp !== undefined) { postState.temp = clampFloat(patch.temp, -1, 1, postState.temp); needRefreshLook = true; }
    if (patch.film !== undefined) { postState.film = clampFloat(patch.film, 0, 1, postState.film); needRefreshLook = true; }

    if (patch.editTransition !== undefined && SCENE_TRANSITION_NAMES.includes(patch.editTransition)) {
      editTransition = patch.editTransition;
    }
    if (patch.transitionDuration !== undefined) {
      transitionDuration = clampFloat(patch.transitionDuration, 0.08, 6.0, transitionDuration);
    }
    if (patch.qualityMode !== undefined || patch.viewCulling !== undefined || patch.postBypass !== undefined) {
      setPerformanceOptions({
        qualityMode: patch.qualityMode,
        viewCulling: patch.viewCulling,
        postBypass: patch.postBypass,
      });
    }

    const timeVal = patch.time ?? patch.timeOfDay;
    if (timeVal !== undefined) {
      timeOfDay = ((Number(timeVal) % 24) + 24) % 24;
      needRefreshLook = true;
    }
    if (patch.dayCycle !== undefined) timeCycleOn = !!patch.dayCycle;
    if (patch.daySpeed !== undefined) daySpeed = clampFloat(patch.daySpeed, 0.05, 5, daySpeed);

    if (patch.sun !== undefined) { tune.sun = clampFloat(patch.sun, 0, 2, 1); needRefreshLook = true; }
    if (patch.vib !== undefined) { tune.vib = clampFloat(patch.vib, 0, 2, 1); needRefreshLook = true; }
    if (patch.haze !== undefined) { tune.haze = clampFloat(patch.haze, 0, 2, 1); needRefreshLook = true; }
    if (patch.moon !== undefined) { tune.moon = clampFloat(patch.moon, 0, 2.5, 1); needRefreshLook = true; }
    if (patch.moonsz !== undefined) { tune.moonsz = clampFloat(patch.moonsz, 0.25, 3.5, 1); needRefreshLook = true; }
    if (patch.moonph !== undefined) { tune.moonph = ((Number(patch.moonph) % 2) + 2) % 2; needRefreshLook = true; }

    if (patch.waterShader !== undefined) {
      tune.waterShader = clampInt(patch.waterShader, 0, 4, 0);
      U.uWaterShader.value = tune.waterShader;
      needRefreshLook = true;
    }
    if (patch.waterMode !== undefined) { waterMode = clampInt(patch.waterMode, 0, 4, waterMode); needRebuild = true; }
    if (patch.waterAmount !== undefined) { waterAmount = clampFloat(patch.waterAmount, 0.2, 2.0, waterAmount); needRebuild = true; }
    if (patch.shoreDist !== undefined) { shoreDist = clampFloat(patch.shoreDist, 0.35, 2.5, shoreDist); needRebuild = true; }
    if (patch.waterWave !== undefined) { tune.waterScale = clampFloat(patch.waterWave, 0.2, 4, 1); needRefreshLook = true; }
    if (patch.waterChop !== undefined) { tune.waterChop = clampFloat(patch.waterChop, 0, 2.5, 1); needRefreshLook = true; }
    if (patch.waterFoam !== undefined) { tune.waterFoam = clampFloat(patch.waterFoam, 0, 2.5, 0.85); needRefreshLook = true; }
    if (patch.waterRefl !== undefined) { tune.waterRefl = clampFloat(patch.waterRefl, 0, 2.5, 1.15); needRefreshLook = true; }
    if (patch.waterContrast !== undefined) { tune.waterContrast = clampFloat(patch.waterContrast, 0, 1, 0.12); needRefreshLook = true; }
    if (patch.waterWarp !== undefined) { tune.waterWarp = clampFloat(patch.waterWarp, 0, 2, 0.4); needRefreshLook = true; }

    if (patch.terrainMode !== undefined) { terrainMode = clampInt(patch.terrainMode, 0, 4, terrainMode); needRebuild = true; }
    if (patch.terrainScale !== undefined) { terrainScale = clampFloat(patch.terrainScale, 0, 2.5, terrainScale); needRebuild = true; }
    if (patch.treeMode !== undefined) {
      treeMode = clampInt(patch.treeMode, 0, 6, treeMode);
      if (trees) trees.setNature(LOOK_BY_ID[lookId], treeMode);
      needRefreshLook = true;
    }
    if (patch.vegCover !== undefined) { vegCover = clampFloat(patch.vegCover, 0, 2, vegCover); needRebuild = true; }
    if (patch.vegScale !== undefined) { vegScale = clampFloat(patch.vegScale, 0.4, 2.4, vegScale); needRebuild = true; }

    if (patch.worldCurve !== undefined) {
      worldCurve = clampFloat(patch.worldCurve, 0, 1, worldCurve);
      syncWorldGeometry();
      needRefreshLook = true;
    }
    if (patch.heightScale !== undefined) {
      heightScale = clampFloat(patch.heightScale, 0.35, 2.6, heightScale);
      applyHeight();
      needRefreshLook = true;
    }

    if (patch.clouds !== undefined) { tune.clouds = clampFloat(patch.clouds, 0, 2.4, 1); needRefreshLook = true; }
    if (patch.cloudPuffs !== undefined) { tune.cloudPuffs = clampFloat(patch.cloudPuffs, 0, 2, 1); needRefreshLook = true; }
    if (patch.cloudType !== undefined) { tune.cloudType = clampInt(patch.cloudType, 0, 5, 0); needRefreshLook = true; }
    if (patch.cloudStyle !== undefined) { tune.cloudStyle = clampInt(patch.cloudStyle, 0, 6, 0); needRefreshLook = true; }
    if (patch.cloudSeed !== undefined) { tune.cloudSeed = clampFloat(patch.cloudSeed, 0, 100, 0); needRefreshLook = true; }
    if (patch.cloudEvol !== undefined) { tune.cloudEvol = clampFloat(patch.cloudEvol, 0, 2.5, 0.35); needRefreshLook = true; }
    if (patch.cloudLac !== undefined) { tune.cloudLac = clampFloat(patch.cloudLac, 1.4, 3.2, 2.08); needRefreshLook = true; }
    if (patch.cloudElev !== undefined) { tune.cloudElev = clampFloat(patch.cloudElev, 0.05, 2.4, 1); needRefreshLook = true; }
    if (patch.cloudRange !== undefined) { tune.cloudRange = clampFloat(patch.cloudRange, 0.3, 3.0, 1); needRefreshLook = true; }
    if (patch.weatherMode !== undefined) {
      weatherMode = clampInt(patch.weatherMode, 0, 6, 0);
      weather.transitionTo(weatherMode, 2.2);
      syncWeatherLabel();
      needRefreshLook = true;
    }
    if (patch.weatherAutoMode !== undefined && ['off', 'seq', 'shuffle', 'cinematic'].includes(patch.weatherAutoMode)) {
      weatherAutoMode = patch.weatherAutoMode;
      weatherAutoTimer = 0;
    }
    if (patch.weatherInterval !== undefined) {
      weatherInterval = clampInt(patch.weatherInterval, 15, 240, 60);
    }
    const dustVal = patch.dust ?? patch.dustLevel;
    if (dustVal !== undefined) {
      dustLevel = clampFloat(dustVal, 0, 2, dustLevel);
      weather.setDust(dustLevel);
    }
    if (patch.cloudLayer !== undefined) {
      const m = clampInt(patch.cloudLayer, 0, 7, 1);
      tune.cloudLayersMode = m;
      const pr = CLOUD_LAYER_PRESETS[m];
      if (pr && pr.elev) {
        tune.cloudLayerElev = [...pr.elev];
        tune.cloudLayerThick = [...pr.thick];
        tune.cloudLayerDens = [...pr.dens];
      }
      needRefreshLook = true;
    }
    if (Array.isArray(patch.cloudLayerElev) && patch.cloudLayerElev.length === 3) {
      tune.cloudLayersMode = 7;
      tune.cloudLayerElev = patch.cloudLayerElev.map((v, i) => clampFloat(v, 0.05, 3.0, tune.cloudLayerElev[i]));
      needRefreshLook = true;
    }
    if (Array.isArray(patch.cloudLayerThick) && patch.cloudLayerThick.length === 3) {
      tune.cloudLayersMode = 7;
      tune.cloudLayerThick = patch.cloudLayerThick.map((v, i) => clampFloat(v, 0.05, 2.5, tune.cloudLayerThick[i]));
      needRefreshLook = true;
    }
    if (Array.isArray(patch.cloudLayerDens) && patch.cloudLayerDens.length === 3) {
      tune.cloudLayersMode = 7;
      tune.cloudLayerDens = patch.cloudLayerDens.map((v, i) => clampFloat(v, 0, 2.5, tune.cloudLayerDens[i]));
      needRefreshLook = true;
    }
    if (patch.windAngle !== undefined) {
      tune.windAngle = ((Number(patch.windAngle) % 360) + 360) % 360;
      U.uWindAngle.value = (tune.windAngle * Math.PI) / 180;
      needRefreshLook = true;
    }
    if (patch.windStrength !== undefined) {
      tune.windStrength = clampFloat(patch.windStrength, 0, 2.5, 1);
      U.uWindStrength.value = tune.windStrength;
      needRefreshLook = true;
    }
    if (patch.fog !== undefined) { tune.fog = clampFloat(patch.fog, 0, 2.5, 1); needRefreshLook = true; }
    if (patch.rain !== undefined) {
      weatherMode = Number(patch.rain) > 0.5 ? 2 : (Number(patch.rain) > 0.05 ? 1 : 0);
      weather.setMode(weatherMode);
      needRefreshLook = true;
    }

    if (patch.win !== undefined) { tune.win = clampFloat(patch.win, 0, 2, 1); needRefreshLook = true; }
    if (patch.glow !== undefined) { tune.glow = clampFloat(patch.glow, 0, 2.5, 1); needRefreshLook = true; }
    if (patch.lights !== undefined) { tune.lights = clampFloat(patch.lights, 0, 2.5, 1); needRefreshLook = true; }
    if (patch.lampDensity !== undefined) { tune.lampDensity = clampFloat(patch.lampDensity, 0, 2, 1); needRefreshLook = true; }
    if (patch.searchLight !== undefined) { tune.searchLight = clampFloat(patch.searchLight, 0, 2.5, 1); needRefreshLook = true; }
    if (patch.searchCount !== undefined) { tune.searchCount = clampFloat(patch.searchCount, 0, 2, 1); needRefreshLook = true; }
    if (patch.trafficLight !== undefined) { tune.trafficLight = clampFloat(patch.trafficLight, 0, 2.5, 1); needRefreshLook = true; }
    if (patch.sigDensity !== undefined) { tune.sigDensity = clampFloat(patch.sigDensity, 0, 1.5, 1); needRefreshLook = true; }
    if (patch.vehLight !== undefined) { tune.vehLight = clampFloat(patch.vehLight, 0, 2.5, 1); needRefreshLook = true; }

    const rawTrafficCount = patch.trafficCount ?? patch.traffic;
    if (rawTrafficCount !== undefined) {
      tune.traffic = Math.max(0, Math.min(MAX_TRAFFIC_DENSITY, Number(rawTrafficCount) / 320));
      if (vehicles) vehicles.update(0, tune.traffic, heightScale);
      syncTrafficLabel();
    }
    if (patch.trafficSpeed !== undefined) {
      trafficSpeed = clampFloat(patch.trafficSpeed, 0, 3, trafficSpeed);
      if (vehicles && vehicles.setTrafficSpeed) vehicles.setTrafficSpeed(trafficSpeed);
    }
    if (patch.transitAmt !== undefined) { transitAmt = clampFloat(patch.transitAmt, 0, 2, transitAmt); needRebuild = true; }
    if (patch.maritimeAmt !== undefined) { maritimeAmt = clampFloat(patch.maritimeAmt, 0, 2, maritimeAmt); needRebuild = true; }
    if (patch.airAmt !== undefined) { airAmt = clampFloat(patch.airAmt, 0, 2, airAmt); needRebuild = true; }
    if (patch.signAmt !== undefined) { signAmt = clampFloat(patch.signAmt, 0, 2, signAmt); needRebuild = true; }
    if (patch.megaWrap !== undefined) { megaWrap = clampFloat(patch.megaWrap, 0, 2, megaWrap); needRebuild = true; }
    if (patch.glyphStyle !== undefined) { tune.glyphStyle = clampInt(patch.glyphStyle, 0, 2, 0); needRefreshLook = true; }
    if (patch.signAnim !== undefined) { tune.signAnim = clampFloat(patch.signAnim, 0, 2.5, 1); needRefreshLook = true; }

    if (patch.holoDensity !== undefined) {
      tune.holoDensity = clampFloat(patch.holoDensity, 0, 2.5, 1);
      needRefreshLook = true;
    }
    if (patch.holoScale !== undefined) {
      tune.holoScale = clampFloat(patch.holoScale, 0.35, 2.2, 1);
      needRefreshLook = true;
    }
    if (patch.holoScan !== undefined) {
      tune.holoScan = clampFloat(patch.holoScan, 0, 2.5, 1);
      needRefreshLook = true;
    }
    if (patch.trailMode !== undefined) {
      const tm = typeof patch.trailMode === 'string'
        ? { off: 0, classic: 1, subtle: 1, hero_ships_trains: 1, some: 2, express: 2, aircraft_trains: 2, transit: 3, ships: 3, maritime: 3, fast_traffic: 3, traffic: 4, dense_traffic: 4, all: 5, all_moving: 5 }[patch.trailMode.toLowerCase()]
        : Number(patch.trailMode);
      if (Number.isFinite(tm)) {
        tune.trailMode = clampInt(tm, 0, 5, 1);
        needRefreshLook = true;
      }
    }
    if (patch.trailLength !== undefined) {
      tune.trailLength = clampFloat(patch.trailLength, 0, 2.5, 1);
      needRefreshLook = true;
    }
    if (patch.seed !== undefined) { seed = clampInt(patch.seed, 1, 999999999, seed); needRebuild = true; }
    if (patch.radius !== undefined) { cityRadius = clampInt(patch.radius, 2, 22, cityRadius); needRebuild = true; }
    if (patch.suburbReach !== undefined) { suburbReach = clampFloat(patch.suburbReach, 0, 3, suburbReach); needRebuild = true; }

    if (patch.fov !== undefined) {
      camFov = clampFloat(patch.fov, 15, 150, 58);
      syncCameraOptics();
    }
    if (patch.rollDeg !== undefined) {
      camRollDeg = clampFloat(Number(patch.rollDeg), -180, 180, 0);
      syncCameraOptics();
    } else if (patch.roll !== undefined) {
      camRollDeg = clampFloat(Number(patch.roll), -180, 180, 0);
      syncCameraOptics();
    }
    if (patch.lensMode !== undefined) {
      postState.lensMode = clampInt(patch.lensMode, 0, 9, 0);
      syncCameraOptics();
    }
    if (patch.lensDistort !== undefined) {
      postState.lensDistort = clampFloat(patch.lensDistort, -1, 1.25, 0);
      syncCameraOptics();
    }
    if (patch.lensZoom !== undefined) {
      postState.lensZoom = clampFloat(patch.lensZoom, 0.35, 2.5, 1);
      syncCameraOptics();
    }
    if (patch.anamorphic !== undefined) {
      postState.anamorphic = clampFloat(patch.anamorphic, 0, 1, 0);
      syncCameraOptics();
    }
    if (patch.tiltShift !== undefined) {
      postState.tiltShift = clampFloat(patch.tiltShift, 0, 1, 0);
      syncCameraOptics();
    }
    if (patch.anglePreset !== undefined) {
      const q = String(patch.anglePreset).toLowerCase();
      const idx = Number.isFinite(Number(patch.anglePreset))
        ? clampInt(patch.anglePreset, 0, CAMERA_ANGLE_PRESETS.length - 1, 0)
        : CAMERA_ANGLE_PRESETS.findIndex((p) => (p.key || p.id || '').toLowerCase() === q || (p.name || p.label || '').toLowerCase().includes(q));
      if (idx >= 0) applyAnglePresetByIndex(idx);
    }
    if (patch.motionStyle !== undefined) {
      camStyle = resolveMotionStyleInput(patch.motionStyle);
      controls.motionStyle = camStyle;
    }
    if (patch.glideSpeed !== undefined) {
      controls.glideSpeed = clampFloat(patch.glideSpeed, 1, 260, 32);
    }
    if (patch.camSpeed !== undefined) {
      camSpeed = clampFloat(patch.camSpeed, 0, 5.0, 1);
      controls.speedMul = camSpeed;
    }
    const radVal = patch.colliderRadius ?? patch.camRadius;
    if (radVal !== undefined) {
      camRadius = clampFloat(radVal, 0.5, 12, 2.2);
      controls.colliderRadius = camRadius;
    }
    const smVal = patch.smoothness ?? patch.camSmooth;
    if (smVal !== undefined) {
      camSmooth = clampFloat(smVal, 0, 6.0, 0.88);
      controls.smoothness = camSmooth;
    }
    if (patch.turnSmooth !== undefined) {
      turnSmooth = clampFloat(patch.turnSmooth, 0.2, 6.0, 1.65);
      controls.turnSmooth = turnSmooth;
    }
    if (patch.gimbalSmooth !== undefined) {
      gimbalSmooth = clampFloat(patch.gimbalSmooth, 0.15, 2.5, 1);
      controls.gimbalSmooth = gimbalSmooth;
    }
    if (patch.leadFraming !== undefined) {
      leadFraming = clampFloat(patch.leadFraming, 0, 1.5, 0.82);
      controls.leadFraming = leadFraming;
    }
    if (patch.avoidance !== undefined) setAvoidanceState(!!patch.avoidance, false);
    if (patch.collision !== undefined) setCollisionState(!!patch.collision, false);
    if (patch.glide !== undefined) setGlideState(!!patch.glide, false);
    if (patch.gazeMode !== undefined) setGazeModeState(resolveGazeModeInput(patch.gazeMode), false);
    else if (patch.autoLook !== undefined) setAutoLookState(!!patch.autoLook, false);
    if (patch.freelook !== undefined) setFreelookState(!!patch.freelook, false);
    if (Array.isArray(patch.autoLoop) && patch.autoLoop.length >= 3) {
      userLoopOverride = patch.autoLoop.map((p) => ({ ...p }));
      syncAutopilotLoop();
    }
    if (patch.radioStation !== undefined) {
      radioEngine.setStation(clampInt(patch.radioStation, 0, RADIO_STATIONS.length - 1, 0));
      radioState.station = radioEngine.stationIndex;
    }
    if (patch.playlistMode !== undefined) {
      if (['loop', 'seq', 'shuffle'].includes(patch.playlistMode)) {
        radioState.playlistMode = patch.playlistMode;
        radioEngine.setPlaylist({ mode: patch.playlistMode });
      }
    }
    if (patch.playlistInterval !== undefined) {
      radioState.playlistInterval = clampInt(patch.playlistInterval, 15, 300, 75);
      radioEngine.setPlaylist({ interval: radioState.playlistInterval });
    }
    if (patch.radioVol !== undefined) { radioState.volume = clampFloat(patch.radioVol, 0, 1.2, 0.68); radioEngine.setVolume(radioState.volume); }
    if (patch.radioSpace !== undefined) { radioState.space = clampFloat(patch.radioSpace, 0, 1.5, 0.9); radioEngine.setSpace(radioState.space); }
    if (patch.radioWarmth !== undefined) { radioState.warmth = clampFloat(patch.radioWarmth, 0.1, 1.5, 0.8); radioEngine.setWarmth(radioState.warmth); }
    if (patch.radioPulse !== undefined) { radioState.pulse = clampFloat(patch.radioPulse, 0, 1.5, 0.55); radioEngine.setPulse(radioState.pulse); }
    if (patch.radioReact !== undefined) { radioState.react = clampFloat(patch.radioReact, 0, 1.5, 0.65); radioEngine.setCityReactivity(radioState.react); }
    if (patch.radioPlaying !== undefined) {
      if (patch.radioPlaying && !radioEngine.playing) radioEngine.start();
      else if (!patch.radioPlaying && radioEngine.playing) radioEngine.stop();
      radioState.playing = radioEngine.playing;
    }
    if (patch.musicSyncPreset !== undefined) applyMusicSyncPreset(String(patch.musicSyncPreset));
    if (patch.musicSyncStrength !== undefined) radioState.syncStrength = clampFloat(patch.musicSyncStrength, 0, 1.5, radioState.syncStrength);
    if (patch.musicSyncTraffic !== undefined) radioState.syncTraffic = !!patch.musicSyncTraffic;
    if (patch.musicSyncClouds !== undefined) radioState.syncClouds = !!patch.musicSyncClouds;
    if (patch.musicSyncDiurnal !== undefined) radioState.syncDiurnal = !!patch.musicSyncDiurnal;
    if (patch.musicSyncLights !== undefined) radioState.syncLights = !!patch.musicSyncLights;
    if (patch.musicSyncAtmo !== undefined) radioState.syncAtmo = !!patch.musicSyncAtmo;
    if (
      patch.musicSyncTraffic !== undefined || patch.musicSyncClouds !== undefined ||
      patch.musicSyncDiurnal !== undefined || patch.musicSyncLights !== undefined || patch.musicSyncAtmo !== undefined
    ) {
      if ((radioState.syncTraffic || radioState.syncClouds || radioState.syncDiurnal || radioState.syncLights || radioState.syncAtmo)
          && (radioState.syncStrength ?? 0) <= 0.01 && patch.musicSyncStrength === undefined) {
        radioState.syncStrength = 1.0;
      }
      radioState.syncPreset = inferMusicSyncPreset();
    }

    if (needRebuild) rebuild();
    if (needRefreshLook || needRebuild) refreshLook(false);
    syncAllSliders();
    persistStartingState();
  }

  // Start minimized (`ui-off`) by default; allow `?ui=1` query override if explicitly requested
  if (params.get('ui') === '1' && !(demoBoot && demoBoot.uiHidden)) {
    document.body.classList.remove('ui-off');
  } else {
    document.body.classList.add('ui-off');
  }
  const bUiInit = $('#b-ui');
  const uiInitiallyOff = document.body.classList.contains('ui-off');
  bUiInit.textContent = uiInitiallyOff ? '\u2630' : '\u25E7';
  bUiInit.setAttribute('aria-pressed', String(!uiInitiallyOff));
  bUiInit.title = (uiInitiallyOff ? 'Show' : 'Hide') + ' interface (H)';

  syncAllSliders();
  rebuild();
  refreshLook(!initialExact);
  setAvoidanceState(avoidOn, false);
  setCollisionState(collideOn, false);
  setFreelookState(freelookOn, false);
  setGazeModeState(gazeMode, false);
  if (initialExact && initialExact.camera) {
    controls.setPose(initialExact.camera);
  }
  if (demoBoot && demoBoot.forceAutoloop) {
    if (pathRecorder.hasPath) {
      pathRecorder.loop = true;
      pathRecorder.play(true);
      syncPathUI();
    } else {
      setGlideState(true, false);
    }
    const startDemoAudioOnce = () => {
      if (!radioEngine.playing) {
        radioEngine.start();
        syncRadioUI();
      }
      window.removeEventListener('pointerdown', startDemoAudioOnce);
      window.removeEventListener('keydown', startDemoAudioOnce);
    };
    window.addEventListener('pointerdown', startDemoAudioOnce, { once: true });
    window.addEventListener('keydown', startDemoAudioOnce, { once: true });
  } else {
    if (glideOn) setGlideState(true, false);
    if (radioState.playing) {
      radioEngine.start();
      syncRadioUI();
      const resumeAudioOnGesture = () => {
        if (radioEngine.playing && radioEngine.ctx && radioEngine.ctx.state === 'suspended' && typeof radioEngine.ctx.resume === 'function') {
          try { radioEngine.ctx.resume(); } catch { /* ignore */ }
        }
        window.removeEventListener('pointerdown', resumeAudioOnGesture);
        window.removeEventListener('keydown', resumeAudioOnGesture);
      };
      window.addEventListener('pointerdown', resumeAudioOnGesture, { once: true });
      window.addEventListener('keydown', resumeAudioOnGesture, { once: true });
    }
  }

  bootCompleted = true;
  persistStartingState();
  window.addEventListener('pagehide', persistStartingState);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persistStartingState();
  });
  registerPetacityWebMCP({
    director,
    getState: captureExactState,
    getFullState: captureExactState,
    applyPartialState: applyPartialWebMCPState,
    getCity: () => city,
    getVehicles: () => vehicles,
    controls,
    camera,
    radio: radioEngine,
    recorder: pathRecorder,
    exporter,
    enqueueSpotRoute,
    triggerTransition: triggerSceneTransition,
    getTransitionState: () => post.getTransitionState(),
    managePresetsAndBookmarks,
    setPerformance: setPerformanceOptions,
    getPerformanceStats,
  });
  $('#loading').classList.add('out');
  animate();
}

try {
  boot();
} catch (err) {
  fatal(err);
}
