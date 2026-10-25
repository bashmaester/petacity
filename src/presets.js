// Whole-configuration presets, camera place bookmarks, and exact-state
// serialization (compact URL-safe Base64URL token + human-readable JSON).
// Pure JS — runs identically in browser and Node tests.

export const WORLD_PRESETS = [
  {
    id: 'unreal-harbor',
    label: 'Unreal Harbor & Spaceport',
    state: {
      seed: 4417, lookId: 'realistic', cityRadius: 5, suburbReach: 1.25,
      waterMode: 1, waterAmount: 1.15, shoreDist: 0.92,
      terrainMode: 0, terrainScale: 1.15, treeMode: 1, vegCover: 1.35, vegScale: 1.45,
      transitAmt: 0.85, maritimeAmt: 1.35, airAmt: 1.25, signAmt: 1.15, megaWrap: 0.85,
      worldCurve: 0.0, heightScale: 1.0, timeOfDay: 17.3, weatherMode: 0, dustLevel: 0.45,
      tune: {
        tint: 0.45, win: 1.0, glow: 0.95, fog: 0.85, lights: 1.05, traffic: 1.0,
        clouds: 1.15, cloudType: 0, cloudStyle: 0, cloudSeed: 24, cloudEvol: 1.1, cloudLac: 2.15,
        glyphStyle: 0, signAnim: 1.0,
        haze: 0.85, sun: 1.2, vib: 1.06, moon: 0.85, moonsz: 1.0, moonph: 0.72,
      },
      post: { bloom: 0.62, lens: 0.28, contrast: 1.09, temp: 0.05, film: 0.08, artStyle: 0, artStrength: 1.0 },
    },
  },
  {
    id: 'deckard-rain',
    label: "Deckard's Rain",
    state: {
      seed: 4417, lookId: 'bladerunner', cityRadius: 5, suburbReach: 1.15,
      worldCurve: 0.0, heightScale: 1.05, timeOfDay: 22.2, weatherMode: 1, dustLevel: 0.55,
      signAmt: 1.65, megaWrap: 1.45,
      tune: { tint: 0.78, win: 1.15, glow: 1.25, fog: 1.15, lights: 1.2, traffic: 1.1, clouds: 1.35, cloudType: 2, cloudStyle: 2, haze: 1.1, sun: 0.9, vib: 1.08, moon: 1.1, moonsz: 1.1, moonph: 0.82, glyphStyle: 0, signAnim: 1.25 },
      post: { bloom: 1.05, lens: 0.68, contrast: 1.10, temp: 0.14, film: 0.22 },
    },
  },
  {
    id: 'supertree-ecopolis',
    label: 'Mega-Canopy Eco-Harbor',
    state: {
      seed: 6204, lookId: 'realistic', cityRadius: 5, suburbReach: 1.3,
      waterMode: 0, waterAmount: 1.25, shoreDist: 1.0,
      terrainMode: 2, terrainScale: 1.1, treeMode: 3, vegCover: 2.1, vegScale: 3.1,
      transitAmt: 1.15, maritimeAmt: 1.5, airAmt: 1.35, signAmt: 1.1, megaWrap: 0.9,
      worldCurve: 0.0, heightScale: 1.0, timeOfDay: 18.0, weatherMode: 0, dustLevel: 0.55,
      tune: {
        tint: 0.42, win: 1.05, glow: 1.1, fog: 0.78, lights: 1.15, traffic: 0.95,
        clouds: 1.2, cloudType: 4, cloudStyle: 0, cloudSeed: 41, cloudEvol: 1.25, cloudLac: 2.25,
        glyphStyle: 1, signAnim: 1.0,
        haze: 0.82, sun: 1.3, vib: 1.15, moon: 1.0, moonsz: 1.15, moonph: 0.85,
      },
      post: { bloom: 0.72, lens: 0.32, contrast: 1.08, temp: 0.09, film: 0.06, artStyle: 0, artStrength: 1.0 },
    },
  },
  {
    id: 'orbital-planet',
    label: 'Orbital Planetoid',
    state: {
      seed: 4417, lookId: 'tron', cityRadius: 5, suburbReach: 1.35,
      waterMode: 0, terrainMode: 4, terrainScale: 0.0, treeMode: 2,
      worldCurve: 1.0, heightScale: 1.12, timeOfDay: 20.6, weatherMode: 0, dustLevel: 0.75,
      tune: { win: 1.1, glow: 1.3, fog: 0.55, lights: 1.35, traffic: 1.15, clouds: 1.15, cloudType: 4, cloudStyle: 0, haze: 0.7, sun: 1.15, vib: 1.18, moon: 1.3, moonsz: 1.35, moonph: 1.0 },
      post: { bloom: 1.18, lens: 0.62, contrast: 1.14, temp: -0.18, film: 0.08, artStyle: 0, artStrength: 1.0 },
      cam: { x: 0, y: 980, z: 3150, yaw: 0, pitch: -0.46 },
    },
  },
  {
    id: 'coastal-valley',
    label: 'Coastal Mountains & Farms',
    state: {
      seed: 6204, lookId: 'anime', cityRadius: 5, suburbReach: 1.4,
      waterMode: 1, terrainMode: 0, terrainScale: 1.25, treeMode: 1,
      worldCurve: 0.0, heightScale: 1.0, timeOfDay: 16.9, weatherMode: 0, dustLevel: 0.5,
      tune: { win: 0.95, glow: 1.05, fog: 0.75, lights: 1.05, traffic: 1.0, clouds: 1.15, cloudType: 0, cloudStyle: 0, haze: 0.9, sun: 1.35, vib: 1.22, moon: 0.85, moonsz: 1.1, moonph: 0.62 },
      post: { bloom: 0.88, lens: 0.35, contrast: 1.06, temp: 0.18, film: 0.08, artStyle: 0, artStrength: 1.0 },
    },
  },
  {
    id: 'desert-mesa-oasis',
    label: 'Desert Mesa Cyber-Oasis',
    state: {
      seed: 5150, lookId: 'outrun', cityRadius: 5, suburbReach: 1.35,
      waterMode: 3, terrainMode: 1, terrainScale: 1.3, treeMode: 3,
      worldCurve: 0.0, heightScale: 1.02, timeOfDay: 18.7, weatherMode: 5, dustLevel: 0.85,
      tune: { win: 1.15, glow: 1.3, fog: 0.9, lights: 1.25, traffic: 1.15, clouds: 0.95, cloudType: 3, cloudStyle: 0, haze: 1.15, sun: 1.45, vib: 1.28, moon: 1.2, moonsz: 1.45, moonph: 1.0 },
      post: { bloom: 1.15, lens: 0.62, contrast: 1.12, temp: 0.24, film: 0.14, artStyle: 0, artStrength: 1.0 },
    },
  },
  {
    id: 'impressionist-bay',
    label: 'Impressionist Nocturne Bay',
    state: {
      seed: 4417, lookId: 'bladerunner', cityRadius: 5, suburbReach: 1.25,
      waterMode: 2, terrainMode: 2, terrainScale: 1.1, treeMode: 3,
      worldCurve: 0.0, heightScale: 1.05, timeOfDay: 20.6, weatherMode: 0, dustLevel: 0.55,
      tune: { win: 1.2, glow: 1.3, fog: 0.95, lights: 1.25, traffic: 1.1, clouds: 1.3, cloudType: 4, cloudStyle: 0, haze: 1.0, sun: 1.1, vib: 1.22, moon: 1.25, moonsz: 1.35, moonph: 1.0 },
      post: { bloom: 1.05, lens: 0.45, contrast: 1.08, temp: 0.12, film: 0.06, artStyle: 5, artStrength: 1.0 },
    },
  },
  {
    id: 'metropolis-1927',
    label: 'Metropolis 1927',
    state: {
      seed: 1927, lookId: 'metropolis', cityRadius: 6, suburbReach: 1.1,
      worldCurve: 0.10, heightScale: 1.32, timeOfDay: 21.4, weatherMode: 6, dustLevel: 0.85,
      tune: { win: 1.0, glow: 1.15, fog: 1.2, lights: 1.25, traffic: 0.95, clouds: 1.45, cloudType: 1, cloudStyle: 3, haze: 1.2, sun: 0.85, vib: 0.9, moon: 1.25, moonsz: 1.4, moonph: 1.25 },
      post: { bloom: 0.78, lens: 0.42, contrast: 1.24, temp: 0.06, film: 0.78 },
    },
  },
  {
    id: 'shinjuku-dusk',
    label: 'Shinjuku Golden Dusk',
    state: {
      seed: 8088, lookId: 'anime', cityRadius: 5, suburbReach: 1.45,
      worldCurve: 0.22, heightScale: 1.0, timeOfDay: 17.6, weatherMode: 0, dustLevel: 0.65,
      tune: { win: 1.05, glow: 1.1, fog: 0.85, lights: 1.0, traffic: 1.05, clouds: 1.30, cloudType: 4, cloudStyle: 4, haze: 1.05, sun: 1.35, vib: 1.22, moon: 0.9, moonsz: 1.15, moonph: 0.55 },
      post: { bloom: 0.92, lens: 0.35, contrast: 1.06, temp: 0.22, film: 0.10 },
    },
  },
  {
    id: 'outrun-horizon',
    label: 'Outrun Synth Horizon',
    state: {
      seed: 1984, lookId: 'outrun', cityRadius: 5, suburbReach: 1.5,
      worldCurve: 0.28, heightScale: 0.95, timeOfDay: 19.4, weatherMode: 0, dustLevel: 0.5,
      tune: { win: 1.2, glow: 1.35, fog: 0.9, lights: 1.25, traffic: 1.2, clouds: 1.15, cloudType: 3, cloudStyle: 5, haze: 1.15, sun: 1.5, vib: 1.3, moon: 1.2, moonsz: 1.6, moonph: 1.0 },
      post: { bloom: 1.25, lens: 0.72, contrast: 1.14, temp: 0.18, film: 0.16 },
    },
  },
  {
    id: 'clay-maquette',
    label: 'Curved Clay Maquette',
    state: {
      seed: 31415, lookId: 'clay', cityRadius: 5, suburbReach: 1.25,
      worldCurve: 0.45, heightScale: 0.92, timeOfDay: 15.4, weatherMode: 5, dustLevel: 0.9,
      tune: { win: 0.65, glow: 0.75, fog: 0.95, lights: 0.8, traffic: 0.75, clouds: 1.05, cloudType: 0, cloudStyle: 6, haze: 1.1, sun: 1.1, vib: 1.0, moon: 0.6, moonsz: 1.0, moonph: 0.65 },
      post: { bloom: 0.55, lens: 0.25, contrast: 1.05, temp: 0.24, film: 0.24 },
    },
  },
  {
    id: 'aurora-colony',
    label: 'Aurora Colony (Custom)',
    state: {
      seed: 7749, lookId: 'custom', cityRadius: 5, suburbReach: 1.3,
      worldCurve: 0.62, heightScale: 1.08, timeOfDay: 22.8, weatherMode: 3, dustLevel: 0.7,
      custom: { zen: '#051024', hor: '#0ea5a0', base: '#142238', win: '#ffe08a', accent: '#2ef2b8', sec: '#66d9ff', style: 'lit', mono: false },
      tune: { win: 1.15, glow: 1.25, fog: 0.85, lights: 1.25, traffic: 1.0, clouds: 1.35, cloudType: 5, cloudStyle: 0, haze: 0.95, sun: 1.1, vib: 1.18, moon: 1.35, moonsz: 1.3, moonph: 1.65 },
      post: { bloom: 1.08, lens: 0.52, contrast: 1.10, temp: -0.22, film: 0.12 },
    },
  },
  {
    id: 'little-planet-gardens',
    label: 'Little Planet Sky-Gardens (360°)',
    state: {
      seed: 4417, lookId: 'realistic', cityRadius: 5, suburbReach: 1.25,
      worldCurve: 0.0, heightScale: 1.12, timeOfDay: 17.6, weatherMode: 0, dustLevel: 0.45,
      tune: { win: 1.05, glow: 1.12, fog: 0.72, lights: 1.15, traffic: 1.1, clouds: 1.15, cloudType: 1, cloudStyle: 0, haze: 0.9, sun: 1.35, vib: 1.12, moon: 0.6, moonsz: 1.0, moonph: 0.8 },
      post: { bloom: 0.82, lens: 0.35, contrast: 1.08, temp: 0.12, film: 0.08, lensMode: 6, lensZoom: 0.88 },
    },
  },
  {
    id: 'dutch-panini-noir',
    label: 'Panini Dutch Noir (118°)',
    state: {
      seed: 4417, lookId: 'bladerunner', cityRadius: 5, suburbReach: 1.2,
      worldCurve: 0.0, heightScale: 1.2, timeOfDay: 22.4, weatherMode: 1, dustLevel: 0.95,
      tune: { win: 1.35, glow: 1.4, fog: 1.05, lights: 1.4, traffic: 1.25, clouds: 1.25, cloudType: 1, cloudStyle: 0, haze: 1.05, sun: 1.0, vib: 1.08, moon: 1.1, moonsz: 1.1, moonph: 1.35 },
      post: { bloom: 1.22, lens: 0.74, contrast: 1.14, temp: -0.06, film: 0.18, lensMode: 1, lensDistort: 0.24, anamorphic: 0.42 },
    },
  },
];

