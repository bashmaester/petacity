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

const clamp01 = (x) => Math.max(0, Math.min(1, x));

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

/**
 * District archetypes — 3×3-block quarters that share a character, so the
 * city has coherent downtown / sparse / monolith / low-town / rift areas
 * instead of the same randomness everywhere.
 */
export const DISTRICT_KINDS = ['dense', 'sparse', 'towers', 'mono', 'lowtown', 'rift'];

const DPARAMS = {
  // skip: whole-block gap chance · hMul/wMul: size · lots: max lots per axis
  // styles: facade mix (0 normal, 1 outline-glow, 2 sparse monolith) · mono: slab chance
  dense:   { skip: 0.10, hMul: 1.00, wMul: 1.00, lots: 3, styles: [0, 0, 0, 0, 1, 2], mono: 0.00, clutter: 1.0 },
  sparse:  { skip: 0.42, hMul: 0.62, wMul: 1.05, lots: 3, styles: [0, 0, 2, 2, 1, 0], mono: 0.10, clutter: 0.7 },
  towers:  { skip: 0.20, hMul: 1.38, wMul: 0.72, lots: 2, styles: [0, 0, 0, 1, 0, 1], mono: 0.00, clutter: 0.8 },
  mono:    { skip: 0.16, hMul: 0.92, wMul: 1.15, lots: 3, styles: [1, 1, 2, 2, 0, 1], mono: 0.75, clutter: 0.5 },
  lowtown: { skip: 0.06, hMul: 0.20, wMul: 1.00, lots: 4, styles: [0, 0, 2, 0, 2, 0], mono: 0.05, clutter: 1.7 },
  rift:    { skip: 0.58, hMul: 1.10, wMul: 0.55, lots: 2, styles: [1, 1, 0, 1, 2, 1], mono: 0.12, clutter: 0.35 },
};

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

  const push = (x, y, z, w, h, d, s, kind, style = 0) => {
    items.push(x, y, z, w, h, d, s, kind, style);
  };
  const pushBeacon = (x, y, z, r = 0) => beacons.push({ x, y, z, phase: r, r });
  const bills = [];

  // Voronoi-ish structure: relaxed sites give the city its large-scale
  // division (water, parks, cores) and break the pure grid.
  const sites = makeSites(seed, radius);
  const water = makeWaters(seed, sites, radius);
  const boulevards = makeBoulevards(seed, radius);
  const inWater = (x, z) => water.some((w) => pointInPoly(x, z, w.pts));
  const nearBoulevard = (x, z) => boulevards.some((b) => distToSeg(x, z, b.x1, b.z1, b.x2, b.z2) < 52);

  // Districts: coherent quarters via a smooth noise field + hash jitter.
  const DS = 3; // blocks per district side
  const dMap = new Map();
  const districts = [];
  const districtOf = (i, j) => {
    const di = Math.floor((i + 1024) / DS);
    const dj = Math.floor((j + 1024) / DS);
    const key = di + ',' + dj;
    let d = dMap.get(key);
    if (!d) {
      const v = clamp01(fbm2D(noise, di * 0.62, dj * 0.62, 2));
      const jitter = hash2i(di, dj, seed ^ 0x2f1a39);
      let idx = Math.floor((v * 0.72 + jitter * 0.28) * DISTRICT_KINDS.length);
      idx = Math.max(0, Math.min(DISTRICT_KINDS.length - 1, idx));
      const kind = DISTRICT_KINDS[idx];
      d = { di, dj, kind, ...DPARAMS[kind] };
      dMap.set(key, d);
      districts.push({ di, dj, kind });
    }
    return d;
  };

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
      const d = districtOf(i, j);

      if (lmCells.has(i + ',' + j)) continue; // landmark block — see landmarks[]
      if (spireCells.has(i + ',' + j)) {
        addSpire(push, pushBeacon, rand, cx, cz, h01, d);
        towers++;
        continue;
      }
      // sparse / rift quarters leave whole blocks empty — parks, gaps, voids
      if (rand() < d.skip * 0.55) continue;
      // water bodies and diagonal boulevards carve the grid up
      if (inWater(cx, cz) || nearBoulevard(cx, cz)) continue;

      // Split the block into lots (jittered grid, 2–4 per axis).
      const nx = 2 + Math.floor(rand() * (rand() < 0.25 ? 1 : Math.max(1, d.lots - 1)));
      const nz = 2 + Math.floor(rand() * (rand() < 0.25 ? 1 : Math.max(1, d.lots - 1)));
      const xs = splitSpan(x0, x1, nx, rand);
      const zs = splitSpan(z0, z1, nz, rand);

      for (let a = 0; a < nx; a++) {
        for (let b = 0; b < nz; b++) {
          // Occasional empty lot -> a gap/plaza in the block.
          if (a + 1 < nx && rand() < 0.08 + d.skip * 0.5) continue;
          if (b + 1 < nz && rand() < 0.08 + d.skip * 0.5) continue;
          addTower(push, pushBeacon, (b) => bills.push(b), rand, xs[a], xs[a + 1], zs[b], zs[b + 1], h01, d);
          towers++;
        }
      }
    }
  }

  // Landmark top beacons.
  for (const lm of landmarks) {
    pushBeacon(lm.x, lm.h + 6, lm.z, hash2i(lm.bi + 5, lm.bj + 9, seed));
  }

  const n = items.length / 9;
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const z = new Float32Array(n);
  const w = new Float32Array(n);
  const h = new Float32Array(n);
  const d = new Float32Array(n);
  const s = new Float32Array(n);
  const kind = new Float32Array(n);
  const style = new Float32Array(n);
  let maxY = 0;
  for (let k = 0; k < n; k++) {
    x[k] = items[k * 9 + 0];
    y[k] = items[k * 9 + 1];
    z[k] = items[k * 9 + 2];
    w[k] = items[k * 9 + 3];
    h[k] = items[k * 9 + 4];
    d[k] = items[k * 9 + 5];
    s[k] = items[k * 9 + 6];
    kind[k] = items[k * 9 + 7];
    style[k] = items[k * 9 + 8];
    maxY = Math.max(maxY, y[k] + h[k] / 2);
  }

  const lanes = makeLanes(seed, radius, boulevards);
  const lamps = makeLamps(seed, radius);
  const trees = makeTrees(seed, radius, water, lmCells, places);
  return {
    seed, radius, count: n, towers, maxY, x, y, z, w, h, d, s, kind, style,
    districts, landmarks, places, lanes, beacons, lamps,
    sites, water, boulevards, trees, bills,
  };
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

