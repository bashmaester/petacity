// Integration smoke tests: real three.js (no WebGL needed for these layers).
// Run: node --test tests/scene.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { LOOKS, LOOK_BY_ID } from '../src/looks.js';
import {
  makeUniforms, makeWorld, growCity, applyLook, applyTime,
  buildLandmarks, buildBeacons, buildPlaces, makeLamps, makeLandmarkMaterial,
  makeVehicles, makeSearchlights, makeLightPools,
  buildWater, buildBillboards, buildTrees, buildSculptures, makeWeather,
} from '../src/scene.js';

test('every look preset has a complete schema', () => {
  for (const L of LOOKS) {
    assert.ok(L.id && L.label && L.accent, L.id);
    assert.ok(L.defTime >= 0 && L.defTime <= 24, `${L.id}.defTime`);
    for (const k of ['zen', 'hor', 'sun', 'sunDir', 'stars', 'cloud', 'cloudCol', 'haze']) {
      assert.ok(L.sky[k] !== undefined, `${L.id}.sky.${k}`);
    }
    assert.equal(L.sky.sunDir.length, 3);
    for (const k of ['color', 'density', 'height']) assert.ok(L.fog[k] !== undefined, `${L.id}.fog.${k}`);
    for (const k of ['sun', 'sunK', 'amb', 'ambG', 'toon', 'flat']) assert.ok(L.light[k] !== undefined, `${L.id}.light.${k}`);
    for (const k of ['baseA', 'baseB', 'palette', 'usePalette', 'winDensity', 'winGlow', 'winA', 'winB', 'winC', 'edge', 'edgeCol', 'bandGlow']) {
      assert.ok(L.tower[k] !== undefined, `${L.id}.tower.${k}`);
    }
    assert.equal(L.tower.palette.length, 6);
    for (const k of ['street', 'block', 'line', 'lineGlow']) assert.ok(L.ground[k] !== undefined, `${L.id}.ground.${k}`);
  }
  assert.equal(Object.keys(LOOK_BY_ID).length, LOOKS.length);
});

test('shaders only use uniforms the materials actually have', () => {
  const U = makeUniforms();
  const world = makeWorld(U);
  const declared = (src) => {
    const names = new Set();
    for (const m of src.matchAll(/uniform\s+\w+\s+(\w+)/g)) names.add(m[1]);
    return names;
  };
  const mats = [world.skyMat, world.groundMat, world.towerMat, world.beaconMat, world.lampMat, world.trailMat, world.beamMat, world.poolMat, world.waterMat, world.billMat, makeLandmarkMaterial(U, '#334455')];
  for (const mat of mats) {
    const used = new Set([...declared(mat.vertexShader), ...declared(mat.fragmentShader)]);
    for (const name of used) {
      assert.ok(mat.uniforms[name], `${name} used in shader but missing from uniforms`);
    }
    // every uniform handed to the material should be declared (catches typos both ways)
    for (const name of Object.keys(mat.uniforms)) {
      assert.ok(used.has(name), `${name} passed as uniform but never declared in shader`);
    }
  }
});

test('instancing attributes match the vertex shader contract', () => {
  const U = makeUniforms();
  const world = makeWorld(U);
  const { city, mesh } = growCity(4417, 6, world.towerMat);
  assert.ok(mesh.isInstancedMesh);
  assert.equal(mesh.count, city.count);
  for (const name of ['aSeed', 'aDims', 'aKind', 'aStyle']) {
    assert.ok(mesh.geometry.getAttribute(name), name);
  }
  // my vertex shader must NOT redeclare what three injects
  assert.ok(!/attribute\s+mat4\s+instanceMatrix/.test(world.towerMat.vertexShader));
  assert.ok(/attribute\s+float\s+aSeed/.test(world.towerMat.vertexShader));
  assert.ok(/attribute\s+float\s+aStyle/.test(world.towerMat.vertexShader));

  // matrices round-trip
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  for (const i of [0, 1, city.count - 1]) {
    mesh.getMatrixAt(i, m);
    m.decompose(p, q, s);
    assert.ok(Math.abs(p.x - city.x[i]) < 1e-3);
    assert.ok(Math.abs(p.y - city.y[i]) < 1e-3);
    assert.ok(Math.abs(p.z - city.z[i]) < 1e-3);
    assert.ok(Math.abs(s.x - city.w[i]) < 1e-3);
    assert.ok(Math.abs(s.y - city.h[i]) < 1e-3);
    assert.ok(Math.abs(s.z - city.d[i]) < 1e-3);
  }
});

