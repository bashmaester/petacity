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
export const LM_KINDS = ['arch', 'spire', 'dome', 'mast', 'crown', 'needle', 'pyramid', 'cantilever', 'ziggurat'];

const LM_NAMES = {
  arch: ['Meridian Gate', 'Sunset Arc', 'Harbor Arch', 'The Gateway', 'Twin Curve', 'Old Mill Arch'],
  spire: ['Zenith Spire', 'Aurora Spire', 'Skyline Needle', 'Pillar of Dawn', 'Vantage Spire', 'The Obelisk'],
  dome: ['Atlas Dome', 'Civic Rotunda', 'Weather Dome', 'Grand Conservatory', 'Solarium', 'The Vault'],
  mast: ['Signal Crown', 'Broadcast One', 'Relay Tower', 'North Mast', 'Sky Radio', 'The Aerial'],
  crown: ['Imperial Terrace', 'Regalia Tower', 'Stepped Palace', 'Court of Blocks', 'High Terrace', 'Sovereign Crown'],
  needle: ['Needle Nine', 'Orbital Needle', 'Slim Jim', 'The Lancet', 'Pin Tower', 'Vector Needle'],
  pyramid: ['Tyrell Pyramid', 'Solaris Arcology', 'Obsidian Pyramid', 'Apex Tetrahedron', 'Giza Arcology', 'Sun Pyramid'],
  cantilever: ['Skywing Cantilever', 'Overhang Citadel', 'Horizon Cantilever', 'Cloudbridge Wing', 'Aerie Overhang', 'Kestrel Tower'],
  ziggurat: ['Babylon Ziggurat', 'Hanging Terraces', 'Nineveh Steps', 'Cascading Sanctum', 'Etemenanki Vault', 'Seven-Step Ziggurat'],
};

/** Public-space kinds — living, lit, low-rise places (geometry lives in scene.js). */
export const PLACE_KINDS = ['market', 'plaza', 'park', 'fair', 'arena', 'theatre', 'stadium'];

/**
 * District archetypes — 3×3-block quarters that share a character, so the
 * city has coherent downtown / sparse / monolith / low-town / rift areas
 * instead of the same randomness everywhere.
 */
export const DISTRICT_KINDS = ['dense', 'sparse', 'towers', 'mono', 'lowtown', 'rift'];

const DPARAMS = {
  // skip: whole-block gap chance · hMul/wMul: size · lots: max lots per axis
  // styles: facade mix (0 normal, 1 outline-glow, 2 sparse monolith) · mono: slab chance
  dense:   { skip: 0.10, hMul: 1.00, wMul: 1.00, lots: 3, styles: [0, 0, 0, 0, 1, 2], mono: 0.00, clutter: 1.0, rotAmp: 0.08, signs: 0.9 },
  sparse:  { skip: 0.42, hMul: 0.62, wMul: 1.05, lots: 3, styles: [0, 0, 2, 2, 1, 0], mono: 0.10, clutter: 0.7, rotAmp: 0.2, signs: 0.4 },
  towers:  { skip: 0.20, hMul: 1.38, wMul: 0.72, lots: 2, styles: [0, 0, 0, 1, 0, 1], mono: 0.00, clutter: 0.8, rotAmp: 0.05, signs: 0.55 },
  mono:    { skip: 0.16, hMul: 0.92, wMul: 1.15, lots: 3, styles: [1, 1, 2, 2, 0, 1], mono: 0.75, clutter: 0.5, rotAmp: 0.0, signs: 0.3 },
  lowtown: { skip: 0.06, hMul: 0.20, wMul: 1.00, lots: 4, styles: [0, 0, 2, 0, 2, 0], mono: 0.05, clutter: 1.7, rotAmp: 0.3, signs: 1.4 },
  rift:    { skip: 0.58, hMul: 1.10, wMul: 0.55, lots: 2, styles: [1, 1, 0, 1, 2, 1], mono: 0.12, clutter: 0.35, rotAmp: 0.38, signs: 0.25 },
};

const PLACE_NAMES = {
  market: ['Night Market', 'Lantern Bazaar', 'Spice Row', 'The Exchange', 'Covered Market', 'Ember Stalls'],
  plaza: ['Signal Plaza', 'Founders Square', 'Civic Plaza', 'The Forum', 'Assembly Ground', 'Echo Square'],
  park: ['Hanging Gardens', 'The Terraces', 'Light Grove', 'Quiet Grounds', 'Sky Park', 'The Ramble'],
  fair: ['Midway Fair', 'Carnival Strip', 'The Promenade', 'Rideside', 'Neon Midway', 'Festival Row'],
  arena: ['The Arena', 'Iron Circle', 'Grand Ring', 'Combat Hall', 'The Crucible', 'Circle One'],
  theatre: ['Palace Cinema', 'The Rialto', 'Orpheum', 'Electric Theatre', 'Marquee One', 'The Bijou'],
  stadium: ['Olympia Stadium', 'The Colosseum', 'Vector Field', 'Champion Grounds', 'The Bowl', 'Star Stadium'],
};

const MEDIA_NAMES = [
  'Holo Crossing', 'Prism Square', 'Electric Ward', 'Billboard Row', 'Mirage Strip', 'Signal Mile',
];

/**
 * Grow the city.
 * @param {number} seed
 * @param {number} radius blocks each way from the centre
 * @param {number} suburbReach horizon suburb extent multiplier (0 = none, 1 = default horizon sprawl, 2 = vast)
 * @returns flat instance arrays + landmarks (POIs) + vehicle lanes + beacon lights
 */
