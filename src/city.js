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
export const LM_KINDS = [
  'arch', 'spire', 'dome', 'mast', 'crown', 'needle',
  'pyramid', 'cantilever', 'ziggurat',
  'hanging_gardens', 'brutalist_habitat', 'neo_ziggurat',
  'inverted_ziggurat', 'helix_arcology', 'torus_ring', 'metabolism_tree',
];

const LM_NAMES = {
  arch: ['Meridian Gate', 'Sunset Arc', 'Harbor Arch', 'The Gateway', 'Twin Curve', 'Old Mill Arch'],
  spire: ['Zenith Spire', 'Aurora Spire', 'Skyline Needle', 'Pillar of Dawn', 'Vantage Spire', 'The Obelisk'],
  dome: ['Atlas Dome', 'Civic Rotunda', 'Weather Dome', 'Grand Conservatory', 'Solarium', 'The Vault'],
  mast: ['Signal Crown', 'Broadcast One', 'Relay Tower', 'North Mast', 'Sky Radio', 'The Aerial'],
  crown: ['Imperial Terrace', 'Regalia Tower', 'Stepped Palace', 'Court of Blocks', 'High Terrace', 'Sovereign Crown'],
  needle: ['Needle Nine', 'Orbital Needle', 'Slim Jim', 'The Lancet', 'Pin Tower', 'Vector Needle'],
  pyramid: ['Solaris Pyramid', 'Apex Arcology', 'Obsidian Pyramid', 'Aethelgard Tetrahedron', 'Helios Arcology', 'Sun Pyramid'],
  cantilever: ['Skywing Cantilever', 'Overhang Citadel', 'Horizon Cantilever', 'Cloudbridge Wing', 'Aerie Overhang', 'Kestrel Tower'],
  ziggurat: ['Babylon Ziggurat', 'Nineveh Steps', 'Cascading Sanctum', 'Etemenanki Vault', 'Seven-Step Ziggurat', 'Sumerian Terrace'],
  hanging_gardens: ['Hanging Gardens Sanctuary', 'Semiramis Sky-Cascades', 'Verdant Gorge Terraces', 'Eden Biophilic Ziggurat', 'Sylvan Waterfall Vault', 'Botanical Sky-Amphitheatre'],
  brutalist_habitat: ['Habitat 2099 Complex', 'Beton Brut Sky-Commune', 'Modular Collective Block', 'Unite Concrete Megablock', 'Sky-Street Brutalist Ward', 'Cantilever Capsule Complex'],
  neo_ziggurat: ['Uruk-9 Split Megaziggurat', 'Akkadian Chasm Ziggurat', 'Ziggurat of the Zenith', 'Nanna Twin-Bastion', 'Epoch Stepped Monolith', 'Astrolabe Ziggurat'],
  inverted_ziggurat: ['Inverted Ziggurat Ministry', 'Counter-Gravity Citadel', 'The Anvil Monolith', 'Upside-Down Sky-Fortress', 'Overhang Archive', 'Crown-Heavy Ziggurat'],
  helix_arcology: ['Double-Helix Bio-Arcology', 'Caduceus Spiral Tower', 'Genome Sky-Sanctuary', 'Helix Conservatory Spire', 'Twisted Strand Citadel', 'Bio-Spiral Nine'],
  torus_ring: ['Ouroboros Sky-Ring', 'Chronos Loop Megastructure', 'Orbital Ring Forum', 'Halo Sky-Citadel', 'Solstice Ring Hotel', 'The Great Sky-Wheel'],
  metabolism_tree: ['Metabolist Sky-Tree', 'Yggdrasil Pod Arcology', 'Suspended Lantern Tower', 'Banyan Cloud Megastructure', 'Canopy Bough Spire', 'Arboreal Pod Citadel'],
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

export const WATER_MODE_NAMES = [
  'Harbor & Winding River',
  'Coastal Ocean & Harbor',
  'Archipelago & Islands',
  'Great Crater Lake',
  'No Shoreline (Dry Basin)',
];

export const TERRAIN_MODE_NAMES = [
  'Distant Mountains',
  'Desert Dunes & Mesas',
  'Rolling Farmland Hills',
  'Volcanic Caldera Rim',
  'Flat Horizon Plain',
];

const fract = (v) => v - Math.floor(v);
const smoothstep01 = (a, b, x) => {
  const t = clamp01((x - a) / (b - a || 1));
  return t * t * (3 - 2 * t);
};

/**
 * Shared JS/GLSL harmonic wave-FBM (bounded arguments, zero axis-grid seams,
 * and <0.01m agreement with GLSL highp sin/cos across the entire 27km world).
 */
export function envWaveFbm(px, pz, sx = 0, sz = 0) {
  let x = px * 0.00052 + sx * 0.17;
  let z = pz * 0.00052 + sz * 0.17;
  let sum = 0;
  let amp = 0.52;
  for (let i = 0; i < 4; i++) {
    const v = Math.sin(x) * Math.cos(z) + 0.55 * Math.sin(x * 1.37 - z * 1.19 + 1.1);
    sum += amp * (v / 1.55);
    const nx = (x * 0.8 - z * 0.6) * 2.03 + 1.73;
    const nz = (x * 0.6 + z * 0.8) * 2.03 - 1.31;
    x = nx;
    z = nz;
    amp *= 0.5;
  }
  return sum; // roughly [-1, 1]
}

/**
 * Shared JS/GLSL ridged-multifractal basis in [0, 1] for jagged alpine peaks
 * and eroded caldera ridges.
 */
export function envRidgeFbm(px, pz, sx = 0, sz = 0) {
  let x = px * 0.00046 + sx * 0.23 + 2.4;
  let z = pz * 0.00046 - sz * 0.19 - 1.8;
  let sum = 0;
  let amp = 0.54;
  let weight = 1.0;
  for (let i = 0; i < 4; i++) {
    const raw = (Math.sin(x) * Math.cos(z) + 0.6 * Math.cos(x * 1.29 + z * 1.41 - 0.7)) / 1.6;
    let r = 1.0 - Math.abs(raw);
    r = r * r * weight;
    weight = clamp01(r * 1.35);
    sum += r * amp;
    const nx = (x * 0.8 - z * 0.6) * 2.11 + 2.31;
    const nz = (x * 0.6 + z * 0.8) * 2.11 + 0.97;
    x = nx;
    z = nz;
    amp *= 0.5;
  }
  return clamp01(sum * 1.08);
}

/**
 * Signed land distance (> 0 = land, < 0 = open sea/lake) for large water modes:
 *   0: Harbor & Winding River (handled by polygon water bodies -> +9999 here)
 *   1: Coastal Ocean & Bay (vast sea on one FBM-sculpted side + downtown bay cove)
 *   2: Archipelago & Peninsula (sea wrapping ~230 deg around peninsula + 4 offshore islands)
 *   3: Great Crater Lake (expansive organic lake nestled between suburbs & foothills)
 *   4: Dry Arid Basin (+9999 everywhere)
 */
export function evalCoastSignedDist(
  px, pz, coreSpan = 750, coastAngle = 0.7, waterMode = 0,
  sx = 0, sz = 0, shoreDist = 1.0, waterAmount = 1.0
) {
  if (waterAmount <= 0.005 || waterMode === 0 || waterMode === 4) return 9999.0;
  const ca = Math.cos(coastAngle);
  const sa = Math.sin(coastAngle);
  const u = px * ca + pz * sa;
  const v = -px * sa + pz * ca;
  const sdMul = Math.max(shoreDist ?? 1.0, 0.30);
  const amtScale = 0.55 + 0.45 * Math.min(2.0, Math.max(0.0, waterAmount ?? 1.0));
  const warp = Math.sin(v * 0.00058 + sx) * 410.0
    + Math.cos(v * 0.00131 - sz) * 195.0
    + Math.sin(v * 0.00285 + sx * 1.7) * 82.0;
  const bayIndent = -255.0 * amtScale * Math.exp(-(v * v) / (690.0 * 690.0));

  if (waterMode === 1) {
    const shoreU = Math.max(320.0, coreSpan * 0.94 * sdMul) + warp + bayIndent;
    return shoreU - u;
  }
  if (waterMode === 2) {
    const baseSpan = Math.max(360.0, coreSpan * 1.02 * sdMul);
    const penDist = (baseSpan + warp * 0.84 + bayIndent * 0.65) - (u + 0.000115 * v * v);
    let best = penDist;
    // 4 scenic hilly offshore islands out in the archipelago sea
    for (let k = 0; k < 4; k++) {
      const iu = baseSpan + 1150.0 + k * 760.0 + Math.sin(sx + k * 2.1) * 260.0;
      const iv = ((k % 2 === 0 ? 1 : -1) * (680.0 + k * 540.0)) + Math.cos(sz + k * 1.7) * 320.0;
      const ir = 340.0 + (k === 1 ? 210.0 : k * 55.0);
      const du = u - iu;
      const dv = v - iv;
      const ang = Math.atan2(dv, du);
      const iWarp = Math.sin(ang * 3.0 + k * 1.9 + sx) * 68.0 + Math.cos(ang * 5.0 - sz) * 34.0;
      const islDist = (ir + iWarp) - Math.hypot(du, dv);
      if (islDist > best) best = islDist;
    }
    return best;
  }
  if (waterMode === 3) {
    const lakeU = Math.max(950.0, coreSpan * 2.25 * sdMul);
    const lakeR = Math.max(680.0, coreSpan * 1.32 * amtScale);
    const du = u - lakeU;
    const dv = v * 0.82;
    const ang = Math.atan2(dv, du);
    const lWarp = Math.sin(ang * 3.0 + sx) * 185.0 + Math.cos(v * 0.0019 + sz) * 125.0;
    return (Math.hypot(du, dv) + lWarp) - lakeR;
  }
  return 9999.0;
}

/**
 * Exact coastal shoreline coordinate `u` (along coastAngle) at lateral offset `v`
 * where `evalCoastSignedDist === 0`, accounting for `shoreDist`, `waterAmount`,
 * multi-harmonic coastal warp, bay indentation, and peninsula curvature.
 */
export function evalExactCoastShoreU(
  v, coreSpan = 750, waterMode = 1, sx = 0, sz = 0, shoreDist = 1.0, waterAmount = 1.0
) {
  const sdMul = Math.max(shoreDist ?? 1.0, 0.30);
  const amtScale = 0.55 + 0.45 * Math.min(2.0, Math.max(0.0, waterAmount ?? 1.0));
  const warp = Math.sin(v * 0.00058 + sx) * 410.0
    + Math.cos(v * 0.00131 - sz) * 195.0
    + Math.sin(v * 0.00285 + sx * 1.7) * 82.0;
  const bayIndent = -255.0 * amtScale * Math.exp(-(v * v) / (690.0 * 690.0));
  if (waterMode === 2) {
    const baseSpan = Math.max(360.0, coreSpan * 1.02 * sdMul);
    return (baseSpan + warp * 0.84 + bayIndent * 0.65) - 0.000115 * v * v;
  }
  return Math.max(320.0, coreSpan * 0.94 * sdMul) + warp + bayIndent;
}

/**
 * Closed-form O(1) signed distance to the meandering river channel (> 0 = dry bank, < 0 = inside river).
 * Shared 1-to-1 with `evalRiverSignedDist` in `GLSL_TERRAIN` (`src/shaders.js`) so streets,
 * sidewalks, suburban sprawl, and terrain riverbeds respect the river everywhere!
 */
export function evalRiverSignedDist(px, pz, rf) {
  if (!rf || !rf.active) return 9999.0;
  const ca = Math.cos(rf.rAng);
  const sa = Math.sin(rf.rAng);
  const dx = px - rf.startX;
  const dz = pz - rf.startZ;
  const u = dx * ca + dz * sa;
  const v = -dx * sa + dz * ca;
  const uMin = rf.uMin ?? -260.0;
  const maxLen = rf.maxLen || 4800.0;
  const uC = Math.max(uMin, Math.min(maxLen, u));
  const t = Math.max(0.0, Math.min(1.0, uC / maxLen));
  const sx = rf.sx || 0;
  const sz = rf.sz || 0;
  const latBias = rf.latBias || 0;
  const amtScale = rf.amtScale || 1.0;

  const sBend1 = Math.sin(uC * 0.00155 + sx);
  const sBend2 = Math.cos(uC * 0.00068 - sz);
  const sBend3 = Math.sin(uC * 0.00310 + sx * 1.7);
  const meander = latBias * t
    + sBend1 * (115.0 + t * 255.0)
    + sBend2 * (55.0 + t * 165.0)
    + sBend3 * (22.0 + t * 38.0);
  const dMeander = latBias / maxLen
    + Math.cos(uC * 0.00155 + sx) * 0.00155 * (115.0 + t * 255.0)
    - Math.sin(uC * 0.00068 - sz) * 0.00068 * (55.0 + t * 165.0)
    + Math.cos(uC * 0.00310 + sx * 1.7) * 0.00310 * (22.0 + t * 38.0);

  const perpDist = Math.abs(v - meander) / Math.sqrt(1.0 + dMeander * dMeander);
  const uExcess = u < uMin ? (uMin - u) : (u > maxLen ? (u - maxLen) : 0.0);
  const distToCenter = uExcess > 0.0 ? Math.hypot(perpDist, uExcess) : perpDist;

  const bendSwelling = Math.abs(sBend1) * 14.0 + (1.0 - Math.min(1.0, Math.max(0.0, t) * 3.5)) * 18.0;
  const mouthFlare = rf.oceanMouth ? (56.0 * (1.0 - smoothstep01(-180.0, 95.0, uC))) : 0.0;
  const halfW = (34.0 + t * 44.0 + bendSwelling + mouthFlare + Math.sin(uC * 0.0085 + sx) * 6.0) * amtScale;
  return distToCenter - halfW;
}

/**
 * Shared JS/GLSL 3D procedural terrain elevation (metres).
 * Strictly 0 inside the urban core basin so streets/skyscrapers/traffic stay
 * level; dips below 0 under large water bodies so shoreline meshes intersect
 * smoothly; rises into mountains, desert dunes & mesas, rolling hills, or
 * volcanic caldera ridges in the distance.
 */
export function evalTerrainHeight(
  px, pz,
  coreSpan = 750, suburbSpan = 5200,
  terrainMode = 0, terrainScale = 1,
  coastAngle = 0.7, waterMode = 0,
  sx = 0, sz = 0,
  shoreDist = 1.0, waterAmount = 1.0
) {
  const coastDist = evalCoastSignedDist(px, pz, coreSpan, coastAngle, waterMode, sx, sz, shoreDist, waterAmount);
  if (coastDist < 0) {
    // Smooth bathymetric slope below sea level (analytical water sits below y = 0)
    return -18.0 * smoothstep01(0.0, 240.0, -coastDist);
  }

  const r = Math.hypot(px, pz);
  const shoreEase = smoothstep01(0.0, 290.0, coastDist);

  // Offshore archipelago islands get lush/rocky 3D peaks even if terrainScale is gentle
  const ca = Math.cos(coastAngle);
  const sa = Math.sin(coastAngle);
  const u = px * ca + pz * sa;
  if (waterMode === 2 && u > Math.max(360.0, coreSpan * 1.02 * Math.max(shoreDist, 0.30)) + 520.0) {
    const islPeak = smoothstep01(0.0, 360.0, coastDist);
    const islRidge = envRidgeFbm(px * 1.8, pz * 1.8, sx, sz);
    return islPeak * (34.0 + 135.0 * islRidge) * Math.max(0.45, terrainScale);
  }

  if (terrainMode === 4 || terrainScale <= 0.001) return 0.0;

  // Organic warped urban basin radius so foothills wrap non-circularly around the city
  const wVal = envWaveFbm(px, pz, sx, sz);
  const basinR = Math.max(920.0, coreSpan * 1.28) + wVal * 320.0;
  if (r <= basinR) return 0.0;

  // Carve 4 natural valley highway passes radiating out from the city
  const ang = Math.atan2(pz, px);
  const passWave = Math.abs(Math.sin((ang - coastAngle * 0.5) * 2.0 + wVal * 0.55));
  const valleyCarve = 0.34 + 0.66 * smoothstep01(0.14, 0.58, passWave);
  const horizonTaper = 1.0 - 0.35 * smoothstep01(10200.0, 13400.0, r);
  const scale = terrainScale * shoreEase * horizonTaper;

  if (terrainMode === 0) {
    // Distant Alpine Mountains + Foothills
    const footRamp = smoothstep01(basinR, basinR + 2100.0, r);
    const mtnRamp = smoothstep01(Math.max(basinR + 900.0, suburbSpan * 0.58), Math.max(basinR + 3800.0, suburbSpan * 1.08), r);
    const ridge = envRidgeFbm(px, pz, sx, sz);
    const detail = envWaveFbm(px * 2.35, pz * 2.35, sx + 3.1, sz - 2.4) * 0.5 + 0.5;
    const foothills = footRamp * (28.0 + 95.0 * detail) * valleyCarve;
    const peaks = mtnRamp * (240.0 + 860.0 * Math.pow(ridge, 1.35)) * (0.42 + 0.58 * valleyCarve);
    return (foothills + peaks) * scale;
  }
  if (terrainMode === 1) {
    // Sweeping Desert Sand Dunes + Flat-Topped Stratified Mesas / Buttes
    const duneRamp = smoothstep01(basinR, basinR + 1450.0, r);
    const mesaRamp = smoothstep01(Math.max(basinR + 1100.0, suburbSpan * 0.55), Math.max(basinR + 3400.0, suburbSpan * 1.02), r);
    // Asymmetric wind-rippled transverse dunes
    const windU = (px * 0.82 - pz * 0.57) * 0.0046 + wVal * 2.4;
    const sDune = Math.sin(windU);
    const duneCrest = Math.pow(0.5 + 0.5 * Math.sin(windU - 0.42 * sDune), 1.65);
    const dunes = duneRamp * (18.0 + 68.0 * duneCrest * (0.55 + 0.45 * (wVal * 0.5 + 0.5)));
    // Flat-topped terraced mesas & isolated desert monument buttes
    const mesaField = envWaveFbm(px * 0.72 + 910.0, pz * 0.72 - 640.0, sx, sz) * 0.5 + 0.5;
    const tier1 = smoothstep01(0.56, 0.64, mesaField);
    const tier2 = smoothstep01(0.71, 0.77, mesaField);
    const mesas = mesaRamp * (tier1 * 235.0 + tier2 * 185.0) * valleyCarve;
    return (dunes + mesas) * scale;
  }
  if (terrainMode === 2) {
    // Rolling Pastoral Farmland Hills & Valleys
    const hillRamp = smoothstep01(basinR, basinR + 1500.0, r);
    const outerRise = smoothstep01(basinR + 2200.0, basinR + 5600.0, r);
    const h1 = envWaveFbm(px * 0.85, pz * 0.85, sx, sz) * 0.5 + 0.5;
    const h2 = envWaveFbm(px * 2.1, pz * 2.1, sx - 1.9, sz + 2.7) * 0.5 + 0.5;
    return hillRamp * (14.0 + 78.0 * h1 + outerRise * 105.0 * h1 * h2) * valleyCarve * scale;
  }
  if (terrainMode === 3) {
    // Volcanic Caldera Rim & Eroded Badlands
    const rimCenter = Math.max(basinR + 2900.0, suburbSpan * 0.92);
    const dRim = (r + wVal * 520.0 - rimCenter) / 1650.0;
    const craterRing = Math.exp(-dRim * dRim);
    const gully = envRidgeFbm(px * 1.45, pz * 1.45, sx, sz);
    const badlands = smoothstep01(basinR, basinR + 1600.0, r) * 58.0 * gully;
    return (badlands + craterRing * (310.0 + 560.0 * gully) * (0.45 + 0.55 * valleyCarve)) * scale;
  }
  return 0.0;
}

/**
 * Shared JS/GLSL irregular 2D Voronoi field partition for rural patchwork
 * farmland (returns cell center, distance to nearest field boundary hedgerow,
 * and deterministic furrow angle + crop variety in [0, 1]).
 */
export function evalVoronoiField(px, pz, sx = 0, sz = 0) {
  const S = 320.0;
  const gx = Math.floor(px / S);
  const gz = Math.floor(pz / S);
  const fx = px / S - gx;
  const fz = pz / S - gz;
  let d1 = 99.0;
  let d2 = 99.0;
  let bestX = 0;
  let bestZ = 0;
  let bestHash = 0.5;
  for (let oz = -1; oz <= 1; oz++) {
    for (let ox = -1; ox <= 1; ox++) {
      const cx = gx + ox;
      const cz = gz + oz;
      const hA = fract(Math.sin(cx * 1.73 + cz * 2.91 + sx * 0.37) * 43.758);
      const hB = fract(Math.cos(cx * 2.47 - cz * 1.83 + sz * 0.41) * 37.913);
      const jx = ox + 0.14 + 0.72 * hA - fx;
      const jz = oz + 0.14 + 0.72 * hB - fz;
      const d = Math.hypot(jx, jz);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        bestX = (gx + ox + 0.14 + 0.72 * hA) * S;
        bestZ = (gz + oz + 0.14 + 0.72 * hB) * S;
        bestHash = hA;
      } else if (d < d2) {
        d2 = d;
      }
    }
  }
  return {
    cx: bestX,
    cz: bestZ,
    edgeDist: (d2 - d1) * S * 0.5, // metres to field boundary
    angle: bestHash * Math.PI,
    crop: fract(bestHash * 7.31),
  };
}

function smoothstep(e0, e1, x) {
  const t = clamp01((x - e0) / (e1 - e0 || 1));
  return t * t * (3 - 2 * t);
}

function distToPolyEdges(px, pz, pts) {
  let best = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const d = distToSeg(px, pz, pts[j][0], pts[j][1], pts[i][0], pts[i][1]);
    if (d < best) best = d;
  }
  return best;
}

/**
 * Shared analytical curvilinear road-web & surveyor trapezoid subdivision
 * (matches `evalRoadWeb` in `src/shaders.js` 1-to-1 so highways, collector
 * rings, trapezoid parcels, corridor towers, suburban house rows & furrows align!).
 */
export function evalRoadWeb(px, pz, sx = 0, sz = 0) {
  const r = Math.hypot(px, pz);
  const ang = Math.atan2(pz, px);
  const angWarp = ang
    + 0.135 * Math.sin(r * 0.00062 + sx) * Math.cos(ang * 2.0 - sz)
    + 0.075 * Math.cos(r * 0.00125 - sz * 0.7) * Math.sin(ang * 3.0 + sx);
  const uRoad = angWarp * (12.0 / (Math.PI * 2));
  const flU = Math.floor(uRoad);
  const fu = uRoad - flU;
  const cellU = ((flU % 12) + 12) % 12;

  const spanU = (Math.PI * 2 * Math.max(r, 180.0)) / 12.0;
  const dArt = Math.min(fu, 1.0 - fu) * spanU;

  const rUndul = r
    + 135.0 * Math.sin(ang * 3.0 + sx * 1.1)
    + 78.0 * Math.cos(ang * 5.0 - sz * 1.3 + r * 0.00055)
    + 65.0 * Math.sin(ang * 4.0 - sx * 0.6 + r * 0.0004);
  const vRoad = rUndul / 380.0;
  const cellV = Math.floor(vRoad);
  const fv = vRoad - cellV;
  const dRing = Math.min(fv, 1.0 - fv) * 380.0;

  const secHash = fract(Math.sin(cellU * 19.31 + sx * 2.17) * 43758.5453);
  const corrProm = smoothstep(0.32, 0.88, secHash);
  const corrMask = Math.exp(-((dArt / (115.0 + 95.0 * corrProm)) ** 2)) * corrProm;

  return { cellU, cellV, fu, fv, dArt, dRing, spanU, r, ang, corrProm, corrMask };
}