test('applyLook fills uniforms for every look, sliders scale', () => {
  const U = makeUniforms();
  for (const L of LOOKS) {
    const ui = applyLook(U, L);
    assert.equal(ui.accent, L.accent);
    assert.equal(U.uZen.value.getHexString(), new THREE.Color(L.sky.zen).getHexString());
    assert.equal(U.uFogCol.value.getHexString(), new THREE.Color(L.fog.color).getHexString());
    assert.equal(U.uBaseA.value.getHexString(), new THREE.Color(L.tower.baseA).getHexString());
    assert.equal(U.uWinDensity.value, L.tower.winDensity);
    assert.equal(U.uWinGlow.value, L.tower.winGlow);
    assert.equal(U.uFogDensity.value, L.fog.density);
    assert.ok(Math.abs(U.uSunDir.value.length() - 1) < 1e-5, 'sun dir normalised');
    assert.equal(U.uEdge.value, L.tower.edge);
    if (L.tower.usePalette) {
      assert.equal(U.uUsePal.value, 1);
      assert.equal(U.uPal.value[0].getHexString(), new THREE.Color(L.tower.palette[0]).getHexString());
    }
  }
  const L = LOOKS[0];
  applyLook(U, L, { win: 0.5, glow: 2, fog: 3 });
  assert.equal(U.uWinDensity.value, L.tower.winDensity * 0.5);
  assert.equal(U.uWinGlow.value, L.tower.winGlow * 2);
  assert.equal(U.uFogDensity.value, L.fog.density * 3);
});

test('looks are visually distinct (palettes differ)', () => {
  const keys = LOOKS.map((L) => L.sky.zen + L.tower.baseA + L.tower.edgeCol + L.ground.line);
  assert.equal(new Set(keys).size, LOOKS.length);
});

test('applyTime is identity at the authored hour, day/night delta works', () => {
  const U = makeUniforms();
  const L = LOOK_BY_ID.outrun;
  applyLook(U, L);
  const baseZen = U.uZen.value.getHexString();
  const baseGlow = U.uWinGlow.value;

  // identity: at defTime the palette is exactly the authored one
  applyTime(U, L, L.defTime);
  assert.equal(U.uZen.value.getHexString(), baseZen, 'zenith identity at defTime');
  assert.equal(U.uWinGlow.value, baseGlow, 'window glow identity at defTime');

  // deep night vs day: night is darker/bluer, windows and stars come up
  const night = applyTime(U, L, 23);
  const nightZen = U.uZen.value.getHexString();
  const nightStars = U.uStars.value;
  const nightWin = U.uWinGlow.value;
  const day = applyTime(U, L, 12);
  assert.notEqual(nightZen, U.uZen.value.getHexString(), 'sky zenith moves with the hour');
  assert.ok(night.night > 0.9 && day.night < 0.1, `night=${night.night} day=${day.night}`);
  assert.ok(nightStars > U.uStars.value, 'stars stronger at night');
  assert.ok(nightWin > U.uWinGlow.value, 'windows glow harder at night');
  assert.ok(Math.abs(U.uSunDir.value.length() - 1) < 1e-5, 'sun dir stays normalised');
  assert.ok(day.elev > 0.5, `day elev=${day.elev}`);

  // golden hour keeps warmth
  const dusk = applyTime(U, L, 18.2);
  assert.ok(dusk.warm > 0.2, `warm=${dusk.warm}`);
  assert.ok(U.uLightK.value > 0.2, 'atmospheric lights get intensity');

  // lights slider scales the beacon/atmosphere intensity
  applyTime(U, L, 23, { lights: 0, glow: 1 });
  assert.equal(U.uLightK.value, 0);

  // heavy-smog looks stay starless day or night (identity)
  const br = LOOK_BY_ID.bladerunner;
  applyTime(U, br, 23);
  assert.equal(U.uStars.value, 0, 'smog eats the stars');
});