export const PRESET_BY_ID = Object.fromEntries(WORLD_PRESETS.map((p) => [p.id, p]));

export const DEFAULT_BOOKMARKS = [
  { id: 'bm-overlook', name: 'Skyline Overlook', x: 720, y: 390, z: 880, yaw: 0.68, pitch: -0.24 },
  { id: 'bm-canyon', name: 'Avenue Street Canyon', x: 0, y: 24, z: 420, yaw: 0.0, pitch: 0.08 },
  { id: 'bm-clouds', name: 'Above the Cloud Deck', x: -640, y: 690, z: 760, yaw: -0.72, pitch: -0.34 },
  { id: 'bm-suburbs', name: 'Horizon Suburbs Rim', x: 1620, y: 210, z: 1480, yaw: 0.82, pitch: -0.14 },
  { id: 'bm-orbit', name: 'Planetoid High Orbit', x: 0, y: 1050, z: 3300, yaw: 0.0, pitch: -0.48 },
];

const roundN = (n, d = 3) => (Number.isFinite(n) ? Number(n.toFixed(d)) : 0);

function bytesToBase64Url(bytes) {
  let b64;
  if (typeof Buffer !== 'undefined') {
    b64 = Buffer.from(bytes).toString('base64');
  } else {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    b64 = btoa(bin);
  }
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(padded, 'base64'));
  }
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const DEF_TOP = {
  seed: 4417,
  lookId: 'bladerunner',
  cityRadius: 5,
  suburbReach: 1,
  waterMode: 1,
  waterAmount: 1,
  shoreDist: 1,
  terrainMode: 0,
  terrainScale: 1,
  treeMode: 0,
  vegCover: 1,
  vegScale: 1,
  transitAmt: 0.75,
  maritimeAmt: 1,
  airAmt: 1,
  signAmt: 1.15,
  megaWrap: 1,
  worldCurve: 0,
  heightScale: 1,
  timeOfDay: 18.2,
  dayCycle: false,
  daySpeed: 1,
  trafficSpeed: 1,
  weatherMode: 0,
  dustLevel: 0.6,
  glide: false,
  autoLook: false,
  freelook: false,
  collide: true,
  avoidance: true,
  camSpeed: 1,
  camRadius: 2.2,
  camSmooth: 0.72,
  turnSmooth: 1.25,
  camStyle: 0,
  pathSmooth: 0.65,
};

