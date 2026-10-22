// Integration smoke tests: real three.js (no WebGL needed for these layers).
// Run: node --test tests/scene.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { LOOKS, LOOK_BY_ID, syncCustomLook } from '../src/looks.js';
import { WEATHER_VERT, SKY_FRAG } from '../src/shaders.js';
import { makePostProcessor, POST_VERT, BRIGHT_FRAG, BLUR_FRAG, COMP_FRAG } from '../src/post.js';
import {
  makeUniforms, makeWorld, growCity, applyLook, applyTime,
  buildLandmarks, buildBeacons, buildPlaces, makeLamps, makeLandmarkMaterial,
  makeVehicles, makeSearchlights, makeLightPools,
  buildWater, buildBoulevards, buildBillboards, buildTrees, buildSculptures,
  makeWeather, WEATHER_NAMES, buildSigns, buildHolos,
} from '../src/scene.js';
import { FlyControls } from '../src/controls.js';

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
  const mats = [world.skyMat, world.groundMat, world.towerMat, world.beaconMat, world.lampMat, world.trailMat, world.beamMat, world.poolMat, world.waterMat, world.billMat, world.holoMat, makeLandmarkMaterial(U, '#334455')];
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
  assert.equal(veh.bodies.length, 8, 'pods, skimmers, haulers, drones, helis, blimps, shuttles, spinners');
  assert.equal(veh.beams.length, 8);
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

test('signage, holograms and venue districts build: more lights, more life', () => {
  const U = makeUniforms();
  const world = makeWorld(U);
  const { city } = growCity(4417, 6, world.towerMat);

  // signs: neon blades / rooftop wordmarks with seeds for the animation
  const signs = buildSigns(city, world.billMat);
  assert.ok(signs.isInstancedMesh);
  assert.equal(signs.count, city.signs.length);
  assert.ok(signs.geometry.getAttribute('aSeed'), 'signs carry seeds');
  assert.ok(city.signs.length > 0, 'city produces signage');

  // giant holographic displays + volumetric cones beneath
  const holos = buildHolos(city, world.holoMat, world.beamMat);
  assert.ok(city.holos.length >= 4, `expected several giant holograms, got ${city.holos.length}`);
  assert.ok(holos.children.length >= city.holos.length + 1, 'projector cones + holo instanced meshes');
  for (const H of city.holos) {
    assert.ok(H.w > 35 && H.h > 25, `holo size ${H.w}x${H.h}`);
    assert.ok(Number.isFinite(H.rot));
  }

  // diagonal boulevards build road ribbons
  const bvds = buildBoulevards(city, U);
  assert.equal(bvds.children.length, city.boulevards.length * 2, 'road + glowing centre stripe per boulevard');

  // arena, movie theatre & stadium sites all exist and build richly
  const kinds = new Set(city.places.map((p) => p.kind));
  assert.ok(kinds.has('arena'), 'has an arena');
  assert.ok(kinds.has('theatre'), 'has a movie theatre');
  assert.ok(kinds.has('stadium'), 'has a stadium');
  const pl = buildPlaces(city, U);
  let meshes = 0;
  pl.traverse((o) => { if (o.isMesh) meshes++; });
  assert.ok(meshes >= city.places.length * 8, `place meshes=${meshes}`);
});

test('vehicles glide on lane profiles, never enter buildings, and collision toggles', () => {
  const U = makeUniforms();
  const world = makeWorld(U);
  const { city, collider } = growCity(4417, 6, world.towerMat);
  const veh = makeVehicles(city, world.trailMat, 160, collider);

  // glide nodes: air lanes carry vertical profiles clearing the rooftops
  const air = city.lanes.filter((L) => L.prof);
  assert.ok(air.length > 0, 'lanes have glide profiles');
  for (const L of air.slice(0, 12)) {
    for (const y of L.prof) assert.ok(Number.isFinite(y) && y >= L.y - 1, `profile y=${y}`);
  }
  const climbers = air.filter((L) => Math.max(...L.prof) > L.y + 30);
  assert.ok(climbers.length > 0, 'some lanes glide up over the skyline');

  // advance traffic through multiple steps and verify zero vehicles clip into buildings
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  for (let step = 0; step < 12; step++) {
    veh.update(0.35, 1);
    for (let cc = 0; cc < veh.bodies.length; cc++) {
      const inst = veh.bodies[cc];
      for (let i = 0; i < inst.count; i++) {
        inst.getMatrixAt(i, m);
        m.decompose(p, q, s);
        assert.equal(
          collider.hitsPoint(p.x, p.y, p.z, 1.5),
          false,
          `vehicle class ${cc}#${i} clipped building at (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`
        );
      }
    }
  }

  // collision API: default on, toggles off without breaking updates
  assert.equal(veh.collision, true);
  veh.setCollision(false);
  assert.equal(veh.collision, false);
  veh.update(0.016, 1);
  veh.setCollision(true);
  assert.equal(veh.collision, true);
});

