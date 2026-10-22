// Node smoke tests for the pure-JS city generator. Run: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCity, makeCityCollider, streetWidth, AVENUE, STREET, KIND, LM_KINDS, PLACE_KINDS, DISTRICT_KINDS, CELL } from '../src/city.js';
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
    assert.ok(Number.isFinite(b.x) && b.y > 5 && Number.isFinite(b.z));
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

test('public spaces exist, are named and lit', () => {
  const city = generateCity(4417, 6);
  assert.ok(city.places.length >= 3, `places=${city.places.length}`);
  const names = city.places.map((p) => p.name);
  assert.equal(new Set(names).size, names.length, 'place names unique');
  for (const pl of city.places) {
    assert.ok(PLACE_KINDS.includes(pl.kind), pl.kind);
    assert.ok(pl.r > 30, `${pl.name} r=${pl.r}`);
    const lim = (city.radius + 1) * CELL;
    assert.ok(Math.abs(pl.x) < lim && Math.abs(pl.z) < lim);
  }
  // every public space is ringed with string lights
  assert.ok(city.beacons.length > city.places.length * 8, 'place light rings present');
});

test('street lamps line the avenues', () => {
  const city = generateCity(4417, 5);
  assert.ok(city.lamps.length > 100, `lamps=${city.lamps.length}`);
  for (const L of city.lamps.slice(0, 64)) {
    assert.ok(Number.isFinite(L.x) && L.y > 2 && Number.isFinite(L.z));
    // lamps sit near some avenue centreline (multiple of 4 street indices)
    const nearest = Math.round(L.x / CELL) * CELL;
    const nearestZ = Math.round(L.z / CELL) * CELL;
    const onX = Math.abs(L.x - nearest) < 20 && ((Math.round(nearest / CELL) % 4) + 4) % 4 === 0;
    const onZ = Math.abs(L.z - nearestZ) < 20 && ((Math.round(nearestZ / CELL) % 4) + 4) % 4 === 0;
    assert.ok(onX || onZ, `lamp (${L.x},${L.z}) not near an avenue`);
  }
});

test('districts give the city coherent, varied quarters', () => {
  const city = generateCity(4417, 10);
  assert.ok(city.districts.length >= 25, `districts=${city.districts.length}`);
  for (const d of city.districts) {
    assert.ok(DISTRICT_KINDS.includes(d.kind), d.kind);
    assert.ok(Number.isInteger(d.di) && Number.isInteger(d.dj));
  }
  const kinds = new Set(city.districts.map((d) => d.kind));
  assert.ok(kinds.size >= 3, `only ${kinds.size} district kinds — want variety`);
  // same seed -> same districts
  const again = generateCity(4417, 10);
  assert.deepEqual(again.districts, city.districts);
});

test('buildings carry facade styles: normal, outline-glow, sparse, media & street-arcade', () => {
  const city = generateCity(4417, 10);
  assert.equal(city.style.length, city.count);
  const seen = new Set();
  for (let i = 0; i < city.count; i++) {
    assert.ok([0, 1, 2, 3, 4].includes(city.style[i]), `unexpected style=${city.style[i]}`);
    seen.add(city.style[i]);
  }
  for (const st of [0, 1, 2, 3, 4]) {
    assert.ok(seen.has(st), `expected style ${st} in styles seen: ${[...seen]}`);
  }
  // low-town districts really are low: district kind is per 3x3 blocks, so just
  // check the height field bimodality exists overall
  let tall = 0;
  let low = 0;
  for (let i = 0; i < city.count; i++) {
    if (city.h[i] > 240) tall++;
    if (city.h[i] < 40) low++;
  }
  assert.ok(tall > 20 && low > 20, `tall=${tall} low=${low} — want both`);
});

