// Scene construction and look application — no DOM here, so this whole
// layer runs (and is tested) in Node against real three.js.
import * as THREE from '../vendor/three.module.js';
import {
  generateCity, makeCityCollider, CELL, AVENUE, STREET,
  WATER_MODE_NAMES, TERRAIN_MODE_NAMES,
} from './city.js';
import { hash2i } from './prng.js';
import {
  SKY_VERT, SKY_FRAG, CLOUD_VERT, CLOUD_FRAG,
  GROUND_VERT, GROUND_FRAG, TOWER_VERT, TOWER_FRAG,
  LANDMARK_VERT, LANDMARK_FRAG, SOLID_CURVED_VERT, SOLID_CURVED_FRAG,
  VEHICLE_VERT, VEHICLE_FRAG,
  BEACON_VERT, BEACON_FRAG, TRAIL_VERT, TRAIL_FRAG, SWARM_VERT, SWARM_FRAG,
  BEAM_VERT, BEAM_FRAG, POOL_VERT, POOL_FRAG,
  WATER_VERT, WATER_FRAG, TREE_LINK_VERT, TREE_LINK_FRAG,
  BILL_VERT, BILL_FRAG, WEATHER_VERT, WEATHER_FRAG,
  DUST_VERT, DUST_FRAG,
  HOLO_VERT, HOLO_FRAG,
} from './shaders.js';

export { WATER_MODE_NAMES, TERRAIN_MODE_NAMES };

export const col = (hex) => new THREE.Color(hex);

/**
 * Pure-JS mirror of GLSL `bendWorld(vec3 p)`: maps flat city coordinates
 * `(x, y, z)` onto the curved world (0 = flat plane, 1 = full planetoid sphere
 * of radius `planetR` centred at `(0, -planetR, 0)`).
 */
export function bendWorldPoint(x, y, z, curve = 0, planetR = 1800) {
  if (!(curve >= 0.0005)) return { x, y, z };
  const R = planetR / Math.max(curve, 0.0005);
  const r = Math.hypot(x, z);
  const dx = r > 1e-4 ? x / r : 1;
  const dz = r > 1e-4 ? z / r : 0;
  const theta = Math.min(r / R, 3.10);
  const st = Math.sin(theta);
  const ct = Math.cos(theta);
  const rad = R + y;
  return {
    x: dx * st * rad,
    y: -R + ct * rad,
    z: dz * st * rad,
  };
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smoothstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** All style-tweakable uniforms in one place. */
export function makeUniforms() {
  return {
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0.5, 0.6, -0.5) },
    uSkySunCol: { value: col('#ffffff') },
    uSunCol: { value: col('#ffffff') },
    uSunK: { value: 1 },
    uAmb: { value: col('#445566') },
    uAmbG: { value: col('#222222') },
    uBaseA: { value: col('#222222') },
    uBaseB: { value: col('#444444') },
    uPal: { value: [col('#ffffff'), col('#ffffff'), col('#ffffff'), col('#ffffff'), col('#ffffff'), col('#ffffff')] },
    uUsePal: { value: 0 },
    uWinDensity: { value: 0.4 },
    uWinGlow: { value: 1 },
    uWinA: { value: col('#ffb45e') },
    uWinB: { value: col('#53d9ff') },
    uWinC: { value: col('#ff4f8f') },
    uEdge: { value: 0.2 },
    uEdgeCol: { value: col('#ff2d6f') },
    uBandGlow: { value: 1 },
    uToon: { value: 0 },
    uFlat: { value: 0 },
    uFogCol: { value: col('#333344') },
    uSunFogCol: { value: col('#ff9a5c') },
    uFogDensity: { value: 0.0005 },
    uFogHeight: { value: 0.0003 },
    uHazeSun: { value: 0.5 },
    uZen: { value: col('#0d0716') },
    uHor: { value: col('#a8452c') },
    uCloudCol: { value: col('#2c1226') },
    uStars: { value: 0 },
    uStarRot: { value: 0 },
    uCloud: { value: 0.3 },
    uCloudType: { value: 0 },
    uCloudStyle: { value: 0 },
    uSolarDir: { value: new THREE.Vector3(0.5, 0.6, -0.5) },
    uHaze: { value: 0.5 },
    uGStreet: { value: col('#0c0713') },
    uGBlock: { value: col('#170e22') },
    uGLine: { value: col('#ff386e') },
    uGLineGlow: { value: 0.8 },
    uCell: { value: CELL },
    uAve: { value: AVENUE },
    uSt: { value: STREET },
    uCitySpan: { value: CELL * 5 },
    uSuburbSpan: { value: 5200 },
    uGroundRadius: { value: 13500 },
    uWaterMode: { value: 0 },
    uTerrainMode: { value: 0 },
    uTerrainScale: { value: 1 },
    uCoastAngle: { value: 0.7 },
    uTerrainSeed: { value: new THREE.Vector2(0, 0) },
    uWorldCurve: { value: 0 },
    uPlanetR: { value: 2100 },
    uHeightScale: { value: 1 },
    uWetness: { value: 0 },
    uLightK: { value: 1 },
    uDayPhase: { value: 22.2 },
    uBeaconCol: { value: col('#ff3b30') },
    uLampCol: { value: col('#ffd9a0') },
    uSunGlow: { value: 0.65 },
    uSat: { value: 1 },
    uSteady: { value: 0 },
    uBeamCol: { value: col('#bcd9ff') },
    uBeamK: { value: 0.16 },
    uPoolCol: { value: col('#ffc27a') },
    uPoolK: { value: 0.5 },
    uMoonDir: { value: new THREE.Vector3(-0.5, 0.6, 0.5) },
    uMoonSize: { value: 1 },
    uMoonGlow: { value: 1 },
    uMoonPhase: { value: 0.85 },
    uFlash: { value: 0 },
    uBillA: { value: col('#ff4f8f') },
    uBillB: { value: col('#53d9ff') },
    uBillK: { value: 1 },
    uBillMono: { value: 0 },
    uWaterDeep: { value: col('#0c2033') },
    uWaterShallow: { value: col('#2a6a8c') },
  };
}

const pick = (U, names) => {
  const o = {};
  for (const n of names) o[n] = U[n];
  return o;
};

/**
 * Polar radial disc geometry in XZ: zero square corners, fine rings near the
 * core & suburbs, and smooth tessellation for Plane <-> Sphere world bending.
 */
export function makeGroundDiscGeometry(maxR = 13500, rings = 68, segs = 96, y = 0, withRimSeed = false) {
  const vertCount = 1 + rings * (segs + 1);
  const pos = new Float32Array(vertCount * 3);
  const nrm = new Float32Array(vertCount * 3);
  const seeds = withRimSeed ? new Float32Array(vertCount) : null;
  pos[0] = 0; pos[1] = y; pos[2] = 0;
  nrm[0] = 0; nrm[1] = 1; nrm[2] = 0;
  if (seeds) seeds[0] = -0.001;

  let ptr = 1;
  for (let rIdx = 1; rIdx <= rings; rIdx++) {
    const t = rIdx / rings;
    const rad = maxR * Math.pow(t, 1.55);
    for (let sIdx = 0; sIdx <= segs; sIdx++) {
      const a = (sIdx / segs) * Math.PI * 2;
      pos[ptr * 3 + 0] = Math.cos(a) * rad;
      pos[ptr * 3 + 1] = y;
      pos[ptr * 3 + 2] = Math.sin(a) * rad;
      nrm[ptr * 3 + 0] = 0;
      nrm[ptr * 3 + 1] = 1;
      nrm[ptr * 3 + 2] = 0;
      if (seeds) seeds[ptr] = -Math.max(0.001, t);
      ptr++;
    }
  }

  const idx = [];
  for (let sIdx = 0; sIdx < segs; sIdx++) {
    idx.push(0, 1 + sIdx + 1, 1 + sIdx);
  }
  const stride = segs + 1;
  for (let rIdx = 1; rIdx < rings; rIdx++) {
    const row0 = 1 + (rIdx - 1) * stride;
    const row1 = 1 + rIdx * stride;
    for (let sIdx = 0; sIdx < segs; sIdx++) {
      const a = row0 + sIdx;
      const b = row0 + sIdx + 1;
      const c = row1 + sIdx;
      const d = row1 + sIdx + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  if (seeds) geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  geo.setIndex(idx);
  return geo;
}

/** Unlit curved ShaderMaterial (with `.color` THREE.Color accessor) for hulls, trees & road stripes. */
export function makeCurvedBasicMaterial(U, hex = '#ffffff', { vertexColors = false } = {}) {
  const uCurve = (U && U.uWorldCurve) || { value: 0 };
  const uPlanet = (U && U.uPlanetR) || { value: 2100 };
  const cVal = col(hex);
  const mat = new THREE.ShaderMaterial({
    vertexShader: SOLID_CURVED_VERT,
    fragmentShader: SOLID_CURVED_FRAG,
    uniforms: {
      uColor: { value: cVal },
      uWorldCurve: uCurve,
      uPlanetR: uPlanet,
    },
    vertexColors,
  });
  Object.defineProperty(mat, 'color', {
    get: () => mat.uniforms.uColor.value,
    enumerable: true,
  });
  return mat;
}

/**
 * True volumetric 3D scene cloud puffs: sparse BackSide bounding boxes around
 * mid/high spires raymarched in CLOUD_FRAG with analytical ellipsoid density
 * reaching strict 0.0 inside r <= 0.88 (zero polygonal silhouettes or disc edges;
 * the horizon-to-horizon cloud canopy is raymarched seamlessly inside SKY_FRAG).
 */
export function buildCloudLayers(cloudMat, seed = 4417) {
  const group = new THREE.Group();
  const puffCount = 48;
  const baseBox = new THREE.BoxGeometry(1, 1, 1);
  const instGeo = new THREE.InstancedBufferGeometry();
  instGeo.index = baseBox.index;
  instGeo.attributes.position = baseBox.attributes.position;
  instGeo.instanceCount = puffCount;

  const centers = new Float32Array(puffCount * 3);
  const scales = new Float32Array(puffCount * 3);
  const seeds = new Float32Array(puffCount);

  for (let i = 0; i < puffCount; i++) {
    const r01 = hash2i(i, 17, seed ^ 0x3c91);
    const a01 = hash2i(i, 29, seed ^ 0x3c91);
    const h01 = hash2i(i, 43, seed ^ 0x3c91);
    const dist = 220 + Math.pow(r01, 0.78) * 4400;
    const ang = a01 * Math.PI * 2;
    const alt = 330 + h01 * 390;
    const sx = 460 + hash2i(i, 53, seed ^ 0x3c91) * 580;
    const sy = 155 + hash2i(i, 61, seed ^ 0x3c91) * 165;
    const sz = 430 + hash2i(i, 71, seed ^ 0x3c91) * 540;
    centers[i * 3 + 0] = Math.cos(ang) * dist;
    centers[i * 3 + 1] = alt;
    centers[i * 3 + 2] = Math.sin(ang) * dist;
    scales[i * 3 + 0] = sx;
    scales[i * 3 + 1] = sy;
    scales[i * 3 + 2] = sz;
    seeds[i] = 0.05 + hash2i(i, 97, seed ^ 0x3c91) * 0.94;
  }

  instGeo.setAttribute('aCenter', new THREE.InstancedBufferAttribute(centers, 3));
  instGeo.setAttribute('aScale', new THREE.InstancedBufferAttribute(scales, 3));
  instGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));

  const puffs = new THREE.Mesh(instGeo, cloudMat);
  puffs.frustumCulled = false;
  puffs.renderOrder = 3;
  group.add(puffs);
  return group;
}

