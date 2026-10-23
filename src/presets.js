// Whole-configuration presets, camera place bookmarks, and exact-state
// serialization (compact URL-safe Base64URL token + human-readable JSON).
// Pure JS — runs identically in browser and Node tests.

export const WORLD_PRESETS = [
  {
    id: 'deckard-rain',
    label: "Deckard's Rain",
    state: {
      seed: 4417, lookId: 'bladerunner', cityRadius: 5, suburbReach: 1.15,
      worldCurve: 0.0, heightScale: 1.05, timeOfDay: 22.2, weatherMode: 1, dustLevel: 0.55,
      tune: { win: 1.15, glow: 1.25, fog: 1.15, lights: 1.2, traffic: 1.1, clouds: 1.35, cloudType: 2, cloudStyle: 2, haze: 1.1, sun: 0.9, vib: 1.08, moon: 1.1, moonsz: 1.1, moonph: 0.82 },
      post: { bloom: 1.05, lens: 0.68, contrast: 1.10, temp: 0.14, film: 0.22 },
    },
  },
  {
    id: 'orbital-planet',
    label: 'Orbital Planetoid',
    state: {
      seed: 4417, lookId: 'tron', cityRadius: 5, suburbReach: 1.35,
      worldCurve: 1.0, heightScale: 1.12, timeOfDay: 20.6, weatherMode: 0, dustLevel: 0.75,
      tune: { win: 1.1, glow: 1.3, fog: 0.55, lights: 1.35, traffic: 1.15, clouds: 1.15, cloudType: 4, cloudStyle: 0, haze: 0.7, sun: 1.15, vib: 1.18, moon: 1.3, moonsz: 1.35, moonph: 1.0 },
      post: { bloom: 1.18, lens: 0.62, contrast: 1.14, temp: -0.18, film: 0.08 },
      cam: { x: 0, y: 980, z: 3150, yaw: 0, pitch: -0.46 },
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

/** Normalize & round an application state snapshot so exported tokens stay compact. */
export function normalizeExactState(raw = {}) {
  const out = {
    v: 1,
    seed: Math.max(1, Math.min(999999999, Math.round(Number(raw.seed) || 4417))),
    lookId: typeof raw.lookId === 'string' ? raw.lookId : 'bladerunner',
    cityRadius: Math.max(1, Math.min(15, Math.round(Number(raw.cityRadius) || 5))),
    suburbReach: roundN(raw.suburbReach ?? 1, 2),
    worldCurve: roundN(raw.worldCurve ?? 0, 3),
    heightScale: roundN(raw.heightScale ?? 1, 2),
    timeOfDay: roundN(raw.timeOfDay ?? 18.2, 2),
    weatherMode: Math.max(0, Math.min(6, Math.round(Number(raw.weatherMode) || 0))),
    dustLevel: roundN(raw.dustLevel ?? 0.6, 2),
    glide: !!(raw.glide ?? raw.glideOn),
    collide: raw.collide !== undefined ? !!raw.collide : (raw.collideOn !== undefined ? !!raw.collideOn : true),
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
  const defTune = {
    win: 1, glow: 1, fog: 1, lights: 1, traffic: 1,
    clouds: 1, cloudType: 0, cloudStyle: 0, haze: 1, sun: 1, vib: 1,
    moon: 1, moonsz: 1, moonph: 0.85,
  };
  out.tune = { ...defTune };
  if (raw.tune && typeof raw.tune === 'object') {
    for (const k of Object.keys(defTune)) {
      if (raw.tune[k] !== undefined) out.tune[k] = roundN(Number(raw.tune[k]), 3);
    }
  }
  const defPost = { bloom: 0.85, lens: 0.45, contrast: 1.06, temp: 0, film: 0.16 };
  out.post = { ...defPost };
  if (raw.post && typeof raw.post === 'object') {
    for (const k of Object.keys(defPost)) {
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

/** Encode exact state into a compact URL-safe Base64URL string. */
export function encodeExactState(raw) {
  const norm = normalizeExactState(raw);
  const json = JSON.stringify(norm);
  const bytes = new TextEncoder().encode(json);
  return bytesToBase64Url(bytes);
}

/** Decode either a Base64URL token, a full URL containing `?s=...`, or a raw JSON string. */
export function decodeExactState(input) {
  if (!input || typeof input !== 'string') return null;
  let trimmed = input.trim();
  if (!trimmed) return null;
  // Support pasting a full share URL directly
  if (/^https?:\/\//i.test(trimmed) || trimmed.includes('?s=') || trimmed.includes('&s=')) {
    try {
      const qIdx = trimmed.indexOf('?');
      const qs = new URLSearchParams(qIdx >= 0 ? trimmed.slice(qIdx + 1) : trimmed);
      if (qs.get('s')) trimmed = qs.get('s');
    } catch {
      // fall through
    }
  }
  try {
    if (trimmed.startsWith('{')) {
      return normalizeExactState(JSON.parse(trimmed));
    }
    const json = new TextDecoder().decode(base64UrlToBytes(trimmed));
    return normalizeExactState(JSON.parse(json));
  } catch {
    return null;
  }
}