export function generateCity(seed = 4417, radius = 13, suburbReach = 1.0) {
  const noise = makeNoise2D(seed ^ 0x9e3779b9);
  const items = [];
  const beacons = [];
  let towers = 0;

  const push = (x, y, z, w, h, d, s, kind, style = 0, rot = 0) => {
    items.push(x, y, z, w, h, d, s, kind, style, rot);
  };
  const pushBeacon = (x, y, z, r = 0) => beacons.push({ x, y, z, phase: r, r });
  const bills = [];
  const signs = [];

  // Voronoi-ish structure: relaxed sites give the city its large-scale
  // division (water, parks, cores) and break the pure grid.
  const sites = makeSites(seed, radius);
  const water = makeWaters(seed, sites, radius);
  const boulevards = makeBoulevards(seed, radius);
  const inWater = (x, z) => water.some((w) => pointInPoly(x, z, w.pts));
  const nearBoulevard = (x, z, hw = 52) => boulevards.some((b) => distToSeg(x, z, b.x1, b.z1, b.x2, b.z2) < hw);

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

  // Named landmarks (places of interest): hero monument near the centre +
  // guaranteed signature structures (pyramid, cantilever, ziggurat) and classic spires/domes.
  const landmarks = [];
  const lmCells = new Map();
  const heroPool = ['arch', 'pyramid', 'cantilever', 'ziggurat', 'crown'];
  const heroKind = seed === 4417 ? 'arch' : heroPool[Math.floor(hash2i(2, 19, seed) * heroPool.length) % heroPool.length];
  addLandmarkData(landmarks, lmCells, heroKind, 0, 0, seed, true);

  const mustHaveLm = radius >= 3
    ? ['pyramid', 'cantilever', 'ziggurat'].filter((k) => k !== heroKind)
    : radius >= 2 ? ['pyramid', 'cantilever'].filter((k) => k !== heroKind) : [];
  const extraLmCount = 3 + Math.floor(hash2i(3, 17, seed) * 4); // 3..6 more
  const wantLmKinds = [...mustHaveLm];
  for (let k = 0; k < extraLmCount; k++) {
    wantLmKinds.push(LM_KINDS[Math.floor(hash2i(k, 5, seed) * LM_KINDS.length) % LM_KINDS.length]);
  }
  for (let k = 0; k < wantLmKinds.length; k++) {
    const kind = wantLmKinds[k];
    for (let attempt = 0; attempt < 24; attempt++) {
      const bi = Math.floor(hash2i(k * 19 + attempt, 101, seed) * (radius * 2)) - radius;
      const bj = Math.floor(hash2i(k * 19 + attempt, 211, seed) * (radius * 2)) - radius;
      const key = bi + ',' + bj;
      if (lmCells.has(key) || spireCells.has(key) || (bi === 0 && bj === 0)) continue;
      const lcx = bi * CELL + CELL / 2;
      const lcz = bj * CELL + CELL / 2;
      if (attempt < 18 && (inWater(lcx, lcz) || nearBoulevard(lcx, lcz, 64))) continue;
      addLandmarkData(landmarks, lmCells, kind, bi, bj, seed, false);
      break;
    }
  }

  // Public spaces & grand venues: guarantee an arena, movie theatre and stadium
  // whenever the city is big enough, plus lively markets, plazas, parks & fairs.
  const places = [];
  const featured = radius >= 4 ? ['arena', 'theatre', 'stadium'] : radius >= 2 ? ['arena', 'theatre'] : [];
  const extraCount = 3 + Math.floor(hash2i(29, 31, seed) * 4);
  const wantKinds = [...featured];
  for (let k = 0; k < extraCount; k++) {
    wantKinds.push(PLACE_KINDS[Math.floor(hash2i(k, 61, seed) * PLACE_KINDS.length) % PLACE_KINDS.length]);
  }
  for (let k = 0; k < wantKinds.length; k++) {
    const kind = wantKinds[k];
    const big = kind === 'arena' || kind === 'stadium' || kind === 'theatre';
    // try deterministic candidate blocks until we find an open spot off water/boulevards
    for (let attempt = 0; attempt < 64; attempt++) {
      const spanB = Math.max(1, radius - 1);
      const bi = Math.floor(hash2i(k * 31 + attempt, 307, seed) * (spanB * 2)) - spanB;
      const bj = Math.floor(hash2i(k * 31 + attempt, 401, seed) * (spanB * 2)) - spanB;
      const key = bi + ',' + bj;
      if (lmCells.has(key) || spireCells.has(key) || (Math.abs(bi) <= 1 && Math.abs(bj) <= 1)) continue;
      // big venues prefer a 2x2 superblock without crossing a 4th-street avenue, with 1x1 fallback after 40 tries
      if (big && radius >= 4 && attempt < 42) {
        if (((bi + 1) % 4 + 4) % 4 === 0 || ((bj + 1) % 4 + 4) % 4 === 0) continue;
        if (bi + 1 >= radius || bj + 1 >= radius) continue;
        const subKeys = [key, `${bi + 1},${bj}`, `${bi},${bj + 1}`, `${bi + 1},${bj + 1}`];
        if (subKeys.some((sk) => lmCells.has(sk) || spireCells.has(sk))) continue;
        const scx = (bi + 1) * CELL;
        const scz = (bj + 1) * CELL;
        if (inWater(scx, scz) || nearBoulevard(scx, scz, 110)) continue;
        addPlaceData(places, lmCells, pushBeacon, (s) => signs.push(s), kind, bi, bj, seed, true);
        break;
      } else {
        const scx = bi * CELL + CELL / 2;
        const scz = bj * CELL + CELL / 2;
        if (inWater(scx, scz) || nearBoulevard(scx, scz, 76)) continue;
        addPlaceData(places, lmCells, pushBeacon, (s) => signs.push(s), kind, bi, bj, seed, false);
        break;
      }
    }
  }

  const nearestSite = (x, z) => {
    let best = sites[0];
    let bd = Infinity;
    for (let k = 0; k < sites.length; k++) {
      const dd = (sites[k].x - x) ** 2 + (sites[k].z - z) ** 2;
      if (dd < bd) { bd = dd; best = sites[k]; }
    }
    return best;
  };

  // Dedicated Media / Holo-Ad District: a lively multi-block ward where entire
  // buildings are wrapped floor-to-crown as living billboards & holographic ads.
  const mediaZone = makeMediaZone(seed, radius, inWater, nearBoulevard, lmCells);
  const holos = [];
  const mediaTowers = [];

  const coreSpan = radius * CELL;
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
      // Organic radial + noise-warped boundary so the city silhouette is never a square box
      const warp = (fbm2D(noise, cx / 580 + 7.3, cz / 580 - 4.1, 2) - 0.5) * CELL * 2.8;
      const rNorm = (Math.hypot(cx, cz) + warp) / Math.max(CELL, coreSpan);
      const edgeT = clamp01(1.18 - rNorm * 0.92);
      const blockInMedia = mediaZone && Math.hypot(cx - mediaZone.x, cz - mediaZone.z) <= mediaZone.r;

      if (lmCells.has(i + ',' + j)) continue; // landmark/venue block
      if (spireCells.has(i + ',' + j) && !blockInMedia && rNorm < 0.92 && !inWater(cx, cz) && !nearBoulevard(cx, cz, 68)) {
        addSpire(push, pushBeacon, rand, cx, cz, h01, d);
        towers++;
        continue;
      }
      // Corner blocks outside the organic radial core transition straight into outskirts!
      if (rNorm > 1.06 && !blockInMedia) {
        if (!inWater(cx, cz) && !nearBoulevard(cx, cz, 48)) {
          addOutskirts(push, pushBeacon, (s) => signs.push(s), rand, x0, x1, z0, z1, clamp01(1.32 - rNorm * 0.85));
        }
        continue;
      }
      // sparse / rift / rim quarters leave whole blocks empty — but never inside the Media Ward!
      if (!blockInMedia && rand() < d.skip * 0.55 + (1 - edgeT) * 0.25) continue;
      if (inWater(cx, cz) || (!blockInMedia && nearBoulevard(cx, cz, 56))) continue;

      // Street-level urban realm: raised sidewalk promenade, corner transit kiosks & pedestrian skywalks
      addBlockStreetscape(push, pushBeacon, (sg) => signs.push(sg), rand, i, j, x0, x1, z0, z1, d, blockInMedia, radius, lmCells, inWater);

      const site = nearestSite(cx, cz);
      // Voronoi cell orientation: radial around civic/water/park sites, angled in skewed cells
      const baseAngle = site && site.radial
        ? Math.atan2(cz - site.z, cx - site.x) + Math.PI * 0.5
        : (site ? site.angle : 0);

      // Split the block into lots (jittered grid, or diagonal/courtyard layout in skewed cells).
      const nx = blockInMedia ? 2 : 2 + Math.floor(rand() * (rand() < 0.25 ? 1 : Math.max(1, d.lots - 1)));
      const nz = blockInMedia ? 2 : 2 + Math.floor(rand() * (rand() < 0.25 ? 1 : Math.max(1, d.lots - 1)));
      const xs = splitSpan(x0, x1, nx, rand);
      const zs = splitSpan(z0, z1, nz, rand);

      for (let a = 0; a < nx; a++) {
        for (let b = 0; b < nz; b++) {
          if (!blockInMedia && a + 1 < nx && rand() < 0.08 + d.skip * 0.5) continue;
          if (!blockInMedia && b + 1 < nz && rand() < 0.08 + d.skip * 0.5) continue;
          const lx = (xs[a] + xs[a + 1]) / 2;
          const lz = (zs[b] + zs[b + 1]) / 2;
          const halfDiag = 0.5 * Math.hypot(xs[a + 1] - xs[a], zs[b + 1] - zs[b]);
          const distMedia = mediaZone ? Math.hypot(lx - mediaZone.x, lz - mediaZone.z) : Infinity;
          // Inside mediaZone, interleave ~46% hero media towers with dark architectural contrast towers;
          // outside mediaZone, sprinkle occasional focal media towers organically along major avenues & boulevards!
          const onAveCorridor = (Math.abs(lx % (CELL * 4)) < 78 || Math.abs(lz % (CELL * 4)) < 78) && edgeT > 0.38;
          const pickInZone = distMedia <= (mediaZone ? mediaZone.r : 0) && hash2i(i * 19 + a * 7, j * 23 + b * 11, seed ^ 0x4d3a) < 0.48;
          const pickCorridor = distMedia > (mediaZone ? mediaZone.r * 1.35 : 0) && (onAveCorridor || nearBoulevard(lx, lz, 130)) && hash2i(i * 31 + a * 5, j * 29 + b * 13, seed ^ 0x9b71) < 0.085;
          const useMediaTower = pickInZone || pickCorridor;
          if (inWater(lx, lz) || nearBoulevard(lx, lz, useMediaTower ? 22 : 38 + halfDiag * 0.75)) continue;
          if (useMediaTower) {
            const mt = addMediaTower(
              push, pushBeacon, (bl) => bills.push(bl), (sg) => signs.push(sg), (hl) => holos.push(hl),
              rand, xs[a], xs[a + 1], zs[b], zs[b + 1], h01, baseAngle
            );
            if (mt && pickInZone) mediaTowers.push(mt);
          } else {
            addTower(
              push, pushBeacon, (bl) => bills.push(bl), (sg) => signs.push(sg),
              rand, xs[a], xs[a + 1], zs[b], zs[b + 1], h01, d, edgeT, baseAngle
            );
          }
          towers++;
        }
      }
    }
  }
  if (mediaZone) {
    mediaZone.towerCount = Math.max(mediaTowers.length, 2);
    // 2 spaced street-level holographic portals spanning avenues in the Media Ward (restrained scale, no whiteout)
    for (let k = 0; k < 2; k++) {
      const ang = (k / 2) * Math.PI * 0.5 + hash2i(k, 907, seed) * 0.4;
      const off = (k === 0 ? -1 : 1) * 72;
      holos.push({
        x: mediaZone.x + Math.cos(ang) * off,
        y: 38 + k * 22,
        baseY: 12,
        z: mediaZone.z + Math.sin(ang) * off,
        w: 44 + hash2i(k, 911, seed) * 20,
        h: 26 + hash2i(k, 919, seed) * 12,
        rot: ang,
        seed: hash2i(k, 929, seed),
        kind: 'portal',
      });
    }
    // Also place 2 distant civic/plaza sky-holograms elsewhere in the city so holo landmarks feel city-wide
    for (let k = 0; k < 2; k++) {
      const pl = places[k % Math.max(1, places.length)];
      if (!pl) break;
      holos.push({
        x: pl.x,
        y: 52 + k * 24,
        baseY: 16,
        z: pl.z,
        w: 38 + hash2i(k + 5, 937, seed) * 18,
        h: 26 + hash2i(k + 5, 941, seed) * 12,
        rot: hash2i(k + 5, 947, seed) * Math.PI,
        seed: hash2i(k + 5, 953, seed),
        kind: k === 0 ? 'cylinder' : 'panel',
      });
    }
  }

  // Outskirts: a deep, noise-fingered skirt of low-rise blocks, warehouses,
  // silos, greenhouses, pylons and lone beacons thinning far out into the fog.
  const OUT = Math.max(9, Math.round(radius * 1.2) + 4);
  const outSpan = OUT * CELL;
  for (let i = -radius - OUT; i < radius + OUT; i++) {
    for (let j = -radius - OUT; j < radius + OUT; j++) {
      if (i >= -radius && i < radius && j >= -radius && j < radius) continue;
      const x0 = i * CELL + streetWidth(i) / 2;
      const x1 = (i + 1) * CELL - streetWidth(i + 1) / 2;
      const z0 = j * CELL + streetWidth(j) / 2;
      const z1 = (j + 1) * CELL - streetWidth(j + 1) / 2;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      if (inWater(cx, cz) || nearBoulevard(cx, cz, 48)) continue;
      const warp = (fbm2D(noise, cx / 720 - 2.7, cz / 720 + 5.9, 2) - 0.5) * CELL * 3.8;
      const distBeyond = Math.hypot(cx, cz) + warp - coreSpan * 0.92;
      // ribbon sprawl stretches farther out along avenues & diagonal boulevards
      const onAve = (((i % 4) + 4) % 4 === 0) || (((j % 4) + 4) % 4 === 0);
      const nearBvd = nearBoulevard(cx, cz, 185);
      const reach = outSpan * (onAve || nearBvd ? 1.18 : 0.92);
      const fade = Math.pow(clamp01(1 - Math.max(0, distBeyond) / reach), 1.45);
      if (fade <= 0.015) continue;
      if (hash2i(i, j, seed ^ 0x77a3) > fade * 0.92 + 0.04) continue;
      const rand = mulberry32(hash2i(i, j, seed ^ 0x6631) * 4294967296);
      addOutskirts(push, pushBeacon, (sg) => signs.push(sg), rand, x0, x1, z0, z1, fade);
    }
  }

  // Procedural suburbs stretching far off toward the horizon: radial commuter
  // arterials, satellite town sub-centres, residential house tracts, yards &
  // distant hamlets tapering organically into the mist.
  const subLamps = [];
  const subTrees = [];
  const effSubReach = Math.max(0, Math.min(2.5, Number.isFinite(suburbReach) ? suburbReach : 1.0));
  const suburbSpan = effSubReach > 0.02
    ? Math.round((Math.max(4400, coreSpan * 4.4 + 1900)) * effSubReach)
    : Math.round(coreSpan + outSpan * 0.85);
  let suburbCount = 0;
  if (effSubReach > 0.02) {
    suburbCount = addHorizonSuburbs({
      seed, noise, coreSpan, outSpan, suburbSpan, reach: effSubReach,
      inWater, push, pushBeacon,
      pushSign: (sg) => signs.push(sg),
      pushLamp: (lp) => subLamps.push(lp),
      pushTree: (tr) => subTrees.push(tr),
    });
  }

  // Landmark top beacons.
  for (const lm of landmarks) {
    pushBeacon(lm.x, lm.h + 6, lm.z, hash2i(lm.bi + 5, lm.bj + 9, seed));
  }

  // Giant holographic displays — towering sky projections above tall skyscrapers,
  // hovering crowns over the arena & stadium, and portal banners over avenues.
  const holoCount = Math.max(2, Math.min(9, radius + Math.floor(hash2i(19, 23, seed) * 3)));
  const tall = [];
  const nItems = items.length / 10;
  for (let k = 0; k < nItems; k++) {
    if (items[k * 10 + 4] > 210 && items[k * 10 + 7] === KIND.WALL) tall.push(k);
  }
  const holoKinds = ['panel', 'cylinder', 'portal'];
  for (let k = 0; k < holoCount && tall.length; k++) {
    const pickIdx = tall[Math.floor(hash2i(k * 7 + 3, 29, seed) * tall.length) % tall.length];
    const hx = items[pickIdx * 10 + 0];
    const hz = items[pickIdx * 10 + 2];
    const hTop = items[pickIdx * 10 + 1] + items[pickIdx * 10 + 4] / 2;
    const hKind = holoKinds[Math.floor(hash2i(k, 61, seed) * holoKinds.length) % holoKinds.length];
    holos.push({
      x: hx + (hash2i(k, 31, seed) - 0.5) * 36,
      y: hTop + 52 + hash2i(k, 37, seed) * 85,
      baseY: hTop,
      z: hz + (hash2i(k, 41, seed) - 0.5) * 36,
      w: 68 + hash2i(k, 43, seed) * 78,
      h: 42 + hash2i(k, 47, seed) * 56,
      rot: hash2i(k, 53, seed) * Math.PI * 2,
      seed: hash2i(k, 59, seed),
      kind: hKind,
    });
  }
  // Venue holograms hovering above every arena, stadium and theatre
  for (let k = 0; k < places.length; k++) {
    const pl = places[k];
    if (pl.kind !== 'arena' && pl.kind !== 'stadium' && pl.kind !== 'theatre') continue;
    holos.push({
      x: pl.x,
      y: pl.kind === 'theatre' ? 76 + pl.seed * 18 : 92 + pl.seed * 28,
      baseY: 38,
      z: pl.z,
      w: pl.r * (pl.kind === 'theatre' ? 0.95 : 1.25),
      h: pl.kind === 'theatre' ? 38 : 48,
      rot: pl.rot,
      seed: (pl.seed + 0.37) % 1,
      kind: pl.kind === 'theatre' ? 'panel' : 'cylinder',
    });
  }

  const n = items.length / 10;
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const z = new Float32Array(n);
  const w = new Float32Array(n);
  const h = new Float32Array(n);
  const d = new Float32Array(n);
  const s = new Float32Array(n);
  const kind = new Float32Array(n);
  const style = new Float32Array(n);
  const rot = new Float32Array(n);
  let maxY = 0;
  for (let k = 0; k < n; k++) {
    x[k] = items[k * 10 + 0];
    y[k] = items[k * 10 + 1];
    z[k] = items[k * 10 + 2];
    w[k] = items[k * 10 + 3];
    h[k] = items[k * 10 + 4];
    d[k] = items[k * 10 + 5];
    s[k] = items[k * 10 + 6];
    kind[k] = items[k * 10 + 7];
    style[k] = items[k * 10 + 8];
    rot[k] = items[k * 10 + 9];
    maxY = Math.max(maxY, y[k] + h[k] / 2);
  }

  const collider = makeCityCollider({ count: n, x, y, z, w, h, d, rot, landmarks, places });
  const lanes = makeLanes(seed, radius, boulevards, collider);
  const lamps = makeLamps(seed, radius, boulevards, mediaZone);
  for (let i = 0; i < subLamps.length; i++) lamps.push(subLamps[i]);
  const trees = makeTrees(seed, radius, water, lmCells, places, boulevards);
  for (let i = 0; i < subTrees.length; i++) trees.push(subTrees[i]);
  return {
    seed, radius, suburbReach: effSubReach, suburbSpan, suburbCount,
    count: n, towers, maxY, x, y, z, w, h, d, s, kind, style, rot,
    districts, landmarks, places, mediaZone, lanes, beacons, lamps,
    sites, water, boulevards, trees, bills, signs, holos,
  };
}