test('media / holo-ad district wraps whole buildings in billboards & holograms, and street base is distinct', () => {
  const city = generateCity(4417, 5);
  assert.ok(city.mediaZone, 'mediaZone exists at default radius r=5');
  assert.equal(city.mediaZone.kind, 'media');
  assert.ok(city.mediaZone.towerCount >= 2, `mediaZone.towerCount=${city.mediaZone.towerCount}`);

  let mediaWalls = 0;
  let streetArcade = 0;
  for (let i = 0; i < city.count; i++) {
    if (city.style[i] === 3 && city.kind[i] === KIND.WALL) mediaWalls++;
    if (city.style[i] === 4 && city.y[i] < 16) streetArcade++;
  }
  assert.ok(mediaWalls >= 4, `expected full-building media shafts, got ${mediaWalls}`);
  assert.ok(streetArcade >= 20, `expected lower-level street podiums/awnings/sidewalks, got ${streetArcade}`);

  const mediaBills = city.bills.filter((b) => Math.hypot(b.x - city.mediaZone.x, b.z - city.mediaZone.z) <= city.mediaZone.r + 45);
  const mediaHolos = city.holos.filter((h) => Math.hypot(h.x - city.mediaZone.x, h.z - city.mediaZone.z) <= city.mediaZone.r + 65);
  assert.ok(mediaBills.length >= 12, `mediaZone wrapped billboards=${mediaBills.length}`);
  assert.ok(mediaHolos.length >= 5, `mediaZone full-tower & portal holos=${mediaHolos.length}`);
});

test('voronoi structure: water, boulevards, trees, bills and layered lanes', () => {
  const city = generateCity(4417, 10);
  assert.ok(city.sites.length >= 8, `sites=${city.sites.length}`);
  for (const s of city.sites) {
    assert.ok(Number.isFinite(s.x) && Number.isFinite(s.z));
    assert.ok(typeof s.kind === 'string');
  }
  assert.ok(city.water.length >= 1, 'at least one body of water');
  for (const w of city.water) {
    assert.ok(w.pts.length >= 8, 'shore has many points');
    for (const [x, z] of w.pts) assert.ok(Number.isFinite(x) && Number.isFinite(z));
  }
  assert.ok(city.boulevards.length >= 1, 'a diagonal boulevard');
  assert.ok(city.trees.length > 50, `trees=${city.trees.length}`);
  for (const tr of city.trees.slice(0, 32)) {
    assert.ok(tr.h > 4 && tr.h < 30 && Math.abs(tr.x) < 1700 && Math.abs(tr.z) < 1700);
  }
  assert.ok(city.bills.length > 0, 'billboards on tall towers');
  for (const b of city.bills.slice(0, 16)) {
    assert.ok(b.y > 40 && b.h > 5, 'billboard rides a facade');
  }
  // layered lane network with bézier control points
  const layers = new Set(city.lanes.map((l) => l.layer));
  assert.ok(layers.has('ground') && layers.has('blimp'), [...layers]);
  assert.ok(layers.has('air-low') && layers.has('air-mid') && layers.has('air-high'));
  for (const l of city.lanes.slice(0, 24)) {
    assert.ok(Number.isFinite(l.cx) && Number.isFinite(l.cz), 'bézier control point');
  }
  // deterministic
  const again = generateCity(4417, 10);
  assert.equal(again.trees.length, city.trees.length);
  assert.deepEqual(again.water, city.water);
  assert.equal(again.bills.length, city.bills.length);
});

test('grid variation: towers rotate and the skyline tapers into fog', () => {
  const c = generateCity(4417, 6);
  assert.ok(c.rot, 'rotations recorded');
  let rotated = 0;
  for (let i = 0; i < c.count; i++) if (Math.abs(c.rot[i]) > 0.02) rotated++;
  assert.ok(rotated > c.count * 0.05, `rotated=${rotated}/${c.count}`);
  // edge buildings are generally shorter than core ones (outskirts fade)
  let coreH = 0, edgeH = 0, nCore = 0, nEdge = 0;
  for (let i = 0; i < c.count; i++) {
    const r = Math.max(Math.abs(c.x[i]), Math.abs(c.z[i]));
    if (r < c.radius * CELL * 0.35) { coreH += c.h[i]; nCore++; }
    else if (r > c.radius * CELL * 0.8) { edgeH += c.h[i]; nEdge++; }
  }
  assert.ok(nCore > 0 && nEdge > 0);
  assert.ok((edgeH / nEdge) < (coreH / nCore), `edge avg ${edgeH / nEdge} < core avg ${coreH / nCore}`);
});