/** Sky dome, alpha-feathered polar ground, 3D cloud deck and instanced tower material + meshes. */
export function makeWorld(U) {
  const skyMat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    uniforms: pick(U, [
      'uZen', 'uHor', 'uSkySunCol', 'uSunDir', 'uSolarDir', 'uCloudCol', 'uStars', 'uStarRot',
      'uCloud', 'uCloudType', 'uCloudStyle',
      'uHaze', 'uTime', 'uSunGlow', 'uSat', 'uMoonDir', 'uMoonSize', 'uMoonGlow', 'uMoonPhase',
      'uFlash', 'uWorldCurve', 'uPlanetR',
    ]),
    side: THREE.BackSide,
    depthWrite: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(22000, 56, 32), skyMat);
  sky.frustumCulled = false;

  const groundMat = new THREE.ShaderMaterial({
    vertexShader: GROUND_VERT,
    fragmentShader: GROUND_FRAG,
    uniforms: pick(U, [
      'uGStreet', 'uGBlock', 'uGLine', 'uGLineGlow', 'uCell', 'uAve', 'uSt',
      'uCitySpan', 'uSuburbSpan', 'uGroundRadius',
      'uWaterMode', 'uTerrainMode', 'uTerrainScale', 'uCoastAngle', 'uTerrainSeed',
      'uWorldCurve', 'uPlanetR',
      'uSunDir', 'uFogCol', 'uSunFogCol', 'uFogDensity', 'uFogHeight', 'uHazeSun', 'uSat',
      'uWetness', 'uPoolCol', 'uBillA', 'uLightK',
    ]),
    transparent: true,
    depthWrite: true,
    side: THREE.DoubleSide,
  });
  const ground = new THREE.Mesh(makeGroundDiscGeometry(13500, 112, 144, 0, false), groundMat);
  ground.frustumCulled = false;
  ground.renderOrder = -1;

  const cloudMat = new THREE.ShaderMaterial({
    vertexShader: CLOUD_VERT,
    fragmentShader: CLOUD_FRAG,
    uniforms: pick(U, [
      'uCloudCol', 'uSkySunCol', 'uSunDir', 'uFogCol', 'uSunFogCol', 'uHazeSun',
      'uCloud', 'uCloudType', 'uCloudStyle', 'uSunGlow', 'uTime', 'uSat',
      'uPoolCol', 'uLightK', 'uWorldCurve', 'uPlanetR',
    ]),
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
  });
  const clouds = buildCloudLayers(cloudMat);

  const towerMat = new THREE.ShaderMaterial({
    vertexShader: TOWER_VERT,
    fragmentShader: TOWER_FRAG,
    uniforms: pick(U, [
      'uSunDir', 'uSunCol', 'uSunK', 'uAmb', 'uAmbG', 'uBaseA', 'uBaseB',
      'uPal', 'uUsePal', 'uWinDensity', 'uWinGlow', 'uWinA', 'uWinB', 'uWinC',
      'uEdge', 'uEdgeCol', 'uBandGlow', 'uToon', 'uFlat',
      'uFogCol', 'uSunFogCol', 'uFogDensity', 'uFogHeight', 'uHazeSun', 'uTime', 'uDayPhase', 'uSat',
      'uBillA', 'uBillB', 'uBillK', 'uBillMono', 'uPoolCol', 'uLightK',
      'uWorldCurve', 'uPlanetR',
    ]),
  });

  const beaconMat = new THREE.ShaderMaterial({
    vertexShader: BEACON_VERT,
    fragmentShader: BEACON_FRAG,
    uniforms: pick(U, ['uTime', 'uLightK', 'uBeaconCol', 'uSteady', 'uWorldCurve', 'uPlanetR']),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  // street lamps: same glow, steady instead of pulsing, look-tinted colour
  const lampMat = new THREE.ShaderMaterial({
    vertexShader: BEACON_VERT,
    fragmentShader: BEACON_FRAG,
    uniforms: {
      uTime: U.uTime,
      uLightK: U.uLightK,
      uBeaconCol: U.uLampCol,
      uSteady: { value: 1 },
      uWorldCurve: U.uWorldCurve,
      uPlanetR: U.uPlanetR,
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const trailMat = new THREE.ShaderMaterial({
    vertexShader: TRAIL_VERT,
    fragmentShader: TRAIL_FRAG,
    uniforms: pick(U, ['uLightK', 'uWorldCurve', 'uPlanetR']),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });

  // fake-volumetric searchlight shafts
  const beamMat = new THREE.ShaderMaterial({
    vertexShader: BEAM_VERT,
    fragmentShader: BEAM_FRAG,
    uniforms: pick(U, ['uBeamCol', 'uBeamK', 'uTime', 'uLightK', 'uWorldCurve', 'uPlanetR']),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });

  // warm pools of lamp light on the ground
  const poolMat = new THREE.ShaderMaterial({
    vertexShader: POOL_VERT,
    fragmentShader: POOL_FRAG,
    uniforms: pick(U, ['uPoolCol', 'uPoolK', 'uLightK', 'uWorldCurve', 'uPlanetR']),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const waterMat = new THREE.ShaderMaterial({
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
    uniforms: pick(U, [
      'uWaterDeep', 'uWaterShallow', 'uSunDir', 'uSkySunCol', 'uFogCol', 'uSunFogCol',
      'uCitySpan', 'uSuburbSpan', 'uGroundRadius',
      'uWaterMode', 'uTerrainMode', 'uTerrainScale', 'uCoastAngle', 'uTerrainSeed',
      'uPoolCol', 'uLightK',
      'uHazeSun', 'uTime', 'uSat', 'uWorldCurve', 'uPlanetR',
    ]),
    transparent: true,
    depthWrite: true,
    side: THREE.DoubleSide,
  });

  const billMat = new THREE.ShaderMaterial({
    vertexShader: BILL_VERT,
    fragmentShader: BILL_FRAG,
    uniforms: pick(U, ['uBillA', 'uBillB', 'uBillK', 'uBillMono', 'uTime', 'uLightK', 'uSat', 'uWorldCurve', 'uPlanetR']),
  });

  const holoMat = new THREE.ShaderMaterial({
    vertexShader: HOLO_VERT,
    fragmentShader: HOLO_FRAG,
    uniforms: pick(U, ['uBillA', 'uBillB', 'uBillK', 'uBillMono', 'uTime', 'uLightK', 'uSat', 'uWorldCurve', 'uPlanetR']),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });

  const swarmMat = new THREE.ShaderMaterial({
    vertexShader: SWARM_VERT,
    fragmentShader: SWARM_FRAG,
    uniforms: pick(U, ['uTime', 'uHeightScale', 'uLightK', 'uBillMono', 'uWorldCurve', 'uPlanetR']),
  });

  return {
    sky, skyMat, ground, groundMat, clouds, cloudMat,
    towerMat, beaconMat, lampMat, trailMat, swarmMat, beamMat, poolMat, waterMat, billMat, holoMat,
  };
}

/** One landmark material — shared look vocabulary with the towers, parameterized by architectural role. */
export function makeLandmarkMaterial(U, hex = '#4a5568', role = 0) {
  return new THREE.ShaderMaterial({
    vertexShader: LANDMARK_VERT,
    fragmentShader: LANDMARK_FRAG,
    uniforms: {
      uCol: { value: col(hex) },
      uRole: { value: role },
      ...pick(U, [
        'uSunDir', 'uSunCol', 'uSunK', 'uAmb', 'uAmbG', 'uWinDensity', 'uWinGlow',
        'uWinA', 'uWinB', 'uWinC', 'uEdge', 'uEdgeCol', 'uBandGlow', 'uToon', 'uFlat',
        'uPoolCol', 'uLightK',
        'uFogCol', 'uSunFogCol', 'uFogDensity', 'uFogHeight', 'uHazeSun', 'uTime', 'uDayPhase', 'uSat',
        'uWorldCurve', 'uPlanetR',
      ]),
    },
  });
}

/** Build the instanced box mesh for a generated city. */
export function buildCityMesh(city, towerMat) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.InstancedMesh(geo, towerMat, city.count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < city.count; i++) {
    p.set(city.x[i], city.y[i], city.z[i]);
    s.set(city.w[i], city.h[i], city.d[i]);
    if (city.rot && city.rot[i]) q.setFromAxisAngle(yAxis, city.rot[i]);
    else q.identity();
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
  }
  q.identity();
  mesh.instanceMatrix.needsUpdate = true;

  const dims = new Float32Array(city.count * 3);
  for (let i = 0; i < city.count; i++) {
    dims[i * 3] = city.w[i];
    dims[i * 3 + 1] = city.h[i];
    dims[i * 3 + 2] = city.d[i];
  }
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(city.s, 1));
  geo.setAttribute('aDims', new THREE.InstancedBufferAttribute(dims, 3));
  geo.setAttribute('aKind', new THREE.InstancedBufferAttribute(city.kind, 1));
  geo.setAttribute('aStyle', new THREE.InstancedBufferAttribute(city.style, 1));
  mesh.frustumCulled = false;
  return mesh;
}

/** Sync macro-environment uniforms (`uWaterMode`, `uTerrainMode`, `uCoastAngle`, etc.) from a generated city. */
export function syncCityEnvironmentUniforms(U, city) {
  if (!U || !city) return;
  if (U.uCitySpan) U.uCitySpan.value = (city.radius || 5) * CELL;
  if (U.uSuburbSpan) U.uSuburbSpan.value = city.suburbSpan || 5200;
  if (U.uWaterMode) U.uWaterMode.value = city.waterMode ?? 0;
  if (U.uTerrainMode) U.uTerrainMode.value = city.terrainMode ?? 0;
  if (U.uTerrainScale) U.uTerrainScale.value = city.terrainScale ?? 1;
  if (U.uCoastAngle) U.uCoastAngle.value = city.coastAngle ?? 0.7;
  if (U.uTerrainSeed) U.uTerrainSeed.value.set(city.terrainSeedX ?? 0, city.terrainSeedZ ?? 0);
}

/** Grow a city and return { city, mesh, collider } — caller swaps the mesh in the scene. */
export function growCity(
  seed, radius, towerMat, suburbReach = 1.0,
  envOpts = null
) {
  const city = envOpts && typeof envOpts === 'object'
    ? generateCity({
      seed,
      radius,
      suburbReach,
      waterMode: envOpts.waterMode ?? 0,
      terrainMode: envOpts.terrainMode ?? 0,
      terrainScale: envOpts.terrainScale ?? 1.0,
    })
    : generateCity(seed, radius, suburbReach);
  if (envOpts && envOpts.U) syncCityEnvironmentUniforms(envOpts.U, city);
  return { city, mesh: buildCityMesh(city, towerMat), collider: makeCityCollider(city) };
}

/* -------------------------------------------------------------- landmarks */

/**
 * Derive a 5-tone architectural palette for landmarks and public venues from
 * either an explicit `look` object or the active uniforms `U`, so every special
 * structure follows the active color theme (Blade Runner, Tron, Clay, Anime,
 * Abstract, Metropolis, Outrun, or Custom) while preserving per-structure seed variety.
 */
function computeSpecialPalette(look, U, seed = 0.5) {
  const cPrimary = new THREE.Color();
  const cSecondary = new THREE.Color();
  const cTrim = new THREE.Color();
  const cGallery = new THREE.Color();
  const cPad = new THREE.Color();
  const tmpA = new THREE.Color();
  const tmpB = new THREE.Color();

  const s = ((seed % 1) + 1) % 1;
  if (look && look.tower) {
    const tw = look.tower;
    const gr = look.ground || {};
    const sig = look.signals || {};
    const lt = look.light || {};
    if (tw.usePalette > 0.5 && Array.isArray(tw.palette) && tw.palette.length > 0) {
      const pIdx = Math.floor(s * tw.palette.length) % tw.palette.length;
      const pIdx2 = (pIdx + 2) % tw.palette.length;
      cPrimary.set(tw.palette[pIdx]);
      cSecondary.set(tw.palette[pIdx2]).lerp(tmpA.set(tw.baseA), 0.42);
    } else {
      cPrimary.set(tw.baseA).lerp(tmpA.set(tw.baseB), 0.30 + s * 0.58);
      if (lt.amb) cPrimary.lerp(tmpB.set(lt.amb), 0.14);
      cSecondary.set(tw.baseA).lerp(tmpA.set(gr.block || tw.baseA), 0.38);
      if (tw.edgeCol) cSecondary.lerp(tmpB.set(tw.edgeCol), 0.08);
    }
    const accentHex = look.accent || tw.edgeCol || '#68e8ff';
    const billHex = sig.billA || tw.edgeCol || accentHex;
    cTrim.set(accentHex);
    if (!(sig.billMono > 0.5)) cTrim.lerp(tmpA.set(billHex), s * 0.55);
    const winHex = (!tw.winA || tw.winA === '#000000') ? accentHex : tw.winA;
    cGallery.set(winHex).lerp(cTrim, 0.28);
    cPad.set(gr.block || tw.baseA).lerp(tmpA.set(tw.baseA), 0.35);
  } else {
    if (U.uUsePal && U.uUsePal.value > 0.5 && U.uPal && U.uPal.value.length) {
      const pal = U.uPal.value;
      const pIdx = Math.floor(s * pal.length) % pal.length;
      cPrimary.copy(pal[pIdx]);
      cSecondary.copy(pal[(pIdx + 2) % pal.length]).lerp(U.uBaseA.value, 0.42);
    } else {
      cPrimary.copy(U.uBaseA.value).lerp(U.uBaseB.value, 0.30 + s * 0.58).lerp(U.uAmb.value, 0.14);
      cSecondary.copy(U.uBaseA.value).lerp(U.uGBlock.value, 0.38).lerp(U.uEdgeCol.value, 0.08);
    }
    cTrim.copy(U.uBillA.value).lerp(U.uEdgeCol.value, s * 0.45);
    cGallery.copy(U.uWinA.value);
    if (cGallery.r + cGallery.g + cGallery.b < 0.03) cGallery.copy(cTrim);
    cPad.copy(U.uGBlock.value).lerp(U.uBaseA.value, 0.35);
  }
  return { primary: cPrimary, secondary: cSecondary, trim: cTrim, gallery: cGallery, pad: cPad };
}

/**
 * Build the named landmark (POI) geometry group from city.landmarks.
 * Every landmark uses 4 theme-synced architectural material roles:
 *   role 0 (`primary`)   : primary monumental structural casing & fluted facade
 *   role 1 (`secondary`) : heavy podium plinths, mega-cores, ribs & buttress trusses
 *   role 2 (`trim`)      : glowing architectural accent crowns, arrises & halo rings
 *   role 3 (`gallery`)   : recessed illuminated sky-lobbies, terraces & observation pods
 * Includes `arch`, `spire`, `dome`, `mast`, `crown`, `needle`, `pyramid`, `cantilever`, and `ziggurat`.
 */
export function buildLandmarks(city, U, initialLook = null) {
  const group = new THREE.Group();
  const entries = [];

  const addBox = (parent, w, h, d, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    if (rx || ry || rz) mesh.rotation.set(rx, ry, rz);
    parent.add(mesh);
    return mesh;
  };

  for (const lm of city.landmarks) {
    const pal = computeSpecialPalette(initialLook, U, lm.colorSeed);
    const primaryMat = makeLandmarkMaterial(U, '#ffffff', 0);
    const secondaryMat = makeLandmarkMaterial(U, '#ffffff', 1);
    const trimMat = makeLandmarkMaterial(U, '#ffffff', 2);
    const galleryMat = makeLandmarkMaterial(U, '#ffffff', 3);
    primaryMat.uniforms.uCol.value.copy(pal.primary);
    secondaryMat.uniforms.uCol.value.copy(pal.secondary);
    trimMat.uniforms.uCol.value.copy(pal.trim);
    galleryMat.uniforms.uCol.value.copy(pal.gallery);
    entries.push({ seed: lm.colorSeed, primaryMat, secondaryMat, trimMat, galleryMat });

    const m = new THREE.Group();
    m.position.set(lm.x, 0, lm.z);
    m.rotation.y = lm.rot;
    const { kind, r, h } = lm;

    // Shared monumental stepped plaza plinth so landmarks meet the city grid cleanly
    addBox(m, r * 2.25, 4.5, r * 2.25, secondaryMat, 0, 2.25, 0);
    addBox(m, r * 1.92, 4.0, r * 1.92, primaryMat, 0, 6.2, 0);

    if (kind === 'pyramid') {
      // Neo-Mayan / Tyrell Arcology Pyramid: sloped 4-face monumental pyramid, armored diagonal
      // corner spines, recessed illuminated sky-terraces, axial grand stairs & hovering capstone
      const baseH = h * 0.14;
      addBox(m, r * 2.55, baseH * 0.55, r * 2.55, secondaryMat, 0, baseH * 0.275, 0);
      addBox(m, r * 2.28, baseH * 0.50, r * 2.28, primaryMat, 0, baseH * 0.78, 0);

      // 4 axial ceremonial stair-ramps climbing the N/S/E/W faces of the base
      for (let d = 0; d < 4; d++) {
        const ang = d * (Math.PI / 2);
        const ramp = new THREE.Group();
        ramp.rotation.y = ang;
        addBox(ramp, r * 0.44, baseH * 1.18, r * 0.68, secondaryMat, 0, baseH * 0.52, r * 1.16, -0.46, 0, 0);
        addBox(ramp, r * 0.06, baseH * 1.24, r * 0.70, trimMat, -r * 0.23, baseH * 0.58, r * 1.16, -0.46, 0, 0);
        addBox(ramp, r * 0.06, baseH * 1.24, r * 0.70, trimMat, r * 0.23, baseH * 0.58, r * 1.16, -0.46, 0, 0);
        m.add(ramp);
      }

      // Main 4-sided sloped casing pyramid (rotated 45 deg so flat faces face N/S/E/W)
      const pyrH = h * 0.74;
      const rBot = r * 1.52;
      const rTop = r * 0.28;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, pyrH, 4, 1), primaryMat);
      body.rotation.y = Math.PI / 4;
      body.position.y = baseH + pyrH * 0.5;
      m.add(body);

      // 3 recessed horizontal sky-terrace observation galleries girdling the sloped faces
      for (const frac of [0.26, 0.52, 0.76]) {
        const yT = baseH + pyrH * frac;
        const wT = (rBot + (rTop - rBot) * frac) * Math.SQRT2 * 1.03;
        addBox(m, wT, h * 0.022, wT, galleryMat, 0, yT, 0);
        addBox(m, wT * 1.035, h * 0.008, wT * 1.035, trimMat, 0, yT + h * 0.014, 0);
      }

      // 4 heavy armored corner ridge spines + glowing power conduits along the 4 diagonal arrises
      const slopeAng = Math.atan2(rBot - rTop, pyrH);
      const spineLen = Math.hypot(rBot - rTop, pyrH);
      const rMid = (rBot + rTop) * 0.5;
      for (let cIdx = 0; cIdx < 4; cIdx++) {
        const diagA = cIdx * (Math.PI / 2) + Math.PI / 4;
        const cornerGrp = new THREE.Group();
        cornerGrp.rotation.y = diagA;
        addBox(cornerGrp, r * 0.14, spineLen, r * 0.18, secondaryMat, 0, baseH + pyrH * 0.5, rMid * 0.99, -slopeAng, 0, 0);
        addBox(cornerGrp, r * 0.045, spineLen * 0.98, r * 0.05, trimMat, 0, baseH + pyrH * 0.5, rMid * 1.045, -slopeAng, 0, 0);
        m.add(cornerGrp);
      }

      // Summit sanctuary temple + hovering illuminated pyramidion capstone & halo
      const sumY = baseH + pyrH;
      const sanctW = rTop * Math.SQRT2 * 1.25;
      addBox(m, sanctW, h * 0.045, sanctW, secondaryMat, 0, sumY + h * 0.02, 0);
      addBox(m, sanctW * 0.84, h * 0.028, sanctW * 0.84, galleryMat, 0, sumY + h * 0.052, 0);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(rTop * 0.88, h * 0.095, 4), trimMat);
      cap.rotation.y = Math.PI / 4;
      cap.position.y = sumY + h * 0.135;
      m.add(cap);
      const halo = new THREE.Mesh(new THREE.TorusGeometry(rTop * 1.65, r * 0.028, 6, 32), trimMat);
      halo.rotation.x = Math.PI / 2;
      halo.position.y = sumY + h * 0.105;
      m.add(halo);
    } else if (kind === 'cantilever') {
      // Cantilevered Sky-Wing Megastructure: twin mega-shear cores, 3 dramatic alternating
      // horizontal cantilevered sky-wings with diagonal tension ties, under-slung compression
      // struts, panoramic glowing sky-lobbies, and cantilevered rooftop helipad
      const coreOffset = r * 0.42;
      for (const sx of [-1, 1]) {
        addBox(m, r * 0.46, h * 0.94, r * 0.62, secondaryMat, sx * coreOffset, h * 0.47, -r * 0.18);
        addBox(m, r * 0.07, h * 0.92, r * 0.08, trimMat, sx * (coreOffset + sx * r * 0.22), h * 0.47, r * 0.13);
      }
      // Central glazed elevator atrium between the twin shear cores
      addBox(m, r * 0.44, h * 0.88, r * 0.38, galleryMat, 0, h * 0.45, -r * 0.18);

      // 3 dramatic horizontal cantilevered sky-wings projecting into open space
      const wings = [
        { yf: 0.36, len: r * 2.55, thick: h * 0.085, wid: r * 0.98, dirX: 1, dirZ: 0 },
        { yf: 0.62, len: r * 2.75, thick: h * 0.092, wid: r * 0.92, dirX: 0, dirZ: 1 },
        { yf: 0.84, len: r * 2.35, thick: h * 0.078, wid: r * 0.86, dirX: -1, dirZ: 0 },
      ];
      for (const w of wings) {
        const wg = new THREE.Group();
        wg.position.y = h * w.yf;
        wg.rotation.y = Math.atan2(-w.dirZ, w.dirX);
        // Main cantilevered horizontal box beam jutting along +X
        addBox(wg, w.len, w.thick, w.wid, primaryMat, w.len * 0.34, 0, 0);
        // Under-slung illuminated sky-lobby glass soffit & upper terrace band
        addBox(wg, w.len * 0.92, w.thick * 0.26, w.wid * 0.90, galleryMat, w.len * 0.36, -w.thick * 0.46, 0);
        addBox(wg, w.len * 1.01, w.thick * 0.11, w.wid * 1.02, trimMat, w.len * 0.34, w.thick * 0.50, 0);
        // Diagonal steel compression knee-struts beneath the overhang
        const strutLen = w.len * 0.68;
        for (const sz of [-1, 1]) {
          addBox(wg, strutLen, r * 0.085, r * 0.095, secondaryMat, w.len * 0.34, -w.thick * 0.95, sz * w.wid * 0.40, 0, 0, 0.42);
          // Diagonal upper suspension tie-rods anchored high on the core
          addBox(wg, strutLen * 0.88, r * 0.05, r * 0.05, trimMat, w.len * 0.38, w.thick * 0.95, sz * w.wid * 0.38, 0, 0, -0.38);
        }
        m.add(wg);
      }

      // Summit mast & cantilevered circular helipad ring
      const padCyl = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.56, r * 0.48, 3.2, 20), secondaryMat);
      padCyl.position.set(0, h * 0.95, r * 0.46);
      m.add(padCyl);
      const padRing = new THREE.Mesh(new THREE.TorusGeometry(r * 0.52, r * 0.04, 6, 28), trimMat);
      padRing.rotation.x = Math.PI / 2;
      padRing.position.set(0, h * 0.958, r * 0.46);
      m.add(padRing);
      const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.6, r * 0.09, h * 0.14, 8), trimMat);
      spire.position.set(-coreOffset, h * 0.99, -r * 0.18);
      m.add(spire);
    } else if (kind === 'ziggurat') {
      // Seven-Step Hanging-Terrace Ziggurat: crisp stepped square tiers, corner buttress pylons,
      // glowing colonnade galleries on every terrace, 4 axial grand stairways & temple crown
      const tiers = 7;
      const bodyH = h * 0.82;
      const tierH = bodyH / tiers;
      for (let i = 0; i < tiers; i++) {
        const frac = i / tiers;
        const w = r * 2.42 * (1 - frac * 0.66);
        const yCenter = 6 + (i + 0.5) * tierH;
        const useMat = i % 2 === 0 ? primaryMat : secondaryMat;
        addBox(m, w, tierH * 0.82, w, useMat, 0, yCenter - tierH * 0.06, 0);
        // Illuminated colonnade gallery recessed under each step cornice
        addBox(m, w * 0.96, tierH * 0.18, w * 0.96, galleryMat, 0, yCenter + tierH * 0.38, 0);
        addBox(m, w * 1.02, tierH * 0.06, w * 1.02, trimMat, 0, yCenter + tierH * 0.48, 0);
        // Corner pylon bastions on lower 5 tiers
        if (i < 5) {
          const pw = w * 0.12;
          for (const sx of [-1, 1]) {
            for (const sz of [-1, 1]) {
              addBox(m, pw, tierH * 0.96, pw, secondaryMat, sx * w * 0.48, yCenter, sz * w * 0.48);
            }
          }
        }
      }
      // 4 monumental axial stairways climbing all 7 terraces
      const stairRun = r * 2.42 * 0.33;
      const stairLen = Math.hypot(stairRun, bodyH * 0.88);
      const stairTilt = Math.atan2(stairRun, bodyH * 0.88);
      for (let d = 0; d < 4; d++) {
        const sg = new THREE.Group();
        sg.rotation.y = d * (Math.PI / 2);
        const zMid = r * 1.21 - stairRun * 0.46;
        addBox(sg, r * 0.30, stairLen, r * 0.16, secondaryMat, 0, 6 + bodyH * 0.44, zMid, -stairTilt, 0, 0);
        addBox(sg, r * 0.045, stairLen, r * 0.18, trimMat, -r * 0.16, 6 + bodyH * 0.45, zMid, -stairTilt, 0, 0);
        addBox(sg, r * 0.045, stairLen, r * 0.18, trimMat, r * 0.16, 6 + bodyH * 0.45, zMid, -stairTilt, 0, 0);
        m.add(sg);
      }
      // Summit sanctuary + twin horn pylons + hovering solar ring
      const topY = 6 + bodyH;
      const tw = r * 0.72;
      addBox(m, tw, h * 0.10, tw, primaryMat, 0, topY + h * 0.05, 0);
      addBox(m, tw * 0.78, h * 0.05, tw * 0.78, galleryMat, 0, topY + h * 0.11, 0);
      for (const sx of [-1, 1]) {
        addBox(m, tw * 0.16, h * 0.14, tw * 0.22, secondaryMat, sx * tw * 0.36, topY + h * 0.08, 0);
      }
      const zRing = new THREE.Mesh(new THREE.TorusGeometry(tw * 0.82, r * 0.032, 6, 32), trimMat);
      zRing.position.y = topY + h * 0.155;
      zRing.rotation.x = Math.PI / 2 - 0.25;
      m.add(zRing);
    } else if (kind === 'arch') {
      const legH = h * 0.54;
      for (const sx of [-1, 1]) {
        addBox(m, r * 0.42, legH, r * 0.60, primaryMat, sx * r, legH / 2, 0);
        addBox(m, r * 0.24, legH * 0.76, r * 0.92, secondaryMat, sx * r * 1.40, legH * 0.38, 0, 0, 0, sx * -0.12);
        // Vertical glowing corner flutes along each leg
        addBox(m, r * 0.05, legH * 0.94, r * 0.64, trimMat, sx * r * 0.78, legH * 0.48, 0);
      }
      const arc = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.16, 10, 28, Math.PI), primaryMat);
      arc.position.y = legH;
      m.add(arc);
      const innerArc = new THREE.Mesh(new THREE.TorusGeometry(r * 0.83, r * 0.038, 6, 28, Math.PI), trimMat);
      innerArc.position.y = legH;
      m.add(innerArc);
      const halo = new THREE.Mesh(new THREE.TorusGeometry(r * 1.30, r * 0.045, 6, 30, Math.PI * 0.88), trimMat);
      halo.position.y = legH * 0.94;
      halo.rotation.set(0, 0.32, 0.18);
      m.add(halo);
      // Underslung panoramic skybridge deck + crown observation gallery
      addBox(m, r * 2.18, r * 0.11, r * 0.38, secondaryMat, 0, legH + r * 0.02, 0);
      addBox(m, r * 1.88, r * 0.08, r * 0.42, galleryMat, 0, legH - r * 0.06, 0);
      addBox(m, r * 0.78, r * 0.16, r * 0.56, galleryMat, 0, legH + r * 1.12, 0);
      addBox(m, r * 0.92, r * 0.05, r * 0.62, trimMat, 0, legH + r * 1.22, 0);
    } else if (kind === 'spire') {
      const segs = 4;
      let y = 6;
      for (let i = 0; i < segs; i++) {
        const segH = (h * 0.70) / segs;
        const rb = r * (1.06 - (i / segs) * 0.60);
        const rt = r * (1.06 - ((i + 1) / segs) * 0.60);
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, segH, 12), i % 2 === 0 ? primaryMat : secondaryMat);
        seg.position.y = y + segH / 2;
        m.add(seg);
        y += segH;
        const gal = new THREE.Mesh(new THREE.CylinderGeometry(rt * 1.10, rt * 1.10, segH * 0.12, 12), galleryMat);
        gal.position.y = y - segH * 0.08;
        m.add(gal);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(rb * 1.24, rb * 0.08, 6, 24), trimMat);
        ring.rotation.x = Math.PI / 2 + (i % 2 ? 0.12 : -0.10);
        ring.position.y = y;
        m.add(ring);
      }
      // 4 flying buttress fins anchoring the spire base
      for (let i = 0; i < 4; i++) {
        const a = i * (Math.PI / 2) + Math.PI / 4;
        addBox(m, r * 0.16, h * 0.34, r * 0.85, secondaryMat, Math.cos(a) * r * 1.05, h * 0.17, Math.sin(a) * r * 1.05, 0, -a, 0);
      }
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.06, r * 0.18, h * 0.28, 8), secondaryMat);
      mast.position.y = y + h * 0.14;
      m.add(mast);
      const orb = new THREE.Mesh(new THREE.TorusGeometry(r * 2.45, r * 0.08, 6, 40), trimMat);
      orb.position.y = h * 0.58;
      orb.rotation.set(Math.PI / 2 - 0.38, 0.5, 0.24);
      m.add(orb);
      for (let i = 0; i < 3; i++) {
        const a = i * 2.094 + lm.colorSeed * 6.0;
        addBox(m, r * 2.2, r * 0.18, r * 0.72, primaryMat, Math.cos(a) * r * 1.35, h * (0.34 + i * 0.14), Math.sin(a) * r * 1.35, 0, -a, 0);
        addBox(m, r * 2.0, r * 0.08, r * 0.76, galleryMat, Math.cos(a) * r * 1.35, h * (0.34 + i * 0.14) - r * 0.11, Math.sin(a) * r * 1.35, 0, -a, 0);
      }
    } else if (kind === 'dome') {
      const podium = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.02, r * 1.12, h * 0.42, 24), primaryMat);
      podium.position.y = h * 0.21;
      m.add(podium);
      const colonnade = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.06, r * 1.06, h * 0.08, 24), galleryMat);
      colonnade.position.y = h * 0.38;
      m.add(colonnade);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(r * 0.96, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), primaryMat);
      dome.position.y = h * 0.42;
      m.add(dome);
      // Meridian structural ribs arching over the dome shell + glowing oculus lantern
      for (let i = 0; i < 6; i++) {
        const rib = new THREE.Mesh(new THREE.TorusGeometry(r * 0.97, r * 0.032, 6, 24, Math.PI), i % 2 === 0 ? secondaryMat : trimMat);
        rib.position.y = h * 0.42;
        rib.rotation.y = (i / 6) * Math.PI;
        m.add(rib);
      }
      const lantern = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.16, r * 0.22, h * 0.12, 12), galleryMat);
      lantern.position.y = h * 0.42 + r * 0.96 + h * 0.05;
      m.add(lantern);
      const finial = new THREE.Mesh(new THREE.CylinderGeometry(0.8, r * 0.08, h * 0.18, 8), trimMat);
      finial.position.y = h * 0.42 + r * 0.96 + h * 0.18;
      m.add(finial);
      const fins = 12;
      for (let i = 0; i < fins; i++) {
        const a = (i / fins) * Math.PI * 2;
        addBox(m, r * 0.14, h * 0.40, r * 0.56, secondaryMat, Math.cos(a) * r * 1.16, h * 0.20, Math.sin(a) * r * 1.16, 0, -a, 0);
      }
      const halo = new THREE.Mesh(new THREE.TorusGeometry(r * 1.48, r * 0.055, 6, 36), trimMat);
      halo.position.y = h * 0.42 + r * 1.02;
      halo.rotation.x = Math.PI / 2 - 0.12;
      m.add(halo);
    } else if (kind === 'mast') {
      // 4 splayed lattice legs + central core + 3 hexagonal broadcast decks
      for (let i = 0; i < 4; i++) {
        const a = i * (Math.PI / 2) + Math.PI / 4;
        addBox(m, r * 0.28, h * 0.48, r * 0.28, secondaryMat, Math.cos(a) * r * 0.82, h * 0.22, Math.sin(a) * r * 0.82, 0, -a, 0.14);
      }
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.36, r * 0.92, h * 0.94, 10), primaryMat);
      shaft.position.y = h * 0.47;
      m.add(shaft);
      for (const t of [0.34, 0.60, 0.84]) {
        const rw = r * (2.3 - t * 1.2);
        const deck = new THREE.Mesh(new THREE.CylinderGeometry(rw, rw * 0.92, h * 0.028, 6), secondaryMat);
        deck.position.y = h * t;
        m.add(deck);
        const pod = new THREE.Mesh(new THREE.CylinderGeometry(rw * 0.86, rw * 0.86, h * 0.018, 6), galleryMat);
        pod.position.y = h * t + h * 0.02;
        m.add(pod);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(rw * 1.08, r * 0.14, 6, 20), trimMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = h * t;
        m.add(ring);
      }
      addBox(m, r * 4.8, r * 0.28, r * 0.28, secondaryMat, 0, h * 0.96, 0);
      for (let i = 0; i < 3; i++) {
        const a = i * 2.094 + lm.colorSeed * 5.0;
        addBox(m, r * 6.4, r * 0.22, r * 0.22, secondaryMat, 0, h * (0.42 + i * 0.17), 0, 0, a, 0);
        const ball = new THREE.Mesh(new THREE.SphereGeometry(r * 0.52, 10, 8), trimMat);
        ball.position.set(Math.cos(a) * r * 3.0, h * (0.42 + i * 0.17), Math.sin(a) * r * 3.0);
        m.add(ball);
      }
    } else if (kind === 'crown') {
      const tiers = 5;
      for (let i = 0; i < tiers; i++) {
        const w = r * 2.05 * (1 - (i / tiers) * 0.50);
        const th = (h * 0.64) / tiers;
        const offX = ((i % 2) ? 1 : -1) * r * 0.18 * i * 0.42;
        addBox(m, w, th * 0.88, w, i % 2 === 0 ? primaryMat : secondaryMat, offX, (i + 0.5) * th, 0, 0, i * 0.14, 0);
        addBox(m, w * 0.94, th * 0.14, w * 0.94, galleryMat, offX, (i + 0.94) * th, 0, 0, i * 0.14, 0);
        addBox(m, w * 1.03, th * 0.05, w * 1.03, trimMat, offX, (i + 1.0) * th, 0, 0, i * 0.14, 0);
      }
      addBox(m, r * 0.92, h * 0.30, r * 0.92, primaryMat, 0, h * 0.64 + h * 0.15, 0);
      // 4 Art-Deco crown toweret fins + glowing finial halo
      for (let i = 0; i < 4; i++) {
        const a = i * (Math.PI / 2);
        addBox(m, r * 0.18, h * 0.24, r * 0.34, trimMat, Math.cos(a) * r * 0.52, h * 0.84, Math.sin(a) * r * 0.52, 0, -a, 0);
      }
      const halo = new THREE.Mesh(new THREE.TorusGeometry(r * 1.65, r * 0.075, 6, 34), trimMat);
      halo.position.y = h * 0.84;
      halo.rotation.x = Math.PI / 2 - 0.32;
      m.add(halo);
    } else { // needle
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        addBox(m, r * 0.24, h * 0.36, r * 0.68, secondaryMat, Math.cos(a) * r * 0.86, h * 0.18, Math.sin(a) * r * 0.86, 0, -a, 0.15);
      }
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.36, r * 0.92, h * 0.78, 12), primaryMat);
      shaft.position.y = h * 0.39;
      m.add(shaft);
      // Double-deck revolving panoramic sky-pod
      const podLow = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.62, r * 1.10, h * 0.045, 20), secondaryMat);
      podLow.position.y = h * 0.76;
      m.add(podLow);
      const podGlass = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.72, r * 1.58, h * 0.042, 20), galleryMat);
      podGlass.position.y = h * 0.80;
      m.add(podGlass);
      const podRim = new THREE.Mesh(new THREE.TorusGeometry(r * 1.76, r * 0.055, 6, 32), trimMat);
      podRim.rotation.x = Math.PI / 2;
      podRim.position.y = h * 0.822;
      m.add(podRim);
      const spike = new THREE.Mesh(new THREE.CylinderGeometry(0.4, r * 0.28, h * 0.22, 8), trimMat);
      spike.position.y = h * 0.82 + h * 0.11;
      m.add(spike);
      for (const sx of [-1, 1]) {
        const twin = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.14, r * 0.34, h * 0.54, 8), secondaryMat);
        twin.position.set(sx * r * 2.85, h * 0.27, sx * r * 0.65);
        m.add(twin);
        for (const t of [0.30, 0.50]) {
          addBox(m, r * 2.9, r * 0.14, r * 0.44, galleryMat, sx * r * 1.42, h * t, sx * r * 0.32);
          addBox(m, r * 2.9, r * 0.05, r * 0.48, trimMat, sx * r * 1.42, h * t + r * 0.09, sx * r * 0.32);
        }
      }
    }
    m.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    group.add(m);
  }

  group.setLook = (look) => {
    for (const ent of entries) {
      const pal = computeSpecialPalette(look, U, ent.seed);
      ent.primaryMat.uniforms.uCol.value.copy(pal.primary);
      ent.secondaryMat.uniforms.uCol.value.copy(pal.secondary);
      ent.trimMat.uniforms.uCol.value.copy(pal.trim);
      ent.galleryMat.uniforms.uCol.value.copy(pal.gallery);
    }
  };
  return group;
}

/** Blinking aviation beacons over towers and landmarks. */
export function buildBeacons(city, beaconMat) {
  const n = city.beacons.length;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  const phase = new Float32Array(n);
  const size = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const b = city.beacons[i];
    pos[i * 3] = b.x;
    pos[i * 3 + 1] = b.y;
    pos[i * 3 + 2] = b.z;
    phase[i] = b.phase * Math.PI * 2;
    size[i] = 3.2 + (b.r || 0) * 2.6;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const points = new THREE.Points(geo, beaconMat);
  points.frustumCulled = false;
  return points;
}