/** Street lamps along both sides of every avenue — the night grid, lit. */
function makeLamps(seed, radius, boulevards = [], mediaZone = null) {
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
  // Boulevard lamps — appended after avenue lamps so diagonal cuts glow at night.
  for (let k = 0; k < boulevards.length; k++) {
    const b = boulevards[k];
    const dx = b.x2 - b.x1;
    const dz = b.z2 - b.z1;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    const steps = Math.floor(len / 68);
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const bx = b.x1 + dx * t;
      const bz = b.z1 + dz * t;
      lamps.push({ x: bx + nx * 19, y: 8.2, z: bz + nz * 19 });
      lamps.push({ x: bx - nx * 19, y: 8.2, z: bz - nz * 19 });
    }
  }
  // Extra dense street-level pools & lamps flooding the Media / Holo-Ad District
  if (mediaZone) {
    for (let ring = 0; ring < 24; ring++) {
      const a = (ring / 24) * Math.PI * 2;
      const rr = (0.28 + (ring % 3) * 0.32) * mediaZone.r;
      lamps.push({
        x: mediaZone.x + Math.cos(a) * rr,
        y: 9.0,
        z: mediaZone.z + Math.sin(a) * rr,
      });
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
  const m = hero ? 1.32 : 1.15; // monumental while respecting adjacent avenues
  let r = 20;
  let h = 200;
  if (kind === 'arch') { r = Math.min(54, (34 + r0 * 18) * m); h = (250 + r1 * 200) * m; }
  else if (kind === 'spire') { r = (15 + r0 * 11) * 1.15; h = (380 + r1 * 280) * 1.2; }
  else if (kind === 'dome') { r = Math.min(52, (34 + r0 * 16) * m); h = (120 + r1 * 120) * 1.15; }
  else if (kind === 'mast') { r = 9 + r0 * 5; h = (400 + r1 * 240) * 1.15; }
  else if (kind === 'crown') { r = Math.min(50, (30 + r0 * 16) * m); h = (280 + r1 * 230) * 1.2; }
  else if (kind === 'pyramid') { r = Math.min(54, (38 + r0 * 14) * m); h = (195 + r1 * 155) * m; }
  else if (kind === 'cantilever') { r = Math.min(48, (28 + r0 * 14) * m); h = (290 + r1 * 210) * 1.15; }
  else if (kind === 'ziggurat') { r = Math.min(54, (36 + r0 * 15) * m); h = (210 + r1 * 170) * m; }
  else { r = (11 + r0 * 9) * 1.1; h = (430 + r1 * 300) * 1.15; }
  const cardinal = kind === 'pyramid' || kind === 'ziggurat' || kind === 'cantilever';
  const rot = cardinal ? Math.floor(rnd(71) * 4) * (Math.PI * 0.5) : rnd(71) * Math.PI * 2;
  landmarks.push({
    kind, name, x: cx, z: cz, r, h,
    rot,
    hero: !!hero, bi, bj,
    colorSeed: rnd(83),
  });
  lmCells.set(bi + ',' + bj, true);
}

/** One public-space record + a ring of string lights around it. */
function addPlaceData(places, lmCells, pushBeacon, pushSign, kind, bi, bj, seed, superBlock = false) {
  const cx = superBlock ? (bi + 1) * CELL : bi * CELL + CELL / 2;
  const cz = superBlock ? (bj + 1) * CELL : bj * CELL + CELL / 2;
  const kIdx = Math.max(0, PLACE_KINDS.indexOf(kind));
  const rnd = (salt) => hash2i(bi + salt * 5, bj + salt * 7, seed ^ (kIdx * 104729));
  const pool = PLACE_NAMES[kind];
  let name = pool[Math.floor(rnd(19) * pool.length) % pool.length];
  for (let n = 0; n < pool.length && places.some((l) => l.name === name); n++) {
    name = pool[(pool.indexOf(name) + 1) % pool.length];
  }
  const big = kind === 'arena' || kind === 'stadium' || kind === 'theatre';
  const r = superBlock ? 82 + rnd(23) * 34 : (big ? 52 + rnd(23) * 10 : 44 + rnd(23) * 16);
  const rot = rnd(31) * Math.PI * 2;
  places.push({
    kind, name, x: cx, z: cz, r,
    rot,
    bi, bj,
    colorSeed: rnd(37),
    seed: rnd(41),
  });
  lmCells.set(bi + ',' + bj, true);
  if (superBlock) {
    lmCells.set(`${bi + 1},${bj}`, true);
    lmCells.set(`${bi},${bj + 1}`, true);
    lmCells.set(`${bi + 1},${bj + 1}`, true);
  }

  // Venue signage: glowing marquees, arena banners & stadium scoreboards
  if (big) {
    const banners = kind === 'theatre' ? 3 : 4;
    for (let i = 0; i < banners; i++) {
      const a = rot + (i / banners) * Math.PI * 2;
      const dist = r * (kind === 'theatre' ? 0.66 : 0.88);
      pushSign({
        x: cx + Math.cos(a) * dist,
        y: kind === 'theatre' ? 24 + i * 7 : 28,
        z: cz + Math.sin(a) * dist,
        w: kind === 'theatre' && i === 0 ? 5.5 : 28,
        h: kind === 'theatre' && i === 0 ? 44 : 11,
        d: 3.2,
        rot: -a + Math.PI * 0.5,
        seed: rnd(71 + i),
      });
    }
  } else if (kind === 'market' || kind === 'fair') {
    for (let i = 0; i < 2; i++) {
      const a = rot + i * Math.PI;
      pushSign({
        x: cx + Math.cos(a) * r * 0.78, y: 15, z: cz + Math.sin(a) * r * 0.78,
        w: 18, h: 6.5, d: 2.2, rot: -a + Math.PI * 0.5, seed: rnd(81 + i),
      });
    }
  }

  // string lights around the perimeter + a centre glow
  const n = (big ? 18 : 10) + Math.floor(rnd(43) * 8);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pushBeacon(cx + Math.cos(a) * r * 0.92, (big ? 22 : 9) + rnd(47 + i) * 12, cz + Math.sin(a) * r * 0.92, (i * 0.618) % 1);
  }
  pushBeacon(cx, (big ? 42 : 14) + rnd(53) * 14, cz, rnd(59));
}

/**
 * Multi-layer horizontal street-grid traffic network:
 * - Vehicles travel predominantly along flat horizontal street corridors.
 * - Perpendicular streets (N-S vs E-W) use grade-separated elevations at every
 *   stratum so cross-traffic flows continuously without traffic lights.
 * - Intersection connectors form tangent-exact 90-degree corner turns that
 *   smoothly transition between perpendicular street elevations.
 * - Occasional street-aligned S-curve ramps smoothly switch vehicles between
 *   adjacent horizontal elevation layers.
 */