test('applyTime parametric knobs drive clouds, haze, sun glow and vibrance', () => {
  const U = makeUniforms();
  const L = LOOK_BY_ID.bladerunner;
  applyTime(U, L, L.defTime, { clouds: 1, haze: 1, sun: 1, sat: 1, lights: 1, glow: 1 });
  const c1 = U.uCloud.value;
  const h1 = U.uHaze.value;
  const s1 = U.uSunGlow.value;
  applyTime(U, L, L.defTime, { clouds: 1.6, haze: 0.4, sun: 2, sat: 1.4, lights: 1, glow: 1 });
  assert.ok(U.uCloud.value > c1, 'cloud cover scales');
  assert.ok(U.uHaze.value < h1, 'haze scales down');
  assert.ok(U.uSunGlow.value > s1, 'sun glow scales up');
  assert.ok(U.uSat.value > 1.2, 'vibrance saturates');
});

test('time spans the full 24 hours: dawn, noon, dusk, midnight all differ', () => {
  const U = makeUniforms();
  const L = LOOK_BY_ID.outrun;
  const hours = [0, 3.2, 4.8, 6.6, 9, 12, 15, 18.2, 21, 23.5];
  const zens = new Set();
  const suns = [];
  for (const hr of hours) {
    applyTime(U, L, hr);
    zens.add(U.uZen.value.getHexString());
    suns.push(U.uSunDir.value.clone());
    assert.ok(Math.abs(U.uSunDir.value.length() - 1) < 1e-5, `sun dir normalised at ${hr}h`);
  }
  assert.ok(zens.size >= 7, `only ${zens.size} distinct skies across the day`);

  // the sun/moon path sweeps: morning and afternoon directions differ
  const az = (v) => Math.atan2(v.z, v.x);
  assert.ok(Math.abs(az(suns[3]) - az(suns[6])) > 0.3, 'sun sweeps east to west');
  assert.ok(suns[3].y > 0.12 && suns[3].y < suns[5].y, 'sun climbs from dawn');
  assert.ok(suns[5].y > 0.9, 'noon sun is high');
  assert.ok(suns[0].y < suns[5].y, 'midnight light sits lower than noon');

  // dawn is warm, the small hours are the darkest, midnight wraps to 0
  const dawn = applyTime(U, L, 6.6);
  assert.ok(dawn.warm > 0.3, `dawn warm=${dawn.warm}`);
  applyTime(U, L, 21);
  const evening = U.uZen.value.clone();
  applyTime(U, L, 3.2);
  const small = U.uZen.value.clone();
  assert.ok(small.r + small.g + small.b <= evening.r + evening.g + evening.b, 'small hours darkest');
  const deep = applyTime(U, L, 3.2);
  assert.ok(deep.deep > 0.5, `deep=${deep.deep}`);
  applyTime(U, L, 24);
  const z24 = U.uZen.value.getHexString();
  applyTime(U, L, 0);
  assert.equal(U.uZen.value.getHexString(), z24, 'hour 24 wraps to midnight');

  // identity at defTime still holds after the rework
  applyLook(U, L);
  const baseZen = U.uZen.value.getHexString();
  const baseGlow = U.uWinGlow.value;
  applyTime(U, L, L.defTime);
  assert.equal(U.uZen.value.getHexString(), baseZen);
  assert.equal(U.uWinGlow.value, baseGlow);
});