/** Steady street-lamp glow along the avenues. */
export function makeLamps(city, lampMat) {
  const n = city.lamps.length;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  const phase = new Float32Array(n);
  const size = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const L = city.lamps[i];
    pos[i * 3] = L.x;
    pos[i * 3 + 1] = L.y;
    pos[i * 3 + 2] = L.z;
    phase[i] = 0;
    size[i] = 2.6;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const points = new THREE.Points(geo, lampMat);
  points.frustumCulled = false;
  return points;
}

/**
 * Public spaces — markets, plazas, parks, fairs, arenas, theatres & stadiums.
 * Uses theme-synced architectural material roles (`primary`, `secondary`, `trim`, `gallery`, `pad`)
 * and exposes `group.setLook(look)` so every venue tracks active color themes & Custom palettes.
 */
export function buildPlaces(city, U, initialLook = null) {
  const group = new THREE.Group();
  const entries = [];

  for (const pl of city.places) {
    const pal = computeSpecialPalette(initialLook, U, pl.seed);
    const padMat = makeLandmarkMaterial(U, '#ffffff', 1);
    const primaryMat = makeLandmarkMaterial(U, '#ffffff', 0);
    const secondaryMat = makeLandmarkMaterial(U, '#ffffff', 1);
    const trimMat = makeLandmarkMaterial(U, '#ffffff', 2);
    const galleryMat = makeLandmarkMaterial(U, '#ffffff', 3);
    padMat.uniforms.uCol.value.copy(pal.pad);
    primaryMat.uniforms.uCol.value.copy(pal.primary);
    secondaryMat.uniforms.uCol.value.copy(pal.secondary);
    trimMat.uniforms.uCol.value.copy(pal.trim);
    galleryMat.uniforms.uCol.value.copy(pal.gallery);
    entries.push({ seed: pl.seed, padMat, primaryMat, secondaryMat, trimMat, galleryMat });

    const m = new THREE.Group();
    m.position.set(pl.x, 0, pl.z);
    m.rotation.y = pl.rot;
    const { kind, r, seed } = pl;

    // Stepped paved plaza plinth + perimeter trim curb
    const pad = new THREE.Mesh(new THREE.BoxGeometry(r * 2.02, 1.6, r * 2.02), padMat);
    pad.position.y = 0.8;
    m.add(pad);
    const curb = new THREE.Mesh(new THREE.BoxGeometry(r * 1.88, 0.55, r * 1.88), secondaryMat);
    curb.position.y = 1.75;
    m.add(curb);

    const rnd = (k) => ((Math.sin(seed * 97.1 + k * 41.7) * 43758.5453) % 1 + 1) % 1;
    const stallMats = [primaryMat, secondaryMat];

    if (kind === 'market') {
      const rings = 2;
      let idx = 0;
      for (let ring = 0; ring < rings; ring++) {
        const rr = r * (0.42 + ring * 0.34);
        const count = 8 + ring * 4;
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2 + rnd(idx++) * 0.35;
          const sw = 7 + rnd(idx++) * 7;
          const stall = new THREE.Mesh(new THREE.BoxGeometry(sw, 5 + rnd(idx++) * 4, sw * 0.8), stallMats[idx % 2]);
          stall.position.set(Math.cos(a) * rr, 4, Math.sin(a) * rr);
          stall.rotation.y = -a + rnd(idx++) * 0.5;
          m.add(stall);
          const canopy = new THREE.Mesh(new THREE.BoxGeometry(sw * 1.45, 0.85, sw * 1.2), i % 2 === 0 ? trimMat : galleryMat);
          canopy.position.set(Math.cos(a) * rr, 9.5 + rnd(idx) * 3, Math.sin(a) * rr);
          canopy.rotation.y = stall.rotation.y;
          m.add(canopy);
        }
      }
      // Central glass market pavilion pyramid + clock obelisk
      const pav = new THREE.Mesh(new THREE.ConeGeometry(r * 0.24, 9.5, 4), galleryMat);
      pav.rotation.y = Math.PI / 4;
      pav.position.y = 11.5;
      m.add(pav);
      const ob = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 3.4, 28, 8), trimMat);
      ob.position.y = 15;
      m.add(ob);
    } else if (kind === 'plaza') {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + pl.seed * 3;
        const mh = 26 + rnd(i) * 40;
        const mono = new THREE.Mesh(new THREE.BoxGeometry(5 + rnd(i + 9) * 4, mh, 10), i % 2 === 0 ? primaryMat : secondaryMat);
        mono.position.set(Math.cos(a) * r * 0.62, mh / 2, Math.sin(a) * r * 0.62);
        mono.rotation.y = -a + 0.4;
        mono.rotation.z = (rnd(i + 3) - 0.5) * 0.14;
        m.add(mono);
      }
      // Stepped central glass pyramid fountain + hovering solar astrolabe rings
      const ftn = new THREE.Mesh(new THREE.ConeGeometry(r * 0.22, 14, 4), galleryMat);
      ftn.rotation.y = Math.PI / 4;
      ftn.position.y = 8.5;
      m.add(ftn);
      const orb = new THREE.Mesh(new THREE.SphereGeometry(6.5, 14, 12), trimMat);
      orb.position.y = 34;
      m.add(orb);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.34, 1.05, 6, 32), trimMat);
      ring.position.y = 34;
      ring.rotation.x = Math.PI / 2 - 0.3;
      m.add(ring);
      const ring2 = new THREE.Mesh(new THREE.TorusGeometry(r * 0.26, 0.75, 6, 28), galleryMat);
      ring2.position.y = 34;
      ring2.rotation.set(0.45, 0.6, 0.2);
      m.add(ring2);
    } else if (kind === 'park') {
      // Sculpted botanical/cyber sanctuary: stepped lawn berms, elevated canopy
      // boardwalk ring, glowing reflecting pond, lantern pergolas & conservatory dome
      // (multi-branching procedural trees & sky-connections are populated by buildTrees!)
      const pond = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.23, r * 0.25, 0.7, 22), galleryMat);
      pond.position.set(r * 0.18, 1.95, -r * 0.10);
      m.add(pond);
      const pondRim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.24, 0.85, 6, 26), trimMat);
      pondRim.rotation.x = Math.PI / 2;
      pondRim.position.set(r * 0.18, 2.25, -r * 0.10);
      m.add(pondRim);

      // Elevated circular canopy skywalk promenade + supporting piers
      const walkRing = new THREE.Mesh(new THREE.TorusGeometry(r * 0.56, 1.65, 6, 36), secondaryMat);
      walkRing.rotation.x = Math.PI / 2;
      walkRing.position.y = 7.4;
      m.add(walkRing);
      const walkTrim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.56, 0.38, 6, 36), trimMat);
      walkTrim.rotation.x = Math.PI / 2;
      walkTrim.position.y = 8.45;
      m.add(walkTrim);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const pier = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 7.2, 6), secondaryMat);
        pier.position.set(Math.cos(a) * r * 0.56, 3.7, Math.sin(a) * r * 0.56);
        m.add(pier);
      }

      // Botanical geodesic conservatory dome + radial garden paths
      const dome = new THREE.Mesh(new THREE.SphereGeometry(r * 0.20, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), galleryMat);
      dome.position.set(-r * 0.22, 1.9, -r * 0.18);
      m.add(dome);
      const domeHalo = new THREE.Mesh(new THREE.TorusGeometry(r * 0.205, 0.48, 6, 24), trimMat);
      domeHalo.rotation.x = Math.PI / 2;
      domeHalo.position.set(-r * 0.22, 2.15, -r * 0.18);
      m.add(domeHalo);
      for (let i = 0; i < 5; i++) {
        const slab = new THREE.Mesh(new THREE.BoxGeometry(r * 0.56, 0.75, 4.2), primaryMat);
        const a = i * 1.256 + seed * 6;
        slab.position.set(Math.cos(a) * r * 0.36, 1.9, Math.sin(a) * r * 0.36);
        slab.rotation.y = -a;
        m.add(slab);
      }
    } else if (kind === 'fair') {
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + seed * 4;
        const tent = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 8 + rnd(i) * 5, 12 + rnd(i + 5) * 9, 6), i % 2 === 0 ? primaryMat : galleryMat);
        tent.position.set(Math.cos(a) * r * 0.55, 7, Math.sin(a) * r * 0.55);
        tent.rotation.y = a + 0.6;
        m.add(tent);
      }
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(r * 0.42, 1.6, 8, 32), trimMat);
      wheel.position.set(r * 0.25, r * 0.44, -r * 0.3);
      wheel.rotation.y = 0.5;
      m.add(wheel);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const bar = new THREE.Mesh(new THREE.BoxGeometry(r * 0.82, 0.9, 0.9), secondaryMat);
        bar.position.set(r * 0.25, r * 0.44, -r * 0.3);
        bar.rotation.z = a;
        bar.rotation.y = 0.5;
        m.add(bar);
      }
    } else if (kind === 'arena') {
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.78, r * 0.92, 36, 28), primaryMat);
      bowl.scale.z = 0.76;
      bowl.position.y = 18;
      m.add(bowl);
      const concourse = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.88, r * 0.88, 5.5, 28), galleryMat);
      concourse.scale.z = 0.76;
      concourse.position.y = 14;
      m.add(concourse);
      const hole = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.52, r * 0.52, 38, 22), padMat);
      hole.scale.z = 0.76;
      hole.position.y = 19;
      m.add(hole);
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const rib = new THREE.Mesh(new THREE.BoxGeometry(3.6, 42, 10), i % 2 === 0 ? secondaryMat : trimMat);
        rib.position.set(Math.cos(a) * r * 0.86, 21, Math.sin(a) * r * 0.66);
        rib.rotation.y = -a;
        rib.rotation.z = 0.14;
        m.add(rib);
      }
      const crown = new THREE.Mesh(new THREE.TorusGeometry(r * 0.66, 2.0, 6, 36), trimMat);
      crown.scale.z = 0.76;
      crown.position.y = 40;
      m.add(crown);
      const innerCrown = new THREE.Mesh(new THREE.TorusGeometry(r * 0.42, 1.3, 6, 28), galleryMat);
      innerCrown.scale.z = 0.76;
      innerCrown.position.y = 46;
      m.add(innerCrown);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        const gate = new THREE.Mesh(new THREE.TorusGeometry(12, 2.4, 6, 14, Math.PI), trimMat);
        gate.position.set(Math.cos(a) * r * 0.9, 2, Math.sin(a) * r * 0.68);
        gate.rotation.y = -a + Math.PI / 2;
        m.add(gate);
      }
    } else if (kind === 'theatre') {
      const hall = new THREE.Mesh(new THREE.BoxGeometry(r * 1.08, 30, r * 0.86), primaryMat);
      hall.position.y = 15;
      m.add(hall);
      const flyTower = new THREE.Mesh(new THREE.BoxGeometry(r * 0.66, 24, r * 0.44), secondaryMat);
      flyTower.position.set(0, 37, -r * 0.14);
      m.add(flyTower);
      const crown = new THREE.Mesh(new THREE.BoxGeometry(r * 0.82, 8, r * 0.64), galleryMat);
      crown.position.y = 33.5;
      m.add(crown);
      // Dramatic cantilevered marquee canopy projecting over the grand stairs
      const marquee = new THREE.Mesh(new THREE.BoxGeometry(r * 1.02, 3.8, 22), trimMat);
      marquee.position.set(0, 13.0, r * 0.56);
      m.add(marquee);
      for (const sx of [-1, 1]) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(4.2, 40, 3.2), trimMat);
        blade.position.set(sx * r * 0.42, 32, r * 0.46);
        m.add(blade);
      }
      const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 2.2, 22, 8), trimMat);
      spire.position.set(0, 58, -r * 0.14);
      m.add(spire);
      for (let i = 0; i < 4; i++) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(r * 0.9 - i * 6, 1.4, 8), padMat);
        step.position.set(0, 0.7 + i * 1.4, r * 0.52 + 14 - i * 4);
        m.add(step);
      }
    } else if (kind === 'stadium') {
      const tier1 = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r * 0.99, 17, 28), primaryMat);
      tier1.scale.z = 0.72;
      tier1.position.y = 8.5;
      m.add(tier1);
      const skyBox = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.90, r * 0.90, 4.2, 28), galleryMat);
      skyBox.scale.z = 0.72;
      skyBox.position.y = 18.0;
      m.add(skyBox);
      const tier2 = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.72, r * 0.88, 18, 28), secondaryMat);
      tier2.scale.z = 0.72;
      tier2.position.y = 26.5;
      m.add(tier2);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.74, 2.6, 6, 36), trimMat);
      rim.scale.z = 0.72;
      rim.position.y = 36.0;
      m.add(rim);
      const field = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.58, r * 0.58, 2.2, 22), padMat);
      field.scale.z = 0.66;
      field.position.y = 2;
      m.add(field);
      const track = new THREE.Mesh(new THREE.TorusGeometry(r * 0.6, 2.2, 6, 36), trimMat);
      track.scale.z = 0.7;
      track.position.y = 3.5;
      m.add(track);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.25;
        const mh = 50 + rnd(i) * 18;
        const mast = new THREE.Mesh(new THREE.BoxGeometry(2.4, mh, 2.4), secondaryMat);
        mast.position.set(Math.cos(a) * r * 1.02, mh / 2, Math.sin(a) * r * 0.74);
        m.add(mast);
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(9.5, 4.4, 2.4), galleryMat);
        lamp.position.set(Math.cos(a) * r * 1.02, mh + 1.5, Math.sin(a) * r * 0.74);
        lamp.rotation.y = -a;
        m.add(lamp);
      }
    }
    m.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    group.add(m);
  }

  group.setLook = (look) => {
    for (const ent of entries) {
      const pal = computeSpecialPalette(look, U, ent.seed);
      ent.padMat.uniforms.uCol.value.copy(pal.pad);
      ent.primaryMat.uniforms.uCol.value.copy(pal.primary);
      ent.secondaryMat.uniforms.uCol.value.copy(pal.secondary);
      ent.trimMat.uniforms.uCol.value.copy(pal.trim);
      ent.galleryMat.uniforms.uCol.value.copy(pal.gallery);
    }
  };
  return group;
}

/* --------------------------------------------------------------- traffic */

const VEHICLE_COLORS = [
  '#ffe8c8', '#fff4df', '#ff4038', '#86f2ff', '#ffb347', '#ff66b8', '#7af0ff', '#ffd166',
  '#b8e0ff', '#ff7b54', '#9bf6ff', '#ffd6a5', '#caffbf', '#bdb2ff', '#ffadad', '#e2ece9',
];

/* ------------------------------------------------- geometry helpers */

