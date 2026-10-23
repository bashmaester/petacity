// Scene construction and look application — no DOM here, so this whole
// layer runs (and is tested) in Node against real three.js.
import * as THREE from '../vendor/three.module.js';
import { generateCity, makeCityCollider, CELL, AVENUE, STREET } from './city.js';
import { hash2i } from './prng.js';
import {
  SKY_VERT, SKY_FRAG, CLOUD_VERT, CLOUD_FRAG,
  GROUND_VERT, GROUND_FRAG, TOWER_VERT, TOWER_FRAG,
  LANDMARK_VERT, LANDMARK_FRAG, SOLID_CURVED_VERT, SOLID_CURVED_FRAG,
  BEACON_VERT, BEACON_FRAG, TRAIL_VERT, TRAIL_FRAG, SWARM_VERT, SWARM_FRAG,
  BEAM_VERT, BEAM_FRAG, POOL_VERT, POOL_FRAG,
  WATER_VERT, WATER_FRAG, BILL_VERT, BILL_FRAG, WEATHER_VERT, WEATHER_FRAG,
  DUST_VERT, DUST_FRAG,
  HOLO_VERT, HOLO_FRAG,
} from './shaders.js';

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
    uWorldCurve: { value: 0 },
    uPlanetR: { value: 2100 },
    uHeightScale: { value: 1 },
    uWetness: { value: 0 },
    uLightK: { value: 1 },
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
      'uCitySpan', 'uSuburbSpan', 'uGroundRadius', 'uWorldCurve', 'uPlanetR',
      'uSunDir', 'uFogCol', 'uSunFogCol', 'uFogDensity', 'uFogHeight', 'uHazeSun', 'uSat',
      'uWetness', 'uPoolCol', 'uBillA', 'uLightK',
    ]),
    transparent: true,
    depthWrite: true,
    side: THREE.DoubleSide,
  });
  const ground = new THREE.Mesh(makeGroundDiscGeometry(13500, 68, 96, 0, false), groundMat);
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
      'uFogCol', 'uSunFogCol', 'uFogDensity', 'uFogHeight', 'uHazeSun', 'uTime', 'uSat',
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
      'uHazeSun', 'uTime', 'uSat', 'uWorldCurve', 'uPlanetR',
    ]),
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
    uniforms: pick(U, ['uTime', 'uHeightScale', 'uLightK', 'uWorldCurve', 'uPlanetR']),
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
        'uFogCol', 'uSunFogCol', 'uFogDensity', 'uFogHeight', 'uHazeSun', 'uTime', 'uSat',
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

