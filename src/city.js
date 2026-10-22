// City scaffolding: streets, blocks, lots, towers. Pure JS (node-testable).
// Everything is deterministic from the seed — same seed, same city.
import { mulberry32, hash2i, makeNoise2D, fbm2D } from './prng.js';

export const CELL = 150; // metres between street centrelines
export const AVENUE = 74; // width of every 4th street
export const STREET = 30; // width of normal streets

/** Width of the street whose centreline index is `idx`. */
export function streetWidth(idx) {
  return ((idx % 4) + 4) % 4 === 0 ? AVENUE : STREET;
}

/**
 * Instance kinds:
 *   0 wall   — windowed facade
 *   1 slab   — podium / roof / machine box (sparse windows)
 *   2 mast   — antenna (no windows)
 *   3 band   — emissive ring/band (landmark trim)
 */
export const KIND = { WALL: 0, SLAB: 1, MAST: 2, BAND: 3 };

/** Landmark (place of interest) silhouettes — built from three.js primitives in scene.js. */
export const LM_KINDS = ['arch', 'spire', 'dome', 'mast', 'crown', 'needle'];

const LM_NAMES = {
  arch: ['Meridian Gate', 'Sunset Arc', 'Harbor Arch', 'The Gateway', 'Twin Curve', 'Old Mill Arch'],
  spire: ['Zenith Spire', 'Aurora Spire', 'Skyline Needle', 'Pillar of Dawn', 'Vantage Spire', 'The Obelisk'],
  dome: ['Atlas Dome', 'Civic Rotunda', 'Weather Dome', 'Grand Conservatory', 'Solarium', 'The Vault'],
  mast: ['Signal Crown', 'Broadcast One', 'Relay Tower', 'North Mast', 'Sky Radio', 'The Aerial'],
  crown: ['Imperial Terrace', 'Regalia Tower', 'Stepped Palace', 'Court of Blocks', 'The Ziggurat', 'High Terrace'],
  needle: ['Needle Nine', 'Orbital Needle', 'Slim Jim', 'The Lancet', 'Pin Tower', 'Vector Needle'],
};

/** Public-space kinds — living, lit, low-rise places (geometry lives in scene.js). */
export const PLACE_KINDS = ['market', 'plaza', 'park', 'fair'];

const PLACE_NAMES = {
  market: ['Night Market', 'Lantern Bazaar', 'Spice Row', 'The Exchange', 'Covered Market', 'Ember Stalls'],
  plaza: ['Signal Plaza', 'Founders Square', 'Civic Plaza', 'The Forum', 'Assembly Ground', 'Echo Square'],
  park: ['Hanging Gardens', 'The Terraces', 'Light Grove', 'Quiet Grounds', 'Sky Park', 'The Ramble'],
  fair: ['Midway Fair', 'Carnival Strip', 'The Promenade', 'Rideside', 'Neon Midway', 'Festival Row'],
};

/**
 * Grow the city.
 * @param {number} seed
 * @param {number} radius blocks each way from the centre
 * @returns flat instance arrays + landmarks (POIs) + vehicle lanes + beacon lights
 */