/**
 * Traffic lanes as gentle quadratic béziers across multiple altitude layers:
 * ground streets, low/mid/high air corridors, sweeping ring loops and slow
 * blimp routes — plus diagonal boulevards on the ground.
 */
function makeLanes(seed, radius, boulevards = []) {
  const lanes = [];
  const span = radius * CELL + CELL * 0.6;
  const R = (a, b) => hash2i(a, b, seed ^ 0x2c1b3e5d);

  const pushLane = (x1, z1, x2, z2, y, speed, layer, bow = 0) => {
    const mx = (x1 + x2) / 2;
    const mz = (z1 + z2) / 2;
    const dx = x2 - x1;
    const dz = z2 - z1;
    const len = Math.hypot(dx, dz) || 1;
    const px = -dz / len;
    const pz = dx / len;
    const b = bow * len;
    lanes.push({ x1, z1, cx: mx + px * b, cz: mz + pz * b, x2, z2, y, speed, layer });
  };

  // Air corridors: two axes at five altitude bands, gently curved.
  const bands = [[75, 'air-low'], [155, 'air-mid'], [245, 'air-mid'], [345, 'air-high'], [435, 'air-high']];
  for (let k = 0; k < bands.length; k++) {
    const y = bands[k][0] + R(k, 1) * 30;
    const layer = bands[k][1];
    const off1 = (R(k, 2) - 0.5) * span * 0.85;
    const off2 = (R(k, 3) - 0.5) * span * 0.85;
    pushLane(-span, off1, span, off1 * 0.35, y, 130 + R(k, 4) * 150, layer, (R(k, 8) - 0.5) * 0.16);
    pushLane(span, off2 * 0.35, -span, off2, y + 12, 130 + R(k, 5) * 150, layer, (R(k, 9) - 0.5) * 0.16);
    pushLane(off1 * 0.4, -span, off1 * 0.9, span, y + 24, 120 + R(k, 6) * 160, layer, (R(k, 10) - 0.5) * 0.16);
    pushLane(off2 * 0.9, span, off2 * 0.4, -span, y + 6, 120 + R(k, 7) * 160, layer, (R(k, 11) - 0.5) * 0.16);
  }

  // Ring loops around the core — curved skimmer highways.
  for (let ring = 0; ring < 2; ring++) {
    const rr = (0.35 + ring * 0.32) * span;
    const y = 110 + ring * 150 + R(ring, 31) * 30;
    const layer = ring === 0 ? 'air-low' : 'air-mid';
    for (let s = 0; s < 4; s++) {
      const a0 = (s / 4) * Math.PI * 2;
      const a1 = ((s + 1) / 4) * Math.PI * 2;
      pushLane(Math.cos(a0) * rr, Math.sin(a0) * rr, Math.cos(a1) * rr, Math.sin(a1) * rr,
        y, 90 + R(ring, 32) * 60, layer, 0.3);
    }
  }

  // Blimp lanes — very high, very slow, big lazy curves.
  for (let k = 0; k < 3; k++) {
    const y = 520 + k * 95 + R(k, 21) * 40;
    pushLane(-span * 1.1, (R(k, 22) - 0.5) * span * 1.4, span * 1.1, (R(k, 23) - 0.5) * span * 1.4,
      y, 38 + R(k, 24) * 22, 'blimp', (R(k, 25) - 0.5) * 0.45);
  }

  // Ground traffic on every 4th street (avenues), both directions.
  for (let a = -radius; a <= radius; a += 4) {
    const p = a * CELL;
    if (R(a, 11) < 0.25) continue;
    pushLane(p + 9, -span, p + 9, span, 5.5, 55 + R(a, 12) * 45, 'ground');
    pushLane(p - 9, span, p - 9, -span, 5.5, 55 + R(a, 13) * 45, 'ground');
    if (R(a, 14) < 0.5) {
      pushLane(-span, p + 9, span, p + 9, 5.5, 55 + R(a, 15) * 45, 'ground');
      pushLane(span, p - 9, -span, p - 9, 5.5, 55 + R(a, 16) * 45, 'ground');
    }
  }

  // Diagonal boulevards — long fast ground runs cutting the grid.
  for (let k = 0; k < boulevards.length; k++) {
    const b = boulevards[k];
    pushLane(b.x1 + 10, b.z1 + 6, b.x2 + 10, b.z2 + 6, 5.5, 90 + R(k, 41) * 50, 'ground', 0.04);
    pushLane(b.x1 - 10, b.z1 - 6, b.x2 - 10, b.z2 - 6, 5.5, 90 + R(k, 42) * 50, 'ground', -0.04);
  }
  return lanes;
}

