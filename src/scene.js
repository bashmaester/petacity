// Scene construction and look application — no DOM here, so this whole
// layer runs (and is tested) in Node against real three.js.
import * as THREE from '../vendor/three.module.js';
import { generateCity, CELL, AVENUE, STREET } from './city.js';
import {
  SKY_VERT, SKY_FRAG, GROUND_VERT, GROUND_FRAG, TOWER_VERT, TOWER_FRAG,
  LANDMARK_VERT, LANDMARK_FRAG, BEACON_VERT, BEACON_FRAG, TRAIL_VERT, TRAIL_FRAG,
  BEAM_VERT, BEAM_FRAG, POOL_VERT, POOL_FRAG,
} from './shaders.js';

export const col = (hex) => new THREE.Color(hex);

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
    uCloud: { value: 0.3 },
    uHaze: { value: 0.5 },
    uGStreet: { value: col('#0c0713') },
    uGBlock: { value: col('#170e22') },
    uGLine: { value: col('#ff386e') },
    uGLineGlow: { value: 0.8 },
    uCell: { value: CELL },
    uAve: { value: AVENUE },
    uSt: { value: STREET },
    uLightK: { value: 1 },
    uBeaconCol: { value: col('#ff3b30') },
    uSunGlow: { value: 0.65 },
    uSat: { value: 1 },
    uSteady: { value: 0 },
    uBeamCol: { value: col('#bcd9ff') },
    uBeamK: { value: 0.16 },
    uPoolCol: { value: col('#ffc27a') },
    uPoolK: { value: 0.5 },
  };
}

const pick = (U, names) => {
  const o = {};
  for (const n of names) o[n] = U[n];
  return o;
};