function makeLanes(seed, radius, boulevards = [], collider = null) {
  const lanes = [];
  const span = radius * CELL + CELL * 0.85;
  const R = (a, b) => hash2i(a, b, seed ^ 0x2c1b3e5d);
  const NS = 33;

  const makeHermiteProf = (y1, y2) => {
    const prof = new Array(NS);
    if (Math.abs(y2 - y1) < 1e-4) {
      prof.fill(y1);
      return prof;
    }
    for (let s = 0; s < NS; s++) {
      const u = s / (NS - 1);
      const h = u * u * (3 - 2 * u);
      prof[s] = y1 + (y2 - y1) * h;
    }
    return prof;
  };

  const segmentClear = (x1, z1, cx, cz, x2, z2, y1, y2, pad = 4.8) => {
    if (!collider) return true;
    const steps = 22;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const om = 1 - t;
      const px = om * om * x1 + 2 * om * t * cx + t * t * x2;
      const pz = om * om * z1 + 2 * om * t * cz + t * t * z2;
      const py = y1 + (y2 - y1) * (t * t * (3 - 2 * t));
      if (collider.hitsPoint(px, py, pz, pad)) return false;
      if (py > 10 && (collider.hitsPoint(px, py - 2.8, pz, pad) || collider.hitsPoint(px, py + 2.8, pz, pad))) {
        return false;
      }
    }
    return true;
  };

  const classifyLayer = (x1, z1, cx, cz, x2, z2, y1, y2, nominalLayer) => {
    if (nominalLayer === 'ground' || !collider) return nominalLayer;
    for (let s = 0; s < NS; s++) {
      const t = s / (NS - 1);
      const om = 1 - t;
      const px = om * om * x1 + 2 * om * t * cx + t * t * x2;
      const pz = om * om * z1 + 2 * om * t * cz + t * t * z2;
      const py = y1 + (y2 - y1) * (t * t * (3 - 2 * t));
      if (collider.maxHeightNear(px, pz, 30.5) + 20.5 > py) {
        // Horizontal corridor threads inside a skyscraper street canyon (clear of hitsPoint, flanked by taller towers)
        return 'ground';
      }
    }
    return nominalLayer;
  };

  const pushSeg = (x1, z1, cx, cz, x2, z2, y1, y2, speed, nominalLayer, meta = null) => {
    const layer = classifyLayer(x1, z1, cx, cz, x2, z2, y1, y2, nominalLayer);
    const rec = {
      x1, z1, cx, cz, x2, z2,
      y: Math.min(y1, y2),
      y1, y2,
      speed, layer,
      nominalLayer,
      directed: true,
      prof: makeHermiteProf(y1, y2),
      outs: [],
    };
    if (meta) Object.assign(rec, meta);
    lanes.push(rec);
    return lanes.length - 1;
  };

  // 6 horizontal street strata: each stratum separates N-S streets (yNS) from
  // perpendicular E-W streets (yEW) so streams never collide at intersections!
  const DECKS = [
    { yNS: 5.8,  yEW: 19.8, spd: 58,  layer: 'ground',   aveOnly: false },
    { yNS: 44.0, yEW: 62.0, spd: 96,  layer: 'air-low',  aveOnly: false },
    { yNS: 92.0, yEW: 114.0, spd: 118, layer: 'air-low',  aveOnly: false },
    { yNS: 158.0, yEW: 184.0, spd: 142, layer: 'air-mid',  aveOnly: true },
    { yNS: 248.0, yEW: 280.0, spd: 168, layer: 'air-mid',  aveOnly: true },
    { yNS: 368.0, yEW: 406.0, spd: 195, layer: 'air-high', aveOnly: true },
  ];

  // 4 cardinal directions: 0 = +Z (S), 1 = -Z (N), 2 = +X (E), 3 = -X (W)
  const DIRS = [
    { dx: 0, dz: 1, axis: 'ns', perp: [2, 3] },
    { dx: 0, dz: -1, axis: 'ns', perp: [2, 3] },
    { dx: 1, dz: 0, axis: 'ew', perp: [0, 1] },
    { dx: -1, dz: 0, axis: 'ew', perp: [0, 1] },
  ];

  const GATE = 30; // intersection apron half-span (m)
  const OFF_AVE = 8.5; // right-hand lane offset on avenues
  const OFF_ST = 5.5;  // right-hand lane offset on minor streets
  const laneOffFor = (idx) => ((((idx % 4) + 4) % 4 === 0) ? OFF_AVE : OFF_ST);

  // Right-hand lateral offset vector (-dz * off, +dx * off)
  const gatePos = (ix, iz, dCode, isExit) => {
    const D = DIRS[dCode];
    const gx = ix * CELL;
    const gz = iz * CELL;
    const sIdx = D.axis === 'ns' ? ix : iz;
    const off = laneOffFor(sIdx);
    const signG = isExit ? 1 : -1;
    return {
      x: gx - D.dz * off + D.dx * GATE * signG,
      z: gz + D.dx * off + D.dz * GATE * signG,
      latX: gx - D.dz * off,
      latZ: gz + D.dx * off,
    };
  };

  const gLim = Math.max(4, Math.ceil((radius + 2) / 2) * 2);
  // Map of outgoing block-cruise segments starting at exit gate `${dIdx}:${ix}:${iz}:${dCode}`
  const startBlocks = new Map();
  // Map of incoming block-cruise segments arriving at entry gate `${dIdx}:${ix}:${iz}:${dCode}`
  const arriveBlocks = new Map();
  const addMap = (mp, key, val) => {
    let arr = mp.get(key);
    if (!arr) { arr = []; mp.set(key, arr); }
    arr.push(val);
  };

  for (let dIdx = 0; dIdx < DECKS.length; dIdx++) {
    const dk = DECKS[dIdx];
    const step = dk.aveOnly ? 4 : 2;
    const startIdx = -Math.floor(gLim / step) * step;

    for (let ix = startIdx; ix <= gLim; ix += step) {
      for (let iz = startIdx; iz <= gLim; iz += step) {
        for (let dCode = 0; dCode < 4; dCode++) {
          const D = DIRS[dCode];
          const nix = ix + D.dx * step;
          const niz = iz + D.dz * step;
          if (nix < startIdx || nix > gLim || niz < startIdx || niz > gLim) continue;

          const pOut = gatePos(ix, iz, dCode, true);
          const pIn = gatePos(nix, niz, dCode, false);
          const yFlat = D.axis === 'ns' ? dk.yNS : dk.yEW;
          const pad = dIdx === 0 ? 4.5 : 4.8;

          if (!segmentClear(pOut.x, pOut.z, (pOut.x + pIn.x) * 0.5, (pOut.z + pIn.z) * 0.5, pIn.x, pIn.z, yFlat, yFlat, pad)) {
            continue;
          }

          const segSpd = dk.spd * (0.88 + R(ix * 13 + dCode, iz * 17 + dIdx) * 0.28);
          const idx = pushSeg(
            pOut.x, pOut.z,
            (pOut.x + pIn.x) * 0.5, (pOut.z + pIn.z) * 0.5,
            pIn.x, pIn.z,
            yFlat, yFlat,
            segSpd, dk.layer,
            { axis: D.axis, deck: dIdx, kind: 'street' }
          );
          addMap(startBlocks, `${dIdx}:${ix}:${iz}:${dCode}`, idx);
          addMap(arriveBlocks, `${dIdx}:${nix}:${niz}:${dCode}`, idx);

          // Occasional smooth street-aligned elevation-switch ramp (~16% of avenue segments):
          // climbs or descends gently to an adjacent horizontal stratum along the street!
          const onAve = ((((D.axis === 'ns' ? ix : iz) % 4) + 4) % 4 === 0)
            && (((nix % 4) + 4) % 4 === 0) && (((niz % 4) + 4) % 4 === 0);
          const rampRoll = R(ix * 31 + dIdx * 7, iz * 29 + dCode * 11);
          if (onAve && rampRoll < 0.18) {
            const targetDeck = (rampRoll < 0.09 && dIdx + 1 < DECKS.length)
              ? dIdx + 1
              : (dIdx > 0 ? dIdx - 1 : Math.min(DECKS.length - 1, dIdx + 1));
            if (targetDeck !== dIdx) {
              const dk2 = DECKS[targetDeck];
              const yTarget = D.axis === 'ns' ? dk2.yNS : dk2.yEW;
              if (Math.abs(yTarget - yFlat) <= 135 && segmentClear(pOut.x, pOut.z, (pOut.x + pIn.x) * 0.5, (pOut.z + pIn.z) * 0.5, pIn.x, pIn.z, yFlat, yTarget, 4.8)) {
                const rIdx = pushSeg(
                  pOut.x, pOut.z,
                  (pOut.x + pIn.x) * 0.5, (pOut.z + pIn.z) * 0.5,
                  pIn.x, pIn.z,
                  yFlat, yTarget,
                  (segSpd + dk2.spd) * 0.5, dk.layer,
                  { axis: D.axis, deck: dIdx, targetDeck, kind: 'ramp' }
                );
                addMap(startBlocks, `${dIdx}:${ix}:${iz}:${dCode}`, rIdx);
                addMap(arriveBlocks, `${targetDeck}:${nix}:${niz}:${dCode}`, rIdx);
              }
            }
          }
        }
      }
    }
  }

  // Build intersection connectors:
  // 1) Flat straight-through bridge (no stop, perpendicular cross-traffic is grade-separated!)
  // 2) Tangent-exact 90-degree left & right corner turns ramping smoothly between yNS and yEW!
  for (const [arrKey, inList] of arriveBlocks.entries()) {
    const [dStr, ixStr, izStr, dCodeStr] = arrKey.split(':');
    const dIdx = Number(dStr);
    const ix = Number(ixStr);
    const iz = Number(izStr);
    const dCode = Number(dCodeStr);
    const dk = DECKS[dIdx];
    const D = DIRS[dCode];
    const pIn = gatePos(ix, iz, dCode, false);
    const yIn = D.axis === 'ns' ? dk.yNS : dk.yEW;
    const connIndices = [];

    // Straight-through across intersection
    const straightNext = startBlocks.get(`${dIdx}:${ix}:${iz}:${dCode}`);
    if (straightNext && straightNext.length) {
      const pOutS = gatePos(ix, iz, dCode, true);
      if (segmentClear(pIn.x, pIn.z, (pIn.x + pOutS.x) * 0.5, (pIn.z + pOutS.z) * 0.5, pOutS.x, pOutS.z, yIn, yIn, 5.5)) {
        const sConn = pushSeg(
          pIn.x, pIn.z,
          (pIn.x + pOutS.x) * 0.5, (pIn.z + pOutS.z) * 0.5,
          pOutS.x, pOutS.z,
          yIn, yIn,
          dk.spd, dk.layer,
          { axis: D.axis, deck: dIdx, kind: 'thru' }
        );
        lanes[sConn].outs = straightNext.slice();
        // Weight straight cruising ~2:1 over turning so corridors read as coherent horizontal streams
        connIndices.push(sConn, sConn);
      }
    }

    // 90-degree perpendicular corner turns (exact tangent intersection C = (latX_in, latZ_out) or (latX_out, latZ_in))
    for (const turnCode of D.perp) {
      const turnNext = startBlocks.get(`${dIdx}:${ix}:${iz}:${turnCode}`);
      if (!turnNext || !turnNext.length) continue;
      const DT = DIRS[turnCode];
      const pOutT = gatePos(ix, iz, turnCode, true);
      const yOut = DT.axis === 'ns' ? dk.yNS : dk.yEW;
      const cx = D.axis === 'ns' ? pIn.latX : pOutT.latX;
      const cz = D.axis === 'ns' ? pOutT.latZ : pIn.latZ;
      if (!segmentClear(pIn.x, pIn.z, cx, cz, pOutT.x, pOutT.z, yIn, yOut, 5.5)) {
        continue;
      }
      const tConn = pushSeg(
        pIn.x, pIn.z, cx, cz, pOutT.x, pOutT.z,
        yIn, yOut,
        dk.spd * 0.86, dk.layer,
        { axis: 'turn', deck: dIdx, kind: 'turn' }
      );
      lanes[tConn].outs = turnNext.slice();
      connIndices.push(tConn);
    }

    if (connIndices.length) {
      for (const inSegIdx of inList) {
        lanes[inSegIdx].outs = connIndices.slice();
      }
    }
  }

  // Flat horizontal 360-degree orbital ring skyways for high cruisers & blimps (constant deck altitude!)
  const ringConfigs = [
    { rr: 0.58 * span, y: 455, layer: 'air-high', spd: 128 },
    { rr: 0.82 * span, y: 515, layer: 'air-high', spd: 138 },
    { rr: 1.08 * span, y: 575, layer: 'blimp',    spd: 46 },
    { rr: 1.34 * span, y: 645, layer: 'blimp',    spd: 52 },
  ];
  for (let ring = 0; ring < ringConfigs.length; ring++) {
    const rc = ringConfigs[ring];
    let yRing = rc.y + R(ring, 31) * 24;
    // Ensure entire horizontal ring sits cleanly above any spire along its circumference
    if (collider) {
      for (let aIdx = 0; aIdx < 36; aIdx++) {
        const a = (aIdx / 36) * Math.PI * 2;
        const top = collider.maxHeightNear(Math.cos(a) * rc.rr, Math.sin(a) * rc.rr, 32);
        if (top + 36 > yRing) yRing = top + 36;
      }
    }
    const segs = 6;
    const dAng = (Math.PI * 2) / segs;
    const ctrlScale = 1 / Math.cos(dAng * 0.5);
    const phase0 = ring * 0.52;
    const indices = [];
    for (let s = 0; s < segs; s++) {
      const a0 = s * dAng + phase0;
      const a1 = (s + 1) * dAng + phase0;
      const aMid = (a0 + a1) * 0.5;
      const idx = pushSeg(
        Math.cos(a0) * rc.rr, Math.sin(a0) * rc.rr,
        Math.cos(aMid) * rc.rr * ctrlScale, Math.sin(aMid) * rc.rr * ctrlScale,
        Math.cos(a1) * rc.rr, Math.sin(a1) * rc.rr,
        yRing, yRing,
        rc.spd, rc.layer,
        { ringId: ring, ringSeg: s, ringSegs: segs, axis: 'ring', deck: 5, kind: 'ring' }
      );
      indices.push(idx);
    }
    for (let s = 0; s < segs; s++) {
      const nextI = indices[(s + 1) % segs];
      lanes[indices[s]].nextIdx = nextI;
      lanes[indices[s]].prevIdx = indices[(s - 1 + segs) % segs];
      lanes[indices[s]].outs = [nextI];
    }
  }

  // High-altitude horizontal blimp avenues cruising flat across the skyline
  for (let k = 0; k < 4; k++) {
    const isNS = k % 2 === 0;
    const aveIdx = (k < 2 ? -4 : 4);
    const coord = (Math.abs(aveIdx) <= radius ? aveIdx : 0) * CELL;
    const bSpan = span * 1.45;
    let yB = (isNS ? 520 : 570) + k * 28;
    if (collider) {
      for (let s = 0; s <= 16; s++) {
        const u = (s / 16) * 2 - 1;
        const px = isNS ? coord : u * bSpan;
        const pz = isNS ? u * bSpan : coord;
        const top = collider.maxHeightNear(px, pz, 40);
        if (top + 38 > yB) yB = top + 38;
      }
    }
    const x1 = isNS ? coord + 14 : -bSpan;
    const z1 = isNS ? -bSpan : coord - 14;
    const x2 = isNS ? coord + 14 : bSpan;
    const z2 = isNS ? bSpan : coord - 14;
    pushSeg(x1, z1, (x1 + x2) * 0.5, (z1 + z2) * 0.5, x2, z2, yB, yB, 38 + R(k, 24) * 22, 'blimp', {
      axis: isNS ? 'ns' : 'ew', deck: 5, kind: 'street',
    });
  }

  // Flat diagonal ground boulevards (broken into clear segments inside the core so suburb buildings are never clipped)
  for (let k = 0; k < boulevards.length; k++) {
    const b = boulevards[k];
    const dx = b.x2 - b.x1;
    const dz = b.z2 - b.z1;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    const yG = 5.8;
    const chunks = 6;
    for (const side of [1, -1]) {
      const prevSegs = [];
      for (let cIdx = 1; cIdx < chunks - 1; cIdx++) {
        const u0 = (side > 0 ? cIdx : (chunks - cIdx)) / chunks;
        const u1 = (side > 0 ? (cIdx + 1) : (chunks - cIdx - 1)) / chunks;
        const sx1 = b.x1 + dx * u0 + nx * 8.5 * side;
        const sz1 = b.z1 + dz * u0 + nz * 8.5 * side;
        const sx2 = b.x1 + dx * u1 + nx * 8.5 * side;
        const sz2 = b.z1 + dz * u1 + nz * 8.5 * side;
        const scx = (sx1 + sx2) * 0.5;
        const scz = (sz1 + sz2) * 0.5;
        if (segmentClear(sx1, sz1, scx, scz, sx2, sz2, yG, yG, 6.5)) {
          const bIdx = pushSeg(
            sx1, sz1, scx, scz, sx2, sz2,
            yG, yG, 78 + R(k, side > 0 ? 41 : 42) * 42, 'ground',
            { axis: 'diag', deck: 0, kind: 'boulevard' }
          );
          if (prevSegs.length > 0 && prevSegs[prevSegs.length - 1].uEnd === u0) {
            lanes[prevSegs[prevSegs.length - 1].idx].outs = [bIdx];
          }
          prevSegs.push({ idx: bIdx, uEnd: u1 });
        }
      }
    }
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
  const angles = [0, 0, 0.34, -0.42, 0.785, -0.61, 0.52, -0.26];
  return pts.map((p, k) => {
    const a = acc[k];
    const kind = p.r < 0.18 ? 'water' : kinds[Math.floor(hash2i(k, 113, seed) * kinds.length) % kinds.length];
    const angPick = angles[Math.floor(hash2i(k, 127, seed) * angles.length) % angles.length];
    return {
      x: a.n ? a.x / a.n : p.x,
      z: a.n ? a.z / a.n : p.z,
      kind,
      r: p.r,
      angle: angPick,
      radial: (kind === 'civic' || kind === 'water' || kind === 'park') && hash2i(k, 131, seed) < 0.65,
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
function makeTrees(seed, radius, water, lmCells, places, boulevards = []) {
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
  // trees / bio-illuminators lining the diagonal boulevards
  for (let bIdx = 0; bIdx < boulevards.length; bIdx++) {
    const b = boulevards[bIdx];
    const dx = b.x2 - b.x1;
    const dz = b.z2 - b.z1;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    const steps = Math.floor(len / 72);
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      for (const side of [-1, 1]) {
        const tx = b.x1 + dx * t + nx * side * 26;
        const tz = b.z1 + dz * t + nz * side * 26;
        k++;
        if (Math.abs(tx) > span || Math.abs(tz) > span) continue;
        if (inWater(tx, tz) || placeNear(tx, tz)) continue;
        if (hash2i(k, 157, seed) < 0.3) continue;
        trees.push({ x: tx, z: tz, h: 10 + hash2i(k, 163, seed) * 10, seed: hash2i(k, 167, seed) });
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
function rotOff(cx, cz, ox, oz, rot) {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return [cx + ox * c + oz * s, cz - ox * s + oz * c];
}

function addTower(push, pushBeacon, pushBill, pushSign, rand, x0, x1, z0, z1, h01, d, edgeT = 1, baseAngle = 0) {
  const w0 = x1 - x0;
  const d0 = z1 - z0;
  if (w0 < 12 || d0 < 12) return;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const style = d.styles[Math.floor(rand() * d.styles.length) % d.styles.length];
  // Voronoi cell angle + district twist + per-lot jitter break pure rectangularity
  let rot = baseAngle * (0.55 + 0.45 * (d.rotAmp > 0.06 ? 1 : 0.35));
  rot += (d.rotAmp || 0) * (((hash2i(Math.round(cx), Math.round(cz), 991) * 7919) % 1) - 0.5) * 3.2;
  rot += (rand() - 0.5) * 0.12;
  if (rand() < 0.08) rot += (rand() - 0.5) * 0.85;
  // Shrink footprint slightly when rotated so corners never poke into streets
  const fit = 1 / (Math.abs(Math.cos(rot)) + Math.abs(Math.sin(rot)) * 0.48);
  const w = Math.max(11, Math.min(w0 * 0.92, w0 * d.wMul * Math.min(1, fit * 1.08)));
  const dp = Math.max(11, Math.min(d0 * 0.92, d0 * d.wMul * Math.min(1, fit * 1.08)));

  const floorH = rand() < 0.3 ? 3.1 : rand() < 0.7 ? 3.6 : 4.4;
  let H = (24 + 520 * Math.pow(h01, 1.35)) * (0.5 + rand() * 1.05) * d.hMul;
  H *= 0.16 + 0.84 * Math.pow(clamp01(edgeT), 1.15); // skyline tapers smoothly into the outskirts
  if (rand() < 0.05 && edgeT > 0.45) H *= 1.5 + rand() * 0.9; // rare spire-ish in core
  H = Math.max(12, Math.min(840, H));
  H = Math.round(H / floorH) * floorH;

  // ---- non-rectangular variant: octagonal / 12-sided prism tower ----
  if (rand() < 0.14 && Math.min(w, dp) > 18) {
    const pr = Math.min(w, dp) * 0.68;
    const tiers = 2 + Math.floor(rand() * 2);
    let py = 0;
    for (let t = 0; t < tiers; t++) {
      const th = (H * (t === 0 ? 0.64 : 0.36 / Math.max(1, tiers - 1)));
      const tr = pr * (1 - t * 0.22);
      push(cx, py + th / 2, cz, tr, th, tr, rand(), KIND.WALL, style, rot);
      push(cx, py + th / 2, cz, tr, th, tr, rand(), KIND.WALL, style, rot + Math.PI / 4);
      py += th;
      push(cx, py + 0.9, cz, tr * 1.08, 1.8, tr * 1.08, rand(), KIND.BAND, style, rot + Math.PI / 8);
    }
    if (H > 140) pushBeacon(cx, py + 4, cz, rand());
    if (rand() < 0.45) {
      const [bx, bz] = rotOff(cx, cz, pr * 0.54, 0, rot);
      pushSign({ x: bx, y: H * 0.55, z: bz, w: 3.0, h: Math.min(54, H * 0.26), d: 9, rot, seed: rand() });
    }
    addGrit(push, rand, cx, cz, w, dp, d, 0.9, rot);
    return;
  }

  // ---- non-rectangular variant: angled wedge / flatiron V-wings ----
  if (rand() < 0.13 && w > 24 && dp > 24) {
    const wingW = w * 0.72;
    const wingD = dp * 0.34;
    const splay = 0.36 + rand() * 0.36;
    const wh = H * (0.78 + rand() * 0.28);
    for (const side of [-1, 1]) {
      const [wx, wz] = rotOff(cx, cz, 0, side * dp * 0.16, rot);
      push(wx, wh / 2, wz, wingW, wh, wingD, rand(), KIND.WALL, style, rot + side * splay);
      push(wx, wh + 1.1, wz, wingW * 0.88, 2.2, wingD * 0.88, rand(), KIND.SLAB, style, rot + side * splay);
    }
    push(cx, wh * 0.42, cz, wingD * 1.3, wh * 0.84, wingD * 1.3, rand(), KIND.WALL, 1, rot);
    if (wh > 130) pushBeacon(cx, wh + 4, cz, rand());
    addGrit(push, rand, cx, cz, w, dp, d, 0.9, rot);
    return;
  }

  // ---- variant: heavy monolith slab (flat top, sparse windows) ----
  if (rand() < d.mono) {
    const mh = Math.max(30, Math.min(520, H * 1.35));
    push(cx, mh / 2, cz, w * 0.94, mh, dp * 0.94, rand(), KIND.WALL, style >= 1 ? style : 2, rot);
    push(cx, mh + 2.2, cz, w * 0.66, 4.4, dp * 0.66, rand(), KIND.SLAB, 2, rot);
    if (rand() < 0.55) {
      const ah = 10 + rand() * 26;
      push(cx + (rand() - 0.5) * w * 0.3, mh + 4.4 + ah / 2, cz, 1.8, ah, 1.8, rand(), KIND.MAST, 2, rot);
      pushBeacon(cx, mh + 4.4 + ah + 1, cz, rand());
    }
    addGrit(push, rand, cx, cz, w, dp, d, 1.2, rot);
    return;
  }

  // ---- variant: rift spindle — very thin, very tall, often outline ----
  if (d.kind === 'rift' && rand() < 0.5) {
    const sw = Math.min(w, dp) * 0.38;
    const sh = Math.max(120, Math.min(900, H * 1.7));
    push(cx, sh / 2, cz, sw, sh, sw, rand(), KIND.WALL, style === 0 ? 1 : style, rot);
    push(cx, sh + 1.5, cz, sw * 1.5, 3, sw * 1.5, rand(), KIND.BAND, 1, rot);
    const ah = 20 + rand() * 50;
    push(cx, sh + 3 + ah / 2, cz, 1.4, ah, 1.4, rand(), KIND.MAST, 1, rot);
    pushBeacon(cx, sh + 3 + ah + 1, cz, rand());
    return;
  }

  // ---- variant: stepped arcology pyramid (theme-reactive courses, corner buttresses & glowing terrace rims) ----
  if (rand() < 0.085 && w > 28 && dp > 28) {
    const tiers = 7 + Math.floor(rand() * 3);
    const pH = Math.max(46, Math.min(340, H * (0.78 + rand() * 0.36)));
    let py = 0;
    addStreetBase(push, pushSign, rand, cx, cz, w, dp, d, rot);
    for (let t = 0; t < tiers; t++) {
      const f = t / (tiers - 1);
      const scale = 0.96 - f * 0.72;
      const th = (pH / tiers) * (1.12 - f * 0.24);
      const tw = w * scale;
      const td = dp * scale;
      push(cx, py + th / 2, cz, tw, th, td, rand(), KIND.WALL, style, rot);
      // Corner arcology buttress ribs along X and Z axes
      push(cx, py + th * 0.48, cz, tw * 1.05, th * 0.92, td * 0.22, rand(), KIND.SLAB, style, rot);
      push(cx, py + th * 0.48, cz, tw * 0.22, th * 0.92, td * 1.05, rand(), KIND.SLAB, style, rot);
      py += th;
      if (t % 2 === 1 || t === tiers - 1) {
        push(cx, py + 0.7, cz, tw * 1.03, 1.4, td * 1.03, rand(), KIND.BAND, style, rot);
      }
    }
    const capW = w * 0.16;
    const capD = dp * 0.16;
    push(cx, py + 3.2, cz, capW, 5.2, capD, rand(), KIND.SLAB, style, rot);
    push(cx, py + 6.4, cz, capW * 1.2, 1.3, capD * 1.2, rand(), KIND.BAND, style, rot);
    if (pH > 110) pushBeacon(cx, py + 9, cz, rand());
    addGrit(push, rand, cx, cz, w, dp, d, 0.85, rot);
    return;
  }

  // ---- variant: cantilevered sky-wing tower (offset shear core + dramatic mid-air overhanging wings) ----
  if (rand() < 0.095 && w > 26 && dp > 26 && H > 75) {
    const ch = H * (0.92 + rand() * 0.30);
    const coreW = w * 0.40;
    const coreD = dp * 0.44;
    const [coreX, coreZ] = rotOff(cx, cz, -w * 0.18, -dp * 0.10, rot);
    addStreetBase(push, pushSign, rand, cx, cz, w, dp, d, rot);
    // Main vertical elevator & shear-wall core
    push(coreX, ch / 2, coreZ, coreW, ch, coreD, rand(), KIND.WALL, style, rot);
    push(coreX, ch + 1.4, coreZ, coreW * 0.9, 2.8, coreD * 0.9, rand(), KIND.SLAB, style, rot);

    // 2–3 staggered horizontal cantilevered wings projecting boldly out into mid-air
    const wingCount = ch > 165 ? 3 : 2;
    for (let k = 0; k < wingCount; k++) {
      const frac = wingCount === 3 ? [0.40, 0.66, 0.88][k] : [0.48, 0.80][k];
      const wy = ch * frac;
      const wh = Math.max(10, Math.min(24, ch * (0.11 + rand() * 0.05)));
      const alongZ = k % 2 === 1;
      const spanLen = (alongZ ? dp : w) * (0.92 + rand() * 0.22);
      const wingT = (alongZ ? w : dp) * 0.42;
      const jut = (alongZ ? dp : w) * 0.18;
      const [wx, wz] = alongZ
        ? rotOff(coreX, coreZ, 0, jut, rot)
        : rotOff(coreX, coreZ, jut + w * 0.12, 0, rot);
      const ww = alongZ ? wingT : spanLen;
      const wd = alongZ ? spanLen : wingT;
      push(wx, wy, wz, ww, wh, wd, rand(), KIND.WALL, style, rot);
      // Stepped structural under-belly support bracket + glowing soffit band
      const [bx, bz] = alongZ
        ? rotOff(coreX, coreZ, 0, jut * 0.55, rot)
        : rotOff(coreX, coreZ, (jut + w * 0.12) * 0.55, 0, rot);
      push(bx, wy - wh * 0.62, bz, ww * 0.58, wh * 0.34, wd * 0.58, rand(), KIND.SLAB, style, rot);
      push(wx, wy - wh * 0.5 - 0.55, wz, ww * 0.96, 1.1, wd * 0.96, rand(), KIND.BAND, style, rot);
      push(wx, wy + wh * 0.5 + 0.6, wz, ww * 0.98, 1.2, wd * 0.98, rand(), KIND.SLAB, style, rot);
    }
    if (ch > 135) {
      const ah = 14 + rand() * 28;
      push(coreX, ch + 2.8 + ah / 2, coreZ, 1.5, ah, 1.5, rand(), KIND.MAST, style, rot);
      pushBeacon(coreX, ch + 2.8 + ah + 1.5, coreZ, rand());
    }
    addGrit(push, rand, cx, cz, w, dp, d, 0.9, rot);
    return;
  }

  // ---- variant: twin shafts + skybridge ----
  if (rand() < 0.16 && w > 34 && dp > 34) {
    const tw = w * 0.32;
    const gap = w * 0.16;
    const th = H * (0.8 + rand() * 0.35);
    for (const sx of [-1, 1]) {
      const tx = cx + sx * (tw / 2 + gap);
      push(tx, th / 2, cz, tw, th, dp * 0.8, rand(), KIND.WALL, style, rot);
      push(tx, th + 1.2, cz, tw * 0.8, 2.4, dp * 0.6, rand(), KIND.SLAB, style, rot);
    }
    // skybridge at ~55% height
    const bh = 7 + rand() * 6;
    push(cx, th * 0.55, cz, w * 0.62, bh, Math.min(dp * 0.42, 16), rand(), KIND.SLAB, style, rot);
    if (th > 150 && rand() < 0.6) {
      push(cx, th + 2, cz, 1.5, 14 + rand() * 22, 1.5, rand(), KIND.MAST, style, rot);
      pushBeacon(cx, th + 18, cz, rand());
    }
    addGrit(push, rand, cx, cz, w, dp, d, 1, rot);
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
  const twist = rand() < 0.22 ? (rand() - 0.5) * 0.22 : 0;
  let segRot = rot;
  for (let i = 0; i < nSeg; i++) {
    const segH = (H * share[i]) / total;
    if (i > 0) {
      const t = i / nSeg;
      iw += rand() * (3 + t * 14);
      id += rand() * (3 + t * 14);
      segRot += twist;
    }
    const sw = Math.max(10, w - iw * 2);
    const sd = Math.max(10, dp - id * 2);
    push(cx, y + segH / 2, cz, sw, segH, sd, rand(), KIND.WALL, style, segRot);
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
          mw, mh, md, rand(), KIND.SLAB, style, rot
        );
      }
    }
  }

  // Distinct street-level base: colonnaded retail podium, awnings & recessed arcade
  addStreetBase(push, pushSign, rand, cx, cz, w, dp, d, rot);

  // Roof slab + mast + aviation light.
  const tw = Math.max(10, w - iw * 2) * 0.92;
  const td = Math.max(10, dp - id * 2) * 0.92;
  push(cx, y + 1.1, cz, tw, 2.2, td, rand(), KIND.SLAB, style, rot);
  // illuminated billboards on ~28% of medium & tall towers (organic spacing, varied aspect ratios)
  if (H > 115 && rand() < 0.28) {
    const portrait = rand() < 0.38;
    const bh = portrait ? 24 + rand() * 28 : 9 + rand() * 14;
    const bw = portrait
      ? Math.min(24, Math.max(10, (rand() < 0.5 ? tw : td) * (0.42 + rand() * 0.25)))
      : Math.min(46, Math.max(14, (rand() < 0.5 ? tw : td) * (0.68 + rand() * 0.35)));
    const by = Math.max(46, H * (0.34 + rand() * 0.46));
    if (rand() < 0.5) {
      const [bx, bz] = rotOff(cx, cz, (rand() < 0.5 ? 1 : -1) * (tw / 2 + 1.2), 0, segRot);
      pushBill({ x: bx, y: by, z: bz, w: 2.2, h: bh, d: bw, rot: segRot, seed: rand() });
    } else {
      const [bx, bz] = rotOff(cx, cz, 0, (rand() < 0.5 ? 1 : -1) * (td / 2 + 1.2), segRot);
      pushBill({ x: bx, y: by, z: bz, w: bw, h: bh, d: 2.2, rot: segRot, seed: rand() });
    }
  }
  if (H > 170 && rand() < 0.7) {
    const ah = 12 + rand() * 40;
    push(cx, y + 2.2 + ah / 2, cz, 1.6, ah, 1.6, rand(), KIND.MAST, style, segRot);
    push(cx, y + 2.2 + ah + 0.7, cz, 1.1, 1.4, 1.1, rand(), KIND.BAND, style, segRot);
    pushBeacon(cx, y + 2.2 + ah + 1.6, cz, rand());
  }
  // rich multi-tier signage: vertical neon canyon blades, rooftop sky-signs & street shopfront fascias
  const signChance = 0.42 + 0.52 * (d.signs || 0);
  if (rand() < signChance) {
    if (H > 95 && rand() < 0.6) {
      const sh = Math.min(76, H * (0.2 + rand() * 0.24));
      const side = rand() < 0.5 ? 1 : -1;
      const [sx, sz] = rotOff(cx, cz, side * (tw / 2 + 2.6), (rand() - 0.5) * td * 0.4, segRot);
      pushSign({ x: sx, y: H * (0.3 + rand() * 0.38), z: sz, w: 3.0, h: sh, d: 8 + rand() * 9, rot: segRot, seed: rand() });
    } else {
      const rw = Math.min(50, tw * (0.62 + rand() * 0.45));
      pushSign({ x: cx, y: y + 7 + rand() * 8, z: cz, w: rw, h: 8 + rand() * 10, d: 2.6, rot: segRot, seed: rand() });
    }
  }
  // low street-level neon fascia sign along busy streets
  if (edgeT > 0.3 && rand() < 0.34 * (d.signs || 0.5)) {
    const side = rand() < 0.5 ? 1 : -1;
    const [fx, fz] = rotOff(cx, cz, 0, side * (dp / 2 + 1.1), rot);
    pushSign({ x: fx, y: 8 + rand() * 9, z: fz, w: Math.min(34, w * 0.65), h: 3.4 + rand() * 3.2, d: 1.8, rot, seed: rand() });
  }
  addGrit(push, rand, cx, cz, w, dp, d, 1, rot);
}

/**
 * Outskirts transition: inner low-rise suburban/industrial blocks step down
 * into warehouses, greenhouses, tank farms, pylons and lone beacons fading
 * gently into the horizon mist.
 */
function addOutskirts(push, pushBeacon, pushSign, rand, x0, x1, z0, z1, fade) {
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const w = (x1 - x0) * 0.82;
  const dp = (z1 - z0) * 0.82;
  const n = 1 + Math.floor(rand() * (1 + 4.2 * fade));
  for (let k = 0; k < n; k++) {
    const roll = rand();
    const px = cx + (rand() - 0.5) * w * 0.72;
    const pz = cz + (rand() - 0.5) * dp * 0.72;
    const rot = (rand() - 0.5) * 1.15;
    if (fade > 0.52 && roll < 0.34) {
      // inner-skirt low-rise apartment / workshop with occasional diner sign
      const hh = (10 + rand() * 28) * fade;
      const bw = 14 + rand() * 22;
      const bd = 12 + rand() * 20;
      push(px, hh / 2, pz, bw, hh, bd, rand(), KIND.WALL, rand() < 0.35 ? 2 : 0, rot);
      push(px, hh + 0.8, pz, bw * 0.84, 1.6, bd * 0.84, rand(), KIND.SLAB, 2, rot);
      if (rand() < 0.24) {
        pushSign({ x: px, y: hh + 4, z: pz, w: bw * 0.55, h: 3.6, d: 1.6, rot, seed: rand() });
      }
    } else if (roll < 0.46) {
      // low warehouse / greenhouse shed
      const hh = (4 + rand() * 13) * (0.35 + 0.65 * fade);
      push(px, hh / 2, pz, 14 + rand() * 28 * fade, hh, 11 + rand() * 20 * fade, rand(), KIND.SLAB, 2, rot);
    } else if (roll < 0.64) {
      // cylindrical-ish tank / silo pair (crossed rotated boxes)
      const hh = (7 + rand() * 18) * (0.3 + 0.7 * fade);
      const sr = 6 + rand() * 8 * fade;
      push(px, hh / 2, pz, sr, hh, sr, rand(), KIND.WALL, 2, rot);
      push(px, hh / 2, pz, sr, hh, sr, rand(), KIND.WALL, 2, rot + Math.PI / 4);
      push(px, hh + 0.9, pz, sr * 0.75, 1.8, sr * 0.75, rand(), KIND.SLAB, 2, rot);
    } else if (roll < 0.79) {
      // transmission pylon with faint beacon out in the mist
      const hh = (16 + rand() * 34) * (0.35 + 0.65 * fade);
      push(px, hh / 2, pz, 1.5, hh, 1.5, rand(), KIND.MAST, 0, rot);
      push(px, hh * 0.78, pz, 7 * fade + 2, 0.9, 1.1, rand(), KIND.MAST, 0, rot);
      push(px, hh + 0.7, pz, 1.3, 1.4, 1.3, rand(), KIND.BAND, 0, rot);
      if (rand() < 0.42) pushBeacon(px, hh + 1.8, pz, rand());
    } else if (roll < 0.9) {
      // container stacks
      const stacks = 1 + Math.floor(rand() * 3 * fade);
      for (let c = 0; c < stacks; c++) {
        push(px, 1.5 + c * 3.1, pz, 11 + rand() * 7, 2.9, 4.8 + rand() * 2.5, rand(), KIND.SLAB, 2, rot);
      }
    } else {
      // dark rural plot / solar pad melting into the ground
      push(px, 0.45, pz, 24 + rand() * 38, 0.9, 24 + rand() * 38, rand(), KIND.SLAB, 2, rot);
    }
  }
}

/**
 * Procedural horizon suburbs: multi-ring residential sprawl, commuter arterial
 * roads, satellite town sub-centres, pitched-roof cottages, rowhouses, gardens
 * and streetlamps stretching km after km out toward the horizon.
 */
function addHorizonSuburbs({
  seed, noise, coreSpan, outSpan, suburbSpan, reach,
  inWater, push, pushBeacon, pushSign, pushLamp, pushTree,
}) {
  let added = 0;
  const rStart = coreSpan + outSpan * 0.42;
  if (suburbSpan <= rStart + 80) return 0;

  // 6–8 radial commuter arterials snaking outward from the city core
  const spokeCount = 6 + (Math.floor(hash2i(41, 83, seed) * 3) % 3);
  const spokes = [];
  for (let k = 0; k < spokeCount; k++) {
    const baseAng = (k / spokeCount) * Math.PI * 2 + (hash2i(k, 89, seed) - 0.5) * 0.45;
    spokes.push({
      ang: baseAng,
      wobble: 0.08 + hash2i(k, 97, seed) * 0.10,
      phase: hash2i(k, 103, seed) * Math.PI * 2,
    });
  }

  const spokeAngleAt = (sp, r) => sp.ang + Math.sin(r * 0.00085 + sp.phase) * sp.wobble;

  // Satellite suburban town sub-centres along arterials
  const towns = [];
  for (let k = 0; k < spokeCount; k++) {
    if (hash2i(k, 109, seed) < 0.22) continue;
    const sp = spokes[k];
    const tr = rStart + (suburbSpan - rStart) * (0.18 + hash2i(k, 113, seed) * 0.46);
    const a = spokeAngleAt(sp, tr);
    towns.push({
      x: Math.cos(a) * tr,
      z: Math.sin(a) * tr,
      r: 220 + hash2i(k, 127, seed) * 190,
      rot: -a,
    });
  }

  // Lamp & roadside retail ribbons along commuter arterials
  for (let k = 0; k < spokes.length; k++) {
    const sp = spokes[k];
    const step = 115;
    for (let r = rStart * 0.88; r < suburbSpan * 0.94; r += step) {
      const a = spokeAngleAt(sp, r);
      const cx = Math.cos(a) * r;
      const cz = Math.sin(a) * r;
      if (inWater(cx, cz)) continue;
      const nx = -Math.sin(a);
      const nz = Math.cos(a);
      const tFade = clamp01(1 - (r - rStart) / Math.max(200, suburbSpan - rStart));
      if (tFade > 0.12) {
        pushLamp({ x: cx + nx * 15, y: 6.8, z: cz + nz * 15 });
        if (tFade > 0.42) pushLamp({ x: cx - nx * 15, y: 6.8, z: cz - nz * 15 });
      }
      const rand = mulberry32(hash2i(k * 97 + Math.round(r * 0.1), 521, seed) * 4294967296);
      if (rand() < 0.52 * tFade + 0.08) {
        const side = rand() < 0.5 ? -1 : 1;
        const bx = cx + nx * side * (30 + rand() * 18);
        const bz = cz + nz * side * (30 + rand() * 18);
        const rot = -a + (rand() - 0.5) * 0.15;
        const bw = 15 + rand() * 20;
        const bd = 11 + rand() * 13;
        const bh = 5.5 + rand() * 9.5 * (0.4 + 0.6 * tFade);
        push(bx, bh * 0.5, bz, bw, bh, bd, rand(), KIND.WALL, rand() < 0.45 ? 4 : 0, rot);
        push(bx, bh + 0.55, bz, bw * 0.92, 1.1, bd * 0.92, rand(), KIND.SLAB, 2, rot);
        added += 2;
        if (rand() < 0.36 * tFade) {
          pushSign({ x: bx, y: bh + 2.8, z: bz, w: Math.min(14, bw * 0.6), h: 2.6, d: 1.4, rot, seed: rand() });
        }
      }
    }
  }

  // Satellite suburban town sub-centres: mid-rise apartments, civic halls & water tower
  for (let tIdx = 0; tIdx < towns.length; tIdx++) {
    const tn = towns[tIdx];
    const rand = mulberry32(hash2i(tIdx, 613, seed) * 4294967296);
    const bCount = 12 + Math.floor(rand() * 10);
    for (let b = 0; b < bCount; b++) {
      const ang = rand() * Math.PI * 2;
      const rr = Math.pow(rand(), 0.65) * tn.r;
      const bx = tn.x + Math.cos(ang) * rr;
      const bz = tn.z + Math.sin(ang) * rr;
      if (inWater(bx, bz)) continue;
      const centerT = 1 - rr / (tn.r + 1);
      const bh = 8 + centerT * 26 + rand() * 14;
      const bw = 13 + rand() * 16;
      const bd = 12 + rand() * 15;
      const rot = tn.rot + (rand() - 0.5) * 0.28;
      push(bx, bh * 0.5, bz, bw, bh, bd, rand(), KIND.WALL, centerT > 0.55 ? 4 : 0, rot);
      push(bx, bh + 0.7, bz, bw * 0.84, 1.4, bd * 0.84, rand(), KIND.SLAB, 2, rot);
      added += 2;
      if (centerT > 0.5 && rand() < 0.38) {
        pushSign({ x: bx, y: Math.min(bh - 2, 9.5), z: bz, w: bw * 0.55, h: 2.8, d: 1.5, rot, seed: rand() });
      }
      if (b % 3 === 0) {
        pushLamp({ x: bx + 11, y: 6.8, z: bz });
        pushTree({ x: bx - 10, z: bz + 6, h: 7 + rand() * 6, seed: rand() });
      }
    }
    // Town water tower / relay mast with aviation beacon
    const wh = 26 + rand() * 18;
    push(tn.x, wh * 0.5, tn.z, 2.2, wh, 2.2, rand(), KIND.MAST, 2, 0);
    push(tn.x, wh + 3.5, tn.z, 9.5, 7.0, 9.5, rand(), KIND.WALL, 2, 0);
    push(tn.x, wh + 3.5, tn.z, 9.5, 7.0, 9.5, rand(), KIND.WALL, 2, Math.PI * 0.25);
    pushBeacon(tn.x, wh + 8.5, tn.z, rand());
    added += 3;
  }

  // Concentric polar neighbourhood rings stretching all the way to the horizon
  let rCur = rStart;
  let ringIdx = 0;
  while (rCur < suburbSpan) {
    const tNorm = clamp01((rCur - rStart) / Math.max(1, suburbSpan - rStart));
    // Progressive spatial step so near suburbs are tight neighbourhoods & far horizon stays fast
    const radialStep = 135 + tNorm * 225;
    const arcStep = 130 + tNorm * 220;
    const segs = Math.max(16, Math.round((2 * Math.PI * rCur) / arcStep));
    const densityFade = Math.pow(1 - tNorm * 0.88, 1.25);

    for (let sIdx = 0; sIdx < segs; sIdx++) {
      const hRoll = hash2i(ringIdx * 131 + sIdx, 733, seed);
      const a = ((sIdx + (hash2i(sIdx, ringIdx + 739, seed) - 0.5) * 0.65) / segs) * Math.PI * 2;
      const rJit = rCur + (hash2i(sIdx + 17, ringIdx + 743, seed) - 0.5) * radialStep * 0.72;
      const cx = Math.cos(a) * rJit;
      const cz = Math.sin(a) * rJit;
      if (inWater(cx, cz)) continue;

      // Coherent greenbelts vs residential tracts via 2D FBM noise
      const patch = fbm2D(noise, cx / 920 + 11.4, cz / 920 - 6.8, 2);
      if (hRoll > (0.14 + patch * 0.88) * densityFade) continue;

      const rand = mulberry32(hash2i(ringIdx * 313 + sIdx, 751, seed) * 4294967296);
      const streetRot = -a + (Math.floor(rand() * 4) * Math.PI * 0.5) + (rand() - 0.5) * 0.16;
      // Number of houses in this residential cul-de-sac / street parcel
      const houses = tNorm < 0.38 ? (3 + Math.floor(rand() * 4)) : tNorm < 0.72 ? (2 + Math.floor(rand() * 3)) : (1 + Math.floor(rand() * 2));
      const lotSpan = 42 + tNorm * 28;

      for (let h = 0; h < houses; h++) {
        const ox = ((h % 2) - 0.5) * lotSpan * (0.55 + rand() * 0.45);
        const oz = (Math.floor(h / 2) - 0.5) * 26 + (rand() - 0.5) * 10;
        const [hx, hz] = rotOff(cx, cz, ox, oz, streetRot);
        const kindRoll = rand();
        if (kindRoll < 0.68) {
          // Detached / semi-detached suburban house with stepped pitched-roof ridge
          const hw = 9.5 + rand() * 8.5;
          const hd = 8.5 + rand() * 7.5;
          const hh = 4.8 + rand() * 5.2 * (1 - tNorm * 0.25);
          push(hx, hh * 0.5, hz, hw, hh, hd, rand(), KIND.WALL, 0, streetRot);
          push(hx, hh + 1.15, hz, hw * 0.76, 2.3, hd * 0.68, rand(), KIND.SLAB, 2, streetRot);
          added += 2;
        } else if (kindRoll < 0.88) {
          // Terraced rowhouse / garden apartment block
          const hw = 18 + rand() * 14;
          const hd = 9 + rand() * 5;
          const hh = 7.2 + rand() * 6.8 * (1 - tNorm * 0.35);
          push(hx, hh * 0.5, hz, hw, hh, hd, rand(), KIND.WALL, 0, streetRot);
          push(hx, hh + 0.6, hz, hw * 0.92, 1.2, hd * 0.88, rand(), KIND.SLAB, 2, streetRot);
          added += 2;
        } else {
          // Suburban greenhouse / barn / community pavilion
          const hw = 14 + rand() * 16;
          const hd = 10 + rand() * 10;
          const hh = 4.2 + rand() * 4.0;
          push(hx, hh * 0.5, hz, hw, hh, hd, rand(), KIND.SLAB, 2, streetRot);
          added += 1;
        }
      }

      if (tNorm < 0.55 && rand() < 0.36 * densityFade) {
        pushTree({ x: cx + (rand() - 0.5) * 28, z: cz + (rand() - 0.5) * 28, h: 6.5 + rand() * 6.5, seed: rand() });
      }
      if (tNorm < 0.62 && rand() < 0.22 * densityFade) {
        pushLamp({ x: cx, y: 6.2, z: cz });
      }
    }

    rCur += radialStep / Math.max(0.55, Math.min(1.35, reach));
    ringIdx++;
  }
  return added;
}

/**
 * Spatial hash collider over rotated building boxes, landmarks and major
 * venues. Used both offline (lane rooftop-clearance profiles) and at runtime
 * (camera & vehicle collision detection).
 */
export function makeCityCollider(city) {
  const B = CELL;
  const buckets = new Map();
  const boxes = [];
  const keyOf = (ix, iz) => `${ix},${iz}`;
  const addBucket = (ix, iz, idx) => {
    const k = keyOf(ix, iz);
    let arr = buckets.get(k);
    if (!arr) { arr = []; buckets.set(k, arr); }
    arr.push(idx);
  };

  const n = city.count || 0;
  for (let i = 0; i < n; i++) {
    const cx = city.x[i];
    const cz = city.z[i];
    const hw = city.w[i] * 0.5;
    const hd = city.d[i] * 0.5;
    const top = city.y[i] + city.h[i] * 0.5;
    const bot = city.y[i] - city.h[i] * 0.5;
    const r = city.rot ? city.rot[i] : 0;
    const rad = Math.hypot(hw, hd);
    const idx = boxes.length;
    boxes.push({ cx, cz, hw, hd, top, bot, cos: Math.cos(r), sin: Math.sin(r), rad });
    const x0 = Math.floor((cx - rad) / B);
    const x1 = Math.floor((cx + rad) / B);
    const z0 = Math.floor((cz - rad) / B);
    const z1 = Math.floor((cz + rad) / B);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) addBucket(ix, iz, idx);
    }
  }

  const discs = [];
  for (const lm of city.landmarks || []) {
    discs.push({ cx: lm.x, cz: lm.z, r: lm.r * 1.02, top: lm.h + 10, arch: lm.kind === 'arch', rot: lm.rot || 0 });
  }
  for (const pl of city.places || []) {
    const h = (pl.kind === 'arena' || pl.kind === 'stadium' || pl.kind === 'theatre') ? 56 : 40;
    discs.push({ cx: pl.x, cz: pl.z, r: pl.r * 0.96, top: h, arch: false, rot: 0 });
  }

  const seen = new Int32Array(Math.max(1, boxes.length));
  let stamp = 1;

  function maxHeightNear(px, pz, margin = 0) {
    stamp = (stamp + 1) | 0 || 1;
    let maxTop = 0;
    const x0 = Math.floor((px - margin) / B);
    const x1 = Math.floor((px + margin) / B);
    const z0 = Math.floor((pz - margin) / B);
    const z1 = Math.floor((pz + margin) / B);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const arr = buckets.get(keyOf(ix, iz));
        if (!arr) continue;
        for (let a = 0; a < arr.length; a++) {
          const idx = arr[a];
          if (seen[idx] === stamp) continue;
          seen[idx] = stamp;
          const b = boxes[idx];
          if (b.top <= maxTop) continue;
          const dx = px - b.cx;
          const dz = pz - b.cz;
          if (Math.abs(dx) > b.rad + margin || Math.abs(dz) > b.rad + margin) continue;
          const lx = dx * b.cos - dz * b.sin;
          const lz = dx * b.sin + dz * b.cos;
          const qx = Math.max(0, Math.abs(lx) - b.hw);
          const qz = Math.max(0, Math.abs(lz) - b.hd);
          if (qx * qx + qz * qz <= margin * margin) maxTop = b.top;
        }
      }
    }
    for (let i = 0; i < discs.length; i++) {
      const o = discs[i];
      if (o.top <= maxTop) continue;
      if (Math.hypot(px - o.cx, pz - o.cz) <= o.r + margin) maxTop = o.top;
    }
    return maxTop;
  }

  function hitsPoint(px, py, pz, pad = 0, heightScale = 1) {
    if (py < 2) return true;
    stamp = (stamp + 1) | 0 || 1;
    const x0 = Math.floor((px - pad) / B);
    const x1 = Math.floor((px + pad) / B);
    const z0 = Math.floor((pz - pad) / B);
    const z1 = Math.floor((pz + pad) / B);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const arr = buckets.get(keyOf(ix, iz));
        if (!arr) continue;
        for (let a = 0; a < arr.length; a++) {
          const idx = arr[a];
          if (seen[idx] === stamp) continue;
          seen[idx] = stamp;
          const b = boxes[idx];
          if (py > b.top * heightScale + pad || py < b.bot * heightScale - pad) continue;
          const dx = px - b.cx;
          const dz = pz - b.cz;
          const lx = dx * b.cos - dz * b.sin;
          const lz = dx * b.sin + dz * b.cos;
          if (Math.abs(lx) < b.hw + pad && Math.abs(lz) < b.hd + pad) return true;
        }
      }
    }
    for (let i = 0; i < discs.length; i++) {
      const o = discs[i];
      if (py <= o.top * heightScale + pad && Math.hypot(px - o.cx, pz - o.cz) < o.r + pad) return true;
    }
    return false;
  }

  function resolveSphere(pos, radius = 8, heightScale = 1) {
    let hit = false;
    if (pos.y < Math.max(6, radius * 0.75)) {
      pos.y = Math.max(6, radius * 0.75);
      hit = true;
    }
    for (let iter = 0; iter < 3; iter++) {
      stamp = (stamp + 1) | 0 || 1;
      const x0 = Math.floor((pos.x - radius) / B);
      const x1 = Math.floor((pos.x + radius) / B);
      const z0 = Math.floor((pos.z - radius) / B);
      const z1 = Math.floor((pos.z + radius) / B);
      for (let ix = x0; ix <= x1; ix++) {
        for (let iz = z0; iz <= z1; iz++) {
          const arr = buckets.get(keyOf(ix, iz));
          if (!arr) continue;
          for (let a = 0; a < arr.length; a++) {
            const idx = arr[a];
            if (seen[idx] === stamp) continue;
            seen[idx] = stamp;
            const b = boxes[idx];
            const top = b.top * heightScale;
            const bot = b.bot * heightScale;
            if (pos.y >= top + radius || pos.y <= bot - radius) continue;
            const dx = pos.x - b.cx;
            const dz = pos.z - b.cz;
            let lx = dx * b.cos - dz * b.sin;
            let lz = dx * b.sin + dz * b.cos;
            const ex = b.hw + radius;
            const ez = b.hd + radius;
            if (Math.abs(lx) >= ex || Math.abs(lz) >= ez) continue;
            hit = true;
            const penX = ex - Math.abs(lx);
            const penZ = ez - Math.abs(lz);
            const penTop = top + radius - pos.y;
            if (penTop < Math.min(penX, penZ) && penTop < radius * 1.5) {
              pos.y = top + radius;
            } else if (penX < penZ) {
              lx = (lx >= 0 ? 1 : -1) * ex;
              pos.x = b.cx + lx * b.cos + lz * b.sin;
              pos.z = b.cz - lx * b.sin + lz * b.cos;
            } else {
              lz = (lz >= 0 ? 1 : -1) * ez;
              pos.x = b.cx + lx * b.cos + lz * b.sin;
              pos.z = b.cz - lx * b.sin + lz * b.cos;
            }
          }
        }
      }
      for (let i = 0; i < discs.length; i++) {
        const o = discs[i];
        const top = o.top * heightScale;
        if (pos.y >= top + radius) continue;
        // let the camera fly cleanly under the central arch opening
        if (o.arch && pos.y < top * 0.62 && Math.hypot(pos.x - o.cx, pos.z - o.cz) < o.r * 0.55) continue;
        const dx = pos.x - o.cx;
        const dz = pos.z - o.cz;
        const dist = Math.hypot(dx, dz);
        const minR = o.r + radius;
        if (dist < minR) {
          hit = true;
          const penTop = top + radius - pos.y;
          if (penTop < minR - dist && penTop < radius * 1.5) {
            pos.y = top + radius;
          } else if (dist > 1e-4) {
            pos.x = o.cx + (dx / dist) * minR;
            pos.z = o.cz + (dz / dist) * minR;
          } else {
            pos.x = o.cx + minR;
          }
        }
      }
    }
    return hit;
  }

  return { maxHeightNear, hitsPoint, resolveSphere };
}