const DEF_CUSTOM = {
  zen: '#091326',
  hor: '#d95b43',
  base: '#182438',
  win: '#ffd166',
  accent: '#06d6a0',
  sec: '#4cc9f0',
  style: 'lit',
  mono: false,
};

const DEF_TUNE = {
  tint: 0.75,
  win: 1, glow: 1, fog: 1, lights: 1, traffic: 1,
  searchLight: 1, searchCount: 1, trafficLight: 1, sigDensity: 1, vehLight: 1, lampDensity: 1,
  waterShader: 0, waterScale: 1, waterChop: 1, waterFoam: 0.85, waterRefl: 1.15, waterContrast: 0.12, waterWarp: 0.4,
  clouds: 1, cloudType: 0, cloudStyle: 0, cloudSeed: 17, cloudEvol: 1, cloudLac: 2.07,
  cloudElev: 1, cloudRange: 1, cloudLayersMode: 1,
  windAngle: 30, windStrength: 1,
  glyphStyle: 0, signAnim: 1,
  haze: 1, sun: 1, vib: 1,
  moon: 1, moonsz: 1, moonph: 0.85,
};

const DEF_RADIO = {
  station: 0, volume: 0.68, space: 0.9, warmth: 0.8, pulse: 0.55, react: 0.65,
  playlistMode: 'seq', playlistInterval: 75,
};