/* ---------------------------------------------- voronoi structure helpers */

/** Jittered, lightly-relaxed sites: the city's large-scale division. */
function makeSites(seed, radius) {
  const span = radius * CELL * 0.85;
  const n = 8 + Math.floor(hash2i(3, 91, seed) * 7);
  const pts = [];
  for (let k = 0; k < n; k++) {
    pts.push({
      x: (hash2i(k, 71, seed) - 0.5) * 2 * span,
      z: (hash2i(k, 83, seed) - 0.5) * 2 * span,
      r: hash2i(k, 97, seed),
    });
  }
  // one Lloyd relaxation pass over a coarse sample grid
  const step = span / 6;
  const acc = pts.map(() => ({ x: 0, z: 0, n: 0 }));
  for (let x = -span; x <= span; x += step) {
    for (let z = -span; z <= span; z += step) {
      let best = 0;
      let bd = Infinity;
      for (let k = 0; k < pts.length; k++) {
        const d = (pts[k].x - x) ** 2 + (pts[k].z - z) ** 2;
        if (d < bd) { bd = d; best = k; }
      }
      acc[best].x += x;
      acc[best].z += z;
      acc[best].n++;
    }
  }
  const kinds = ['core', 'park', 'core', 'water', 'sparse', 'civic'];
  return pts.map((p, k) => {
    const a = acc[k];
    return {
      x: a.n ? a.x / a.n : p.x,
      z: a.n ? a.z / a.n : p.z,
      kind: p.r < 0.18 ? 'water' : kinds[Math.floor(hash2i(k, 113, seed) * kinds.length) % kinds.length],
      r: p.r,
    };
  });
}