/** Street-level grit: kiosks, sheds, containers and light poles around a lot. */
function addGrit(push, rand, cx, cz, w, dp, d, scale = 1, rot = 0) {
  const n = Math.floor(rand() * 3.2 * d.clutter * scale);
  for (let k = 0; k < n; k++) {
    const gw = 3 + rand() * 7;
    const gd = 3 + rand() * 7;
    const gh = 2.5 + rand() * 6;
    push(
      cx + (rand() - 0.5) * w * 0.98,
      gh / 2,
      cz + (rand() - 0.5) * dp * 0.98,
      gw, gh, gd, rand(), KIND.SLAB, 2, rot
    );
  }
  // occasional light pole with a glowing tip
  if (rand() < 0.3 * d.clutter) {
    const px = cx + (rand() - 0.5) * w;
    const pz = cz + (rand() - 0.5) * dp;
    push(px, 7, pz, 0.8, 14, 0.8, rand(), KIND.MAST, 0, rot);
    push(px, 14.6, pz, 1.6, 1.2, 1.6, rand(), KIND.BAND, 0, rot);
  }
  // hanging street sign in busy quarters
  if (rand() < 0.16 * (d.signs || 0)) {
    const px = cx + (rand() - 0.5) * w;
    const pz = cz + (rand() - 0.5) * dp;
    push(px, 6, pz, 0.6, 12, 0.6, rand(), KIND.MAST, 0, rot);
    push(px, 11, pz, 6 + rand() * 6, 2.4, 1.2, rand(), KIND.SLAB, 2, rot);
  }
}