/** Merge coloured boxes into one non-indexed geometry (position/normal/color). */
function mergeParts(parts) {
  let total = 0;
  const built = [];
  for (const pt of parts) {
    const g = (pt.sphere
      ? new THREE.SphereGeometry(0.5, pt.seg || 10, (pt.seg || 10) - 2 > 4 ? (pt.seg || 10) - 2 : 6)
      : new THREE.BoxGeometry(1, 1, 1)).toNonIndexed();
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(pt.rx || 0, pt.ry || 0, pt.rz || 0));
    m.scale(new THREE.Vector3(pt.w, pt.h, pt.d));
    m.setPosition(pt.x || 0, pt.y || 0, pt.z || 0);
    g.applyMatrix4(m);
    const n = g.getAttribute('position').count;
    const cols = new Float32Array(n * 3);
    const roles = new Float32Array(n);
    const roleVal = pt.role !== undefined ? pt.role
      : (pt.c === HEAD || pt.c === XENON) ? 3
      : (pt.c === TAIL) ? 4
      : (pt.c === GLASS) ? 2
      : (pt.c === TRIM) ? 1
      : (pt.c === GLOW || pt.c === TAXI || pt.c === WIN_GLOW) ? 5
      : 0;
    for (let i = 0; i < n; i++) {
      cols[i * 3] = pt.c[0];
      cols[i * 3 + 1] = pt.c[1];
      cols[i * 3 + 2] = pt.c[2];
      roles[i] = roleVal;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    g.setAttribute('aRole', new THREE.BufferAttribute(roles, 1));
    built.push(g);
    total += n;
  }
  const pos = new Float32Array(total * 3);
  const nrm = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  const rol = new Float32Array(total);
  let off = 0;
  for (const g of built) {
    const n = g.getAttribute('position').count;
    pos.set(g.getAttribute('position').array, off * 3);
    nrm.set(g.getAttribute('normal').array, off * 3);
    col.set(g.getAttribute('color').array, off * 3);
    rol.set(g.getAttribute('aRole').array, off);
    off += n;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('aRole', new THREE.BufferAttribute(rol, 1));
  return out;
}

/**
 * Volumetric spotlight cone: two crossed tapered quads along +Y flaring from a
 * tight lens aperture at y=0 to a wide shaft at y=length, carrying both `uv`
 * (read by BEAM_VERT) and `aBeamT`/`aBeamW` falloff attributes.
 */
function beamGeometry(length, width) {
  const hw0 = Math.max(0.25, width * 0.085);
  const hw1 = width * 0.54;
  const pos = [];
  const uvs = [];
  const bt = [];
  const bw = [];
  const quad = (corners) => {
    const idx = [0, 1, 2, 0, 2, 3];
    for (const k of idx) {
      pos.push(...corners[k].p);
      uvs.push(corners[k].w, corners[k].t);
      bt.push(corners[k].t);
      bw.push(corners[k].w);
    }
  };
  // quad A: spans z (flared spotlight cone)
  quad([
    { p: [0, 0, -hw0], t: 0, w: 0 },
    { p: [0, 0, hw0], t: 0, w: 1 },
    { p: [0, length, hw1], t: 1, w: 1 },
    { p: [0, length, -hw1], t: 1, w: 0 },
  ]);
  // quad B: spans x (flared spotlight cone)
  quad([
    { p: [-hw0, 0, 0], t: 0, w: 0 },
    { p: [hw0, 0, 0], t: 0, w: 1 },
    { p: [hw1, length, 0], t: 1, w: 1 },
    { p: [-hw1, length, 0], t: 1, w: 0 },
  ]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  g.setAttribute('aBeamT', new THREE.BufferAttribute(new Float32Array(bt), 1));
  g.setAttribute('aBeamW', new THREE.BufferAttribute(new Float32Array(bw), 1));
  return g;
}

// Vehicle part colours & material roles:
// - HULL/HULL2/TRIM/GLASS receive per-instance body tinting (roles 0..2).
// - HEAD/XENON (role 3 = front headlights) & TAIL (role 4 = rear taillights) stay pure untinted lamp colours!
// - GLOW/TAXI/WIN_GLOW (role 5) emit self-luminous accent/cabin light.
const HULL = [1, 1, 1];
const HULL2 = [0.76, 0.79, 0.86];
const GLASS = [0.12, 0.16, 0.24];
const TRIM = [0.42, 0.45, 0.54];
const HEAD = [1.0, 0.96, 0.80];     // warm-white halogen/quartz front headlights (+X)
const XENON = [0.78, 0.95, 1.0];    // cool ice-xenon front headlights (+X)
const TAIL = [1.0, 0.08, 0.13];     // vivid crimson-red rear taillights/brake bars (-X)
const GLOW = [0.28, 0.76, 1.0];     // cyan hover-pad / plasma thruster glow
const TAXI = [1.0, 0.76, 0.12];     // illuminated amber cab roof sign
const WIN_GLOW = [1.0, 0.86, 0.52]; // warm lit passenger cabin windows

const VEHICLE_CLASSES = [
  {
    // 0: DeLorean DMC-12 Hover-Coupe — wedge nose, gullwing greenhouse, rear louvers, folded hover-wheel pods (~30%)
    name: 'delorean', len: 18, layers: ['ground', 'air-low', 'air-mid'], parts: deloreanParts, beam: true, thruster: true,
    beamLen: 26, beamW: 5.5, spd: 0.0056, spdJit: 0.0006, scale: 0.86,
    bobA: 0.35, bobF: 1.25, weaveA: 2.2, weaveF: 0.85, spinSpeed: 8, isCar: true,
  },
  {
    // 1: Fifth-Element Retro-Cab — cab-forward body, side hover-pontoons, amber TAXI roof crest (~24%)
    name: 'cab', len: 20, layers: ['ground', 'air-low', 'air-mid'], parts: cabParts, beam: true,
    beamLen: 28, beamW: 6.0, spd: 0.0052, spdJit: 0.0006, scale: 0.88,
    bobA: 0.42, bobF: 1.10, weaveA: 2.4, weaveF: 0.80, spinSpeed: 8, isCar: true,
  },
  {
    // 2: Streamlined Maglev Sky-Train — bullet locomotive + 4 articulated coaches on dedicated rail loops (~4.8%)
    name: 'train', len: 30, layers: ['air-low', 'air-mid'], parts: trainLocoParts, beam: true, trailers: 4,
    beamLen: 42, beamW: 8.5, spd: 0.0024, spdJit: 0.00018, scale: 0.90,
    bobA: 0.0, bobF: 0.5, weaveA: 0.0, weaveF: 0.3, coachSpacing: 24.5, isTrain: true,
  },
  {
    // 3: Cyber-Wedge GT Coupe — needle wedge nose, side strakes, xenon headlamps & full-width crimson tailbar (~16%)
    name: 'coupe', len: 19, layers: ['ground', 'air-low', 'air-mid', 'air-high'], parts: coupeParts, beam: true,
    beamLen: 28, beamW: 5.4, spd: 0.0066, spdJit: 0.0007, scale: 0.84,
    bobA: 0.32, bobF: 1.35, weaveA: 2.0, weaveF: 0.95, isCar: true,
  },
  {
    // 4: Patrol Tilt-Helicopter — rare aerial patrol craft with spinning main rotor & chin searchlight (~1.8%)
    name: 'heli', len: 19, layers: ['air-mid', 'air-high'], parts: heliParts, beam: true, rotor: heliRotorParts,
    beamLen: 36, beamW: 8.5, spd: 0.0030, spdJit: 0.00035, scale: 1.0,
    bobA: 0.85, bobF: 0.82, weaveA: 3.5, weaveF: 0.55, spinSpeed: 15, hover: true, isAir: true,
  },
  {
    // 5: Heavy Off-World Broadcast Blimp — very rare 112m dirigible with twin animated sweeping searchlights (~1.0%)
    name: 'blimp', len: 112, layers: ['blimp'], parts: blimpParts, beam: true,
    beamLen: 95, beamW: 22, spd: 0.00085, spdJit: 0.00012, scale: 1.0,
    bobA: 3.2, bobF: 0.18, weaveA: 6.0, weaveF: 0.14, isBlimp: true,
  },
  {
    // 6: Executive Art-Deco Hover-Cruiser — long luxury saloon with chrome pontoons & warm cabin glass (~10%)
    name: 'limo', len: 25, layers: ['ground', 'air-low', 'air-mid'], parts: limoParts, beam: true,
    beamLen: 30, beamW: 6.4, spd: 0.0046, spdJit: 0.00045, scale: 0.88,
    bobA: 0.28, bobF: 0.90, weaveA: 1.8, weaveF: 0.65, isCar: true,
  },
  {
    // 7: Blade Runner Twin-Mandible Spinner — split forward prongs, bubble canopy & vectored nacelles (~12.4%)
    name: 'spinner', len: 19, layers: ['air-low', 'air-mid', 'air-high', 'ground'], parts: spinnerParts, beam: true,
    beamLen: 30, beamW: 5.8, spd: 0.0062, spdJit: 0.0007, scale: 0.86,
    bobA: 0.45, bobF: 1.30, weaveA: 2.5, weaveF: 0.90, isCar: true,
  },
];

/** Class 0: DeLorean DMC-12 Hover-Coupe — wedge hood, gullwing cabin, rear louvers, 4 folded hover-wheel pods. */
function deloreanParts() {
  return [
    // Brushed wedge lower tub & raked front hood
    { w: 17.6, h: 1.35, d: 6.8, x: 0.0, y: -0.15, c: HULL },
    { w: 7.4, h: 1.05, d: 6.5, x: 6.0, y: 0.12, c: HULL, rz: -0.11 },
    { w: 16.8, h: 0.35, d: 7.1, x: -0.2, y: -0.45, c: TRIM },
    // Gullwing trapezoid cabin + raked windshield
    { w: 6.6, h: 1.45, d: 5.4, x: -0.4, y: 1.15, c: HULL2 },
    { w: 3.6, h: 1.25, d: 5.0, x: 2.8, y: 0.95, c: GLASS, rz: -0.36 },
    { w: 4.8, h: 1.05, d: 5.55, x: -0.3, y: 1.18, c: GLASS },
    // Iconic stepped black rear sun-louvers & twin Mr.-Fusion flux vents
    { w: 5.4, h: 0.42, d: 5.1, x: -5.4, y: 1.32, c: TRIM, rz: 0.18 },
    { w: 4.2, h: 0.36, d: 4.9, x: -6.8, y: 0.96, c: TRIM, rz: 0.18 },
    { w: 2.6, h: 1.15, d: 1.65, x: -7.8, y: 0.82, z: 1.75, c: TRIM },
    { w: 2.6, h: 1.15, d: 1.65, x: -7.8, y: 0.82, z: -1.75, c: TRIM },
    // 4 horizontally folded hover-conversion wheel pods with cyan thruster undersides
    { w: 3.4, h: 0.55, d: 1.55, x: 5.6, y: -0.68, z: 3.85, c: TRIM },
    { w: 3.4, h: 0.55, d: 1.55, x: 5.6, y: -0.68, z: -3.85, c: TRIM },
    { w: 3.6, h: 0.55, d: 1.65, x: -5.8, y: -0.68, z: 3.95, c: TRIM },
    { w: 3.6, h: 0.55, d: 1.65, x: -5.8, y: -0.68, z: -3.95, c: TRIM },
    { w: 2.6, h: 0.20, d: 1.25, x: 5.6, y: -0.98, z: 3.85, c: GLOW },
    { w: 2.6, h: 0.20, d: 1.25, x: 5.6, y: -0.98, z: -3.85, c: GLOW },
    { w: 2.8, h: 0.20, d: 1.35, x: -5.8, y: -0.98, z: 3.95, c: GLOW },
    { w: 2.8, h: 0.20, d: 1.35, x: -5.8, y: -0.98, z: -3.95, c: GLOW },
    // Distinct quad rectangular warm-white FRONT headlights (+X)
    { w: 0.85, h: 0.52, d: 1.15, x: 9.45, y: -0.05, z: 2.25, c: HEAD },
    { w: 0.85, h: 0.52, d: 1.00, x: 9.45, y: -0.05, z: 0.95, c: HEAD },
    { w: 0.85, h: 0.52, d: 1.00, x: 9.45, y: -0.05, z: -0.95, c: HEAD },
    { w: 0.85, h: 0.52, d: 1.15, x: 9.45, y: -0.05, z: -2.25, c: HEAD },
    // Distinct wide crimson-red REAR taillight grille (-X)
    { w: 0.85, h: 0.68, d: 2.65, x: -8.95, y: 0.08, z: 1.85, c: TAIL },
    { w: 0.85, h: 0.68, d: 2.65, x: -8.95, y: 0.08, z: -1.85, c: TAIL },
  ];
}

/** Class 1: Fifth-Element Korben Dallas Retro-Cab — rounded cab-forward body, side pontoons & illuminated TAXI sign. */
function cabParts() {
  return [
    // Deep cab-forward hull + rounded 1950s aero nose
    { w: 18.8, h: 2.45, d: 6.4, x: -0.4, y: 0.15, c: HULL },
    { w: 5.6, h: 2.25, d: 5.8, x: 8.6, y: 0.05, c: HULL, sphere: true, seg: 10 },
    { w: 12.2, h: 1.65, d: 5.4, x: 0.4, y: 1.85, c: HULL },
    { w: 4.4, h: 1.45, d: 5.1, x: 5.6, y: 1.72, c: GLASS, rz: -0.22 },
    { w: 8.4, h: 1.25, d: 5.55, x: -0.2, y: 1.88, c: GLASS },
    // Illuminated amber roof TAXI crest + chrome grille bars
    { w: 3.4, h: 0.85, d: 2.5, x: 2.8, y: 3.05, c: TAXI },
    { w: 0.9, h: 0.95, d: 4.4, x: 10.6, y: -0.35, c: TRIM },
    // Stepped side hover-pontoons + twin tail fins
    { w: 14.6, h: 1.05, d: 1.75, x: -0.6, y: -0.65, z: 3.85, c: HULL2 },
    { w: 14.6, h: 1.05, d: 1.75, x: -0.6, y: -0.65, z: -3.85, c: HULL2 },
    { w: 12.0, h: 0.22, d: 1.35, x: -0.6, y: -1.22, z: 3.85, c: GLOW },
    { w: 12.0, h: 0.22, d: 1.35, x: -0.6, y: -1.22, z: -3.85, c: GLOW },
    { w: 4.4, h: 1.45, d: 0.45, x: -7.8, y: 1.85, z: 2.65, c: TRIM },
    { w: 4.4, h: 1.45, d: 0.45, x: -7.8, y: 1.85, z: -2.65, c: TRIM },
    // Twin round warm-white FRONT headlamps + pontoon fog lamps (+X)
    { w: 1.05, h: 0.85, d: 1.05, x: 10.9, y: 0.20, z: 2.05, c: HEAD },
    { w: 1.05, h: 0.85, d: 1.05, x: 10.9, y: 0.20, z: -2.05, c: HEAD },
    { w: 0.75, h: 0.55, d: 0.95, x: 6.8, y: -0.60, z: 3.85, c: XENON },
    { w: 0.75, h: 0.55, d: 0.95, x: 6.8, y: -0.60, z: -3.85, c: XENON },
    // Twin crimson-red REAR brake thruster rings & tailbar (-X)
    { w: 0.95, h: 1.05, d: 1.55, x: -9.95, y: 0.25, z: 2.05, c: TAIL },
    { w: 0.95, h: 1.05, d: 1.55, x: -9.95, y: 0.25, z: -2.05, c: TAIL },
    { w: 0.75, h: 0.50, d: 4.8, x: -9.90, y: -0.45, z: 0.0, c: TAIL },
  ];
}

/** Class 2 Lead: Streamlined Bullet-Nose Maglev Sky-Train Locomotive (~28 m). */
function trainLocoParts() {
  const parts = [
    // Maglev bogie skirt + streamlined carbody + bullet nose cone
    { w: 23.0, h: 1.35, d: 5.8, x: -1.5, y: -1.35, c: TRIM },
    { w: 22.4, h: 3.6, d: 6.2, x: -1.2, y: 0.95, c: HULL },
    { w: 9.5, h: 3.2, d: 5.8, x: 10.8, y: 0.65, c: HULL, sphere: true, seg: 12 },
    { w: 5.5, h: 1.55, d: 4.8, x: 10.4, y: 1.75, c: GLASS, rz: -0.24 },
    // Roof HV conduit & pantograph fairing + underside maglev rail glow
    { w: 18.0, h: 0.55, d: 2.6, x: -2.0, y: 3.0, c: HULL2 },
    { w: 20.0, h: 0.24, d: 4.4, x: -1.2, y: -2.05, c: GLOW },
    // Bright white nose headlight cluster (+X) & rear coupler diaphragm (-X)
    { w: 1.3, h: 0.85, d: 1.4, x: 15.1, y: 0.35, z: 0.0, c: HEAD },
    { w: 1.0, h: 0.65, d: 1.1, x: 14.4, y: -0.15, z: 1.85, c: XENON },
    { w: 1.0, h: 0.65, d: 1.1, x: 14.4, y: -0.15, z: -1.85, c: XENON },
    { w: 2.2, h: 3.1, d: 4.8, x: -12.8, y: 0.9, c: TRIM },
  ];
  for (let wx = -9.5; wx <= 5.5; wx += 3.75) {
    parts.push({ w: 2.5, h: 1.15, d: 6.38, x: wx, y: 1.35, c: WIN_GLOW });
  }
  return parts;
}

/** Articulated passenger coach coupled into a smooth 5-car Maglev Sky-Train consist (~22.5 m). */
function trainCoachParts(isTailCar = false) {
  const parts = [
    { w: 21.6, h: 1.3, d: 5.8, y: -1.35, c: TRIM },
    { w: 21.8, h: 3.55, d: 6.2, y: 0.95, c: HULL },
    { w: 18.5, h: 0.5, d: 2.6, y: 2.95, c: HULL2 },
    { w: 2.2, h: 3.05, d: 4.8, x: 11.4, y: 0.9, c: TRIM },
    { w: 2.0, h: 3.05, d: 4.8, x: -11.2, y: 0.9, c: TRIM },
    { w: 19.0, h: 0.22, d: 4.4, y: -2.05, c: GLOW },
  ];
  for (let wx = -8.4; wx <= 8.4; wx += 3.36) {
    parts.push({ w: 2.35, h: 1.15, d: 6.38, x: wx, y: 1.35, c: WIN_GLOW });
  }
  if (isTailCar) {
    // Distinct crimson end-of-train marker lights (-X)
    parts.push({ w: 0.85, h: 0.75, d: 1.35, x: -11.95, y: 1.15, z: 2.0, c: TAIL });
    parts.push({ w: 0.85, h: 0.75, d: 1.35, x: -11.95, y: 1.15, z: -2.0, c: TAIL });
    parts.push({ w: 0.75, h: 0.45, d: 4.6, x: -11.95, y: 2.35, z: 0.0, c: TAIL });
  }
  return parts;
}

/** Class 3: Cyber-Wedge Testarossa Hover-GT — needle nose, side strakes, xenon headlamps & full-width crimson tailbar. */
function coupeParts() {
  return [
    { w: 18.6, h: 1.25, d: 7.2, x: -0.2, y: -0.15, c: HULL },
    { w: 8.2, h: 0.95, d: 6.8, x: 5.8, y: 0.02, c: HULL, rz: -0.13 },
    { w: 7.4, h: 1.25, d: 5.2, x: -0.6, y: 0.98, c: GLASS, sphere: true, seg: 10 },
    { w: 9.2, h: 0.75, d: 7.8, x: -2.2, y: 0.05, c: HULL2 },
    { w: 4.8, h: 0.32, d: 7.4, x: -8.2, y: 1.25, c: TRIM },
    { w: 1.2, h: 0.95, d: 0.45, x: -8.0, y: 0.75, z: 3.35, c: TRIM },
    { w: 1.2, h: 0.95, d: 0.45, x: -8.0, y: 0.75, z: -3.35, c: TRIM },
    { w: 13.5, h: 0.20, d: 4.8, x: -0.5, y: -0.86, c: GLOW },
    // Ice-xenon front headlamps (+X) & full-width crimson laser tailbar (-X)
    { w: 1.05, h: 0.45, d: 1.65, x: 9.65, y: -0.08, z: 2.25, c: XENON },
    { w: 1.05, h: 0.45, d: 1.65, x: 9.65, y: -0.08, z: -2.25, c: XENON },
    { w: 0.85, h: 0.55, d: 6.8, x: -9.55, y: 0.22, z: 0.0, c: TAIL },
  ];
}

/** Pulsing plasma thruster block at the DeLorean's rear deck. */
function thrusterParts() {
  return [
    { w: 1.5, h: 0.85, d: 3.2, x: -9.15, y: 0.55, c: GLOW },
  ];
}

/** Class 4: Patrol Tilt-Helicopter — tadpole fuselage, glass bubble nose, skids, tail boom & spinning main rotor. */
function heliParts() {
  return [
    { w: 11.5, h: 3.6, d: 3.9, y: 0, c: HULL, sphere: true, seg: 12 },
    { w: 5.4, h: 2.3, d: 3.1, x: 3.5, y: 0.65, c: GLASS, sphere: true, seg: 10 },
    { w: 8.6, h: 0.75, d: 0.75, x: -8.8, y: 0.9, c: HULL2 },
    { w: 5.2, h: 0.35, d: 7.6, x: -0.4, y: 0.35, c: TRIM },
    { w: 0.55, h: 2.8, d: 1.8, x: -12.2, y: 1.75, c: TRIM },
    { w: 0.55, h: 0.55, d: 5.8, x: 0.8, y: -2.3, z: 2.0, c: TRIM },
    { w: 0.55, h: 0.55, d: 5.8, x: 0.8, y: -2.3, z: -2.0, c: TRIM },
    { w: 1.1, h: 1.35, d: 1.1, x: 0, y: 2.4, c: TRIM },
    // White nose spotlamps (+X) & crimson tail anti-collision beacons (-X)
    { w: 0.9, h: 0.65, d: 0.9, x: 5.9, y: 0.05, z: 1.15, c: HEAD },
    { w: 0.9, h: 0.65, d: 0.9, x: 5.9, y: 0.05, z: -1.15, c: HEAD },
    { w: 0.85, h: 0.85, d: 0.85, x: -12.3, y: 3.25, z: 0.0, c: TAIL },
    { w: 0.75, h: 0.65, d: 0.85, x: -6.2, y: 0.4, z: 1.5, c: TAIL },
  ];
}

function heliRotorParts() {
  return [
    { w: 26, h: 0.30, d: 1.25, y: 3.2, c: TRIM },
    { w: 1.25, h: 0.30, d: 26, y: 3.2, c: TRIM },
    { w: 1.6, h: 0.65, d: 1.6, y: 3.2, c: HULL2 },
  ];
}

/** Class 5: Heavy Off-World Broadcast Blimp (~112 m) — fluted envelope, illuminated gondola & searchlight pods. */
function blimpParts() {
  return [
    { w: 112, h: 28, d: 28, c: HULL, sphere: true, seg: 14 },
    { w: 28, h: 22, d: 22, x: -42, c: HULL2, sphere: true, seg: 10 },
    { w: 28, h: 6.2, d: 6.4, x: 8, y: -13.2, c: TRIM },
    { w: 18, h: 2.4, d: 6.6, x: 7, y: -13.0, c: WIN_GLOW },
    { w: 8.5, h: 4.8, d: 4.8, x: 18, y: -15.0, c: GLASS },
    { w: 2.2, h: 17, d: 23, x: -50, y: 4, c: TRIM },
    { w: 2.2, h: 21, d: 2.5, x: -50, y: 2, c: TRIM },
    { w: 82, h: 1.4, d: 1.1, y: -7.5, z: 13.4, c: GLOW },
    { w: 82, h: 1.4, d: 1.1, y: -7.5, z: -13.4, c: GLOW },
    { w: 6.5, h: 4.2, d: 4.2, x: -8, y: -13.6, c: HULL2 },
    { w: 6.5, h: 4.2, d: 4.2, x: 28, y: -13.6, c: HULL2 },
    // White bow beacon (+X), twin underside searchlight turrets, & crimson stern beacon (-X)
    { w: 2.0, h: 2.0, d: 2.0, x: 55.5, y: 1.5, c: HEAD },
    { w: 1.8, h: 1.4, d: 1.8, x: 20.0, y: -16.8, c: HEAD },
    { w: 1.8, h: 1.4, d: 1.8, x: -3.0, y: -16.8, c: XENON },
    { w: 2.2, h: 2.2, d: 2.2, x: -56.5, y: 8.5, c: TAIL },
  ];
}

/** Class 6: Executive Art-Deco Hover-Cruiser — elongated luxury saloon with wrap-around cabin & chrome pontoons. */
function limoParts() {
  return [
    { w: 24.6, h: 1.75, d: 6.2, y: -0.05, c: HULL },
    { w: 7.2, h: 1.55, d: 5.6, x: 10.4, y: -0.10, c: HULL, sphere: true, seg: 10 },
    { w: 13.6, h: 1.45, d: 5.1, x: -1.2, y: 1.35, c: HULL2 },
    { w: 12.2, h: 1.10, d: 5.3, x: -1.0, y: 1.38, c: GLASS },
    { w: 9.6, h: 0.85, d: 5.4, x: -1.2, y: 1.38, c: WIN_GLOW },
    { w: 21.0, h: 0.75, d: 1.35, x: -0.4, y: -0.55, z: 3.55, c: TRIM },
    { w: 21.0, h: 0.75, d: 1.35, x: -0.4, y: -0.55, z: -3.55, c: TRIM },
    { w: 18.0, h: 0.20, d: 4.2, x: -0.5, y: -1.02, c: GLOW },
    // Warm-white dual front headlamps (+X) & crimson vertical tailfin lamps (-X)
    { w: 1.15, h: 0.72, d: 1.25, x: 13.6, y: 0.05, z: 1.95, c: HEAD },
    { w: 1.15, h: 0.72, d: 1.25, x: 13.6, y: 0.05, z: -1.95, c: HEAD },
    { w: 0.90, h: 1.15, d: 1.10, x: -12.4, y: 0.55, z: 2.45, c: TAIL },
    { w: 0.90, h: 1.15, d: 1.10, x: -12.4, y: 0.55, z: -2.45, c: TAIL },
    { w: 0.75, h: 0.48, d: 4.8, x: -12.4, y: -0.10, z: 0.0, c: TAIL },
  ];
}

/** Class 7: Blade Runner Twin-Mandible Spinner — split forward prongs, bubble canopy & vectored side nacelles. */
function spinnerParts() {
  return [
    { w: 13.2, h: 1.75, d: 4.8, x: -2.0, y: 0.15, c: HULL },
    { w: 6.8, h: 1.75, d: 3.4, x: 1.4, y: 1.30, c: GLASS, sphere: true, seg: 10 },
    { w: 10.8, h: 1.05, d: 1.55, x: 6.2, y: -0.05, z: 2.15, c: HULL2 },
    { w: 10.8, h: 1.05, d: 1.55, x: 6.2, y: -0.05, z: -2.15, c: HULL2 },
    { w: 5.8, h: 1.50, d: 1.85, x: -6.2, y: 0.25, z: 3.30, c: TRIM },
    { w: 5.8, h: 1.50, d: 1.85, x: -6.2, y: 0.25, z: -3.30, c: TRIM },
    { w: 2.2, h: 0.42, d: 2.4, x: 0.5, y: 2.22, c: GLOW },
    { w: 9.0, h: 0.20, d: 3.0, x: -1.0, y: -0.88, c: GLOW },
    // Ice-xenon mandible headlights (+X) & twin crimson rear nacelle brake bars (-X)
    { w: 1.15, h: 0.65, d: 1.15, x: 11.75, y: -0.05, z: 2.15, c: XENON },
    { w: 1.15, h: 0.65, d: 1.15, x: 11.75, y: -0.05, z: -2.15, c: XENON },
    { w: 0.90, h: 0.85, d: 1.55, x: -9.20, y: 0.25, z: 3.30, c: TAIL },
    { w: 0.90, h: 0.85, d: 1.55, x: -9.20, y: 0.25, z: -3.30, c: TAIL },
    { w: 0.80, h: 0.60, d: 3.8, x: -8.65, y: 0.30, z: 0.0, c: TAIL },
  ];
}

/**
 * The traffic fleet: 8 distinct classes (pods, skimmers, haulers, drones,
 * helicopters, blimps, shuttles and spinners) riding curved 3D glide lanes,
 * switching lanes at endpoints, varying speed/scale/banking, never clipping
 * through buildings, and maintaining safe spacing when collision is enabled.
 */
export function makeVehicles(city, trailMat, count = 260, collider = null, opts = {}) {
  const lanes = city.lanes.length ? city.lanes : [{ x1: -400, z1: 0, cx: 0, cz: 0, x2: 400, z2: 0, y: 90, speed: 100, layer: 'air-low' }];
  const colCheck = collider || makeCityCollider(city);
  const total = Math.max(1, Math.min(count, 2400));
  const swarmMat = opts.swarmMat || null;
  const swarmCap = swarmMat ? Math.max(0, opts.swarmCount ?? 18600) : 0;
  const group = new THREE.Group();
  const nCls = VEHICLE_CLASSES.length;

  const h01 = (a, b) => {
    let x = ((a * 374761393) ^ (b * 668265263) ^ ((city.seed || 4417) * 1442695041)) >>> 0;
    x = Math.imul(x ^ (x >>> 13), 1274126177) >>> 0;
    return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
  };

  // Realistic fleet density weights: ~92.4% sci-fi cars (DeLoreans, Fifth Element cabs, Cyber-Wedges,
  // Hover-Limos, Spinners), ~4.8% 5-car Maglev Sky-Train chains, ~1.8% patrol helicopters, ~1.0% giant blimps.
  const weights = [0.30, 0.24, 0.048, 0.16, 0.018, 0.010, 0.10, 0.124];
  const classOf = new Int32Array(total);
  const local = new Int32Array(total);
  const classCount = new Array(nCls).fill(0);
  for (let i = 0; i < total; i++) {
    let cc = 0;
    if (i === 0) cc = 0; // instance 0 is always a DeLorean so veh.mesh[0] is active
    else if (i < nCls && total >= nCls * 2) cc = i;
    else {
      const r = h01(i, 11);
      let acc = 0;
      for (let k = 0; k < nCls; k++) {
        acc += weights[k];
        if (r <= acc) { cc = k; break; }
      }
    }
    classOf[i] = cc;
    local[i] = classCount[cc]++;
  }

  const curveU = trailMat && trailMat.uniforms ? trailMat.uniforms : null;
  const bodyMat = new THREE.ShaderMaterial({
    vertexShader: VEHICLE_VERT,
    fragmentShader: VEHICLE_FRAG,
    uniforms: {
      uLightK: (curveU && curveU.uLightK) || { value: 1 },
      uBillMono: { value: 0 },
      uWorldCurve: (curveU && curveU.uWorldCurve) || { value: 0 },
      uPlanetR: (curveU && curveU.uPlanetR) || { value: 2100 },
    },
    vertexColors: true,
  });
  const beamMat = new THREE.ShaderMaterial({
    vertexShader: BEAM_VERT,
    fragmentShader: BEAM_FRAG,
    uniforms: {
      uBeamCol: { value: col('#fff4dc') },
      uBeamK: { value: 0.56 },
      uTime: { value: 0 },
      uLightK: (curveU && curveU.uLightK) || { value: 1 },
      uWorldCurve: (curveU && curveU.uWorldCurve) || { value: 0 },
      uPlanetR: (curveU && curveU.uPlanetR) || { value: 2100 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });

  // Store integer indices into `lanes` so rail-loop, orbital-ring & street-intersection `L.outs` handoffs stay O(1)!
  const allIndices = lanes.map((_, idx) => idx);
  const railIndices = [];
  for (let idx = 0; idx < lanes.length; idx++) {
    if (lanes[idx].railLoop) railIndices.push(idx);
  }
  const lanePoolIdx = VEHICLE_CLASSES.map((V, cc) => {
    if (cc === 2 && railIndices.length > 0) return railIndices; // Sky-Trains lock strictly onto dedicated rail loops!
    if (cc === 4 || cc === 5) {
      // Helicopters & giant 112m Blimps prefer smooth wide-radius aerial orbital rings (zero tight street corners!)
      const airRings = [];
      for (let idx = 0; idx < lanes.length; idx++) {
        const L = lanes[idx];
        const effLayer = L.nominalLayer || L.layer;
        if (L.ringId !== undefined && !L.railLoop && V.layers.includes(effLayer)) airRings.push(idx);
      }
      if (airRings.length > 0) return airRings;
    }
    const pool = [];
    for (let idx = 0; idx < lanes.length; idx++) {
      const L = lanes[idx];
      if (L.railLoop) continue; // keep express monorail tracks clear for Sky-Trains
      const effLayer = L.nominalLayer || L.layer;
      if (V.layers.includes(effLayer)) pool.push(idx);
    }
    return pool.length ? pool : allIndices;
  });

  const bodies = [];
  const beams = [];
  const rotors = [];
  for (let cc = 0; cc < nCls; cc++) {
    const V = VEHICLE_CLASSES[cc];
    const body = new THREE.InstancedMesh(mergeParts(V.parts()), bodyMat, Math.max(1, classCount[cc]));
    body.frustumCulled = false;
    bodies.push(body);
    group.add(body);

    let beam = null;
    if (V.beam) {
      let bgeo;
      if (cc === 4) {
        // Patrol Helicopter gimbal chin searchlight (+Y shaft rotated downward dynamically in update)
        bgeo = beamGeometry(110, 24);
      } else if (cc === 5) {
        // Blimp forward gondola sweeping searchlight (+Y shaft rotated downward dynamically in update)
        bgeo = beamGeometry(285, 50);
      } else {
        // Forward headlight beam cone projecting from front nose (+X)
        bgeo = beamGeometry(V.beamLen, V.beamW).rotateZ(-Math.PI / 2);
        const first = V.parts().reduce((mx, pt) => Math.max(mx, (pt.x || 0) + (pt.w || 0) / 2), 0);
        bgeo.translate(first + 0.8, 0, 0);
      }
      beam = new THREE.InstancedMesh(bgeo, beamMat, Math.max(1, classCount[cc]));
      beam.frustumCulled = false;
      group.add(beam);
    }
    beams.push(beam);

    let rotor = null;
    if (V.rotor) {
      rotor = new THREE.InstancedMesh(mergeParts(V.rotor()), bodyMat, Math.max(1, classCount[cc]));
      rotor.frustumCulled = false;
      group.add(rotor);
    }
    rotors.push(rotor);
  }

  // Twin aft sweeping searchlight on every Blimp gondola so blimps sweep dual crossed cones over the city!
  const blimpAftBeams = new THREE.InstancedMesh(beamGeometry(265, 46), beamMat, Math.max(1, classCount[5]));
  blimpAftBeams.frustumCulled = false;
  group.add(blimpAftBeams);

  const thrusters = new THREE.InstancedMesh(mergeParts(thrusterParts()), bodyMat, Math.max(1, classCount[0]));
  thrusters.frustumCulled = false;
  group.add(thrusters);

  // 5-car Maglev Sky-Train consist: lead locomotive (bodies[2]) + 2 front coaches (trailers[0..1]) + 2 rear coaches (extraCoaches[0..1])
  const midCoachGeo = mergeParts(trainCoachParts(false));
  const tailCoachGeo = mergeParts(trainCoachParts(true));
  const trailers = [0, 1].map(() => {
    const tr = new THREE.InstancedMesh(midCoachGeo, bodyMat, Math.max(1, classCount[2]));
    tr.frustumCulled = false;
    group.add(tr);
    return tr;
  });
  const extraCoaches = [midCoachGeo, tailCoachGeo].map((geo) => {
    const tr = new THREE.InstancedMesh(geo, bodyMat, Math.max(1, classCount[2]));
    tr.frustumCulled = false;
    group.add(tr);
    return tr;
  });

  const trailGeo = new THREE.BoxGeometry(1, 1, 1);
  const aColor = new Float32Array(total * 3);
  trailGeo.setAttribute('aColor', new THREE.InstancedBufferAttribute(aColor, 3));
  const trails = new THREE.InstancedMesh(trailGeo, trailMat, total);
  trails.frustumCulled = false;
  group.add(trails);

  // ---- Tier 2: GPU-evaluated horizontal street-layer & corner-turning traffic swarm (18,600+ craft, 0ms CPU!) ----
  let swarmMesh = null;
  let swarmGeo = null;
  let swarmColors = null;
  if (swarmCap > 0 && swarmMat) {
    const baseHull = new THREE.BoxGeometry(1, 1, 1);
    swarmGeo = new THREE.InstancedBufferGeometry();
    swarmGeo.index = baseHull.index;
    swarmGeo.attributes.position = baseHull.attributes.position;
    swarmGeo.instanceCount = 0;

    const curveA = new Float32Array(swarmCap * 4);
    const curveB = new Float32Array(swarmCap * 4);
    const curveC = new Float32Array(swarmCap * 4);
    swarmColors = new Float32Array(swarmCap * 3);

    // 6 horizontal street-layer decks with grade separation between N-S (`yNS`) and E-W (`yEW`) streets
    // so perpendicular traffic streams cross at separated elevations without traffic lights!
    const strataDecks = [
      { yNS: 22,  yEW: 37  }, // Stratum 0 (<50m): low avenue & skyscraper-canyon deck
      { yNS: 72,  yEW: 96  }, // Stratum 1 (50..130m): lower commercial street layer
      { yNS: 158, yEW: 188 }, // Stratum 2 (130..255m): mid-tower commuter street layer
      { yNS: 292, yEW: 334 }, // Stratum 3 (255..435m): upper-spire express street layer
      { yNS: 488, yEW: 542 }, // Stratum 4 (435..660m): cloud-skimming street layer
      { yNS: 696, yEW: 758 }, // Stratum 5 (>660m): high-orbital overflight corridor
    ];

    // Candidate street indices on the city grid (avenues multiples of 4 + secondary even streets)
    const maxGridR = Math.max(6, Math.round((city.span || CELL * 5) / CELL) + 4);
    const aveLines = [];
    const allLines = [];
    for (let g = -maxGridR; g <= maxGridR; g += 2) {
      allLines.push(g);
      if (g % 4 === 0) aveLines.push(g);
    }
    if (!aveLines.length) aveLines.push(0);

    const isSwarmPathClear = (x1, z1, ix, iz, x2, z2, y1, y2, turnMode) => {
      if (!colCheck) return true;
      for (let sIdx = 0; sIdx <= 6; sIdx++) {
        const u = sIdx / 6;
        let px, pz, py;
        if (turnMode > 0.5) {
          // Approximate corner-turn trajectory
          if (u < 0.5) {
            const k = u * 2;
            px = x1 + (ix - x1) * k;
            pz = z1 + (iz - z1) * k;
          } else {
            const k = (u - 0.5) * 2;
            px = ix + (x2 - ix) * k;
            pz = iz + (z2 - iz) * k;
          }
          py = y1 + (y2 - y1) * u;
        } else {
          px = x1 + (x2 - x1) * u;
          pz = z1 + (z2 - z1) * u;
          py = y1 + (y2 - y1) * (u * u * (3 - 2 * u));
        }
        if (colCheck.hitsPoint(px, pz, py, 6.5)) return false;
      }
      return true;
    };

    const ringLanes = lanes.filter((L) => L.ringId !== undefined);

    for (let i = 0; i < swarmCap; i++) {
      // Interleave strata across indices so any prefix [0..swarmActive] spans ALL 6 horizontal layers!
      const sPick = h01(i, 101);
      const stratum = sPick < 0.14 ? 0 : sPick < 0.38 ? 1 : sPick < 0.62 ? 2 : sPick < 0.80 ? 3 : sPick < 0.93 ? 4 : 5;
      const deck = strataDecks[stratum];
      const craftScale = 0.68 + h01(i, 151) * 0.70 + (stratum >= 4 ? 0.32 : 0);

      // ~8% on high strata ride closed horizontal orbital rings
      if (stratum >= 4 && ringLanes.length > 0 && h01(i, 105) < 0.14) {
        const RL = ringLanes[Math.floor(h01(i, 103) * ringLanes.length) % ringLanes.length];
        const yFlat = stratum === 5 ? 710 + (h01(i, 131) - 0.5) * 24 : Math.max(460, RL.y + (h01(i, 131) - 0.5) * 16);
        const approxLen = Math.max(240, Math.hypot(RL.cx - RL.x1, RL.cz - RL.z1) + Math.hypot(RL.x2 - RL.cx, RL.z2 - RL.cz));
        const worldSpd = 95 + stratum * 22 + h01(i, 149) * 65;
        curveA[i * 4 + 0] = RL.x1;
        curveA[i * 4 + 1] = RL.z1;
        curveA[i * 4 + 2] = yFlat;
        curveA[i * 4 + 3] = worldSpd / approxLen;
        curveB[i * 4 + 0] = RL.cx;
        curveB[i * 4 + 1] = RL.cz;
        curveB[i * 4 + 2] = yFlat;
        curveB[i * 4 + 3] = h01(i, 157);
        curveC[i * 4 + 0] = RL.x2;
        curveC[i * 4 + 1] = RL.z2;
        curveC[i * 4 + 2] = craftScale;
        curveC[i * 4 + 3] = 0.0; // closed orbital arc mode
        continue;
      }

      const routeRoll = h01(i, 107);
      const wantCornerTurn = routeRoll < 0.56;
      const wantDeckSwitch = !wantCornerTurn && routeRoll > 0.84;

      const linePool = stratum <= 1 ? aveLines : allLines;
      let built = false;
      for (let attempt = 0; attempt < 5 && !built; attempt++) {
        const usePool = attempt >= 2 ? aveLines : linePool;
        const g1 = usePool[Math.floor(h01(i + attempt * 19, 109) * usePool.length) % usePool.length];
        const g2 = usePool[Math.floor(h01(i + attempt * 23, 113) * usePool.length) % usePool.length];
        const startNS = h01(i + attempt * 7, 127) < 0.5;
        const sgn1 = h01(i + attempt * 11, 131) < 0.5 ? 1 : -1;
        const sgn2 = h01(i + attempt * 13, 137) < 0.5 ? 1 : -1;
        const laneJitter = (h01(i, 139) - 0.5) * 3.2;
        const yJitter = (h01(i, 141) - 0.5) * 4.0;

        if (wantCornerTurn) {
          // 90-degree street corner turn at intersection (g1, g2) with perpendicular deck grade separation!
          const leg1 = (2 + Math.floor(h01(i, 143) * 4)) * CELL;
          const leg2 = (2 + Math.floor(h01(i, 145) * 4)) * CELL;
          const off1 = (g1 % 4 === 0 ? 8.2 : 5.2) + laneJitter;
          const off2 = (g2 % 4 === 0 ? 8.2 : 5.2) + laneJitter;
          let x1, z1, ix, iz, x2, z2, y1, y2;
          if (startNS) {
            // Leg 1 travels N-S along x = g1*CELL +/- off1 -> turns 90 deg onto E-W z = g2*CELL +/- off2
            const xLane = g1 * CELL + (sgn1 > 0 ? -off1 : off1);
            const zLane = g2 * CELL + (sgn2 > 0 ? off2 : -off2);
            ix = xLane;
            iz = zLane;
            x1 = xLane;
            z1 = iz - sgn1 * leg1;
            x2 = ix + sgn2 * leg2;
            z2 = zLane;
            y1 = deck.yNS + yJitter;
            y2 = deck.yEW + yJitter;
          } else {
            // Leg 1 travels E-W along z = g2*CELL +/- off2 -> turns 90 deg onto N-S x = g1*CELL +/- off1
            const zLane = g2 * CELL + (sgn1 > 0 ? off2 : -off2);
            const xLane = g1 * CELL + (sgn2 > 0 ? -off1 : off1);
            ix = xLane;
            iz = zLane;
            x1 = ix - sgn1 * leg1;
            z1 = zLane;
            x2 = xLane;
            z2 = iz + sgn2 * leg2;
            y1 = deck.yEW + yJitter;
            y2 = deck.yNS + yJitter;
          }
          const turnR = (g1 % 4 === 0 && g2 % 4 === 0) ? 54.0 : 42.0;
          if (stratum <= 3 && attempt < 4 && !isSwarmPathClear(x1, z1, ix, iz, x2, z2, y1, y2, turnR)) continue;
          const totalLen = Math.max(220, leg1 + leg2);
          const worldSpd = 56 + stratum * 24 + h01(i, 149) * 68;
          curveA[i * 4 + 0] = x1;
          curveA[i * 4 + 1] = z1;
          curveA[i * 4 + 2] = y1;
          curveA[i * 4 + 3] = worldSpd / totalLen;
          curveB[i * 4 + 0] = ix;
          curveB[i * 4 + 1] = iz;
          curveB[i * 4 + 2] = y2;
          curveB[i * 4 + 3] = h01(i, 157);
          curveC[i * 4 + 0] = x2;
          curveC[i * 4 + 1] = z2;
          curveC[i * 4 + 2] = craftScale;
          curveC[i * 4 + 3] = turnR;
          built = true;
        } else {
          // Straight horizontal street run (either flat horizontal y2 == y1, or smooth elevation switch!)
          const runSpan = (4 + Math.floor(h01(i, 143) * 5)) * CELL;
          const centerAlong = (g2 * 0.5) * CELL;
          const off = (g1 % 4 === 0 ? 8.2 : 5.2) + laneJitter;
          let x1, z1, x2, z2, y1, y2;
          y1 = (startNS ? deck.yNS : deck.yEW) + yJitter;
          if (wantDeckSwitch) {
            const adjIdx = Math.max(0, Math.min(5, stratum + (h01(i, 147) < 0.55 ? 1 : -1)));
            const adjDeck = strataDecks[adjIdx];
            y2 = (startNS ? adjDeck.yNS : adjDeck.yEW) + yJitter;
          } else {
            y2 = y1; // 100% flat horizontal cruise!
          }
          if (startNS) {
            const xLane = g1 * CELL + (sgn1 > 0 ? -off : off);
            x1 = xLane; x2 = xLane;
            z1 = centerAlong - sgn1 * runSpan * 0.5;
            z2 = centerAlong + sgn1 * runSpan * 0.5;
          } else {
            const zLane = g1 * CELL + (sgn1 > 0 ? off : -off);
            z1 = zLane; z2 = zLane;
            x1 = centerAlong - sgn1 * runSpan * 0.5;
            x2 = centerAlong + sgn1 * runSpan * 0.5;
          }
          const mx = (x1 + x2) * 0.5, mz = (z1 + z2) * 0.5;
          if (stratum <= 3 && attempt < 4 && !isSwarmPathClear(x1, z1, mx, mz, x2, z2, y1, y2, -1.0)) continue;
          const worldSpd = 62 + stratum * 26 + h01(i, 149) * 74;
          curveA[i * 4 + 0] = x1;
          curveA[i * 4 + 1] = z1;
          curveA[i * 4 + 2] = y1;
          curveA[i * 4 + 3] = worldSpd / Math.max(240, runSpan);
          curveB[i * 4 + 0] = mx;
          curveB[i * 4 + 1] = mz;
          curveB[i * 4 + 2] = y2;
          curveB[i * 4 + 3] = h01(i, 157);
          curveC[i * 4 + 0] = x2;
          curveC[i * 4 + 1] = z2;
          curveC[i * 4 + 2] = craftScale;
          curveC[i * 4 + 3] = -1.0; // linear horizontal street mode
          built = true;
        }
      }
    }

    swarmGeo.setAttribute('aCurveA', new THREE.InstancedBufferAttribute(curveA, 4));
    swarmGeo.setAttribute('aCurveB', new THREE.InstancedBufferAttribute(curveB, 4));
    swarmGeo.setAttribute('aCurveC', new THREE.InstancedBufferAttribute(curveC, 4));
    swarmGeo.setAttribute('aColor', new THREE.InstancedBufferAttribute(swarmColors, 3));
    swarmMesh = new THREE.Mesh(swarmGeo, swarmMat);
    swarmMesh.frustumCulled = false;
    group.add(swarmMesh);
  }

  const laneIdx = new Int32Array(total);
  const prevLane = new Int32Array(total).fill(-1);
  const nextLane = new Int32Array(total).fill(-1);
  const laps = new Int32Array(total);
  const t = new Float32Array(total);
  const dir = new Float32Array(total);
  const baseSpd = new Float32Array(total);
  const spd = new Float32Array(total);
  const scl = new Float32Array(total);
  const phase = new Float32Array(total);
  const spin = new Float32Array(total);
  const latOf = new Float32Array(total);
  const vOf = new Float32Array(total);
  // Smooth continuous orientation state per vehicle (eliminates sudden heading snaps on all cars & airships)
  const curYaw = new Float32Array(total);
  const curPitch = new Float32Array(total);
  const curBank = new Float32Array(total);
  const poseInit = new Uint8Array(total);
  let elapsed = 0;
  let curHeightScale = 1;
  let lastActiveCount = 0;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler(0, 0, 0, 'YXZ');
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const c = new THREE.Color();

  // Smooth C1 Catmull-Rom cubic interpolation along the 33-node horizontal/ramp profile (zero slope kinks!)
  const laneY = (L, tt) => {
    const prof = L.prof;
    if (!prof) return L.y;
    const nMax = prof.length - 1;
    const f = Math.max(0, Math.min(1, tt)) * nMax;
    const i1 = Math.min(nMax, Math.floor(f));
    const i2 = Math.min(nMax, i1 + 1);
    const i0 = Math.max(0, i1 - 1);
    const i3 = Math.min(nMax, i2 + 1);
    const fr = f - i1;
    const p0 = prof[i0], p1 = prof[i1], p2 = prof[i2], p3 = prof[i3];
    const fr2 = fr * fr;
    const fr3 = fr2 * fr;
    const cr = 0.5 * (
      (2 * p1) +
      (-p0 + p2) * fr +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * fr2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * fr3
    );
    return Math.max(Math.min(p1, p2), cr);
  };

  const evalLane = (L, tt, out) => {
    const u = 1 - tt;
    out.x = u * u * L.x1 + 2 * u * tt * L.cx + tt * tt * L.x2;
    out.z = u * u * L.z1 + 2 * u * tt * L.cz + tt * tt * L.z2;
    const dx = 2 * u * (L.cx - L.x1) + 2 * tt * (L.x2 - L.cx);
    const dz = 2 * u * (L.cz - L.z1) + 2 * tt * (L.z2 - L.cz);
    const len = Math.hypot(dx, dz) || 1;
    out.dx = dx / len;
    out.dz = dz / len;
    out.len = len;
    return out;
  };
  const tmp = { x: 0, z: 0, dx: 1, dz: 0, len: 1 };

  // Pick a connected outgoing segment at an intersection (straight-through, 90-deg corner turn, or deck ramp)
  const pickOutLane = (i, curIdx, stepSeed) => {
    const L = lanes[curIdx];
    if (!L) return -1;
    if (L.nextIdx !== undefined) return L.nextIdx;
    if (!L.outs || L.outs.length === 0) return -1;
    const V = VEHICLE_CLASSES[classOf[i]];
    const matching = [];
    for (let k = 0; k < L.outs.length; k++) {
      const cand = lanes[L.outs[k]];
      if (cand && V.layers.includes(cand.nominalLayer || cand.layer)) matching.push(L.outs[k]);
    }
    const choices = matching.length > 0 ? matching : L.outs;
    return choices[Math.floor(h01(i + stepSeed * 991, 67) * choices.length) % choices.length];
  };

  const assignRoute = (i, lap) => {
    const cc = classOf[i];
    const pool = lanePoolIdx[cc];
    const V = VEHICLE_CLASSES[cc];
    const oldL = lap > 0 ? lanes[laneIdx[i]] : null;
    let usePool = pool;
    if (oldL && pool.length > 4) {
      const sameAlt = [];
      for (let pIdx = 0; pIdx < pool.length; pIdx++) {
        const cand = lanes[pool[pIdx]];
        if (Math.abs((cand.y1 ?? cand.y) - (oldL.y2 ?? oldL.y)) < 28) sameAlt.push(pool[pIdx]);
      }
      if (sameAlt.length > 0) usePool = sameAlt;
    }
    laneIdx[i] = usePool[Math.floor(h01(i + lap * 997, 23) * usePool.length) % usePool.length];
    const L = lanes[laneIdx[i]];
    prevLane[i] = L.prevIdx !== undefined ? L.prevIdx : -1;
    poseInit[i] = 0; // re-seed smoothed heading cleanly on route teleport
    if (L.railLoop) {
      // Dedicated Maglev Sky-Train monorail track: fixed rail centerline, deterministic loop direction
      dir[i] = ((L.ringId || 0) % 2 === 0) ? 1 : -1;
      nextLane[i] = dir[i] > 0 && L.nextIdx !== undefined ? L.nextIdx : (dir[i] < 0 && L.prevIdx !== undefined ? L.prevIdx : -1);
      latOf[i] = 0;
      vOf[i] = 0;
    } else if (L.directed) {
      dir[i] = 1;
      nextLane[i] = pickOutLane(i, laneIdx[i], lap);
      // Tight lateral & vertical trim so street-grid handoffs across turns & ramps stay 100% seamless
      latOf[i] = (h01(i, 41) - 0.5) * 1.4;
      const isDeck0 = (L.nominalLayer || L.layer) === 'ground';
      vOf[i] = isDeck0 ? 0 : (h01(i, 43) - 0.5) * 1.8;
    } else {
      dir[i] = h01(i + lap * 613, 31) < 0.5 ? 1 : -1;
      nextLane[i] = dir[i] > 0 && L.nextIdx !== undefined ? L.nextIdx : (dir[i] < 0 && L.prevIdx !== undefined ? L.prevIdx : -1);
      const sideSpread = L.layer === 'ground' ? 1.8 : 4.6;
      latOf[i] = dir[i] * sideSpread * 0.5 + (h01(i + lap * 317, 41) - 0.5) * sideSpread;
      vOf[i] = L.layer === 'ground' ? 0 : (h01(i + lap * 419, 43) - 0.5) * 3.8;
    }
    baseSpd[i] = V.spd * (0.78 + h01(i + lap * 733, 53) * 0.48);
    spd[i] = baseSpd[i];
  };

  function setPalette(lookOrCols) {
    const isLook = lookOrCols && !Array.isArray(lookOrCols);
    const pal = isLook
      ? (lookOrCols.signals && lookOrCols.signals.vehicles) || VEHICLE_COLORS
      : (Array.isArray(lookOrCols) && lookOrCols.length ? lookOrCols : VEHICLE_COLORS);
    const mono = isLook && lookOrCols.signals && lookOrCols.signals.billMono > 0.5;
    if (bodyMat.uniforms && bodyMat.uniforms.uBillMono) {
      bodyMat.uniforms.uBillMono.value = mono ? 1 : 0;
    }
    if (isLook && lookOrCols.signals && lookOrCols.signals.beam && beamMat.uniforms && beamMat.uniforms.uBeamCol) {
      beamMat.uniforms.uBeamCol.value.set(lookOrCols.signals.beam);
    }
    for (let i = 0; i < total; i++) {
      const cc = classOf[i];
      c.set(pal[Math.floor(h01(i, 37) * pal.length) % pal.length]);
      c.offsetHSL(mono ? 0 : (h01(i, 59) - 0.5) * 0.05, 0, (h01(i, 61) - 0.5) * 0.12);
      bodies[cc].setColorAt(local[i], c);
      if (rotors[cc]) rotors[cc].setColorAt(local[i], c);
      if (cc === 0) thrusters.setColorAt(local[i], c);
      if (cc === 2) {
        for (const tr of trailers) tr.setColorAt(local[i], c);
        for (const tr of extraCoaches) tr.setColorAt(local[i], c);
      }
      aColor[i * 3] = c.r;
      aColor[i * 3 + 1] = c.g;
      aColor[i * 3 + 2] = c.b;
    }
    for (const b of bodies) if (b.instanceColor) b.instanceColor.needsUpdate = true;
    for (const r of rotors) if (r && r.instanceColor) r.instanceColor.needsUpdate = true;
    if (thrusters.instanceColor) thrusters.instanceColor.needsUpdate = true;
    for (const tr of trailers) if (tr.instanceColor) tr.instanceColor.needsUpdate = true;
    for (const tr of extraCoaches) if (tr.instanceColor) tr.instanceColor.needsUpdate = true;
    trailGeo.getAttribute('aColor').needsUpdate = true;

    if (swarmColors && swarmGeo) {
      for (let i = 0; i < swarmCap; i++) {
        c.set(pal[Math.floor(h01(i, 173) * pal.length) % pal.length]);
        c.offsetHSL(mono ? 0 : (h01(i, 179) - 0.5) * 0.05, 0, (h01(i, 181) - 0.5) * 0.12);
        swarmColors[i * 3 + 0] = c.r;
        swarmColors[i * 3 + 1] = c.g;
        swarmColors[i * 3 + 2] = c.b;
      }
      swarmGeo.getAttribute('aColor').needsUpdate = true;
    }
  }

  for (let i = 0; i < total; i++) {
    const cc = classOf[i];
    const V = VEHICLE_CLASSES[cc];
    assignRoute(i, 0);
    t[i] = h01(i, 17);
    phase[i] = h01(i, 19) * Math.PI * 2;
    scl[i] = V.scale * (0.82 + h01(i, 29) * 0.4);
  }
  setPalette(VEHICLE_COLORS);

  // Evaluate exact 3D position at (tVal, elTime) across connected street segments, 90-deg turns & orbital rings!
  const samplePos3 = (i, tVal, elTime, bobOff, out) => {
    const cc = classOf[i];
    const V = VEHICLE_CLASSES[cc];
    let L = lanes[laneIdx[i]];
    let tt = tVal;
    if (L.nextIdx !== undefined && L.prevIdx !== undefined) {
      if (tt >= 1) { L = lanes[L.nextIdx]; tt -= 1; }
      else if (tt < 0) { L = lanes[L.prevIdx]; tt += 1; }
    } else if (L.directed) {
      if (tt >= 1 && nextLane[i] >= 0) {
        L = lanes[nextLane[i]];
        tt -= 1;
      } else if (tt < 0 && prevLane[i] >= 0) {
        L = lanes[prevLane[i]];
        tt += 1;
      }
    }
    tt = Math.max(0, Math.min(1, tt));
    evalLane(L, tt, tmp);
    const sign = dir[i];
    const tx = tmp.dx * sign;
    const tz = tmp.dz * sign;
    const isDeck0 = (L.nominalLayer || L.layer) === 'ground';
    // Gentle micro-drift on air lanes; practically zero on directed street corridors so turns stay crisp!
    const wAmp = L.directed ? (isDeck0 ? 0.08 : 0.35) : (isDeck0 ? 0.22 : Math.min(4.5, V.weaveA * 0.22));
    const wArg = elTime * 0.26 + phase[i];
    const weave = Math.sin(wArg) * wAmp;
    const nx = -tz;
    const nz = tx;
    out.x = tmp.x + nx * (weave + latOf[i]);
    out.z = tmp.z + nz * (weave + latOf[i]);
    out.y = isDeck0
      ? Math.max(5.2, laneY(L, tt))
      : (laneY(L, tt) + vOf[i]) * curHeightScale + bobOff;
    out.len = tmp.len;
    out.tt = tt;
    out.closed = (L.nextIdx !== undefined) || (nextLane[i] >= 0) || (prevLane[i] >= 0);
    out.isGround = isDeck0;
    return out;
  };
  const posCur = { x: 0, y: 0, z: 0, len: 1, tt: 0, closed: false, isGround: false };
  const posPrev = { x: 0, y: 0, z: 0, len: 1, tt: 0, closed: false, isGround: false };
  const posNext = { x: 0, y: 0, z: 0, len: 1, tt: 0, closed: false, isGround: false };

  // Smooth C1 position + damped velocity-aligned yaw/pitch + curvature-driven aerodynamic banking
  const composeAt = (i, tVal, o = {}) => {
    const L = lanes[laneIdx[i]];
    samplePos3(i, tVal, elapsed, o.bob || 0, posCur);
    const dtLook = 0.055;
    const worldSpdEst = Math.max(36, L.speed) * (0.85 + 0.55 * spd[i]);
    const dParam = (worldSpdEst * dtLook * dir[i]) / Math.max(45, posCur.len);
    samplePos3(i, tVal - dParam, elapsed - dtLook, o.bob || 0, posPrev);
    samplePos3(i, tVal + dParam, elapsed + dtLook, o.bob || 0, posNext);

    const vx = posNext.x - posPrev.x;
    const vy = posNext.y - posPrev.y;
    const vz = posNext.z - posPrev.z;
    const hLen = Math.hypot(vx, vz) || 1e-4;
    const rawYaw = Math.atan2(-vz, vx);
    const rawPitch = (posCur.isGround || L.railLoop) ? 0 : Math.max(-0.34, Math.min(0.34, Math.atan2(vy, hLen)));

    // Aerodynamic banking proportional to horizontal turn curvature
    const v1x = posCur.x - posPrev.x, v1z = posCur.z - posPrev.z;
    const v2x = posNext.x - posCur.x, v2z = posNext.z - posCur.z;
    const l1 = Math.hypot(v1x, v1z) || 1, l2 = Math.hypot(v2x, v2z) || 1;
    const turnCross = (v1x * v2z - v1z * v2x) / (l1 * l2);
    const rawBank = (posCur.isGround || L.railLoop) ? 0 : Math.max(-0.36, Math.min(0.36, -turnCross * 5.2));

    let yaw = rawYaw;
    let pitch = rawPitch;
    let bank = rawBank;
    if (o.smoothDt !== undefined) {
      if (!poseInit[i]) {
        curYaw[i] = rawYaw;
        curPitch[i] = rawPitch;
        curBank[i] = rawBank;
        poseInit[i] = 1;
      } else if (o.smoothDt > 0) {
        const dtS = Math.min(0.12, o.smoothDt);
        const kTurn = 1 - Math.exp(-dtS * 6.8);
        let dYaw = Math.atan2(Math.sin(rawYaw - curYaw[i]), Math.cos(rawYaw - curYaw[i]));
        const maxStep = dtS * 2.8; // bounded angular turn rate — zero sudden snaps!
        dYaw = Math.max(-maxStep, Math.min(maxStep, dYaw * kTurn));
        curYaw[i] += dYaw;
        curPitch[i] += (rawPitch - curPitch[i]) * (1 - Math.exp(-dtS * 6.0));
        curBank[i] += (rawBank - curBank[i]) * (1 - Math.exp(-dtS * 5.5));
      }
      yaw = curYaw[i];
      pitch = curPitch[i];
      bank = curBank[i];
    } else if (poseInit[i]) {
      yaw = curYaw[i];
      pitch = curPitch[i];
      bank = curBank[i];
    }
    yaw += (o.sway || 0);
    bank += (o.roll || 0);

    const portal = posCur.closed
      ? 1
      : smoothstep(0, 0.035, posCur.tt) * smoothstep(1, 0.965, posCur.tt);

    p.set(posCur.x, posCur.y, posCur.z);
    e.set(0, yaw + (o.spinY || 0), pitch, 'YXZ');
    q.setFromEuler(e);
    if (bank !== 0) {
      const hb = bank * 0.5;
      const sx = Math.sin(hb), cx = Math.cos(hb);
      const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
      q.set(
        qw * sx + qx * cx,
        qy * cx + qz * sx,
        qz * cx - qy * sx,
        qw * cx - qx * sx
      );
    }
    const sc = scl[i] * (o.pulse || 1) * (0.15 + 0.85 * portal);
    s.set(sc * (o.stretch || 1), sc, sc * (o.wMul || 1));
    m.compose(p, q, s);
  };

  // Exact arc-length rail-loop walker so every coupled Maglev Sky-Train coach tracks the rail curve seamlessly!
  const composeRailCoach = (i, metersBack) => {
    let idx = laneIdx[i];
    let curL = lanes[idx];
    let curT = Math.max(0, Math.min(1, t[i]));
    const sign = dir[i];
    let rem = metersBack * scl[i];
    for (let guard = 0; guard < 12 && rem > 0.05; guard++) {
      evalLane(curL, curT, tmp);
      const segLen = Math.max(60, tmp.len);
      const distAvail = sign > 0 ? curT * segLen : (1 - curT) * segLen;
      if (rem <= distAvail + 1e-4) {
        curT -= (sign * rem) / segLen;
        rem = 0;
        break;
      }
      rem -= distAvail;
      const prevI = sign > 0 ? curL.prevIdx : curL.nextIdx;
      if (prevI === undefined || prevI < 0) {
        curT = sign > 0 ? 0 : 1;
        break;
      }
      idx = prevI;
      curL = lanes[idx];
      curT = sign > 0 ? 1 : 0;
    }
    curT = Math.max(0, Math.min(1, curT));
    evalLane(curL, curT, tmp);
    const tx = tmp.dx * sign;
    const tz = tmp.dz * sign;
    const nx = -tz;
    const nz = tx;
    const px = tmp.x + nx * latOf[i];
    const pz = tmp.z + nz * latOf[i];
    const py = (laneY(curL, curT) + vOf[i]) * curHeightScale;
    const yaw = Math.atan2(-tz, tx);
    p.set(px, py, pz);
    e.set(0, yaw, 0, 'YXZ');
    q.setFromEuler(e);
    const sc = scl[i];
    s.set(sc, sc, sc);
    m.compose(p, q, s);
  };

  // Animated gimbal-sweeping downward searchlight mounted under Blimp gondolas & Patrol Helicopters
  const composeGimbalBeam = (craftX, craftY, craftZ, craftYaw, craftScale, localX, localY, sweepPan, tiltFromNadir) => {
    const cy = Math.cos(craftYaw), sy = Math.sin(craftYaw);
    p.set(
      craftX + cy * localX * craftScale,
      craftY + localY * craftScale,
      craftZ - sy * localX * craftScale
    );
    // e.z = -(PI - tiltFromNadir) aims the +Y beam cone downward & forward along (craftYaw + sweepPan)
    e.set(0, craftYaw + sweepPan, -(Math.PI - tiltFromNadir), 'YXZ');
    q.setFromEuler(e);
    s.set(craftScale, craftScale, craftScale);
    m.compose(p, q, s);
  };

  let collision = true;
  function applyCollision(n) {
    const capN = Math.min(n, 360);
    const byKey = new Map();
    for (let i = 0; i < capN; i++) {
      const L = lanes[laneIdx[i]];
      const dirBit = dir[i] > 0 ? 1 : 0;
      let arr = byKey.get(L);
      if (!arr) { arr = [[], []]; byKey.set(L, arr); }
      arr[dirBit].push(i);
    }
    for (const [L, pair] of byKey.entries()) {
      const spanLen = Math.max(180, Math.hypot(L.x2 - L.x1, L.z2 - L.z1));
      for (let dBit = 0; dBit < 2; dBit++) {
        const arr = pair[dBit];
        if (arr.length < 2) continue;
        arr.sort((a, b) => (dBit === 1 ? t[a] - t[b] : t[b] - t[a]));
        for (let k = 0; k < arr.length - 1; k++) {
          const follower = arr[k];
          const leader = arr[k + 1];
          const gap = dBit === 1 ? (t[leader] - t[follower]) : (t[follower] - t[leader]);
          const need = (VEHICLE_CLASSES[classOf[follower]].len + VEHICLE_CLASSES[classOf[leader]].len + 18) / spanLen;
          if (gap > 0 && gap < need && spd[follower] > spd[leader] * 0.85) {
            spd[follower] = Math.max(spd[leader] * 0.85, spd[follower] * 0.94);
          } else if (gap > need * 1.45 && spd[follower] < baseSpd[follower]) {
            spd[follower] = Math.min(baseSpd[follower], spd[follower] * 1.03);
          }
        }
      }
    }
  }

  function update(dt, density = 1, heightScale = 1) {
    elapsed += dt;
    curHeightScale = heightScale;
    const dClamped = Math.max(0, density);

    let n = 0;
    let swarmActive = 0;
    if (swarmCap > 0) {
      const targetTotal = Math.min(total + swarmCap, Math.round(320 * dClamped));
      const baseHero = Math.min(total, 220);
      if (dClamped <= 1) {
        n = Math.min(total, Math.round(baseHero * dClamped));
      } else {
        const extraFrac = Math.pow(Math.min(1, (dClamped - 1) / 18), 0.72);
        n = Math.min(total, Math.round(baseHero + (total - baseHero) * extraFrac));
      }
      n = Math.min(n, targetTotal);
      swarmActive = Math.max(0, Math.min(swarmCap, targetTotal - n));
      if (swarmGeo) swarmGeo.instanceCount = swarmActive;
    } else {
      n = Math.max(0, Math.min(total, Math.round(total * dClamped)));
    }
    lastActiveCount = n + swarmActive;

    const active = new Array(nCls).fill(0);
    if (collision && dt > 0) applyCollision(n);
    for (let i = 0; i < n; i++) {
      const cc = classOf[i];
      const V = VEHICLE_CLASSES[cc];
      const L = lanes[laneIdx[i]];
      const ph = phase[i];
      let throttle = cc === 2 ? 1.0 : (1 + 0.10 * Math.sin(elapsed * 0.42 + ph * 1.7));
      // Natural corner braking before & through 90-degree intersection turns
      if (L.kind === 'turn') {
        throttle *= 0.68;
      } else if (L.directed && t[i] > 0.76 && nextLane[i] >= 0 && lanes[nextLane[i]] && lanes[nextLane[i]].kind === 'turn') {
        throttle *= 1.0 - 0.30 * smoothstep(0.76, 1.0, t[i]);
      }
      if (V.hover) {
        const hv = Math.sin(elapsed * 0.31 + ph * 3.1);
        if (hv > 0.84) throttle *= 0.35;
      }
      if (!collision) spd[i] = baseSpd[i];

      evalLane(L, Math.max(0, Math.min(1, t[i])), tmp);
      const worldSpeed = Math.max(36, L.speed) * (0.85 + 0.55 * spd[i]) * throttle;
      t[i] += (worldSpeed * dt * dir[i]) / Math.max(45, tmp.len);

      if (t[i] > 1 || t[i] < 0) {
        if (L.nextIdx !== undefined && L.prevIdx !== undefined) {
          if (t[i] > 1) {
            prevLane[i] = laneIdx[i];
            laneIdx[i] = L.nextIdx;
            nextLane[i] = lanes[laneIdx[i]].nextIdx ?? -1;
            t[i] -= Math.floor(t[i]);
          } else {
            laneIdx[i] = L.prevIdx;
            nextLane[i] = L.nextIdx;
            prevLane[i] = lanes[laneIdx[i]].prevIdx ?? -1;
            t[i] = ((t[i] % 1) + 1) % 1;
          }
        } else if (t[i] > 1 && L.directed && nextLane[i] >= 0) {
          // Step seamlessly onto the connected straight, 90-deg corner turn, or deck-switch segment!
          laps[i]++;
          prevLane[i] = laneIdx[i];
          laneIdx[i] = nextLane[i];
          nextLane[i] = pickOutLane(i, laneIdx[i], laps[i]);
          if ((lanes[laneIdx[i]].nominalLayer || lanes[laneIdx[i]].layer) === 'ground') vOf[i] = 0;
          t[i] -= Math.floor(t[i]);
        } else {
          laps[i]++;
          const wasOver = t[i] > 1;
          assignRoute(i, laps[i]);
          t[i] = dir[i] > 0 ? (wasOver ? t[i] % 1 : 0.002) : (wasOver ? 0.998 : ((t[i] % 1) + 1) % 1);
        }
      }

      const curL = lanes[laneIdx[i]];
      const isDeck0 = (curL.nominalLayer || curL.layer) === 'ground';
      const bob = (isDeck0 || curL.railLoop) ? 0 : Math.sin(elapsed * V.bobF + ph) * V.bobA * (curL.directed ? 0.25 : 0.55);
      const roll = (isDeck0 || curL.railLoop) ? 0 : Math.sin(elapsed * 0.72 + ph) * 0.025;
      const li = local[i];

      composeAt(i, t[i], { bob, roll, smoothDt: dt });
      bodies[cc].setMatrixAt(li, m);
      const craftX = posCur.x, craftY = posCur.y, craftZ = posCur.z;
      const craftYaw = curYaw[i];

      if (beams[cc]) {
        if (cc === 5) {
          // Animated twin Blimp searchlights sweeping independent Lissajous arcs over skyscrapers & streets!
          const pan1 = Math.sin(elapsed * 0.54 + ph) * 0.92;
          const tilt1 = 0.58 + 0.26 * Math.cos(elapsed * 0.39 + ph * 1.6);
          composeGimbalBeam(craftX, craftY, craftZ, craftYaw, scl[i], 20.0, -16.8, pan1, tilt1);
          beams[5].setMatrixAt(li, m);

          const pan2 = Math.cos(elapsed * 0.47 + ph * 2.1 + 1.3) * 0.96;
          const tilt2 = 0.54 + 0.28 * Math.sin(elapsed * 0.33 + ph * 1.3);
          composeGimbalBeam(craftX, craftY, craftZ, craftYaw, scl[i], -3.0, -16.8, pan2, tilt2);
          blimpAftBeams.setMatrixAt(li, m);
        } else if (cc === 4) {
          // Patrol Helicopter sweeping chin searchlight
          const panH = Math.sin(elapsed * 0.88 + ph) * 0.78;
          const tiltH = 0.62 + 0.22 * Math.cos(elapsed * 0.61 + ph * 1.4);
          composeGimbalBeam(craftX, craftY, craftZ, craftYaw, scl[i], 4.2, -1.8, panH, tiltH);
          beams[4].setMatrixAt(li, m);
        } else {
          beams[cc].setMatrixAt(li, m);
        }
      }

      if (cc === 0) {
        composeAt(i, t[i], { bob, roll, pulse: 0.82 + 0.28 * Math.sin(elapsed * 7 + ph) });
        thrusters.setMatrixAt(li, m);
      }
      if (rotors[cc]) {
        spin[i] += dt * V.spinSpeed;
        composeAt(i, t[i], { bob, roll, spinY: spin[i] });
        rotors[cc].setMatrixAt(li, m);
      }
      if (cc === 2) {
        const sp = V.coachSpacing || 24.5;
        composeRailCoach(i, sp * 1);
        trailers[0].setMatrixAt(li, m);
        composeRailCoach(i, sp * 2);
        trailers[1].setMatrixAt(li, m);
        composeRailCoach(i, sp * 3);
        extraCoaches[0].setMatrixAt(li, m);
        composeRailCoach(i, sp * 4);
        extraCoaches[1].setMatrixAt(li, m);
      }
      active[cc]++;

      const trailLag = Math.min(0.024, 9.5 / Math.max(150, tmp.len));
      composeAt(i, t[i] - dir[i] * trailLag, { bob: bob * 0.5, stretch: 2.2, wMul: 0.72 });
      trails.setMatrixAt(i, m);
    }
    for (let cIdx = 0; cIdx < nCls; cIdx++) {
      bodies[cIdx].count = active[cIdx];
      bodies[cIdx].instanceMatrix.needsUpdate = true;
      if (beams[cIdx]) {
        beams[cIdx].count = active[cIdx];
        beams[cIdx].instanceMatrix.needsUpdate = true;
      }
      if (rotors[cIdx]) {
        rotors[cIdx].count = active[cIdx];
        rotors[cIdx].instanceMatrix.needsUpdate = true;
      }
    }
    blimpAftBeams.count = active[5];
    blimpAftBeams.instanceMatrix.needsUpdate = true;
    thrusters.count = active[0];
    thrusters.instanceMatrix.needsUpdate = true;
    for (const tr of trailers) {
      tr.count = active[2];
      tr.instanceMatrix.needsUpdate = true;
    }
    for (const tr of extraCoaches) {
      tr.count = active[2];
      tr.instanceMatrix.needsUpdate = true;
    }
    trails.count = n;
    trails.instanceMatrix.needsUpdate = true;
    beamMat.uniforms.uTime.value = elapsed;
  }

  update(0, 1);

  return {
    group,
    mesh: bodies[0],
    bodies,
    beams,
    blimpSearchlights: blimpAftBeams,
    rotors,
    thrusters,
    trailers,
    extraCoaches,
    trails,
    swarm: swarmMesh,
    swarmGeo,
    capacity: total + swarmCap,
    get activeCount() { return lastActiveCount; },
    update,
    setPalette,
    get collision() { return collision; },
    setCollision(on) { collision = !!on; },
  };
}

/* ------------------------------------------------- searchlights & pools */

/**
 * Animated volumetric searchlight shafts rising from landmarks, venues, and
 * downtown/corridor skyscrapers: Lissajous yaw + tilt sweeps and breathing pulse.
 */
export function makeSearchlights(city, beamMat, count = 34) {
  const group = new THREE.Group();
  const spots = [];
  for (const lm of city.landmarks) {
    spots.push({
      x: lm.x, y: lm.h * 0.88, z: lm.z, r: lm.colorSeed,
      len: 920 + lm.colorSeed * 820, w: 125 + lm.colorSeed * 135,
      tilt: 0.10 + lm.colorSeed * 0.30, fast: 1.15,
    });
  }
  // Venue volumetric shafts: movie-premiere twin scissor-beams, arena rim beams & stadium floodbeams
  for (const pl of city.places || []) {
    if (pl.kind === 'theatre') {
      for (const sx of [-1, 1]) {
        spots.push({
          x: pl.x + sx * pl.r * 0.38, y: 14, z: pl.z + pl.r * 0.48,
          r: (pl.seed + (sx > 0 ? 0.31 : 0.71)) % 1, len: 820, w: 86, tilt: 0.28, fast: 2.2,
        });
      }
    } else if (pl.kind === 'arena' || pl.kind === 'stadium') {
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + pl.rot;
        spots.push({
          x: pl.x + Math.cos(a) * pl.r * 0.82, y: 38, z: pl.z + Math.sin(a) * pl.r * 0.62,
          r: (pl.seed + k * 0.29) % 1, len: 760, w: 98, tilt: 0.20, fast: 1.4,
        });
      }
    }
  }
  // Sample strictly across core & arterial towers (`city.towers`), NOT low-rise suburbs at the tail of `city`!
  const towerLim = Math.max(1, city.towers || city.count);
  const tall = [];
  const scanStep = Math.max(1, Math.floor(towerLim / 180));
  for (let i = 0; i < towerLim; i += scanStep) {
    const top = city.y[i] + city.h[i] / 2;
    if (top > 85) {
      tall.push({ x: city.x[i], y: top, z: city.z[i], r: city.s[i], top });
    }
  }
  tall.sort((a, b) => b.top - a.top);
  const needTowers = Math.max(8, count - spots.length + 6);
  const pickStep = Math.max(1, Math.floor(tall.length / needTowers));
  for (let k = 0; k < tall.length && spots.length < count + 8; k += pickStep) {
    const sp = tall[k];
    spots.push({
      x: sp.x, y: sp.y, z: sp.z, r: sp.r,
      len: 720 + sp.r * 760, w: 96 + sp.r * 115,
      tilt: 0.12 + sp.r * 0.34, fast: 1.0 + sp.r * 0.6,
    });
  }
  const pivots = [];
  const use = spots.slice(0, Math.max(2, count));
  const baseK = beamMat.uniforms && beamMat.uniforms.uBeamK ? beamMat.uniforms.uBeamK.value : 0.22;
  let elapsed = 0;
  for (let k = 0; k < use.length; k++) {
    const sp = use[k];
    const pivot = new THREE.Group();
    pivot.position.set(sp.x, sp.y, sp.z);
    pivot.rotation.y = sp.r * Math.PI * 2;
    const len = sp.len || (750 + sp.r * 750);
    const geo = beamGeometry(len, sp.w || (110 + sp.r * 130));
    const mesh = new THREE.Mesh(geo, beamMat);
    const tilt = sp.tilt ?? (0.10 + sp.r * 0.32);
    mesh.rotation.z = tilt;
    mesh.frustumCulled = false;
    pivot.add(mesh);
    group.add(pivot);
    const fm = sp.fast || 1;
    const dirSign = (k % 2 === 0 ? 1 : -1);
    pivots.push({
      pivot,
      mesh,
      tilt,
      speed: dirSign * (0.14 + sp.r * 0.26) * fm,
      wob: (0.22 + sp.r * 0.34) * fm,
      nod: (0.17 + sp.r * 0.25) * fm,
      phase: sp.r * Math.PI * 2 + k * 0.7,
    });
  }
  function update(dt) {
    elapsed += dt;
    for (const pv of pivots) {
      pv.pivot.rotation.y += pv.speed * dt;
      pv.mesh.rotation.z = pv.tilt + Math.sin(elapsed * pv.wob + pv.phase) * 0.28;
      pv.mesh.rotation.x = Math.cos(elapsed * pv.nod + pv.phase * 1.3) * 0.18;
    }
    // gentle shared intensity pulse — the beams "breathe"
    if (beamMat.uniforms && beamMat.uniforms.uBeamK) {
      beamMat.uniforms.uBeamK.value = baseK * (0.84 + 0.16 * Math.sin(elapsed * 0.55));
    }
  }
  return { group, pivots, update };
}

/** Soft warm light pools lying on the ground under the street lamps. */
export function makeLightPools(city, poolMat) {
  const n = city.lamps.length;
  const geo = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
  const mesh = new THREE.InstancedMesh(geo, poolMat, Math.max(1, n));
  mesh.frustumCulled = false;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const L = city.lamps[i];
    const r = 11 + ((i * 73) % 17) * 0.7;
    p.set(L.x, 2.4, L.z);
    s.set(r, 1, r);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

/* ------------------------------------------------- water, trees, signs */

/**
 * Bodies of water — inner harbor lagoons, meandering S-curve rivers, Great
 * Crater Lakes, and vast Coastal Ocean / Archipelago Seas.
 */
export function buildWater(city, waterMat) {
  const group = new THREE.Group();
  const rings = 6;
  for (const w of city.water) {
    if (w.analytical && w.kind === 'ocean') {
      // Subdivided polar sea sector at y = 0.25m (GROUND_VERT carves smooth beaches, coves & islands)
      const radRings = 44;
      const angSegs = 76;
      const maxR = w.r || 13500;
      const cAng = w.coastAngle ?? 0.7;
      const maxAng = w.maxAng ?? Math.PI * 0.56;
      const ca = Math.cos(cAng);
      const sa = Math.sin(cAng);
      const uMin = w.uStart ?? 240;
      const pos = [];
      const ptAt = (rT, aT) => {
        const rr = 120 + Math.pow(rT, 1.35) * (maxR - 120);
        const ang = cAng - maxAng + aT * (maxAng * 2);
        let x = Math.cos(ang) * rr;
        let z = Math.sin(ang) * rr;
        // Clamp inner chord to u >= uMin so the sea sheet never pokes under inland basins
        const u = x * ca + z * sa;
        const v = -x * sa + z * ca;
        if (u < uMin) {
          x = ca * uMin - sa * v;
          z = sa * uMin + ca * v;
        }
        return [x, 0.25, z];
      };
      for (let ri = 0; ri < radRings; ri++) {
        const r0 = ri / radRings;
        const r1 = (ri + 1) / radRings;
        for (let ai = 0; ai < angSegs; ai++) {
          const a0 = ai / angSegs;
          const a1 = (ai + 1) / angSegs;
          const p00 = ptAt(r0, a0);
          const p10 = ptAt(r0, a1);
          const p01 = ptAt(r1, a0);
          const p11 = ptAt(r1, a1);
          pos.push(
            p00[0], p00[1], p00[2], p10[0], p10[1], p10[2], p01[0], p01[1], p01[2],
            p10[0], p10[1], p10[2], p11[0], p11[1], p11[2], p01[0], p01[1], p01[2]
          );
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, waterMat);
      mesh.frustumCulled = false;
      group.add(mesh);
      continue;
    }

    if (w.analytical && w.kind === 'lake') {
      // Subdivided elliptical Great Crater Lake sheet at y = 0.25m
      const radRings = 24;
      const angSegs = 48;
      const rad = (w.r || 1800) * 1.18;
      const pos = [];
      for (let ri = 0; ri < radRings; ri++) {
        const r0 = (ri / radRings) * rad;
        const r1 = ((ri + 1) / radRings) * rad;
        for (let ai = 0; ai < angSegs; ai++) {
          const a0 = (ai / angSegs) * Math.PI * 2;
          const a1 = ((ai + 1) / angSegs) * Math.PI * 2;
          const ax0 = w.x + Math.cos(a0) * r0, az0 = w.z + Math.sin(a0) * r0 * 1.25;
          const bx0 = w.x + Math.cos(a1) * r0, bz0 = w.z + Math.sin(a1) * r0 * 1.25;
          const ax1 = w.x + Math.cos(a0) * r1, az1 = w.z + Math.sin(a0) * r1 * 1.25;
          const bx1 = w.x + Math.cos(a1) * r1, bz1 = w.z + Math.sin(a1) * r1 * 1.25;
          if (ri === 0) {
            pos.push(ax1, 0.25, az1, bx1, 0.25, bz1, w.x, 0.25, w.z);
          } else {
            pos.push(
              ax1, 0.25, az1, bx1, 0.25, bz1, ax0, 0.25, az0,
              bx1, 0.25, bz1, bx0, 0.25, bz0, ax0, 0.25, az0
            );
          }
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, waterMat);
      mesh.frustumCulled = false;
      group.add(mesh);
      continue;
    }

    if (w.kind === 'river' && w.pts.length >= 4 && w.pts.length % 2 === 0) {
      // Winding river ribbon: quad-strip between leftBank[0..half-1] and rightBank[half-1..0]
      const halfN = w.pts.length / 2;
      const pos = [];
      const wy = 1.6;
      for (let i = 0; i < halfN - 1; i++) {
        const [lx0, lz0] = w.pts[i];
        const [lx1, lz1] = w.pts[i + 1];
        const [rx0, rz0] = w.pts[w.pts.length - 1 - i];
        const [rx1, rz1] = w.pts[w.pts.length - 2 - i];
        const mx0 = (lx0 + rx0) * 0.5, mz0 = (lz0 + rz0) * 0.5;
        const mx1 = (lx1 + rx1) * 0.5, mz1 = (lz1 + rz1) * 0.5;
        pos.push(
          lx0, wy, lz0, mx0, wy, mz0, lx1, wy, lz1,
          mx0, wy, mz0, mx1, wy, mz1, lx1, wy, lz1,
          mx0, wy, mz0, rx0, wy, rz0, mx1, wy, mz1,
          rx0, wy, rz0, rx1, wy, rz1, mx1, wy, mz1
        );
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, waterMat);
      mesh.frustumCulled = false;
      group.add(mesh);
      continue;
    }

    const pos = [];
    for (let i = 0; i < w.pts.length; i++) {
      const [x1, z1] = w.pts[i];
      const [x2, z2] = w.pts[(i + 1) % w.pts.length];
      for (let rIdx = 0; rIdx < rings; rIdx++) {
        const t0 = rIdx / rings;
        const t1 = (rIdx + 1) / rings;
        const ax0 = w.x + (x1 - w.x) * t0, az0 = w.z + (z1 - w.z) * t0;
        const bx0 = w.x + (x2 - w.x) * t0, bz0 = w.z + (z2 - w.z) * t0;
        const ax1 = w.x + (x1 - w.x) * t1, az1 = w.z + (z1 - w.z) * t1;
        const bx1 = w.x + (x2 - w.x) * t1, bz1 = w.z + (z2 - w.z) * t1;
        if (rIdx === 0) {
          pos.push(ax1, 2.2, az1, bx1, 2.2, bz1, w.x, 2.2, w.z);
        } else {
          pos.push(
            ax1, 2.2, az1, bx1, 2.2, bz1, ax0, 2.2, az0,
            bx1, 2.2, bz1, bx0, 2.2, bz0, ax0, 2.2, az0
          );
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, waterMat);
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  return group;
}

/** Diagonal boulevards — non-orthogonal road ribbons slicing across the city. */
export function buildBoulevards(city, U) {
  const group = new THREE.Group();
  const roadMat = makeLandmarkMaterial(U, '#161824');
  const lineMat = makeCurvedBasicMaterial(U, '#ffd28a');
  group.userData.lineMat = lineMat;
  for (const b of city.boulevards || []) {
    const dx = b.x2 - b.x1;
    const dz = b.z2 - b.z1;
    const len = Math.hypot(dx, dz) || 1;
    const ang = Math.atan2(dx, dz);
    const segs = Math.max(24, Math.min(72, Math.ceil(len / 90)));
    const road = new THREE.Mesh(new THREE.BoxGeometry(36, 0.5, len, 1, 1, segs), roadMat);
    road.position.set((b.x1 + b.x2) * 0.5, 0.35, (b.z1 + b.z2) * 0.5);
    road.rotation.y = ang;
    road.frustumCulled = false;
    group.add(road);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.65, len, 1, 1, segs), lineMat);
    stripe.position.set((b.x1 + b.x2) * 0.5, 0.42, (b.z1 + b.z2) * 0.5);
    stripe.rotation.y = ang;
    stripe.frustumCulled = false;
    group.add(stripe);
  }
  return group;
}

/** Illuminated billboards riding tower facades — scrolling procedural content. */
export function buildBillboards(city, billMat) {
  const n = city.bills.length;
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const seeds = new Float32Array(Math.max(1, n));
  const mesh = new THREE.InstancedMesh(geo, billMat, Math.max(1, n));
  mesh.count = n;
  mesh.frustumCulled = false;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < n; i++) {
    const b = city.bills[i];
    p.set(b.x, b.y, b.z);
    q.setFromAxisAngle(yAxis, b.rot || 0);
    s.set(b.w, b.h, b.d);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    seeds[i] = b.seed;
  }
  mesh.instanceMatrix.needsUpdate = true;
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
  return mesh;
}

/** Neon blades, shopfront fascias and rooftop wordmarks — animated glowing signage. */
export function buildSigns(city, billMat) {
  const n = city.signs.length;
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const seeds = new Float32Array(Math.max(1, n));
  const mesh = new THREE.InstancedMesh(geo, billMat, Math.max(1, n));
  mesh.count = n;
  mesh.frustumCulled = false;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < n; i++) {
    const g = city.signs[i];
    p.set(g.x, g.y, g.z);
    q.setFromAxisAngle(yAxis, g.rot || 0);
    s.set(g.w, g.h, g.d);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    seeds[i] = (g.seed + 0.13) % 1;
  }
  mesh.instanceMatrix.needsUpdate = true;
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
  return mesh;
}

/**
 * Giant holographic displays — towering panels, 360-degree cylindrical drums
 * and crossed sky-portals, each fed by volumetric projector cones.
 */
export function buildHolos(city, holoMat, beamMat) {
  const group = new THREE.Group();
  const panels = [];
  const drums = [];
  for (const H of city.holos) {
    if (H.kind === 'cylinder') drums.push(H);
    else if (H.kind === 'portal') {
      panels.push(H);
      panels.push({ ...H, rot: H.rot + Math.PI * 0.5, seed: (H.seed + 0.41) % 1 });
    } else {
      panels.push(H);
    }
    // Volumetric projector beam rising into the hologram + atmospheric spill below
    const beamH = Math.max(H.h * 2.2, H.y - (H.baseY || 40) + H.h * 0.5);
    const cone = new THREE.Mesh(beamGeometry(beamH, H.w * 0.85), beamMat);
    cone.position.set(H.x, H.y + H.h * 0.4, H.z);
    cone.rotation.z = Math.PI;
    cone.frustumCulled = false;
    group.add(cone);
  }

  const yAxis = new THREE.Vector3(0, 1, 0);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();

  if (panels.length) {
    const pGeo = new THREE.BoxGeometry(1, 1, 1);
    const pSeeds = new Float32Array(panels.length);
    const pMesh = new THREE.InstancedMesh(pGeo, holoMat, panels.length);
    pMesh.frustumCulled = false;
    for (let i = 0; i < panels.length; i++) {
      const H = panels[i];
      p.set(H.x, H.y, H.z);
      q.setFromAxisAngle(yAxis, H.rot);
      s.set(H.w, H.h, 2.2);
      m.compose(p, q, s);
      pMesh.setMatrixAt(i, m);
      pSeeds[i] = H.seed;
    }
    pMesh.instanceMatrix.needsUpdate = true;
    pGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(pSeeds, 1));
    group.add(pMesh);
  }

  if (drums.length) {
    const dGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 1, true);
    const dSeeds = new Float32Array(drums.length);
    const dMesh = new THREE.InstancedMesh(dGeo, holoMat, drums.length);
    dMesh.frustumCulled = false;
    for (let i = 0; i < drums.length; i++) {
      const H = drums[i];
      p.set(H.x, H.y, H.z);
      q.setFromAxisAngle(yAxis, H.rot);
      s.set(H.w * 0.72, H.h, H.w * 0.72);
      m.compose(p, q, s);
      dMesh.setMatrixAt(i, m);
      dSeeds[i] = H.seed;
    }
    dMesh.instanceMatrix.needsUpdate = true;
    dGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(dSeeds, 1));
    group.add(dMesh);
  }
  return group;
}

export const TREE_MODE_NAMES = [
  'Auto (Follow Theme)',
  'Real Botanical',
  'Artificial Cyber-Trees',
  'Hybrid Bio-Cyber Grove',
];

function mergeUnitTreeGeometries(geos) {
  let totalVerts = 0;
  const nonIdx = geos.map((g) => {
    const ni = g.index ? g.toNonIndexed() : g;
    totalVerts += ni.getAttribute('position').count;
    return ni;
  });
  const pos = new Float32Array(totalVerts * 3);
  const nrm = new Float32Array(totalVerts * 3);
  let off = 0;
  for (const g of nonIdx) {
    const p = g.getAttribute('position').array;
    const n = g.getAttribute('normal') ? g.getAttribute('normal').array : null;
    pos.set(p, off);
    if (n) nrm.set(n, off);
    off += p.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  return out;
}

function makeBranchSegmentGeo(x0, y0, z0, x1, y1, z1, rBot, rTop, segs = 6) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dz = z1 - z0;
  const len = Math.hypot(dx, dy, dz) || 0.01;
  const g = new THREE.CylinderGeometry(rTop, rBot, len, segs, 1);
  const up = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3(dx / len, dy / len, dz / len);
  const q = new THREE.Quaternion().setFromUnitVectors(up, dir);
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3((x0 + x1) * 0.5, (y0 + y1) * 0.5, (z0 + z1) * 0.5),
    q,
    new THREE.Vector3(1, 1, 1)
  );
  g.applyMatrix4(m);
  return g;
}

/**
 * Procedural Real & Artificial Branching Trees + Custom Node/Lantern Lights +
 * 3D Catenary Canopy Connections (`city.treeLinks`).
 * Supports `setNature(look, treeMode)` where `treeMode` is:
 *   0 = Auto (follows `look.nature === 'cyber'`)
 *   1 = Real Botanical branching trees + festoon park lanterns
 *   2 = Artificial Cyber-Dendritic supertrees + pulsing neural filaments
 *   3 = Hybrid Bio-Cyber Grove (real avenue/suburb trees + cyber park hubs & links)
 */
export function buildTrees(city, U = null) {
  const group = new THREE.Group();
  const organic = new THREE.Group();
  const cyber = new THREE.Group();
  const treeList = city.trees || [];
  const links = city.treeLinks || [];
  const n = Math.max(1, treeList.length);

  const trunkMatO = makeLandmarkMaterial(U || makeUniforms(), '#6b4d32', 1);
  const canopyMatO = makeLandmarkMaterial(U || makeUniforms(), '#3f8f52', 0);
  const walkMatO = makeLandmarkMaterial(U || makeUniforms(), '#8a6845', 2);
  const trunkMatC = makeLandmarkMaterial(U || makeUniforms(), '#191d28', 1);
  const canopyMatC = makeCurvedBasicMaterial(U, '#68e8ff');
  const glowMatC = makeCurvedBasicMaterial(U, '#a8f6ff');

  // --- 1. Procedural Organic Multi-Branch Wood Armature + Clustered Foliage ---
  const woodPartsO = [];
  const leafPartsO = [];
  // Flared root buttresses + subtly leaning lower & upper trunk
  for (let r = 0; r < 3; r++) {
    const a = (r / 3) * Math.PI * 2 + 0.3;
    woodPartsO.push(makeBranchSegmentGeo(Math.cos(a) * 0.085, 0, Math.sin(a) * 0.085, 0, 0.16, 0, 0.055, 0.032, 5));
  }
  woodPartsO.push(makeBranchSegmentGeo(0, 0, 0, 0.015, 0.34, -0.01, 0.085, 0.062, 7));
  woodPartsO.push(makeBranchSegmentGeo(0.015, 0.34, -0.01, 0.0, 0.56, 0.01, 0.062, 0.042, 6));

  // 4 primary angled boughs + 8 forked secondary limbs + 9 leaf sub-crowns at branch tips
  for (let b = 0; b < 4; b++) {
    const a = (b / 4) * Math.PI * 2 + 0.42;
    const forkY = 0.44 + (b % 2) * 0.09;
    const bx = Math.cos(a) * 0.25;
    const by = 0.74 + (b % 2) * 0.06;
    const bz = Math.sin(a) * 0.25;
    woodPartsO.push(makeBranchSegmentGeo(0, forkY, 0, bx, by, bz, 0.040, 0.022, 5));
    for (const sgn of [-1, 1]) {
      const a2 = a + sgn * 0.48;
      const r2 = 0.40 + (sgn > 0 ? 0.04 : 0.0);
      const tx = Math.cos(a2) * r2;
      const ty = by + 0.18 + (sgn > 0 ? 0.04 : 0.0);
      const tz = Math.sin(a2) * r2;
      woodPartsO.push(makeBranchSegmentGeo(bx, by, bz, tx, ty, tz, 0.021, 0.009, 5));
      const puff = new THREE.IcosahedronGeometry(0.21 + (b % 2) * 0.03, 1);
      puff.scale(1.18, 0.78, 1.12);
      puff.translate(tx * 0.96, ty + 0.03, tz * 0.96);
      leafPartsO.push(puff);
    }
  }
  const apexPuff = new THREE.IcosahedronGeometry(0.28, 1);
  apexPuff.scale(1.22, 0.86, 1.22);
  apexPuff.translate(0, 1.04, 0);
  leafPartsO.push(apexPuff);

  const trunkGeoO = mergeUnitTreeGeometries(woodPartsO);
  const canopyGeoO = mergeUnitTreeGeometries(leafPartsO);

  // --- 2. Procedural Artificial / Cyber Dendritic Supertree Armature + Dish Canopy ---
  const woodPartsC = [];
  const dishPartsC = [];
  const haloPartsC = [];
  // Flared metallic base cone + central structural core + 2 lattice collar rings
  woodPartsC.push(makeBranchSegmentGeo(0, 0, 0, 0, 0.22, 0, 0.13, 0.068, 8));
  woodPartsC.push(makeBranchSegmentGeo(0, 0.22, 0, 0, 0.68, 0, 0.068, 0.042, 8));
  for (const cy of [0.34, 0.58]) {
    const collar = new THREE.TorusGeometry(cy < 0.45 ? 0.095 : 0.078, 0.012, 5, 14);
    collar.rotateX(Math.PI / 2);
    collar.translate(0, cy, 0);
    woodPartsC.push(collar);
  }
  // 5 sweeping parabolic architectural boughs + secondary forks + hexagonal canopy collector disks
  for (let b = 0; b < 5; b++) {
    const a = (b / 5) * Math.PI * 2 + 0.2;
    const mx = Math.cos(a) * 0.22;
    const mz = Math.sin(a) * 0.22;
    const tx = Math.cos(a) * 0.46;
    const tz = Math.sin(a) * 0.46;
    const ty = 0.96 + (b % 2) * 0.08;
    woodPartsC.push(makeBranchSegmentGeo(0, 0.52, 0, mx, 0.76, mz, 0.032, 0.020, 6));
    woodPartsC.push(makeBranchSegmentGeo(mx, 0.76, mz, tx, ty, tz, 0.020, 0.011, 5));
    // Inner upward neural tine
    const ix = Math.cos(a + 0.31) * 0.24;
    const iz = Math.sin(a + 0.31) * 0.24;
    woodPartsC.push(makeBranchSegmentGeo(mx, 0.76, mz, ix, 1.10, iz, 0.015, 0.007, 5));

    const dish = new THREE.CylinderGeometry(0.19, 0.12, 0.026, 6);
    dish.translate(tx, ty + 0.015, tz);
    dishPartsC.push(dish);
  }
  const topDish = new THREE.CylinderGeometry(0.30, 0.18, 0.032, 6);
  topDish.translate(0, 1.14, 0);
  dishPartsC.push(topDish);

  const crownHalo = new THREE.TorusGeometry(0.44, 0.015, 6, 24);
  crownHalo.rotateX(Math.PI / 2);
  crownHalo.translate(0, 1.02, 0);
  haloPartsC.push(crownHalo);
  const innerOrb = new THREE.OctahedronGeometry(0.085, 0);
  innerOrb.translate(0, 0.88, 0);
  haloPartsC.push(innerOrb);

  const trunkGeoC = mergeUnitTreeGeometries(woodPartsC);
  const canopyGeoC = mergeUnitTreeGeometries(dishPartsC);
  const glowGeoC = mergeUnitTreeGeometries(haloPartsC);

  const trunkO = new THREE.InstancedMesh(trunkGeoO, trunkMatO, n);
  const canopyO = new THREE.InstancedMesh(canopyGeoO, canopyMatO, n);
  const trunkC = new THREE.InstancedMesh(trunkGeoC, trunkMatC, n);
  const canopyC = new THREE.InstancedMesh(canopyGeoC, canopyMatC, n);
  const glowC = new THREE.InstancedMesh(glowGeoC, glowMatC, n);
  trunkO.count = treeList.length;
  canopyO.count = treeList.length;
  trunkC.count = treeList.length;
  canopyC.count = treeList.length;
  glowC.count = treeList.length;

  // --- 3. Custom Tree Lights: Hanging Park Lanterns (Organic) & Branch Node Lights (Cyber) ---
  const lanternPosO = [];
  const lanternPhaseO = [];
  const lanternSizeO = [];
  const nodePosC = [];
  const nodePhaseC = [];
  const nodeSizeC = [];

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const e = new THREE.Euler();

  for (let i = 0; i < treeList.length; i++) {
    const tr = treeList[i];
    const baseY = tr.y || 0;
    const isHero = tr.role === 'park-hero';
    const isParkish = isHero || tr.role === 'park' || tr.role === 'grove' || tr.role === 'boulevard';
    const spread = tr.h * (isHero ? 1.16 : 0.96);
    const yaw = tr.seed * Math.PI * 2;
    const sway = (tr.seed - 0.5) * 0.08;
    e.set(sway, yaw, sway * 0.7);
    q.setFromEuler(e);

    p.set(tr.x, baseY, tr.z);
    s.set(spread, tr.h, spread);
    m.compose(p, q, s);
    trunkO.setMatrixAt(i, m);
    canopyO.setMatrixAt(i, m);
    trunkC.setMatrixAt(i, m);
    canopyC.setMatrixAt(i, m);
    glowC.setMatrixAt(i, m);

    // Organic suspended bough lanterns in parks, groves & boulevards
    if (isParkish) {
      const lCount = isHero ? 4 : 2;
      for (let l = 0; l < lCount; l++) {
        const la = yaw + 0.42 + l * (Math.PI * 2 / lCount);
        const lr = spread * 0.27;
        lanternPosO.push(
          tr.x + Math.cos(la) * lr,
          baseY + tr.h * (0.58 + (l % 2) * 0.06),
          tr.z + Math.sin(la) * lr
        );
        lanternPhaseO.push((tr.seed + l * 0.27) % 1);
        lanternSizeO.push(isHero ? 3.2 : 2.3);
      }
    }

    // Cyber bioluminescent branch-tip & collar node lights
    const cCount = isHero ? 5 : (isParkish ? 3 : 1);
    for (let c = 0; c < cCount; c++) {
      const ca = yaw + 0.2 + c * ((Math.PI * 2) / 5);
      const cr = c === 0 && !isParkish ? 0 : spread * 0.45;
      const cy = c === 0 && !isParkish ? baseY + tr.h * 1.12 : baseY + tr.h * (0.96 + (c % 2) * 0.08);
      nodePosC.push(tr.x + Math.cos(ca) * cr, cy, tr.z + Math.sin(ca) * cr);
      nodePhaseC.push((tr.seed * 1.7 + c * 0.19) % 1);
      nodeSizeC.push(isHero ? 3.6 : 2.5);
    }
  }

  for (const mesh of [trunkO, canopyO]) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    organic.add(mesh);
  }
  for (const mesh of [trunkC, canopyC, glowC]) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    cyber.add(mesh);
  }

  const uTimeRef = (U && U.uTime) || { value: 0 };
  const uLightRef = (U && U.uLightK) || { value: 1 };
  const uCurveRef = (U && U.uWorldCurve) || { value: 0 };
  const uPlanetRef = (U && U.uPlanetR) || { value: 2100 };

  const lanternMatO = new THREE.ShaderMaterial({
    vertexShader: BEACON_VERT,
    fragmentShader: BEACON_FRAG,
    uniforms: {
      uTime: uTimeRef,
      uLightK: uLightRef,
      uBeaconCol: { value: col('#ffd68a') },
      uSteady: { value: 0.72 },
      uWorldCurve: uCurveRef,
      uPlanetR: uPlanetRef,
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const nodeMatC = new THREE.ShaderMaterial({
    vertexShader: BEACON_VERT,
    fragmentShader: BEACON_FRAG,
    uniforms: {
      uTime: uTimeRef,
      uLightK: uLightRef,
      uBeaconCol: { value: col('#68e8ff') },
      uSteady: { value: 0.25 },
      uWorldCurve: uCurveRef,
      uPlanetR: uPlanetRef,
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const makeLightPts = (posArr, phaseArr, sizeArr, mat) => {
    if (!posArr.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(posArr), 3));
    g.setAttribute('aPhase', new THREE.BufferAttribute(new Float32Array(phaseArr), 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(sizeArr), 1));
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    return pts;
  };
  const lanternPts = makeLightPts(lanternPosO, lanternPhaseO, lanternSizeO, lanternMatO);
  if (lanternPts) organic.add(lanternPts);
  const nodePts = makeLightPts(nodePosC, nodePhaseC, nodeSizeC, nodeMatC);
  if (nodePts) cyber.add(nodePts);

  // --- 4. 3D Catenary Inter-Tree Connections (Festoon Lantern Cables + Skywalks + Neural Filaments) ---
  const linkMatO = new THREE.ShaderMaterial({
    vertexShader: TREE_LINK_VERT,
    fragmentShader: TREE_LINK_FRAG,
    uniforms: {
      uLinkColA: { value: col('#8a6d4b') },
      uLinkColB: { value: col('#ffe09a') },
      uTreeCyber: { value: 0 },
      uTime: uTimeRef,
      uLightK: uLightRef,
      uWorldCurve: uCurveRef,
      uPlanetR: uPlanetRef,
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const linkMatC = new THREE.ShaderMaterial({
    vertexShader: TREE_LINK_VERT,
    fragmentShader: TREE_LINK_FRAG,
    uniforms: {
      uLinkColA: { value: col('#3be8ff') },
      uLinkColB: { value: col('#ff5ec4') },
      uTreeCyber: { value: 1 },
      uTime: uTimeRef,
      uLightK: uLightRef,
      uWorldCurve: uCurveRef,
      uPlanetR: uPlanetRef,
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });

  if (links.length > 0) {
    const segs = 10;
    const posArr = [];
    const uvArr = [];
    const seedArr = [];
    const walkBoxes = [];

    for (let li = 0; li < links.length; li++) {
      const L = links[li];
      const dx = L.x2 - L.x1;
      const dz = L.z2 - L.z1;
      const lenXZ = Math.hypot(dx, dz) || 1;
      const nx = -dz / lenXZ;
      const nz = dx / lenXZ;
      const halfW = L.hero ? 0.55 : 0.34;

      for (let sIdx = 0; sIdx < segs; sIdx++) {
        const t0 = sIdx / segs;
        const t1 = (sIdx + 1) / segs;
        const x0 = L.x1 + dx * t0, z0 = L.z1 + dz * t0;
        const x1 = L.x1 + dx * t1, z1 = L.z1 + dz * t1;
        const y0 = L.y1 + (L.y2 - L.y1) * t0 - 4 * L.sag * t0 * (1 - t0);
        const y1 = L.y1 + (L.y2 - L.y1) * t1 - 4 * L.sag * t1 * (1 - t1);

        // Crossed vertical + horizontal ribbon quads so catenary filaments read from every angle!
        posArr.push(
          x0, y0 - halfW, z0, x1, y1 - halfW, z1, x0, y0 + halfW, z0,
          x1, y1 - halfW, z1, x1, y1 + halfW, z1, x0, y0 + halfW, z0,
          x0 - nx * halfW, y0, z0 - nz * halfW, x1 - nx * halfW, y1, z1 - nz * halfW, x0 + nx * halfW, y0, z0 + nz * halfW,
          x1 - nx * halfW, y1, z1 - nz * halfW, x1 + nx * halfW, y1, z1 + nz * halfW, x0 + nx * halfW, y0, z0 + nz * halfW
        );
        for (let qIdx = 0; qIdx < 2; qIdx++) {
          uvArr.push(
            t0, 0, t1, 0, t0, 1,
            t1, 0, t1, 1, t0, 1
          );
          for (let v = 0; v < 6; v++) seedArr.push(L.seed);
        }
      }

      // Solid suspended canopy skywalk deck between hero park trees!
      if (L.hero && L.dist < 48) {
        walkBoxes.push(makeBranchSegmentGeo(
          L.x1, L.y1 - 0.8, L.z1,
          L.x2, L.y2 - 0.8, L.z2,
          0.65, 0.65, 4
        ));
      }
    }

    const linkGeo = new THREE.BufferGeometry();
    linkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(posArr), 3));
    linkGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvArr), 2));
    linkGeo.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(seedArr), 1));

    const linkMeshO = new THREE.Mesh(linkGeo, linkMatO);
    linkMeshO.frustumCulled = false;
    organic.add(linkMeshO);

    const linkMeshC = new THREE.Mesh(linkGeo, linkMatC);
    linkMeshC.frustumCulled = false;
    cyber.add(linkMeshC);

    if (walkBoxes.length) {
      const walkGeo = mergeUnitTreeGeometries(walkBoxes);
      const walkMesh = new THREE.Mesh(walkGeo, walkMatO);
      walkMesh.frustumCulled = false;
      organic.add(walkMesh);
    }
  }

  cyber.visible = false; // organic until setNature says otherwise
  group.add(organic, cyber);

  let curLook = null;
  let curMode = 0; // 0 auto, 1 real, 2 artificial, 3 hybrid

  function applyVisibilityAndColors() {
    const look = curLook || {};
    const themeCyber = look.nature === 'cyber';
    if (curMode === 1) {
      organic.visible = true;
      cyber.visible = false;
    } else if (curMode === 2) {
      organic.visible = false;
      cyber.visible = true;
    } else if (curMode === 3) {
      organic.visible = true;
      cyber.visible = true;
    } else {
      organic.visible = !themeCyber;
      cyber.visible = themeCyber;
    }

    const t = look.trees || { trunk: '#6b4d32', canopy: '#3f8f52', glow: '#ffd98a' };
    const accentHex = look.accent || '#68e8ff';
    const sig = look.signals || {};
    const warmLamp = sig.lamp || '#ffd98a';

    // Keep Real Botanical trees lush & believable even when forced on a cyber look!
    const orgTrunk = themeCyber && curMode !== 0 ? '#5c432d' : t.trunk;
    const orgCanopy = themeCyber && curMode !== 0 ? '#3b8450' : t.canopy;
    trunkMatO.uniforms.uCol.value.set(orgTrunk);
    canopyMatO.uniforms.uCol.value.set(orgCanopy);
    walkMatO.uniforms.uCol.value.set(orgTrunk).lerp(col(accentHex), 0.25);

    const cybTrunk = !themeCyber && curMode !== 0 ? '#1b202c' : t.trunk;
    const cybGlow = themeCyber ? t.glow : accentHex;
    trunkMatC.uniforms.uCol.value.set(cybTrunk);
    canopyMatC.color.set(cybGlow);
    glowMatC.color.set(cybGlow).lerp(col('#ffffff'), 0.32);

    lanternMatO.uniforms.uBeaconCol.value.set(warmLamp);
    nodeMatC.uniforms.uBeaconCol.value.set(cybGlow);
    linkMatO.uniforms.uLinkColA.value.set(orgTrunk);
    linkMatO.uniforms.uLinkColB.value.set(warmLamp);
    linkMatC.uniforms.uLinkColA.value.set(cybGlow);
    linkMatC.uniforms.uLinkColB.value.set(sig.billA || accentHex);
  }

  function setNature(look, modeOverride) {
    if (look) curLook = look;
    if (modeOverride !== undefined && modeOverride !== null) {
      curMode = Math.max(0, Math.min(3, Number(modeOverride) || 0));
    }
    applyVisibilityAndColors();
  }

  function setTreeMode(mode) {
    curMode = Math.max(0, Math.min(3, Number(mode) || 0));
    applyVisibilityAndColors();
  }

  return { group, organic, cyber, linkCount: links.length, setNature, setTreeMode };
}

/**
 * Weather — downward-falling rain streaks, thunderstorm sheets & lightning,
 * snow, volcanic ash, swirling dust storms, Noir old-film storm, plus 3D
 * ambient dust motes floating in convective air currents around the camera.
 */
export const WEATHER_NAMES = [
  'Clear + motes', 'Rain', 'Thunderstorm', 'Snow', 'Volcanic ash', 'Dust haze', 'Old-film storm',
];

export function makeWeather(U) {
  const group = new THREE.Group();
  const mk = (count, w, h, d, hex, k, speed, sway, windX = 12) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    const off = new Float32Array(count);
    const spd = new Float32Array(count);
    const swy = new Float32Array(count);
    const mat = new THREE.ShaderMaterial({
      vertexShader: WEATHER_VERT,
      fragmentShader: WEATHER_FRAG,
      uniforms: {
        uTime: U.uTime,
        uFallH: { value: 720 },
        uSwayAmp: { value: sway },
        uWindX: { value: windX },
        uWeatherCol: { value: col(hex) },
        uWeatherK: { value: k },
      },
      transparent: true,
      depthWrite: false,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.frustumCulled = false;
    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      m.makeTranslation((Math.random() - 0.5) * 900, 0, (Math.random() - 0.5) * 900);
      mesh.setMatrixAt(i, m);
      off[i] = Math.random() * 720;
      spd[i] = speed * (0.82 + Math.random() * 0.45);
      swy[i] = 0.4 + Math.random() * 1.8;
    }
    mesh.instanceMatrix.needsUpdate = true;
    geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 1));
    geo.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(spd, 1));
    geo.setAttribute('aSway', new THREE.InstancedBufferAttribute(swy, 1));
    mesh.visible = false;
    group.add(mesh);
    return mesh;
  };

  const rain = mk(1600, 0.45, 27, 0.45, '#b6cce6', 0.44, 340, 0.55, 26);
  const snow = mk(900, 1.8, 1.8, 1.8, '#eef4ff', 0.85, 26, 6.5, 16);
  const ash = mk(850, 1.35, 1.35, 1.35, '#d4b494', 0.62, 19, 9.0, 22);

  // Ambient 3D floating dust motes (active even in clear weather, scaled by dustLevel)
  const dustCount = 1100;
  const dPos = new Float32Array(dustCount * 3);
  const dPhase = new Float32Array(dustCount);
  const dSize = new Float32Array(dustCount);
  const dDrift = new Float32Array(dustCount * 3);
  const boxSpan = 620;
  for (let i = 0; i < dustCount; i++) {
    dPos[i * 3 + 0] = (Math.random() - 0.5) * boxSpan;
    dPos[i * 3 + 1] = (Math.random() - 0.35) * 320;
    dPos[i * 3 + 2] = (Math.random() - 0.5) * boxSpan;
    dPhase[i] = Math.random();
    dSize[i] = 1.6 + Math.random() * 3.4;
    dDrift[i * 3 + 0] = (Math.random() - 0.42) * 2.2;
    dDrift[i * 3 + 1] = (Math.random() - 0.45) * 1.1;
    dDrift[i * 3 + 2] = (Math.random() - 0.5) * 2.2;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
  dustGeo.setAttribute('aPhase', new THREE.BufferAttribute(dPhase, 1));
  dustGeo.setAttribute('aSize', new THREE.BufferAttribute(dSize, 1));
  dustGeo.setAttribute('aDrift', new THREE.BufferAttribute(dDrift, 3));
  const dustMat = new THREE.ShaderMaterial({
    vertexShader: DUST_VERT,
    fragmentShader: DUST_FRAG,
    uniforms: {
      uTime: U.uTime,
      uBoxSpan: { value: boxSpan },
      uDustCol: { value: col('#ffe8be') },
      uDustK: { value: 0.42 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  group.add(dust);

  let mode = 0; // 0 clear · 1 rain · 2 storm · 3 snow · 4 ash · 5 dust haze · 6 old-film storm
  let dustLevel = 0.6;
  let nextFlash = 2.5;

  function syncDust() {
    const modeBoost = mode === 5 ? 2.1 : mode === 4 ? 1.45 : mode === 6 ? 1.35 : (mode === 1 || mode === 2 ? 0.55 : 1.0);
    const k = dustLevel * modeBoost * 0.55;
    dustMat.uniforms.uDustK.value = k;
    dust.visible = k > 0.01;
  }

  function setMode(w) {
    mode = Math.max(0, Math.min(6, Math.round(w)));
    rain.visible = mode === 1 || mode === 2 || mode === 6;
    snow.visible = mode === 3;
    ash.visible = mode === 4;
    if (rain.material.uniforms) {
      rain.material.uniforms.uWeatherK.value = mode === 2 ? 0.65 : mode === 6 ? 0.56 : 0.44;
      rain.material.uniforms.uWindX.value = mode === 2 ? 78 : mode === 6 ? 48 : 26;
      rain.rotation.z = mode === 2 ? -0.11 : mode === 6 ? -0.07 : -0.035;
    }
    if (U && U.uWetness) {
      U.uWetness.value = mode === 2 ? 1.0 : mode === 6 ? 0.9 : mode === 1 ? 0.78 : mode === 3 ? 0.25 : 0.0;
    }
    syncDust();
  }

  function setDust(v) {
    dustLevel = Math.max(0, Math.min(2, v));
    syncDust();
  }

  function setTint(look) {
    if (!look) return;
    const s = look.signals || {};
    const lampHex = s.lamp || look.tower?.winA || '#ffe8be';
    dustMat.uniforms.uDustCol.value.set(lampHex);
    if (s.billMono > 0.5) {
      rain.material.uniforms.uWeatherCol.value.set(s.beam || '#dfd5be');
      ash.material.uniforms.uWeatherCol.value.set(s.billA || '#d8ccb4');
    } else {
      rain.material.uniforms.uWeatherCol.value.set('#b6cce6');
      ash.material.uniforms.uWeatherCol.value.set('#d4b494');
    }
  }

  function update(dt, cameraPos) {
    if (cameraPos) group.position.set(cameraPos.x, cameraPos.y - 40, cameraPos.z);
    if (U.uFlash.value > 0) U.uFlash.value = Math.max(0, U.uFlash.value - dt * 1.9);
    if (mode === 2 || mode === 6) {
      nextFlash -= dt;
      if (nextFlash <= 0) {
        U.uFlash.value = mode === 6 ? 0.85 : 1.15;
        nextFlash = 2.2 + Math.random() * 5.5;
      }
    }
  }

  syncDust();
  return {
    group, rain, snow, ash, dust,
    get mode() { return mode; },
    setMode, setDust, setTint, update,
  };
}

/** Light sculptures — glowing rings and light columns at the public spaces. */
export function buildSculptures(city, beaconMat, lampMat) {
  const group = new THREE.Group();
  const ringPos = [];
  const ringPhase = [];
  const ringSize = [];
  const colPos = [];
  const colPhase = [];
  const colSize = [];
  for (const pl of city.places) {
    // hovering ring of lights
    const ringH = 16 + pl.seed * 34;
    const ringR = pl.r * 0.52;
    const nR = 36;
    for (let i = 0; i < nR; i++) {
      const a = (i / nR) * Math.PI * 2;
      ringPos.push(pl.x + Math.cos(a) * ringR, ringH, pl.z + Math.sin(a) * ringR);
      ringPhase.push((i / nR + pl.seed) % 1);
      ringSize.push(2.2 + pl.seed * 1.6);
    }
    // twin light columns
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 10; i++) {
        colPos.push(pl.x + sx * pl.r * 0.7, 5 + i * 6.5, pl.z + pl.r * 0.12 * sx);
        colPhase.push((i * 0.618 + pl.seed) % 1);
        colSize.push(2.4);
      }
    }
  }
  const mk = (pos, phase, size, mat) => {
    if (!pos.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(new Float32Array(phase), 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(size), 1));
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    group.add(pts);
    return pts;
  };
  mk(ringPos, ringPhase, ringSize, beaconMat);
  mk(colPos, colPhase, colSize, lampMat);
  return group;
}

export const CLOUD_TYPE_NAMES = [
  'Cumulus',
  'Thunderheads (Cb)',
  'Stratocumulus deck',
  'High ice cirrus',
  'Multi-layer sky',
  'Low cloud sea',
];

export const MOON_PHASE_STAGES = [
  { max: 0.125, glyph: '🌑', name: 'New Moon' },
  { max: 0.375, glyph: '🌒', name: 'Waxing Crescent' },
  { max: 0.625, glyph: '🌓', name: 'First Quarter' },
  { max: 0.875, glyph: '🌔', name: 'Waxing Gibbous' },
  { max: 1.125, glyph: '🌕', name: 'Full Moon' },
  { max: 1.375, glyph: '🌖', name: 'Waning Gibbous' },
  { max: 1.625, glyph: '🌗', name: 'Third Quarter' },
  { max: 1.875, glyph: '🌘', name: 'Waning Crescent' },
  { max: 2.001, glyph: '🌑', name: 'New Moon' },
];

export function describeMoonPhase(phase = 1.0) {
  const p = ((phase % 2) + 2) % 2;
  for (const s of MOON_PHASE_STAGES) {
    if (p <= s.max) return { phase: p, glyph: s.glyph, name: s.name };
  }
  return { phase: p, glyph: '🌕', name: 'Full Moon' };
}

/**
 * Push a look preset into the uniforms.
 * @returns {{accent:string, post:Object}} bits the UI needs
 */
export function applyLook(U, look, tune = { win: 1, glow: 1, fog: 1 }) {
  const set = (c, hex) => c.set(hex);

  set(U.uZen.value, look.sky.zen);
  set(U.uHor.value, look.sky.hor);
  set(U.uSkySunCol.value, look.sky.sun);
  U.uSunDir.value.set(...look.sky.sunDir).normalize();
  if (U.uSolarDir) U.uSolarDir.value.copy(U.uSunDir.value);
  set(U.uCloudCol.value, look.sky.cloudCol);
  U.uStars.value = look.sky.stars;
  U.uCloud.value = look.sky.cloud;
  U.uHaze.value = look.sky.haze;

  set(U.uFogCol.value, look.fog.color);
  set(U.uSunFogCol.value, look.sky.hor);
  U.uFogDensity.value = look.fog.density * tune.fog;
  U.uFogHeight.value = look.fog.height;
  U.uHazeSun.value = look.sky.haze * 0.85;

  set(U.uSunCol.value, look.light.sun);
  U.uSunK.value = look.light.sunK;
  set(U.uAmb.value, look.light.amb);
  set(U.uAmbG.value, look.light.ambG);
  U.uToon.value = look.light.toon;
  U.uFlat.value = look.light.flat;

  set(U.uBaseA.value, look.tower.baseA);
  set(U.uBaseB.value, look.tower.baseB);
  look.tower.palette.forEach((hex, i) => set(U.uPal.value[i], hex));
  U.uUsePal.value = look.tower.usePalette;
  U.uWinDensity.value = look.tower.winDensity * tune.win;
  U.uWinGlow.value = look.tower.winGlow * tune.glow;
  set(U.uWinA.value, look.tower.winA);
  set(U.uWinB.value, look.tower.winB);
  set(U.uWinC.value, look.tower.winC);
  U.uEdge.value = look.tower.edge;
  set(U.uEdgeCol.value, look.tower.edgeCol);
  U.uBandGlow.value = look.tower.bandGlow;

  set(U.uGStreet.value, look.ground.street);
  set(U.uGBlock.value, look.ground.block);
  set(U.uGLine.value, look.ground.line);
  U.uGLineGlow.value = look.ground.lineGlow;

  // Theme-consistent signage, billboards, holograms, lamps, searchlights & water
  const sig = look.signals || {};
  set(U.uBillA.value, sig.billA || look.accent);
  set(U.uBillB.value, sig.billB || look.tower.edgeCol);
  U.uBillK.value = (sig.billK ?? 1.0) * (tune.glow ?? 1);
  U.uBillMono.value = sig.billMono ?? 0;
  set(U.uBeamCol.value, sig.beam || look.sky.sun);
  set(U.uLampCol.value, sig.lamp || (look.tower.winA === '#000000' ? look.accent : look.tower.winA));
  set(U.uPoolCol.value, sig.pool || (look.tower.winA === '#000000' ? look.accent : look.tower.winA));
  set(U.uBeaconCol.value, sig.beacon || (look.tower.winC === '#000000' ? look.accent : look.tower.winC));
  set(U.uWaterDeep.value, sig.waterDeep || look.sky.zen);
  set(U.uWaterShallow.value, sig.waterShallow || look.sky.hor);
  if (tune.cloudStyle !== undefined) U.uCloudStyle.value = tune.cloudStyle;
  if (tune.cloudType !== undefined && U.uCloudType) U.uCloudType.value = tune.cloudType;

  return { accent: look.accent, post: look.post, grade: look.grade };
}

/**
 * Time of day — a complete 24-hour celestial cycle.
 * - Sun (`uSolarDir`) traces an inclined great-circle sky orbit: rises on the East
 *   horizon at ~06:00, transits high overhead at 12:00, sets in the West at ~18:00,
 *   and travels below the horizon (`y < 0`) through the night.
 * - Moon (`uMoonDir`) traces an inclined lunar great-circle orbit across moonrise,
 *   meridian transit, moonset, and below-horizon phases, coupled with all 8 lunar
 *   phases (`uMoonPhase` 0..1: New -> Waxing Crescent -> First Quarter -> Waxing
 *   Gibbous -> Full -> Waning Gibbous -> Third Quarter -> Waning Crescent -> New).
 * - Stars (`uStarRot`) wheel smoothly across the celestial sphere over 24 hours.
 * - Architectural key light (`uSunDir`) tracks the true Sun by day and hands off
 *   smoothly across twilight to the lunar/nocturnal sky key at night, while keeping
 *   each look's authored palette exact identity at `look.defTime`.
 */
export function applyTime(U, look, hours = 12, tune = { lights: 1, glow: 1 }) {
  const h = ((hours % 24) + 24) % 24;
  if (U.uDayPhase) U.uDayPhase.value = h;

  const model = (hour) => {
    const elevRaw = Math.sin(((hour - 6) / 12) * Math.PI); // +1 noon, 0 at 06/18, -1 midnight
    const elev = Math.max(0, elevRaw);
    const night = smoothstep(0.10, -0.16, elevRaw); // 1 deep night .. 0 day
    const wrapD = (d) => { d = ((d % 24) + 24) % 24; return d > 12 ? 24 - d : d; };
    const dawnW = Math.exp(-Math.pow(wrapD(hour - 6.6) / 1.55, 2)); // cool gold sunrise
    const duskW = Math.exp(-Math.pow(wrapD(hour - 17.9) / 1.7, 2)); // warm sunset
    const warm = clamp01((dawnW * 0.7 + duskW * 1.05) * (1 - night * 0.65));
    // the small hours are the darkest — biased toward ~03:36 pre-dawn
    const dark = smoothstep(-0.35, -0.85, elevRaw);
    const preDawn = Math.exp(-Math.pow(wrapD(hour - 3.6) / 2.8, 2));
    const deep = clamp01(dark * (0.7 + 0.3 * preDawn));
    return { elev, night, warm, deep };
  };
  const cur = model(h);
  const ref = model(look.defTime);

  // Local horizon frame anchored to the look's authored azimuth
  const [ax, , az] = look.sky.sunDir;
  const alen = Math.hypot(ax, az) || 1;
  const baseAz = Math.atan2(az / alen, ax / alen);
  const eastX = Math.cos(baseAz), eastZ = Math.sin(baseAz);
  const southX = -Math.sin(baseAz), southZ = Math.cos(baseAz);

  // 1. True inclined 3D solar great-circle trajectory (rises East 06:00, transits 12:00, sets West 18:00, <0 at night)
  const solarTilt = 0.32; // ~18.3 deg ecliptic zenith offset -> noon elevation cos(0.32) ≈ 0.949
  const solarHa = ((h - 12) / 24) * Math.PI * 2;
  const sEast = -Math.sin(solarHa);
  const sElev = Math.cos(solarHa) * Math.cos(solarTilt) + 0.025;
  const sSouth = Math.cos(solarHa) * Math.sin(solarTilt);
  const solX = eastX * sEast + southX * sSouth;
  const solZ = eastZ * sEast + southZ * sSouth;
  const solarVec = new THREE.Vector3(solX, sElev, solZ).normalize();
  if (U.uSolarDir) U.uSolarDir.value.copy(solarVec);

  // 2. True inclined 3D lunar great-circle trajectory + full 0..2 synodic phase cycle
  //    (0 = New, 0.5 = First Quarter, 1.0 = Full Moon, 1.5 = Third Quarter, 2.0 = New)
  const rawMoonPh = tune.moonph ?? 0.85;
  const moonPhWrap = ((rawMoonPh % 2) + 2) % 2;
  const lunarTilt = -0.38; // ~5 deg orbital inclination relative to solar arc
  const lunarHa = ((h - 24) / 24) * Math.PI * 2 + (moonPhWrap - 1.0) * 0.42;
  const mEast = -Math.sin(lunarHa);
  const mElev = Math.cos(lunarHa) * Math.cos(lunarTilt) + 0.04;
  const mSouth = Math.cos(lunarHa) * Math.sin(lunarTilt);
  const moonX = eastX * mEast + southX * mSouth;
  const moonZ = eastZ * mEast + southZ * mSouth;
  U.uMoonDir.value.set(moonX, mElev, moonZ).normalize();
  const phaseIllum = 0.5 - 0.5 * Math.cos(rawMoonPh * Math.PI); // 0 at New (0, 2), 1 at Full (1.0)
  U.uMoonGlow.value = (tune.moon ?? 1) * (0.20 + cur.night * 1.10 + cur.deep * 0.32) * (0.35 + 0.78 * phaseIllum);
  U.uMoonSize.value = tune.moonsz ?? 1;
  U.uMoonPhase.value = rawMoonPh;

  // 3. Sidereal starfield wheeling smoothly 360 deg over 24 hours
  if (U.uStarRot) U.uStarRot.value = (h / 24) * Math.PI * 2;

  // 4. Scene architectural key light (`uSunDir`): follows true Sun above horizon, hands off smoothly to nocturnal lunar key
  const dayWeight = smoothstep(-0.14, 0.09, solarVec.y);
  const nightAz = baseAz + ((h - 6) / 12) * Math.PI + Math.PI;
  const nightY = Math.max(0.22, Math.min(0.64, U.uMoonDir.value.y > 0.18 ? U.uMoonDir.value.y : 0.28 + cur.deep * 0.14));
  const nightXZ = Math.sqrt(Math.max(0, 1 - nightY * nightY));
  const nightKey = new THREE.Vector3(Math.cos(nightAz) * nightXZ, nightY, Math.sin(nightAz) * nightXZ).normalize();
  U.uSunDir.value.copy(nightKey).lerp(solarVec, dayWeight).normalize();

  // tint DELTA relative to the authored hour — lighting moves with the clock
  // but never crushes the palette
  const tintAt = (k) => {
    const c = new THREE.Color(1, 1, 1);
    c.lerp(new THREE.Color(0.42, 0.48, 0.72), k.night * 0.8);
    c.lerp(new THREE.Color(0.28, 0.36, 0.60), k.deep * 0.35);
    c.lerp(new THREE.Color(1.22, 0.92, 0.72), k.warm * 0.5);
    return c;
  };
  const tC = tintAt(cur);
  const tR = tintAt(ref);
  const ratio = (i) => {
    const a = i === 0 ? tC.r : i === 1 ? tC.g : tC.b;
    const b = i === 0 ? tR.r : i === 1 ? tR.g : tR.b;
    return Math.max(0.5, Math.min(1.85, a / Math.max(b, 0.2)));
  };
  const mixRatio = (target, hex) => {
    target.value.set(hex);
    target.value.r *= ratio(0);
    target.value.g *= ratio(1);
    target.value.b *= ratio(2);
  };

  mixRatio(U.uZen, look.sky.zen);
  mixRatio(U.uHor, look.sky.hor);
  mixRatio(U.uSkySunCol, look.sky.sun);
  mixRatio(U.uSunFogCol, look.sky.hor);
  mixRatio(U.uCloudCol, look.sky.cloudCol);
  mixRatio(U.uFogCol, look.fog.color);
  mixRatio(U.uSunCol, look.light.sun);
  mixRatio(U.uAmb, look.light.amb);
  mixRatio(U.uAmbG, look.light.ambG);

  // relative light levels — identity at defTime
  const sunR = (k) => Math.max(0.12, 0.20 + 0.85 * k.elev + k.warm * 0.5 - k.deep * 0.08);
  U.uSunK.value = (look.light.sunK * sunR(cur)) / sunR(ref);
  const glowR = (k) => 1 + k.night * 1.15 + k.deep * 0.4;
  U.uWinGlow.value = ((look.tower.winGlow * (tune.glow ?? 1)) * glowR(cur)) / glowR(ref);

  // stars: identity at defTime, stronger through the night, deepest pre-dawn
  const starFloor = 0.4 * (1 - clamp01(look.sky.haze));
  const starBoost = cur.night * 0.75 + cur.deep * 0.25;
  const starRef = ref.night * 0.75 + ref.deep * 0.25;
  let stars = look.sky.stars;
  stars += (Math.max(look.sky.stars, starFloor + 0.22 * (1 - clamp01(look.sky.haze))) - stars) * clamp01(starBoost - starRef);
  stars *= 1 - 0.8 * clamp01(starRef - starBoost);
  U.uStars.value = stars;

  // parametric atmosphere & cloud cover / cloud type knobs
  // Ensure even looks authored with `look.sky.cloud === 0` (e.g. Tron / Abstract) can show clouds when user raises cover > 1!
  const baseCloud = Math.max(look.sky.cloud, (tune.clouds ?? 1) > 1.05 ? 0.32 : look.sky.cloud);
  U.uCloud.value = baseCloud * (tune.clouds ?? 1);
  if (tune.cloudType !== undefined && U.uCloudType) U.uCloudType.value = tune.cloudType;
  if (tune.cloudStyle !== undefined) U.uCloudStyle.value = tune.cloudStyle;
  U.uHaze.value = look.sky.haze * (tune.haze ?? 1);
  U.uSunGlow.value = 0.65 * (tune.sun ?? 1) * Math.max(0.08, 0.6 + cur.warm * 0.8 + cur.night * 0.1 - cur.deep * 0.15);
  U.uSat.value = (tune.sat ?? 1) * (1 + cur.warm * 0.12);
  U.uLightK.value = (tune.lights ?? 1) * (0.45 + cur.night * 0.7 + cur.warm * 0.35 + cur.deep * 0.2);
  const sig = look.signals || {};
  U.uBeaconCol.value.set(sig.beacon || (look.tower.winC === '#000000' ? look.accent : look.tower.winC));

  return {
    hour: h,
    elev: cur.elev,
    solarElev: solarVec.y,
    moonElev: U.uMoonDir.value.y,
    moonPhase: moonPhWrap,
    night: cur.night,
    warm: cur.warm,
    deep: cur.deep,
  };
}