test('FlyControls glide mode cruises toward scenic nodes and respects collision toggle', () => {
  const prevWin = globalThis.window;
  globalThis.window = { addEventListener() {} };
  try {
    const cam = new THREE.PerspectiveCamera(62, 1, 2, 28000);
    cam.position.set(400, 180, 400);
    cam.lookAt(0, 120, 0);
    const fakeDom = { addEventListener() {}, setPointerCapture() {} };
    const ctl = new FlyControls(cam, fakeDom);
    const U = makeUniforms();
    const world = makeWorld(U);
    const { city, collider } = growCity(4417, 5, world.towerMat);
    ctl.collider = collider;
    ctl.glideTarget = { x: -300, y: 150, z: -200 };
    ctl.setGlide(true);
    const start = cam.position.clone();
    for (let i = 0; i < 20; i++) ctl.update(0.05);
    assert.ok(cam.position.distanceTo(start) > 40, 'glide mode moves camera forward');
    assert.equal(collider.hitsPoint(cam.position.x, cam.position.y, cam.position.z, 2), false, 'gliding camera stays out of buildings');

    // Place camera inside a solid building: collision=true pushes it out, collision=false allows noclip
    let bi = 0;
    while (bi < city.count && city.h[bi] < 60) bi++;
    cam.position.set(city.x[bi], city.y[bi], city.z[bi]);
    ctl.setGlide(false);
    ctl.collision = false;
    ctl.update(0.016);
    assert.equal(collider.hitsPoint(cam.position.x, cam.position.y, cam.position.z, 0), true, 'noclip when collision off');
    ctl.collision = true;
    ctl.update(0.016);
    assert.equal(collider.hitsPoint(cam.position.x, cam.position.y, cam.position.z, 1), false, 'pushed clear when collision on');
  } finally {
    globalThis.window = prevWin;
  }
});

test('theme-consistent lights, billboards & vehicles: Metropolis is strictly monochrome, Custom theme updates live', () => {
  const U = makeUniforms();
  const world = makeWorld(U);
  const { city, collider } = growCity(4417, 4, world.towerMat);
  const veh = makeVehicles(city, world.trailMat, 80, collider);

  // Metropolis: uBillMono = 1, warm silver/ivory palette, zero saturated neon colours
  applyLook(U, LOOK_BY_ID.metropolis);
  assert.equal(U.uBillMono.value, 1, 'Metropolis enforces monochrome billboards & holograms');
  const chromaOf = (c) => Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
  assert.ok(chromaOf(U.uBillA.value) < 0.22, `Metropolis uBillA chroma=${chromaOf(U.uBillA.value)}`);
  assert.ok(chromaOf(U.uBillB.value) < 0.22, `Metropolis uBillB chroma=${chromaOf(U.uBillB.value)}`);
  assert.ok(chromaOf(U.uBeamCol.value) < 0.22, 'Metropolis searchlights stay silver/tungsten');
  assert.ok(chromaOf(U.uLampCol.value) < 0.28, 'Metropolis streetlamps stay warm tungsten');

  veh.setPalette(LOOK_BY_ID.metropolis);
  const trailCol = veh.trails.geometry.getAttribute('aColor');
  for (let i = 0; i < 40; i++) {
    const r = trailCol.getX(i);
    const g = trailCol.getY(i);
    const b = trailCol.getZ(i);
    assert.ok(Math.max(r, g, b) - Math.min(r, g, b) < 0.28, `Metropolis vehicle#${i} had saturated colour (${r},${g},${b})`);
  }

  // Custom palette updates sky, towers, billboards & monochrome option in-place
  const custom = syncCustomLook({
    zen: '#102030', hor: '#e06040', base: '#1a2536',
    win: '#ffd060', accent: '#20e0a0', sec: '#40b0ff',
    style: 'toon', mono: false,
  });
  applyLook(U, custom);
  assert.equal(U.uZen.value.getHexString(), '102030');
  assert.equal(U.uBillA.value.getHexString(), '20e0a0');
  assert.equal(U.uBillMono.value, 0);
  assert.equal(U.uToon.value, 1);

  syncCustomLook({ mono: true });
  applyLook(U, LOOK_BY_ID.custom);
  assert.equal(U.uBillMono.value, 1, 'Custom mono toggle locks signs to monochrome');
});