/** Landmark: tall tapering stack with emissive bands and a long mast. */
function addSpire(push, pushBeacon, rand, cx, cz, h01, d = { hMul: 1, clutter: 1 }) {
  const H = 520 + h01 * 380 + rand() * 120;
  const r0 = 22 + rand() * 12;
  const style = rand() < 0.35 ? 1 : 0;
  const rot = 0;
  const nSeg = 6 + Math.floor(rand() * 3);
  let y = 0;
  for (let i = 0; i < nSeg; i++) {
    const segH = H / nSeg;
    const t = i / (nSeg - 1);
    const r = r0 * (1 - t * 0.62) * (0.92 + rand() * 0.16);
    push(cx, y + segH / 2, cz, r * 2, segH, r * 2, rand(), KIND.WALL, style, rot);
    y += segH;
    if (i % 2 === 1) {
      push(cx, y + 0.8, cz, r * 2.35, 1.6, r * 2.35, rand(), KIND.BAND, style, rot);
    }
  }
  push(cx, y + 2, cz, r0 * 0.9, 4, r0 * 0.9, rand(), KIND.BAND, style, rot);
  const ah = 60 + rand() * 70;
  push(cx, y + 4 + ah / 2, cz, 2, ah, 2, rand(), KIND.MAST, style, rot);
  push(cx, y + 4 + ah + 1, cz, 1.6, 2, 1.6, rand(), KIND.BAND, style, rot);
  pushBeacon(cx, y + 4 + ah + 2.2, cz, rand());
}