/** Sky dome, ground grid and the instanced tower material + meshes. */
export function makeWorld(U) {
  // The sky dome must fully contain the ground plane (half-diagonal ~17k),
  // or its square corners stick out past the horizon — the "square world" bug.
  const skyMat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    uniforms: pick(U, ['uZen', 'uHor', 'uSkySunCol', 'uSunDir', 'uCloudCol', 'uStars', 'uCloud', 'uHaze', 'uTime', 'uSunGlow', 'uSat']),
    side: THREE.BackSide,
    depthWrite: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(20000, 48, 24), skyMat);
  sky.frustumCulled = false;

  const groundMat = new THREE.ShaderMaterial({
    vertexShader: GROUND_VERT,
    fragmentShader: GROUND_FRAG,
    uniforms: pick(U, [
      'uGStreet', 'uGBlock', 'uGLine', 'uGLineGlow', 'uCell', 'uAve', 'uSt',
      'uSunDir', 'uFogCol', 'uSunFogCol', 'uFogDensity', 'uFogHeight', 'uHazeSun', 'uSat',
    ]),
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(24000, 24000).rotateX(-Math.PI / 2), groundMat);
  ground.frustumCulled = false;

  const towerMat = new THREE.ShaderMaterial({
    vertexShader: TOWER_VERT,
    fragmentShader: TOWER_FRAG,
    uniforms: pick(U, [
      'uSunDir', 'uSunCol', 'uSunK', 'uAmb', 'uAmbG', 'uBaseA', 'uBaseB',
      'uPal', 'uUsePal', 'uWinDensity', 'uWinGlow', 'uWinA', 'uWinB', 'uWinC',
      'uEdge', 'uEdgeCol', 'uBandGlow', 'uToon', 'uFlat',
      'uFogCol', 'uSunFogCol', 'uFogDensity', 'uFogHeight', 'uHazeSun', 'uTime', 'uSat',
    ]),
  });

  const beaconMat = new THREE.ShaderMaterial({
    vertexShader: BEACON_VERT,
    fragmentShader: BEACON_FRAG,
    uniforms: pick(U, ['uTime', 'uLightK', 'uBeaconCol', 'uSteady']),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  // street lamps: same glow, steady instead of pulsing, warm colour
  const lampMat = new THREE.ShaderMaterial({
    vertexShader: BEACON_VERT,
    fragmentShader: BEACON_FRAG,
    uniforms: {
      uTime: U.uTime,
      uLightK: U.uLightK,
      uBeaconCol: { value: col('#ffd9a0') },
      uSteady: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const trailMat = new THREE.ShaderMaterial({
    vertexShader: TRAIL_VERT,
    fragmentShader: TRAIL_FRAG,
    uniforms: pick(U, ['uLightK']),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });

  // fake-volumetric searchlight shafts
  const beamMat = new THREE.ShaderMaterial({
    vertexShader: BEAM_VERT,
    fragmentShader: BEAM_FRAG,
    uniforms: pick(U, ['uBeamCol', 'uBeamK', 'uTime', 'uLightK']),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });

  // warm pools of lamp light on the ground
  const poolMat = new THREE.ShaderMaterial({
    vertexShader: POOL_VERT,
    fragmentShader: POOL_FRAG,
    uniforms: pick(U, ['uPoolCol', 'uPoolK', 'uLightK']),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  return { sky, skyMat, ground, groundMat, towerMat, beaconMat, lampMat, trailMat, beamMat, poolMat };
}

/** One landmark material — shared look vocabulary with the towers. */
export function makeLandmarkMaterial(U, hex) {
  return new THREE.ShaderMaterial({
    vertexShader: LANDMARK_VERT,
    fragmentShader: LANDMARK_FRAG,
    uniforms: {
      uCol: { value: col(hex) },
      ...pick(U, [
        'uSunDir', 'uSunCol', 'uSunK', 'uAmb', 'uAmbG', 'uWinDensity', 'uWinGlow',
        'uWinA', 'uWinB', 'uEdge', 'uEdgeCol',
        'uFogCol', 'uSunFogCol', 'uFogDensity', 'uFogHeight', 'uHazeSun', 'uTime', 'uSat',
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
  for (let i = 0; i < city.count; i++) {
    p.set(city.x[i], city.y[i], city.z[i]);
    s.set(city.w[i], city.h[i], city.d[i]);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
  }
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

/** Grow a city and return { city, mesh } — caller swaps the mesh in the scene. */
export function growCity(seed, radius, towerMat) {
  const city = generateCity(seed, radius);
  return { city, mesh: buildCityMesh(city, towerMat) };
}

/* -------------------------------------------------------------- landmarks */

/**
 * Build the named landmark (POI) geometry group from city.landmarks.
 * Each kind is a monumental composition: primary mass + strange companions
 * (tilted rings, floating slabs, buttresses, skybridges, orbiting halos).
 */
export function buildLandmarks(city, U) {
  const group = new THREE.Group();
  const mats = new Map();
  const mat = (hex) => {
    if (!mats.has(hex)) mats.set(hex, makeLandmarkMaterial(U, hex));
    return mats.get(hex);
  };
  const towerHexes = ['#3c4d66', '#4a3d63', '#2f4457', '#54425c', '#37485e', '#443a58'];
  const accentHex = '#6a5a86';

  for (const lm of city.landmarks) {
    const hex = towerHexes[Math.floor(lm.colorSeed * towerHexes.length) % towerHexes.length];
    const m = new THREE.Group();
    m.position.set(lm.x, 0, lm.z);
    m.rotation.y = lm.rot;
    const { kind, r, h } = lm;

    if (kind === 'arch') {
      const legH = h * 0.52;
      for (const sx of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(r * 0.4, legH, r * 0.58), mat(hex));
        leg.position.set(sx * r, legH / 2, 0);
        m.add(leg);
        // buttress pylons leaning into the legs
        const but = new THREE.Mesh(new THREE.BoxGeometry(r * 0.22, legH * 0.72, r * 0.9), mat(hex));
        but.position.set(sx * r * 1.42, legH * 0.36, 0);
        but.rotation.z = sx * -0.12;
        m.add(but);
      }
      const arc = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.15, 8, 22, Math.PI), mat(hex));
      arc.position.y = legH;
      m.add(arc);
      // second, larger halo arc — strange, slightly rotated
      const halo = new THREE.Mesh(new THREE.TorusGeometry(r * 1.32, r * 0.05, 6, 26, Math.PI * 0.86), mat(accentHex));
      halo.position.y = legH * 0.92;
      halo.rotation.z = 0.22;
      halo.rotation.y = 0.35;
      m.add(halo);
      const deck = new THREE.Mesh(new THREE.BoxGeometry(r * 2.15, r * 0.1, r * 0.34), mat(hex));
      deck.position.y = legH + r * 0.02;
      m.add(deck);
      // floating keystone slab above the arc
      const key = new THREE.Mesh(new THREE.BoxGeometry(r * 0.5, r * 0.16, r * 0.5), mat(accentHex));
      key.position.y = legH + r * 1.42;
      key.rotation.set(0.18, 0.5, 0.1);
      m.add(key);
    } else if (kind === 'spire') {
      const segs = 3;
      let y = 0;
      for (let i = 0; i < segs; i++) {
        const segH = (h * 0.72) / segs;
        const rb = r * (1 - (i / segs) * 0.55);
        const rt = r * (1 - ((i + 1) / segs) * 0.55);
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, segH, 12), mat(hex));
        seg.position.y = y + segH / 2;
        m.add(seg);
        y += segH;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(rb * 1.35, rb * 0.14, 6, 18), mat(accentHex));
        ring.rotation.x = Math.PI / 2 + (i % 2 ? 0.16 : -0.12);
        ring.position.y = y;
        m.add(ring);
      }
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.1, r * 0.16, h * 0.3, 8), mat(hex));
      mast.position.y = y + h * 0.15;
      m.add(mast);
      // giant tilted halo orbiting the spire
      const orb = new THREE.Mesh(new THREE.TorusGeometry(r * 3.1, r * 0.12, 6, 40), mat(accentHex));
      orb.position.y = h * 0.58;
      orb.rotation.set(Math.PI / 2 - 0.42, 0.5, 0.28);
      m.add(orb);
      // cantilevered observation slabs
      for (let i = 0; i < 3; i++) {
        const slab = new THREE.Mesh(new THREE.BoxGeometry(r * 2.6, r * 0.22, r * 0.8), mat(hex));
        const a = i * 2.1 + lm.colorSeed * 6.0;
        slab.position.set(Math.cos(a) * r * 1.6, h * (0.34 + i * 0.14), Math.sin(a) * r * 1.6);
        slab.rotation.y = -a;
        m.add(slab);
      }
    } else if (kind === 'dome') {
      const podium = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.08, h * 0.45, 18), mat(hex));
      podium.position.y = h * 0.225;
      m.add(podium);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(r * 0.92, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(hex));
      dome.position.y = h * 0.45;
      m.add(dome);
      const finial = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.8, h * 0.22, 6), mat(hex));
      finial.position.y = h * 0.45 + r * 0.92 + h * 0.11;
      m.add(finial);
      // ring of radial buttress fins
      const fins = 8;
      for (let i = 0; i < fins; i++) {
        const a = (i / fins) * Math.PI * 2;
        const fin = new THREE.Mesh(new THREE.BoxGeometry(r * 0.14, h * 0.42, r * 0.62), mat(hex));
        fin.position.set(Math.cos(a) * r * 1.18, h * 0.21, Math.sin(a) * r * 1.18);
        fin.rotation.y = -a;
        m.add(fin);
      }
      // hovering halo ring
      const halo = new THREE.Mesh(new THREE.TorusGeometry(r * 1.5, r * 0.07, 6, 36), mat(accentHex));
      halo.position.y = h * 0.45 + r * 1.05;
      halo.rotation.x = Math.PI / 2 - 0.12;
      m.add(halo);
    } else if (kind === 'mast') {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.5, r * 1.1, h, 10), mat(hex));
      shaft.position.y = h / 2;
      m.add(shaft);
      for (const t of [0.35, 0.62, 0.86]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r * (2.4 - t * 1.4), r * 0.3, 6, 16), mat(hex));
        ring.rotation.x = Math.PI / 2;
        ring.position.y = h * t;
        m.add(ring);
      }
      const bar = new THREE.Mesh(new THREE.BoxGeometry(r * 5.2, r * 0.35, r * 0.35), mat(hex));
      bar.position.y = h * 0.97;
      m.add(bar);
      // cross booms + floating spheres
      for (let i = 0; i < 3; i++) {
        const a = i * 2.2 + lm.colorSeed * 5.0;
        const boom = new THREE.Mesh(new THREE.BoxGeometry(r * 7.5, r * 0.28, r * 0.28), mat(hex));
        boom.position.y = h * (0.42 + i * 0.17);
        boom.rotation.y = a;
        m.add(boom);
        const ball = new THREE.Mesh(new THREE.SphereGeometry(r * 0.62, 10, 8), mat(accentHex));
        ball.position.set(Math.cos(a) * r * 3.4, h * (0.42 + i * 0.17), Math.sin(a) * r * 3.4);
        m.add(ball);
      }
    } else if (kind === 'crown') {
      const tiers = 5;
      for (let i = 0; i < tiers; i++) {
        const w = r * 2 * (1 - (i / tiers) * 0.52);
        const th = (h * 0.62) / tiers;
        const tier = new THREE.Mesh(new THREE.BoxGeometry(w, th, w), mat(hex));
        tier.position.y = (i + 0.5) * th;
        // alternate tiers cantilever sideways — majestic, slightly wrong
        tier.position.x = ((i % 2) ? 1 : -1) * r * 0.22 * i * 0.45;
        tier.rotation.y = i * 0.16;
        m.add(tier);
      }
      const top = new THREE.Mesh(new THREE.BoxGeometry(r * 0.9, h * 0.34, r * 0.9), mat(hex));
      top.position.y = h * 0.62 + h * 0.17;
      m.add(top);
      // tilted crown halo
      const halo = new THREE.Mesh(new THREE.TorusGeometry(r * 1.75, r * 0.09, 6, 34), mat(accentHex));
      halo.position.y = h * 0.82;
      halo.rotation.x = Math.PI / 2 - 0.35;
      m.add(halo);
    } else { // needle
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.4, r * 0.95, h * 0.78, 10), mat(hex));
      shaft.position.y = h * 0.39;
      m.add(shaft);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(r * 1.35, 14, 10), mat(hex));
      bulb.position.y = h * 0.82;
      m.add(bulb);
      const spike = new THREE.Mesh(new THREE.CylinderGeometry(0.4, r * 0.32, h * 0.26, 8), mat(hex));
      spike.position.y = h * 0.78 + h * 0.13;
      m.add(spike);
      // twin ghost needles + skybridges
      for (const sx of [-1, 1]) {
        const twin = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.14, r * 0.34, h * 0.55, 8), mat(accentHex));
        twin.position.set(sx * r * 3.1, h * 0.275, sx * r * 0.7);
        m.add(twin);
        for (const t of [0.3, 0.52]) {
          const bridge = new THREE.Mesh(new THREE.BoxGeometry(r * 3.4, r * 0.18, r * 0.5), mat(hex));
          bridge.position.set(sx * r * 1.55, h * t, sx * r * 0.35);
          m.add(bridge);
        }
      }
    }
    group.add(m);
  }
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
 * Public spaces — markets, plazas, parks, fairs. Stalls, canopies, monoliths,
 * tent rings and light trees: low, busy, lit places between the towers.
 */