const DEF_POST = {
  bloom: 0.85, lens: 0.45, contrast: 1.06, temp: 0, film: 0.16, artStyle: 0, artStrength: 1.0,
  lensMode: 0, lensDistort: 0, lensZoom: 1.0, anamorphic: 0, tiltShift: 0,
};

function makeShortKeyTable(keys) {
  const fwd = {};
  const rev = {};
  const alpha = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  keys.forEach((k, idx) => {
    const code = idx < alpha.length
      ? alpha[idx]
      : alpha[Math.floor(idx / alpha.length) - 1] + alpha[idx % alpha.length];
    fwd[k] = code;
    rev[code] = k;
  });
  return { fwd, rev };
}

const TOP_TABLE = makeShortKeyTable(Object.keys(DEF_TOP));
const TUNE_TABLE = makeShortKeyTable([
  ...Object.keys(DEF_TUNE),
  'cloudLayerElev', 'cloudLayerThick', 'cloudLayerDens',
]);
const POST_TABLE = makeShortKeyTable(Object.keys(DEF_POST));
const RADIO_TABLE = makeShortKeyTable(Object.keys(DEF_RADIO));

function bookmarksMatchDefault(list) {
  if (!Array.isArray(list) || list.length !== DEFAULT_BOOKMARKS.length) return false;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    const b = DEFAULT_BOOKMARKS[i];
    if (
      a.id !== b.id || a.name !== b.name ||
      Math.abs((a.x || 0) - b.x) > 0.05 ||
      Math.abs((a.y || 0) - b.y) > 0.05 ||
      Math.abs((a.z || 0) - b.z) > 0.05 ||
      Math.abs((a.yaw || 0) - b.yaw) > 1e-3 ||
      Math.abs((a.pitch || 0) - b.pitch) > 1e-3 ||
      a.roll !== undefined || a.fov !== undefined || a.lensMode !== undefined
    ) {
      return false;
    }
  }
  return true;
}