/** 1–3 irregular water bodies around the water-kind sites. */
function makeWaters(seed, sites, radius) {
  const out = [];
  const waterSites = sites.filter((s) => s.kind === 'water');
  const limit = Math.min(waterSites.length, 1 + Math.floor(hash2i(5, 61, seed) * 2));
  for (let k = 0; k < limit; k++) {
    const s = waterSites[k];
    const rad = 160 + hash2i(k, 67, seed) * 260;
    const pts = [];
    const m = 10 + Math.floor(hash2i(k, 71, seed) * 6);
    for (let i = 0; i < m; i++) {
      const a = (i / m) * Math.PI * 2;
      const rr = rad * (0.55 + hash2i(k * 31 + i, 79, seed) * 0.8);
      pts.push([s.x + Math.cos(a) * rr, s.z + Math.sin(a) * rr]);
    }
    out.push({ x: s.x, z: s.z, r: rad, pts, seed: hash2i(k, 89, seed) });
  }
  return out;
}

/** 1–2 diagonal boulevards slicing across the grid. */
function makeBoulevards(seed, radius) {
  const span = radius * CELL * 1.15;
  const out = [];
  const n = 1 + Math.floor(hash2i(9, 41, seed) * 2);
  for (let k = 0; k < n; k++) {
    const a = hash2i(k, 43, seed) * Math.PI;
    const cx = (hash2i(k, 47, seed) - 0.5) * span * 0.4;
    const cz = (hash2i(k, 53, seed) - 0.5) * span * 0.4;
    out.push({
      x1: cx - Math.cos(a) * span, z1: cz - Math.sin(a) * span,
      x2: cx + Math.cos(a) * span, z2: cz + Math.sin(a) * span,
    });
  }
  return out;
}

/** Trees — real trees or sybernetic illuminators depending on the look. */
function makeTrees(seed, radius, water, lmCells, places) {
  const trees = [];
  const span = radius * CELL + CELL * 0.4;
  const inWater = (x, z) => water.some((w) => pointInPoly(x, z, w.pts));
  const placeNear = (x, z) => places.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + 26);
  let k = 0;
  // street trees along the avenues
  for (let a = -radius; a <= radius; a += 4) {
    const p = a * CELL;
    for (let z = -span; z <= span; z += 64) {
      for (const sx of [1, -1]) {
        const x = p + sx * 24 + (hash2i(k, 131, seed) - 0.5) * 8;
        const zz = z + (hash2i(k, 137, seed) - 0.5) * 12;
        k++;
        if (Math.abs(x) > span || Math.abs(zz) > span) continue;
        if (inWater(x, zz) || placeNear(x, zz)) continue;
        const cell = Math.floor(x / CELL) + ',' + Math.floor(zz / CELL);
        if (lmCells.has(cell)) continue;
        if (hash2i(k, 139, seed) < 0.35) continue;
        trees.push({ x, z: zz, h: 9 + hash2i(k, 149, seed) * 9, seed: hash2i(k, 151, seed) });
      }
    }
  }
  return trees;
}

function pointInPoly(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i];
    const [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function distToSeg(px, pz, x1, z1, x2, z2) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (pz - z1) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - (x1 + t * dx), pz - (z1 + t * dz));
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

/**
 * One building: variant chosen by district archetype —
 * stepped tower (default), monolith slab, rift spindle, or twin shafts with
 * a skybridge. Facade style: 0 normal windowed, 1 outline-glow, 2 sparse.
 */