/**
 * Exact water-body test covering BOTH analytical macro shorelines (ocean, bay,
 * archipelago channels, crater lake) AND polygonal water bodies (harbor lagoons
 * and meandering rivers), with optional safety shoreline margin `pad` (metres).
 */
export function isPointInWater(city, x, z, pad = 0) {
  if (!city) return false;
  if ((city.waterAmount ?? 1) <= 0.005 || city.waterMode === 4) return false;
  const coreSpan = (city.radius || 5) * CELL;
  const coastDist = evalCoastSignedDist(
    x, z, coreSpan,
    city.coastAngle ?? 0, city.waterMode ?? 0,
    city.terrainSeedX ?? 0, city.terrainSeedZ ?? 0,
    city.shoreDist ?? 1.0, city.waterAmount ?? 1.0
  );
  if (coastDist < pad) return true;
  const waters = city.water || [];
  for (let k = 0; k < waters.length; k++) {
    const w = waters[k];
    if (w.analytical || !w.pts || w.pts.length < 3) continue;
    if (pointInPoly(x, z, w.pts)) return true;
    if (pad > 0 && distToPolyEdges(x, z, w.pts) < pad) return true;
  }
  return false;
}

/**
 * Grow the city.
 * Accepts either positional `(seed, radius, suburbReach, waterMode, terrainMode, terrainScale)`
 * or an options object `{ seed, radius, suburbReach, waterMode, terrainMode, terrainScale }`.
 */