function customMatchesDefault(c) {
  if (!c || typeof c !== 'object') return true;
  return (
    String(c.zen || DEF_CUSTOM.zen).toLowerCase() === DEF_CUSTOM.zen &&
    String(c.hor || DEF_CUSTOM.hor).toLowerCase() === DEF_CUSTOM.hor &&
    String(c.base || DEF_CUSTOM.base).toLowerCase() === DEF_CUSTOM.base &&
    String(c.win || DEF_CUSTOM.win).toLowerCase() === DEF_CUSTOM.win &&
    String(c.accent || DEF_CUSTOM.accent).toLowerCase() === DEF_CUSTOM.accent &&
    String(c.sec || DEF_CUSTOM.sec).toLowerCase() === DEF_CUSTOM.sec &&
    (c.style || 'lit') === DEF_CUSTOM.style &&
    !!c.mono === DEF_CUSTOM.mono
  );
}

/** Normalize & round an application state snapshot so exported tokens stay compact. */
export function normalizeExactState(raw = {}) {
  const out = {
    v: 1,
    seed: Math.max(1, Math.min(999999999, Math.round(Number(raw.seed) || 4417))),
    lookId: typeof raw.lookId === 'string' ? raw.lookId : 'bladerunner',
    cityRadius: Math.max(1, Math.min(15, Math.round(Number(raw.cityRadius) || 5))),
    suburbReach: roundN(raw.suburbReach ?? 1, 2),
    waterMode: Math.max(0, Math.min(4, Math.round(Number(raw.waterMode ?? 1)))),
    waterAmount: Math.max(0, Math.min(2, roundN(Number(raw.waterAmount ?? 1), 2))),
    shoreDist: Math.max(0.35, Math.min(2.5, roundN(Number(raw.shoreDist ?? 1), 2))),
    terrainMode: Math.max(0, Math.min(4, Math.round(Number(raw.terrainMode ?? 0)))),
    terrainScale: Math.max(0, Math.min(2, roundN(Number(raw.terrainScale ?? 1), 2))),
    treeMode: Math.max(0, Math.min(3, Math.round(Number(raw.treeMode ?? 0)))),
    vegCover: Math.max(0, Math.min(2.5, roundN(Number(raw.vegCover ?? 1), 2))),
    vegScale: Math.max(0.4, Math.min(4.5, roundN(Number(raw.vegScale ?? 1), 2))),
    transitAmt: Math.max(0, Math.min(2.5, roundN(Number(raw.transitAmt ?? 0.75), 2))),
    maritimeAmt: Math.max(0, Math.min(2.5, roundN(Number(raw.maritimeAmt ?? 1), 2))),
    airAmt: Math.max(0, Math.min(2.5, roundN(Number(raw.airAmt ?? 1), 2))),
    signAmt: Math.max(0, Math.min(2.5, roundN(Number(raw.signAmt ?? 1.15), 2))),
    megaWrap: Math.max(0, Math.min(2.0, roundN(Number(raw.megaWrap ?? 1), 2))),
    worldCurve: roundN(raw.worldCurve ?? 0, 3),
    heightScale: roundN(raw.heightScale ?? 1, 2),
    timeOfDay: roundN(raw.timeOfDay ?? 18.2, 2),
    dayCycle: !!(raw.dayCycle ?? false),
    daySpeed: roundN(raw.daySpeed ?? 1.0, 2),
    trafficSpeed: roundN(raw.trafficSpeed ?? 1.0, 2),
    weatherMode: Math.max(0, Math.min(6, Math.round(Number(raw.weatherMode) || 0))),
    dustLevel: roundN(raw.dustLevel ?? 0.6, 2),
    glide: !!(raw.glide ?? raw.glideOn),
    autoLook: !!(raw.autoLook ?? false),
    freelook: !!(raw.freelook ?? false),
    collide: raw.collide !== undefined ? !!raw.collide : (raw.collideOn !== undefined ? !!raw.collideOn : true),
    avoidance: raw.avoidance !== undefined ? !!raw.avoidance : true,
    camSpeed: roundN(raw.camSpeed ?? 1.0, 3),
    camRadius: roundN(raw.camRadius ?? 2.2, 2),
    camSmooth: roundN(raw.camSmooth ?? 0.72, 2),
    turnSmooth: roundN(raw.turnSmooth ?? 1.25, 2),
    camStyle: Math.max(0, Math.min(4, Math.round(Number(raw.camStyle ?? 0)))),
    pathSmooth: roundN(raw.pathSmooth ?? 0.65, 2),
  };
  if (raw.custom && typeof raw.custom === 'object') {
    out.custom = {
      zen: String(raw.custom.zen || '#091326'),
      hor: String(raw.custom.hor || '#d95b43'),
      base: String(raw.custom.base || '#182438'),
      win: String(raw.custom.win || '#ffd166'),
      accent: String(raw.custom.accent || '#06d6a0'),
      sec: String(raw.custom.sec || '#4cc9f0'),
      style: ['lit', 'toon', 'flat'].includes(raw.custom.style) ? raw.custom.style : 'lit',
      mono: !!raw.custom.mono,
    };
  }
  out.tune = { ...DEF_TUNE };
  if (raw.tune && typeof raw.tune === 'object') {
    for (const k of Object.keys(DEF_TUNE)) {
      if (raw.tune[k] !== undefined) out.tune[k] = roundN(Number(raw.tune[k]), 3);
    }
    if (Array.isArray(raw.tune.cloudLayerElev) && raw.tune.cloudLayerElev.length === 3) {
      out.tune.cloudLayerElev = raw.tune.cloudLayerElev.map((v) => roundN(Number(v), 1));
    }
    if (Array.isArray(raw.tune.cloudLayerThick) && raw.tune.cloudLayerThick.length === 3) {
      out.tune.cloudLayerThick = raw.tune.cloudLayerThick.map((v) => roundN(Number(v), 1));
    }
    if (Array.isArray(raw.tune.cloudLayerDens) && raw.tune.cloudLayerDens.length === 3) {
      out.tune.cloudLayerDens = raw.tune.cloudLayerDens.map((v) => roundN(Number(v), 2));
    }
  }
  if (raw.radio && typeof raw.radio === 'object') {
    out.radio = {
      station: Math.max(0, Math.min(5, Math.round(Number(raw.radio.station) || 0))),
      volume: roundN(Number(raw.radio.volume ?? 0.68), 2),
      space: roundN(Number(raw.radio.space ?? 0.90), 2),
      warmth: roundN(Number(raw.radio.warmth ?? 0.80), 2),
      pulse: roundN(Number(raw.radio.pulse ?? 0.55), 2),
      react: roundN(Number(raw.radio.react ?? 0.65), 2),
      playlistMode: ['loop', 'seq', 'shuffle'].includes(raw.radio.playlistMode) ? raw.radio.playlistMode : 'seq',
      playlistInterval: Math.max(15, Math.min(300, Math.round(Number(raw.radio.playlistInterval ?? 75)))),
    };
  }
  if (Array.isArray(raw.autoLoop) && raw.autoLoop.length >= 3) {
    out.autoLoop = raw.autoLoop.slice(0, 32).map((p, idx) => ({
      name: String(p.name || `Loop ${idx + 1}`).slice(0, 32),
      x: roundN(Number(p.x) || 0, 1),
      y: roundN(Number(p.y ?? 140), 1),
      z: roundN(Number(p.z) || 0, 1),
    }));
  }
  out.post = { ...DEF_POST };
  if (raw.post && typeof raw.post === 'object') {
    for (const k of Object.keys(DEF_POST)) {
      if (raw.post[k] !== undefined) out.post[k] = roundN(Number(raw.post[k]), 3);
    }
  }
  const camIn = (raw.camera && typeof raw.camera === 'object') ? raw.camera
    : ((raw.cam && typeof raw.cam === 'object') ? raw.cam : null);
  if (camIn) {
    out.camera = {
      x: roundN(Number(camIn.x), 2),
      y: roundN(Number(camIn.y), 2),
      z: roundN(Number(camIn.z), 2),
      yaw: roundN(Number(camIn.yaw), 4),
      pitch: roundN(Number(camIn.pitch), 4),
    };
    if (camIn.roll !== undefined) out.camera.roll = roundN(Number(camIn.roll), 4);
    if (camIn.fov !== undefined) out.camera.fov = roundN(Number(camIn.fov), 1);
  }
  if (Array.isArray(raw.bookmarks) && raw.bookmarks.length) {
    out.bookmarks = raw.bookmarks.slice(0, 32).map((b, idx) => ({
      id: String(b.id || `bm-u-${idx}`),
      name: String(b.name || `View ${idx + 1}`).slice(0, 48),
      x: roundN(Number(b.x), 2),
      y: roundN(Number(b.y), 2),
      z: roundN(Number(b.z), 2),
      yaw: roundN(Number(b.yaw), 4),
      pitch: roundN(Number(b.pitch), 4),
      ...(b.roll !== undefined ? { roll: roundN(Number(b.roll), 4) } : {}),
      ...(b.fov !== undefined ? { fov: roundN(Number(b.fov), 1) } : {}),
      ...(b.lensMode !== undefined ? { lensMode: Math.round(Number(b.lensMode)) } : {}),
    }));
  }
  if (raw.path && typeof raw.path === 'object') {
    const srcFrames = Array.isArray(raw.path.frames) ? raw.path.frames : (Array.isArray(raw.path.k) ? raw.path.k : null);
    if (srcFrames && srcFrames.length >= 2) {
      out.path = {
        v: 1,
        loop: raw.path.loop !== false,
        frames: srcFrames.slice(0, 600).map((row) => (
          row.length >= 8
            ? [
                roundN(Number(row[0]) || 0, 3),
                roundN(Number(row[1]) || 0, 2),
                roundN(Number(row[2]) || 0, 2),
                roundN(Number(row[3]) || 0, 2),
                roundN(Number(row[4]) || 0, 5),
                roundN(Number(row[5]) || 0, 5),
                roundN(Number(row[6]) || 0, 5),
                roundN(Number(row[7] ?? 1), 5),
              ]
            : [
                roundN(Number(row[0]) || 0, 3),
                roundN(Number(row[1]) || 0, 2),
                roundN(Number(row[2]) || 0, 2),
                roundN(Number(row[3]) || 0, 2),
                roundN(Number(row[4]) || 0, 4),
                roundN(Number(row[5]) || 0, 4),
              ]
        )),
      };
    }
  }
  return out;
}