function addTower(push, pushBeacon, pushBill, rand, x0, x1, z0, z1, h01, d) {
  const w0 = x1 - x0;
  const d0 = z1 - z0;
  if (w0 < 12 || d0 < 12) return;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const w = Math.max(11, w0 * d.wMul);
  const dp = Math.max(11, d0 * d.wMul);
  const style = d.styles[Math.floor(rand() * d.styles.length) % d.styles.length];

  const floorH = rand() < 0.3 ? 3.1 : rand() < 0.7 ? 3.6 : 4.4;
  let H = (24 + 520 * Math.pow(h01, 1.35)) * (0.5 + rand() * 1.05) * d.hMul;
  if (rand() < 0.05) H *= 1.5 + rand() * 0.9; // rare spire-ish
  H = Math.max(16, Math.min(840, H));
  H = Math.round(H / floorH) * floorH;

  // ---- variant: heavy monolith slab (flat top, sparse windows) ----
  if (rand() < d.mono) {
    const mh = Math.max(30, Math.min(520, H * 1.35));
    push(cx, mh / 2, cz, w * 0.94, mh, dp * 0.94, rand(), KIND.WALL, style >= 1 ? style : 2);
    push(cx, mh + 2.2, cz, w * 0.66, 4.4, dp * 0.66, rand(), KIND.SLAB, 2);
    if (rand() < 0.55) {
      const ah = 10 + rand() * 26;
      push(cx + (rand() - 0.5) * w * 0.3, mh + 4.4 + ah / 2, cz, 1.8, ah, 1.8, rand(), KIND.MAST, 2);
      pushBeacon(cx, mh + 4.4 + ah + 1, cz, rand());
    }
    addGrit(push, rand, cx, cz, w, dp, d, 1.2);
    return;
  }

  // ---- variant: rift spindle — very thin, very tall, often outline ----
  if (d.kind === 'rift' && rand() < 0.5) {
    const sw = Math.min(w, dp) * 0.38;
    const sh = Math.max(120, Math.min(900, H * 1.7));
    push(cx, sh / 2, cz, sw, sh, sw, rand(), KIND.WALL, style === 0 ? 1 : style);
    push(cx, sh + 1.5, cz, sw * 1.5, 3, sw * 1.5, rand(), KIND.BAND, 1);
    const ah = 20 + rand() * 50;
    push(cx, sh + 3 + ah / 2, cz, 1.4, ah, 1.4, rand(), KIND.MAST, 1);
    pushBeacon(cx, sh + 3 + ah + 1, cz, rand());
    return;
  }

  // ---- variant: twin shafts + skybridge ----
  if (rand() < 0.16 && w > 34 && dp > 34) {
    const tw = w * 0.32;
    const gap = w * 0.16;
    const th = H * (0.8 + rand() * 0.35);
    for (const sx of [-1, 1]) {
      const tx = cx + sx * (tw / 2 + gap);
      push(tx, th / 2, cz, tw, th, dp * 0.8, rand(), KIND.WALL, style);
      push(tx, th + 1.2, cz, tw * 0.8, 2.4, dp * 0.6, rand(), KIND.SLAB, style);
    }
    // skybridge at ~55% height
    const bh = 7 + rand() * 6;
    push(cx, th * 0.55, cz, w * 0.62, bh, Math.min(dp * 0.42, 16), rand(), KIND.SLAB, style);
    if (th > 150 && rand() < 0.6) {
      push(cx, th + 2, cz, 1.5, 14 + rand() * 22, 1.5, rand(), KIND.MAST, style);
      pushBeacon(cx, th + 18, cz, rand());
    }
    addGrit(push, rand, cx, cz, w, dp, d, 1);
    return;
  }

  // ---- default: stacked segments with setbacks ----
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
    const sd = Math.max(10, dp - id * 2);
    push(cx, y + segH / 2, cz, sw, segH, sd, rand(), KIND.WALL, style);
    y += segH;

    // Machine boxes on some segment tops.
    if (rand() < 0.24 + 0.3 * d.clutter) {
      const m = 1 + Math.floor(rand() * 2 * Math.min(2, d.clutter));
      for (let k = 0; k < m; k++) {
        const mw = 4 + rand() * Math.min(12, sw * 0.3);
        const md = 4 + rand() * Math.min(12, sd * 0.3);
        const mh = 3 + rand() * 7;
        push(
          cx + (rand() - 0.5) * Math.max(0, sw - mw - 4),
          y + mh / 2,
          cz + (rand() - 0.5) * Math.max(0, sd - md - 4),
          mw, mh, md, rand(), KIND.SLAB, style
        );
      }
    }
  }

  // Street-facing podium.
  if (rand() < 0.45 && Math.min(w, dp) > 22) {
    const ph = 8 + rand() * 13;
    push(cx, ph / 2, cz, w * 1.02, ph, dp * 1.02, rand(), KIND.SLAB, style);
  }

  // Roof slab + mast + aviation light.
  const tw = Math.max(10, w - iw * 2) * 0.92;
  const td = Math.max(10, dp - id * 2) * 0.92;
  push(cx, y + 1.1, cz, tw, 2.2, td, rand(), KIND.SLAB, style);
  // illuminated billboards riding the facade of tall towers
  if (H > 180 && rand() < 0.4) {
    const bh = 10 + rand() * 16;
    const bw = Math.min(46, Math.max(14, (rand() < 0.5 ? tw : td) * (0.7 + rand() * 0.5)));
    const by = H * (0.45 + rand() * 0.38);
    const side = rand();
    if (side < 0.5) {
      pushBill({ x: cx + tw / 2 + 1.2, y: by, z: cz, w: 2.4, h: bh, d: bw, seed: rand() });
    } else {
      pushBill({ x: cx, y: by, z: cz + td / 2 + 1.2, w: bw, h: bh, d: 2.4, seed: rand() });
    }
  }
  if (H > 170 && rand() < 0.7) {
    const ah = 12 + rand() * 40;
    push(cx, y + 2.2 + ah / 2, cz, 1.6, ah, 1.6, rand(), KIND.MAST, style);
    push(cx, y + 2.2 + ah + 0.7, cz, 1.1, 1.4, 1.1, rand(), KIND.BAND, style);
    pushBeacon(cx, y + 2.2 + ah + 1.6, cz, rand());
  }
  addGrit(push, rand, cx, cz, w, dp, d, 1);
}