export function generateCity(
  seedOrOpts = 4417,
  radiusArg = 13,
  suburbReachArg = 1.0,
  waterModeArg = 0,
  terrainModeArg = 0,
  terrainScaleArg = 1.0
) {
  const opts = (seedOrOpts && typeof seedOrOpts === 'object') ? seedOrOpts : null;
  const seed = opts ? (opts.seed ?? 4417) : seedOrOpts;
  const radius = opts ? (opts.radius ?? 13) : radiusArg;
  const suburbReach = opts ? (opts.suburbReach ?? 1.0) : suburbReachArg;
  const waterMode = Math.max(0, Math.min(4, Math.round(opts ? (opts.waterMode ?? 0) : waterModeArg)));
  const waterAmount = Math.max(0, Math.min(2.5, Number.isFinite(opts?.waterAmount) ? opts.waterAmount : 1.0));
  const shoreDist = Math.max(0.30, Math.min(2.8, Number.isFinite(opts?.shoreDist) ? opts.shoreDist : 1.0));
  const terrainMode = Math.max(0, Math.min(4, Math.round(opts ? (opts.terrainMode ?? 0) : terrainModeArg)));
  const terrainScale = Math.max(0, Math.min(2.5, Number.isFinite(opts ? opts.terrainScale : terrainScaleArg) ? (opts ? opts.terrainScale : terrainScaleArg) : 1.0));
  const vegCover = Math.max(0, Math.min(2.5, Number.isFinite(opts?.vegCover) ? opts.vegCover : 1.0));
  const vegScale = Math.max(0.4, Math.min(4.5, Number.isFinite(opts?.vegScale) ? opts.vegScale : 1.0));
  const transitAmt = Math.max(0, Math.min(2.5, Number.isFinite(opts?.transitAmt) ? opts.transitAmt : 1.0));
  const maritimeAmt = Math.max(0, Math.min(2.5, Number.isFinite(opts?.maritimeAmt) ? opts.maritimeAmt : 1.0));
  const airAmt = Math.max(0, Math.min(2.5, Number.isFinite(opts?.airAmt) ? opts.airAmt : 1.0));
  const signAmt = Math.max(0, Math.min(2.5, Number.isFinite(opts?.signAmt) ? opts.signAmt : 1.0));
  const megaWrap = Math.max(0, Math.min(2.0, Number.isFinite(opts?.megaWrap) ? opts.megaWrap : 1.0));

  const coastAngle = hash2i(79, 23, seed) * Math.PI * 2;
  const terrainSeedX = (hash2i(71, 13, seed) - 0.5) * 16.0;
  const terrainSeedZ = (hash2i(73, 17, seed) - 0.5) * 16.0;

  const noise = makeNoise2D(seed ^ 0x9e3779b9);
  const items = [];
  const beacons = [];
  let towers = 0;

  const coreSpan = radius * CELL;
  const coastDistAt = (x, z) => evalCoastSignedDist(
    x, z, coreSpan, coastAngle, waterMode, terrainSeedX, terrainSeedZ, shoreDist, waterAmount
  );

  // Voronoi-ish structure: relaxed sites give the city its large-scale
  // division (water, parks, cores) and break the pure grid.
  const sites = makeSites(seed, radius);
  const water = makeWaters(seed, sites, radius, waterMode, coastAngle, terrainSeedX, terrainSeedZ, shoreDist, waterAmount);
  const boulevards = makeBoulevards(seed, radius);

  // Precompute bounding boxes + 280m spatial edge grid for polygonal water bodies (harbors + rivers)
  // Any point inside a river/harbor or within `pad` of its bank is <260m from a bank edge,
  // giving O(1) water rejection across 95% of the 16km countryside!
  const polyWaters = [];
  const WG = 280;
  const waterCells = new Set();
  for (let k = 0; k < water.length; k++) {
    const w = water[k];
    if (w.analytical || !w.pts || w.pts.length < 3) continue;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let p = 0; p < w.pts.length; p++) {
      const px = w.pts[p][0], pz = w.pts[p][1];
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (pz < minZ) minZ = pz;
      if (pz > maxZ) maxZ = pz;
    }
    polyWaters.push({ pts: w.pts, minX, maxX, minZ, maxZ });
    for (let i = 0, j = w.pts.length - 1; i < w.pts.length; j = i++) {
      const x0 = Math.min(w.pts[j][0], w.pts[i][0]) - WG;
      const x1 = Math.max(w.pts[j][0], w.pts[i][0]) + WG;
      const z0 = Math.min(w.pts[j][1], w.pts[i][1]) - WG;
      const z1 = Math.max(w.pts[j][1], w.pts[i][1]) + WG;
      const gx0 = Math.floor(x0 / WG), gx1 = Math.floor(x1 / WG);
      const gz0 = Math.floor(z0 / WG), gz1 = Math.floor(z1 / WG);
      for (let gx = gx0; gx <= gx1; gx++) {
        for (let gz = gz0; gz <= gz1; gz++) {
          waterCells.add(`${gx},${gz}`);
        }
      }
    }
  }

  const inWater = (x, z, pad = 24) => {
    if (coastDistAt(x, z) < pad) return true;
    if (polyWaters.length === 0) return false;
    if (pad <= 140 && !waterCells.has(`${Math.floor(x / WG)},${Math.floor(z / WG)}`)) return false;
    for (let k = 0; k < polyWaters.length; k++) {
      const pw = polyWaters[k];
      if (x < pw.minX - pad || x > pw.maxX + pad || z < pw.minZ - pad || z > pw.maxZ + pad) continue;
      if (pointInPoly(x, z, pw.pts)) return true;
      if (pad > 0 && distToPolyEdges(x, z, pw.pts) < pad) return true;
    }
    return false;
  };

  const boxTouchesWater = (cx, cz, bw, bd, rot = 0) => {
    const hw = bw * 0.5 + 3.5;
    const hd = bd * 0.5 + 3.5;
    if (inWater(cx, cz, 5.0)) return true;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    return (
      inWater(cx + hw * c + hd * s, cz - hw * s + hd * c, 3.0) ||
      inWater(cx + hw * c - hd * s, cz - hw * s - hd * c, 3.0) ||
      inWater(cx - hw * c + hd * s, cz + hw * s + hd * c, 3.0) ||
      inWater(cx - hw * c - hd * s, cz + hw * s - hd * c, 3.0)
    );
  };

  // Hard water-exclusion gate on every pushed architectural box & beacon!
  const push = (x, y, z, w, h, d, s, kind, style = 0, rot = 0) => {
    if (boxTouchesWater(x, z, w, d, rot)) return;
    items.push(x, y, z, w, h, d, s, kind, style, rot);
  };
  const pushBeacon = (x, y, z, r = 0) => {
    if (inWater(x, z, 5.0)) return;
    beacons.push({ x, y, z, phase: r, r });
  };
  const bills = [];
  const signs = [];
  const pushSignDry = (sg) => {
    if (!inWater(sg.x, sg.z, 8.0)) signs.push(sg);
  };
  const pushBillDry = (bl) => {
    if (!inWater(bl.x, bl.z, 8.0)) bills.push(bl);
  };

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
  // Every landmark checks full block footprint against water bodies!
  const landmarks = [];
  const lmCells = new Map();
  const cellDryFor = (cx, cz, halfSpan) => (
    !inWater(cx, cz, halfSpan + 10) &&
    !inWater(cx - halfSpan, cz - halfSpan, 10) &&
    !inWater(cx + halfSpan, cz - halfSpan, 10) &&
    !inWater(cx - halfSpan, cz + halfSpan, 10) &&
    !inWater(cx + halfSpan, cz + halfSpan, 10)
  );
  const heroPool = [
    'arch', 'pyramid', 'cantilever', 'ziggurat',
    'hanging_gardens', 'brutalist_habitat', 'neo_ziggurat', 'torus_ring', 'helix_arcology',
  ];
  const heroKind = seed === 4417 ? 'arch' : heroPool[Math.floor(hash2i(2, 19, seed) * heroPool.length) % heroPool.length];
  let heroBi = 0, heroBj = 0;
  if (!cellDryFor(CELL * 0.5, CELL * 0.5, 58)) {
    for (let rad = 1; rad <= Math.max(2, radius - 1); rad++) {
      let found = false;
      for (let dx = -rad; dx <= rad && !found; dx++) {
        for (let dz = -rad; dz <= rad && !found; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== rad) continue;
          if (cellDryFor(dx * CELL + CELL * 0.5, dz * CELL + CELL * 0.5, 58)) {
            heroBi = dx; heroBj = dz; found = true;
          }
        }
      }
      if (found) break;
    }
  }
  addLandmarkData(landmarks, lmCells, heroKind, heroBi, heroBj, seed, true);

  const mustHaveLm = radius >= 4
    ? [
      'pyramid', 'cantilever', 'ziggurat',
      'hanging_gardens', 'brutalist_habitat', 'neo_ziggurat',
      'inverted_ziggurat', 'helix_arcology', 'torus_ring', 'metabolism_tree',
    ].filter((k) => k !== heroKind)
    : radius >= 3
      ? ['pyramid', 'cantilever', 'ziggurat', 'hanging_gardens', 'brutalist_habitat'].filter((k) => k !== heroKind)
      : radius >= 2 ? ['pyramid', 'cantilever', 'hanging_gardens'].filter((k) => k !== heroKind) : [];
  const extraLmCount = radius >= 4
    ? 2 + Math.floor(hash2i(3, 17, seed) * 3)
    : 3 + Math.floor(hash2i(3, 17, seed) * 4);
  const wantLmKinds = [...mustHaveLm];
  for (let k = 0; k < extraLmCount; k++) {
    wantLmKinds.push(LM_KINDS[Math.floor(hash2i(k, 5, seed) * LM_KINDS.length) % LM_KINDS.length]);
  }
  for (let k = 0; k < wantLmKinds.length; k++) {
    const kind = wantLmKinds[k];
    for (let attempt = 0; attempt < 72; attempt++) {
      const bi = Math.floor(hash2i(k * 19 + attempt, 101, seed) * (radius * 2)) - radius;
      const bj = Math.floor(hash2i(k * 19 + attempt, 211, seed) * (radius * 2)) - radius;
      const key = bi + ',' + bj;
      if (lmCells.has(key) || spireCells.has(key) || (bi === heroBi && bj === heroBj)) continue;
      const lcx = bi * CELL + CELL / 2;
      const lcz = bj * CELL + CELL / 2;
      if (!cellDryFor(lcx, lcz, 56)) continue;
      if (attempt < 28 && nearBoulevard(lcx, lcz, 64)) continue;
      addLandmarkData(landmarks, lmCells, kind, bi, bj, seed, false);
      break;
    }
  }

  // Public spaces & grand venues: guarantee an arena, movie theatre, stadium,
  // and lush botanical/cyber parks whenever the city is big enough.
  const places = [];
  const featured = radius >= 4
    ? ['park', 'arena', 'theatre', 'stadium', 'park']
    : radius >= 2 ? ['park', 'arena', 'theatre'] : [];
  const extraCount = 3 + Math.floor(hash2i(29, 31, seed) * 4);
  const wantKinds = [...featured];
  for (let k = 0; k < extraCount; k++) {
    wantKinds.push(PLACE_KINDS[Math.floor(hash2i(k, 61, seed) * PLACE_KINDS.length) % PLACE_KINDS.length]);
  }
  let hasShowcasePark = false;
  for (let k = 0; k < wantKinds.length; k++) {
    const kind = wantKinds[k];
    const wantSuperPark = kind === 'park' && !hasShowcasePark && radius >= 4;
    const big = kind === 'arena' || kind === 'stadium' || kind === 'theatre' || wantSuperPark;
    // try deterministic candidate blocks until we find an open spot off water/boulevards
    for (let attempt = 0; attempt < 80; attempt++) {
      const spanB = Math.max(1, radius - 1);
      const bi = Math.floor(hash2i(k * 31 + attempt, 307, seed) * (spanB * 2)) - spanB;
      const bj = Math.floor(hash2i(k * 31 + attempt, 401, seed) * (spanB * 2)) - spanB;
      const key = bi + ',' + bj;
      if (lmCells.has(key) || spireCells.has(key) || (Math.abs(bi - heroBi) <= 1 && Math.abs(bj - heroBj) <= 1)) continue;
      // big venues & Showcase Central Park prefer a 2x2 superblock without crossing a 4th-street avenue
      if (big && radius >= 4 && attempt < 42) {
        if (((bi + 1) % 4 + 4) % 4 === 0 || ((bj + 1) % 4 + 4) % 4 === 0) continue;
        if (bi + 1 >= radius || bj + 1 >= radius) continue;
        const subKeys = [key, `${bi + 1},${bj}`, `${bi},${bj + 1}`, `${bi + 1},${bj + 1}`];
        if (subKeys.some((sk) => lmCells.has(sk) || spireCells.has(sk))) continue;
        const scx = (bi + 1) * CELL;
        const scz = (bj + 1) * CELL;
        if (!cellDryFor(scx, scz, 108) || nearBoulevard(scx, scz, 110)) continue;
        addPlaceData(places, lmCells, pushBeacon, pushSignDry, kind, bi, bj, seed, true);
        if (kind === 'park') hasShowcasePark = true;
        break;
      } else {
        const scx = bi * CELL + CELL / 2;
        const scz = bj * CELL + CELL / 2;
        if (!cellDryFor(scx, scz, 54) || (attempt < 56 && nearBoulevard(scx, scz, 76))) continue;
        addPlaceData(places, lmCells, pushBeacon, pushSignDry, kind, bi, bj, seed, false);
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
      // Organic radial + corridor-boosted boundary so the city swells naturally along major highways!
      const rwCore = evalRoadWeb(cx, cz, terrainSeedX, terrainSeedZ);
      const warp = (fbm2D(noise, cx / 580 + 7.3, cz / 580 - 4.1, 2) - 0.5) * CELL * 2.8;
      const effCoreSpan = Math.max(CELL, coreSpan * (1.0 + 0.36 * rwCore.corrMask));
      const rNorm = (Math.hypot(cx, cz) + warp) / effCoreSpan;
      const edgeT = clamp01(1.18 - rNorm * 0.92);
      const blockInMedia = mediaZone && Math.hypot(cx - mediaZone.x, cz - mediaZone.z) <= mediaZone.r;

      if (lmCells.has(i + ',' + j)) continue; // landmark/venue block
      if (spireCells.has(i + ',' + j) && !blockInMedia && rNorm < 0.92 && !inWater(cx, cz, 44) && !nearBoulevard(cx, cz, 68)) {
        addSpire(push, pushBeacon, rand, cx, cz, h01, d);
        towers++;
        continue;
      }
      // Corner blocks outside the organic radial core transition straight into outskirts!
      if (rNorm > 1.06 && !blockInMedia) {
        if (!inWater(cx, cz, 38) && !nearBoulevard(cx, cz, 48)) {
          addOutskirts(push, pushBeacon, pushSignDry, rand, x0, x1, z0, z1, clamp01(1.32 - rNorm * 0.85));
        }
        continue;
      }
      // sparse / rift / rim quarters leave whole blocks empty — but never inside the Media Ward!
      if (!blockInMedia && rand() < d.skip * 0.55 + (1 - edgeT) * 0.25) continue;
      if (inWater(cx, cz, 42) || (!blockInMedia && nearBoulevard(cx, cz, 56))) continue;

      // Street-level urban realm: raised sidewalk promenade, corner transit kiosks & pedestrian skywalks
      addBlockStreetscape(push, pushBeacon, pushSignDry, rand, i, j, x0, x1, z0, z1, d, blockInMedia, radius, lmCells, inWater);

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
          const pickInZone = distMedia <= (mediaZone ? mediaZone.r : 0) && hash2i(i * 19 + a * 7, j * 23 + b * 11, seed ^ 0x4d3a) < 0.42;
          const pickCorridor = distMedia > (mediaZone ? mediaZone.r * 1.35 : 0) && (onAveCorridor || nearBoulevard(lx, lz, 130)) && hash2i(i * 31 + a * 5, j * 29 + b * 13, seed ^ 0x9b71) < 0.085;
          const useMediaTower = pickInZone || pickCorridor;
          if (inWater(lx, lz, halfDiag + 12) || nearBoulevard(lx, lz, useMediaTower ? 22 : 38 + halfDiag * 0.75)) continue;
          if (useMediaTower) {
            const mt = addMediaTower(
              push, pushBeacon, pushBillDry, pushSignDry, (hl) => holos.push(hl),
              rand, xs[a], xs[a + 1], zs[b], zs[b + 1], h01, baseAngle
            );
            if (mt && pickInZone) mediaTowers.push(mt);
          } else {
            addTower(
              push, pushBeacon, pushBillDry, pushSignDry,
              rand, xs[a], xs[a + 1], zs[b], zs[b + 1], h01, d, edgeT, baseAngle, signAmt, megaWrap
            );
          }
          towers++;
        }
      }
    }
  }
  if (mediaZone) {
    mediaZone.towerCount = Math.max(mediaTowers.length, 2);
    // 2 spaced street-level holographic sculptures & single-plane cones in the Media Ward (zero crossed planes!)
    for (let k = 0; k < 2; k++) {
      const ang = (k / 2) * Math.PI * 0.5 + hash2i(k, 907, seed) * 0.4;
      const off = (k === 0 ? -1 : 1) * 72;
      const mKind = k === 0 ? 'truncated_octahedron' : 'trefoil_knot';
      holos.push({
        x: mediaZone.x + Math.cos(ang) * off,
        y: 34 + k * 22,
        baseY: 10,
        z: mediaZone.z + Math.sin(ang) * off,
        w: 44 + hash2i(k, 911, seed) * 20,
        h: 28 + hash2i(k, 919, seed) * 14,
        scaleMul: 0.48 + hash2i(k, 923, seed) * 0.44,
        rot: ang,
        seed: hash2i(k, 929, seed),
        kind: mKind,
        shape: mKind,
      });
    }
    // Also place 2 distant civic/plaza sky-holograms elsewhere in the city so holo landmarks feel city-wide
    for (let k = 0; k < 2; k++) {
      const pl = places[k % Math.max(1, places.length)];
      if (!pl) break;
      const pKind = k === 0 ? 'astrolabe' : 'disc';
      holos.push({
        x: pl.x,
        y: 48 + k * 24,
        baseY: 14,
        z: pl.z,
        w: 38 + hash2i(k + 5, 937, seed) * 18,
        h: 28 + hash2i(k + 5, 941, seed) * 12,
        scaleMul: 0.52 + hash2i(k + 5, 943, seed) * 0.56,
        rot: hash2i(k + 5, 947, seed) * Math.PI,
        seed: hash2i(k + 5, 953, seed),
        kind: pKind,
        shape: pKind,
      });
    }
  }

  const OUT = Math.max(9, Math.round(radius * 1.2) + 4);
  const outSpan = OUT * CELL;
  const effSubReach = Math.max(0, Math.min(2.5, Number.isFinite(suburbReach) ? suburbReach : 1.0));
  // Stretch suburban sprawl dramatically farther across the basin (~7.8 km at r=5, up to 11.4 km!)
  const suburbSpan = effSubReach > 0.02
    ? Math.min(11400, Math.round((Math.max(7600, coreSpan * 6.8 + 2900)) * effSubReach))
    : Math.round(coreSpan + outSpan * 0.85);

  const terrainY = (px, pz) => Math.max(
    0,
    evalTerrainHeight(
      px, pz, coreSpan, suburbSpan,
      terrainMode, terrainScale, coastAngle, waterMode,
      terrainSeedX, terrainSeedZ, shoreDist, waterAmount
    )
  );
  const terrainSlopeAt = (px, pz) => {
    if ((terrainMode === 4 || terrainScale <= 0.001) && waterMode !== 2) return 0;
    const e = 18.0;
    const hx = evalTerrainHeight(px + e, pz, coreSpan, suburbSpan, terrainMode, terrainScale, coastAngle, waterMode, terrainSeedX, terrainSeedZ, shoreDist, waterAmount)
      - evalTerrainHeight(px - e, pz, coreSpan, suburbSpan, terrainMode, terrainScale, coastAngle, waterMode, terrainSeedX, terrainSeedZ, shoreDist, waterAmount);
    const hz = evalTerrainHeight(px, pz + e, coreSpan, suburbSpan, terrainMode, terrainScale, coastAngle, waterMode, terrainSeedX, terrainSeedZ, shoreDist, waterAmount)
      - evalTerrainHeight(px, pz - e, coreSpan, suburbSpan, terrainMode, terrainScale, coastAngle, waterMode, terrainSeedX, terrainSeedZ, shoreDist, waterAmount);
    return Math.hypot(hx, hz) / (2 * e);
  };

  // Reserve a flat dry plateau for the Air/Spaceport so suburbs & trees keep its runways clear!
  const spaceport = makeSpaceport(seed, radius, coreSpan, coastAngle, inWater, terrainY, terrainSlopeAt, airAmt);
  const inSpaceport = (px, pz, pad = 26) => {
    if (!spaceport) return false;
    const dx = px - spaceport.x;
    const dz = pz - spaceport.z;
    const lx = dx * spaceport.cos + dz * spaceport.sin;
    const lz = -dx * spaceport.sin + dz * spaceport.cos;
    return Math.abs(lx) < spaceport.halfLen + pad && Math.abs(lz) < spaceport.halfWid + pad;
  };
  const inRestricted = (px, pz, pad = 24) => inWater(px, pz, pad) || inSpaceport(px, pz, pad);

  // Organic Ribbon / Finger City Corridors growing outward along the 12 major radial highways!
  const subLamps = [];
  const subTrees = [];
  const pushLampDry = (lp) => {
    if (!inRestricted(lp.x, lp.z, 14.0)) subLamps.push(lp);
  };
  const pushTreeDry = (tr) => {
    if (vegCover > 0.01 && !inRestricted(tr.x, tr.z, 14.0) && hash2i(Math.round(tr.x), Math.round(tr.z), seed ^ 0x71b) < vegCover) {
      subTrees.push(tr);
    }
  };
  const pushOuter = (x0, y0, z0, w0, h0, d0, s0, k0, st0 = 0, r0 = 0) => {
    if (inSpaceport(x0, z0, Math.max(w0, d0) * 0.5 + 16)) return;
    push(x0, y0, z0, w0, h0, d0, s0, k0, st0, r0);
  };
  towers += addArterialCorridors({
    seed, noise, coreSpan, suburbSpan, reach: effSubReach,
    terrainSeedX, terrainSeedZ,
    inWater: inRestricted, nearBoulevard, terrainY, terrainSlopeAt,
    push: pushOuter, pushBeacon, pushBill: pushBillDry, pushSign: pushSignDry, pushLamp: pushLampDry,
  });

  // Organic non-grid peri-urban belt (warehouses, silos, sheds & pylons scattered
  // along curved corridors rather than a square block grid).
  const outBeltCount = Math.max(36, Math.round(radius * 16));
  for (let m = 0; m < outBeltCount; m++) {
    const a = (m / outBeltCount) * Math.PI * 2 + (hash2i(m, 811, seed) - 0.5) * 0.24;
    const layers = 2 + (m % 2);
    for (let l = 0; l < layers; l++) {
      const f = (l + hash2i(m * 7 + l, 823, seed) * 0.85) / layers;
      const rr = coreSpan * 1.04 + f * outSpan * 0.78;
      const cx = Math.cos(a) * rr;
      const cz = Math.sin(a) * rr;
      if (inRestricted(cx, cz, 34) || nearBoulevard(cx, cz, 52)) continue;
      if (terrainSlopeAt(cx, cz) > 0.24) continue;
      const fade = Math.pow(clamp01(1 - f * 0.88), 1.35);
      if (hash2i(m * 13 + l, 829, seed) > fade * 0.86 + 0.08) continue;
      const rand = mulberry32(hash2i(m * 17 + l, 839, seed) * 4294967296);
      const baseY = terrainY(cx, cz);
      const tangentRot = -a + (rand() - 0.5) * 0.5;
      addOutskirtsCluster(pushOuter, pushBeacon, pushSignDry, rand, cx, cz, baseY, tangentRot, fade);
    }
  }

  // Dry-land coastal headland lighthouses & waterfront warehouse promenades (strictly above waterline!)
  const suburbPOIs = [];
  if (waterMode === 1 || waterMode === 2) {
    const ca = Math.cos(coastAngle);
    const sa = Math.sin(coastAngle);
    for (let pIdx = -2; pIdx <= 2; pIdx++) {
      const vOff = pIdx * 235 + (hash2i(pIdx + 10, 853, seed) - 0.5) * 70;
      let uLo = -coreSpan;
      let uHi = coreSpan * 2.4;
      for (let it = 0; it < 16; it++) {
        const uMid = (uLo + uHi) * 0.5;
        const wx = ca * uMid - sa * vOff;
        const wz = sa * uMid + ca * vOff;
        if (coastDistAt(wx, wz) > 0) uLo = uMid;
        else uHi = uMid;
      }
      const pierRot = -coastAngle;
      // Waterfront promenade pavilion & maritime warehouse seated safely on dry bluff (uLo - 46m)
      const rx = ca * (uLo - 46) - sa * vOff;
      const rz = sa * (uLo - 46) + ca * vOff;
      if (!inWater(rx, rz, 24)) {
        const ry = terrainY(rx, rz);
        push(rx, ry + 1.0, rz, 28, 2.0, 18, hash2i(pIdx + 10, 863, seed), KIND.SLAB, 4, pierRot);
        push(rx, ry + 5.2, rz, 22, 7.6, 13, hash2i(pIdx + 10, 877, seed), KIND.WALL, 2, pierRot);
        pushBeacon(rx, ry + 10.5, rz, hash2i(pIdx + 10, 881, seed));
        if (pIdx === 0) {
          suburbPOIs.push({ kind: 'shore', name: 'Harbor Promenade', x: rx, y: ry, z: rz, h: 10, r: 22 });
        }
      }

      // Headland lighthouse seated safely on dry coastal promontory
      if (pIdx === 2) {
        const vLight = vOff + 85;
        let uLightLo = -coreSpan;
        let uLightHi = coreSpan * 2.4;
        for (let it = 0; it < 16; it++) {
          const uMid = (uLightLo + uLightHi) * 0.5;
          const wx = ca * uMid - sa * vLight;
          const wz = sa * uMid + ca * vLight;
          if (coastDistAt(wx, wz) > 0) uLightLo = uMid;
          else uLightHi = uMid;
        }
        const lx = ca * (uLightLo - 48) - sa * vLight;
        const lz = sa * (uLightLo - 48) + ca * vLight;
        if (!inWater(lx, lz, 24)) {
          const ly = terrainY(lx, lz);
          const lh = 34;
          push(lx, ly + lh * 0.5, lz, 6.8, lh, 6.8, 0.31, KIND.WALL, 1, 0);
          push(lx, ly + lh + 2.2, lz, 8.2, 3.4, 8.2, 0.72, KIND.BAND, 1, 0);
          pushBeacon(lx, ly + lh + 5.5, lz, 0.15);
          suburbPOIs.push({ kind: 'lighthouse', name: 'Harbor Point Light', x: lx, y: ly, z: lz, h: lh + 6, r: 22 });
        }
      }
    }
  }

  // Record exact index boundary between urban/corridor architecture and horizon suburbs!
  towers = Math.floor(items.length / 10);

  // Road-aligned trapezoid suburbs & parallel strip-crop countryside:
  // dense low-story houses aligned along internal residential streets of each
  // curvilinear trapezoid block, plus shops, power stations & rural farmsteads.
  let suburbCount = 0;
  if (effSubReach > 0.02) {
    suburbCount = addHorizonSuburbs({
      seed, noise, coreSpan, outSpan, suburbSpan, reach: effSubReach,
      waterMode, terrainMode, coastAngle, terrainSeedX, terrainSeedZ,
      inWater: inRestricted, coastDistAt, terrainY, terrainSlopeAt,
      push: pushOuter, pushBeacon,
      pushSign: pushSignDry,
      pushLamp: pushLampDry,
      pushTree: pushTreeDry,
      suburbPOIs,
    });
  }

  // Deepwater Harbor, Piers, Cranes, Cruise Liners & Container Ships
  const harbor = makeHarbor(seed, radius, water, waterMode, waterAmount, coastAngle, coastDistAt, inWater, terrainY, maritimeAmt);
  if (harbor) {
    suburbPOIs.unshift({
      kind: 'harbor',
      name: 'Port Nexus Harbor',
      x: harbor.x, y: harbor.y, z: harbor.z, h: 46, r: 95,
    });
  }

  // Architectural Cable-Stayed & Tied-Arch Bridges spanning rivers
  const bridges = makeBridges(seed, water, terrainY);
  if (bridges.length > 0) {
    const b0 = bridges[0];
    suburbPOIs.unshift({
      kind: 'bridge',
      name: b0.name,
      x: b0.cx, y: b0.yDeck, z: b0.cz, h: b0.towerH, r: Math.max(55, b0.span * 0.45),
    });
  }

  // Orbital Air & Spaceport POI
  if (spaceport) {
    suburbPOIs.unshift({
      kind: 'spaceport',
      name: 'Orbital Air & Spaceport',
      x: spaceport.x, y: spaceport.y, z: spaceport.z, h: 92, r: 165,
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
  const midTowers = [];
  const nItems = items.length / 10;
  for (let k = 0; k < nItems; k++) {
    if (items[k * 10 + 7] !== KIND.WALL) continue;
    const bh = items[k * 10 + 4];
    if (bh > 210) tall.push(k);
    else if (bh > 65 && bh <= 210) midTowers.push(k);
  }
  const holoKinds = [
    'panel', 'disc', 'cuboctahedron', 'truncated_octahedron',
    'rhombicuboctahedron', 'trefoil_knot', 'astrolabe',
  ];
  for (let k = 0; k < holoCount && tall.length; k++) {
    const pickIdx = tall[Math.floor(hash2i(k * 7 + 3, 29, seed) * tall.length) % tall.length];
    const hx = items[pickIdx * 10 + 0];
    const hz = items[pickIdx * 10 + 2];
    const hTop = items[pickIdx * 10 + 1] + items[pickIdx * 10 + 4] / 2;
    const hKind = holoKinds[Math.floor(hash2i(k, 61, seed) * holoKinds.length) % holoKinds.length];
    const scMul = 0.46 + Math.pow(hash2i(k, 67, seed), 1.35) * 1.18;
    holos.push({
      x: hx + (hash2i(k, 31, seed) - 0.5) * 32,
      y: hTop + 34 + scMul * 46 + hash2i(k, 37, seed) * 42,
      baseY: hTop,
      z: hz + (hash2i(k, 41, seed) - 0.5) * 32,
      w: 68 + hash2i(k, 43, seed) * 78,
      h: 42 + hash2i(k, 47, seed) * 56,
      scaleMul: scMul,
      rot: hash2i(k, 53, seed) * Math.PI * 2,
      seed: hash2i(k, 59, seed),
      kind: hKind,
      shape: hKind,
    });
  }
  // Venue holograms hovering above every arena, stadium and theatre
  for (let k = 0; k < places.length; k++) {
    const pl = places[k];
    if (pl.kind !== 'arena' && pl.kind !== 'stadium' && pl.kind !== 'theatre') continue;
    const vKind = pl.kind === 'theatre' ? 'panel' : (pl.kind === 'arena' ? 'rhombicuboctahedron' : 'cylinder');
    holos.push({
      x: pl.x,
      y: pl.kind === 'theatre' ? 74 + pl.seed * 18 : 92 + pl.seed * 28,
      baseY: 38,
      z: pl.z,
      w: pl.r * (pl.kind === 'theatre' ? 0.95 : 1.25),
      h: pl.kind === 'theatre' ? 38 : 48,
      scaleMul: pl.kind === 'theatre' ? 0.68 : 0.92,
      rot: pl.rot,
      seed: (pl.seed + 0.37) % 1,
      kind: vKind,
      shape: vKind,
    });
  }

  // Extra street-canyon, plaza, avenue & mid-rooftop holographic projections for live density scaling (>100% up to 250%)
  const extraHolos = [];
  if (signAmt > 0.008) {
    const extraTarget = Math.max(18, Math.min(48, Math.round(holos.length * 2.1)));
    const towerPool = midTowers.length ? midTowers : tall;
    for (let k = 0; k < extraTarget; k++) {
      const eKind = holoKinds[Math.floor(hash2i(k, 701, seed) * holoKinds.length) % holoKinds.length];
      const tierRoll = hash2i(k, 709, seed);
      let ex = 0, ez = 0, ey = 28, eBaseY = 6, eScale = 0.42;
      if (tierRoll < 0.38 && places.length) {
        // Intimate street/plaza/park micro-to-medium hologram
        const pl = places[Math.floor(hash2i(k, 719, seed) * places.length) % places.length];
        const ang = hash2i(k, 727, seed) * Math.PI * 2;
        const rad = (pl.r || 42) * (0.25 + 0.45 * hash2i(k, 733, seed));
        ex = pl.x + Math.cos(ang) * rad;
        ez = pl.z + Math.sin(ang) * rad;
        eScale = 0.24 + hash2i(k, 739, seed) * 0.34;
        eBaseY = 3.5;
        ey = 16 + eScale * 38;
      } else if (towerPool.length) {
        // Mid-tower rooftop or street-canyon projection
        const pickIdx = towerPool[Math.floor(hash2i(k * 5 + 1, 743, seed) * towerPool.length) % towerPool.length];
        ex = items[pickIdx * 10 + 0] + (hash2i(k, 751, seed) - 0.5) * 26;
        ez = items[pickIdx * 10 + 2] + (hash2i(k, 757, seed) - 0.5) * 26;
        const top = items[pickIdx * 10 + 1] + items[pickIdx * 10 + 4] * 0.5;
        eScale = 0.32 + Math.pow(hash2i(k, 761, seed), 1.4) * 1.12;
        eBaseY = tierRoll < 0.62 ? 8 : top;
        ey = tierRoll < 0.62 ? (24 + eScale * 36) : (top + 22 + eScale * 48);
      }
      if (!inWater(ex, ez, 14)) {
        extraHolos.push({
          x: ex,
          y: ey,
          baseY: eBaseY,
          z: ez,
          w: 44 + hash2i(k, 769, seed) * 42,
          h: 32 + hash2i(k, 773, seed) * 32,
          scaleMul: eScale,
          rot: hash2i(k, 787, seed) * Math.PI * 2,
          seed: hash2i(k, 797, seed),
          kind: eKind,
          shape: eKind,
        });
      }
    }
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

  if (signAmt <= 0.008) {
    bills.length = 0;
    signs.length = 0;
    holos.length = 0;
  } else if (signAmt < 0.98) {
    const keepF = clamp01(signAmt);
    const filterDet = (arr) => arr.filter((it, idx) => hash2i(idx, 613, seed) <= keepF);
    const bKeep = filterDet(bills);
    const sKeep = filterDet(signs);
    const hKeep = filterDet(holos);
    bills.length = 0; bills.push(...bKeep);
    signs.length = 0; signs.push(...sKeep);
    holos.length = 0; holos.push(...hKeep);
  }

  const collider = makeCityCollider({
    count: n, x, y, z, w, h, d, rot, landmarks, places,
    radius, suburbSpan, waterMode, waterAmount, shoreDist, terrainMode, terrainScale,
    coastAngle, terrainSeedX, terrainSeedZ,
  });
  const transit = makeTransitNetwork(seed, radius, collider, inWater, transitAmt, {
    span: radius * CELL, coastAngle, waterMode, terrainSeedX, terrainSeedZ, shoreDist, waterAmount,
  });
  const lanes = makeLanes(seed, radius, boulevards, collider, terrainSeedX, terrainSeedZ, inWater, suburbSpan, transit, bridges);
  const streetInfra = makeStreetInfrastructure(seed, radius, boulevards, places, inWater);
  const lamps = makeLamps(seed, radius, boulevards, mediaZone, inWater);
  for (let i = 0; i < subLamps.length; i++) lamps.push(subLamps[i]);
  const primaryLampCount = lamps.length;
  // Secondary side-street lamps (appended after primaryLampCount so lamps.slice(0, 64) stays strictly on avenues,
  // and lampDensity > 1.0 illuminates secondary streets too!)
  {
    const spanS = radius * CELL + CELL * 0.4;
    for (let s = -radius; s <= radius; s++) {
      if (((s % 4) + 4) % 4 === 0 || Math.abs(s % 2) !== 0) continue;
      const p = s * CELL;
      for (let zc = -spanS; zc <= spanS; zc += 76) {
        if (!inWater(p + 8.5, zc, 14)) lamps.push({ x: p + 8.5, y: 6.8, z: zc, secondary: true });
        if (!inWater(p - 8.5, zc, 14)) lamps.push({ x: p - 8.5, y: 6.8, z: zc, secondary: true });
      }
    }
  }
  const trees = makeTrees(seed, radius, water, lmCells, places, boulevards, sites, inRestricted, vegCover, vegScale);
  for (let i = 0; i < subTrees.length; i++) trees.push(subTrees[i]);
  const treeLinks = makeTreeConnections(trees, seed);
  const riverEntry = water.find((w) => w.kind === 'river' && w.riverSpec);
  const harborWaterEntry = water.find((w) => w.kind === 'harbor');
  const pondWaterEntry = water.find((w) => w.kind === 'pond');
  return {
    seed, radius, suburbReach: effSubReach, suburbSpan, suburbCount,
    waterMode, waterAmount, shoreDist, terrainMode, terrainScale,
    vegCover, vegScale, transitAmt, maritimeAmt, airAmt, signAmt, megaWrap,
    coastAngle, terrainSeedX, terrainSeedZ,
    riverFlow: riverEntry ? riverEntry.riverSpec : { active: false },
    lagoon: harborWaterEntry ? { active: true, x: harborWaterEntry.x, z: harborWaterEntry.z, r: harborWaterEntry.r } : { active: false, x: 0, z: 0, r: 0 },
    pond: pondWaterEntry ? { active: true, x: pondWaterEntry.x, z: pondWaterEntry.z, r: pondWaterEntry.r } : { active: false, x: 0, z: 0, r: 0 },
    count: n, towers, maxY, x, y, z, w, h, d, s, kind, style, rot,
    districts, landmarks, places, suburbPOIs, mediaZone, lanes, transit,
    harbor, bridges, spaceport, streetInfra,
    beacons, lamps, primaryLampCount, sites, water, boulevards, trees, treeLinks, bills, signs, holos, extraHolos,
  };
}

/** Street lamps along both sides of every avenue — strictly kept off water bodies. */
function makeLamps(seed, radius, boulevards = [], mediaZone = null, inWater = null) {
  const lamps = [];
  const pushL = (lx, ly, lz) => {
    if (inWater && inWater(lx, lz, 14)) return;
    lamps.push({ x: lx, y: ly, z: lz });
  };
  const span = radius * CELL + CELL * 0.5;
  const R = (a, b) => hash2i(a, b, seed ^ 0x51e9a3c7);
  // avenues sit at street indices divisible by 4 (see streetWidth)
  const start = -Math.floor(radius / 4) * 4;
  for (let a = start; a <= radius; a += 4) {
    const p = a * CELL;
    for (let z = -span; z <= span; z += 58) {
      const j1 = (R(a * 3 + 1, Math.round(z)) - 0.5) * 6;
      const j2 = (R(a * 3 + 2, Math.round(z)) - 0.5) * 6;
      pushL(p + 11 + j1, 7.5, z + j2);
      pushL(p - 11 + j2, 7.5, z + j1);
    }
    if (R(a, 77) < 0.6) {
      for (let x = -span; x <= span; x += 58) {
        const j1 = (R(Math.round(x), a * 3 + 3) - 0.5) * 6;
        pushL(x + j1, 7.5, p + 11 + j1 * 0.5);
        pushL(x - j1 * 0.5, 7.5, p - 11);
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
      pushL(bx + nx * 19, 8.2, bz + nz * 19);
      pushL(bx - nx * 19, 8.2, bz - nz * 19);
    }
  }
  // Extra dense street-level pools & lamps flooding the Media / Holo-Ad District
  if (mediaZone) {
    for (let ring = 0; ring < 24; ring++) {
      const a = (ring / 24) * Math.PI * 2;
      const rr = (0.28 + (ring % 3) * 0.32) * mediaZone.r;
      pushL(
        mediaZone.x + Math.cos(a) * rr,
        9.0,
        mediaZone.z + Math.sin(a) * rr
      );
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
  else if (kind === 'hanging_gardens') { r = Math.min(54, (40 + r0 * 12) * m); h = (195 + r1 * 135) * m; }
  else if (kind === 'brutalist_habitat') { r = Math.min(54, (42 + r0 * 11) * m); h = (165 + r1 * 125) * m; }
  else if (kind === 'neo_ziggurat') { r = Math.min(54, (40 + r0 * 13) * m); h = (225 + r1 * 165) * m; }
  else if (kind === 'inverted_ziggurat') { r = Math.min(50, (34 + r0 * 13) * m); h = (205 + r1 * 145) * m; }
  else if (kind === 'helix_arcology') { r = Math.min(46, (28 + r0 * 13) * m); h = (285 + r1 * 210) * 1.15; }
  else if (kind === 'torus_ring') { r = Math.min(52, (38 + r0 * 12) * m); h = (215 + r1 * 145) * m; }
  else if (kind === 'metabolism_tree') { r = Math.min(48, (32 + r0 * 13) * m); h = (255 + r1 * 195) * 1.15; }
  else { r = (11 + r0 * 9) * 1.1; h = (430 + r1 * 300) * 1.15; }
  const cardinal = (
    kind === 'pyramid' || kind === 'ziggurat' || kind === 'cantilever' ||
    kind === 'hanging_gardens' || kind === 'brutalist_habitat' ||
    kind === 'neo_ziggurat' || kind === 'inverted_ziggurat' || kind === 'torus_ring'
  );
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
  const showcase = superBlock && kind === 'park';
  if (showcase) name = 'Grand Conservatory Park';
  const big = kind === 'arena' || kind === 'stadium' || kind === 'theatre' || showcase;
  const r = superBlock ? 86 + rnd(23) * 30 : (big ? 52 + rnd(23) * 10 : 44 + rnd(23) * 16);
  const rot = rnd(31) * Math.PI * 2;
  places.push({
    kind, name, x: cx, z: cz, r,
    rot,
    bi, bj,
    showcase,
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
function makeLanes(
  seed,
  radius,
  boulevards = [],
  collider = null,
  terrainSeedX = 0,
  terrainSeedZ = 0,
  inWater = null,
  suburbSpan = 4000,
  transit = null,
  bridges = []
) {
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

  // Stop the orthogonal street & air-grid traffic network from continuing above water bodies!
  const segmentDry = (x1, z1, cx, cz, x2, z2, pad = 6.0) => {
    if (!inWater) return true;
    const steps = 8;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const om = 1 - t;
      const px = om * om * x1 + 2 * om * t * cx + t * t * x2;
      const pz = om * om * z1 + 2 * om * t * cz + t * t * z2;
      if (inWater(px, pz, pad)) return false;
    }
    return true;
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

  const GATE = 40; // generous sweeping intersection fillet radius (m) so turns are smooth G1 arcs!
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

          if (!segmentDry(pOut.x, pOut.z, (pOut.x + pIn.x) * 0.5, (pOut.z + pIn.z) * 0.5, pIn.x, pIn.z, 6.0)) {
            continue;
          }
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
            { axis: D.axis, deck: dIdx, kind: 'street', ix, iz, nix, niz, dCode }
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
      if (
        segmentDry(pIn.x, pIn.z, (pIn.x + pOutS.x) * 0.5, (pIn.z + pOutS.z) * 0.5, pOutS.x, pOutS.z, 6.0)
        && segmentClear(pIn.x, pIn.z, (pIn.x + pOutS.x) * 0.5, (pIn.z + pOutS.z) * 0.5, pOutS.x, pOutS.z, yIn, yIn, 5.5)
      ) {
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
      if (!segmentDry(pIn.x, pIn.z, cx, cz, pOutT.x, pOutT.z, 6.0)) continue;
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
      axis: isNS ? 'ns' : 'ew', deck: 5, kind: 'airway',
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
        if (segmentDry(sx1, sz1, scx, scz, sx2, sz2, 8.0) && segmentClear(sx1, sz1, scx, scz, sx2, sz2, yG, yG, 6.5)) {
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

  // Dedicated Bridge-Deck Vehicle Lanes across River Bridges (vehicles cross ON the bridge deck, never over bare water!)
  if (Array.isArray(bridges) && bridges.length > 0) {
    for (let b = 0; b < bridges.length; b++) {
      const br = bridges[b];
      const dx = br.x2 - br.x1;
      const dz = br.z2 - br.z1;
      const bLen = Math.hypot(dx, dz) || 1;
      const nx = -dz / bLen;
      const nz = dx / bLen;
      const yBr = (br.yDeck ?? 18) + 2.2;
      for (const side of [1, -1]) {
        const lx1 = (side > 0 ? br.x1 : br.x2) + nx * 4.2 * side;
        const lz1 = (side > 0 ? br.z1 : br.z2) + nz * 4.2 * side;
        const lx2 = (side > 0 ? br.x2 : br.x1) + nx * 4.2 * side;
        const lz2 = (side > 0 ? br.z2 : br.z1) + nz * 4.2 * side;
        pushSeg(
          lx1, lz1, (lx1 + lx2) * 0.5, (lz1 + lz2) * 0.5, lx2, lz2,
          yBr, yBr, 68 + R(b, side > 0 ? 71 : 73) * 20, 'ground',
          { axis: 'bridge', deck: 0, kind: 'bridge' }
        );
      }
    }
  }

  // Multi-Line Cross-City Public Transit Network (railLoop: true):
  // Replaces dense concentric circles with real rectilinear avenue trunk lines & beltways!
  if (transit && transit.active && Array.isArray(transit.lines)) {
    for (let lIdx = 0; lIdx < transit.lines.length; lIdx++) {
      const line = transit.lines[lIdx];
      const indices = [];
      for (let s = 0; s < line.segments.length; s++) {
        const sg = line.segments[s];
        const yA = sg.y1 !== undefined ? sg.y1 : line.y;
        const yB = sg.y2 !== undefined ? sg.y2 : line.y;
        const idx = pushSeg(
          sg.x1, sg.z1, sg.cx, sg.cz, sg.x2, sg.z2,
          yA, yB,
          line.speed, 'ground',
          {
            ringId: 20 + lIdx,
            ringSeg: s,
            ringSegs: line.segments.length,
            lineId: lIdx,
            axis: 'ring',
            deck: 3,
            kind: 'ring',
            railLoop: true,
          }
        );
        indices.push(idx);
      }
      for (let s = 0; s < indices.length; s++) {
        const nextI = indices[(s + 1) % indices.length];
        lanes[indices[s]].nextIdx = nextI;
        lanes[indices[s]].prevIdx = indices[(s - 1 + indices.length) % indices.length];
        lanes[indices[s]].outs = [nextI];
      }
    }
  }

  // Radial Arterial Highway Corridors streaming vehicles smoothly along the 12 organic major roads!
  const hwyEnd = Math.min(suburbSpan * 0.58, span * 3.2);
  const hwyStart = span * 0.72;
  if (hwyEnd > hwyStart + 320) {
    const radialPt = (kArt, rr) => {
      const baseAng = ((kArt + 0.0) / 12.0) * Math.PI * 2;
      // Invert angular warp once (Newton step) so points trace uRoad == kArt!
      let a = baseAng;
      for (let it = 0; it < 3; it++) {
        const w = 0.135 * Math.sin(rr * 0.00062 + terrainSeedX) * Math.cos(a * 2.0 - terrainSeedZ)
          + 0.075 * Math.cos(rr * 0.00125 - terrainSeedZ * 0.7) * Math.sin(a * 3.0 + terrainSeedX);
        a = baseAng - w;
      }
      return { x: Math.cos(a) * rr, z: Math.sin(a) * rr };
    };
    const stepsH = 5;
    for (let kArt = 0; kArt < 12; kArt++) {
      const secHash = fract(Math.sin(kArt * 19.31 + terrainSeedX * 2.17) * 43758.5453);
      if (secHash < 0.36) continue; // focus highway traffic along the major organic city corridors
      for (const dirSign of [1, -1]) {
        const yHwy = dirSign > 0 ? 34.0 : 48.0;
        const pts = [];
        const nodeY = new Float64Array(stepsH + 1);
        for (let s = 0; s <= stepsH; s++) {
          const u = dirSign > 0 ? (s / stepsH) : ((stepsH - s) / stepsH);
          const rr = hwyStart + (hwyEnd - hwyStart) * u;
          const pt = radialPt(kArt, rr);
          pts.push(pt);
          nodeY[s] = collider
            ? Math.max(yHwy, collider.groundHeightAt(pt.x, pt.z) + 18, collider.maxHeightNear(pt.x, pt.z, 26) + 24)
            : yHwy;
        }
        // Ensure midpoint clearance & cap segment slope so connected nodes NEVER jump in Y!
        for (let s = 0; s < stepsH; s++) {
          const uMid = dirSign > 0 ? ((s + 0.5) / stepsH) : ((stepsH - s - 0.5) / stepsH);
          const pm = radialPt(kArt, hwyStart + (hwyEnd - hwyStart) * uMid);
          if (collider) {
            const yMidNeed = Math.max(yHwy, collider.groundHeightAt(pm.x, pm.z) + 18, collider.maxHeightNear(pm.x, pm.z, 26) + 24);
            if (nodeY[s] < yMidNeed) nodeY[s] = yMidNeed;
            if (nodeY[s + 1] < yMidNeed) nodeY[s + 1] = yMidNeed;
          }
        }
        let prevIdx = -1;
        for (let s = 0; s < stepsH; s++) {
          const uMid = dirSign > 0 ? ((s + 0.5) / stepsH) : ((stepsH - s - 0.5) / stepsH);
          const p0 = pts[s];
          const pm = radialPt(kArt, hwyStart + (hwyEnd - hwyStart) * uMid);
          const p1 = pts[s + 1];
          if (inWater && (inWater(p0.x, p0.z, 18) || inWater(pm.x, pm.z, 18) || inWater(p1.x, p1.z, 18))) {
            prevIdx = -1;
            continue;
          }
          // Quadratic Bezier control point passing through pm at t=0.5
          const cx = 2 * pm.x - 0.5 * (p0.x + p1.x);
          const cz = 2 * pm.z - 0.5 * (p0.z + p1.z);
          const y0 = nodeY[s];
          const y1 = nodeY[s + 1];
          if (!segmentClear(p0.x, p0.z, cx, cz, p1.x, p1.z, y0, y1, 5.2)) {
            prevIdx = -1;
            continue;
          }
          const idx = pushSeg(
            p0.x, p0.z, cx, cz, p1.x, p1.z,
            y0, y1, 98 + R(kArt, s) * 26, 'air-low',
            { axis: 'corridor', deck: 1, kind: 'corridor' }
          );
          if (prevIdx >= 0) lanes[prevIdx].outs = [idx];
          prevIdx = idx;
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

/**
 * Build water bodies for the selected macro-environment `waterMode`:
 *   0: Harbor lagoons + meandering river winding out to the countryside
 *   1: Vast Coastal Ocean & Bay + urban harbor lagoon
 *   2: Archipelago & Peninsula sweeping sea + offshore island waters
 *   3: Great Crater Lake + downtown canal lagoon
 *   4: Dry Arid Basin (no open water)
 */
function makeWaters(seed, sites, radius, waterMode = 0, coastAngle = 0.7, sx = 0, sz = 0, shoreDist = 1.0, waterAmount = 1.0) {
  if (waterMode === 4 || waterAmount <= 0.005) return [];
  const out = [];
  const coreSpan = radius * CELL;
  const amtScale = 0.55 + 0.45 * Math.min(2.0, Math.max(0.0, waterAmount));
  const sdMul = Math.max(0.30, shoreDist);
  const waterSites = sites.filter((s) => s.kind === 'water');
  const limit = Math.min(waterSites.length, waterMode === 0 ? (1 + Math.floor(hash2i(5, 61, seed) * 2)) : 1);
  for (let k = 0; k < limit; k++) {
    const s = waterSites[k];
    const rad = (175 + hash2i(k, 67, seed) * 235) * amtScale;
    const pts = [];
    // Smooth multi-harmonic Fourier shoreline so lagoons & ponds have natural kidney/cove bays instead of spiky polygons!
    const m = 32;
    const ph1 = hash2i(k, 71, seed) * Math.PI * 2;
    const ph2 = hash2i(k, 73, seed) * Math.PI * 2;
    const ph3 = hash2i(k, 79, seed) * Math.PI * 2;
    const stretch = 1.16 + hash2i(k, 83, seed) * 0.28;
    const rotP = hash2i(k, 87, seed) * Math.PI;
    const cp = Math.cos(rotP), sp = Math.sin(rotP);
    for (let i = 0; i < m; i++) {
      const a = (i / m) * Math.PI * 2;
      const lobe = 0.78
        + 0.22 * Math.sin(2 * a + ph1)
        + 0.14 * Math.cos(3 * a - ph2)
        + 0.07 * Math.sin(5 * a + ph3);
      const lx = Math.cos(a) * rad * lobe * stretch;
      const lz = Math.sin(a) * rad * lobe * (2.0 - stretch * 0.78);
      pts.push([s.x + lx * cp - lz * sp, s.z + lx * sp + lz * cp]);
    }
    out.push({ x: s.x, z: s.z, r: rad, pts, kind: 'harbor', seed: hash2i(k, 89, seed) });
  }

  // Natural multi-lobed park/countryside kettle pond in wet basin modes (0, 1, 3)
  const parkSites = sites.filter((s) => s.kind === 'park');
  if (parkSites.length > 0 && waterMode !== 2) {
    const ps = parkSites[0];
    const pRad = (52 + hash2i(9, 69, seed) * 38) * Math.min(1.35, amtScale);
    const pondPts = [];
    const mP = 28;
    const pPh = hash2i(11, 77, seed) * Math.PI * 2;
    for (let i = 0; i < mP; i++) {
      const a = (i / mP) * Math.PI * 2;
      const rLobe = pRad * (0.76 + 0.24 * Math.cos(2 * a + pPh) + 0.13 * Math.sin(3 * a - pPh * 0.7));
      pondPts.push([ps.x + 36 + Math.cos(a) * rLobe * 1.25, ps.z - 28 + Math.sin(a) * rLobe * 0.85]);
    }
    out.push({ x: ps.x + 36, z: ps.z - 28, r: pRad, pts: pondPts, kind: 'pond', seed: hash2i(13, 93, seed) });
  }

  // Build sinuous meandering river channel in Harbor+River (0), Coastal Ocean+Harbor (1) & Archipelago (2) modes!
  // In ocean modes (1 & 2), solve exact shoreline uShore at vMouth (accounting for shoreDist, warp & bayIndent)
  // and extend the estuary mouth 260m SEAWARD into the ocean so the river ALWAYS meets the sea seamlessly!
  if (waterMode === 0 || waterMode === 1 || waterMode === 2) {
    const oceanMouth = waterMode === 1 || waterMode === 2;
    const rAng = waterMode === 0 ? coastAngle : (coastAngle + Math.PI);
    const ca = Math.cos(rAng);
    const sa = Math.sin(rAng);
    let startX = out[0] ? out[0].x : 0;
    let startZ = out[0] ? out[0].z : 0;
    const sideSgn = hash2i(17, 63, seed) >= 0.5 ? 1 : -1;
    if (oceanMouth) {
      const vMouth = sideSgn * (coreSpan * 0.62 + 310);
      const uShoreExact = evalExactCoastShoreU(vMouth, coreSpan, waterMode, sx, sz, shoreDist, waterAmount);
      const c0 = Math.cos(coastAngle), s0 = Math.sin(coastAngle);
      startX = c0 * uShoreExact - s0 * vMouth;
      startZ = s0 * uShoreExact + c0 * vMouth;
    }
    const uMin = oceanMouth ? -260.0 : -95.0;
    const steps = 56;
    const maxLen = Math.max(4800, coreSpan * 4.6);
    const latBias = oceanMouth ? (-sideSgn * 420.0) : 0.0;
    const leftBank = [];
    const rightBank = [];
    const centerline = [];
    for (let i = 0; i <= steps; i++) {
      const frac = i / steps;
      const u = uMin + frac * (maxLen - uMin);
      const t = Math.max(0.0, Math.min(1.0, u / maxLen));
      const sBend1 = Math.sin(u * 0.00155 + sx);
      const sBend2 = Math.cos(u * 0.00068 - sz);
      const sBend3 = Math.sin(u * 0.00310 + sx * 1.7);
      const meander = latBias * t
        + sBend1 * (115 + t * 255)
        + sBend2 * (55 + t * 165)
        + sBend3 * (22 + t * 38);
      const dMeander = (u >= 0 ? latBias / maxLen : 0)
        + Math.cos(u * 0.00155 + sx) * 0.00155 * (115 + t * 255)
        - Math.sin(u * 0.00068 - sz) * 0.00068 * (55 + t * 165)
        + Math.cos(u * 0.00310 + sx * 1.7) * 0.00310 * (22 + t * 38);
      const cx = startX + ca * u - sa * meander;
      const cz = startZ + sa * u + ca * meander;
      const tx = ca - sa * dMeander;
      const tz = sa + ca * dMeander;
      const tl = Math.hypot(tx, tz) || 1;
      const nx = -tz / tl;
      const nz = tx / tl;
      // Natural fluvial morphology + wide estuary delta flare where the river meets the ocean!
      const bendSwelling = Math.abs(sBend1) * 14 + (1 - Math.min(1, t * 3.5)) * 18;
      const mouthFlare = oceanMouth ? (56.0 * (1.0 - smoothstep01(-180.0, 95.0, u))) : 0.0;
      const halfW = (34 + t * 44 + bendSwelling + mouthFlare + Math.sin(u * 0.0085 + sx) * 6) * amtScale;
      leftBank.push([cx + nx * halfW, cz + nz * halfW]);
      rightBank.push([cx - nx * halfW, cz - nz * halfW]);
      centerline.push({ x: cx, z: cz, tx: tx / tl, tz: tz / tl, nx, nz, halfW, u });
    }
    const riverPts = [...leftBank, ...rightBank.reverse()];
    const riverSpec = {
      active: true,
      oceanMouth,
      startX,
      startZ,
      rAng,
      uMin,
      maxLen,
      latBias,
      amtScale,
      sx,
      sz,
    };
    out.push({
      x: startX + ca * maxLen * 0.45,
      z: startZ + sa * maxLen * 0.45,
      r: maxLen * 0.5,
      pts: riverPts,
      centerline,
      riverSpec,
      kind: 'river',
      seed: hash2i(19, 91, seed),
    });
  }

  if (waterMode === 1 || waterMode === 2) {
    // Vast Coastal Ocean / Archipelago Sea (WATER_FRAG discards cDist > 0 so land NEVER floods!)
    const ca = Math.cos(coastAngle);
    const sa = Math.sin(coastAngle);
    const outerR = 13500;
    const uStart = waterMode === 2
      ? -Math.max(950, coreSpan * 1.45)
      : Math.max(80, coreSpan * 0.32 * sdMul - 380);
    const pts = [];
    const arcSegs = 28;
    const maxAng = waterMode === 2 ? Math.PI * 0.78 : Math.PI * 0.56;
    for (let i = 0; i <= arcSegs; i++) {
      const a = coastAngle - maxAng + (i / arcSegs) * (maxAng * 2);
      pts.push([Math.cos(a) * outerR, Math.sin(a) * outerR]);
    }
    for (let i = 10; i >= 0; i--) {
      const f = (i / 10) * 2 - 1;
      const v = f * outerR * Math.sin(maxAng) * 0.85;
      pts.push([ca * uStart - sa * v, sa * uStart + ca * v]);
    }
    out.push({
      x: ca * (coreSpan * 2.5 * sdMul),
      z: sa * (coreSpan * 2.5 * sdMul),
      r: outerR,
      pts,
      kind: 'ocean',
      analytical: true,
      waterMode,
      coastAngle,
      coreSpan,
      uStart,
      maxAng,
      seed: hash2i(23, 97, seed),
    });
  } else if (waterMode === 3) {
    // Great Crater Lake nestled between suburbs and foothills
    const ca = Math.cos(coastAngle);
    const sa = Math.sin(coastAngle);
    const lakeU = Math.max(950.0, coreSpan * 2.25 * sdMul);
    const lakeR = Math.max(680.0, coreSpan * 1.32 * amtScale) + 380.0;
    const lx = ca * lakeU;
    const lz = sa * lakeU;
    const pts = [];
    const segs = 32;
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      pts.push([lx + Math.cos(a) * lakeR, lz + Math.sin(a) * (lakeR * 1.25)]);
    }
    out.push({
      x: lx,
      z: lz,
      r: lakeR,
      pts,
      kind: 'lake',
      analytical: true,
      waterMode,
      coastAngle,
      coreSpan,
      seed: hash2i(29, 101, seed),
    });
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

/**
 * Trees & Park Groves — procedural real branching canopies or cyber-dendritic
 * supertrees depending on look/mode, with dense groves inside every park.
 */
function makeTrees(seed, radius, water, lmCells, places, boulevards = [], sites = [], inWaterFn = null, vegCover = 1.0, vegScale = 1.0) {
  if (vegCover <= 0.008) return [];
  const trees = [];
  const span = radius * CELL + CELL * 0.4;
  const inWater = inWaterFn || ((x, z) => water.some((w) => !w.analytical && pointInPoly(x, z, w.pts)));
  const nonParkNear = (x, z) => places.some((p) => p.kind !== 'park' && Math.hypot(p.x - x, p.z - z) < p.r + 22);
  const cov = Math.max(0, Math.min(2.5, vegCover));
  let k = 0;

  // 1. Avenue colonnade trees inside the core (kept < 1700m & h in 9..20m for contract)
  const aveStep = cov >= 1.65 ? 2 : 4;
  const zStep = Math.max(36, Math.round(64 / Math.max(0.5, Math.min(1.8, cov))));
  for (let a = -radius; a <= radius; a += aveStep) {
    const p = a * CELL;
    for (let z = -span; z <= span; z += zStep) {
      for (const sx of [1, -1]) {
        const x = p + sx * (a % 4 === 0 ? 24 : 11) + (hash2i(k, 131, seed) - 0.5) * 8;
        const zz = z + (hash2i(k, 137, seed) - 0.5) * 12;
        k++;
        if (Math.abs(x) > span || Math.abs(zz) > span) continue;
        if (inWater(x, zz) || nonParkNear(x, zz)) continue;
        const cell = Math.floor(x / CELL) + ',' + Math.floor(zz / CELL);
        if (lmCells.has(cell)) continue;
        if (hash2i(k, 139, seed) > 0.65 * cov) continue;
        trees.push({ x, y: 0, z: zz, h: 9 + hash2i(k, 149, seed) * 9, seed: hash2i(k, 151, seed), role: 'avenue' });
      }
    }
  }

  // 2. Diagonal boulevard trees / bio-illuminators
  for (let bIdx = 0; bIdx < boulevards.length; bIdx++) {
    const b = boulevards[bIdx];
    const dx = b.x2 - b.x1;
    const dz = b.z2 - b.z1;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    const steps = Math.max(4, Math.floor((len / 72) * Math.min(1.8, Math.max(0.5, cov))));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      for (const side of [-1, 1]) {
        const tx = b.x1 + dx * t + nx * side * 26;
        const tz = b.z1 + dz * t + nz * side * 26;
        k++;
        if (Math.abs(tx) > span || Math.abs(tz) > span) continue;
        if (inWater(tx, tz) || nonParkNear(tx, tz)) continue;
        if (hash2i(k, 157, seed) > 0.7 * cov) continue;
        trees.push({ x: tx, y: 0, z: tz, h: 10 + hash2i(k, 163, seed) * 10, seed: hash2i(k, 167, seed), role: 'boulevard' });
      }
    }
  }

  // 3. Rich Botanical / Cyber Park Groves + Monumental Bio-Arcology Mega-Trees inside every `park` place!
  for (let pIdx = 0; pIdx < places.length; pIdx++) {
    const pl = places[pIdx];
    if (pl.kind !== 'park') continue;
    // Central hero Mother-Tree / Supertree hub
    const heroBase = pl.showcase ? 25.5 : (20 + hash2i(pIdx, 173, seed) * 7.2);
    const megaBoost = vegScale > 1.05 ? Math.pow(vegScale, 1.15) : 1.0;
    trees.push({
      x: pl.x - pl.r * 0.14,
      y: 0.7,
      z: pl.z + pl.r * 0.12,
      h: Math.min(220, heroBase * megaBoost),
      seed: hash2i(pIdx, 179, seed),
      role: 'park-hero',
      parkId: pIdx,
    });
    // In Showcase Central Park or elevated vegScale, add a crown ring of towering Supertree Bio-Arcologies!
    if ((pl.showcase || vegScale > 1.25) && cov > 0.25) {
      const superN = pl.showcase ? 5 : 3;
      for (let st = 0; st < superN; st++) {
        const sang = (st / superN) * Math.PI * 2 + 0.45;
        const srr = pl.r * 0.52;
        const sx = pl.x + Math.cos(sang) * srr;
        const sz = pl.z + Math.sin(sang) * srr;
        if (inWater(sx, sz)) continue;
        const sh = (22 + hash2i(pIdx * 17 + st, 183, seed) * 5.5) * megaBoost;
        trees.push({
          x: sx, y: 0.7, z: sz,
          h: Math.min(200, sh),
          seed: hash2i(pIdx * 17 + st, 187, seed),
          role: 'park-hero',
          parkId: pIdx,
        });
      }
    }
    const groveN = Math.max(4, Math.round((20 + Math.floor(hash2i(pIdx, 181, seed) * 12) + (pl.showcase ? 18 : 0)) * cov));
    for (let g = 0; g < groveN; g++) {
      const frac = (g + 0.5) / groveN;
      const ang = g * 2.39996 + pl.seed * 6.28;
      const rr = pl.r * (0.28 + 0.66 * Math.sqrt(frac));
      const tx = pl.x + Math.cos(ang) * rr;
      const tz = pl.z + Math.sin(ang) * rr;
      if (Math.hypot(tx - (pl.x + pl.r * 0.18), tz - (pl.z - pl.r * 0.10)) < pl.r * 0.24) continue;
      if (pl.showcase && Math.hypot(tx - (pl.x - pl.r * 0.28), tz - (pl.z - pl.r * 0.22)) < pl.r * 0.20) continue;
      if (inWater(tx, tz)) continue;
      const hTree = (g % 5 === 0
        ? 17 + hash2i(pIdx * 41 + g, 191, seed) * 8.5
        : 8.5 + hash2i(pIdx * 41 + g, 193, seed) * 9.5) * (vegScale > 1.05 ? (0.65 + 0.35 * vegScale) : 1.0);
      trees.push({
        x: tx,
        y: 0.7,
        z: tz,
        h: hTree,
        seed: hash2i(pIdx * 41 + g, 197, seed),
        role: g % 5 === 0 ? 'park-hero' : 'park',
        parkId: pIdx,
      });
    }
  }

  // 4. Pocket greenbelt groves around Voronoi `park` district sites + riverside riparian corridors!
  for (let sIdx = 0; sIdx < sites.length; sIdx++) {
    const st = sites[sIdx];
    if (st.kind !== 'park') continue;
    const siteGroveN = Math.max(2, Math.round(10 * cov));
    for (let g = 0; g < siteGroveN; g++) {
      const a = (g / siteGroveN) * Math.PI * 2 + hash2i(sIdx * 19 + g, 199, seed) * 0.5;
      const rr = 18 + hash2i(sIdx * 19 + g, 211, seed) * 44;
      const tx = st.x + Math.cos(a) * rr;
      const tz = st.z + Math.sin(a) * rr;
      if (Math.abs(tx) > span || Math.abs(tz) > span || inWater(tx, tz) || nonParkNear(tx, tz)) continue;
      trees.push({
        x: tx,
        y: 0,
        z: tz,
        h: (9.5 + hash2i(sIdx * 19 + g, 223, seed) * 10.5) * (vegScale > 1.05 ? (0.7 + 0.3 * vegScale) : 1.0),
        seed: hash2i(sIdx * 19 + g, 227, seed),
        role: 'grove',
        parkId: 100 + sIdx,
      });
    }
  }

  // 5. Lush Riparian Riverbank Groves lining meandering rivers
  const river = water.find((w) => w.kind === 'river' && Array.isArray(w.centerline));
  if (river && cov > 0.2) {
    const rStep = Math.max(1, Math.round(2 / Math.min(2.0, cov)));
    for (let i = 1; i < river.centerline.length - 1; i += rStep) {
      const rp = river.centerline[i];
      for (const bSide of [-1, 1]) {
        if (hash2i(i * 7 + (bSide > 0 ? 1 : 0), 233, seed) > 0.55 * cov) continue;
        const off = rp.halfW + 30 + hash2i(i, 239, seed) * 24;
        const rx = rp.x + rp.nx * bSide * off;
        const rz = rp.z + rp.nz * bSide * off;
        if (inWater(rx, rz) || nonParkNear(rx, rz)) continue;
        trees.push({
          x: rx, y: 0, z: rz,
          h: (11 + hash2i(i, 241, seed) * 11) * (vegScale > 1.05 ? (0.7 + 0.3 * vegScale) : 1.0),
          seed: hash2i(i + (bSide > 0 ? 50 : 0), 251, seed),
          role: 'grove',
          parkId: 300,
        });
      }
    }
  }

  return trees;
}

/**
 * Connect nearby park, grove, and boulevard trees into an aerial canopy
 * network (festoon lantern cables / skywalk bridges in Real mode, glowing
 * neural fiber-optic energy filaments in Artificial mode).
 */
function makeTreeConnections(trees, seed = 4417) {
  const links = [];
  const candidates = [];
  for (let i = 0; i < trees.length; i++) {
    const tr = trees[i];
    if (tr.role === 'park-hero' || tr.role === 'park' || tr.role === 'grove' || tr.role === 'boulevard') {
      candidates.push(i);
    }
  }
  const seen = new Set();
  for (let ci = 0; ci < candidates.length; ci++) {
    const i = candidates[ci];
    const a = trees[i];
    const isHero = a.role === 'park-hero';
    const maxLinks = isHero ? 4 : (a.role === 'park' || a.role === 'grove' ? 2 : 1);
    const maxDist = isHero ? 56 : (a.role === 'boulevard' ? 80 : 42);
    const minDist = 8.5;
    const best = [];
    for (let cj = 0; cj < candidates.length; cj++) {
      if (ci === cj) continue;
      const j = candidates[cj];
      const b = trees[j];
      if (a.role === 'boulevard' && b.role !== 'boulevard') continue;
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d < minDist || d > maxDist) continue;
      best.push({ j, d });
    }
    best.sort((p, q) => p.d - q.d);
    const take = Math.min(maxLinks, best.length);
    for (let m = 0; m < take; m++) {
      const j = best[m].j;
      const lo = Math.min(i, j);
      const hi = Math.max(i, j);
      const key = `${lo}:${hi}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const b = trees[j];
      const ay = (a.y || 0) + a.h * (a.role === 'park-hero' ? 0.68 : 0.64);
      const by = (b.y || 0) + b.h * (b.role === 'park-hero' ? 0.68 : 0.64);
      links.push({
        x1: a.x, y1: ay, z1: a.z,
        x2: b.x, y2: by, z2: b.z,
        dist: best[m].d,
        sag: Math.min(4.2, best[m].d * 0.085),
        hero: a.role === 'park-hero' || b.role === 'park-hero',
        seed: hash2i(lo, hi, seed ^ 0x7c41),
      });
    }
  }
  return links;
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

function addTower(push, pushBeacon, pushBill, pushSign, rand, x0, x1, z0, z1, h01, d, edgeT = 1, baseAngle = 0, signAmt = 1.0, megaWrap = 1.0) {
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
  // Illuminated billboards & giant facade-covering wraps on medium & tall towers (scaled by signAmt & megaWrap!)
  const billProb = Math.min(0.92, 0.42 * signAmt);
  if (H > 72 && rand() < billProb) {
    const wantMega = H > 130 && megaWrap > 0.15 && rand() < Math.min(0.75, 0.28 * megaWrap);
    const portrait = wantMega || rand() < 0.42;
    const bh = wantMega
      ? Math.min(H * 0.58, 42 + rand() * 54 * Math.min(1.6, megaWrap))
      : (portrait ? 22 + rand() * 28 : 9 + rand() * 14);
    const bw = wantMega
      ? Math.min(54, Math.max(18, (rand() < 0.5 ? tw : td) * (0.76 + rand() * 0.18)))
      : (portrait
        ? Math.min(26, Math.max(10, (rand() < 0.5 ? tw : td) * (0.44 + rand() * 0.26)))
        : Math.min(48, Math.max(14, (rand() < 0.5 ? tw : td) * (0.68 + rand() * 0.32))));
    const by = Math.max(44, H * (wantMega ? (0.42 + rand() * 0.24) : (0.34 + rand() * 0.46)));
    if (rand() < 0.5) {
      const [bx, bz] = rotOff(cx, cz, (rand() < 0.5 ? 1 : -1) * (tw / 2 + 1.25), 0, segRot);
      pushBill({ x: bx, y: by, z: bz, w: 2.2, h: bh, d: bw, rot: segRot, seed: rand(), mega: wantMega });
    } else {
      const [bx, bz] = rotOff(cx, cz, 0, (rand() < 0.5 ? 1 : -1) * (td / 2 + 1.25), segRot);
      pushBill({ x: bx, y: by, z: bz, w: bw, h: bh, d: 2.2, rot: segRot, seed: rand(), mega: wantMega });
    }
    // High signAmt adds complementary secondary billboards on adjacent faces!
    if (signAmt > 1.25 && H > 82 && rand() < Math.min(0.92, (signAmt - 1.0) * 0.85)) {
      const [bx2, bz2] = rotOff(cx, cz, 0, (rand() < 0.5 ? 1 : -1) * (td / 2 + 1.25), segRot);
      pushBill({ x: bx2, y: Math.max(44, H * 0.72), z: bz2, w: Math.min(42, tw * 0.78), h: 12 + rand() * 10, d: 2.2, rot: segRot, seed: rand() });
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

  // Deterministic 3D rooftop architectural diversity (twin comms antennas, chiller penthouses, water towers & dishes — uses hash2i so upstream rand() sequence stays 100% deterministic!)
  const rSeed = hash2i(Math.round(cx * 3), Math.round(cz * 3), Math.round(H * 7));
  const rSeed2 = hash2i(Math.round(cz * 5), Math.round(cx * 2), Math.round(tw * 11));
  if (H > 28 && tw > 12 && td > 12) {
    if (rSeed < 0.32) {
      // Twin asymmetric comms whip antennas + microwave drum
      const [ax1, az1] = rotOff(cx, cz, tw * 0.26, td * 0.24, segRot);
      const [ax2, az2] = rotOff(cx, cz, -tw * 0.22, -td * 0.20, segRot);
      const h1 = 8 + rSeed2 * 18;
      const h2 = 5 + (1 - rSeed2) * 12;
      push(ax1, y + 2.2 + h1 * 0.5, az1, 0.75, h1, 0.75, rSeed, KIND.MAST, style, segRot);
      push(ax2, y + 2.2 + h2 * 0.5, az2, 0.65, h2, 0.65, rSeed2, KIND.MAST, style, segRot);
      push(ax1, y + 2.2 + h1 * 0.62, az1, 2.2, 1.8, 0.9, rSeed2, KIND.SLAB, style, segRot + 0.4);
    } else if (rSeed < 0.58) {
      // Classic rooftop cylindrical water tank on steel trestle legs + chiller unit
      const [wx, wz] = rotOff(cx, cz, (rSeed2 - 0.5) * tw * 0.42, (0.5 - rSeed2) * td * 0.38, segRot);
      push(wx, y + 3.4, wz, 2.8, 2.4, 2.8, rSeed, KIND.MAST, 2, segRot);
      push(wx, y + 6.4, wz, 4.4, 4.6, 4.4, rSeed2, KIND.SLAB, 2, segRot);
      push(wx, y + 6.4, wz, 4.4, 4.6, 4.4, rSeed2, KIND.SLAB, 2, segRot + Math.PI * 0.25);
    } else if (rSeed < 0.82) {
      // Twin louvered HVAC cooling-tower units + rooftop duct spine
      const [hx1, hz1] = rotOff(cx, cz, -tw * 0.18, 0, segRot);
      const [hx2, hz2] = rotOff(cx, cz, tw * 0.18, 0, segRot);
      push(hx1, y + 3.8, hz1, Math.min(6.5, tw * 0.28), 3.4, Math.min(6.5, td * 0.32), rSeed, KIND.SLAB, 2, segRot);
      push(hx2, y + 3.5, hz2, Math.min(5.8, tw * 0.26), 2.8, Math.min(5.8, td * 0.28), rSeed2, KIND.SLAB, 2, segRot);
    }
  }
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
 * Organic non-grid outskirts cluster seated on terrain `baseY` along curved
 * peri-urban corridors.
 */
function addOutskirtsCluster(push, pushBeacon, pushSign, rand, cx, cz, baseY, baseRot, fade) {
  const n = 2 + Math.floor(rand() * (2 + 3.2 * fade));
  for (let k = 0; k < n; k++) {
    const roll = rand();
    const ang = rand() * Math.PI * 2;
    const dist = (6 + rand() * 36) * (0.55 + 0.45 * fade);
    const px = cx + Math.cos(ang) * dist;
    const pz = cz + Math.sin(ang) * dist;
    const rot = baseRot + (rand() - 0.5) * 0.42;
    if (fade > 0.48 && roll < 0.30) {
      // Low-story courtyard workshop / roadside inn (2–4 stories max)
      const hh = 6.5 + rand() * 11 * fade;
      const bw = 13 + rand() * 18;
      const bd = 11 + rand() * 15;
      push(px, baseY + hh / 2, pz, bw, hh, bd, rand(), KIND.WALL, 2, rot);
      push(px, baseY + hh + 0.7, pz, bw * 0.88, 1.4, bd * 0.88, rand(), KIND.SLAB, 2, rot);
      if (rand() < 0.25) {
        pushSign({ x: px, y: baseY + hh + 3.2, z: pz, w: bw * 0.52, h: 3.0, d: 1.5, rot, seed: rand() });
      }
    } else if (roll < 0.52) {
      // Pitched-roof logistics shed / agricultural storage barn
      const hh = (4.2 + rand() * 7.5) * (0.45 + 0.55 * fade);
      const bw = 15 + rand() * 24 * fade;
      const bd = 10 + rand() * 15 * fade;
      push(px, baseY + hh / 2, pz, bw, hh, bd, rand(), KIND.SLAB, 2, rot);
      push(px, baseY + hh + 0.75, pz, bw * 0.86, 1.5, bd * 0.58, rand(), KIND.SLAB, 2, rot);
    } else if (roll < 0.72) {
      // Twin cylindrical grain/fuel silos (crossed boxes + conical cap)
      const hh = (8 + rand() * 14) * (0.4 + 0.6 * fade);
      const sr = 5.5 + rand() * 6.5 * fade;
      push(px, baseY + hh / 2, pz, sr, hh, sr, rand(), KIND.WALL, 2, rot);
      push(px, baseY + hh / 2, pz, sr, hh, sr, rand(), KIND.WALL, 2, rot + Math.PI / 4);
      push(px, baseY + hh + 0.9, pz, sr * 0.76, 1.8, sr * 0.76, rand(), KIND.SLAB, 2, rot);
    } else if (roll < 0.88) {
      // Steel lattice transmission pylon
      const hh = (18 + rand() * 26) * (0.45 + 0.55 * fade);
      push(px, baseY + hh / 2, pz, 1.5, hh, 1.5, rand(), KIND.MAST, 0, rot);
      push(px, baseY + hh * 0.78, pz, 7 * fade + 2.5, 0.9, 1.1, rand(), KIND.MAST, 0, rot);
      push(px, baseY + hh + 0.7, pz, 1.3, 1.4, 1.3, rand(), KIND.BAND, 0, rot);
      if (rand() < 0.38) pushBeacon(px, baseY + hh + 1.8, pz, rand());
    } else {
      // Solar collector / greenhouse pad
      push(px, baseY + 1.4, pz, 16 + rand() * 22, 2.8, 12 + rand() * 16, rand(), KIND.SLAB, 2, rot);
    }
  }
}

/**
 * Emit a simple, believable 1–2 story suburban house strictly aligned with its
 * curved residential street tangent (`houseRot`), complete with overhanging
 * pitched roof ridge, porch/garage wing, and warm sparse domestic windows.
 */
function addSuburbanHouse(push, rand, hx, baseY, hz, houseRot, scaleMul = 1.0) {
  const variant = rand();
  let pieces = 0;
  if (variant < 0.56) {
    // 1-story Ranch / Bungalow (3.8–4.8m eaves + pitched roof ridge + side garage)
    const hw = (10.5 + rand() * 5.2) * scaleMul;
    const hd = (8.2 + rand() * 3.4) * scaleMul;
    const hh = 3.7 + rand() * 1.15;
    push(hx, baseY + hh * 0.5, hz, hw, hh, hd, rand(), KIND.WALL, 2, houseRot);
    // Overhanging eaves slab + pitched gable ridge spine
    push(hx, baseY + hh + 0.42, hz, hw + 1.1, 0.84, hd + 1.1, rand(), KIND.SLAB, 2, houseRot);
    push(hx, baseY + hh + 1.35, hz, hw * 0.90, 1.35, hd * 0.52, rand(), KIND.SLAB, 2, houseRot);
    pieces += 3;
    // Attached low garage + street-facing driveway apron
    if (rand() < 0.72) {
      const side = rand() < 0.5 ? -1 : 1;
      const [gx, gz] = rotOff(hx, hz, side * (hw * 0.5 + 2.6), 0.7, houseRot);
      push(gx, baseY + 1.65, gz, 5.4, 3.3, 6.2, rand(), KIND.SLAB, 2, houseRot);
      pieces += 1;
    }
  } else if (variant < 0.88) {
    // 2-story Family Home (5.8–7.2m walls + front porch canopy + pitched roof)
    const hw = (9.2 + rand() * 4.4) * scaleMul;
    const hd = (8.4 + rand() * 3.2) * scaleMul;
    const hh = 5.8 + rand() * 1.45;
    push(hx, baseY + hh * 0.5, hz, hw, hh, hd, rand(), KIND.WALL, 2, houseRot);
    push(hx, baseY + hh + 0.48, hz, hw + 1.0, 0.96, hd + 1.0, rand(), KIND.SLAB, 2, houseRot);
    push(hx, baseY + hh + 1.55, hz, hw * 0.84, 1.45, hd * 0.50, rand(), KIND.SLAB, 2, houseRot);
    // Street-facing front porch awning (+Z in local frame faces street)
    const [px, pz] = rotOff(hx, hz, 0, hd * 0.5 + 1.3, houseRot);
    push(px, baseY + 2.85, pz, hw * 0.56, 0.55, 2.6, rand(), KIND.SLAB, 2, houseRot);
    pieces += 4;
  } else {
    // Low L-shaped Courtyard Duplex (1.5–2 stories, 4.8–6.0m)
    const hw = (12.5 + rand() * 5.0) * scaleMul;
    const hd = (7.6 + rand() * 2.6) * scaleMul;
    const hh = 4.6 + rand() * 1.35;
    push(hx, baseY + hh * 0.5, hz, hw, hh, hd, rand(), KIND.WALL, 2, houseRot);
    push(hx, baseY + hh + 0.65, hz, hw * 0.94, 1.25, hd * 0.62, rand(), KIND.SLAB, 2, houseRot);
    const wingSide = rand() < 0.5 ? -1 : 1;
    const [wx, wz] = rotOff(hx, hz, wingSide * (hw * 0.34), hd * 0.48, houseRot);
    push(wx, baseY + hh * 0.42, wz, hw * 0.36, hh * 0.84, 5.2, rand(), KIND.WALL, 2, houseRot);
    pieces += 3;
  }
  return pieces;
}

/**
 * Neighbourhood corner shop / small retail strip aligned to the local street.
 */
function addSuburbanShop(push, pushSign, pushLamp, rand, sx, baseY, sz, streetRot) {
  const bw = 18 + rand() * 12;
  const bd = 11 + rand() * 4.5;
  const bh = 4.8 + rand() * 1.6;
  // style=4 renders bright ground-level storefront windows + fascia cornice
  push(sx, baseY + bh * 0.5, sz, bw, bh, bd, rand(), KIND.WALL, 4, streetRot);
  push(sx, baseY + bh + 0.55, sz, bw + 1.2, 1.05, bd + 1.2, rand(), KIND.SLAB, 4, streetRot);
  // Projecting shopfront canopy + illuminated fascia sign facing the street
  const [cx, cz] = rotOff(sx, sz, 0, bd * 0.5 + 1.8, streetRot);
  push(cx, baseY + 3.4, cz, bw * 0.92, 0.65, 3.2, rand(), KIND.SLAB, 4, streetRot);
  pushSign({
    x: cx, y: baseY + bh + 2.1, z: cz,
    w: Math.min(14, bw * 0.65), h: 2.2, d: 1.1,
    rot: streetRot, seed: rand(),
  });
  pushLamp({ x: cx, y: baseY + 5.8, z: cz });
  return 3;
}

/**
 * Regional Power Station + High-Voltage Switchyard + Steel Transmission Pylon Line.
 */
function addPowerStation(
  push, pushBeacon, pushLamp, rand,
  px, pz, rot, terrainY, inWater, terrainSlopeAt
) {
  const baseY = terrainY(px, pz);
  let pieces = 0;

  // Ground compound pad
  push(px, baseY + 0.6, pz, 92, 1.2, 68, rand(), KIND.SLAB, 2, rot);
  pieces++;

  // Main turbine hall + boiler house with clerestory band
  const [hx, hz] = rotOff(px, pz, -16, -6, rot);
  push(hx, baseY + 7.5, hz, 38, 15.0, 24, rand(), KIND.WALL, 2, rot);
  push(hx, baseY + 15.6, hz, 39.5, 1.3, 25.2, rand(), KIND.BAND, 1, rot);
  pieces += 2;

  // Twin hyperboloid-profiled cooling towers (stepped octagonal rings + mist rim)
  for (const side of [-1, 1]) {
    const [tx, tz] = rotOff(px, pz, 22, side * 16, rot);
    const ty = terrainY(tx, tz);
    const towerH = 32 + rand() * 8;
    const rings = 4;
    for (let r = 0; r < rings; r++) {
      const f = r / (rings - 1);
      // Hyperbolic waist at f ~ 0.68, flared base & lip
      const waist = 1.0 - 0.24 * Math.sin(f * Math.PI * 0.86);
      const wRing = (21 - f * 4.5) * waist;
      const segH = towerH / rings;
      const yc = ty + (r + 0.5) * segH;
      push(tx, yc, tz, wRing, segH * 1.02, wRing, rand(), KIND.SLAB, 2, rot);
      push(tx, yc, tz, wRing, segH * 1.02, wRing, rand(), KIND.SLAB, 2, rot + Math.PI * 0.25);
      pieces += 2;
    }
    push(tx, ty + towerH + 0.8, tz, 15.8, 1.5, 15.8, rand(), KIND.BAND, 1, rot);
    pushBeacon(tx, ty + towerH + 2.8, tz, rand());
    pieces++;
  }

  // High-voltage transformer switchyard (rows of busbar gantries & transformer blocks)
  for (let row = -1; row <= 1; row++) {
    const [sx, sz] = rotOff(px, pz, -14 + row * 11, 20, rot);
    push(sx, baseY + 2.6, sz, 6.2, 5.2, 4.8, rand(), KIND.SLAB, 2, rot);
    push(sx, baseY + 7.2, sz, 9.5, 0.7, 0.9, rand(), KIND.MAST, 0, rot);
    pieces += 2;
  }
  pushLamp({ x: px, y: baseY + 9.0, z: pz });

  // Connected steel lattice transmission pylons marching outward across the countryside!
  const lineAng = -rot + (rand() - 0.5) * 0.4;
  const dx = Math.cos(lineAng);
  const dz = Math.sin(lineAng);
  for (let p = 1; p <= 9; p++) {
    const dist = 95 + p * 145;
    const mx = px + dx * dist;
    const mz = pz + dz * dist;
    if (inWater(mx, mz) || terrainSlopeAt(mx, mz) > 0.38) continue;
    const my = terrainY(mx, mz);
    const mh = 24 + (p % 2) * 3;
    const mRot = -lineAng;
    // Lattice mast + lower & upper cross-arms + aviation warning beacon
    push(mx, my + mh * 0.5, mz, 1.8, mh, 1.8, rand(), KIND.MAST, 0, mRot);
    push(mx, my + mh * 0.68, mz, 1.2, 0.85, 11.5, rand(), KIND.MAST, 0, mRot);
    push(mx, my + mh * 0.88, mz, 1.1, 0.80, 8.4, rand(), KIND.MAST, 0, mRot);
    pieces += 3;
    if (p % 3 === 0) pushBeacon(mx, my + mh + 1.6, mz, rand());
  }

  return pieces;
}

/**
 * Rural Farmstead aligned with the local Voronoi agricultural field orientation:
 * pitched-roof barn, twin grain silos, parallel greenhouses, farmhouse, windpump,
 * and neat orchard tree rows.
 */
function addFarmstead(push, pushTree, rand, fx, fz, fieldRot, terrainY) {
  const baseY = terrainY(fx, fz);
  let pieces = 0;

  // Classic pitched-roof main Barn (gambrel/gable massing)
  const barnW = 19 + rand() * 7;
  const barnD = 11.5 + rand() * 3.5;
  const barnH = 7.4 + rand() * 2.4;
  push(fx, baseY + barnH * 0.5, fz, barnW, barnH, barnD, rand(), KIND.SLAB, 2, fieldRot);
  push(fx, baseY + barnH + 1.35, fz, barnW * 0.94, 2.7, barnD * 0.68, rand(), KIND.SLAB, 2, fieldRot);
  push(fx, baseY + barnH + 2.95, fz, barnW * 0.88, 1.2, barnD * 0.34, rand(), KIND.SLAB, 2, fieldRot);
  pieces += 3;

  // 2–3 tall cylindrical Grain Silos beside the barn
  const siloCount = 2 + (rand() < 0.45 ? 1 : 0);
  for (let s = 0; s < siloCount; s++) {
    const [sx, sz] = rotOff(fx, fz, barnW * 0.5 + 5.2 + s * 6.4, -barnD * 0.22, fieldRot);
    const sy = terrainY(sx, sz);
    const sh = 13.5 + rand() * 5.5 - s * 1.4;
    const sr = 4.6 + rand() * 1.1;
    push(sx, sy + sh * 0.5, sz, sr, sh, sr, rand(), KIND.WALL, 2, fieldRot);
    push(sx, sy + sh * 0.5, sz, sr, sh, sr, rand(), KIND.WALL, 2, fieldRot + Math.PI * 0.25);
    push(sx, sy + sh + 1.1, sz, sr * 0.82, 2.2, sr * 0.82, rand(), KIND.SLAB, 2, fieldRot);
    pieces += 3;
  }

  // Low 2-story Farmhouse across the farmyard
  const [hx, hz] = rotOff(fx, fz, -barnW * 0.65 - 9, 12, fieldRot);
  pieces += addSuburbanHouse(push, rand, hx, terrainY(hx, hz), hz, fieldRot + Math.PI * 0.5, 0.95);

  // 2–3 parallel long low Greenhouses / Polytunnels aligned with crop furrows
  const ghCount = 2 + Math.floor(rand() * 2);
  for (let g = 0; g < ghCount; g++) {
    const [gx, gz] = rotOff(fx, fz, 4, -barnD * 0.5 - 12 - g * 9.5, fieldRot);
    const gy = terrainY(gx, gz);
    push(gx, gy + 1.75, gz, 26 + rand() * 10, 3.5, 6.4, rand(), KIND.SLAB, 2, fieldRot);
    pieces++;
  }

  // Lattice Windpump / Rural Water Tower
  const [wx, wz] = rotOff(fx, fz, -barnW * 0.5 - 8, -10, fieldRot);
  const wy = terrainY(wx, wz);
  push(wx, wy + 7.5, wz, 1.3, 15.0, 1.3, rand(), KIND.MAST, 0, fieldRot);
  push(wx, wy + 15.5, wz, 3.6, 3.6, 0.8, rand(), KIND.BAND, 2, fieldRot);
  pieces += 2;

  // Neat orchard row along the field edge
  for (let t = 0; t < 4; t++) {
    const [ox, oz] = rotOff(fx, fz, -18 + t * 12, 24, fieldRot);
    pushTree({ x: ox, y: terrainY(ox, oz), z: oz, h: 6.2 + rand() * 3.8, seed: rand(), role: 'orchard' });
  }

  return pieces;
}

/**
 * Exact 3-step fixed-point inverse of `evalRoadWeb`: maps `(cellU, fu, cellV, fv)`
 * inside any curvilinear trapezoid road block directly to world `(x, z)` to <2cm!
 */
export function roadWebToWorld(cellU, fu, cellV, fv, sx = 0, sz = 0) {
  const angTarget = ((cellU + fu) / 12.0) * Math.PI * 2;
  const rTarget = Math.max(120, (cellV + fv) * 380.0);
  let ang = angTarget;
  let r = rTarget;
  for (let it = 0; it < 3; it++) {
    r = Math.max(
      80,
      rTarget - (
        135.0 * Math.sin(ang * 3.0 + sx * 1.1) +
        78.0 * Math.cos(ang * 5.0 - sz * 1.3 + r * 0.00055) +
        65.0 * Math.sin(ang * 4.0 - sx * 0.6 + r * 0.0004)
      )
    );
    ang = angTarget - (
      0.135 * Math.sin(r * 0.00062 + sx) * Math.cos(ang * 2.0 - sz) +
      0.075 * Math.cos(r * 0.00125 - sz * 0.7) * Math.sin(ang * 3.0 + sx)
    );
  }
  return { x: Math.cos(ang) * r, z: Math.sin(ang) * r, r, ang };
}

/**
 * Organic Ribbon / Finger City Growth along the major radial arterial highways:
 * High-rise & mid-rise commercial/apartment corridors branch naturally outward
 * from the downtown core along primary roads, tapering smoothly into the suburbs.
 */
function addArterialCorridors({
  seed, noise, coreSpan, suburbSpan, reach,
  terrainSeedX, terrainSeedZ,
  inWater, nearBoulevard, terrainY, terrainSlopeAt,
  push, pushBeacon, pushBill, pushSign, pushLamp,
}) {
  if (reach <= 0.02) return 0;
  let corridorTowers = 0;

  for (let kArt = 0; kArt < 12; kArt++) {
    const secHash = fract(Math.sin(kArt * 19.31 + terrainSeedX * 2.17) * 43758.5453);
    const corrProm = smoothstep(0.32, 0.88, secHash);
    if (corrProm < 0.18) continue; // minor country roads skip high-density urban fingers

    const rStart = coreSpan * 0.92;
    const rEnd = Math.min(
      suburbSpan * 0.52,
      coreSpan * (1.85 + 2.15 * corrProm) * Math.min(1.4, 0.78 + reach * 0.35)
    );
    if (rEnd <= rStart + 140) continue;

    const stepR = 66;
    let nodeIdx = 0;
    for (let r = rStart; r <= rEnd; r += stepR) {
      nodeIdx++;
      const vApprox = r / 380.0;
      const cellV = Math.floor(vApprox);
      const fv = vApprox - cellV;
      // Avoid collector cross-road intersections (fv near 0 or 1)
      if (fv < 0.08 || fv > 0.92) continue;

      const p0 = roadWebToWorld(kArt, 0.0, cellV, fv, terrainSeedX, terrainSeedZ);
      const p1 = roadWebToWorld(kArt, 0.0, cellV, fv + 0.05, terrainSeedX, terrainSeedZ);
      if (inWater(p0.x, p0.z, 36) || nearBoulevard(p0.x, p0.z, 48)) continue;
      if (terrainSlopeAt(p0.x, p0.z) > 0.20) continue;

      const tx = p1.x - p0.x;
      const tz = p1.z - p0.z;
      const tl = Math.hypot(tx, tz) || 1;
      const ux = tx / tl;
      const uz = tz / tl;
      const nx = -uz;
      const nz = ux;
      const roadRot = Math.atan2(-uz, ux);

      const tAlong = clamp01((r - rStart) / Math.max(180, rEnd - rStart));
      const env = Math.pow(1 - tAlong, 1.35) * (0.55 + 0.45 * corrProm);
      const hField = fbm2D(noise, p0.x / 950 + 3.1, p0.z / 950 - 2.7, 2);

      // Highway corridor streetlamps on both sides of the major arterial
      const roadY = terrainY(p0.x, p0.z);
      pushLamp({ x: p0.x + nx * 13.5, y: roadY + 7.4, z: p0.z + nz * 13.5 });
      pushLamp({ x: p0.x - nx * 13.5, y: roadY + 7.4, z: p0.z - nz * 13.5 });

      for (const side of [-1, 1]) {
        const rand = mulberry32(hash2i(kArt * 197 + nodeIdx * 3 + (side > 0 ? 1 : 0), 463, seed) * 4294967296);
        if (rand() > 0.82 * (1 - tAlong * 0.35)) continue;

        const setback = 36 + rand() * 14;
        const bx = p0.x + nx * side * setback;
        const bz = p0.z + nz * side * setback;
        if (inWater(bx, bz, 32) || terrainSlopeAt(bx, bz) > 0.20) continue;

        const by = terrainY(bx, bz);
        const bRot = roadRot + (side > 0 ? Math.PI : 0);
        const bw = 24 + rand() * 18;
        const bd = 19 + rand() * 13;
        const bh = 16 + (78 * env * (0.55 + 0.65 * hField)) + rand() * 12;

        // Streetfront retail arcade podium + stepped mid/high-rise shaft aligned with the highway!
        push(bx, by + 2.8, bz, bw + 4.0, 5.6, bd + 3.5, rand(), KIND.SLAB, 4, bRot);
        push(bx, by + bh * 0.5, bz, bw, bh, bd, rand(), KIND.WALL, rand() < 0.14 ? 2 : 0, bRot);
        if (bh > 38) {
          const h2 = bh * (0.28 + rand() * 0.18);
          push(bx, by + bh + h2 * 0.5, bz, bw * 0.72, h2, bd * 0.72, rand(), KIND.WALL, 0, bRot);
          push(bx, by + bh + 0.7, bz, bw * 0.92, 1.3, bd * 0.92, rand(), KIND.BAND, 0, bRot);
          if (bh + h2 > 62 && rand() < 0.55) {
            pushBeacon(bx, by + bh + h2 + 2.5, bz, rand());
          }
          if (rand() < 0.22) {
            const [fx, fz] = rotOff(bx, bz, 0, -(bd * 0.5 + 0.9), bRot);
            pushBill({
              x: fx, y: by + Math.min(bh * 0.55, 34), z: fz,
              w: bw * 0.68, h: 9.5, rot: bRot, seed: rand(),
            });
          }
        } else if (rand() < 0.45) {
          const [sx, sz] = rotOff(bx, bz, 0, -(bd * 0.5 + 1.0), bRot);
          pushSign({ x: sx, y: by + 6.4, z: sz, w: 7.5 + rand() * 4.5, h: 2.4, d: 1.0, rot: bRot, seed: rand() });
        }
        corridorTowers++;
      }
    }
  }
  return corridorTowers;
}

/**
 * Road-Aligned Trapezoidal Suburban Sprawl & Strip-Crop Countryside:
 * - Uses the exact same curvilinear `(cellU, cellV)` trapezoid road-web as `GROUND_FRAG`!
 * - Residential trapezoid blocks subdivide into 2–4 parallel internal streets
 *   lined densely on both sides with low-story houses, gardens, trees & corner shops.
 * - Agricultural trapezoid blocks subdivide into parallel strip-crop parcels with
 *   farmsteads strictly aligned to the bounding roads & plow furrows.
 */
function addHorizonSuburbs({
  seed, noise, coreSpan, outSpan, suburbSpan, reach,
  terrainMode, terrainSeedX, terrainSeedZ,
  inWater, terrainY, terrainSlopeAt,
  push, pushBeacon, pushSign, pushLamp, pushTree, suburbPOIs = [],
}) {
  let added = 0;
  const rStart = coreSpan * 1.04 + 65;
  if (suburbSpan <= rStart + 100) return 0;

  const isArid = terrainMode === 1 || terrainMode === 3;
  const vMin = Math.max(1, Math.floor((rStart - 220) / 380.0));
  const vMax = Math.min(32, Math.ceil((suburbSpan * 1.14 + 260) / 380.0));

  let farmCount = 0;

  // 1. Systematically populate every curvilinear road-bounded trapezoid block (cellU = 0..11, cellV = vMin..vMax)
  for (let cellV = vMin; cellV <= vMax; cellV++) {
    for (let cellU = 0; cellU < 12; cellU++) {
      const center = roadWebToWorld(cellU, 0.5, cellV, 0.5, terrainSeedX, terrainSeedZ);
      if (center.r < rStart || center.r > suburbSpan * 1.16) continue;
      if (terrainSlopeAt(center.x, center.z) > 0.24) continue;

      const secHash = fract(Math.sin(cellU * 19.31 + terrainSeedX * 2.17) * 43758.5453);
      const corrProm = smoothstep(0.32, 0.88, secHash);
      // Suburban sprawl stretches far across suburbSpan and reaches even farther along major radial roads!
      const subSpanEff = suburbSpan * (0.86 + 0.28 * corrProm);
      const subBelt = (1.0 - smoothstep(subSpanEff * 0.72, subSpanEff * 1.12, center.r));
      const patch = fbm2D(noise, center.x * 0.00085 - 4.2, center.z * 0.00085 + 8.7, 2);
      const subPatch = smoothstep(0.24, 0.52, patch + corrProm * 0.24);
      const subZone = clamp01(subBelt * (0.48 + 0.52 * subPatch));

      const blockH = fract(Math.sin(cellU * 12.9898 + cellV * 78.233 + terrainSeedX * 3.1) * 43758.5453);
      const blockH2 = fract(blockH * 13.71 + cellV * 0.37);
      const rand = mulberry32(hash2i(cellU * 97 + cellV, 541, seed) * 4294967296);

      // Arterial & collector junction streetlamps + neighbourhood corner shops
      const junc = roadWebToWorld(cellU, 0.06, cellV, 0.08, terrainSeedX, terrainSeedZ);
      if (!inWater(junc.x, junc.z, 26) && terrainSlopeAt(junc.x, junc.z) < 0.20) {
        if (center.r < suburbSpan * 0.78 && (cellV + cellU) % 2 === 0) {
          pushLamp({ x: junc.x, y: terrainY(junc.x, junc.z) + 6.5, z: junc.z });
        }
        if (subZone > 0.36 && rand() < 0.34 * subZone) {
          const jNext = roadWebToWorld(cellU, 0.06, cellV, 0.16, terrainSeedX, terrainSeedZ);
          const shopRot = Math.atan2(-(jNext.z - junc.z), jNext.x - junc.x);
          added += addSuburbanShop(push, pushSign, pushLamp, rand, junc.x, terrainY(junc.x, junc.z), junc.z, shopRot);
          if (suburbPOIs.length < 32) {
            suburbPOIs.push({ kind: 'shop', name: 'Corner Shop', x: junc.x, y: terrainY(junc.x, junc.z), z: junc.z, h: 8, r: 20 });
          }
        }
      }

      if (subZone > 0.30) {
        // DENSE ROAD-ALIGNED SUBURBAN TRAPEZOID BLOCK:
        // Matches GROUND_FRAG's exact internal parallel residential streets!
        const nLanes = 2 + Math.floor(blockH2 * 2.0);
        const orientAlongRing = blockH >= 0.42;
        const arcSpanU = (Math.PI * 2 * Math.max(center.r, 220)) / 12.0;
        const tOut = clamp01((center.r - rStart) / Math.max(400, suburbSpan - rStart));
        const fillProb = Math.min(0.88, (0.52 + 0.42 * subZone) * (1.0 - tOut * 0.36) * Math.min(1.18, 0.72 + reach * 0.28));

        for (let lIdx = 1; lIdx <= nLanes - 1; lIdx++) {
          const laneFrac = lIdx / nLanes;
          const lengthM = orientAlongRing ? arcSpanU : 380.0;
          const lotPitch = 40 + (lIdx % 2) * 8 + tOut * 14;
          const nLots = Math.max(3, Math.min(15, Math.floor((lengthM - 48) / lotPitch)));
          let lastSlope = 0;

          for (let s = 0; s < nLots; s++) {
            const alongF = 0.08 + ((s + 0.5) / nLots) * 0.84;
            const fu0 = orientAlongRing ? alongF : laneFrac;
            const fv0 = orientAlongRing ? laneFrac : alongF;
            const fu1 = orientAlongRing ? Math.min(0.98, alongF + 0.03) : laneFrac;
            const fv1 = orientAlongRing ? laneFrac : Math.min(0.98, alongF + 0.03);

            const pSt0 = roadWebToWorld(cellU, fu0, cellV, fv0, terrainSeedX, terrainSeedZ);
            // Leave breathing room around the urban highway corridor towers on inner radial edges
            const dArtApprox = Math.min(fu0, 1 - fu0) * arcSpanU;
            if (corrProm >= 0.18 && center.r < coreSpan * (1.55 + 1.65 * corrProm) && dArtApprox < 68) {
              continue;
            }
            if (s % 2 === 0) lastSlope = terrainSlopeAt(pSt0.x, pSt0.z);
            if (lastSlope > 0.22 || inWater(pSt0.x, pSt0.z, 26)) continue;

            const pSt1 = roadWebToWorld(cellU, fu1, cellV, fv1, terrainSeedX, terrainSeedZ);
            const dx = pSt1.x - pSt0.x;
            const dz = pSt1.z - pSt0.z;
            const dl = Math.hypot(dx, dz) || 1;
            const ux = dx / dl;
            const uz = dz / dl;
            const snx = -uz;
            const snz = ux;
            const stRot = Math.atan2(-uz, ux);
            const stY = terrainY(pSt0.x, pSt0.z);

            if (s === Math.floor(nLots * 0.5) && center.r < suburbSpan * 0.68 && lIdx === 1) {
              pushLamp({ x: pSt0.x, y: stY + 5.8, z: pSt0.z });
            }

            // Place low-story suburban houses on BOTH sides of the parallel residential street!
            for (const hSide of [-1, 1]) {
              if (rand() > fillProb) continue;
              const setback = 14.5 + rand() * 4.2;
              const hx = pSt0.x + snx * hSide * setback;
              const hz = pSt0.z + snz * hSide * setback;
              if (inWater(hx, hz, 22)) continue;
              const houseRot = stRot + (hSide > 0 ? Math.PI : 0) + (rand() - 0.5) * 0.04;
              const hy = lastSlope > 0.03 ? terrainY(hx, hz) : stY;
              added += addSuburbanHouse(push, rand, hx, hy, hz, houseRot, 0.94 + rand() * 0.12);
              if ((s + lIdx) % 4 === 0 && hSide === 1 && rand() < 0.42) {
                const tx = hx + snx * hSide * 8.5;
                const tz = hz + snz * hSide * 8.5;
                pushTree({ x: tx, y: hy, z: tz, h: 6.2 + rand() * 5.2, seed: rand(), role: 'suburb' });
              }
            }
          }
        }
      } else if (!isArid || rand() < 0.28) {
        // RURAL TRAPEZOID STRIP-CROP AGRICULTURAL PARCELS:
        // Seat farmsteads inside the road-bounded trapezoid strips, strictly aligned to bounding roads & furrows!
        if (rand() < 0.42 && !inWater(center.x, center.z, 46) && terrainSlopeAt(center.x, center.z) < 0.16) {
          const fuFarm = 0.26 + rand() * 0.48;
          const fvFarm = 0.26 + rand() * 0.48;
          const fp0 = roadWebToWorld(cellU, fuFarm, cellV, fvFarm, terrainSeedX, terrainSeedZ);
          if (!inWater(fp0.x, fp0.z, 44) && terrainSlopeAt(fp0.x, fp0.z) < 0.16) {
            const alongArt = rand() >= 0.48;
            const fp1 = alongArt
              ? roadWebToWorld(cellU, fuFarm, cellV, Math.min(0.95, fvFarm + 0.08), terrainSeedX, terrainSeedZ)
              : roadWebToWorld(cellU, Math.min(0.95, fuFarm + 0.08), cellV, fvFarm, terrainSeedX, terrainSeedZ);
            const fieldRot = Math.atan2(-(fp1.z - fp0.z), fp1.x - fp0.x);
            added += addFarmstead(push, pushTree, rand, fp0.x, fp0.z, fieldRot, terrainY);
            farmCount++;
            if (suburbPOIs.length < 40) {
              suburbPOIs.push({
                kind: 'farm',
                name: `Valley Farm ${farmCount}`,
                x: fp0.x, y: terrainY(fp0.x, fp0.z), z: fp0.z, h: 18, r: 38,
              });
            }
          }
        }
      }
    }
  }

  // Guarantee at least 3 farmsteads even on ultra-lush / compact reach worlds
  if (farmCount < 3) {
    for (let f = 0; f < 16 && farmCount < 3; f++) {
      const cellU = (f * 5 + 2) % 12;
      const cellV = Math.max(vMin + 2, Math.min(vMax, vMin + 4 + (f % 5)));
      const fp0 = roadWebToWorld(cellU, 0.5, cellV, 0.5, terrainSeedX, terrainSeedZ);
      if (inWater(fp0.x, fp0.z, 44) || terrainSlopeAt(fp0.x, fp0.z) > 0.18) continue;
      const fp1 = roadWebToWorld(cellU, 0.58, cellV, 0.5, terrainSeedX, terrainSeedZ);
      const fieldRot = Math.atan2(-(fp1.z - fp0.z), fp1.x - fp0.x);
      const rand = mulberry32(hash2i(f, 709, seed) * 4294967296);
      added += addFarmstead(push, pushTree, rand, fp0.x, fp0.z, fieldRot, terrainY);
      farmCount++;
      suburbPOIs.push({
        kind: 'farm',
        name: `Valley Farm ${farmCount}`,
        x: fp0.x, y: terrainY(fp0.x, fp0.z), z: fp0.z, h: 18, r: 38,
      });
    }
  }

  // 2. Regional Power Stations + High-Voltage Transmission Pylon Lines (3–5 dry-land complexes)
  const powerCount = Math.max(3, Math.round(3 + reach));
  for (let p = 0; p < powerCount; p++) {
    const rand = mulberry32(hash2i(p, 653, seed) * 4294967296);
    for (let attempt = 0; attempt < 24; attempt++) {
      const cellU = (p * 3 + attempt) % 12;
      const cellV = Math.max(vMin + 1, Math.min(vMax - 1, vMin + 2 + ((p * 2 + attempt) % Math.max(2, vMax - vMin - 2))));
      const pt = roadWebToWorld(cellU, 0.52, cellV, 0.52, terrainSeedX, terrainSeedZ);
      if (inWater(pt.x, pt.z, 58) || terrainSlopeAt(pt.x, pt.z) > 0.16) continue;
      const ptNext = roadWebToWorld(cellU, 0.60, cellV, 0.52, terrainSeedX, terrainSeedZ);
      const rot = Math.atan2(-(ptNext.z - pt.z), ptNext.x - pt.x);
      added += addPowerStation(push, pushBeacon, pushLamp, rand, pt.x, pt.z, rot, terrainY, inWater, terrainSlopeAt);
      suburbPOIs.push({
        kind: 'power',
        name: `Sector ${p + 1} Power Station`,
        x: pt.x, y: terrainY(pt.x, pt.z), z: pt.z, h: 38, r: 52,
      });
      break;
    }
  }

  return added;
}

/**
 * Spatial hash collider over rotated building boxes, landmarks, major venues,
 * and 3D procedural outer terrain (mountains, desert mesas/dunes, hills).
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

  const coreSpan = (city.radius || 5) * CELL;
  const suburbSpan = city.suburbSpan || Math.max(4500, coreSpan * 4.4 + 1900);
  const hasTerrain = Number.isFinite(city.terrainMode) && city.terrainMode !== 4 && (city.terrainScale ?? 1) > 0.001;
  const wMode = city.waterMode ?? 0;
  const wAmt = city.waterAmount ?? 1;
  const sDist = city.shoreDist ?? 1;
  const tMode = city.terrainMode ?? 0;
  const tScale = city.terrainScale ?? 1;
  const cAng = city.coastAngle ?? 0.7;
  const tsx = city.terrainSeedX ?? 0;
  const tsz = city.terrainSeedZ ?? 0;

  function groundHeightAt(px, pz) {
    if (!hasTerrain && wMode !== 2) return 0;
    return Math.max(
      0,
      evalTerrainHeight(px, pz, coreSpan, suburbSpan, tMode, tScale, cAng, wMode, tsx, tsz, sDist, wAmt)
    );
  }

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
    let maxTop = groundHeightAt(px, pz);
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
    const gY = groundHeightAt(px, pz);
    if (py < gY + Math.max(2, pad * 0.35)) return true;
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
    const minGround = groundHeightAt(pos.x, pos.z) + Math.max(6, radius * 0.75);
    if (pos.y < minGround) {
      pos.y = minGround;
      hit = true;
    }
    for (let iter = 0; iter < 12; iter++) {
      let iterHit = false;
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
            iterHit = true;
            const penX = ex - Math.abs(lx);
            const penZ = ez - Math.abs(lz);
            const penTop = top + radius - pos.y;
            if (penTop < Math.min(penX, penZ) && penTop < radius * 1.15) {
              pos.y = top + radius + 0.25;
            } else {
              // If horizontal push ping-pongs across a narrow gap (< 2*radius) on iter >= 5,
              // try the orthogonal horizontal axis (open street/avenue) instead of rooftop teleporting!
              const preferX = (iter >= 5 && (iter & 1) === 1) ? (penX >= penZ) : (penX < penZ);
              if (preferX) {
                lx = (lx >= 0 ? 1 : -1) * (ex + 0.08);
                pos.x = b.cx + lx * b.cos + lz * b.sin;
                pos.z = b.cz - lx * b.sin + lz * b.cos;
              } else {
                lz = (lz >= 0 ? 1 : -1) * (ez + 0.08);
                pos.x = b.cx + lx * b.cos + lz * b.sin;
                pos.z = b.cz - lx * b.sin + lz * b.cos;
              }
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
          iterHit = true;
          const penTop = top + radius - pos.y;
          if (penTop < minR - dist && penTop < radius * 1.15) {
            pos.y = top + radius;
          } else if (dist > 1e-4) {
            pos.x = o.cx + (dx / dist) * minR;
            pos.z = o.cz + (dz / dist) * minR;
          } else {
            pos.x = o.cx + minR;
          }
        }
      }
      if (!iterHit) break;
    }
    const postGround = groundHeightAt(pos.x, pos.z) + Math.max(6, radius * 0.75);
    if (pos.y < postGround) {
      pos.y = postGround;
      hit = true;
    }
    return hit;
  }

  /**
   * Smooth 3D magnetic repulsion field around buildings, landmarks, and terrain.
   * Opposing facades across an avenue cancel cleanly on the canyon midline, steering
   * the camera between buildings with generous clearance before physical contact.
   */
  function magneticFieldAt(px, py, pz, range = 48, heightScale = 1, out = null) {
    const res = out || { fx: 0, fy: 0, fz: 0, minDist: range };
    res.fx = 0;
    res.fy = 0;
    res.fz = 0;
    res.minDist = range;
    const R = Math.max(4, range);

    const gY = groundHeightAt(px, pz);
    const gClear = py - gY;
    const gRange = Math.min(28, R * 0.65);
    if (gClear < gRange) {
      const gu = Math.max(0, gClear) / Math.max(1, gRange);
      const gw = (1 - gu) * (1 - gu) / (0.22 + gu * 0.78);
      res.fy += gw * 1.15;
      if (gClear < res.minDist) res.minDist = Math.max(0, gClear);
    }

    stamp = (stamp + 1) | 0 || 1;
    const x0 = Math.floor((px - R) / B);
    const x1 = Math.floor((px + R) / B);
    const z0 = Math.floor((pz - R) / B);
    const z1 = Math.floor((pz + R) / B);
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
          const roofOver = py - top;
          if (roofOver > 16 || py < bot - 8) continue;

          const dx = px - b.cx;
          const dz = pz - b.cz;
          if (Math.abs(dx) > b.rad + R || Math.abs(dz) > b.rad + R) continue;
          const lx = dx * b.cos - dz * b.sin;
          const lz = dx * b.sin + dz * b.cos;
          const sdx = Math.abs(lx) - b.hw;
          const sdz = Math.abs(lz) - b.hd;
          const ox = Math.max(0, sdx);
          const oz = Math.max(0, sdz);
          const horizD = Math.hypot(ox, oz);
          const vAbove = Math.max(0, roofOver);
          const d = Math.hypot(horizD, vAbove);
          if (d >= R) continue;
          if (d < res.minDist) res.minDist = d;

          // Smooth vertical taper near roof crest so repulsion lifts & fades seamlessly above roofs
          const vGate = roofOver <= 0 ? 1.0 : Math.max(0, 1 - roofOver / 16);
          const u = d / R;
          const strength = ((1 - u) * (1 - u) / (0.16 + u * 0.84)) * vGate;

          let nlx = 0;
          let nlz = 0;
          if (horizD > 1e-4) {
            nlx = (lx >= 0 ? 1 : -1) * (ox / horizD);
            nlz = (lz >= 0 ? 1 : -1) * (oz / horizD);
          } else {
            // Inside XZ footprint: push outward through nearest facade wall
            if (sdx > sdz) nlx = lx >= 0 ? 1 : -1;
            else nlz = lz >= 0 ? 1 : -1;
          }
          const nwx = nlx * b.cos + nlz * b.sin;
          const nwz = -nlx * b.sin + nlz * b.cos;
          res.fx += nwx * strength;
          res.fz += nwz * strength;

          if (py > top - 22 && top < 140) {
            const roofProx = Math.max(0, 1 - Math.abs(py - top) / 22);
            res.fy += strength * roofProx * 0.65;
          }
        }
      }
    }

    for (let i = 0; i < discs.length; i++) {
      const o = discs[i];
      const top = o.top * heightScale;
      const roofOver = py - top;
      if (roofOver > 16) continue;
      if (o.arch && py < top * 0.62 && Math.hypot(px - o.cx, pz - o.cz) < o.r * 0.52) continue;
      const dx = px - o.cx;
      const dz = pz - o.cz;
      const centerD = Math.hypot(dx, dz);
      const horizD = Math.max(0, centerD - o.r);
      const d = Math.hypot(horizD, Math.max(0, roofOver));
      if (d >= R) continue;
      if (d < res.minDist) res.minDist = d;
      const vGate = roofOver <= 0 ? 1.0 : Math.max(0, 1 - roofOver / 16);
      const u = d / R;
      const strength = ((1 - u) * (1 - u) / (0.16 + u * 0.84)) * vGate;
      const inv = centerD > 1e-4 ? (1 / centerD) : 0;
      res.fx += (inv > 0 ? dx * inv : 1) * strength;
      res.fz += (inv > 0 ? dz * inv : 0) * strength;
    }

    return res;
  }

  /**
   * Finds the nearest adjacent building facade at altitude `py` within `maxDist`
   * so elevated transit viaducts can anchor cantilevered sky-brackets into real towers.
   */
  function findNearestBuildingAnchor(px, py, pz, maxDist = 42, heightScale = 1) {
    stamp = (stamp + 1) | 0 || 1;
    let best = null;
    let bestD = maxDist;
    const x0 = Math.floor((px - maxDist) / B);
    const x1 = Math.floor((px + maxDist) / B);
    const z0 = Math.floor((pz - maxDist) / B);
    const z1 = Math.floor((pz + maxDist) / B);
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
          if (top < py + 1.5 || bot > py - 2.0) continue;
          if (Math.min(b.hw, b.hd) < 5.5) continue;
          const dx = px - b.cx;
          const dz = pz - b.cz;
          const lx = dx * b.cos - dz * b.sin;
          const lz = dx * b.sin + dz * b.cos;
          const clx = Math.max(-b.hw, Math.min(b.hw, lx));
          const clz = Math.max(-b.hd, Math.min(b.hd, lz));
          const d = Math.hypot(lx - clx, lz - clz);
          if (d >= 3.5 && d < bestD) {
            bestD = d;
            best = {
              wx: b.cx + clx * b.cos + clz * b.sin,
              wz: b.cz - clx * b.sin + clz * b.cos,
              dist: d,
              top,
            };
          }
        }
      }
    }
    return best;
  }

  return { groundHeightAt, maxHeightNear, hitsPoint, resolveSphere, magneticFieldAt, findNearestBuildingAnchor };
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

  // Restrained holographic accent on ~55% of media towers (varied 3D Archimedean/abstract & single-plane cones!)
  if (rand() < 0.58) {
    const onRoof = rand() < 0.55;
    const hSeed = rand();
    const mtKinds = ['panel', 'disc', 'cuboctahedron', 'truncated_octahedron', 'rhombicuboctahedron', 'trefoil_knot', 'astrolabe'];
    const mtKind = mtKinds[Math.floor(((hSeed * 19.37) % 1) * mtKinds.length) % mtKinds.length];
    const scMul = 0.38 + ((hSeed * 31.7) % 1) * 0.76;
    pushHolo({
      x: cx,
      y: onRoof ? H + 18 + scMul * 18 : H * (0.55 + ((hSeed * 7.3) % 1) * 0.2),
      baseY: onRoof ? H : 14,
      z: cz,
      w: Math.max(38, Math.max(w, dp) * (onRoof ? 0.96 : 1.16)),
      h: onRoof ? 28 + ((hSeed * 11.1) % 1) * 12 : 30 + ((hSeed * 13.7) % 1) * 14,
      scaleMul: scMul,
      rot: rot + (onRoof ? Math.PI * 0.25 : 0),
      seed: hSeed,
      kind: mtKind,
      shape: mtKind,
    });
  }
  pushBeacon(cx, H + 6, cz, rand());
  return { x: cx, z: cz, w, d: dp, h: H };
}

/* =====================================================================
 * Phase 12 Macro-Infrastructure:
 *   1. Multi-Line Cross-City Public Transit Network + Elevated Stations
 *   2. River Bridges (Cable-Stayed, Tied-Arch & Suspension)
 *   3. Deepwater Harbor, Piers, Cranes, Cruise Liners & Container Ships
 *   4. Air / Orbital Spaceport Megacomplex
 * ===================================================================== */

function makeRoundedPolySegments(nodes, cr = 28) {
  const N = nodes.length;
  const trimIn = new Array(N);
  const trimOut = new Array(N);
  for (let i = 0; i < N; i++) {
    const prev = nodes[(i - 1 + N) % N];
    const cur = nodes[i];
    const next = nodes[(i + 1) % N];
    const dxIn = cur.x - prev.x, dzIn = cur.z - prev.z;
    const dxOut = next.x - cur.x, dzOut = next.z - cur.z;
    const lenIn = Math.hypot(dxIn, dzIn) || 1;
    const lenOut = Math.hypot(dxOut, dzOut) || 1;
    const r = Math.min(cr, lenIn * 0.34, lenOut * 0.34);
    const yCur = cur.yOff || 0;
    const yPrev = prev.yOff || 0;
    const yNext = next.yOff || 0;
    trimIn[i] = {
      x: cur.x - (dxIn / lenIn) * r,
      z: cur.z - (dzIn / lenIn) * r,
      yOff: yCur + (yPrev - yCur) * (r / lenIn),
    };
    trimOut[i] = {
      x: cur.x + (dxOut / lenOut) * r,
      z: cur.z + (dzOut / lenOut) * r,
      yOff: yCur + (yNext - yCur) * (r / lenOut),
    };
  }
  const segs = [];
  for (let i = 0; i < N; i++) {
    const next = (i + 1) % N;
    const a = trimOut[i];
    const b = trimIn[next];
    const corner = nodes[next];
    const cOut = trimOut[next];
    segs.push({
      x1: a.x, z1: a.z,
      cx: (a.x + b.x) * 0.5, cz: (a.z + b.z) * 0.5,
      x2: b.x, z2: b.z,
      yOff1: a.yOff, yOff2: b.yOff,
      straight: true,
      rot: Math.atan2(b.x - a.x, b.z - a.z),
    });
    segs.push({
      x1: b.x, z1: b.z,
      cx: corner.x, cz: corner.z,
      x2: cOut.x, z2: cOut.z,
      yOff1: b.yOff, yOff2: cOut.yOff,
      straight: false,
      rot: Math.atan2(cOut.x - b.x, cOut.z - b.z),
    });
  }
  return segs;
}

function makeTransitNetwork(seed, radius, collider, inWater, transitAmt = 1.0, coastCfg = null) {
  if (transitAmt <= 0.01) {
    return { active: false, amt: 0, lines: [], stations: [] };
  }
  const innerG = radius >= 4 ? 4 : Math.max(1, Math.min(2, radius));
  const midG = Math.max(2, Math.min(radius, 2));
  const outerG = Math.max(2, Math.min(radius, Math.floor(radius / 2) * 2 || 2));
  const reachG = radius >= 4 ? Math.max(innerG, radius - 1) : Math.max(innerG, radius);
  const maxCoreCoord = radius * CELL;

  const coastDist = (px, pz) => {
    if (!coastCfg) return 9999.0;
    return evalCoastSignedDist(
      px, pz, coastCfg.span, coastCfg.coastAngle, coastCfg.waterMode,
      coastCfg.terrainSeedX, coastCfg.terrainSeedZ, coastCfg.shoreDist, coastCfg.waterAmount
    );
  };
  const stepInlandStreet = (px, pz, ca, sa) => {
    const sx = ca >= 0 ? -CELL : CELL;
    const sz = sa >= 0 ? -CELL : CELL;
    const dX = coastDist(px + sx, pz);
    const dZ = coastDist(px, pz + sz);
    const dXZ = coastDist(px + sx, pz + sz);
    if (dX >= dZ && dX >= dXZ - 6) return [px + sx, pz];
    if (dZ >= dX && dZ >= dXZ - 6) return [px, pz + sz];
    return [px + sx, pz + sz];
  };
  const retractNodeDry = (pt) => {
    let x = Math.round(pt.x / CELL) * CELL;
    let z = Math.round(pt.z / CELL) * CELL;
    const yOff = pt.yOff || 0;
    if (!coastCfg) return { x, z, yOff };
    const ca = Math.cos(coastCfg.coastAngle || 0.7);
    const sa = Math.sin(coastCfg.coastAngle || 0.7);
    let guard = 0;
    while (coastDist(x, z) < 38.0 && guard++ < 20) {
      [x, z] = stepInlandStreet(x, z, ca, sa);
    }
    return { x, z, yOff };
  };
  const ensureLoopDry = (rawNodes) => {
    let nodes = rawNodes.map(retractNodeDry);
    if (!coastCfg) return nodes;
    const ca = Math.cos(coastCfg.coastAngle || 0.7);
    const sa = Math.sin(coastCfg.coastAngle || 0.7);
    for (let pass = 0; pass < 14; pass++) {
      let wet = false;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i], b = nodes[(i + 1) % nodes.length];
        for (const f of [0.0, 0.25, 0.5, 0.75, 1.0]) {
          if (coastDist(a.x + (b.x - a.x) * f, a.z + (b.z - a.z) * f) < 24.0) {
            wet = true;
            break;
          }
        }
        if (wet) break;
      }
      if (!wet) break;
      const sx = Math.abs(ca) >= Math.abs(sa) ? (ca >= 0 ? -CELL : CELL) : 0;
      const sz = sx === 0 ? (sa >= 0 ? -CELL : CELL) : (Math.abs(sa) > 0.38 ? (sa >= 0 ? -CELL : CELL) : 0);
      nodes = nodes.map((nd) => ({ x: nd.x + sx, z: nd.z + sz, yOff: nd.yOff }));
    }
    // Remove consecutive duplicate nodes after grid snapping while keeping >= 4 nodes
    const dedup = [];
    for (let i = 0; i < nodes.length; i++) {
      const prev = dedup[dedup.length - 1];
      if (!prev || Math.hypot(nodes[i].x - prev.x, nodes[i].z - prev.z) > 12) {
        dedup.push(nodes[i]);
      }
    }
    if (dedup.length >= 4 && Math.hypot(dedup[0].x - dedup[dedup.length - 1].x, dedup[0].z - dedup[dedup.length - 1].z) <= 12) {
      dedup.pop();
    }
    return dedup.length >= 4 ? dedup : nodes;
  };

  // 3 architecturally distinct, multi-waypoint scenic transit trajectories:
  //   0: Grand Serpentine S-Wave Express (10-node S-curve weaving West -> Center -> East Midtown with undulating elevation!)
  //   1: Waterfront & Park Stepped Crescent (8-node stepped promenade loop curving around Central & Park districts)
  //   2: Skyline Pinwheel Cross-Shuttle (12-node high-altitude pinwheel loop threading through skyscraper canyons)
  // Every leg aligns with street/avenue grid canyons (k * CELL) with wide Bézier corner arcs so trains NEVER clip blocks!
  const gA = Math.min(innerG, reachG);
  const gB = Math.max(1, Math.min(2, reachG));
  const routeDefs = [
    {
      name: 'Grand Serpentine S-Wave Express',
      color: '#53d9ff',
      baseY: 23.5,
      speed: 96,
      cr: 24,
      nodes: [
        { x: -gA * CELL, z: -reachG * CELL, yOff: 0 },
        { x: 0,          z: -reachG * CELL, yOff: 4.0 },
        { x: 0,          z: -gB * CELL,     yOff: 8.5 },
        { x: gA * CELL,  z: -gB * CELL,     yOff: 11.5 },
        { x: gA * CELL,  z: reachG * CELL,  yOff: 5.0 },
        { x: 0,          z: reachG * CELL,  yOff: 0 },
        { x: 0,          z: gB * CELL,      yOff: 7.5 },
        { x: -gA * CELL, z: gB * CELL,      yOff: 4.5 },
      ],
    },
    {
      name: 'Scenic Promenade & Park Crescent',
      color: '#ff9e4a',
      baseY: 31.5,
      speed: 104,
      cr: 26,
      nodes: [
        { x: -reachG * CELL, z: -gB * CELL,  yOff: 0 },
        { x: -gB * CELL,     z: -gB * CELL,  yOff: 5.5 },
        { x: -gB * CELL,     z: -gA * CELL,  yOff: 8.5 },
        { x: gB * CELL,      z: -gA * CELL,  yOff: 8.5 },
        { x: gB * CELL,      z: 0,           yOff: 5.0 },
        { x: reachG * CELL,  z: 0,           yOff: 2.0 },
        { x: reachG * CELL,  z: gA * CELL,   yOff: 0 },
        { x: -reachG * CELL, z: gA * CELL,   yOff: 6.5 },
      ],
    },
    {
      name: 'Skyline Pinwheel Sky-Shuttle',
      color: '#ff5c93',
      baseY: 42.5,
      speed: 110,
      cr: 24,
      nodes: [
        { x: -outerG * CELL, z: -outerG * CELL, yOff: 0 },
        { x: 0,              z: -outerG * CELL, yOff: 6.0 },
        { x: 0,              z: -gB * CELL,     yOff: 10.5 },
        { x: outerG * CELL,  z: -gB * CELL,     yOff: 8.0 },
        { x: outerG * CELL,  z: outerG * CELL,  yOff: 2.0 },
        { x: 0,              z: outerG * CELL,  yOff: 6.5 },
        { x: 0,              z: gB * CELL,      yOff: 10.5 },
        { x: -outerG * CELL, z: gB * CELL,      yOff: 5.0 },
      ],
    },
  ];

  const isLoopClearAtY = (segs, yBase) => {
    if (!collider) return true;
    for (let s = 0; s < segs.length; s++) {
      const sg = segs[s];
      for (let k = 0; k <= 16; k++) {
        const t = k / 16;
        const om = 1 - t;
        const px = om * om * sg.x1 + 2 * om * t * sg.cx + t * t * sg.x2;
        const pz = om * om * sg.z1 + 2 * om * t * sg.cz + t * t * sg.z2;
        const py = yBase + (sg.yOff1 || 0) * om + (sg.yOff2 || 0) * t;
        if (collider.hitsPoint(px, py, pz, 6.2)) return false;
        if (collider.hitsPoint(px, py + 2.2, pz, 5.8)) return false;
      }
    }
    return true;
  };

  const lines = [];
  const stations = [];
  const stNames = [
    'Central Grand Hub', 'North Gate Station', 'South Terminal', 'Harbor Crossing',
    'West End Concourse', 'Civic Exchange', 'Conservatory Stop', 'Midtown Viaduct',
    'East Quay Station', 'Quadrangle North', 'Quadrangle South', 'Science Park Stop',
  ];
  let stCounter = 0;

  for (let lIdx = 0; lIdx < routeDefs.length; lIdx++) {
    const sp = routeDefs[lIdx];
    const clampCoreNodes = (nds) => nds.map((nd) => ({
      x: Math.max(-maxCoreCoord, Math.min(maxCoreCoord, nd.x)),
      z: Math.max(-maxCoreCoord, Math.min(maxCoreCoord, nd.z)),
      yOff: nd.yOff,
    }));
    let dryNodes = ensureLoopDry(clampCoreNodes(sp.nodes));
    const useCr = Math.min(16, sp.cr || 16);
    let rawSegs = makeRoundedPolySegments(dryNodes, useCr);
    let yRail = sp.baseY;
    let foundClear = false;
    const gridShifts = [[0, 0], [CELL, 0], [-CELL, 0], [0, CELL], [0, -CELL]];
    for (let gIdx = 0; gIdx < gridShifts.length && !foundClear; gIdx++) {
      const [gx, gz] = gridShifts[gIdx];
      const candNodes = gIdx === 0
        ? dryNodes
        : ensureLoopDry(clampCoreNodes(sp.nodes.map((nd) => ({ x: nd.x + gx, z: nd.z + gz, yOff: nd.yOff }))));
      const candSegs = gIdx === 0 ? rawSegs : makeRoundedPolySegments(candNodes, useCr);
      for (let tryStep = 0; tryStep < 10; tryStep++) {
        const yTry = sp.baseY + tryStep * 5.5;
        if (isLoopClearAtY(candSegs, yTry)) {
          dryNodes = candNodes;
          rawSegs = candSegs;
          yRail = yTry;
          foundClear = true;
          break;
        }
      }
    }
    if (!foundClear) {
      yRail = sp.baseY + 18.0;
    }

    const segs = rawSegs.map((sg) => ({
      ...sg,
      y1: yRail + (sg.yOff1 || 0),
      y2: yRail + (sg.yOff2 || 0),
    }));

    // Continuous C0/C1 obstacle-clearance pass: if any skybridge, rotated tower, or monument
    // intrudes into a segment, lift its shared junction elevations smoothly above the obstacle!
    if (collider && segs.length > 0) {
      const nS = segs.length;
      const juncY = segs.map((sg) => sg.y1);
      for (let pass = 0; pass < 3; pass++) {
        for (let s = 0; s < nS; s++) {
          const sg = segs[s];
          const nextS = (s + 1) % nS;
          let reqY = 0;
          for (let k = 0; k <= 12; k++) {
            const t = k / 12;
            const om = 1 - t;
            const px = om * om * sg.x1 + 2 * om * t * sg.cx + t * t * sg.x2;
            const pz = om * om * sg.z1 + 2 * om * t * sg.cz + t * t * sg.z2;
            const py = juncY[s] * om + juncY[nextS] * t;
            if (collider.hitsPoint(px, py, pz, 4.8) || collider.hitsPoint(px, py + 2.2, pz, 4.8)) {
              const top = collider.maxHeightNear(px, pz, 5.5) + 6.5;
              if (top > reqY) reqY = top;
            }
          }
          if (reqY > juncY[s]) juncY[s] = reqY;
          if (reqY > juncY[nextS]) juncY[nextS] = reqY;
        }
      }
      for (let s = 0; s < nS; s++) {
        segs[s].y1 = juncY[s];
        segs[s].y2 = juncY[(s + 1) % nS];
      }
    }

    // Structural supports: attach sky-brackets directly to adjacent skyscrapers or plant grounded struts on dry land
    const supports = [];
    for (let s = 0; s < segs.length; s++) {
      const sg = segs[s];
      const segLen = Math.hypot(sg.x2 - sg.x1, sg.z2 - sg.z1);
      const count = sg.straight ? Math.max(1, Math.floor(segLen / 84)) : (segLen > 42 ? 1 : 0);
      for (let k = 0; k < count; k++) {
        const t = (k + 0.5) / count;
        const om = 1 - t;
        const px = om * om * sg.x1 + 2 * om * t * sg.cx + t * t * sg.x2;
        const pz = om * om * sg.z1 + 2 * om * t * sg.cz + t * t * sg.z2;
        const py = sg.y1 + (sg.y2 - sg.y1) * (t * t * (3 - 2 * t));
        const dx = 2 * om * (sg.cx - sg.x1) + 2 * t * (sg.x2 - sg.cx);
        const dz = 2 * om * (sg.cz - sg.z1) + 2 * t * (sg.z2 - sg.cz);
        const rot = Math.atan2(dx, dz);
        const anchor = collider && collider.findNearestBuildingAnchor
          ? collider.findNearestBuildingAnchor(px, py, pz, 40)
          : null;
        if (anchor && anchor.dist <= 38) {
          supports.push({
            kind: 'bracket',
            x: px,
            y: py,
            z: pz,
            bx: anchor.wx,
            bz: anchor.wz,
            ax: anchor.wx,
            az: anchor.wz,
            rot,
          });
        } else if (!(inWater && inWater(px, pz, 5.5))) {
          const gY = (collider && collider.groundHeightAt) ? collider.groundHeightAt(px, pz) : 0;
          if (py - gY >= 4 && py - gY <= 96) {
            supports.push({
              kind: 'strut',
              x: px,
              y: py,
              z: pz,
              groundY: gY,
              rot,
            });
          }
        }
      }
    }

    lines.push({
      id: lIdx,
      name: sp.name,
      color: sp.color,
      y: yRail,
      speed: sp.speed,
      segments: segs,
      supports,
    });

    // Place elevated transit stations along dry straight avenue legs (sampling 1/4, 1/2, 3/4 span for clear pockets)
    for (let s = 0; s < segs.length; s += 2) {
      const sg = segs[s];
      const len = Math.hypot(sg.x2 - sg.x1, sg.z2 - sg.z1);
      if (len < 180) continue;
      for (const frac of [0.5, 0.28, 0.72]) {
        const sx = sg.x1 + (sg.x2 - sg.x1) * frac;
        const sz = sg.z1 + (sg.z2 - sg.z1) * frac;
        const hf = frac * frac * (3 - 2 * frac);
        const sy = (sg.y1 ?? yRail) + ((sg.y2 ?? yRail) - (sg.y1 ?? yRail)) * hf;
        if (inWater && inWater(sx, sz, 22)) continue;
        if (collider && collider.hitsPoint(sx, sy + 2.5, sz, 8.5)) continue;
        if (stations.some((st) => Math.hypot(st.x - sx, st.z - sz) < 95 && Math.abs(st.y - sy) < 14)) continue;
        stations.push({
          name: stNames[stCounter % stNames.length],
          x: sx,
          y: sy,
          z: sz,
          rot: Math.atan2(sg.x2 - sg.x1, sg.z2 - sg.z1),
          len: 46,
          lineId: lIdx,
          color: sp.color,
        });
        stCounter++;
        break;
      }
    }
  }

  return { active: true, amt: transitAmt, lines, stations };
}

function makeBridges(seed, water, terrainY) {
  const bridges = [];
  const rivers = (water || []).filter((w) => w.kind === 'river' && Array.isArray(w.centerline) && w.centerline.length >= 10);
  if (!rivers.length) return bridges;

  const bridgeNames = ['Grand Estuary Bridge', 'Meridian Cable Bridge', 'Iron Arch Crossing', 'Valley Viaduct'];
  const kinds = ['cable-stayed', 'tied-arch', 'suspension', 'cable-stayed'];

  for (let rIdx = 0; rIdx < rivers.length; rIdx++) {
    const cl = rivers[rIdx].centerline;
    const slots = [3, 9, 16, 23];
    for (let k = 0; k < slots.length; k++) {
      const idx = Math.min(cl.length - 3, slots[k]);
      const p = cl[idx];
      if (!p) continue;
      // Span cleanly from dry bank to dry bank (+32m abutment margin on each side)
      const clearHalf = p.halfW + 34;
      const x1 = p.x + p.nx * clearHalf;
      const z1 = p.z + p.nz * clearHalf;
      const x2 = p.x - p.nx * clearHalf;
      const z2 = p.z - p.nz * clearHalf;
      const bankY = Math.max(terrainY ? terrainY(x1, z1) : 0, terrainY ? terrainY(x2, z2) : 0);
      const yDeck = Math.max(17.5, bankY + 13.5 + (k === 0 ? 4.5 : 0));
      const span = clearHalf * 2;
      const kind = kinds[k % kinds.length];
      const towerH = yDeck + (kind === 'tied-arch' ? 32 : 48 + (k === 0 ? 14 : 0));
      bridges.push({
        name: bridgeNames[(rIdx * 4 + k) % bridgeNames.length],
        kind,
        cx: p.x,
        cz: p.z,
        x1, z1, x2, z2,
        rot: Math.atan2(x2 - x1, z2 - z1),
        span,
        deckW: k === 0 ? 24 : 18,
        yDeck,
        bankY,
        towerH,
        seed: hash2i(rIdx * 11 + k, 503, seed),
      });
    }
  }
  return bridges;
}

function makeHarbor(seed, radius, water, waterMode, waterAmount, coastAngle, coastDistAt, inWater, terrainY, maritimeAmt = 1.0) {
  if (waterMode === 4 || waterAmount <= 0.005 || maritimeAmt <= 0.01 || !water.length) return null;
  const coreSpan = radius * CELL;
  let anchorX = 0, anchorZ = 0, outX = Math.cos(coastAngle), outZ = Math.sin(coastAngle);
  let yQuay = 3.2;

  if (waterMode === 1 || waterMode === 2) {
    // Locate exact shoreline right in the sheltered central bay indent (v = 0)
    const ca = Math.cos(coastAngle);
    const sa = Math.sin(coastAngle);
    const vHarbor = (hash2i(3, 521, seed) - 0.5) * 160;
    let uLo = -coreSpan;
    let uHi = coreSpan * 3.2;
    for (let it = 0; it < 20; it++) {
      const uMid = (uLo + uHi) * 0.5;
      const wx = ca * uMid - sa * vHarbor;
      const wz = sa * uMid + ca * vHarbor;
      if (coastDistAt(wx, wz) > 0) uLo = uMid;
      else uHi = uMid;
    }
    anchorX = ca * (uLo - 10) - sa * vHarbor;
    anchorZ = sa * (uLo - 10) + ca * vHarbor;
    outX = ca;
    outZ = sa;
    yQuay = Math.max(3.2, (terrainY ? terrainY(anchorX - outX * 25, anchorZ - outZ * 25) : 0) + 2.8);
  } else if (waterMode === 3) {
    // City-facing shore of the Great Crater Lake
    const lake = water.find((w) => w.kind === 'lake') || water[0];
    const dx = lake.x;
    const dz = lake.z;
    const dl = Math.hypot(dx, dz) || 1;
    outX = dx / dl;
    outZ = dz / dl;
    let dLo = 200;
    let dHi = dl;
    for (let it = 0; it < 20; it++) {
      const dMid = (dLo + dHi) * 0.5;
      if (coastDistAt(outX * dMid, outZ * dMid) > 0) dLo = dMid;
      else dHi = dMid;
    }
    anchorX = outX * (dLo - 8);
    anchorZ = outZ * (dLo - 8);
    yQuay = Math.max(3.2, (terrainY ? terrainY(anchorX - outX * 25, anchorZ - outZ * 25) : 0) + 2.8);
  } else {
    // Inner Harbor Lagoon (waterMode === 0): sit on cityward rim pointing across lagoon!
    const hWater = water.find((w) => w.kind === 'harbor') || water[0];
    const ang = Math.atan2(hWater.z, hWater.x || 1e-3);
    outX = Math.cos(ang);
    outZ = Math.sin(ang);
    anchorX = hWater.x - outX * (hWater.r * 0.68);
    anchorZ = hWater.z - outZ * (hWater.r * 0.68);
    yQuay = 3.2;
  }

  const tanX = -outZ;
  const tanZ = outX;
  const rotOut = Math.atan2(outX, outZ);
  const pierCount = Math.max(3, Math.min(7, Math.round(4 * Math.min(1.8, Math.max(0.5, maritimeAmt)))));
  const quayLen = pierCount * 92 + 110;
  const piers = [];
  const cranes = [];
  const containers = [];
  const boats = [];
  const ships = [];

  for (let p = 0; p < pierCount; p++) {
    const along = (p - (pierCount - 1) * 0.5) * 92;
    const isContainerPier = p % 2 === 0 && p < pierCount - 1;
    const isCruisePier = p === 1 || (pierCount >= 5 && p === 3);
    const len = (isCruisePier ? 225 : isContainerPier ? 205 : 148) * (0.85 + 0.15 * Math.min(1.6, maritimeAmt));
    const wid = isContainerPier ? 26 : (isCruisePier ? 22 : 13);
    const px = anchorX + tanX * along + outX * (len * 0.5);
    const pz = anchorZ + tanZ * along + outZ * (len * 0.5);
    piers.push({ x: px, y: yQuay, z: pz, len, wid, rot: rotOut, kind: isCruisePier ? 'cruise' : (isContainerPier ? 'cargo' : 'marina') });

    if (isContainerPier) {
      const nCranes = Math.max(1, Math.min(4, Math.round(2 * maritimeAmt)));
      for (let c = 0; c < nCranes; c++) {
        const dOut = 48 + c * 52;
        cranes.push({
          x: anchorX + tanX * (along - wid * 0.22) + outX * dOut,
          y: yQuay,
          z: anchorZ + tanZ * (along - wid * 0.22) + outZ * dOut,
          rot: rotOut,
          h: 44 + (c % 2) * 5,
          boom: 48,
        });
      }
      for (let sIdx = 0; sIdx < 8; sIdx++) {
        const dOut = -18 + sIdx * 20;
        containers.push({
          x: anchorX + tanX * (along + (sIdx % 2 === 0 ? 4 : -4)) + outX * dOut,
          y: yQuay,
          z: anchorZ + tanZ * (along + (sIdx % 2 === 0 ? 4 : -4)) + outZ * dOut,
          rot: rotOut,
          tiers: 2 + Math.floor(hash2i(p * 13 + sIdx, 541, seed) * 3),
          seed: hash2i(p * 13 + sIdx, 547, seed),
        });
      }
      ships.push({
        kind: 'container',
        docked: true,
        x: anchorX + tanX * (along - wid * 0.5 - 19) + outX * (len * 0.58),
        y: 0.2,
        z: anchorZ + tanZ * (along - wid * 0.5 - 19) + outZ * (len * 0.58),
        rot: rotOut,
        fwdX: outX,
        fwdZ: outZ,
        len: 178 + hash2i(p, 557, seed) * 36,
        wid: 28,
        seed: hash2i(p, 563, seed),
      });
    } else if (isCruisePier) {
      ships.push({
        kind: 'cruise',
        docked: true,
        x: anchorX + tanX * (along + wid * 0.5 + 18) + outX * (len * 0.60),
        y: 0.2,
        z: anchorZ + tanZ * (along + wid * 0.5 + 18) + outZ * (len * 0.60),
        rot: rotOut,
        fwdX: outX,
        fwdZ: outZ,
        len: 196 + hash2i(p, 569, seed) * 42,
        wid: 27,
        seed: hash2i(p, 571, seed),
      });
    } else {
      // Pleasure marina timber finger-pier slips with moored motor-yachts & sailboats
      const nBoats = Math.max(3, Math.round(7 * maritimeAmt));
      for (let b = 0; b < nBoats; b++) {
        const side = b % 2 === 0 ? 1 : -1;
        const dOut = 24 + Math.floor(b / 2) * 24;
        boats.push({
          x: anchorX + tanX * (along + side * (wid * 0.5 + 7)) + outX * dOut,
          y: 0.35,
          z: anchorZ + tanZ * (along + side * (wid * 0.5 + 7)) + outZ * dOut,
          rot: rotOut + Math.PI * 0.5 * side,
          len: 14 + hash2i(b, 577, seed) * 10,
          seed: hash2i(b, 587, seed),
        });
      }
    }
  }

  // Golden Harbor Crescent Beach & Waterfront Timber Boardwalk flanking the marina side of the port!
  const beachAlong = ((pierCount - 1) * 0.5) * 92 + 155;
  const beach = {
    x: anchorX + tanX * beachAlong + outX * 14,
    y: Math.max(0.18, yQuay * 0.15),
    z: anchorZ + tanZ * beachAlong + outZ * 14,
    len: 230,
    wid: 62,
    rot: rotOut,
    outX, outZ, tanX, tanZ,
  };
  const promenade = {
    x: anchorX - outX * 12,
    y: yQuay,
    z: anchorZ - outZ * 12,
    len: quayLen + 180,
    wid: 18,
    rot: rotOut,
  };

  // Offshore Cruising Fleet (Container Ships & Luxury Cruise Liners steaming across open sea/lake with live Kelvin V-wakes!)
  // Separated into distinct radial shipping lanes (`>= 320m` apart) + staggered orbital phases so moving ships never bunch up!
  if (waterMode === 1 || waterMode === 2 || waterMode === 3) {
    const cruiseFleet = Math.max(2, Math.min(10, Math.round(4 * maritimeAmt)));
    for (let s = 0; s < cruiseFleet; s++) {
      const isCruise = s % 2 === 1;
      const distOut = (waterMode === 3 ? 540 : 660) + s * 330 + hash2i(s, 593, seed) * 75;
      const sweepSpan = waterMode === 3 ? 720 + s * 95 : 1850 + s * 260;
      const evenPhase = (s / Math.max(1, cruiseFleet) + (hash2i(s, 599, seed) - 0.5) * 0.10 + 1.0) % 1.0;
      ships.push({
        kind: isCruise ? 'cruise' : 'container',
        docked: false,
        cx: anchorX + outX * distOut,
        cz: anchorZ + outZ * distOut,
        tanX, tanZ,
        outX, outZ,
        sweepSpan,
        speed: (isCruise ? 22 : 17) * (s % 2 === 0 ? 1 : -1),
        phase: evenPhase,
        y: 0.15,
        len: (isCruise ? 210 : 195) + hash2i(s, 601, seed) * 40,
        wid: isCruise ? 28 : 30,
        seed: hash2i(s, 607, seed),
      });
    }
  }

  return {
    x: anchorX,
    y: yQuay,
    z: anchorZ,
    outX, outZ, tanX, tanZ, rot: rotOut,
    quayLen,
    beach,
    promenade,
    piers,
    cranes,
    containers,
    boats,
    ships,
  };
}

function makeSpaceport(seed, radius, coreSpan, coastAngle, inWater, terrainY, terrainSlopeAt, airAmt = 1.0) {
  if (airAmt <= 0.01) return null;
  const halfLen = 430;
  const halfWid = 225;

  // Search radial candidates (preferring dry inland plateau opposite the ocean!)
  let best = null;
  for (let attempt = 0; attempt < 28; attempt++) {
    const aOff = ((attempt % 2 === 0 ? 1 : -1) * Math.ceil(attempt / 2) * 0.24);
    const ang = coastAngle + Math.PI + aOff;
    const dist = coreSpan * 1.52 + 440 + (attempt % 3) * 180;
    const cx = Math.cos(ang) * dist;
    const cz = Math.sin(ang) * dist;
    const rwyRot = ang + Math.PI * 0.5;
    const cs = Math.cos(rwyRot);
    const sn = Math.sin(rwyRot);

    let dry = !inWater(cx, cz, 65);
    for (let sx = -1; sx <= 1 && dry; sx++) {
      for (let sz = -1; sz <= 1 && dry; sz++) {
        const px = cx + sx * halfLen * cs - sz * halfWid * sn;
        const pz = cz + sx * halfLen * sn + sz * halfWid * cs;
        if (inWater(px, pz, 38)) dry = false;
      }
    }
    if (!dry) continue;
    const slope = terrainSlopeAt ? terrainSlopeAt(cx, cz) : 0;
    if (attempt < 20 && slope > 0.14) continue;
    const baseY = terrainY ? terrainY(cx, cz) : 0;
    best = { cx, cz, baseY, rwyRot, cs, sn };
    break;
  }
  if (!best) return null;

  const { cx, cz, baseY, rwyRot, cs, sn } = best;
  const toWorld = (lx, lz) => ({
    x: cx + lx * cs - lz * sn,
    z: cz + lx * sn + lz * cs,
  });

  const rwyLen = 760;
  const runways = [
    { ...toWorld(0, -68), len: rwyLen, wid: 34, rot: rwyRot },
    { ...toWorld(0, 12), len: rwyLen, wid: 30, rot: rwyRot },
  ];
  const terminal = { ...toWorld(-45, 118), w: 210, d: 48, h: 24, rot: rwyRot };
  const tower = { ...toWorld(105, 126), h: 86, rot: rwyRot };

  // Orbital Launch Complex on the outer blast apron
  const padCount = airAmt >= 0.45 ? 2 : 1;
  const pads = [];
  for (let p = 0; p < padCount; p++) {
    const pt = toWorld(245 - p * 125, 145);
    pads.push({
      x: pt.x,
      y: baseY,
      z: pt.z,
      r: 36,
      gantryH: 108,
      rocketH: 94,
      rot: rwyRot,
      activeLaunch: p === 0,
      seed: hash2i(p, 631, seed),
    });
  }

  // Parked suborbital delta shuttles along terminal gates
  const gateCount = Math.max(2, Math.min(6, Math.round(4 * airAmt)));
  const parked = [];
  for (let g = 0; g < gateCount; g++) {
    const lx = -125 + g * 44;
    const pt = toWorld(lx, 74);
    parked.push({
      x: pt.x,
      y: baseY + 1.8,
      z: pt.z,
      rot: rwyRot + Math.PI * 0.5,
      scale: 0.9 + (g % 2) * 0.2,
      seed: hash2i(g, 641, seed),
    });
  }

  // Active flight operations (runway approach/rollout/climbout shuttles)
  const flightCount = Math.max(1, Math.min(6, Math.round(3 * airAmt)));
  const flights = [];
  for (let f = 0; f < flightCount; f++) {
    const rwyIdx = f % runways.length;
    flights.push({
      rwyIdx,
      phase: f / flightCount + hash2i(f, 647, seed) * 0.15,
      speed: 0.042 + (f % 3) * 0.008,
      scale: 1.05 + (f % 2) * 0.2,
      seed: hash2i(f, 653, seed),
    });
  }

  return {
    x: cx,
    y: baseY,
    z: cz,
    rot: rwyRot,
    cos: cs,
    sin: sn,
    halfLen,
    halfWid,
    runways,
    terminal,
    tower,
    pads,
    parked,
    flights,
    amt: airAmt,
  };
}

/**
 * Street-Level Urban Infrastructure:
 *   - Cantilevered intersection traffic-light signals (NS vs EW green-wave phase)
 *   - Sidewalk utility poles, sagging 3-wire overhead power lines & cross-street canyon cables
 *   - Sidewalk transit shelters, backlit ad totems, street kiosks & public-plaza seating
 */
function makeStreetInfrastructure(seed, radius, boulevards = [], places = [], inWater = null) {
  const signals = [];
  const poles = [];
  const cables = [];
  const furniture = [];
  const isDry = (px, pz, pad = 16) => !(inWater && inWater(px, pz, pad));
  const R = (a, b) => hash2i(a, b, seed ^ 0x47d39b1f);

  const lim = Math.min(radius, 8);
  for (let ix = -lim; ix <= lim; ix++) {
    for (let iz = -lim; iz <= lim; iz++) {
      const gx = ix * CELL;
      const gz = iz * CELL;
      if (!isDry(gx, gz, 38)) continue;
      const aveX = (((ix % 4) + 4) % 4 === 0);
      const aveZ = (((iz % 4) + 4) % 4 === 0);
      const swx = aveX ? AVENUE : STREET;
      const swz = aveZ ? AVENUE : STREET;

      // Place cantilevered traffic signals on all avenue intersections and ~65% of minor intersections
      if (aveX || aveZ || R(ix * 7, iz * 11) < 0.65) {
        const phase = fract((ix * 0.17 + iz * 0.23) + 10.0);
        const cornerX = swx * 0.5 - 2.1;
        const cornerZ = swz * 0.5 - 2.1;
        const pushSig = (s) => { if (isDry(s.x, s.z, 12)) signals.push(s); };
        // NE corner mast-arm overhanging N-S northbound lanes (faces S, axis='ns')
        pushSig({
          x: gx + cornerX, z: gz + cornerZ,
          rot: Math.PI, // arm points -X across northbound lane
          armLen: aveX ? 9.5 : 7.0,
          h: 6.8,
          axis: 'ns',
          phase,
          ix, iz,
        });
        // SW corner mast-arm overhanging N-S southbound lanes
        pushSig({
          x: gx - cornerX, z: gz - cornerZ,
          rot: 0, // arm points +X across southbound lane
          armLen: aveX ? 9.5 : 7.0,
          h: 6.8,
          axis: 'ns',
          phase,
          ix, iz,
        });
        // NW & SE corner mast-arms overhanging E-W cross-traffic lanes (axis='ew')
        pushSig({
          x: gx - cornerX, z: gz + cornerZ,
          rot: -Math.PI * 0.5,
          armLen: aveZ ? 9.5 : 7.0,
          h: 6.6,
          axis: 'ew',
          phase,
          ix, iz,
        });
        pushSig({
          x: gx + cornerX, z: gz - cornerZ,
          rot: Math.PI * 0.5,
          armLen: aveZ ? 9.5 : 7.0,
          h: 6.6,
          axis: 'ew',
          phase,
          ix, iz,
        });
      }

      // Sidewalk transit shelter + backlit ad totem + street kiosk along avenues & busy corners
      if ((aveX || aveZ) && R(ix * 19 + 3, iz * 23 + 5) < 0.58) {
        const side = R(ix, iz + 91) < 0.5 ? 1 : -1;
        const fx = gx + side * (swx * 0.5 - 2.3);
        const fz = gz + side * (swz * 0.5 + 16.0);
        if (isDry(fx, fz, 14)) {
          furniture.push({
            kind: R(ix + 5, iz * 3) < 0.62 ? 'shelter' : 'kiosk',
            x: fx, y: 0, z: fz,
            rot: 0,
            seed: R(ix * 13, iz * 29),
          });
        }
      }
    }
  }

  // Utility poles & sagging catenary 3-wire overhead power lines along non-avenue cross-streets + cross-street canyon cables!
  for (let ix = -lim; ix <= lim; ix++) {
    const aveX = (((ix % 4) + 4) % 4 === 0);
    if (aveX) continue; // grand avenues keep utilities underground; side streets carry atmospheric overhead poles & wires!
    if (R(ix + 41, 17) > 0.68) continue;
    const swx = STREET;
    const poleX = ix * CELL + (ix % 2 === 0 ? 1 : -1) * (swx * 0.5 - 1.7);
    let prevPole = null;
    for (let iz = -lim; iz <= lim; iz++) {
      const swz = ((((iz % 4) + 4) % 4 === 0) ? AVENUE : STREET);
      const pA = { x: poleX, y: 0, z: iz * CELL + swz * 0.5 + 9.0, h: 9.6, rot: 0 };
      const pB = { x: poleX, y: 0, z: (iz + 1) * CELL - swz * 0.5 - 9.0, h: 9.6, rot: 0 };
      for (const pt of [pA, pB]) {
        if (Math.abs(pt.z) > lim * CELL) continue;
        if (!isDry(pt.x, pt.z, 15)) {
          prevPole = null;
          continue;
        }
        poles.push(pt);
        if (prevPole && Math.hypot(pt.x - prevPole.x, pt.z - prevPole.z) < 125) {
          for (const armOff of [-1.35, 0.0, 1.35]) {
            cables.push({
              x1: prevPole.x + armOff, y1: prevPole.h - 0.6, z1: prevPole.z,
              x2: pt.x + armOff, y2: pt.h - 0.6, z2: pt.z,
              sag: 1.35 + Math.abs(armOff) * 0.18,
              kind: 'power',
            });
          }
        }
        prevPole = pt;
      }
      // Occasional cross-street overhead tram/utility catenary cable spanning between building facades!
      if (iz < lim && R(ix * 29, iz * 37) < 0.48) {
        const zMid = (iz + 0.5) * CELL;
        const xSpanL = ix * CELL - (swx * 0.5 + 0.6);
        const xSpanR = ix * CELL + (swx * 0.5 + 0.6);
        if (isDry(ix * CELL, zMid, 15)) {
          const yCab = 9.5 + R(ix + 9, iz + 13) * 4.8;
          cables.push({
            x1: xSpanL, y1: yCab, z1: zMid,
            x2: xSpanR, y2: yCab + (R(ix, iz) - 0.5) * 0.8, z2: zMid + (R(iz, ix) - 0.5) * 6.0,
            sag: 1.15,
            kind: 'cross',
          });
        }
      }
    }
  }

  // Public-space seating clusters, pergolas & illuminated plaza totems around named places
  for (let p = 0; p < places.length; p++) {
    const pl = places[p];
    if (!isDry(pl.x, pl.z, 14)) continue;
    const count = pl.kind === 'park' || pl.kind === 'plaza' ? 6 : 3;
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2 + pl.seed * 3.1;
      const rr = Math.min(34, (pl.r || 32) * 0.52);
      const bx = pl.x + Math.cos(a) * rr;
      const bz = pl.z + Math.sin(a) * rr;
      if (!isDry(bx, bz, 12)) continue;
      furniture.push({
        kind: k % 2 === 0 ? 'bench' : 'totem',
        x: bx, y: 0, z: bz,
        rot: a + Math.PI * 0.5,
        seed: fract(pl.seed + k * 0.23),
      });
    }
  }

  return { signals, poles, cables, furniture };
}



