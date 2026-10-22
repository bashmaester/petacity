// Scene construction and look application — no DOM here, so this whole
// layer runs (and is tested) in Node against real three.js.
import * as THREE from '../vendor/three.module.js';
import { generateCity, CELL, AVENUE, STREET } from './city.js';
import {
  SKY_VERT, SKY_FRAG, GROUND_VERT, GROUND_FRAG, TOWER_VERT, TOWER_FRAG,
  LANDMARK_VERT, LANDMARK_FRAG, BEACON_VERT, BEACON_FRAG,
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
  };
}

const pick = (U, names) => {
  const o = {};
  for (const n of names) o[n] = U[n];
  return o;
};

/** Sky dome, ground grid and the instanced tower material + meshes. */
export function makeWorld(U) {
  const skyMat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    uniforms: pick(U, ['uZen', 'uHor', 'uSkySunCol', 'uSunDir', 'uCloudCol', 'uStars', 'uCloud', 'uHaze', 'uTime']),
    side: THREE.BackSide,
    depthWrite: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(8200, 48, 24), skyMat);
  sky.frustumCulled = false;

  const groundMat = new THREE.ShaderMaterial({
    vertexShader: GROUND_VERT,
    fragmentShader: GROUND_FRAG,
    uniforms: pick(U, [
      'uGStreet', 'uGBlock', 'uGLine', 'uGLineGlow', 'uCell', 'uAve', 'uSt',
      'uSunDir', 'uFogCol', 'uSunFogCol', 'uFogDensity', 'uFogHeight', 'uHazeSun',
    ]),
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(26000, 26000).rotateX(-Math.PI / 2), groundMat);
  ground.frustumCulled = false;

  const towerMat = new THREE.ShaderMaterial({
    vertexShader: TOWER_VERT,
    fragmentShader: TOWER_FRAG,
    uniforms: pick(U, [
      'uSunDir', 'uSunCol', 'uSunK', 'uAmb', 'uAmbG', 'uBaseA', 'uBaseB',
      'uPal', 'uUsePal', 'uWinDensity', 'uWinGlow', 'uWinA', 'uWinB', 'uWinC',
      'uEdge', 'uEdgeCol', 'uBandGlow', 'uToon', 'uFlat',
      'uFogCol', 'uSunFogCol', 'uFogDensity', 'uFogHeight', 'uHazeSun', 'uTime',
    ]),
  });

  const beaconMat = new THREE.ShaderMaterial({
    vertexShader: BEACON_VERT,
    fragmentShader: BEACON_FRAG,
    uniforms: pick(U, ['uTime', 'uLightK', 'uBeaconCol']),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  return { sky, skyMat, ground, groundMat, towerMat, beaconMat };
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
        'uFogCol', 'uSunFogCol', 'uFogDensity', 'uFogHeight', 'uHazeSun', 'uTime',
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
 * Each kind is a little procedural composition of primitives.
 */
export function buildLandmarks(city, U) {
  const group = new THREE.Group();
  const mats = new Map();
  const mat = (hex) => {
    if (!mats.has(hex)) mats.set(hex, makeLandmarkMaterial(U, hex));
    return mats.get(hex);
  };
  const towerHexes = ['#3c4d66', '#4a3d63', '#2f4457', '#54425c', '#37485e', '#443a58'];

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
      }
      const arc = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.15, 8, 22, Math.PI), mat(hex));
      arc.position.y = legH;
      m.add(arc);
      const deck = new THREE.Mesh(new THREE.BoxGeometry(r * 2.15, r * 0.1, r * 0.34), mat(hex));
      deck.position.y = legH + r * 0.02;
      m.add(deck);
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
        const ring = new THREE.Mesh(new THREE.TorusGeometry(rb * 1.12, rb * 0.12, 6, 18), mat(hex));
        ring.rotation.x = Math.PI / 2;
        ring.position.y = y;
        m.add(ring);
      }
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.1, r * 0.16, h * 0.3, 8), mat(hex));
      mast.position.y = y + h * 0.15;
      m.add(mast);
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
    } else if (kind === 'crown') {
      const tiers = 5;
      for (let i = 0; i < tiers; i++) {
        const w = r * 2 * (1 - (i / tiers) * 0.52);
        const th = (h * 0.62) / tiers;
        const tier = new THREE.Mesh(new THREE.BoxGeometry(w, th, w), mat(hex));
        tier.position.y = (i + 0.5) * th;
        m.add(tier);
      }
      const top = new THREE.Mesh(new THREE.BoxGeometry(r * 0.9, h * 0.34, r * 0.9), mat(hex));
      top.position.y = h * 0.62 + h * 0.17;
      m.add(top);
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

/* --------------------------------------------------------------- traffic */

const VEHICLE_COLORS = ['#ffe8c8', '#ffe8c8', '#ff4038', '#86f2ff', '#ffb347'];

/**
 * Light-streak vehicles looping along the city lanes.
 * Returns { mesh, update(dt, density) } — update writes instance matrices.
 */
export function makeVehicles(city, U, count = 150) {
  const lanes = city.lanes.length ? city.lanes : [{ x1: -400, z1: 0, x2: 400, z2: 0, y: 90, speed: 100 }];
  const total = Math.min(count, 400);
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const mesh = new THREE.InstancedMesh(geo, mat, total);
  mesh.frustumCulled = false;

  const laneIdx = new Int32Array(total);
  const t = new Float32Array(total);
  const dir = new Float32Array(total);
  const spd = new Float32Array(total);
  const len = new Float32Array(total);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const c = new THREE.Color();

  for (let i = 0; i < total; i++) {
    laneIdx[i] = i % lanes.length;
    t[i] = (i * 0.618034) % 1; // golden-ratio scatter, deterministic
    dir[i] = i % 2 === 0 ? 1 : -1;
    spd[i] = 0.004 + ((i * 37) % 17) * 0.00035;
    len[i] = 14 + ((i * 53) % 23) * 2.2;
    c.set(VEHICLE_COLORS[i % VEHICLE_COLORS.length]);
    mesh.setColorAt(i, c);
    // place immediately so frame 0 is not a pile at the origin
    const L = lanes[laneIdx[i]];
    p.set(L.x1 + (L.x2 - L.x1) * t[i], L.y, L.z1 + (L.z2 - L.z1) * t[i]);
    e.set(0, Math.atan2(L.x2 - L.x1, L.z2 - L.z1) + (dir[i] < 0 ? Math.PI : 0), 0);
    q.setFromEuler(e);
    s.set(len[i], 2.4, 4);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.instanceMatrix.needsUpdate = true;

  function update(dt, density = 1) {
    mesh.count = Math.max(0, Math.min(total, Math.round(total * density)));
    for (let i = 0; i < mesh.count; i++) {
      const L = lanes[laneIdx[i]];
      t[i] += spd[i] * dt * dir[i] * Math.max(20, L.speed) * 0.055;
      if (t[i] > 1) t[i] -= 1;
      if (t[i] < 0) t[i] += 1;
      p.set(L.x1 + (L.x2 - L.x1) * t[i], L.y, L.z1 + (L.z2 - L.z1) * t[i]);
      e.set(0, Math.atan2(L.x2 - L.x1, L.z2 - L.z1) + (dir[i] < 0 ? Math.PI : 0), 0);
      q.setFromEuler(e);
      s.set(len[i], 2.4, 4);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  return { mesh, update };
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
 * Time of day. Multiplicative tinting of the look's own colours, so every
 * look keeps its identity while the sun moves. Call after applyLook.
 * @param {number} hours 0..24 (6 = sunrise, 12 = noon, 18 = sunset)
 * @param {{lights?:number}} tune
 * @returns {{hour:number, elev:number, night:number, warm:number}}
 */
export function applyTime(U, look, hours = 12, tune = { lights: 1, glow: 1 }) {
  const h = ((hours % 24) + 24) % 24;
  const dayT = clamp01((h - 5.5) / 13); // 0 at 05:30, 1 at 18:30
  const elev = Math.sin(dayT * Math.PI); // sun elevation proxy 0..1..0
  const night = 1 - smoothstep(0.0, 0.22, elev); // 1 deep night .. 0 day
  const warm = smoothstep(0.34, 0.05, elev) * (1 - night * 0.75); // golden hour

  // sun path: azimuth from the look, elevation from the hour
  const [ax, , az] = look.sky.sunDir;
  const alen = Math.hypot(ax, az) || 1;
  const ey = 0.05 + Math.max(elev, night * 0.2) * 0.95;
  const exz = Math.sqrt(Math.max(0, 1 - ey * ey));
  U.uSunDir.value.set((ax / alen) * exz, ey, (az / alen) * exz).normalize();

  // day/night/golden tint (multiplicative — identity-preserving)
  const tint = new THREE.Color(1, 1, 1);
  tint.lerp(new THREE.Color(0.30, 0.34, 0.55), night * 0.85);
  tint.lerp(new THREE.Color(1.24, 0.88, 0.64), warm * 0.55);

  U.uZen.value.set(look.sky.zen).multiply(tint);
  U.uHor.value.set(look.sky.hor).multiply(tint);
  U.uSkySunCol.value.set(look.sky.sun).multiply(tint);
  U.uSunFogCol.value.set(look.sky.hor).multiply(tint);
  U.uCloudCol.value.set(look.sky.cloudCol).multiply(tint);
  U.uFogCol.value.set(look.fog.color).multiply(tint);

  // stars belong to the night — floor from the look so smoggy looks stay starless
  const starFloor = 0.4 * (1 - clamp01(look.sky.haze));
  U.uStars.value = Math.max(look.sky.stars, starFloor) * night + look.sky.stars * 0.12;

  // light + windows wake up as the sun goes down
  U.uSunCol.value.set(look.light.sun).multiply(tint);
  U.uSunK.value = look.light.sunK * (0.22 + 0.85 * elev + warm * 0.35);
  U.uAmb.value.set(look.light.amb).multiply(tint);
  U.uAmbG.value.set(look.light.ambG).multiply(tint);
  U.uWinGlow.value = look.tower.winGlow * (tune.glow ?? 1) * (1 + night * 1.15);
  U.uLightK.value = clamp01(tune.lights ?? 1) * (0.35 + night * 0.75 + warm * 0.3);
  U.uBeaconCol.value.set(look.tower.winC === '#000000' ? look.accent : look.tower.winC);

  return { hour: h, elev, night, warm };
}