/** Grow a city and return { city, mesh, collider } — caller swaps the mesh in the scene. */
export function growCity(seed, radius, towerMat, suburbReach = 1.0) {
  const city = generateCity(seed, radius, suburbReach);
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
      for (let i = 0; i < 14; i++) {
        const a = rnd(i * 3) * Math.PI * 2;
        const rr = r * (0.15 + rnd(i * 3 + 1) * 0.72);
        const th = 9 + rnd(i * 3 + 2) * 14;
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.1, th, 6), secondaryMat);
        trunk.position.set(Math.cos(a) * rr, th / 2, Math.sin(a) * rr);
        m.add(trunk);
        const crown = new THREE.Mesh(new THREE.SphereGeometry(2.8 + rnd(i) * 2.2, 10, 8), i % 3 === 0 ? trimMat : galleryMat);
        crown.position.set(Math.cos(a) * rr, th + 1.6, Math.sin(a) * rr);
        m.add(crown);
      }
      // Botanical geodesic conservatory dome at heart of park
      const dome = new THREE.Mesh(new THREE.SphereGeometry(r * 0.24, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), galleryMat);
      dome.position.y = 2.0;
      m.add(dome);
      for (let i = 0; i < 5; i++) {
        const slab = new THREE.Mesh(new THREE.BoxGeometry(r * 0.52, 0.9, 4.5), primaryMat);
        const a = i * 1.35 + seed * 6;
        slab.position.set(Math.cos(a) * r * 0.35, 1.9, Math.sin(a) * r * 0.35);
        slab.rotation.y = a * 1.7;
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
    for (let i = 0; i < n; i++) {
      cols[i * 3] = pt.c[0];
      cols[i * 3 + 1] = pt.c[1];
      cols[i * 3 + 2] = pt.c[2];
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    built.push(g);
    total += n;
  }
  const pos = new Float32Array(total * 3);
  const nrm = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  let off = 0;
  for (const g of built) {
    const n = g.getAttribute('position').count;
    pos.set(g.getAttribute('position').array, off * 3);
    nrm.set(g.getAttribute('normal').array, off * 3);
    col.set(g.getAttribute('color').array, off * 3);
    off += n;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

/**
 * Fake-volumetric shaft: two crossed quads along +Y with soft falloff
 * attributes (aBeamT 0→1 along the beam, aBeamW 0→1 across it).
 */
function beamGeometry(length, width) {
  const hw = width / 2;
  const pos = [];
  const bt = [];
  const bw = [];
  const quad = (corners) => {
    // corners: [p0, p1, p2, p3] ccw; t0/t1 along, w at each corner
    const idx = [0, 1, 2, 0, 2, 3];
    for (const k of idx) {
      pos.push(...corners[k].p);
      bt.push(corners[k].t);
      bw.push(corners[k].w);
    }
  };
  // quad A: spans z (width)
  quad([
    { p: [0, 0, -hw], t: 0, w: 0 },
    { p: [0, 0, hw], t: 0, w: 1 },
    { p: [0, length, hw], t: 1, w: 1 },
    { p: [0, length, -hw], t: 1, w: 0 },
  ]);
  // quad B: spans x (width)
  quad([
    { p: [-hw, 0, 0], t: 0, w: 0 },
    { p: [hw, 0, 0], t: 0, w: 1 },
    { p: [hw, length, 0], t: 1, w: 1 },
    { p: [-hw, length, 0], t: 1, w: 0 },
  ]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('aBeamT', new THREE.BufferAttribute(new Float32Array(bt), 1));
  g.setAttribute('aBeamW', new THREE.BufferAttribute(new Float32Array(bw), 1));
  return g;
}

// vehicle part colours (multiplied by per-instance tint)
const HULL = [1, 1, 1];
const HULL2 = [0.72, 0.75, 0.82];
const GLASS = [0.14, 0.17, 0.23];
const TRIM = [0.52, 0.55, 0.65];
const HEAD = [1, 0.97, 0.82];
const TAIL = [1, 0.16, 0.12];
const GLOW = [0.32, 0.7, 1];

const VEHICLE_CLASSES = [
  {
    name: 'pod', len: 22, layers: ['air-low', 'air-mid', 'ground'], parts: podParts, beam: true, thruster: true,
    beamLen: 26, beamW: 5.5, spd: 0.0062, spdJit: 0.0007, scale: 0.85,
    bobA: 0.9, bobF: 1.35, weaveA: 12, weaveF: 1.1, spinSpeed: 8,
  },
  {
    name: 'skimmer', len: 26, layers: ['air-mid', 'air-high'], parts: skimmerParts, beam: true, rotor: rotorParts,
    beamLen: 30, beamW: 7, spd: 0.0052, spdJit: 0.0006, scale: 0.9,
    bobA: 1.5, bobF: 1.05, weaveA: 13, weaveF: 0.9, spinSpeed: 8,
  },
  {
    name: 'hauler', len: 46, layers: ['ground', 'air-low'], parts: haulerParts, beam: true, trailers: 2,
    beamLen: 40, beamW: 9, spd: 0.0022, spdJit: 0.0003, scale: 0.92,
    bobA: 0.3, bobF: 0.8, weaveA: 2.5, weaveF: 0.5, trailerLag: 0.016,
  },
  {
    name: 'drone', len: 8, layers: ['air-low', 'air-mid'], parts: droneParts, beam: false, rotor: droneRotorParts,
    beamLen: 12, beamW: 3, spd: 0.0092, spdJit: 0.0015, scale: 1,
    bobA: 1.5, bobF: 2.4, weaveA: 22, weaveF: 2.1, spinSpeed: 22, hover: true,
  },
  {
    name: 'heli', len: 18, layers: ['air-mid', 'air-low'], parts: heliParts, beam: true, rotor: heliRotorParts,
    beamLen: 36, beamW: 8.5, spd: 0.0038, spdJit: 0.0005, scale: 1,
    bobA: 1.1, bobF: 0.9, weaveA: 8, weaveF: 0.7, spinSpeed: 14, hover: true,
  },
  {
    name: 'blimp', len: 110, layers: ['blimp'], parts: blimpParts, beam: true,
    beamLen: 85, beamW: 20, spd: 0.0010, spdJit: 0.00018, scale: 1,
    bobA: 6.5, bobF: 0.22, weaveA: 34, weaveF: 0.18,
  },
  {
    name: 'shuttle', len: 34, layers: ['air-low', 'air-mid', 'ground'], parts: shuttleParts, beam: true,
    beamLen: 34, beamW: 7.5, spd: 0.0034, spdJit: 0.0004, scale: 0.95,
    bobA: 0.55, bobF: 0.72, weaveA: 5, weaveF: 0.45,
  },
  {
    name: 'spinner', len: 20, layers: ['air-low', 'air-mid', 'air-high'], parts: spinnerParts, beam: true,
    beamLen: 32, beamW: 6, spd: 0.0076, spdJit: 0.001, scale: 0.88,
    bobA: 1.1, bobF: 1.6, weaveA: 17, weaveF: 1.45,
  },
];

/** Sleek pod — the common commuter. ~22 m, hover-bobbing. */
function podParts() {
  return [
    { w: 22, h: 1.6, d: 4.2, y: -0.5, c: HULL2 },
    { w: 18, h: 1.4, d: 3.6, y: 0.7, c: HULL },
    { w: 6.5, h: 1.2, d: 2.8, x: 12.8, y: 0.3, c: HULL },
    { w: 5, h: 1.2, d: 2.6, x: 8, y: 1.55, c: GLASS },
    { w: 7, h: 1.3, d: 2.8, x: 1, y: 1.95, c: GLASS },
    { w: 10, h: 0.6, d: 1.2, x: -4, y: 1.9, c: TRIM },
    { w: 6, h: 1, d: 0.9, x: 3, y: 0.4, z: 2.35, c: TRIM },
    { w: 6, h: 1, d: 0.9, x: 3, y: 0.4, z: -2.35, c: TRIM },
    { w: 7, h: 0.35, d: 1.5, x: -7, y: 0.7, z: 2.6, c: TRIM, rz: 0.1 },
    { w: 7, h: 0.35, d: 1.5, x: -7, y: 0.7, z: -2.6, c: TRIM, rz: -0.1 },
    { w: 4, h: 1.6, d: 0.3, x: -8, y: 1.7, c: TRIM },
    { w: 1.2, h: 0.7, d: 0.9, x: 16, y: 0.15, z: 1.3, c: HEAD },
    { w: 1.2, h: 0.7, d: 0.9, x: 16, y: 0.15, z: -1.3, c: HEAD },
    { w: 0.7, h: 0.5, d: 0.7, x: 15.6, y: 0.3, z: 2.3, c: HEAD },
    { w: 0.7, h: 0.5, d: 0.7, x: 15.6, y: 0.3, z: -2.3, c: HEAD },
    { w: 0.9, h: 0.7, d: 3, x: -11.1, y: 0.15, c: TAIL },
    { w: 0.7, h: 0.7, d: 0.7, x: -10.9, y: 0.4, z: 1.6, c: TAIL },
    { w: 0.7, h: 0.7, d: 0.7, x: -10.9, y: 0.4, z: -1.6, c: TAIL },
    { w: 15, h: 0.22, d: 3, x: -1, y: -1.32, c: GLOW },
    { w: 0.25, h: 1.4, d: 0.25, x: -3, y: 2.9, c: TRIM },
  ];
}

/** Flat skimmer — the fast courier. ~26 m, spinning rotor ring. */
function skimmerParts() {
  return [
    { w: 26, h: 1.6, d: 6.4, y: 0, c: HULL },
    { w: 14, h: 1.2, d: 4.6, x: -4, y: 1.3, c: HULL2 },
    { w: 7, h: 1.1, d: 3.4, x: 12, y: 0.25, c: HULL },
    { w: 5.5, h: 1.1, d: 2.4, x: 7.5, y: 1.35, c: GLASS },
    { w: 5, h: 1.2, d: 2.4, x: 1, y: 1.7, c: GLASS },
    { w: 7, h: 0.28, d: 2.6, x: -2, y: 0.15, z: 4.3, c: TRIM, rz: 0.08 },
    { w: 7, h: 0.28, d: 2.6, x: -2, y: 0.15, z: -4.3, c: TRIM, rz: -0.08 },
    { w: 5, h: 1.2, d: 1.6, x: -8, y: 0.3, z: 3.2, c: TRIM },
    { w: 5, h: 1.2, d: 1.6, x: -8, y: 0.3, z: -3.2, c: TRIM },
    { w: 1, h: 0.8, d: 1.2, x: -10.7, y: 0.3, z: 3.2, c: GLOW },
    { w: 1, h: 0.8, d: 1.2, x: -10.7, y: 0.3, z: -3.2, c: GLOW },
    { w: 1.6, h: 0.7, d: 1.6, x: -1, y: 2.6, c: TRIM },
    { w: 0.6, h: 0.6, d: 0.6, x: -2, y: 0.35, z: 5.6, c: HEAD },
    { w: 0.6, h: 0.6, d: 0.6, x: -2, y: 0.35, z: -5.6, c: TAIL },
    { w: 1, h: 0.55, d: 0.9, x: 13.2, y: 0.15, z: 2.1, c: HEAD },
    { w: 1, h: 0.55, d: 0.9, x: 13.2, y: 0.15, z: -2.1, c: HEAD },
    { w: 0.8, h: 0.6, d: 3.6, x: -13.2, y: 0.2, c: TAIL },
    { w: 18, h: 0.2, d: 4.4, x: -1, y: -1.05, c: GLOW },
  ];
}

/** Heavy hauler — the freight backbone. ~88 m, articulated trailers. */
function haulerParts() {
  return [
    { w: 88, h: 1.4, d: 8, y: -1.6, c: HULL2 },
    { w: 86, h: 4.2, d: 8.6, y: 0.6, c: HULL },
    { w: 80, h: 1.2, d: 0.5, y: -1, z: 4.5, c: TRIM },
    { w: 80, h: 1.2, d: 0.5, y: -1, z: -4.5, c: TRIM },
    { w: 12, h: 4.6, d: 8, x: 41, y: 3.6, c: TRIM },
    { w: 3.5, h: 1.6, d: 6.4, x: 46, y: 5, c: GLASS },
    { w: 1.2, h: 1.4, d: 8.4, x: 47, y: 1.6, c: HULL2 },
    { w: 1, h: 5, d: 1, x: 33, y: 6, z: 3.4, c: TRIM },
    { w: 1, h: 5, d: 1, x: 33, y: 6, z: -3.4, c: TRIM },
    { w: 22, h: 4.4, d: 8, x: -26, y: 5, c: TRIM },
    { w: 22, h: 0.5, d: 8.4, x: -26, y: 3.6, c: HULL2 },
    { w: 22, h: 0.5, d: 8.4, x: -26, y: 6.3, c: HULL2 },
    { w: 22, h: 4.4, d: 8, x: -2, y: 5, c: HULL },
    { w: 22, h: 0.5, d: 8.4, x: -2, y: 3.6, c: TRIM },
    { w: 22, h: 0.5, d: 8.4, x: -2, y: 6.3, c: TRIM },
    { w: 22, h: 4.4, d: 8, x: 22, y: 5, c: TRIM },
    { w: 22, h: 0.5, d: 8.4, x: 22, y: 3.6, c: HULL2 },
    { w: 22, h: 0.5, d: 8.4, x: 22, y: 6.3, c: HULL2 },
    { w: 1.4, h: 0.8, d: 1.4, x: 41, y: 6.7, c: HEAD },
    { w: 1.2, h: 1, d: 1.2, x: 45, y: 1.4, z: 3.2, c: HEAD },
    { w: 1.2, h: 1, d: 1.2, x: 45, y: 1.4, z: -3.2, c: HEAD },
    { w: 0.6, h: 0.6, d: 0.6, x: 44, y: 1.2, z: 4, c: HEAD },
    { w: 0.6, h: 0.6, d: 0.6, x: 44, y: 1.2, z: -4, c: HEAD },
    { w: 1, h: 1, d: 2, x: -43.5, y: 1.6, z: 3.2, c: TAIL },
    { w: 1, h: 1, d: 2, x: -43.5, y: 1.6, z: -3.2, c: TAIL },
    { w: 3, h: 0.6, d: 3, x: 34, y: -2.4, z: 3, c: HULL2 },
    { w: 3, h: 0.6, d: 3, x: 34, y: -2.4, z: -3, c: HULL2 },
    { w: 3, h: 0.6, d: 3, x: -34, y: -2.4, z: 3, c: HULL2 },
    { w: 3, h: 0.6, d: 3, x: -34, y: -2.4, z: -3, c: HULL2 },
    { w: 78, h: 0.28, d: 0.35, x: -2, y: 2.4, z: 4.45, c: GLOW },
    { w: 78, h: 0.28, d: 0.35, x: -2, y: 2.4, z: -4.45, c: GLOW },
  ];
}

/** One articulated trailer section behind a hauler (~22 m). */
function trailerParts() {
  return [
    { w: 22, h: 4.2, d: 7.6, y: 0.5, c: TRIM },
    { w: 22, h: 0.5, d: 8, y: -0.9, c: HULL2 },
    { w: 22, h: 0.5, d: 8, y: 1.9, c: HULL2 },
    { w: 20, h: 1, d: 0.4, y: -1, z: 3.9, c: HULL2 },
    { w: 20, h: 1, d: 0.4, y: -1, z: -3.9, c: HULL2 },
    { w: 3, h: 1.2, d: 3, x: 11.5, y: 0.2, c: HULL2 },
    { w: 0.8, h: 0.7, d: 1, x: -11.2, y: 0.6, z: 3, c: TAIL },
    { w: 0.8, h: 0.7, d: 1, x: -11.2, y: 0.6, z: -3, c: TAIL },
    { w: 18, h: 0.22, d: 0.3, y: 2.2, z: 3.85, c: GLOW },
    { w: 18, h: 0.22, d: 0.3, y: 2.2, z: -3.85, c: GLOW },
  ];
}

/** Pulsing thruster block at a pod's tail. */
function thrusterParts() {
  return [
    { w: 1.7, h: 1, d: 2.8, x: -11.8, y: 0.15, c: GLOW },
  ];
}

/** Crossed rotor blades on a skimmer's mast — spun about the yaw axis. */
function rotorParts() {
  return [
    { w: 9, h: 0.22, d: 0.9, x: -1, y: 3, c: TRIM },
    { w: 0.9, h: 0.22, d: 9, x: -1, y: 3, c: TRIM },
    { w: 1.2, h: 0.5, d: 1.2, x: -1, y: 3, c: HEAD },
  ];
}

/** Tiny courier drone — quad arms, spinning blades, running lights. */
function droneParts() {
  return [
    { w: 4.2, h: 1.3, d: 3.4, y: 0, c: HULL, sphere: true, seg: 10 },
    { w: 2.2, h: 0.9, d: 1.8, x: 1.6, y: 0.35, c: GLASS },
    { w: 6.4, h: 0.28, d: 0.5, y: 0.15, c: TRIM, ry: 0.78 },
    { w: 6.4, h: 0.28, d: 0.5, y: 0.15, c: TRIM, ry: -0.78 },
    { w: 0.7, h: 0.55, d: 0.7, x: 2.4, y: 0, z: 0.9, c: HEAD },
    { w: 0.7, h: 0.55, d: 0.7, x: 2.4, y: 0, z: -0.9, c: HEAD },
    { w: 0.6, h: 0.6, d: 0.6, x: -2.1, y: 0.15, c: TAIL },
    { w: 2.6, h: 0.18, d: 1.8, y: -0.85, c: GLOW },
  ];
}

/** Helicopter — ellipsoid hull, tail boom, skids, big rotor. */
function heliParts() {
  return [
    { w: 11, h: 3.6, d: 3.8, y: 0, c: HULL, sphere: true, seg: 12 },
    { w: 5.2, h: 2.2, d: 3, x: 3.4, y: 0.75, c: GLASS, sphere: true, seg: 10 },
    { w: 8, h: 0.7, d: 0.7, x: -8.5, y: 0.9, c: HULL2 },
    { w: 0.5, h: 2.6, d: 1.7, x: -11.8, y: 1.7, c: TRIM },
    { w: 2.2, h: 0.9, d: 0.35, x: -11.5, y: 2.9, c: TAIL },
    { w: 0.55, h: 0.55, d: 5.6, x: 1, y: -2.3, z: 2, c: TRIM },
    { w: 0.55, h: 0.55, d: 5.6, x: 1, y: -2.3, z: -2, c: TRIM },
    { w: 1.1, h: 1.3, d: 1.1, x: 0, y: 2.4, c: TRIM },
    { w: 0.8, h: 0.6, d: 0.8, x: 5.6, y: 0.2, z: 1.1, c: HEAD },
    { w: 0.8, h: 0.6, d: 0.8, x: 5.6, y: 0.2, z: -1.1, c: HEAD },
    { w: 0.7, h: 0.7, d: 0.7, x: -6, y: 0.4, z: 1.5, c: TAIL },
    { w: 7, h: 0.2, d: 2.6, y: -1.6, c: GLOW },
  ];
}

function heliRotorParts() {
  return [
    { w: 26, h: 0.32, d: 1.3, y: 3.2, c: TRIM },
    { w: 1.3, h: 0.32, d: 26, y: 3.2, c: TRIM },
    { w: 1.7, h: 0.7, d: 1.7, y: 3.2, c: HEAD },
  ];
}

function droneRotorParts() {
  return [
    { w: 7.2, h: 0.18, d: 0.55, y: 0.85, c: TRIM },
    { w: 0.55, h: 0.18, d: 7.2, y: 0.85, c: TRIM },
    { w: 0.8, h: 0.35, d: 0.8, y: 0.85, c: HEAD },
  ];
}

/** Blimp — the slow giant of the high lanes. ~110 m. */
function blimpParts() {
  return [
    { w: 110, h: 28, d: 28, c: HULL, sphere: true, seg: 14 },
    { w: 26, h: 22, d: 22, x: -42, c: HULL2, sphere: true, seg: 10 },
    { w: 24, h: 6, d: 6, x: 8, y: -13, c: TRIM },
    { w: 8, h: 5, d: 4.4, x: 14, y: -15.2, c: GLASS },
    { w: 2, h: 16, d: 22, x: -50, y: 4, c: TRIM },
    { w: 2, h: 20, d: 2.4, x: -50, y: 2, c: TRIM },
    { w: 22, h: 1.6, d: 1.6, y: 10, c: TRIM },
    { w: 1.6, h: 1.6, d: 1.6, x: 54, y: 2, c: HEAD },
    { w: 1.6, h: 1.6, d: 1.6, x: -56, y: 8, c: TAIL },
    { w: 1.1, h: 7, d: 1.1, x: 20, y: 16, c: TRIM },
    { w: 84, h: 1, d: 1, y: -8, z: 13.2, c: GLOW },
    { w: 84, h: 1, d: 1, y: -8, z: -13.2, c: GLOW },
    { w: 6, h: 4, d: 4, x: -8, y: -13.5, c: HULL2 },
    { w: 6, h: 4, d: 4, x: 28, y: -13.5, c: HULL2 },
  ];
}

/** Long streamlined transit shuttle / sky-tram with lit passenger windows. */
function shuttleParts() {
  const parts = [
    { w: 34, h: 3.4, d: 5.4, y: 0.2, c: HULL },
    { w: 28, h: 1.2, d: 4.4, y: 2.3, c: HULL2 },
    { w: 6, h: 2.6, d: 4.6, x: 18.2, y: -0.1, c: HULL, sphere: true, seg: 10 },
    { w: 4.5, h: 1.5, d: 3.8, x: 18.8, y: 0.8, c: GLASS },
    { w: 5, h: 2.8, d: 0.5, x: -15, y: 3.2, c: TRIM },
    { w: 26, h: 0.28, d: 3.8, y: -1.65, c: GLOW },
    { w: 1.2, h: 0.8, d: 1.1, x: 20.6, y: -0.4, z: 1.6, c: HEAD },
    { w: 1.2, h: 0.8, d: 1.1, x: 20.6, y: -0.4, z: -1.6, c: HEAD },
    { w: 0.9, h: 0.9, d: 4.4, x: -17.1, y: 0.2, c: TAIL },
  ];
  for (let w = -11; w <= 11; w += 4.4) {
    parts.push({ w: 2.6, h: 1.1, d: 5.6, x: w, y: 0.7, c: HEAD });
  }
  return parts;
}

/** Asymmetric twin-prong spinner interceptor with vectored thruster pods. */
function spinnerParts() {
  return [
    { w: 13, h: 1.8, d: 4.6, x: -2, y: 0.2, c: HULL },
    { w: 6.5, h: 1.7, d: 3.2, x: 1.5, y: 1.35, c: GLASS, sphere: true, seg: 10 },
    { w: 11, h: 1.1, d: 1.35, x: 6.5, y: 0.0, z: 2.1, c: HULL2 },
    { w: 11, h: 1.1, d: 1.35, x: 6.5, y: 0.0, z: -2.1, c: HULL2 },
    { w: 5.5, h: 1.5, d: 1.8, x: -6.5, y: 0.3, z: 3.2, c: TRIM },
    { w: 5.5, h: 1.5, d: 1.8, x: -6.5, y: 0.3, z: -3.2, c: TRIM },
    { w: 1.4, h: 1.0, d: 1.3, x: -9.5, y: 0.3, z: 3.2, c: GLOW },
    { w: 1.4, h: 1.0, d: 1.3, x: -9.5, y: 0.3, z: -3.2, c: GLOW },
    { w: 1.1, h: 0.65, d: 0.9, x: 12.1, y: 0.0, z: 2.1, c: HEAD },
    { w: 1.1, h: 0.65, d: 0.9, x: 12.1, y: 0.0, z: -2.1, c: HEAD },
    { w: 0.8, h: 0.7, d: 3.6, x: -8.6, y: 0.4, c: TAIL },
    { w: 9, h: 0.22, d: 2.8, x: -1, y: -0.9, c: GLOW },
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

  // Weighted non-periodic class assignment; guarantee all 8 classes appear when total >= 16
  const weights = [0.22, 0.16, 0.11, 0.16, 0.09, 0.04, 0.10, 0.12];
  const classOf = new Int32Array(total);
  const local = new Int32Array(total);
  const classCount = new Array(nCls).fill(0);
  for (let i = 0; i < total; i++) {
    let cc = 0;
    if (i === 0) cc = 0; // instance 0 is always a pod so veh.mesh[0] is active
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
  const bodyMat = makeCurvedBasicMaterial(curveU, '#ffffff', { vertexColors: true });
  const beamMat = new THREE.ShaderMaterial({
    vertexShader: BEAM_VERT,
    fragmentShader: BEAM_FRAG,
    uniforms: {
      uBeamCol: { value: col('#fff3d8') },
      uBeamK: { value: 0.52 },
      uTime: { value: 0 },
      uLightK: { value: 1 },
      uWorldCurve: (curveU && curveU.uWorldCurve) || { value: 0 },
      uPlanetR: (curveU && curveU.uPlanetR) || { value: 2100 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });

  // Store integer indices into `lanes` so ring-loop & street-intersection `L.outs` handoffs stay O(1) & exact!
  const allIndices = lanes.map((_, idx) => idx);
  const lanePoolIdx = VEHICLE_CLASSES.map((V) => {
    const pool = [];
    for (let idx = 0; idx < lanes.length; idx++) {
      const L = lanes[idx];
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
      const bgeo = beamGeometry(V.beamLen, V.beamW).rotateZ(-Math.PI / 2);
      const first = V.parts().reduce((mx, pt) => Math.max(mx, (pt.x || 0) + (pt.w || 0) / 2), 0);
      bgeo.translate(first + 1.5, 0, 0);
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

  const thrusters = new THREE.InstancedMesh(mergeParts(thrusterParts()), bodyMat, Math.max(1, classCount[0]));
  thrusters.frustumCulled = false;
  group.add(thrusters);
  const trailerGeo = mergeParts(trailerParts());
  const trailers = [0, 1].map(() => {
    const tr = new THREE.InstancedMesh(trailerGeo, bodyMat, Math.max(1, classCount[2]));
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
          const turnR = (g1 % 4 === 0 && g2 % 4 === 0) ? 33.0 : 25.0;
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
    const pool = lanePoolIdx[classOf[i]];
    const V = VEHICLE_CLASSES[classOf[i]];
    laneIdx[i] = pool[Math.floor(h01(i + lap * 997, 23) * pool.length) % pool.length];
    const L = lanes[laneIdx[i]];
    prevLane[i] = L.prevIdx !== undefined ? L.prevIdx : -1;
    if (L.directed) {
      dir[i] = 1;
      nextLane[i] = pickOutLane(i, laneIdx[i], lap);
      // Tight lateral & vertical trim so street-grid handoffs across turns & ramps stay 100% seamless
      latOf[i] = (h01(i, 41) - 0.5) * 1.6;
      const isDeck0 = (L.nominalLayer || L.layer) === 'ground';
      vOf[i] = isDeck0 ? 0 : (h01(i, 43) - 0.5) * 2.2;
    } else {
      dir[i] = h01(i + lap * 613, 31) < 0.5 ? 1 : -1;
      nextLane[i] = dir[i] > 0 && L.nextIdx !== undefined ? L.nextIdx : (dir[i] < 0 && L.prevIdx !== undefined ? L.prevIdx : -1);
      const sideSpread = L.layer === 'ground' ? 2.0 : 5.5;
      latOf[i] = dir[i] * sideSpread * 0.5 + (h01(i + lap * 317, 41) - 0.5) * sideSpread;
      vOf[i] = L.layer === 'ground' ? 0 : (h01(i + lap * 419, 43) - 0.5) * 4.5;
    }
    baseSpd[i] = V.spd * (0.74 + h01(i + lap * 733, 53) * 0.62);
    spd[i] = baseSpd[i];
  };

  function setPalette(lookOrCols) {
    const isLook = lookOrCols && !Array.isArray(lookOrCols);
    const pal = isLook
      ? (lookOrCols.signals && lookOrCols.signals.vehicles) || VEHICLE_COLORS
      : (Array.isArray(lookOrCols) && lookOrCols.length ? lookOrCols : VEHICLE_COLORS);
    const mono = isLook && lookOrCols.signals && lookOrCols.signals.billMono > 0.5;
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
      if (cc === 2) for (const tr of trailers) tr.setColorAt(local[i], c);
      aColor[i * 3] = c.r;
      aColor[i * 3 + 1] = c.g;
      aColor[i * 3 + 2] = c.b;
    }
    for (const b of bodies) if (b.instanceColor) b.instanceColor.needsUpdate = true;
    for (const r of rotors) if (r && r.instanceColor) r.instanceColor.needsUpdate = true;
    if (thrusters.instanceColor) thrusters.instanceColor.needsUpdate = true;
    for (const tr of trailers) if (tr.instanceColor) tr.instanceColor.needsUpdate = true;
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

  // Smooth C1 position + true 3D velocity-aligned yaw/pitch + curvature-driven aerodynamic banking
  const composeAt = (i, tVal, o = {}) => {
    const L = lanes[laneIdx[i]];
    samplePos3(i, tVal, elapsed, o.bob || 0, posCur);
    const dtLook = 0.05;
    const worldSpdEst = Math.max(36, L.speed) * (0.85 + 0.55 * spd[i]);
    const dParam = (worldSpdEst * dtLook * dir[i]) / Math.max(45, posCur.len);
    samplePos3(i, tVal - dParam, elapsed - dtLook, o.bob || 0, posPrev);
    samplePos3(i, tVal + dParam, elapsed + dtLook, o.bob || 0, posNext);

    const vx = posNext.x - posPrev.x;
    const vy = posNext.y - posPrev.y;
    const vz = posNext.z - posPrev.z;
    const hLen = Math.hypot(vx, vz) || 1e-4;
    const yaw = Math.atan2(-vz, vx) + (o.sway || 0);
    const pitch = posCur.isGround ? 0 : Math.max(-0.42, Math.min(0.42, Math.atan2(vy, hLen)));

    // Aerodynamic banking proportional to horizontal turn curvature
    const v1x = posCur.x - posPrev.x, v1z = posCur.z - posPrev.z;
    const v2x = posNext.x - posCur.x, v2z = posNext.z - posCur.z;
    const l1 = Math.hypot(v1x, v1z) || 1, l2 = Math.hypot(v2x, v2z) || 1;
    const turnCross = (v1x * v2z - v1z * v2x) / (l1 * l2);
    const curveBank = posCur.isGround ? 0 : Math.max(-0.42, Math.min(0.42, -turnCross * 6.5));
    const bank = curveBank + (o.roll || 0);

    const portal = posCur.closed
      ? 1
      : smoothstep(0, 0.035, posCur.tt) * smoothstep(1, 0.965, posCur.tt);

    p.set(posCur.x, posCur.y, posCur.z);
    // Note: in YXZ Euler order, e.y rotates yaw around world Y, then e.z pitches nose (+X) up/down,
    // and we compose roll around local +X via quaternion multiplication so forward (+X) NEVER skews!
    e.set(0, yaw + (o.spinY || 0), pitch, 'YXZ');
    q.setFromEuler(e);
    if (bank !== 0) {
      const hb = bank * 0.5;
      const sx = Math.sin(hb), cx = Math.cos(hb);
      // Post-multiply q * quatX(bank) -> rolls strictly around local forward +X axis!
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
      let throttle = 1 + 0.14 * Math.sin(elapsed * 0.42 + ph * 1.7);
      if (V.hover) {
        const hv = Math.sin(elapsed * 0.31 + ph * 3.1);
        if (hv > 0.82) throttle *= 0.28;
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
      const bob = isDeck0 ? 0 : Math.sin(elapsed * V.bobF + ph) * V.bobA * (curL.directed ? 0.28 : 0.65);
      const roll = isDeck0 ? 0 : Math.sin(elapsed * 0.75 + ph) * 0.03;
      const li = local[i];

      composeAt(i, t[i], { bob, roll });
      bodies[cc].setMatrixAt(li, m);
      if (beams[cc]) beams[cc].setMatrixAt(li, m);

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
        const lag = Math.min(0.06, 22 / Math.max(180, tmp.len));
        composeAt(i, t[i] - dir[i] * lag, { bob: bob * 0.7, roll: roll * 0.6, sway: Math.sin(elapsed * 0.8 + ph) * 0.035 });
        trailers[0].setMatrixAt(li, m);
        composeAt(i, t[i] - dir[i] * lag * 2, { bob: bob * 0.55, roll: roll * 0.4, sway: Math.sin(elapsed * 0.8 + ph - 0.7) * 0.06 });
        trailers[1].setMatrixAt(li, m);
      }
      active[cc]++;

      const trailLag = Math.min(0.025, 10 / Math.max(150, tmp.len));
      composeAt(i, t[i] - dir[i] * trailLag, { bob: bob * 0.5, stretch: 2.4, wMul: 0.75 });
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
    thrusters.count = active[0];
    thrusters.instanceMatrix.needsUpdate = true;
    for (const tr of trailers) tr.count = active[2];
    for (const tr of trailers) tr.instanceMatrix.needsUpdate = true;
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
    rotors,
    thrusters,
    trailers,
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
 * Animated volumetric searchlight shafts rising from landmarks and the
 * tallest towers: slow yaw sweeps, breathing tilt oscillation and a gentle
 * shared intensity pulse.
 */
export function makeSearchlights(city, beamMat, count = 20) {
  const group = new THREE.Group();
  const spots = [];
  for (const lm of city.landmarks) {
    spots.push({ x: lm.x, y: lm.h * 0.86, z: lm.z, r: lm.colorSeed, len: 850 + lm.colorSeed * 800, w: 120 + lm.colorSeed * 130, tilt: 0.06 + lm.colorSeed * 0.28 });
  }
  // Venue volumetric shafts: movie-premiere twin searchlights, arena rim beams & stadium floodbeams
  for (const pl of city.places || []) {
    if (pl.kind === 'theatre') {
      for (const sx of [-1, 1]) {
        spots.push({
          x: pl.x + sx * pl.r * 0.38, y: 14, z: pl.z + pl.r * 0.48,
          r: (pl.seed + (sx > 0 ? 0.31 : 0.71)) % 1, len: 780, w: 82, tilt: 0.24, fast: 2.1,
        });
      }
    } else if (pl.kind === 'arena' || pl.kind === 'stadium') {
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + pl.rot;
        spots.push({
          x: pl.x + Math.cos(a) * pl.r * 0.82, y: 38, z: pl.z + Math.sin(a) * pl.r * 0.62,
          r: (pl.seed + k * 0.29) % 1, len: 720, w: 96, tilt: 0.16, fast: 1.3,
        });
      }
    }
  }
  const step = Math.max(11, Math.floor(city.count / 24));
  for (let i = 0; i < city.count && spots.length < count + 8; i += step) {
    const top = city.y[i] + city.h[i] / 2;
    if (top > 180) spots.push({ x: city.x[i], y: top, z: city.z[i], r: city.s[i] });
  }
  const pivots = [];
  const use = spots.slice(0, Math.max(2, count));
  const baseK = beamMat.uniforms && beamMat.uniforms.uBeamK ? beamMat.uniforms.uBeamK.value : 0.16;
  let elapsed = 0;
  for (let k = 0; k < use.length; k++) {
    const sp = use[k];
    const pivot = new THREE.Group();
    pivot.position.set(sp.x, sp.y, sp.z);
    pivot.rotation.y = sp.r * Math.PI * 2;
    const len = sp.len || (750 + sp.r * 750);
    const geo = beamGeometry(len, sp.w || (110 + sp.r * 130));
    const mesh = new THREE.Mesh(geo, beamMat);
    const tilt = sp.tilt ?? (0.04 + sp.r * 0.3);
    mesh.rotation.z = tilt;
    mesh.frustumCulled = false;
    pivot.add(mesh);
    group.add(pivot);
    const fm = sp.fast || 1;
    pivots.push({
      pivot,
      mesh,
      tilt,
      speed: (sp.r - 0.48) * 0.22 * fm,
      wob: (0.14 + sp.r * 0.24) * fm,
      phase: sp.r * Math.PI * 2,
    });
  }
  function update(dt) {
    elapsed += dt;
    for (const pv of pivots) {
      pv.pivot.rotation.y += pv.speed * dt;
      pv.mesh.rotation.z = pv.tilt + Math.sin(elapsed * pv.wob + pv.phase) * 0.22;
    }
    // gentle shared intensity pulse — the beams "breathe"
    if (beamMat.uniforms && beamMat.uniforms.uBeamK) {
      beamMat.uniforms.uBeamK.value = baseK * (0.82 + 0.18 * Math.sin(elapsed * 0.5));
    }
  }
  return { group, update };
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

/** Bodies of water — irregular polygon lakes with radial rings for spherical bending. */
export function buildWater(city, waterMat) {
  const group = new THREE.Group();
  const rings = 6;
  for (const w of city.water) {
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

/**
 * Trees — organic trees in some looks, sybernetic bioelectric illuminators
 * in others. Both variants are built; setNature(look) switches and re-tints.
 */
export function buildTrees(city, U = null) {
  const group = new THREE.Group();
  const organic = new THREE.Group();
  const cyber = new THREE.Group();
  const n = Math.max(1, city.trees.length);

  const trunkMatO = makeCurvedBasicMaterial(U, '#7a5a3a');
  const canopyMatO = makeCurvedBasicMaterial(U, '#4a9c5d');
  const trunkMatC = makeCurvedBasicMaterial(U, '#141210');
  const canopyMatC = makeCurvedBasicMaterial(U, '#e8d9b0');
  const glowMatC = makeCurvedBasicMaterial(U, '#e8d9b0');

  const trunkGeo = new THREE.CylinderGeometry(0.55, 1, 1, 6);
  const canopyGeo = new THREE.SphereGeometry(0.5, 8, 6);
  const trunkO = new THREE.InstancedMesh(trunkGeo, trunkMatO, n);
  const canopyO = new THREE.InstancedMesh(canopyGeo, canopyMatO, n);
  const trunkC = new THREE.InstancedMesh(trunkGeo, trunkMatC, n);
  const canopyC = new THREE.InstancedMesh(canopyGeo, canopyMatC, n);
  const glowC = new THREE.InstancedMesh(canopyGeo, glowMatC, n);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  for (let i = 0; i < city.trees.length; i++) {
    const tr = city.trees[i];
    const sway = (tr.seed - 0.5) * 0.12;
    q.setFromEuler(new THREE.Euler(sway, tr.seed * 6.28, sway * 0.7));
    // trunk
    p.set(tr.x, tr.h * 0.5, tr.z);
    s.set(1.1, tr.h, 1.1);
    m.compose(p, q, s);
    trunkO.setMatrixAt(i, m);
    trunkC.setMatrixAt(i, m);
    // organic canopy — layered blob
    p.set(tr.x, tr.h * 1.12, tr.z);
    s.set(tr.h * 1.05, tr.h * 1.15, tr.h * 1.05);
    m.compose(p, q, s);
    canopyO.setMatrixAt(i, m);
    // cyber canopy — slim glowing filament column + halo orb
    p.set(tr.x, tr.h * 1.25, tr.z);
    s.set(tr.h * 0.22, tr.h * 1.5, tr.h * 0.22);
    m.compose(p, q, s);
    canopyC.setMatrixAt(i, m);
    p.set(tr.x, tr.h * 1.95, tr.z);
    s.set(tr.h * 0.34, tr.h * 0.34, tr.h * 0.34);
    m.compose(p, q, s);
    glowC.setMatrixAt(i, m);
  }
  for (const mesh of [trunkO, canopyO, trunkC, canopyC, glowC]) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    organic.add(mesh);
  }
  // regroup: cyber pieces belong to cyber
  organic.remove(trunkC, canopyC, glowC);
  cyber.add(trunkC, canopyC, glowC);
  cyber.visible = false; // organic until setNature says otherwise
  group.add(organic, cyber);

  function setNature(look) {
    const isCyber = look.nature === 'cyber';
    organic.visible = !isCyber;
    cyber.visible = isCyber;
    const t = look.trees || { trunk: '#7a5a3a', canopy: '#4a9c5d', glow: '#ffd98a' };
    trunkMatO.color.set(isCyber ? t.trunk : t.trunk);
    canopyMatO.color.set(t.canopy);
    trunkMatC.color.set(t.trunk);
    canopyMatC.color.set(t.glow);
    glowMatC.color.set(t.glow);
  }
  return { group, organic, cyber, setNature };
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