/** Street-level grit: kiosks, sheds, containers and light poles around a lot. */
function addGrit(push, rand, cx, cz, w, dp, d, scale = 1) {
  const n = Math.floor(rand() * 3.2 * d.clutter * scale);
  for (let k = 0; k < n; k++) {
    const gw = 3 + rand() * 7;
    const gd = 3 + rand() * 7;
    const gh = 2.5 + rand() * 6;
    push(
      cx + (rand() - 0.5) * w * 0.98,
      gh / 2,
      cz + (rand() - 0.5) * dp * 0.98,
      gw, gh, gd, rand(), KIND.SLAB, 2
    );
  }
  // occasional light pole with a glowing tip
  if (rand() < 0.3 * d.clutter) {
    const px = cx + (rand() - 0.5) * w;
    const pz = cz + (rand() - 0.5) * dp;
    push(px, 7, pz, 0.8, 14, 0.8, rand(), KIND.MAST, 0);
    push(px, 14.6, pz, 1.6, 1.2, 1.6, rand(), KIND.BAND, 0);
  }
}

/** Landmark: tall tapering stack with emissive bands and a long mast. */
function addSpire(push, pushBeacon, rand, cx, cz, h01, d = { hMul: 1, clutter: 1 }) {
  const H = 520 + h01 * 380 + rand() * 120;
  const r0 = 22 + rand() * 12;
  const style = rand() < 0.35 ? 1 : 0;
  const nSeg = 6 + Math.floor(rand() * 3);
  let y = 0;
  for (let i = 0; i < nSeg; i++) {
    const segH = H / nSeg;
    const t = i / (nSeg - 1);
    const r = r0 * (1 - t * 0.62) * (0.92 + rand() * 0.16);
    push(cx, y + segH / 2, cz, r * 2, segH, r * 2, rand(), KIND.WALL, style);
    y += segH;
    if (i % 2 === 1) {
      push(cx, y + 0.8, cz, r * 2.35, 1.6, r * 2.35, rand(), KIND.BAND, style);
    }
  }
  push(cx, y + 2, cz, r0 * 0.9, 4, r0 * 0.9, rand(), KIND.BAND, style);
  const ah = 60 + rand() * 70;
  push(cx, y + 4 + ah / 2, cz, 2, ah, 2, rand(), KIND.MAST, style);
  push(cx, y + 4 + ah + 1, cz, 1.6, 2, 1.6, rand(), KIND.BAND, style);
  pushBeacon(cx, y + 4 + ah + 2.2, cz, rand());
}