export function generateCity(seed = 4417, radius = 13) {
  const noise = makeNoise2D(seed ^ 0x9e3779b9);
  const items = [];
  const beacons = [];
  let towers = 0;

  const push = (x, y, z, w, h, d, s, kind) => {
    items.push(x, y, z, w, h, d, s, kind);
  };
  const pushBeacon = (x, y, z, r = 0) => beacons.push({ x, y, z, phase: r, r });

  // A few landmark spires, placed by hash so they are stable per seed.
  const spireCells = new Set();
  const spireCount = 3 + Math.floor(hash2i(7, 7, seed) * 3);
  for (let k = 0; k < spireCount; k++) {
    const bi = Math.floor(hash2i(k, 11, seed) * (radius * 2)) - radius;
    const bj = Math.floor(hash2i(k, 23, seed) * (radius * 2)) - radius;
    spireCells.add(bi + ',' + bj);
  }

  // Named landmarks (places of interest): hero arch near the centre + a
  // scattered handful. Their blocks are left empty of ordinary towers.
  const landmarks = [];
  const lmCells = new Map();
  const heroKind = 'arch';
  addLandmarkData(landmarks, lmCells, heroKind, 0, 0, seed, true);
  const lmCount = 4 + Math.floor(hash2i(3, 17, seed) * 3); // 4..6 more
  for (let k = 0; k < lmCount; k++) {
    const bi = Math.floor(hash2i(k, 101, seed) * (radius * 2)) - radius;
    const bj = Math.floor(hash2i(k, 211, seed) * (radius * 2)) - radius;
    const key = bi + ',' + bj;
    if (lmCells.has(key) || spireCells.has(key) || (bi === 0 && bj === 0)) continue;
    const kind = LM_KINDS[Math.floor(hash2i(k, 5, seed) * LM_KINDS.length) % LM_KINDS.length];
    addLandmarkData(landmarks, lmCells, kind, bi, bj, seed, false);
  }

  // Public spaces: markets, plazas, parks, fairs — lit, living places.
  const places = [];
  const plCount = 3 + Math.floor(hash2i(29, 31, seed) * 3); // 3..5
  for (let k = 0; k < plCount; k++) {
    const bi = Math.floor(hash2i(k, 307, seed) * (radius * 2)) - radius;
    const bj = Math.floor(hash2i(k, 401, seed) * (radius * 2)) - radius;
    const key = bi + ',' + bj;
    if (lmCells.has(key) || spireCells.has(key) || (bi === 0 && bj === 0)) continue;
    const kind = PLACE_KINDS[Math.floor(hash2i(k, 61, seed) * PLACE_KINDS.length) % PLACE_KINDS.length];
    addPlaceData(places, lmCells, pushBeacon, kind, bi, bj, seed);
  }

  for (let i = -radius; i < radius; i++) {
    for (let j = -radius; j < radius; j++) {
      const x0 = i * CELL + streetWidth(i) / 2;
      const x1 = (i + 1) * CELL - streetWidth(i + 1) / 2;
      const z0 = j * CELL + streetWidth(j) / 2;
      const z1 = (j + 1) * CELL - streetWidth(j + 1) / 2;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;

      // Per-block RNG: independent of iteration order.
      const rand = mulberry32(hash2i(i, j, seed ^ 0x51ed270b) * 4294967296);
      const h01 = fbm2D(noise, cx / 1150, cz / 1150, 3); // district height field

      if (lmCells.has(i + ',' + j)) continue; // landmark block — see landmarks[]
      if (spireCells.has(i + ',' + j)) {
        addSpire(push, pushBeacon, rand, cx, cz, h01);
        towers++;
        continue;
      }

      // Split the block into lots (jittered grid, 2–4 per axis).
      const nx = 2 + Math.floor(rand() * (rand() < 0.25 ? 1 : 3));
      const nz = 2 + Math.floor(rand() * (rand() < 0.25 ? 1 : 3));
      const xs = splitSpan(x0, x1, nx, rand);
      const zs = splitSpan(z0, z1, nz, rand);

      for (let a = 0; a < nx; a++) {
        for (let b = 0; b < nz; b++) {
          // Occasional empty lot -> a gap/plaza in the block.
          if (a + 1 < nx && rand() < 0.12) continue;
          if (b + 1 < nz && rand() < 0.12) continue;
          addTower(push, pushBeacon, rand, xs[a], xs[a + 1], zs[b], zs[b + 1], h01);
          towers++;
        }
      }
    }
  }

  // Landmark top beacons.
  for (const lm of landmarks) {
    pushBeacon(lm.x, lm.h + 6, lm.z, hash2i(lm.bi + 5, lm.bj + 9, seed));
  }

  const n = items.length / 8;
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const z = new Float32Array(n);
  const w = new Float32Array(n);
  const h = new Float32Array(n);
  const d = new Float32Array(n);
  const s = new Float32Array(n);
  const kind = new Float32Array(n);
  let maxY = 0;
  for (let k = 0; k < n; k++) {
    x[k] = items[k * 8 + 0];
    y[k] = items[k * 8 + 1];
    z[k] = items[k * 8 + 2];
    w[k] = items[k * 8 + 3];
    h[k] = items[k * 8 + 4];
    d[k] = items[k * 8 + 5];
    s[k] = items[k * 8 + 6];
    kind[k] = items[k * 8 + 7];
    maxY = Math.max(maxY, y[k] + h[k] / 2);
  }

  const lanes = makeLanes(seed, radius);
  const lamps = makeLamps(seed, radius);
  return { seed, radius, count: n, towers, maxY, x, y, z, w, h, d, s, kind, landmarks, places, lanes, beacons, lamps };
}