test('weather falls downward (never upward), carries 3D dust motes & StormyClouds sky styles', () => {
  // Verify WEATHER_VERT subtracts uTime * aSpeed so positive speeds move -Y (downward)
  assert.match(WEATHER_VERT, /-\s*uTime\s*\*\s*aSpeed/, 'precipitation must subtract uTime * aSpeed to fall downward');

  const U = makeUniforms();
  const w = makeWeather(U);
  assert.equal(WEATHER_NAMES.length, 7);
  assert.ok(w.dust && w.dust.isPoints, '3D ambient dust motes Points cloud exists');

  // Verify positive speeds on rain, snow & ash, and confirm y decreases as time advances
  for (const sys of [w.rain, w.snow, w.ash]) {
    const spd = sys.geometry.getAttribute('aSpeed').array;
    const off = sys.geometry.getAttribute('aOff').array;
    const fallH = sys.material.uniforms.uFallH.value;
    assert.ok(spd[0] > 0, 'particle speed > 0');
    const mod = (x, m) => ((x % m) + m) % m;
    const yAt = (time) => mod(off[0] - time * spd[0], fallH) - fallH * 0.5;
    // Choose a time window away from wrap seam and verify dy < 0
    const t0 = ((off[0] - fallH * 0.6) / spd[0]) + 10 * (fallH / spd[0]);
    const y0 = yAt(t0);
    const y1 = yAt(t0 + 0.05);
    assert.ok(y1 < y0, `expected downward motion y1(${y1}) < y0(${y0})`);
  }

  // Modes 0..6 toggle rain/snow/ash, street wetness & dust motes
  w.setMode(1);
  assert.equal(w.rain.visible, true);
  assert.ok(U.uWetness.value > 0.5, 'rain wets the streets');
  w.setMode(2);
  assert.equal(U.uWetness.value, 1.0, 'storm maximizes street wetness');
  w.setMode(5);
  assert.equal(w.rain.visible, false);
  assert.equal(w.dust.visible, true, 'dust haze boosts motes');
  w.setMode(6);
  assert.equal(w.rain.visible, true, 'old-film storm drives rain');
  w.setDust(0);
  assert.equal(w.dust.visible, false, 'dust slider at 0 hides motes');
  w.setDust(0.8);
  assert.equal(w.dust.visible, true);

  // StormyClouds styles 0..6 are wired through applyLook/applyTime & SKY_FRAG
  assert.match(SKY_FRAG, /uCloudStyle/);
  assert.match(SKY_FRAG, /filmGrainSky/);
  assert.match(SKY_FRAG, /mezzotintArc/);
  applyLook(U, LOOK_BY_ID.metropolis, { win: 1, glow: 1, fog: 1, cloudStyle: 3 });
  assert.equal(U.uCloudStyle.value, 3);
  applyTime(U, LOOK_BY_ID.metropolis, 21.4, { cloudStyle: 5 });
  assert.equal(U.uCloudStyle.value, 5);
});

test('post-processing stack (bloom, lens FX, color grading, old-film) matches shader contracts', () => {
  const declared = (src) => {
    const names = new Set();
    for (const m of src.matchAll(/uniform\s+\w+\s+(\w+)/g)) names.add(m[1]);
    return names;
  };
  let renderCalls = 0;
  const fakeRenderer = {
    setRenderTarget() {},
    render() { renderCalls++; },
  };
  const post = makePostProcessor(fakeRenderer);
  for (const mat of [post.brightMat, post.blurMat, post.compMat]) {
    const used = new Set([...declared(mat.vertexShader), ...declared(mat.fragmentShader)]);
    for (const name of used) assert.ok(mat.uniforms[name], `${name} missing on post material`);
    for (const name of Object.keys(mat.uniforms)) assert.ok(used.has(name), `${name} unused in post shader`);
  }
  assert.equal(post.brightMat.vertexShader, POST_VERT);
  assert.equal(post.brightMat.fragmentShader, BRIGHT_FRAG);
  assert.equal(post.blurMat.fragmentShader, BLUR_FRAG);
  assert.equal(post.compMat.fragmentShader, COMP_FRAG);

  post.setSize(1280, 720, 1.25);
  assert.equal(post.sceneRT.width, 1600);
  assert.equal(post.sceneRT.height, 900);

  post.configure({ bloom: 1.2, lens: 0.7, contrast: 1.15, temp: -0.2, sat: 1.1, vignette: 0.6, film: 0.45, tint: '#00e5ff' });
  assert.equal(post.compMat.uniforms.uBloom.value, 1.2);
  assert.equal(post.compMat.uniforms.uLens.value, 0.7);
  assert.equal(post.compMat.uniforms.uContrast.value, 1.15);
  assert.equal(post.compMat.uniforms.uTemp.value, -0.2);
  assert.equal(post.compMat.uniforms.uFilm.value, 0.45);

  post.render(new THREE.Scene(), new THREE.PerspectiveCamera(), 4.2);
  assert.equal(renderCalls, 7, 'scene + bright + 4 separable blur passes + final composite');
});
