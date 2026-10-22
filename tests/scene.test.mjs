// Integration smoke tests: real three.js (no WebGL needed for these layers).
// Run: node --test tests/scene.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { LOOKS, LOOK_BY_ID } from '../src/looks.js';
import {
  makeUniforms, makeWorld, growCity, applyLook, applyTime,
  buildLandmarks, buildBeacons, makeVehicles, makeLandmarkMaterial,
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
  const mats = [world.skyMat, world.groundMat, world.towerMat, world.beaconMat, makeLandmarkMaterial(U, '#334455')];
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
  for (const name of ['aSeed', 'aDims', 'aKind']) {
    assert.ok(mesh.geometry.getAttribute(name), name);
  }
  // my vertex shader must NOT redeclare what three injects
  assert.ok(!/attribute\s+mat4\s+instanceMatrix/.test(world.towerMat.vertexShader));
  assert.ok(/attribute\s+float\s+aSeed/.test(world.towerMat.vertexShader));

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

test('applyTime shifts sky, stars and lights across the day', () => {
  const U = makeUniforms();
  const L = LOOK_BY_ID.outrun; // dusk preset with stars
  applyLook(U, L);
  const night = applyTime(U, L, 23);
  const nightZen = U.uZen.value.getHexString();
  const nightStars = U.uStars.value;
  const nightWin = U.uWinGlow.value;
  const day = applyTime(U, L, 12);
  const dayZen = U.uZen.value.getHexString();
  const dayStars = U.uStars.value;
  const dayWin = U.uWinGlow.value;

  assert.notEqual(nightZen, dayZen, 'sky zenith moves with the hour');
  assert.ok(night.night > 0.9 && day.night < 0.1, `night=${night.night} day=${day.night}`);
  assert.ok(nightStars > dayStars, 'stars stronger at night');
  assert.ok(nightWin > dayWin * 1.2, 'windows glow harder at night');
  assert.ok(Math.abs(U.uSunDir.value.length() - 1) < 1e-5, 'sun dir stays normalised');
  assert.ok(day.elev > 0.5, `day elev=${day.elev}`);

  // warm golden hour vs deep night
  const dusk = applyTime(U, L, 18.2);
  assert.ok(dusk.warm > 0.2, `warm=${dusk.warm}`);
  assert.ok(U.uLightK.value > 0.2, 'atmospheric lights get intensity');

  // lights slider scales the beacon/atmosphere intensity
  const dim = applyTime(U, L, 23, { lights: 0, glow: 1 });
  assert.equal(U.uLightK.value, 0);
  assert.ok(dim.night > 0.9);

  // heavy-smog looks stay starless day or night (identity)
  const br = LOOK_BY_ID.bladerunner;
  applyTime(U, br, 23);
  assert.equal(U.uStars.value, 0, 'smog eats the stars');
});

test('landmarks, beacons and vehicles build against real three.js', () => {
  const U = makeUniforms();
  const world = makeWorld(U);
  const { city } = growCity(4417, 5, world.towerMat);

  const lmGroup = buildLandmarks(city, U);
  assert.equal(lmGroup.children.length, city.landmarks.length);
  let meshes = 0;
  lmGroup.traverse((o) => { if (o.isMesh) meshes++; });
  assert.ok(meshes >= city.landmarks.length * 2, `landmark meshes=${meshes}`);

  const pts = buildBeacons(city, world.beaconMat);
  assert.ok(pts.isPoints);
  assert.equal(pts.geometry.getAttribute('position').count, city.beacons.length);
  assert.ok(pts.geometry.getAttribute('aPhase'));
  assert.ok(pts.geometry.getAttribute('aSize'));

  const veh = makeVehicles(city, U, 60);
  assert.ok(veh.mesh.isInstancedMesh);
  assert.ok(veh.mesh.count <= 60);
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
  veh.update(0, 0.1);
  assert.equal(veh.mesh.count, 6, 'traffic slider thins the swarm');
});