/**
 * Choose a prominent downtown district where ENTIRE buildings are living
 * billboards and full-shaft holographic advertisements.
 */
function makeMediaZone(seed, radius, inWater, nearBoulevard, lmCells) {
  if (radius < 2) return null;
  const spanB = Math.max(1, Math.min(radius - 1, Math.round(radius * 0.65)));
  const zoneR = Math.max(CELL * 1.35, Math.min(CELL * 2.25, radius * CELL * 0.36));
  const name = MEDIA_NAMES[Math.floor(hash2i(13, 709, seed) * MEDIA_NAMES.length) % MEDIA_NAMES.length];
  for (let attempt = 0; attempt < 36; attempt++) {
    const bi = Math.floor(hash2i(attempt * 17 + 3, 719, seed) * (spanB * 2)) - spanB;
    const bj = Math.floor(hash2i(attempt * 19 + 5, 727, seed) * (spanB * 2)) - spanB;
    if (bi === 0 && bj === 0) continue;
    if (lmCells.has(bi + ',' + bj)) continue;
    const cx = bi * CELL + CELL * 0.5;
    const cz = bj * CELL + CELL * 0.5;
    if (inWater(cx, cz) || (attempt < 24 && nearBoulevard(cx, cz, 56))) continue;
    return { kind: 'media', name, x: cx, z: cz, r: zoneR, h: 170, bi, bj, towerCount: 0 };
  }
  return { kind: 'media', name, x: CELL * 1.5, z: -CELL * 0.5, r: zoneR, h: 170, bi: 1, bj: -1, towerCount: 0 };
}