/** Street lamps along both sides of every avenue — the night grid, lit. */
function makeLamps(seed, radius) {
  const lamps = [];
  const span = radius * CELL + CELL * 0.5;
  const R = (a, b) => hash2i(a, b, seed ^ 0x51e9a3c7);
  // avenues sit at street indices divisible by 4 (see streetWidth)
  const start = -Math.floor(radius / 4) * 4;
  for (let a = start; a <= radius; a += 4) {
    const p = a * CELL;
    for (let z = -span; z <= span; z += 58) {
      const j1 = (R(a * 3 + 1, Math.round(z)) - 0.5) * 6;
      const j2 = (R(a * 3 + 2, Math.round(z)) - 0.5) * 6;
      lamps.push({ x: p + 11 + j1, y: 7.5, z: z + j2 });
      lamps.push({ x: p - 11 + j2, y: 7.5, z: z + j1 });
    }
    if (R(a, 77) < 0.6) {
      for (let x = -span; x <= span; x += 58) {
        const j1 = (R(Math.round(x), a * 3 + 3) - 0.5) * 6;
        lamps.push({ x: x + j1, y: 7.5, z: p + 11 + j1 * 0.5 });
        lamps.push({ x: x - j1 * 0.5, y: 7.5, z: p - 11 });
      }
    }
  }
  return lamps;
}

/** One named landmark record (geometry lives in scene.js). */
function addLandmarkData(landmarks, lmCells, kind, bi, bj, seed, hero) {
  const cx = bi * CELL + CELL / 2;
  const cz = bj * CELL + CELL / 2;
  const kIdx = Math.max(0, LM_KINDS.indexOf(kind));
  const rnd = (salt) => hash2i(bi + salt, bj + salt * 3, seed ^ (kIdx * 7919));
  const r0 = rnd(13);
  const r1 = rnd(29);
  const pool = LM_NAMES[kind];
  let name = pool[Math.floor(rnd(47) * pool.length) % pool.length];
  // keep names unique within a city
  for (let n = 0; n < pool.length && landmarks.some((l) => l.name === name); n++) {
    name = pool[(pool.indexOf(name) + 1) % pool.length];
  }
  const m = hero ? 1.5 : 1.25; // monumental by default
  let r = 20;
  let h = 200;
  if (kind === 'arch') { r = (38 + r0 * 26) * m; h = (240 + r1 * 190) * m; }
  else if (kind === 'spire') { r = (15 + r0 * 11) * 1.15; h = (380 + r1 * 280) * 1.2; }
  else if (kind === 'dome') { r = (44 + r0 * 30) * m; h = (110 + r1 * 110) * 1.15; }
  else if (kind === 'mast') { r = 9 + r0 * 5; h = (400 + r1 * 240) * 1.15; }
  else if (kind === 'crown') { r = (34 + r0 * 22) * m; h = (280 + r1 * 230) * 1.2; }
  else { r = (11 + r0 * 9) * 1.1; h = (430 + r1 * 300) * 1.15; }
  landmarks.push({
    kind, name, x: cx, z: cz, r, h,
    rot: rnd(71) * Math.PI * 2,
    hero: !!hero, bi, bj,
    colorSeed: rnd(83),
  });
  lmCells.set(bi + ',' + bj, true);
}

