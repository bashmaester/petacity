// Node smoke tests for the pure-JS city generator. Run: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCity, streetWidth, AVENUE, STREET, KIND, LM_KINDS, CELL } from '../src/city.js';
import { mulberry32, hash2i, makeNoise2D, fbm2D } from '../src/prng.js';

test('mulberry32 is deterministic and in range', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 100; i++) {
    const va = a();
    assert.equal(va, b());
    assert.ok(va >= 0 && va < 1);
  }
});

test('hash2i differs across inputs', () => {
  assert.notEqual(hash2i(1, 2, 3), hash2i(2, 1, 3));
  assert.notEqual(hash2i(1, 2, 3), hash2i(1, 2, 4));
});

test('noise and fbm stay roughly in 0..1', () => {
  const n = makeNoise2D(7);
  for (let x = -20; x < 20; x += 1.3) {
    for (let y = -20; y < 20; y += 1.7) {
      const v = n(x, y);
      assert.ok(v >= 0 && v <= 1, `noise(${x},${y})=${v}`);
      const f = fbm2D(n, x, y);
      assert.ok(f >= 0 && f <= 1, `fbm(${x},${y})=${f}`);
    }
  }
});

test('street widths follow the avenue rule', () => {
  assert.equal(streetWidth(0), AVENUE);
  assert.equal(streetWidth(4), AVENUE);
  assert.equal(streetWidth(-4), AVENUE);
  assert.equal(streetWidth(1), STREET);
  assert.equal(streetWidth(-1), STREET);
});

test('generateCity produces a sane city', () => {
  const city = generateCity(4417, 8);
  assert.ok(city.count > 500, `count=${city.count}`);
  assert.ok(city.towers > 100, `towers=${city.towers}`);
  assert.ok(city.maxY > 100 && city.maxY < 1600, `maxY=${city.maxY}`);
  for (let i = 0; i < city.count; i++) {
    assert.ok(Number.isFinite(city.x[i]) && Number.isFinite(city.y[i]) && Number.isFinite(city.z[i]));
    assert.ok(city.w[i] > 0 && city.h[i] > 0 && city.d[i] > 0);
    assert.ok(city.s[i] >= 0 && city.s[i] < 1);
    assert.ok([KIND.WALL, KIND.SLAB, KIND.MAST, KIND.BAND].includes(city.kind[i]));
  }
});

test('same seed -> identical city, new seed -> different', () => {
  const a = generateCity(1234, 6);
  const b = generateCity(1234, 6);
  const c = generateCity(4321, 6);
  assert.equal(a.count, b.count);
  assert.deepEqual([...a.s.slice(0, 64)], [...b.s.slice(0, 64)]);
  assert.deepEqual([...a.x.slice(0, 64)], [...b.x.slice(0, 64)]);
  assert.notDeepEqual([...a.x.slice(0, 64)], [...c.x.slice(0, 64)]);
});

test('landmark spires exist and are tall', () => {
  const city = generateCity(4417, 10);
  let bands = 0;
  let maxTop = 0;
  for (let i = 0; i < city.count; i++) {
    if (city.kind[i] === KIND.BAND) bands++;
    maxTop = Math.max(maxTop, city.y[i] + city.h[i] / 2);
  }
  assert.ok(bands > 0, 'expected emissive bands');
  assert.ok(maxTop > 400, `maxTop=${maxTop}`);
});

test('landmarks (places of interest) are named, unique and in bounds', () => {
  const city = generateCity(4417, 6);
  assert.ok(city.landmarks.length >= 4, `landmarks=${city.landmarks.length}`);
  const names = city.landmarks.map((l) => l.name);
  assert.equal(new Set(names).size, names.length, 'names unique');
  for (const lm of city.landmarks) {
    assert.ok(LM_KINDS.includes(lm.kind), lm.kind);
    assert.ok(lm.name.length > 2, lm.name);
    assert.ok(lm.r > 5 && lm.h > 80, `${lm.name} r=${lm.r} h=${lm.h}`);
    const lim = (city.radius + 1) * CELL;
    assert.ok(Math.abs(lm.x) < lim && Math.abs(lm.z) < lim, `${lm.name} out of bounds`);
    assert.ok(Number.isFinite(lm.rot) && Number.isFinite(lm.colorSeed));
  }
  assert.ok(city.landmarks.some((l) => l.hero), 'hero landmark exists');
});

test('vehicle lanes and beacons are populated sanely', () => {
  const city = generateCity(4417, 6);
  assert.ok(city.lanes.length >= 8, `lanes=${city.lanes.length}`);
  for (const L of city.lanes) {
    assert.ok(Number.isFinite(L.x1) && Number.isFinite(L.z1) && Number.isFinite(L.x2) && Number.isFinite(L.z2));
    assert.ok(L.y >= 0 && L.speed > 0);
    assert.ok(L.x1 !== L.x2 || L.z1 !== L.z2, 'lane has direction');
  }
  assert.ok(city.beacons.length >= 5, `beacons=${city.beacons.length}`);
  for (const b of city.beacons) {
    assert.ok(Number.isFinite(b.x) && b.y > 10 && Number.isFinite(b.z));
    assert.ok(b.phase >= 0 && b.phase < 1);
  }
});

test('landmarks, lanes and beacons are deterministic per seed', () => {
  const a = generateCity(999, 5);
  const b = generateCity(999, 5);
  assert.deepEqual(a.landmarks, b.landmarks);
  assert.deepEqual(a.lanes, b.lanes);
  assert.deepEqual(a.beacons, b.beacons);
  const c = generateCity(1000, 5);
  assert.notDeepEqual(a.landmarks, c.landmarks);
});