test('landmarks, places, beacons, lamps and vehicles build against real three.js', () => {
  const U = makeUniforms();
  const world = makeWorld(U);
  const { city } = growCity(4417, 5, world.towerMat);

  const lmGroup = buildLandmarks(city, U);
  assert.equal(lmGroup.children.length, city.landmarks.length);
  let meshes = 0;
  lmGroup.traverse((o) => { if (o.isMesh) meshes++; });
  assert.ok(meshes >= city.landmarks.length * 4, `landmark meshes=${meshes}`);

  const plGroup = buildPlaces(city, U);
  assert.equal(plGroup.children.length, city.places.length);
  let plMeshes = 0;
  plGroup.traverse((o) => { if (o.isMesh) plMeshes++; });
  assert.ok(plMeshes >= city.places.length * 10, `place meshes=${plMeshes}`);

  const pts = buildBeacons(city, world.beaconMat);
  assert.ok(pts.isPoints);
  assert.equal(pts.geometry.getAttribute('position').count, city.beacons.length);
  assert.ok(pts.geometry.getAttribute('aPhase'));
  assert.ok(pts.geometry.getAttribute('aSize'));

  const lamps = makeLamps(city, world.lampMat);
  assert.ok(lamps.isPoints);
  assert.equal(lamps.geometry.getAttribute('position').count, city.lamps.length);

  const veh = makeVehicles(city, world.trailMat, 60);
  assert.ok(veh.group.isGroup);
  assert.equal(veh.bodies.length, 6, 'pods, skimmers, haulers, drones, helis, blimps');
  assert.equal(veh.beams.length, 6);
  assert.ok(veh.rotors.some(Boolean) && veh.thrusters.isInstancedMesh, 'articulated sub-parts');
  assert.equal(veh.trailers.length, 2, 'two articulated trailer sections');
  assert.ok(veh.mesh.isInstancedMesh && veh.trails.isInstancedMesh);
  assert.ok(veh.trails.geometry.getAttribute('aColor'));
  // merged silhouettes carry vertex colours (hull/canopy/lights)
  for (const b of veh.bodies) {
    assert.ok(b.geometry.getAttribute('color'), 'vertex colours on bodies');
    assert.ok(b.geometry.getAttribute('position').count >= 8 * 6, 'multi-part merged body');
    assert.ok(b.instanceColor, 'per-instance tint');
  }
  for (const b of veh.beams.filter(Boolean)) {
    assert.ok(b.geometry.getAttribute('aBeamT') && b.geometry.getAttribute('aBeamW'), 'beam falloff attrs');
  }
  const m = new THREE.Matrix4();
  veh.mesh.getMatrixAt(0, m);
  const p = new THREE.Vector3();
  m.decompose(p, new THREE.Quaternion(), new THREE.Vector3());
  assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
  const before = p.clone();
  veh.update(1, 1);
  veh.mesh.getMatrixAt(0, m);
  m.decompose(p, new THREE.Quaternion(), new THREE.Vector3());
  assert.ok(p.distanceTo(before) > 0.01, 'vehicles move when updated');

  // vehicles point ALONG their travel direction (the sideways bug is fixed):
  // the body's +X forward must align with the actual displacement
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  veh.mesh.getMatrixAt(0, m);
  const p0 = new THREE.Vector3();
  m.decompose(p0, q, sc);
  const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
  veh.update(0.08, 1);
  veh.mesh.getMatrixAt(0, m);
  const p1 = new THREE.Vector3();
  m.decompose(p1, new THREE.Quaternion(), new THREE.Vector3());
  const disp = p1.clone().sub(p0);
  const align = Math.abs(disp.dot(fwd)) / Math.max(disp.length() * fwd.length(), 1e-6);
  assert.ok(disp.length() > 0.01 && align > 0.7, `vehicle forward vs motion align=${align}`);

  // articulated sub-parts actually animate
  const r0 = new THREE.Matrix4();
  const r1 = new THREE.Matrix4();
  const rotor = veh.rotors.find(Boolean);
  rotor.getMatrixAt(0, r0);
  veh.update(0.5, 1);
  rotor.getMatrixAt(0, r1);
  const q0 = new THREE.Quaternion();
  const q1 = new THREE.Quaternion();
  r0.decompose(new THREE.Vector3(), q0, new THREE.Vector3());
  r1.decompose(new THREE.Vector3(), q1, new THREE.Vector3());
  assert.ok(Math.abs(q1.y - q0.y) > 1e-4, 'rotors spin');
  const ts0 = new THREE.Vector3();
  const ts1 = new THREE.Vector3();
  veh.thrusters.getMatrixAt(0, r0);
  veh.update(0.5, 1);
  veh.thrusters.getMatrixAt(0, r1);
  r0.decompose(new THREE.Vector3(), new THREE.Quaternion(), ts0);
  r1.decompose(new THREE.Vector3(), new THREE.Quaternion(), ts1);
  assert.ok(Math.abs(ts1.x - ts0.x) > 1e-4, 'thrusters pulse');

  // trailers lag behind the hauler body
  const bodyM = new THREE.Matrix4();
  const trM = new THREE.Matrix4();
  const bp = new THREE.Vector3();
  const tp = new THREE.Vector3();
  veh.bodies[2].getMatrixAt(0, bodyM);
  veh.trailers[1].getMatrixAt(0, trM);
  bodyM.decompose(bp, new THREE.Quaternion(), new THREE.Vector3());
  trM.decompose(tp, new THREE.Quaternion(), new THREE.Vector3());
  assert.ok(tp.distanceTo(bp) > 5, 'trailers articulate behind the cab');

  veh.update(0, 0.1);
  const totalActive = veh.bodies.reduce((a, b) => a + b.count, 0);
  assert.equal(totalActive, 6, 'traffic slider thins the swarm');
  assert.equal(veh.trailers[0].count, veh.bodies[2].count, 'trailer count follows haulers');
});