function packCompactState(norm) {
  const pkg = { _v: 2 };
  const top = {};
  for (const [k, defVal] of Object.entries(DEF_TOP)) {
    if (norm[k] !== defVal) top[TOP_TABLE.fwd[k]] = norm[k];
  }
  if (Object.keys(top).length > 0) pkg.d = top;

  const tune = {};
  if (norm.tune) {
    for (const [k, defVal] of Object.entries(DEF_TUNE)) {
      if (norm.tune[k] !== undefined && norm.tune[k] !== defVal) {
        tune[TUNE_TABLE.fwd[k]] = norm.tune[k];
      }
    }
    for (const arrK of ['cloudLayerElev', 'cloudLayerThick', 'cloudLayerDens']) {
      if (Array.isArray(norm.tune[arrK])) tune[TUNE_TABLE.fwd[arrK]] = norm.tune[arrK];
    }
  }
  if (Object.keys(tune).length > 0) pkg.t = tune;

  const post = {};
  if (norm.post) {
    for (const [k, defVal] of Object.entries(DEF_POST)) {
      if (norm.post[k] !== undefined && norm.post[k] !== defVal) {
        post[POST_TABLE.fwd[k]] = norm.post[k];
      }
    }
  }
  if (Object.keys(post).length > 0) pkg.p = post;

  if (norm.radio) {
    const rad = {};
    for (const [k, defVal] of Object.entries(DEF_RADIO)) {
      if (norm.radio[k] !== undefined && norm.radio[k] !== defVal) {
        rad[RADIO_TABLE.fwd[k]] = norm.radio[k];
      }
    }
    if (Object.keys(rad).length > 0) pkg.r = rad;
  }

  if (norm.custom && (norm.lookId === 'custom' || !customMatchesDefault(norm.custom))) {
    const strip = (h) => String(h || '').replace(/^#/, '');
    pkg.u = [
      strip(norm.custom.zen), strip(norm.custom.hor), strip(norm.custom.base),
      strip(norm.custom.win), strip(norm.custom.accent), strip(norm.custom.sec),
      norm.custom.style || 'lit', norm.custom.mono ? 1 : 0,
    ];
  }

  if (norm.camera) {
    const c = norm.camera;
    const arr = [c.x, c.y, c.z, c.yaw, c.pitch];
    if (c.roll !== undefined || c.fov !== undefined) {
      arr.push(c.roll ?? 0);
      if (c.fov !== undefined) arr.push(c.fov);
    }
    pkg.c = arr;
  }

  if (Array.isArray(norm.bookmarks) && norm.bookmarks.length && !bookmarksMatchDefault(norm.bookmarks)) {
    pkg.b = norm.bookmarks.map((bm) => {
      const row = [bm.name, bm.x, bm.y, bm.z, bm.yaw, bm.pitch, bm.id];
      if (bm.roll !== undefined || bm.fov !== undefined || bm.lensMode !== undefined) {
        row.push(bm.roll ?? null, bm.fov ?? null, bm.lensMode ?? null);
      }
      return row;
    });
  }

  if (Array.isArray(norm.autoLoop) && norm.autoLoop.length >= 3) {
    pkg.l = norm.autoLoop.map((p) => [p.x, p.y, p.z]);
  }
  if (norm.path && Array.isArray(norm.path.frames) && norm.path.frames.length >= 2) {
    pkg.k = [norm.path.loop !== false ? 1 : 0, norm.path.frames];
  }
  return pkg;
}

function unpackCompactState(pkg) {
  const raw = { v: 1 };
  if (pkg.d && typeof pkg.d === 'object') {
    for (const [code, val] of Object.entries(pkg.d)) {
      const k = TOP_TABLE.rev[code];
      if (k) raw[k] = val;
    }
  }
  if (pkg.t && typeof pkg.t === 'object') {
    raw.tune = {};
    for (const [code, val] of Object.entries(pkg.t)) {
      const k = TUNE_TABLE.rev[code];
      if (k) raw.tune[k] = val;
    }
  }
  if (pkg.p && typeof pkg.p === 'object') {
    raw.post = {};
    for (const [code, val] of Object.entries(pkg.p)) {
      const k = POST_TABLE.rev[code];
      if (k) raw.post[k] = val;
    }
  }
  if (pkg.r && typeof pkg.r === 'object') {
    raw.radio = {};
    for (const [code, val] of Object.entries(pkg.r)) {
      const k = RADIO_TABLE.rev[code];
      if (k) raw.radio[k] = val;
    }
  }
  if (Array.isArray(pkg.u) && pkg.u.length >= 6) {
    const hex = (s, fb) => (typeof s === 'string' && s.length === 6 ? `#${s}` : fb);
    raw.custom = {
      zen: hex(pkg.u[0], DEF_CUSTOM.zen),
      hor: hex(pkg.u[1], DEF_CUSTOM.hor),
      base: hex(pkg.u[2], DEF_CUSTOM.base),
      win: hex(pkg.u[3], DEF_CUSTOM.win),
      accent: hex(pkg.u[4], DEF_CUSTOM.accent),
      sec: hex(pkg.u[5], DEF_CUSTOM.sec),
      style: pkg.u[6] || 'lit',
      mono: !!pkg.u[7],
    };
  }
  if (Array.isArray(pkg.c) && pkg.c.length >= 5) {
    raw.camera = {
      x: pkg.c[0], y: pkg.c[1], z: pkg.c[2], yaw: pkg.c[3], pitch: pkg.c[4],
    };
    if (pkg.c.length >= 6 && pkg.c[5] !== null && pkg.c[5] !== undefined) raw.camera.roll = pkg.c[5];
    if (pkg.c.length >= 7 && pkg.c[6] !== null && pkg.c[6] !== undefined) raw.camera.fov = pkg.c[6];
  }
  if (Array.isArray(pkg.b)) {
    raw.bookmarks = pkg.b.map((row, idx) => {
      const bm = {
        id: row[6] || `bm-u-${idx}`,
        name: row[0],
        x: row[1], y: row[2], z: row[3], yaw: row[4], pitch: row[5],
      };
      if (row[7] !== null && row[7] !== undefined) bm.roll = row[7];
      if (row[8] !== null && row[8] !== undefined) bm.fov = row[8];
      if (row[9] !== null && row[9] !== undefined) bm.lensMode = row[9];
      return bm;
    });
  }
  if (Array.isArray(pkg.l) && pkg.l.length >= 3) {
    raw.autoLoop = pkg.l.map((row, idx) => ({
      name: `Loop ${idx + 1}`,
      x: Number(row[0]) || 0,
      y: Number(row[1] ?? 140),
      z: Number(row[2]) || 0,
    }));
  }
  if (Array.isArray(pkg.k) && Array.isArray(pkg.k[1])) {
    raw.path = { v: 1, loop: pkg.k[0] !== 0, frames: pkg.k[1] };
  }
  return normalizeExactState(raw);
}

/** Encode exact state into an ultra-compact delta Base64URL string (v2). */
export function encodeExactState(raw) {
  const norm = normalizeExactState(raw);
  const compact = packCompactState(norm);
  const json = JSON.stringify(compact);
  const bytes = new TextEncoder().encode(json);
  return bytesToBase64Url(bytes);
}

/** Decode a compact v2 or legacy v1 Base64URL token, a full URL (`#s=...` or `?s=...`), or raw JSON. */
export function decodeExactState(input) {
  if (!input || typeof input !== 'string') return null;
  let trimmed = input.trim();
  if (!trimmed) return null;
  // Support pasting a full share URL with either `#s=...` hash or `?s=...` query param!
  if (/^https?:\/\//i.test(trimmed) || /[?#&]s=/.test(trimmed)) {
    try {
      const hIdx = trimmed.indexOf('#');
      if (hIdx >= 0) {
        const hs = new URLSearchParams(trimmed.slice(hIdx + 1));
        if (hs.get('s')) trimmed = hs.get('s');
      }
      if (/[?&]s=/.test(trimmed)) {
        const qIdx = trimmed.indexOf('?');
        const cutHash = trimmed.indexOf('#');
        const qPart = qIdx >= 0
          ? trimmed.slice(qIdx + 1, cutHash >= 0 ? cutHash : undefined)
          : trimmed;
        const qs = new URLSearchParams(qPart);
        if (qs.get('s')) trimmed = qs.get('s');
      }
    } catch {
      // fall through
    }
  }
  try {
    const parsed = trimmed.startsWith('{')
      ? JSON.parse(trimmed)
      : JSON.parse(new TextDecoder().decode(base64UrlToBytes(trimmed)));
    if (parsed && parsed._v === 2) {
      return unpackCompactState(parsed);
    }
    return normalizeExactState(parsed);
  } catch {
    return null;
  }
}