export function buildPlaces(city, U) {
  const group = new THREE.Group();
  const mats = new Map();
  const mat = (hex) => {
    if (!mats.has(hex)) mats.set(hex, makeLandmarkMaterial(U, hex));
    return mats.get(hex);
  };
  const padHex = '#232838';
  const stallHexes = ['#4a3a58', '#3a4a5e', '#584238', '#3c4c44'];
  const warmHex = '#6a4a58';

  for (const pl of city.places) {
    const m = new THREE.Group();
    m.position.set(pl.x, 0, pl.z);
    m.rotation.y = pl.rot;
    const { kind, r, seed } = pl;

    // the ground pad
    const pad = new THREE.Mesh(new THREE.BoxGeometry(r * 2, 1.6, r * 2), mat(padHex));
    pad.position.y = 0.8;
    m.add(pad);

    const rnd = (k) => ((Math.sin(seed * 97.1 + k * 41.7) * 43758.5453) % 1 + 1) % 1;

    if (kind === 'market') {
      // rings of stalls with canopy slabs
      const rings = 2;
      let idx = 0;
      for (let ring = 0; ring < rings; ring++) {
        const rr = r * (0.42 + ring * 0.34);
        const count = 8 + ring * 4;
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2 + rnd(idx++) * 0.35;
          const sw = 7 + rnd(idx++) * 7;
          const stall = new THREE.Mesh(new THREE.BoxGeometry(sw, 5 + rnd(idx++) * 4, sw * 0.8), mat(stallHexes[idx % stallHexes.length]));
          stall.position.set(Math.cos(a) * rr, 4, Math.sin(a) * rr);
          stall.rotation.y = -a + rnd(idx++) * 0.5;
          m.add(stall);
          const canopy = new THREE.Mesh(new THREE.BoxGeometry(sw * 1.45, 0.8, sw * 1.2), mat(warmHex));
          canopy.position.set(Math.cos(a) * rr, 9.5 + rnd(idx) * 3, Math.sin(a) * rr);
          canopy.rotation.y = stall.rotation.y;
          m.add(canopy);
        }
      }
      const ob = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.6, 26, 8), mat(warmHex));
      ob.position.y = 13;
      m.add(ob);
    } else if (kind === 'plaza') {
      // monolith ring + floating centre orb
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + pl.seed * 3;
        const mh = 26 + rnd(i) * 42;
        const mono = new THREE.Mesh(new THREE.BoxGeometry(5 + rnd(i + 9) * 4, mh, 10), mat(stallHexes[i % stallHexes.length]));
        mono.position.set(Math.cos(a) * r * 0.62, mh / 2, Math.sin(a) * r * 0.62);
        mono.rotation.y = -a + 0.4;
        mono.rotation.z = (rnd(i + 3) - 0.5) * 0.14;
        m.add(mono);
      }
      const orb = new THREE.Mesh(new THREE.SphereGeometry(7, 12, 10), mat(warmHex));
      orb.position.y = 34;
      m.add(orb);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.34, 1.1, 6, 28), mat(warmHex));
      ring.position.y = 34;
      ring.rotation.x = Math.PI / 2 - 0.3;
      m.add(ring);
    } else if (kind === 'park') {
      // light trees + winding path slabs
      for (let i = 0; i < 12; i++) {
        const a = rnd(i * 3) * Math.PI * 2;
        const rr = r * (0.15 + rnd(i * 3 + 1) * 0.72);
        const th = 9 + rnd(i * 3 + 2) * 14;
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.1, th, 6), mat(padHex));
        trunk.position.set(Math.cos(a) * rr, th / 2, Math.sin(a) * rr);
        m.add(trunk);
        const crown = new THREE.Mesh(new THREE.SphereGeometry(2.6 + rnd(i) * 2.2, 8, 6), mat(warmHex));
        crown.position.set(Math.cos(a) * rr, th + 1.6, Math.sin(a) * rr);
        m.add(crown);
      }
      for (let i = 0; i < 5; i++) {
        const slab = new THREE.Mesh(new THREE.BoxGeometry(r * 0.5, 0.9, 4.5), mat(stallHexes[i % stallHexes.length]));
        const a = i * 1.35 + seed * 6;
        slab.position.set(Math.cos(a) * r * 0.35, 1.6, Math.sin(a) * r * 0.35);
        slab.rotation.y = a * 1.7;
        m.add(slab);
      }
    } else { // fair — tent ring + wheel-ish ring + midway stalls
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + seed * 4;
        const tent = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 8 + rnd(i) * 5, 12 + rnd(i + 5) * 9, 4), mat(stallHexes[i % stallHexes.length]));
        tent.position.set(Math.cos(a) * r * 0.55, 7, Math.sin(a) * r * 0.55);
        tent.rotation.y = a + 0.6;
        m.add(tent);
      }
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(r * 0.42, 1.6, 6, 30), mat(warmHex));
      wheel.position.set(r * 0.25, r * 0.42, -r * 0.3);
      wheel.rotation.y = 0.5;
      m.add(wheel);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const bar = new THREE.Mesh(new THREE.BoxGeometry(r * 0.82, 0.9, 0.9), mat(padHex));
        bar.position.set(r * 0.25, r * 0.42, -r * 0.3);
        bar.rotation.z = a;
        bar.rotation.y = 0.5;
        m.add(bar);
      }
    }
    group.add(m);
  }
  return group;
}