test('outskirts skirt exists beyond the core and carries silos and sheds', () => {
  const c = generateCity(4417, 6);
  let outside = 0;
  for (let i = 0; i < c.count; i++) {
    const r = Math.hypot(c.x[i], c.z[i]);
    if (r > (c.radius + 0.2) * CELL) outside++;
  }
  assert.ok(outside > 20, `outskirts pieces=${outside}`);
});

test('signs and holographic displays are deterministic per seed', () => {
  const a = generateCity(4417, 6);
  const b = generateCity(4417, 6);
  assert.equal(a.signs.length, b.signs.length);
  assert.equal(a.holos.length, b.holos.length);
  assert.ok(a.signs.length > 10, `signs=${a.signs.length}`);
  for (let i = 0; i < a.signs.length; i++) {
    assert.equal(a.signs[i].x, b.signs[i].x);
    assert.equal(a.signs[i].h, b.signs[i].h);
  }
});

test('lane glide profiles lift air lanes over rooftops (no building clipping)', () => {
  const c = generateCity(4417, 6);
  const collider = makeCityCollider(c);
  let checked = 0;
  for (const L of c.lanes) {
    if (!L.prof || L.layer === 'ground') continue;
    checked++;
    assert.equal(L.prof.length, 33);
    for (let s = 0; s < L.prof.length; s++) {
      const t = s / (L.prof.length - 1);
      const u = 1 - t;
      const px = u * u * L.x1 + 2 * u * t * L.cx + t * t * L.x2;
      const pz = u * u * L.z1 + 2 * u * t * L.cz + t * t * L.z2;
      const top = collider.maxHeightNear(px, pz, 30);
      assert.ok(L.prof[s] >= top + 20, `lane ${L.layer} y=${L.prof[s].toFixed(0)} vs top=${top.toFixed(0)} at t=${t}`);
    }
  }
  assert.ok(checked > 0, 'checked air & blimp lanes');

  // Spatial collider pushes a sphere out of solid buildings and off the ground
  let bi = 0;
  while (bi < c.count && c.h[bi] < 40) bi++;
  const inside = { x: c.x[bi], y: c.y[bi], z: c.z[bi] };
  assert.equal(collider.hitsPoint(inside.x, inside.y, inside.z, 0), true, 'centre of tower box is solid');
  const pushed = collider.resolveSphere(inside, 8, 1);
  assert.equal(pushed, true, 'sphere inside building gets pushed out');
  assert.equal(collider.hitsPoint(inside.x, inside.y, inside.z, 2), false, 'resolved point is clear');
});

test('horizon suburbs extend procedurally into the distance and scale with suburbReach', () => {
  const cNone = generateCity(4417, 5, 0);
  const cMid = generateCity(4417, 5, 1.0);
  const cWide = generateCity(4417, 5, 1.4);

  assert.equal(cNone.suburbCount, 0, 'suburbReach=0 disables horizon suburbs');
  assert.ok(cMid.suburbCount > 1500, `expected >1500 suburban structures, got ${cMid.suburbCount}`);
  assert.ok(cWide.suburbSpan > cMid.suburbSpan, 'larger suburbReach extends suburbSpan further toward horizon');
  assert.ok(cMid.suburbSpan >= 4500, `expected suburbSpan >= 4500m, got ${cMid.suburbSpan}`);

  // Verify structures exist across near, mid, and far horizon rings (> 3.5 km from core)
  let ringNear = 0;
  let ringFar = 0;
  for (let i = 0; i < cMid.count; i++) {
    const r = Math.hypot(cMid.x[i], cMid.z[i]);
    if (r > 1200 && r <= 2800) ringNear++;
    if (r > 3500) ringFar++;
  }
  assert.ok(ringNear > 400, `expected >400 inner-suburb structures, got ${ringNear}`);
  assert.ok(ringFar > 200, `expected >200 far-horizon structures (>3.5km), got ${ringFar}`);

  // Deterministic across runs
  const cMid2 = generateCity(4417, 5, 1.0);
  assert.equal(cMid.count, cMid2.count);
  assert.equal(cMid.suburbCount, cMid2.suburbCount);
});