/** One public-space record + a ring of string lights around it. */
function addPlaceData(places, lmCells, pushBeacon, kind, bi, bj, seed) {
  const cx = bi * CELL + CELL / 2;
  const cz = bj * CELL + CELL / 2;
  const kIdx = Math.max(0, PLACE_KINDS.indexOf(kind));
  const rnd = (salt) => hash2i(bi + salt * 5, bj + salt * 7, seed ^ (kIdx * 104729));
  const pool = PLACE_NAMES[kind];
  let name = pool[Math.floor(rnd(19) * pool.length) % pool.length];
  for (let n = 0; n < pool.length && places.some((l) => l.name === name); n++) {
    name = pool[(pool.indexOf(name) + 1) % pool.length];
  }
  const r = 52 + rnd(23) * 26;
  places.push({
    kind, name, x: cx, z: cz, r,
    rot: rnd(31) * Math.PI * 2,
    bi, bj,
    colorSeed: rnd(37),
    seed: rnd(41),
  });
  lmCells.set(bi + ',' + bj, true);

  // string lights around the perimeter + a centre glow
  const n = 10 + Math.floor(rnd(43) * 8);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pushBeacon(cx + Math.cos(a) * r * 0.92, 9 + rnd(47 + i) * 7, cz + Math.sin(a) * r * 0.92, (i * 0.618) % 1);
  }
  pushBeacon(cx, 14 + rnd(53) * 10, cz, rnd(59));
}

/** Air and ground traffic lanes: straight runs the vehicles loop along. */
function makeLanes(seed, radius) {
  const lanes = [];
  const span = radius * CELL + CELL * 0.6;
  const R = (a, b) => hash2i(a, b, seed ^ 0x2c1b3e5d);

  // Air corridors: two axes at four altitude bands.
  const bands = [85, 165, 255, 355];
  for (let k = 0; k < bands.length; k++) {
    const y = bands[k] + R(k, 1) * 40;
    const off1 = (R(k, 2) - 0.5) * span * 0.85;
    const off2 = (R(k, 3) - 0.5) * span * 0.85;
    lanes.push({ x1: -span, z1: off1, x2: span, z2: off1 * 0.35, y, speed: 130 + R(k, 4) * 150 });
    lanes.push({ x1: span, z1: off2 * 0.35, x2: -span, z2: off2, y: y + 12, speed: 130 + R(k, 5) * 150 });
    lanes.push({ x1: off1 * 0.4, z1: -span, x2: off1 * 0.9, z2: span, y: y + 24, speed: 120 + R(k, 6) * 160 });
    lanes.push({ x1: off2 * 0.9, z1: span, x2: off2 * 0.4, z2: -span, y: y + 6, speed: 120 + R(k, 7) * 160 });
  }

  // Ground traffic on every 4th street (avenues), both directions.
  for (let a = -radius; a <= radius; a += 4) {
    const p = a * CELL;
    if (R(a, 11) < 0.25) continue;
    lanes.push({ x1: p + 9, z1: -span, x2: p + 9, z2: span, y: 5.5, speed: 55 + R(a, 12) * 45 });
    lanes.push({ x1: p - 9, z1: span, x2: p - 9, z2: -span, y: 5.5, speed: 55 + R(a, 13) * 45 });
    if (R(a, 14) < 0.5) {
      lanes.push({ x1: -span, z1: p + 9, x2: span, z2: p + 9, y: 5.5, speed: 55 + R(a, 15) * 45 });
      lanes.push({ x1: span, z1: p - 9, x2: -span, z2: p - 9, y: 5.5, speed: 55 + R(a, 16) * 45 });
    }
  }
  return lanes;
}

/** Split [a,b] into n spans with jittered interior cuts. */
function splitSpan(a, b, n, rand) {
  const out = [a];
  for (let i = 1; i < n; i++) {
    const t = i / n + (rand() - 0.5) * (0.55 / n);
    out.push(a + (b - a) * t);
  }
  out.push(b);
  return out;
}