/* --------------------------------------------------------------- traffic */

const VEHICLE_COLORS = ['#ffe8c8', '#ffe8c8', '#ff4038', '#86f2ff', '#ffb347'];

/* ------------------------------------------------- geometry helpers */

/** Merge coloured boxes into one non-indexed geometry (position/normal/color). */
function mergeParts(parts) {
  let total = 0;
  const built = [];
  for (const pt of parts) {
    const g = new THREE.BoxGeometry(pt.w, pt.h, pt.d).toNonIndexed();
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(pt.rx || 0, pt.ry || 0, pt.rz || 0));
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

const VEHICLE_CLASSES = [
  {
    parts: podParts, len: 22, wid: 4.4, beamLen: 26, beamW: 5.5,
    spd: 0.006, spdJit: 0.0005, scale: 0.85, bobA: 0.9, bobF: 1.35,
  },
  {
    parts: skimmerParts, len: 26, wid: 7, beamLen: 30, beamW: 7,
    spd: 0.0045, spdJit: 0.0004, scale: 0.9, bobA: 1.5, bobF: 1.05,
  },
  {
    parts: haulerParts, len: 88, wid: 9, beamLen: 40, beamW: 9,
    spd: 0.0022, spdJit: 0.00025, scale: 0.92, bobA: 0.35, bobF: 0.8,
    trailerLag: 0.016,
  },
];

/**
 * The traffic fleet: pods, skimmers and haulers with detailed multi-part
 * silhouettes, head/tail lights, underglow, headlight beams and trails —
 * and articulated sub-parts: pulsing thrusters, spinning rotors, and lagging
 * swaying trailer sections behind the haulers. Everything hover-bobs.
 * Returns { group, mesh, bodies, beams, thrusters, rotors, trailers, trails, update }.
 */
export function makeVehicles(city, trailMat, count = 220) {
  const lanes = city.lanes.length ? city.lanes : [{ x1: -400, z1: 0, x2: 400, z2: 0, y: 90, speed: 100 }];
  const total = Math.min(count, 480);
  const group = new THREE.Group();

  const classOf = new Int32Array(total);
  const local = new Int32Array(total);
  const classCount = [0, 0, 0];
  for (let i = 0; i < total; i++) {
    const cls = i % 10;
    classOf[i] = cls < 5 ? 0 : cls < 8 ? 1 : 2;
    local[i] = classCount[classOf[i]]++;
  }

  const bodyMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const beamMat = new THREE.ShaderMaterial({
    vertexShader: BEAM_VERT,
    fragmentShader: BEAM_FRAG,
    uniforms: {
      uBeamCol: { value: col('#fff3d8') },
      uBeamK: { value: 0.55 },
      uTime: { value: 0 },
      uLightK: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });

  const bodies = [];
  const beams = [];
  for (let c = 0; c < 3; c++) {
    const V = VEHICLE_CLASSES[c];
    const bg = mergeParts(V.parts());
    const body = new THREE.InstancedMesh(bg, bodyMat, Math.max(1, classCount[c]));
    body.frustumCulled = false;
    bodies.push(body);
    group.add(body);

    const bgeo = beamGeometry(V.beamLen, V.beamW).rotateZ(-Math.PI / 2); // +Y -> +X (nose)
    bgeo.translate(V.len / 2 + 1.5, 0, 0);
    const beam = new THREE.InstancedMesh(bgeo, beamMat, Math.max(1, classCount[c]));
    beam.frustumCulled = false;
    beams.push(beam);
    group.add(beam);
  }

  // articulated sub-part meshes (one per class that has them)
  const thrusters = new THREE.InstancedMesh(mergeParts(thrusterParts()), bodyMat, Math.max(1, classCount[0]));
  thrusters.frustumCulled = false;
  group.add(thrusters);
  const rotors = new THREE.InstancedMesh(mergeParts(rotorParts()), bodyMat, Math.max(1, classCount[1]));
  rotors.frustumCulled = false;
  group.add(rotors);
  const trailerGeo = mergeParts(trailerParts());
  const trailers = [0, 1].map(() => {
    const t = new THREE.InstancedMesh(trailerGeo, bodyMat, Math.max(1, classCount[2]));
    t.frustumCulled = false;
    group.add(t);
    return t;
  });

  // trails: one shared instanced mesh indexed globally
  const trailGeo = new THREE.BoxGeometry(1, 1, 1);
  const aColor = new Float32Array(total * 3);
  trailGeo.setAttribute('aColor', new THREE.InstancedBufferAttribute(aColor, 3));
  const trails = new THREE.InstancedMesh(trailGeo, trailMat, total);
  trails.frustumCulled = false;
  group.add(trails);

  const laneIdx = new Int32Array(total);
  const t = new Float32Array(total);
  const dir = new Float32Array(total);
  const spd = new Float32Array(total);
  const scl = new Float32Array(total);
  const phase = new Float32Array(total);
  const spin = new Float32Array(total);
  let elapsed = 0;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const c = new THREE.Color();

  /** Compose the matrix for vehicle i at lane position tVal with motion offsets. */
  const composeAt = (i, tVal, o = {}) => {
    const L = lanes[laneIdx[i]];
    const yaw = Math.atan2(L.x2 - L.x1, L.z2 - L.z1) + (dir[i] < 0 ? Math.PI : 0) + (o.sway || 0);
    const tt = ((tVal % 1) + 1) % 1;
    p.set(L.x1 + (L.x2 - L.x1) * tt, L.y + (o.bob || 0), L.z1 + (L.z2 - L.z1) * tt);
    e.set(0, yaw + (o.spinY || 0), o.roll || 0);
    q.setFromEuler(e);
    const sc = scl[i] * (o.pulse || 1);
    s.set(sc * (o.stretch || 1), sc, sc * (o.wMul || 1));
    m.compose(p, q, s);
  };

  for (let i = 0; i < total; i++) {
    laneIdx[i] = i % lanes.length;
    t[i] = (i * 0.618034) % 1;
    dir[i] = i % 2 === 0 ? 1 : -1;
    phase[i] = (i * 0.754877666) % 6.28318;
    const V = VEHICLE_CLASSES[classOf[i]];
    spd[i] = V.spd + ((i * 37) % 13) * V.spdJit;
    scl[i] = V.scale + ((i * 53) % 17) * 0.017;
    c.set(VEHICLE_COLORS[i % VEHICLE_COLORS.length]);
    bodies[classOf[i]].setColorAt(local[i], c);
    if (classOf[i] === 0) thrusters.setColorAt(local[i], c);
    else if (classOf[i] === 1) rotors.setColorAt(local[i], c);
    else for (const tr of trailers) tr.setColorAt(local[i], c);
    aColor[i * 3] = c.r;
    aColor[i * 3 + 1] = c.g;
    aColor[i * 3 + 2] = c.b;
  }
  for (const b of bodies) if (b.instanceColor) b.instanceColor.needsUpdate = true;
  for (const b of [thrusters, rotors, ...trailers]) if (b.instanceColor) b.instanceColor.needsUpdate = true;
  trailGeo.getAttribute('aColor').needsUpdate = true;

  function update(dt, density = 1) {
    elapsed += dt;
    const n = Math.max(0, Math.min(total, Math.round(total * density)));
    const active = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      const L = lanes[laneIdx[i]];
      const V = VEHICLE_CLASSES[classOf[i]];
      const span = Math.max(60, Math.hypot(L.x2 - L.x1, L.z2 - L.z1));
      t[i] += spd[i] * dt * dir[i] * Math.max(20, L.speed) * 0.055;
      if (t[i] > 1) t[i] -= 1;
      if (t[i] < 0) t[i] += 1;
      const ph = phase[i];
      const bob = Math.sin(elapsed * V.bobF + ph) * V.bobA;
      const roll = Math.sin(elapsed * 0.9 + ph) * 0.05;
      const li = local[i];
      const cc = classOf[i];

      composeAt(i, t[i], { bob, roll });
      bodies[cc].setMatrixAt(li, m);
      beams[cc].setMatrixAt(li, m);

      if (cc === 0) {
        // pulsing thruster
        composeAt(i, t[i], { bob, roll, pulse: 0.78 + 0.36 * Math.sin(elapsed * 7 + ph) });
        thrusters.setMatrixAt(li, m);
      } else if (cc === 1) {
        // spinning rotor
        spin[i] += dt * 8;
        composeAt(i, t[i], { bob, roll, spinY: spin[i] });
        rotors.setMatrixAt(li, m);
      } else {
        // articulated trailers — lag behind and sway out of step
        const lag = V.trailerLag;
        composeAt(i, t[i] - dir[i] * lag, { bob: bob * 0.7, roll: roll * 0.6, sway: Math.sin(elapsed * 0.8 + ph) * 0.05 });
        trailers[0].setMatrixAt(li, m);
        composeAt(i, t[i] - dir[i] * lag * 2, { bob: bob * 0.55, roll: roll * 0.4, sway: Math.sin(elapsed * 0.8 + ph - 0.7) * 0.09 });
        trailers[1].setMatrixAt(li, m);
      }
      active[cc]++;

      // trail sits behind the body along the lane
      const savedT = t[i];
      t[i] = savedT - dir[i] * (V.len * 1.7) / span;
      composeAt(i, t[i], { bob: bob * 0.5, stretch: 2.4, wMul: 0.75 });
      trails.setMatrixAt(i, m);
      t[i] = savedT;
    }
    for (let c = 0; c < 3; c++) {
      bodies[c].count = active[c];
      beams[c].count = active[c];
      bodies[c].instanceMatrix.needsUpdate = true;
      beams[c].instanceMatrix.needsUpdate = true;
    }
    thrusters.count = active[0];
    rotors.count = active[1];
    for (const tr of trailers) tr.count = active[2];
    thrusters.instanceMatrix.needsUpdate = true;
    rotors.instanceMatrix.needsUpdate = true;
    for (const tr of trailers) tr.instanceMatrix.needsUpdate = true;
    trails.count = n;
    trails.instanceMatrix.needsUpdate = true;
    beamMat.uniforms.uTime.value = elapsed;
  }

  update(0, 1); // place everything for frame 0

  return { group, mesh: bodies[0], bodies, beams, thrusters, rotors, trailers, trails, update };
}

/* ------------------------------------------------- searchlights & pools */

/**
 * Animated volumetric searchlight shafts rising from landmarks and the
 * tallest towers: slow yaw sweeps, breathing tilt oscillation and a gentle
 * shared intensity pulse.
 */
export function makeSearchlights(city, beamMat, count = 8) {
  const group = new THREE.Group();
  const spots = [];
  for (const lm of city.landmarks) {
    spots.push({ x: lm.x, y: lm.h * 0.86, z: lm.z, r: lm.colorSeed });
  }
  for (let i = 0; i < city.count && spots.length < count + 4; i += 53) {
    const top = city.y[i] + city.h[i] / 2;
    if (top > 240) spots.push({ x: city.x[i], y: top, z: city.z[i], r: city.s[i] });
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
    const len = 750 + sp.r * 750;
    const geo = beamGeometry(len, 110 + sp.r * 130);
    const mesh = new THREE.Mesh(geo, beamMat);
    const tilt = 0.04 + sp.r * 0.3;
    mesh.rotation.z = tilt;
    mesh.frustumCulled = false;
    pivot.add(mesh);
    group.add(pivot);
    pivots.push({
      pivot,
      mesh,
      tilt,
      speed: (sp.r - 0.5) * 0.16,       // yaw sweep
      wob: 0.12 + sp.r * 0.22,          // tilt breathing rate
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

  return { accent: look.accent, post: look.post };
}

/**
 * Time of day — a full 24-hour cycle. Each look's palette is authored for its
 * defTime hour and stays *identity* there; moving the clock applies only the
 * DELTA (dawn / day / golden / dusk / the small hours), so lighting works
 * everywhere instead of crushing the palette. The sun sweeps east→west around
 * the sky through the day and continues as a low moon path at night.
 * @param {number} hours 0..24 (6 = sunrise, 12 = noon, 18 = sunset)
 * @param {{lights?:number, glow?:number, clouds?:number, haze?:number, sun?:number, sat?:number}} tune
 * @returns {{hour:number, elev:number, night:number, warm:number, deep:number}}
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

  // sun path: the look's base azimuth plus a full sweep through the day —
  // east at sunrise, overhead arc, west at sunset, low moon path at night
  const [ax, , az] = look.sky.sunDir;
  const alen = Math.hypot(ax, az) || 1;
  const baseAz = Math.atan2(az / alen, ax / alen);
  const sweep = ((h - 6) / 12) * Math.PI;
  const sunAz = baseAz + sweep;
  const ey = 0.06 + Math.max(cur.elev, cur.night * 0.26) * 0.94;
  const exz = Math.sqrt(Math.max(0, 1 - ey * ey));
  U.uSunDir.value.set(Math.cos(sunAz) * exz, ey, Math.sin(sunAz) * exz).normalize();

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

  // parametric atmosphere knobs
  U.uCloud.value = look.sky.cloud * (tune.clouds ?? 1);
  U.uHaze.value = look.sky.haze * (tune.haze ?? 1);
  U.uSunGlow.value = 0.65 * (tune.sun ?? 1) * Math.max(0.08, 0.6 + cur.warm * 0.8 + cur.night * 0.1 - cur.deep * 0.15);
  U.uSat.value = (tune.sat ?? 1) * (1 + cur.warm * 0.12);
  U.uLightK.value = (tune.lights ?? 1) * (0.45 + cur.night * 0.7 + cur.warm * 0.35 + cur.deep * 0.2);
  U.uBeaconCol.value.set(look.tower.winC === '#000000' ? look.accent : look.tower.winC);

  return { hour: h, elev: cur.elev, night: cur.night, warm: cur.warm, deep: cur.deep };
}
