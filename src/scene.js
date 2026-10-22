// Scene construction and look application — no DOM here, so this whole
// layer runs (and is tested) in Node against real three.js.
import * as THREE from '../vendor/three.module.js';
import { generateCity, makeCityCollider, CELL, AVENUE, STREET } from './city.js';
import {
  SKY_VERT, SKY_FRAG, GROUND_VERT, GROUND_FRAG, TOWER_VERT, TOWER_FRAG,
  LANDMARK_VERT, LANDMARK_FRAG, BEACON_VERT, BEACON_FRAG, TRAIL_VERT, TRAIL_FRAG,
  BEAM_VERT, BEAM_FRAG, POOL_VERT, POOL_FRAG,
  WATER_VERT, WATER_FRAG, BILL_VERT, BILL_FRAG, WEATHER_VERT, WEATHER_FRAG,
  DUST_VERT, DUST_FRAG,
  HOLO_VERT, HOLO_FRAG,
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
    uCloudStyle: { value: 0 },
    uHaze: { value: 0.5 },
    uGStreet: { value: col('#0c0713') },
    uGBlock: { value: col('#170e22') },
    uGLine: { value: col('#ff386e') },
    uGLineGlow: { value: 0.8 },
    uCell: { value: CELL },
    uAve: { value: AVENUE },
    uSt: { value: STREET },
    uCitySpan: { value: CELL * 5 },
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

/** Sky dome, ground grid and the instanced tower material + meshes. */
export function makeWorld(U) {
  // The sky dome must fully contain the ground plane (half-diagonal ~17k),
  // or its square corners stick out past the horizon — the "square world" bug.
  const skyMat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    uniforms: pick(U, ['uZen', 'uHor', 'uSkySunCol', 'uSunDir', 'uCloudCol', 'uStars', 'uCloud', 'uCloudStyle', 'uHaze', 'uTime', 'uSunGlow', 'uSat', 'uMoonDir', 'uMoonSize', 'uMoonGlow', 'uMoonPhase', 'uFlash']),
    side: THREE.BackSide,
    depthWrite: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(20000, 48, 24), skyMat);
  sky.frustumCulled = false;

  const groundMat = new THREE.ShaderMaterial({
    vertexShader: GROUND_VERT,
    fragmentShader: GROUND_FRAG,
    uniforms: pick(U, [
      'uGStreet', 'uGBlock', 'uGLine', 'uGLineGlow', 'uCell', 'uAve', 'uSt', 'uCitySpan',
      'uSunDir', 'uFogCol', 'uSunFogCol', 'uFogDensity', 'uFogHeight', 'uHazeSun', 'uSat',
      'uWetness', 'uPoolCol', 'uBillA', 'uLightK',
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
      'uBillA', 'uBillB', 'uBillK', 'uBillMono', 'uPoolCol', 'uLightK',
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

  // street lamps: same glow, steady instead of pulsing, look-tinted colour
  const lampMat = new THREE.ShaderMaterial({
    vertexShader: BEACON_VERT,
    fragmentShader: BEACON_FRAG,
    uniforms: {
      uTime: U.uTime,
      uLightK: U.uLightK,
      uBeaconCol: U.uLampCol,
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

  const waterMat = new THREE.ShaderMaterial({
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
    uniforms: pick(U, ['uWaterDeep', 'uWaterShallow', 'uSunDir', 'uSkySunCol', 'uFogCol', 'uSunFogCol', 'uHazeSun', 'uTime', 'uSat']),
    side: THREE.DoubleSide,
  });

  const billMat = new THREE.ShaderMaterial({
    vertexShader: BILL_VERT,
    fragmentShader: BILL_FRAG,
    uniforms: pick(U, ['uBillA', 'uBillB', 'uBillK', 'uBillMono', 'uTime', 'uLightK', 'uSat']),
  });

  const holoMat = new THREE.ShaderMaterial({
    vertexShader: HOLO_VERT,
    fragmentShader: HOLO_FRAG,
    uniforms: pick(U, ['uBillA', 'uBillB', 'uBillK', 'uBillMono', 'uTime', 'uLightK', 'uSat']),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });

  return { sky, skyMat, ground, groundMat, towerMat, beaconMat, lampMat, trailMat, beamMat, poolMat, waterMat, billMat, holoMat };
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

/** Grow a city and return { city, mesh } — caller swaps the mesh in the scene. */
export function growCity(seed, radius, towerMat) {
  const city = generateCity(seed, radius);
  return { city, mesh: buildCityMesh(city, towerMat), collider: makeCityCollider(city) };
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
  const stallHexes = ['#4a3a58', '#3a4a5e', '#584238', '#3c4c44', '#4e3d52'];
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
    } else if (kind === 'fair') { // tent ring + wheel-ish ring + midway stalls
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
    } else if (kind === 'arena') {
      // the arena: ribbed oval bowl + twin glowing halo crowns + flying buttresses + entrance arches
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.78, r * 0.92, 36, 24), mat(stallHexes[1]));
      bowl.scale.z = 0.76;
      bowl.position.y = 18;
      m.add(bowl);
      const hole = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.52, r * 0.52, 38, 20), mat(padHex));
      hole.scale.z = 0.76;
      hole.position.y = 19;
      m.add(hole);
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const rib = new THREE.Mesh(new THREE.BoxGeometry(3.8, 42, 10), mat(warmHex));
        rib.position.set(Math.cos(a) * r * 0.86, 21, Math.sin(a) * r * 0.66);
        rib.rotation.y = -a;
        rib.rotation.z = 0.14;
        m.add(rib);
      }
      const crown = new THREE.Mesh(new THREE.TorusGeometry(r * 0.66, 2.0, 6, 36), mat(warmHex));
      crown.scale.z = 0.76;
      crown.position.y = 40;
      m.add(crown);
      const innerCrown = new THREE.Mesh(new THREE.TorusGeometry(r * 0.42, 1.3, 6, 28), mat(warmHex));
      innerCrown.scale.z = 0.76;
      innerCrown.position.y = 46;
      m.add(innerCrown);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        const gate = new THREE.Mesh(new THREE.TorusGeometry(12, 2.4, 6, 14, Math.PI), mat(warmHex));
        gate.position.set(Math.cos(a) * r * 0.9, 2, Math.sin(a) * r * 0.68);
        gate.rotation.y = -a + Math.PI / 2;
        m.add(gate);
      }
    } else if (kind === 'theatre') {
      // grand movie palace: stepped Art-Deco fly-tower, glowing marquee canopy, twin neon fins & grand stairs
      const hall = new THREE.Mesh(new THREE.BoxGeometry(r * 1.08, 30, r * 0.86), mat(stallHexes[0]));
      hall.position.y = 15;
      m.add(hall);
      const flyTower = new THREE.Mesh(new THREE.BoxGeometry(r * 0.66, 22, r * 0.44), mat(stallHexes[4]));
      flyTower.position.set(0, 36, -r * 0.14);
      m.add(flyTower);
      const crown = new THREE.Mesh(new THREE.BoxGeometry(r * 0.82, 9, r * 0.64), mat(warmHex));
      crown.position.y = 34;
      m.add(crown);
      const marquee = new THREE.Mesh(new THREE.BoxGeometry(r * 0.98, 4.2, 18), mat(warmHex));
      marquee.position.set(0, 12.5, r * 0.52);
      m.add(marquee);
      for (const sx of [-1, 1]) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(4.6, 38, 3.0), mat(warmHex));
        blade.position.set(sx * r * 0.42, 31, r * 0.46);
        m.add(blade);
      }
      const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 2.2, 22, 8), mat(warmHex));
      spire.position.set(0, 56, -r * 0.14);
      m.add(spire);
      for (let i = 0; i < 4; i++) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(r * 0.9 - i * 6, 1.4, 8), mat(padHex));
        step.position.set(0, 0.7 + i * 1.4, r * 0.52 + 14 - i * 4);
        m.add(step);
      }
    } else if (kind === 'stadium') {
      // the stadium: twin-tier oval colosseum, canopy rim, floodlight towers & glowing track
      const tier1 = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r * 0.99, 17, 26), mat(stallHexes[2]));
      tier1.scale.z = 0.72;
      tier1.position.y = 8.5;
      m.add(tier1);
      const tier2 = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.72, r * 0.88, 19, 26), mat(stallHexes[4]));
      tier2.scale.z = 0.72;
      tier2.position.y = 26;
      m.add(tier2);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.74, 2.6, 6, 36), mat(warmHex));
      rim.scale.z = 0.72;
      rim.position.y = 35.5;
      m.add(rim);
      const field = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.58, r * 0.58, 2.2, 22), mat(padHex));
      field.scale.z = 0.66;
      field.position.y = 2;
      m.add(field);
      const track = new THREE.Mesh(new THREE.TorusGeometry(r * 0.6, 2.4, 6, 36), mat(warmHex));
      track.scale.z = 0.7;
      track.position.y = 3.5;
      m.add(track);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.25;
        const mh = 50 + rnd(i) * 18;
        const mast = new THREE.Mesh(new THREE.BoxGeometry(2.4, mh, 2.4), mat(padHex));
        mast.position.set(Math.cos(a) * r * 1.02, mh / 2, Math.sin(a) * r * 0.74);
        m.add(mast);
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(9, 4.2, 2.4), mat(warmHex));
        lamp.position.set(Math.cos(a) * r * 1.02, mh + 1.5, Math.sin(a) * r * 0.74);
        lamp.rotation.y = -a;
        m.add(lamp);
      }
    }
    group.add(m);
  }
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
export function makeVehicles(city, trailMat, count = 260, collider = null) {
  const lanes = city.lanes.length ? city.lanes : [{ x1: -400, z1: 0, cx: 0, cz: 0, x2: 400, z2: 0, y: 90, speed: 100, layer: 'air-low' }];
  const colCheck = collider || makeCityCollider(city);
  const total = Math.min(count, 520);
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

  const lanePool = VEHICLE_CLASSES.map((V) => {
    const pool = lanes.filter((l) => V.layers.includes(l.layer));
    return pool.length ? pool : lanes;
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

  const laneIdx = new Int32Array(total);
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
  const weaveRate = new Float32Array(total);
  let elapsed = 0;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler(0, 0, 0, 'YXZ');
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const c = new THREE.Color();

  const laneY = (L, tt) => {
    if (!L.prof) return L.y;
    const f = tt * (L.prof.length - 1);
    const i0 = Math.floor(f);
    const i1 = Math.min(L.prof.length - 1, i0 + 1);
    const fr = f - i0;
    return L.prof[i0] * (1 - fr) + L.prof[i1] * fr;
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

  const assignRoute = (i, lap) => {
    const pool = lanePool[classOf[i]];
    const V = VEHICLE_CLASSES[classOf[i]];
    laneIdx[i] = Math.floor(h01(i + lap * 997, 23) * pool.length) % pool.length;
    const L = pool[laneIdx[i]];
    dir[i] = h01(i + lap * 613, 31) < 0.5 ? 1 : -1;
    // Separate opposing directions laterally so oncoming traffic passes cleanly
    const sideSpread = L.layer === 'ground' ? 2.4 : 7.5;
    latOf[i] = dir[i] * sideSpread * 0.55 + (h01(i + lap * 317, 41) - 0.5) * sideSpread;
    vOf[i] = L.layer === 'ground' ? 0 : (h01(i + lap * 419, 43) - 0.5) * 9;
    weaveRate[i] = V.weaveF * (0.65 + h01(i + lap * 521, 47) * 0.85);
    baseSpd[i] = V.spd * (0.54 + h01(i + lap * 733, 53) * 1.05);
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

  const composeAt = (i, tVal, o = {}) => {
    const cc = classOf[i];
    const pool = lanePool[cc];
    const L = pool[laneIdx[i]];
    const tt = ((tVal % 1) + 1) % 1;
    evalLane(L, tt, tmp);
    const sign = dir[i];
    const tx = tmp.dx * sign;
    const tz = tmp.dz * sign;
    const V = VEHICLE_CLASSES[cc];
    const wAmp = L.layer === 'ground' ? Math.min(1.6, V.weaveA * 0.15) : V.weaveA;
    const wArg = tt * Math.PI * 2 * weaveRate[i] + phase[i];
    const weave = Math.sin(wArg) * wAmp;
    const nx = -tz;
    const nz = tx;
    const px = tmp.x + nx * (weave + latOf[i]);
    const pz = tmp.z + nz * (weave + latOf[i]);

    // Glide elevation + strict runtime building floor so no vehicle ever clips a building
    let py = laneY(L, tt) + (o.bob || 0) + vOf[i];
    if (L.layer !== 'ground') {
      const roof = colCheck.maxHeightNear(px, pz, 9);
      if (roof > 0 && py < roof + 14) py = roof + 14;
    } else {
      py = Math.max(5.2, py);
    }

    // Climb/descent pitch along the glide profile + bank into weave
    const tAhead = Math.max(0, Math.min(1, tt + sign * 0.02));
    const dy = laneY(L, tAhead) - laneY(L, tt);
    const pitch = L.layer === 'ground' ? 0 : Math.max(-0.28, Math.min(0.28, Math.atan2(dy, Math.max(14, tmp.len * 0.02)) * 0.55));
    const yaw = Math.atan2(-tz, tx) + (o.sway || 0);
    const bank = -Math.cos(wArg) * (wAmp * 0.0045) + (o.roll || 0);

    p.set(px, py, pz);
    e.set(bank, yaw + (o.spinY || 0), pitch, 'YXZ');
    q.setFromEuler(e);
    const sc = scl[i] * (o.pulse || 1);
    s.set(sc * (o.stretch || 1), sc, sc * (o.wMul || 1));
    m.compose(p, q, s);
  };

  let collision = true;
  /**
   * Vehicle-vehicle collision avoidance: vehicles sharing a lane & direction
   * maintain safe headways instead of overlapping.
   */
  function applyCollision(n) {
    const byKey = new Map();
    for (let i = 0; i < n; i++) {
      const pool = lanePool[classOf[i]];
      const L = pool[laneIdx[i]];
      const dirBit = dir[i] > 0 ? 1 : 0;
      let arr = byKey.get(L);
      if (!arr) { arr = [[], []]; byKey.set(L, arr); }
      arr[dirBit].push(i);
    }
    for (const [L, pair] of byKey.entries()) {
      const spanLen = Math.max(140, Math.hypot(L.x2 - L.x1, L.z2 - L.z1));
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
            spd[follower] = Math.max(spd[leader] * 0.85, spd[follower] * 0.92);
          } else if (gap > need * 1.45 && spd[follower] < baseSpd[follower]) {
            spd[follower] = Math.min(baseSpd[follower], spd[follower] * 1.03);
          }
        }
      }
    }
  }

  function update(dt, density = 1) {
    elapsed += dt;
    const n = Math.max(0, Math.min(total, Math.round(total * density)));
    const active = new Array(nCls).fill(0);
    if (collision && dt > 0) applyCollision(n);
    for (let i = 0; i < n; i++) {
      const cc = classOf[i];
      const V = VEHICLE_CLASSES[cc];
      const pool = lanePool[cc];
      const L = pool[laneIdx[i]];
      const ph = phase[i];
      // Dynamic throttle breathing + occasional drone/heli hover pauses
      let throttle = 1 + 0.22 * Math.sin(elapsed * 0.45 + ph * 1.7);
      if (V.hover) {
        const hv = Math.sin(elapsed * 0.33 + ph * 3.1);
        if (hv > 0.78) throttle *= 0.16;
      }
      if (!collision) spd[i] = baseSpd[i];
      t[i] += spd[i] * throttle * dt * dir[i] * Math.max(22, L.speed) * 0.055;
      if (t[i] > 1 || t[i] < 0) {
        laps[i]++;
        const wasOver = t[i] > 1;
        assignRoute(i, laps[i]);
        t[i] = dir[i] > 0 ? (wasOver ? t[i] % 1 : 0.002) : (wasOver ? 0.998 : ((t[i] % 1) + 1) % 1);
      }

      const bob = L.layer === 'ground' ? 0 : Math.sin(elapsed * V.bobF + ph) * V.bobA;
      const roll = L.layer === 'ground' ? 0 : Math.sin(elapsed * 0.9 + ph) * 0.06;
      const li = local[i];

      composeAt(i, t[i], { bob, roll });
      bodies[cc].setMatrixAt(li, m);
      if (beams[cc]) beams[cc].setMatrixAt(li, m);

      if (cc === 0) {
        composeAt(i, t[i], { bob, roll, pulse: 0.78 + 0.36 * Math.sin(elapsed * 7 + ph) });
        thrusters.setMatrixAt(li, m);
      }
      if (rotors[cc]) {
        spin[i] += dt * V.spinSpeed;
        composeAt(i, t[i], { bob, roll, spinY: spin[i] });
        rotors[cc].setMatrixAt(li, m);
      }
      if (cc === 2) {
        const lag = V.trailerLag;
        composeAt(i, t[i] - dir[i] * lag, { bob: bob * 0.7, roll: roll * 0.6, sway: Math.sin(elapsed * 0.8 + ph) * 0.05 });
        trailers[0].setMatrixAt(li, m);
        composeAt(i, t[i] - dir[i] * lag * 2, { bob: bob * 0.55, roll: roll * 0.4, sway: Math.sin(elapsed * 0.8 + ph - 0.7) * 0.09 });
        trailers[1].setMatrixAt(li, m);
      }
      active[cc]++;

      const savedT = t[i];
      t[i] = savedT - dir[i] * 0.012;
      composeAt(i, t[i], { bob: bob * 0.5, stretch: 2.4, wMul: 0.75 });
      trails.setMatrixAt(i, m);
      t[i] = savedT;
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

/** Bodies of water — irregular polygon lakes with a ripple shader. */
export function buildWater(city, waterMat) {
  const group = new THREE.Group();
  for (const w of city.water) {
    const pos = [];
    for (let i = 0; i < w.pts.length; i++) {
      const [x1, z1] = w.pts[i];
      const [x2, z2] = w.pts[(i + 1) % w.pts.length];
      pos.push(x1, 2.2, z1, x2, 2.2, z2, w.x, 2.2, w.z);
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
  const lineMat = new THREE.MeshBasicMaterial({ color: '#ffd28a', toneMapped: false });
  group.userData.lineMat = lineMat;
  for (const b of city.boulevards || []) {
    const dx = b.x2 - b.x1;
    const dz = b.z2 - b.z1;
    const len = Math.hypot(dx, dz) || 1;
    const ang = Math.atan2(dx, dz);
    const road = new THREE.Mesh(new THREE.BoxGeometry(36, 0.5, len), roadMat);
    road.position.set((b.x1 + b.x2) * 0.5, 0.35, (b.z1 + b.z2) * 0.5);
    road.rotation.y = ang;
    road.frustumCulled = false;
    group.add(road);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.65, len), lineMat);
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
export function buildTrees(city) {
  const group = new THREE.Group();
  const organic = new THREE.Group();
  const cyber = new THREE.Group();
  const n = Math.max(1, city.trees.length);

  const trunkMatO = new THREE.MeshBasicMaterial({ color: '#7a5a3a', toneMapped: false });
  const canopyMatO = new THREE.MeshBasicMaterial({ color: '#4a9c5d', toneMapped: false });
  const trunkMatC = new THREE.MeshBasicMaterial({ color: '#141210', toneMapped: false });
  const canopyMatC = new THREE.MeshBasicMaterial({ color: '#e8d9b0', toneMapped: false });
  const glowMatC = new THREE.MeshBasicMaterial({ color: '#e8d9b0', toneMapped: false });

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

  return { accent: look.accent, post: look.post, grade: look.grade };
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

  // moon: opposite the sun, high at midnight — sliders drive glow/size/phase
  const moonAz = sunAz + Math.PI;
  const mElev = Math.sin(((h - 18) / 12) * Math.PI); // +1 at midnight
  const mey = 0.12 + Math.max(0, mElev) * 0.72;
  const mexz = Math.sqrt(Math.max(0, 1 - mey * mey));
  U.uMoonDir.value.set(Math.cos(moonAz) * mexz, mey, Math.sin(moonAz) * mexz).normalize();
  U.uMoonGlow.value = (tune.moon ?? 1) * (0.22 + cur.night * 1.15 + cur.deep * 0.35);
  U.uMoonSize.value = tune.moonsz ?? 1;
  U.uMoonPhase.value = tune.moonph ?? 0.85;

  // parametric atmosphere knobs
  U.uCloud.value = look.sky.cloud * (tune.clouds ?? 1);
  if (tune.cloudStyle !== undefined) U.uCloudStyle.value = tune.cloudStyle;
  U.uHaze.value = look.sky.haze * (tune.haze ?? 1);
  U.uSunGlow.value = 0.65 * (tune.sun ?? 1) * Math.max(0.08, 0.6 + cur.warm * 0.8 + cur.night * 0.1 - cur.deep * 0.15);
  U.uSat.value = (tune.sat ?? 1) * (1 + cur.warm * 0.12);
  U.uLightK.value = (tune.lights ?? 1) * (0.45 + cur.night * 0.7 + cur.warm * 0.35 + cur.deep * 0.2);
  const sig = look.signals || {};
  U.uBeaconCol.value.set(sig.beacon || (look.tower.winC === '#000000' ? look.accent : look.tower.winC));

  return { hour: h, elev: cur.elev, night: cur.night, warm: cur.warm, deep: cur.deep };
}