/**
 * Street-level urban realm per block: stepped sidewalk promenade terrace,
 * corner transit/metro entrance canopies, bollard lights & pedestrian skywalks.
 */
function addBlockStreetscape(push, pushBeacon, pushSign, rand, i, j, x0, x1, z0, z1, d, inMedia, radius, lmCells, inWater) {
  const bw = x1 - x0;
  const bd = z1 - z0;
  if (bw < 24 || bd < 24) return;
  const cx = (x0 + x1) * 0.5;
  const cz = (z0 + z1) * 0.5;

  // Raised sidewalk promenade apron framing the urban block (style 4 = streetscape base)
  push(cx, 0.42, cz, bw + 6.4, 0.84, bd + 6.4, rand(), KIND.SLAB, 4, 0);

  // Corner transit shelter / metro stairs kiosk with illuminated fascia band
  if (inMedia || rand() < 0.46) {
    const sx = rand() < 0.5 ? -1 : 1;
    const sz = rand() < 0.5 ? -1 : 1;
    const kx = cx + sx * (bw * 0.5 - 3.2);
    const kz = cz + sz * (bd * 0.5 - 3.2);
    push(kx, 2.3, kz, 8.5, 4.6, 5.2, rand(), KIND.WALL, 4, 0);
    push(kx, 4.95, kz, 9.8, 0.75, 6.4, rand(), KIND.BAND, 4, 0);
    if (rand() < 0.65 || inMedia) {
      pushSign({ x: kx, y: 6.2, z: kz, w: 6.8, h: 2.2, d: 1.1, rot: 0, seed: rand() });
    }
  }

  // Sidewalk bollard / colonnade street posts along busy edges
  const posts = inMedia ? 4 : (rand() < 0.55 ? 2 : 0);
  for (let p = 0; p < posts; p++) {
    const alongX = p % 2 === 0;
    const side = p < 2 ? -1 : 1;
    const px = alongX ? cx + (rand() - 0.5) * bw * 0.72 : cx + side * (bw * 0.5 + 2.2);
    const pz = alongX ? cz + side * (bd * 0.5 + 2.2) : cz + (rand() - 0.5) * bd * 0.72;
    push(px, 2.6, pz, 0.75, 5.2, 0.75, rand(), KIND.MAST, 4, 0);
    push(px, 5.4, pz, 1.45, 0.75, 1.45, rand(), KIND.BAND, 4, 0);
  }

  // Elevated pedestrian skywalk bridging across minor streets (clears ground lanes easily at y=13m)
  const nextMinorX = streetWidth(i + 1) === STREET && i + 1 < radius && !lmCells.has(`${i + 1},${j}`);
  if (nextMinorX && (inMedia || (d.kind === 'dense' && rand() < 0.28))) {
    const bx = (i + 1) * CELL;
    const bz = cz + (rand() - 0.5) * bd * 0.35;
    if (!inWater(bx, bz)) {
      push(bx, 13.2, bz, STREET + 10, 3.4, 6.2, rand(), KIND.WALL, 4, 0);
      push(bx, 15.1, bz, STREET + 10, 0.55, 6.8, rand(), KIND.BAND, 4, 0);
    }
  }
}

/**
 * Distinct lower-level street base for buildings: colonnaded shopfront podium,
 * overhanging illuminated sidewalk canopies/awnings & eye-level blade signs.
 */
function addStreetBase(push, pushSign, rand, cx, cz, w, dp, d, rot = 0) {
  if (Math.min(w, dp) < 15) return;
  const podH = 9.5 + rand() * 5.8;
  const pw = w * 1.06;
  const pd = dp * 1.06;
  // Stepped street-arcade podium (style 4 renders double-height shopfronts + cornice)
  push(cx, podH * 0.5, cz, pw, podH, pd, rand(), KIND.WALL, 4, rot);
  // Cornice cap ledge separating lower street level from upper skyscraper shaft
  push(cx, podH + 0.55, cz, pw * 1.03, 1.1, pd * 1.03, rand(), KIND.SLAB, 4, rot);

  // Projecting shopfront awnings / colonnade canopies at y ~ 5.2m overhanging the sidewalk
  for (const side of [-1, 1]) {
    if (rand() < 0.78) {
      const [ax, az] = rotOff(cx, cz, 0, side * (pd * 0.5 + 1.6), rot);
      push(ax, 5.2, az, pw * 0.86, 0.85, 3.4, rand(), KIND.SLAB, 4, rot);
    }
    if (rand() < 0.55) {
      const [bx, bz] = rotOff(cx, cz, side * (pw * 0.5 + 1.6), 0, rot);
      push(bx, 5.2, bz, 3.4, 0.85, pd * 0.82, rand(), KIND.SLAB, 4, rot);
    }
  }

  // Street-level arcade colonnade piers framing the ground entrance
  if (Math.max(w, dp) > 22 && rand() < 0.7) {
    const piers = 3;
    for (let k = 0; k < piers; k++) {
      const off = ((k / (piers - 1)) - 0.5) * pw * 0.72;
      const [px, pz] = rotOff(cx, cz, off, pd * 0.5 + 0.85, rot);
      push(px, 2.6, pz, 1.35, 5.2, 1.35, rand(), KIND.SLAB, 4, rot);
    }
  }

  // Pedestrian-height hanging shop sign
  if (rand() < 0.45 + 0.25 * (d.signs || 0)) {
    const side = rand() < 0.5 ? -1 : 1;
    const [sx, sz] = rotOff(cx, cz, side * (pw * 0.5 + 1.8), (rand() - 0.5) * pd * 0.4, rot);
    pushSign({ x: sx, y: 6.8 + rand() * 2.4, z: sz, w: 1.6, h: 4.2 + rand() * 3.0, d: 4.5, rot, seed: rand() });
  }
}

/**
 * Media / Commercial Landmark Tower: dark architectural megastructure with
 * selective framed LED screens, asymmetric staggered billboards & restrained
 * accent holograms (never uniform 4-sided checkerboard stacks!).
 */
function addMediaTower(push, pushBeacon, pushBill, pushSign, pushHolo, rand, x0, x1, z0, z1, h01, baseAngle = 0) {
  const w0 = x1 - x0;
  const d0 = z1 - z0;
  if (w0 < 14 || d0 < 14) return null;
  const cx = (x0 + x1) * 0.5;
  const cz = (z0 + z1) * 0.5;
  const rot = baseAngle * 0.25 + (rand() - 0.5) * 0.10;
  const w = Math.max(16, w0 * 0.86);
  const dp = Math.max(16, d0 * 0.86);
  const H = Math.max(98, Math.min(350, (112 + 225 * h01) * (0.72 + rand() * 0.56)));

  // Street-level arcade & marquee canopy base
  addStreetBase(push, pushSign, rand, cx, cz, w, dp, { signs: 1.5 }, rot);

  // Architectural dark shaft + selective style=3 upper/mid media volume
  const archKind = Math.floor(rand() * 3);
  const hMain = H * 0.68;
  const hCrown = H * 0.32;
  const lowStyle = archKind === 0 ? 3 : (rand() < 0.5 ? 0 : 2);
  const topStyle = archKind === 0 ? 0 : 3;
  push(cx, hMain * 0.5, cz, w, hMain, dp, rand(), KIND.WALL, lowStyle, rot);
  push(cx, hMain + 1.0, cz, w * 1.04, 2.0, dp * 1.04, rand(), KIND.BAND, 3, rot);
  push(cx, hMain + hCrown * 0.5, cz, w * 0.76, hCrown, dp * 0.76, rand(), KIND.WALL, topStyle, rot);
  push(cx, H + 1.1, cz, w * 0.80, 2.2, dp * 0.80, rand(), KIND.SLAB, 2, rot);

  // Asymmetric billboards (2 to 4 varied panels on 1-2 faces — leaving dark architecture visible!)
  const priSide = rand() < 0.5 ? -1 : 1;
  const secSide = rand() < 0.5 ? -1 : 1;
  if (archKind === 0) {
    // Tall portrait hero screen on primary face + low horizontal marquee on adjacent face
    const [bx1, bz1] = rotOff(cx, cz, priSide * (w * 0.5 + 1.1), (rand() - 0.5) * dp * 0.18, rot);
    pushBill({ x: bx1, y: Math.max(48, H * 0.52), z: bz1, w: 2.0, h: Math.min(56, H * 0.36), d: dp * 0.56, rot, seed: rand() });
    const [bx2, bz2] = rotOff(cx, cz, 0, secSide * (dp * 0.5 + 1.1), rot);
    pushBill({ x: bx2, y: 46 + rand() * 14, z: bz2, w: w * 0.78, h: 12 + rand() * 7, d: 2.0, rot, seed: rand() });
  } else if (archKind === 1) {
    // Staggered corner L-ribbons at two distinct altitudes
    const yA = 46 + rand() * 18;
    const yB = Math.max(yA + 28, H * 0.68);
    const [bx1, bz1] = rotOff(cx, cz, priSide * (w * 0.5 + 1.1), 0, rot);
    const [bx2, bz2] = rotOff(cx, cz, 0, secSide * (dp * 0.38 + 1.1), rot);
    pushBill({ x: bx1, y: yA, z: bz1, w: 2.0, h: 13 + rand() * 8, d: dp * 0.82, rot, seed: rand() });
    pushBill({ x: bx2, y: yB, z: bz2, w: w * 0.68, h: 15 + rand() * 10, d: 2.0, rot, seed: rand() });
    if (rand() < 0.65) {
      const [bx3, bz3] = rotOff(cx, cz, -priSide * (w * 0.38 + 1.1), 0, rot);
      pushBill({ x: bx3, y: Math.max(50, H * 0.80), z: bz3, w: 2.0, h: 16 + rand() * 9, d: dp * 0.58, rot, seed: rand() });
    }
  } else {
    // Twin staggered widescreen panels + low canyon sign
    const [bx1, bz1] = rotOff(cx, cz, 0, priSide * (dp * 0.5 + 1.1), rot);
    const [bx2, bz2] = rotOff(cx, cz, secSide * (w * 0.5 + 1.1), 0, rot);
    pushBill({ x: bx1, y: Math.max(46, H * 0.38), z: bz1, w: w * 0.76, h: 16 + rand() * 10, d: 2.0, rot, seed: rand() });
    pushBill({ x: bx2, y: Math.max(68, H * 0.66), z: bz2, w: 2.0, h: 20 + rand() * 12, d: dp * 0.64, rot, seed: rand() });
    const [sx1, sz1] = rotOff(cx, cz, 0, -priSide * (dp * 0.5 + 1.1), rot);
    pushSign({ x: sx1, y: 22 + rand() * 8, z: sz1, w: w * 0.68, h: 9 + rand() * 5, d: 1.8, rot, seed: rand() });
  }

  // Single vertical blade fin on one corner (not all 4 corners!)
  if (rand() < 0.68) {
    const [fx, fz] = rotOff(cx, cz, priSide * (w * 0.5 + 2.2), secSide * (dp * 0.5 + 2.2), rot);
    pushSign({ x: fx, y: H * 0.38, z: fz, w: 2.6, h: Math.min(48, H * 0.34), d: 6.5, rot: rot + Math.PI * 0.25 * priSide * secSide, seed: rand() });
  }

  // Restrained holographic accent on ~55% of media towers (compact scale, never enveloping whole blocks!)
  if (rand() < 0.58) {
    const onRoof = rand() < 0.55;
    pushHolo({
      x: cx,
      y: onRoof ? H + 20 + rand() * 14 : H * (0.55 + rand() * 0.2),
      baseY: onRoof ? H : 14,
      z: cz,
      w: Math.max(38, Math.max(w, dp) * (onRoof ? 0.96 : 1.16)),
      h: onRoof ? 26 + rand() * 12 : 28 + rand() * 16,
      rot: rot + (onRoof ? Math.PI * 0.25 : 0),
      seed: rand(),
      kind: onRoof ? 'panel' : 'cylinder',
    });
  }
  pushBeacon(cx, H + 6, cz, rand());
  return { x: cx, z: cz, w, d: dp, h: H };
}