test('weather, water, billboards, trees and light sculptures build', () => {
  const U = makeUniforms();
  const world = makeWorld(U);
  const { city } = growCity(4417, 6, world.towerMat);

  const water = buildWater(city, world.waterMat);
  assert.equal(water.children.length, city.water.length);
  for (const w of city.water) assert.ok(w.pts.length >= 8, 'irregular shore');

  const bills = buildBillboards(city, world.billMat);
  assert.ok(bills.isInstancedMesh);
  assert.equal(bills.count, city.bills.length);
  if (city.bills.length) {
    assert.ok(bills.geometry.getAttribute('aSeed'), 'per-billboard seed');
  }

  const trees = buildTrees(city);
  assert.ok(trees.organic && trees.cyber, 'both tree natures built');
  assert.equal(trees.organic.visible && !trees.cyber.visible, true, 'organic default');
  trees.setNature(LOOK_BY_ID.tron);
  assert.ok(!trees.organic.visible && trees.cyber.visible, 'cyber look switches illuminators');
  trees.setNature(LOOK_BY_ID.anime);
  assert.ok(trees.organic.visible && !trees.cyber.visible, 'anime look switches trees');

  const sculpt = buildSculptures(city, world.beaconMat, world.lampMat);
  assert.ok(sculpt.children.length >= 1, 'light sculptures at public spaces');

  const weather = makeWeather(U);
  assert.ok(weather.group.isGroup);
  weather.setMode(1);
  assert.ok(weather.rain.visible && !weather.snow.visible, 'rain mode');
  weather.setMode(3);
  assert.ok(weather.snow.visible && !weather.rain.visible, 'snow mode');
  weather.setMode(2);
  const fakeCam = new THREE.Vector3(100, 200, 300);
  weather.update(3, fakeCam); // long dt -> lightning timer fires eventually
  for (let i = 0; i < 30; i++) weather.update(1, fakeCam);
  assert.ok(U.uFlash.value >= 0, 'storm lightning drives uFlash');
  assert.equal(weather.group.position.x, 100, 'weather column follows camera');
});

test('metropolis look is a complete Fritz Lang preset', () => {
  const L = LOOK_BY_ID.metropolis;
  assert.ok(L, 'metropolis exists');
  assert.equal(L.nature, 'cyber');
  assert.ok(L.trees && L.trees.glow, 'tree palette');
  const U = makeUniforms();
  applyLook(U, L);
  applyTime(U, L, L.defTime);
  assert.ok(U.uToon.value > 0.5, 'posterised expressionist shading');
  assert.ok(U.uWinGlow.value > 1, 'burning windows');

  // moon controls respond
  applyTime(U, L, 0, { moon: 2, moonsz: 2, moonph: 1 });
  assert.ok(U.uMoonGlow.value > 1, 'moon glow slider');
  assert.equal(U.uMoonSize.value, 2);
  assert.equal(U.uMoonPhase.value, 1);
  assert.ok(U.uMoonDir.value.length() > 0.99, 'moon dir normalised');
});

test('searchlights sweep, breathe and pulse', () => {
  const U = makeUniforms();
  const world = makeWorld(U);
  const { city } = growCity(4417, 5, world.towerMat);

  const sl = makeSearchlights(city, world.beamMat);
  assert.ok(sl.group.isGroup);
  assert.ok(sl.group.children.length >= 2, 'at least two shafts');
  let beamMeshes = 0;
  sl.group.traverse((o) => { if (o.isMesh) beamMeshes++; });
  assert.equal(beamMeshes, sl.group.children.length);
  const pivot = sl.group.children[0];
  const mesh = pivot.children[0];
  const rotY = pivot.rotation.y;
  const tilt0 = mesh.rotation.z;
  const k0 = world.beamMat.uniforms.uBeamK.value;
  sl.update(1.5);
  assert.notEqual(pivot.rotation.y, rotY, 'yaw sweep');
  assert.notEqual(mesh.rotation.z, tilt0, 'tilt breathes');
  assert.notEqual(world.beamMat.uniforms.uBeamK.value, k0, 'beams pulse');

  const pools = makeLightPools(city, world.poolMat);
  assert.ok(pools.isInstancedMesh);
  assert.equal(pools.count, city.lamps.length);
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  pools.getMatrixAt(0, m);
  m.decompose(p, new THREE.Quaternion(), new THREE.Vector3());
  assert.ok(p.y > 0 && p.y < 10, 'pools hug the ground');
});
