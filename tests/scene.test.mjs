// Integration smoke tests: real three.js (no WebGL needed for these layers).
// Run: node --test tests/scene.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { LOOKS, LOOK_BY_ID, syncCustomLook } from '../src/looks.js';
import * as SHADERS from '../src/shaders.js';
import { WEATHER_VERT, SKY_FRAG, GROUND_FRAG, CLOUD_VERT, CLOUD_FRAG } from '../src/shaders.js';
import * as POST from '../src/post.js';
import { makePostProcessor, ART_STYLE_NAMES, POST_VERT, BRIGHT_FRAG, BLUR_FRAG, COMP_FRAG } from '../src/post.js';
import {
  makeUniforms, makeWorld, growCity, syncCityEnvironmentUniforms,
  applyLook, applyTime, bendWorldPoint,
  buildLandmarks, buildBeacons, buildPlaces, makeLamps, makeLandmarkMaterial,
  makeVehicles, makeSearchlights, makeLightPools,
  buildWater, buildBoulevards, buildBillboards, buildTrees, buildSculptures,
  makeWeather, WEATHER_NAMES, CLOUD_TYPE_NAMES,
  WATER_MODE_NAMES, TERRAIN_MODE_NAMES, TREE_MODE_NAMES, describeMoonPhase,
  buildSigns, buildHolos,
} from '../src/scene.js';
import {
  WORLD_PRESETS, DEFAULT_BOOKMARKS, encodeExactState, decodeExactState,
} from '../src/presets.js';
import { FlyControls } from '../src/controls.js';
import { CameraPathRecorder, makeSceneExporter } from '../src/recorder.js';

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

  // Bypass fallback renders directly to the screen target instead of going blank
  let lastTarget = 'unset';
  const bypassRenderer = {
    setRenderTarget(rt) { lastTarget = rt; },
    render() { renderCalls++; },
  };
  const post2 = makePostProcessor(bypassRenderer);
  post2.setBypass(true);
  renderCalls = 0;
  post2.render(new THREE.Scene(), new THREE.PerspectiveCamera(), 1.0);
  assert.equal(renderCalls, 1, 'bypass mode renders scene directly in 1 pass');
  assert.equal(lastTarget, null, 'bypass mode targets default screen framebuffer');
});

test('all GLSL shaders avoid ESSL 3.00 (#version 300 es) reserved keywords', () => {
  // Three.js r170 upgrades ShaderMaterial sources to `#version 300 es` on WebGL 2,
  // where ESSL 3.00 §3.6/§3.7 keywords such as `active`, `sample`, `smooth`,
  // `filter`, `common`, `half`, `fixed`, `input`, `output` fail shader compilation.
  const ESSL300_RESERVED = new Set([
    'centroid', 'flat', 'smooth', 'case', 'switch', 'default', 'uint',
    'common', 'partition', 'active', 'asm', 'class', 'union', 'enum', 'typedef',
    'template', 'this', 'goto', 'inline', 'noinline', 'volatile', 'public',
    'static', 'extern', 'external', 'interface', 'long', 'short', 'double',
    'half', 'fixed', 'unsigned', 'superp', 'input', 'output',
    'hvec2', 'hvec3', 'hvec4', 'dvec2', 'dvec3', 'dvec4', 'fvec2', 'fvec3', 'fvec4',
    'sampler3DRect', 'filter', 'sizeof', 'cast', 'namespace', 'using',
    'row_major', 'packed', 'resource', 'sample', 'subroutine', 'coherent',
    'restrict', 'readonly', 'writeonly', 'patch',
  ]);
  const allShaders = [
    ...Object.entries(SHADERS).filter(([, v]) => typeof v === 'string'),
    ...Object.entries(POST).filter(([, v]) => typeof v === 'string'),
  ];
  assert.ok(allShaders.length >= 28, 'expected all scene and post shaders');
  for (const [name, src] of allShaders) {
    const clean = src
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/[^\n]*/g, ' ');
    for (const m of clean.matchAll(/\b([A-Za-z_]\w*)\b/g)) {
      assert.ok(
        !ESSL300_RESERVED.has(m[1]),
        `${name} uses ESSL 3.00 reserved keyword "${m[1]}"`
      );
    }
  }
});

test('ground is a polar radial disc whose edge disappears smoothly via alpha', () => {
  const U = makeUniforms();
  const world = makeWorld(U);
  assert.equal(world.groundMat.transparent, true, 'groundMat uses alpha blending for feathering');
  assert.match(GROUND_FRAG, /edgeAlpha/, 'GROUND_FRAG computes radial edgeAlpha');
  assert.match(GROUND_FRAG, /gl_FragColor\s*=\s*vec4\([\s\S]+?,\s*edgeAlpha\s*\)/, 'GROUND_FRAG outputs feathered edgeAlpha');

  const pos = world.ground.geometry.getAttribute('position');
  const maxR = U.uGroundRadius.value;
  let maxDist = 0;
  for (let i = 0; i < pos.count; i++) {
    const d = Math.hypot(pos.getX(i), pos.getZ(i));
    if (d > maxDist) maxDist = d;
  }
  assert.ok(Math.abs(maxDist - maxR) < 1, `polar ground disc outer radius=${maxDist} matches uGroundRadius=${maxR} (no square corners)`);
});