/** One tower: stacked segments with setbacks, podium, roof clutter, mast. */
function addTower(push, pushBeacon, rand, x0, x1, z0, z1, h01) {
  const w = x1 - x0;
  const d = z1 - z0;
  if (w < 12 || d < 12) return;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;

  const floorH = rand() < 0.3 ? 3.1 : rand() < 0.7 ? 3.6 : 4.4;
  let H = (24 + 520 * Math.pow(h01, 1.35)) * (0.5 + rand() * 1.05);
  if (rand() < 0.05) H *= 1.5 + rand() * 0.9; // rare spire-ish
  H = Math.max(28, Math.min(840, H));
  H = Math.round(H / floorH) * floorH;

  const nSeg = 2 + Math.floor(rand() * 4);
  const share = [];
  let total = 0;
  for (let i = 0; i < nSeg; i++) {
    const s = i === 0 ? 1.2 + rand() * 0.8 : 0.6 + rand() * 0.9;
    share.push(s);
    total += s;
  }

  let y = 0;
  let iw = 0;
  let id = 0;
  for (let i = 0; i < nSeg; i++) {
    const segH = (H * share[i]) / total;
    // Setbacks: step in more near the top.
    if (i > 0) {
      const t = i / nSeg;
      iw += rand() * (3 + t * 14);
      id += rand() * (3 + t * 14);
    }
    const sw = Math.max(10, w - iw * 2);
    const sd = Math.max(10, d - id * 2);
    push(cx, y + segH / 2, cz, sw, segH, sd, rand(), KIND.WALL);
    y += segH;

    // Machine boxes on some segment tops.
    if (rand() < 0.35) {
      const m = 1 + Math.floor(rand() * 2);
      for (let k = 0; k < m; k++) {
        const mw = 4 + rand() * Math.min(12, sw * 0.3);
        const md = 4 + rand() * Math.min(12, sd * 0.3);
        const mh = 3 + rand() * 7;
        push(
          cx + (rand() - 0.5) * Math.max(0, sw - mw - 4),
          y + mh / 2,
          cz + (rand() - 0.5) * Math.max(0, sd - md - 4),
          mw, mh, md, rand(), KIND.SLAB
        );
      }
    }
  }

  // Street-facing podium.
  if (rand() < 0.45 && Math.min(w, d) > 22) {
    const ph = 8 + rand() * 13;
    push(cx, ph / 2, cz, w * 1.02, ph, d * 1.02, rand(), KIND.SLAB);
  }

  // Roof slab + mast + aviation light.
  const tw = Math.max(10, w - iw * 2) * 0.92;
  const td = Math.max(10, d - id * 2) * 0.92;
  push(cx, y + 1.1, cz, tw, 2.2, td, rand(), KIND.SLAB);
  if (H > 170 && rand() < 0.7) {
    const ah = 12 + rand() * 40;
    push(cx, y + 2.2 + ah / 2, cz, 1.6, ah, 1.6, rand(), KIND.MAST);
    push(cx, y + 2.2 + ah + 0.7, cz, 1.1, 1.4, 1.1, rand(), KIND.BAND);
    pushBeacon(cx, y + 2.2 + ah + 1.6, cz, rand());
  }
}

/** Landmark: tall tapering stack with emissive bands and a long mast. */
function addSpire(push, pushBeacon, rand, cx, cz, h01) {
  const H = 520 + h01 * 380 + rand() * 120;
  const r0 = 22 + rand() * 12;
  const nSeg = 6 + Math.floor(rand() * 3);
  let y = 0;
  for (let i = 0; i < nSeg; i++) {
    const segH = H / nSeg;
    const t = i / (nSeg - 1);
    const r = r0 * (1 - t * 0.62) * (0.92 + rand() * 0.16);
    push(cx, y + segH / 2, cz, r * 2, segH, r * 2, rand(), KIND.WALL);
    y += segH;
    if (i % 2 === 1) {
      push(cx, y + 0.8, cz, r * 2.35, 1.6, r * 2.35, rand(), KIND.BAND);
    }
  }
  push(cx, y + 2, cz, r0 * 0.9, 4, r0 * 0.9, rand(), KIND.BAND);
  const ah = 60 + rand() * 70;
  push(cx, y + 4 + ah / 2, cz, 2, ah, 2, rand(), KIND.MAST);
  push(cx, y + 4 + ah + 1, cz, 1.6, 2, 1.6, rand(), KIND.BAND);
  pushBeacon(cx, y + 4 + ah + 2.2, cz, rand());
}