test('clouds are genuinely volumetric raymarched (BackSide ellipsoid puffs + spherical sky cumulus shell, zero polygon shading)', () => {
  const U = makeUniforms();
  const world = makeWorld(U);
  assert.ok(world.clouds && world.clouds.isGroup, 'world.clouds 3D group exists');
  assert.equal(world.cloudMat.side, THREE.BackSide, 'cloud bounding volumes render BackSide for interior/exterior raymarching');
  assert.equal(world.clouds.children.length, 1, 'volumetric cloud bounding-box batch');
  const puffs = world.clouds.children[0];
  assert.ok(puffs.isMesh && puffs.geometry.instanceCount >= 32, 'instanced volumetric 3D cloud volumes built');
  assert.ok(puffs.geometry.getAttribute('aCenter') && puffs.geometry.getAttribute('aScale'), 'analytic ellipsoid center/scale attributes present');
  assert.ok(CLOUD_VERT.includes('bendWorld') && CLOUD_FRAG.includes('evalStormyPlate'), '3D cloud shaders bend with world & support StormyClouds plates');
  assert.ok(CLOUD_FRAG.includes('puffVolDensity') && !CLOUD_FRAG.includes('vN'), 'CLOUD_FRAG raymarches 3D density without polygon normal shading');
  const skyCodeOnly = SKY_FRAG.replace(/\/\/[^\n]*/g, '');
  assert.equal(/d\.xz\s*\/\s*\(?d\.y/.test(skyCodeOnly), false, 'SKY_FRAG no longer projects clouds onto a flat d.xz / d.y plane');
  assert.ok(skyCodeOnly.includes('intersectSphereShell') && skyCodeOnly.includes('skyCumulusDensity'), 'SKY_FRAG raymarches concentric spherical volumetric cumulus shell');
});

test('world curvature smoothly morphs Plane <-> Sphere and FlyControls resolves radially around globe', () => {
  const flat = bendWorldPoint(900, 120, -600, 0, 2000);
  assert.deepEqual(flat, { x: 900, y: 120, z: -600 }, 'curve=0 is exact flat-plane identity');

  const p0 = bendWorldPoint(0, 50, 0, 1, 2000);
  assert.ok(Math.abs(p0.x) < 1e-6 && Math.abs(p0.y - 50) < 1e-6 && Math.abs(p0.z) < 1e-6, 'origin stays tangent at (0, y, 0)');

  // Halfway around the globe (arc length = pi * R / 2 => equator y = -R)
  const R = 2000;
  const eq = bendWorldPoint((Math.PI * 0.5) * R, 80, 0, 1, R);
  assert.ok(Math.abs(eq.x - (R + 80)) < 1e-3, `equator x=${eq.x}`);
  assert.ok(Math.abs(eq.y - (-R)) < 1e-3, `equator y=${eq.y}`);

  // Spherical camera collision allows southern hemisphere flight while keeping camera outside planet surface
  const cam = new THREE.PerspectiveCamera(60, 1, 2, 30000);
  const fakeDom = { addEventListener() {}, setPointerCapture() {} };
  const prevWin = globalThis.window;
  globalThis.window = { addEventListener() {} };
  try {
    const ctl = new FlyControls(cam, fakeDom);
    ctl.worldCurve = 1;
    ctl.planetR = R;
    ctl.collision = true;
    // Place camera near south pole slightly inside planet surface (centre is (0, -2000, 0))
    cam.position.set(0, -3995, 0); // rho = 1995 < R+7
    const hit = ctl._resolve();
    assert.equal(hit, true, 'camera inside southern hemisphere surface pushed radially outward');
    assert.ok(cam.position.y < -4000, `southern hemisphere camera pushed outward to y=${cam.position.y} (not clamped to y>=2!)`);
  } finally {
    globalThis.window = prevWin;
  }
});

test('whole-config presets and exact-state export/decode roundtrip losslessly', () => {
  assert.ok(WORLD_PRESETS.length >= 6, 'curated whole-config world presets exist');
  const hasGlobePreset = WORLD_PRESETS.some((p) => p.state.worldCurve >= 0.9);
  assert.equal(hasGlobePreset, true, 'includes an orbital sphere preset');
  assert.ok(DEFAULT_BOOKMARKS.length >= 3, 'starter place bookmarks exist');

  const sample = {
    seed: 987654,
    lookId: 'custom',
    cityRadius: 7,
    suburbReach: 1.35,
    worldCurve: 0.72,
    heightScale: 1.24,
    timeOfDay: 21.4,
    weatherMode: 2,
    dustLevel: 0.92,
    glide: true,
    collide: false,
    tune: {
      win: 1.3, glow: 1.6, fog: 0.85, lights: 1.4, traffic: 1.15,
      clouds: 1.25, cloudStyle: 5, haze: 1.1, sun: 0.9, vib: 1.22,
      moon: 1.4, moonsz: 1.3, moonph: 0.42,
    },
    post: { bloom: 1.18, lens: 0.64, contrast: 1.14, temp: -0.22, film: 0.34 },
    custom: {
      zen: '#0a1428', hor: '#e05a44', base: '#1a263a',
      win: '#ffd468', accent: '#08dca4', sec: '#4ecaf2',
      style: 'toon', mono: true,
    },
    camera: { x: 412.35, y: 288.5, z: -615.8, yaw: -2.4123, pitch: -0.2145 },
    bookmarks: [
      { name: 'Custom Spire', x: 120.5, y: 340, z: -210.25, yaw: 0.52, pitch: -0.18 },
    ],
  };

  const token = encodeExactState(sample);
  assert.ok(typeof token === 'string' && token.length > 20, 'encoded Base64URL token produced');
  const back = decodeExactState(token);
  assert.ok(back, 'token decoded');
  assert.equal(back.seed, 987654);
  assert.equal(back.lookId, 'custom');
  assert.equal(back.cityRadius, 7);
  assert.ok(Math.abs(back.suburbReach - 1.35) < 1e-3);
  assert.ok(Math.abs(back.worldCurve - 0.72) < 1e-3);
  assert.equal(back.glide, true);
  assert.equal(back.collide, false);
  assert.equal(back.tune.cloudStyle, 5);
  assert.equal(back.custom.accent, '#08dca4');
  assert.equal(back.custom.mono, true);
  assert.ok(Math.abs(back.camera.x - 412.35) < 0.05);
  assert.ok(Math.abs(back.camera.yaw - -2.4123) < 0.001);
  assert.equal(back.bookmarks.length, 1);
  assert.equal(back.bookmarks[0].name, 'Custom Spire');

  // Raw JSON string also decodes cleanly
  const fromJson = decodeExactState(JSON.stringify(sample));
  assert.equal(fromJson.seed, 987654);
  assert.equal(fromJson.bookmarks[0].name, 'Custom Spire');
});

test('multi-strata traffic scales smoothly across 2+ orders of magnitude (0 to 20,000 vehicles) with zero vertical snap cliffs', () => {
  const U = makeUniforms();
  const world = makeWorld(U);
  const { city, collider } = growCity(4417, 5, world.towerMat);
  const veh = makeVehicles(city, world.trailMat, 1400, collider, {
    swarmMat: world.swarmMat,
    swarmCount: 18600,
  });

  assert.equal(veh.capacity, 20000, 'combined hero + GPU swarm capacity is 20,000 vehicles');

  veh.update(0, 0, 1);
  assert.equal(veh.activeCount, 0, 'density=0 disables all vehicles');

  veh.update(0, 0.1, 1);
  assert.equal(veh.activeCount, 32, 'sparse density=0.1 yields ~32 vehicles');

  veh.update(0, 1.0, 1);
  assert.equal(veh.activeCount, 320, 'baseline density=1.0 yields ~320 vehicles');

  veh.update(0, 10.0, 1);
  assert.equal(veh.activeCount, 3200, 'high density=10 yields ~3,200 vehicles');

  veh.update(0, 62.5, 1);
  assert.equal(veh.activeCount, 20000, 'max density=62.5 yields 20,000 active vehicles (2.5+ orders of magnitude over sparse!)');
  assert.ok(veh.swarm && veh.swarmGeo.instanceCount >= 18000, 'GPU Bézier swarm carries >18,000 instances');

  // Verify swarm spans at least 5 distinct vertical strata from <50m up to >660m
  const curveA = veh.swarmGeo.getAttribute('aCurveA').array;
  const strataSeen = new Set();
  for (let i = 0; i < 600; i++) {
    const yBase = curveA[i * 4 + 2];
    if (yBase < 50) strataSeen.add('canyon');
    else if (yBase < 130) strataSeen.add('low');
    else if (yBase < 255) strataSeen.add('mid');
    else if (yBase < 435) strataSeen.add('spire');
    else if (yBase < 660) strataSeen.add('cloud');
    else strataSeen.add('orbital');
  }
  assert.ok(strataSeen.size >= 5, `expected >=5 distinct altitude strata, saw ${[...strataSeen].join(',')}`);

  // Verify smooth C1 frame-to-frame motion (no per-frame rooftop snap jumps!)
  veh.update(0, 1.0, 1);
  const m = new THREE.Matrix4();
  const prevY = new Float32Array(12);
  const prevX = new Float32Array(12);
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const checkCount = Math.min(12, veh.mesh.count);
  for (let i = 0; i < checkCount; i++) {
    veh.mesh.getMatrixAt(i, m);
    m.decompose(p, q, s);
    prevX[i] = p.x;
    prevY[i] = p.y;
  }
  for (let step = 0; step < 30; step++) {
    veh.update(1 / 60, 1.0, 1);
    for (let i = 0; i < checkCount; i++) {
      veh.mesh.getMatrixAt(i, m);
      m.decompose(p, q, s);
      const dx = Math.abs(p.x - prevX[i]);
      const dy = Math.abs(p.y - prevY[i]);
      // Ignore rare open-corridor horizon wrap where X jumps >200m
      if (dx < 80) {
        assert.ok(dy < 4.0, `vehicle ${i} had vertical jump dy=${dy.toFixed(2)}m in 16ms frame`);
      }
      prevX[i] = p.x;
      prevY[i] = p.y;
    }
  }
});

test('CameraPathRecorder & makeSceneExporter record, smoothly interpolate, round-trip JSON, and export clean renders', async () => {
  const rec = new CameraPathRecorder();
  assert.equal(rec.hasPath, false);

  // Live flight recording mode with temporal smoothing & subsampling
  rec.startRecording({ x: 0, y: 100, z: 0, yaw: 0, pitch: 0 });
  assert.equal(rec.recording, true);
  for (let i = 1; i <= 30; i++) {
    rec.recordSample(0.05, {
      x: i * 10,
      y: 100 + Math.sin(i * 0.2) * 20,
      z: -i * 8,
      yaw: -0.04 * i,
      pitch: -0.05,
    });
  }
  rec.stopRecording({ x: 310, y: 112, z: -248, yaw: -1.24, pitch: -0.05 });
  assert.equal(rec.recording, false);
  assert.equal(rec.hasPath, true);
  assert.ok(rec.count >= 6 && rec.duration > 1.4, `recorded count=${rec.count} dur=${rec.duration}`);

  // Exact endpoint & smooth interior Catmull-Rom + quaternion slerp evaluation
  const pStart = rec.evaluate(0);
  const pMid = rec.evaluate(rec.duration * 0.5);
  const pEnd = rec.evaluate(rec.duration);
  assert.ok(Math.abs(pStart.x - 0) < 1e-3 && Math.abs(pEnd.x - 310) < 1e-2);
  assert.ok(pMid.x > 80 && pMid.x < 240 && Number.isFinite(pMid.yaw));

  // Apply to real THREE.PerspectiveCamera & round-trip JSON + ExactState
  const cam = new THREE.PerspectiveCamera(60, 16 / 9, 2, 30000);
  rec.applyAt(rec.duration * 0.5, cam);
  assert.ok(Math.abs(cam.position.x - pMid.x) < 1e-4);

  const json = rec.toJSON();
  const rec2 = new CameraPathRecorder();
  assert.equal(rec2.fromJSON(json), true);
  assert.equal(rec2.count, rec.count);
  assert.ok(Math.abs(rec2.duration - rec.duration) < 0.01);

  const tok = encodeExactState({ seed: 4417, path: json });
  const dec = decodeExactState(tok);
  assert.ok(dec.path && dec.path.frames.length === json.frames.length, 'exact-state token preserves recorded camera path');

  // Discrete keyframe builder + non-looping playback completion
  rec2.clear();
  rec2.loop = false;
  rec2.addKeyframe({ x: 10, y: 80, z: 20, yaw: 3.05, pitch: 0 });
  rec2.addKeyframe({ x: 110, y: 120, z: -60, yaw: -3.05, pitch: -0.1 }, 2.0); // crosses +-PI wrap!
  const wrapMid = rec2.evaluate(1.0);
  assert.ok(Math.abs(wrapMid.yaw) > 2.9, `shortest-arc slerp across +-PI gave yaw=${wrapMid.yaw}`);
  rec2.play(true);
  assert.equal(rec2.updatePlayback(1.0, cam), true);
  assert.equal(rec2.updatePlayback(1.2, cam), false, 'non-loop playback stops cleanly at end');

  // SceneExporter clean high-res PNG capture restores viewport size & pixelRatio
  let curW = 800, curH = 450, curDpr = 1.25, postCalls = 0;
  const fakeCanvas = {
    clientWidth: 800,
    clientHeight: 450,
    toBlob(cb) { cb(new Blob(['png'], { type: 'image/png' })); },
  };
  const fakeRenderer = {
    domElement: fakeCanvas,
    getPixelRatio: () => curDpr,
    setPixelRatio(d) { curDpr = d; },
    getSize(v) { v.set(curW, curH); return v; },
    setSize(w, h) { curW = w; curH = h; },
  };
  const fakePost = {
    setSize() {},
    render() { postCalls++; },
  };
  const exp = makeSceneExporter({
    renderer: fakeRenderer,
    post: fakePost,
    scene: new THREE.Scene(),
    camera: cam,
    getTime: () => 4.2,
  });
  const snap = await exp.captureStillPNG('4k', null);
  assert.equal(snap.width, 3840);
  assert.equal(snap.height, 2160);
  assert.ok(snap.blob && postCalls === 1);
  assert.equal(curW, 800, 'viewport width restored after 4K capture');
  assert.equal(curH, 450, 'viewport height restored after 4K capture');
  assert.equal(curDpr, 1.25, 'pixelRatio restored after 4K capture');
});

test('Phase-9 special structures follow active color themes, celestial orbits & all 8 moon phases complete a 24h cycle, and 6 cloud types & covers work', () => {
  const U = makeUniforms();
  const world = makeWorld(U);
  const { city, collider } = growCity(4417, 5, world.towerMat);

  // 1) Special structures (landmarks + places) build richly and re-color dynamically with every look & Custom theme
  const lms = buildLandmarks(city, U, LOOK_BY_ID.bladerunner);
  const pls = buildPlaces(city, U, LOOK_BY_ID.bladerunner);
  assert.equal(typeof lms.setLook, 'function', 'landmarkGroup exposes setLook(look)');
  assert.equal(typeof pls.setLook, 'function', 'placeGroup exposes setLook(look)');

  let firstTrimMat = null;
  lms.traverse((o) => {
    if (!firstTrimMat && o.isMesh && o.material?.uniforms?.uRole?.value === 2) {
      firstTrimMat = o.material;
    }
  });
  assert.ok(firstTrimMat, 'landmarks include glowing role=2 architectural trim meshes');
  const colBR = firstTrimMat.uniforms.uCol.value.getHexString();
  lms.setLook(LOOK_BY_ID.tron);
  const colTron = firstTrimMat.uniforms.uCol.value.getHexString();
  lms.setLook(LOOK_BY_ID.clay);
  const colClay = firstTrimMat.uniforms.uCol.value.getHexString();
  syncCustomLook({ zen: '#040812', hor: '#ff2277', base: '#121828', win: '#ffee88', accent: '#11ff99', sec: '#44ccff', style: 'lit', mono: false });
  lms.setLook(LOOK_BY_ID.custom);
  const colCustom = firstTrimMat.uniforms.uCol.value.getHexString();
  assert.notEqual(colBR, colTron, 'landmark trim updates from Blade Runner to Tron');
  assert.notEqual(colTron, colClay, 'landmark trim updates from Tron to Clay');
  assert.notEqual(colClay, colCustom, 'landmark trim updates to Custom palette');

  // 2) Moon traverses all 8 lunar phases across 0..2
  const seenPhases = new Set();
  for (let p = 0; p < 2.0; p += 0.125) {
    const info = describeMoonPhase(p);
    seenPhases.add(info.name);
    applyTime(U, LOOK_BY_ID.bladerunner, 23.0, { moon: 1.2, moonph: p });
    assert.ok(Math.abs(U.uMoonPhase.value - p) < 1e-6);
  }
  for (const expectedName of [
    'New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous',
    'Full Moon', 'Waning Gibbous', 'Third Quarter', 'Waning Crescent',
  ]) {
    assert.ok(seenPhases.has(expectedName), `moon phase cycle includes ${expectedName}`);
  }

  // 3) Proper 3D spherical celestial paths over a full 24h cycle (rise -> high transit -> set -> below horizon)
  const L = LOOK_BY_ID.anime;
  applyLook(U, L);
  applyTime(U, L, 0.0, { moonph: 1.0 });
  const sunMidnightY = U.uSolarDir.value.y;
  const moonMidnightY = U.uMoonDir.value.y;
  const star0 = U.uStarRot.value;

  applyTime(U, L, 6.2, { moonph: 1.0 });
  const sunDawn = U.uSolarDir.value.clone();

  applyTime(U, L, 12.0, { moonph: 1.0 });
  const sunNoonY = U.uSolarDir.value.y;
  const moonNoonY = U.uMoonDir.value.y;
  const star12 = U.uStarRot.value;

  applyTime(U, L, 17.8, { moonph: 1.0 });
  const sunDusk = U.uSolarDir.value.clone();

  assert.ok(sunMidnightY < -0.6, `sun travels below horizon at midnight (y=${sunMidnightY.toFixed(2)})`);
  assert.ok(sunNoonY > 0.9, `sun transits high overhead at noon (y=${sunNoonY.toFixed(2)})`);
  assert.ok(sunDawn.x * sunDusk.x + sunDawn.z * sunDusk.z < -0.5, 'sun rises in East and sets opposite in West');
  assert.ok(moonMidnightY > 0.85 && moonNoonY < -0.6, `full moon transits high at midnight (${moonMidnightY.toFixed(2)}) and dips below horizon at noon (${moonNoonY.toFixed(2)})`);
  assert.ok(Math.abs((star12 - star0) - Math.PI) < 1e-4, 'starfield rotates 180 deg across 12 hours');

  // 4) 6 volumetric cloud types & full cloud cover range (0 clear -> 2.4 overcast, even on Tron where sky.cloud=0)
  assert.equal(CLOUD_TYPE_NAMES.length, 6, '6 cloud formation types exported');
  for (let ct = 0; ct < 6; ct++) {
    applyTime(U, LOOK_BY_ID.tron, 20.0, { clouds: 2.2, cloudType: ct });
    assert.equal(U.uCloudType.value, ct);
    assert.ok(U.uCloud.value > 0.65, 'high cloud cover works even on clear-authored looks');
  }
  applyTime(U, LOOK_BY_ID.bladerunner, 20.0, { clouds: 0 });
  assert.equal(U.uCloud.value, 0, 'clouds=0 produces clear sky');

  // 5) GPU swarm encodes horizontal street runs (mode < -0.5) & 90-degree corner turns (mode > 0.5)
  const veh = makeVehicles(city, world.trailMat, 300, collider, { swarmMat: world.swarmMat, swarmCount: 1200 });
  const cC = veh.swarmGeo.getAttribute('aCurveC');
  let turnCount = 0;
  let straightCount = 0;
  for (let i = 0; i < 600; i++) {
    const mode = cC.getW(i);
    if (mode > 0.5) turnCount++;
    else if (mode < -0.5) straightCount++;
  }
  assert.ok(turnCount >= 180 && straightCount >= 120, `swarm mixes 90-deg corner turns (${turnCount}) & horizontal street runs (${straightCount})`);
});

test('Phase-10 scene: ocean/lake/river water, procedural botanical & cyber park trees + catenary links, smooth anticipatory camera steering, and 6 art render styles', () => {
  const U = makeUniforms();
  const world = makeWorld(U);

  // 1) Coastal ocean + river delta + lakes build finite non-empty Three.js meshes & sync uniforms
  for (const wm of [0, 1, 2, 3, 4]) {
    const { city } = growCity(4417, 5, world.towerMat, 1.15, {
      waterMode: wm,
      terrainMode: wm === 4 ? 1 : 0,
      terrainScale: 1.2,
      U,
    });
    assert.equal(U.uWaterMode.value, wm);
    const wg = buildWater(city, world.waterMat);
    if (wm === 4) {
      assert.equal(wg.children.length, 0, 'dry basin creates 0 water meshes');
    } else {
      assert.ok(wg.children.length >= 1, `waterMode=${wm} builds >=1 water mesh`);
      for (const m of wg.children) {
        const pos = m.geometry.getAttribute('position');
        assert.ok(pos && pos.count >= 6, `water mesh has valid geometry (verts=${pos?.count})`);
        assert.equal(Number.isFinite(pos.getX(0) + pos.getY(0) + pos.getZ(0)), true);
      }
    }
  }

  // 2) Parks + Multi-branching Botanical & Cyber-Dendritic Trees + Custom Lights + Catenary Connections
  assert.equal(TREE_MODE_NAMES.length, 4, '4 tree modes exported');
  const { city, collider } = growCity(4417, 5, world.towerMat, 1.1, { waterMode: 1, terrainMode: 2, U });
  const places = buildPlaces(city, U, LOOK_BY_ID.bladerunner);
  assert.ok(places.children.length >= 1, 'park & public spaces build cleanly');

  const trees = buildTrees(city, U);
  assert.ok(trees.organic.children.length >= 2, 'botanical tree group contains multi-branching trunks + foliage + lanterns');
  assert.ok(trees.cyber.children.length >= 2, 'cyber tree group contains dendritic struts + holo rings + light nodes');
  assert.ok(trees.linkCount >= 18, `inter-tree catenary light network built (${trees.linkCount} links)`);

  // Verify tree mode switching: Auto (Tron -> cyber, Clay -> organic), explicit Botanical (1), Cyber (2), Hybrid (3)
  trees.setNature(LOOK_BY_ID.tron, 0);
  assert.equal(trees.cyber.visible, true);
  assert.equal(trees.organic.visible, false);

  trees.setNature(LOOK_BY_ID.tron, 1);
  assert.equal(trees.organic.visible, true, 'treeMode=1 forces Real Botanical even on Tron');
  assert.equal(trees.cyber.visible, false);

  trees.setNature(LOOK_BY_ID.anime, 2);
  assert.equal(trees.organic.visible, false);
  assert.equal(trees.cyber.visible, true, 'treeMode=2 forces Artificial Cyber-Trees');

  trees.setNature(LOOK_BY_ID.bladerunner, 3);
  assert.equal(trees.organic.visible, true, 'treeMode=3 enables Hybrid Bio-Cyber Grove');
  assert.equal(trees.cyber.visible, true);

  // 3) Smooth inertial camera controller + shallow-angle early anticipatory obstacle avoidance
  const domStub = {
    addEventListener() {},
    removeEventListener() {},
    setPointerCapture() {},
    releasePointerCapture() {},
  };
  const cam = new THREE.PerspectiveCamera(60, 1.6, 2, 34000);
  const ctl = new FlyControls(cam, domStub);
  ctl.collider = collider;
  ctl.collision = true;
  ctl.avoidance = true;

  // Pick the southernmost tall tower (>130m) on a clean open approach so 220m ahead is unobstructed
  const { city: clearCity, collider: clearCol } = growCity(4417, 5, world.towerMat, 0.0, { waterMode: 4, terrainMode: 4, U });
  ctl.collider = clearCol;
  let tx = 0;
  let tz = -1e9;
  for (let i = 0; i < clearCity.towers; i++) {
    if (clearCol.maxHeightNear(clearCity.x[i], clearCity.z[i], 14) > 130 && clearCol.hitsPoint(clearCity.x[i], 48, clearCity.z[i], 0, 1)) {
      if (clearCity.z[i] > tz) {
        tz = clearCity.z[i];
        tx = clearCity.x[i];
      }
    }
  }
  const spawnZ = tz + 225;
  ctl.setPose({ x: tx, y: 48, z: spawnZ, yaw: 0, pitch: 0 });
  ctl.keys.add('w');

  // Verify smooth velocity ramp-up on frame 1 (inertial damping rather than abrupt full-speed snap)
  ctl.update(0.016);
  const firstStepDist = Math.hypot(cam.position.x - tx, cam.position.z - spawnZ);
  assert.ok(firstStepDist > 0.02 && firstStepDist < ctl.speed * 0.016 * 0.5, 'velocity ramps smoothly via inertial damping');

  let earlySteerDist = -1;
  let maxStepYaw = 0;
  for (let step = 0; step < 90; step++) {
    const prevY = ctl.yaw;
    ctl.update(0.03);
    const dYaw = Math.abs(ctl.yaw - prevY);
    if (dYaw > maxStepYaw) maxStepYaw = dYaw;
    const distAheadOfTower = cam.position.z - tz;
    if (earlySteerDist < 0 && Math.abs(ctl.yaw) > 0.02) {
      earlySteerDist = distAheadOfTower;
    }
    assert.equal(
      clearCol.hitsPoint(cam.position.x, cam.position.y, cam.position.z, 0, 1),
      false,
      'anticipatory controller keeps camera completely outside solid towers'
    );
  }
  assert.ok(earlySteerDist > 110, `expected course adjustment well in advance (>110m out), started at ${earlySteerDist.toFixed(1)}m`);
  assert.ok(maxStepYaw < 0.08, `course adjustment stays smooth & shallow per frame (maxStepYaw=${maxStepYaw.toFixed(4)} rad)`);

  // Verify smooth coasting deceleration after key release
  ctl.keys.clear();
  const zAtRelease = cam.position.z;
  ctl.update(0.02);
  assert.ok(Math.hypot(cam.position.z - zAtRelease) > 0.1, 'camera coasts smoothly to rest instead of hard-stopping');

  // 4) Post-processing DepthTexture + 6 Artistic / X-Ray Render Styles + exact-state roundtrip
  assert.equal(ART_STYLE_NAMES.length, 6, 'Cinema + X-Ray + Ink Sketch + Charcoal + Painterly + Impressionist');
  const fakeRenderer = { setRenderTarget() {}, render() {} };
  const post = makePostProcessor(fakeRenderer);
  assert.ok(post.sceneRT.depthTexture instanceof THREE.DepthTexture, 'sceneRT carries hardware DepthTexture for X-Ray & depth silhouettes');
  assert.equal(post.compMat.uniforms.tDepth.value, post.sceneRT.depthTexture);

  for (let styleIdx = 0; styleIdx < ART_STYLE_NAMES.length; styleIdx++) {
    post.configure({ artStyle: styleIdx, artStrength: 0.92 });
    assert.equal(post.compMat.uniforms.uArtStyle.value, styleIdx);
    assert.equal(post.compMat.uniforms.uArtStrength.value, 0.92);
  }

  const tok = encodeExactState({
    seed: 6204,
    lookId: 'anime',
    waterMode: 3,
    terrainMode: 4,
    terrainScale: 1.45,
    treeMode: 3,
    avoidance: false,
    post: { bloom: 0.9, lens: 0.4, contrast: 1.1, temp: 0.1, film: 0.12, artStyle: 4, artStrength: 1.15 },
  });
  const dec = decodeExactState(tok);
  assert.equal(dec.waterMode, 3);
  assert.equal(dec.terrainMode, 4);
  assert.equal(dec.terrainScale, 1.45);
  assert.equal(dec.treeMode, 3);
  assert.equal(dec.avoidance, false);
  assert.equal(dec.post.artStyle, 4);
  assert.equal(dec.post.artStrength, 1.15);
});

test('Phase-11: sci-fi vehicle designs, realistic fleet ratios, smooth rail-locked trains, distinct front/rear lamps, animated blimp & skyscraper searchlights, and 24h circadian windows', () => {
  const U = makeUniforms();
  const world = makeWorld(U);
  const { city, collider } = growCity(4417, 5, world.towerMat, 0.5, { waterMode: 0, terrainMode: 0, U });

  // 1) Realistic fleet density distribution: lots of sci-fi cars, few 5-car train chains, very few helicopters & blimps
  const veh = makeVehicles(city, world.trailMat, 420, collider);
  veh.update(0, 1, 1);
  const counts = veh.bodies.map((b) => b.count);
  const totalHero = counts.reduce((a, b) => a + b, 0);
  const cars = counts[0] + counts[1] + counts[3] + counts[6] + counts[7];
  const trains = counts[2];
  const helis = counts[4];
  const blimps = counts[5];
  assert.ok(cars / totalHero > 0.85, `expected >85% cars, got ${(100 * cars / totalHero).toFixed(1)}%`);
  assert.ok(trains >= 1 && trains / totalHero < 0.08, `expected few train chains, got ${trains}/${totalHero}`);
  assert.ok(helis >= 1 && helis / totalHero < 0.04, `expected very few helicopters, got ${helis}/${totalHero}`);
  assert.ok(blimps >= 1 && blimps / totalHero < 0.03, `expected very few blimps, got ${blimps}/${totalHero}`);

  // 2) Distinct untinted front headlights (+X, aRole=3) vs crimson rear taillights (-X, aRole=4) on all cars
  for (const cc of [0, 1, 3, 6, 7]) {
    const geo = veh.bodies[cc].geometry;
    const pos = geo.getAttribute('position');
    const role = geo.getAttribute('aRole');
    assert.ok(role, `vehicle class ${cc} carries aRole attribute`);
    assert.ok(pos.count > 200, `vehicle class ${cc} is a detailed multi-part sci-fi silhouette (${pos.count} verts)`);
    let headCount = 0, tailCount = 0;
    for (let v = 0; v < pos.count; v++) {
      const r = role.getX(v);
      const vx = pos.getX(v);
      if (Math.abs(r - 3) < 0.1) {
        headCount++;
        assert.ok(vx > 0, `class ${cc} front headlight vertex must sit at +X, got x=${vx}`);
      } else if (Math.abs(r - 4) < 0.1) {
        tailCount++;
        assert.ok(vx < 0, `class ${cc} rear taillight vertex must sit at -X, got x=${vx}`);
      }
    }
    assert.ok(headCount >= 24 && tailCount >= 24, `class ${cc} has both front headlights (${headCount}) and rear taillights (${tailCount})`);
  }

  // 3) Smooth car heading (no sudden turns) + 5-car rail-locked Sky-Train consist
  assert.equal(veh.extraCoaches.length, 2, '5-car Sky-Train has lead loco + 2 trailers + 2 extraCoaches');
  const m = new THREE.Matrix4();
  const p0 = new THREE.Vector3();
  const p1 = new THREE.Vector3();
  const q0 = new THREE.Quaternion();
  const q1 = new THREE.Quaternion();
  const sDummy = new THREE.Vector3();
  const e0 = new THREE.Euler(0, 0, 0, 'YXZ');

  // Check coupled 5-car train spacing on frame 0
  veh.bodies[2].getMatrixAt(0, m);
  m.decompose(p0, q0, sDummy);
  const consistMeshes = [veh.trailers[0], veh.trailers[1], veh.extraCoaches[0], veh.extraCoaches[1]];
  let prevCoachPos = p0.clone();
  for (let k = 0; k < consistMeshes.length; k++) {
    consistMeshes[k].getMatrixAt(0, m);
    m.decompose(p1, q1, sDummy);
    const gap = prevCoachPos.distanceTo(p1);
    assert.ok(gap > 16 && gap < 34, `Sky-Train car ${k + 1} coupled smoothly at ${gap.toFixed(1)}m behind previous car`);
    prevCoachPos = p1.clone();
  }

  // Step 60 frames and ensure car yaw never snaps abruptly
  const checkCars = Math.min(20, veh.bodies[0].count);
  const prevYaws = new Float32Array(checkCars);
  const prevPosX = new Float32Array(checkCars);
  for (let i = 0; i < checkCars; i++) {
    veh.bodies[0].getMatrixAt(i, m);
    m.decompose(p0, q0, sDummy);
    e0.setFromQuaternion(q0, 'YXZ');
    prevYaws[i] = e0.y;
    prevPosX[i] = p0.x;
  }
  for (let step = 0; step < 60; step++) {
    veh.update(1 / 60, 1, 1);
    for (let i = 0; i < checkCars; i++) {
      veh.bodies[0].getMatrixAt(i, m);
      m.decompose(p0, q0, sDummy);
      e0.setFromQuaternion(q0, 'YXZ');
      if (Math.abs(p0.x - prevPosX[i]) < 80) {
        const dYaw = Math.abs(Math.atan2(Math.sin(e0.y - prevYaws[i]), Math.cos(e0.y - prevYaws[i])));
        assert.ok(dYaw < 0.09, `car ${i} turned smoothly without snap (dYaw=${dYaw.toFixed(4)} rad in 16ms)`);
      }
      prevYaws[i] = e0.y;
      prevPosX[i] = p0.x;
    }
  }

  // 4) Animated searchlights on BOTH blimps & skyscraper rooftops, with valid `uv` attributes so BEAM_VERT/FRAG renders visibly
  const blimpBeamGeo = veh.beams[5].geometry;
  const beamUV = blimpBeamGeo.getAttribute('uv');
  assert.ok(beamUV && beamUV.count >= 12, 'beamGeometry populates uv attribute for BEAM_VERT');
  let hasInteriorWidth = false;
  for (let v = 0; v < beamUV.count; v++) {
    if (beamUV.getX(v) > 0.5) hasInteriorWidth = true;
  }
  assert.ok(hasInteriorWidth, 'beam uv.x spans [0..1] so sin(pi*vW) renders volumetric core');

  veh.beams[5].getMatrixAt(0, m);
  m.decompose(p0, q0, sDummy);
  veh.blimpSearchlights.getMatrixAt(0, m);
  const qAft0 = new THREE.Quaternion();
  m.decompose(p1, qAft0, sDummy);
  veh.update(1.2, 1, 1);
  veh.beams[5].getMatrixAt(0, m);
  m.decompose(p0, q1, sDummy);
  const qAft1 = new THREE.Quaternion();
  veh.blimpSearchlights.getMatrixAt(0, m);
  m.decompose(p1, qAft1, sDummy);
  assert.ok(1 - Math.abs(q0.dot(q1)) > 1e-4, 'blimp forward searchlight sweeps dynamically');
  assert.ok(1 - Math.abs(qAft0.dot(qAft1)) > 1e-4, 'blimp aft searchlight sweeps dynamically');

  const sl = makeSearchlights(city, world.beamMat);
  assert.ok(sl.pivots.length >= 24, `expected >=24 building/venue/landmark searchlights, got ${sl.pivots.length}`);
  const yaws0 = sl.pivots.map((pv) => pv.pivot.rotation.y);
  const tilts0 = sl.pivots.map((pv) => pv.mesh.rotation.z);
  sl.update(1.5);
  assert.ok(sl.pivots.some((pv, idx) => Math.abs(pv.pivot.rotation.y - yaws0[idx]) > 0.05), 'building searchlights sweep in azimuth');
  assert.ok(sl.pivots.some((pv, idx) => Math.abs(pv.mesh.rotation.z - tilts0[idx]) > 0.02), 'building searchlights nod in elevation');

  // 5) 24-hour dynamic circadian building & landmark window schedules (`uDayPhase`)
  const look = LOOKS[0];
  applyLook(U, look);
  for (const hr of [3.5, 8.2, 12.5, 18.4, 22.8]) {
    applyTime(U, look, hr);
    assert.ok(Math.abs(U.uDayPhase.value - hr) < 1e-6, `applyTime syncs uDayPhase=${hr}`);
  }
  assert.equal(world.towerMat.uniforms.uDayPhase, U.uDayPhase, 'towerMat shares live uDayPhase uniform');
  const lmMat = makeLandmarkMaterial(U, '#445566', 0);
  assert.equal(lmMat.uniforms.uDayPhase, U.uDayPhase, 'landmarkMat shares live uDayPhase uniform');
  assert.ok(SHADERS.TOWER_FRAG.includes('isElevShaft') && SHADERS.TOWER_FRAG.includes('duskOn'), 'TOWER_FRAG animates circadian dusk waves & exterior glass elevators');
});



