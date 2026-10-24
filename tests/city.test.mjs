// Node smoke tests for the pure-JS city generator. Run: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateCity, makeCityCollider, streetWidth, AVENUE, STREET, KIND,
  LM_KINDS, PLACE_KINDS, DISTRICT_KINDS, CELL,
  WATER_MODE_NAMES, TERRAIN_MODE_NAMES, evalTerrainHeight, evalCoastSignedDist,
  evalExactCoastShoreU, evalRiverSignedDist,
  evalRoadWeb, roadWebToWorld, isPointInWater,
} from '../src/city.js';
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

test('billboards & holograms are de-concentrated across avenues (not 100% crammed in mediaZone) and lanes have gentle C1 slopes & orbital rings', () => {
  const c = generateCity(4417, 6, 1.0);
  const mz = c.mediaZone;
  assert.ok(mz, 'mediaZone exists');

  let inMediaBills = 0;
  let citywideBills = 0;
  for (const b of c.bills) {
    if (Math.hypot(b.x - mz.x, b.z - mz.z) <= mz.r + 45) inMediaBills++;
    else citywideBills++;
  }
  assert.ok(inMediaBills >= 12 && inMediaBills <= 45, `mediaZone billboards=${inMediaBills} are balanced, not over-stacked`);
  assert.ok(citywideBills >= 10, `expected >=10 billboards distributed across avenues outside mediaZone, got ${citywideBills}`);

  // Inside mediaZone, dark architectural contrast walls (style != 3) coexist with selective style=3 walls
  let darkInMedia = 0;
  let ledInMedia = 0;
  for (let i = 0; i < c.count; i++) {
    if (c.kind[i] === 0 && Math.hypot(c.x[i] - mz.x, c.z[i] - mz.z) <= mz.r) {
      if (c.style[i] === 3) ledInMedia++;
      else darkInMedia++;
    }
  }
  assert.ok(ledInMedia >= 4 && darkInMedia >= 4, `mediaZone mixes LED (${ledInMedia}) & dark contrast (${darkInMedia}) architecture`);

  // Lane profiles obey bounded gentle slopes (no 80-degree spire cliffs!) and stitch orbital rings continuously
  let ringLinks = 0;
  for (const L of c.lanes) {
    const approxLen = Math.hypot(L.cx - L.x1, L.cz - L.z1) + Math.hypot(L.x2 - L.cx, L.z2 - L.cz);
    const stepDist = Math.max(45, approxLen / (L.prof.length - 1));
    for (let s = 0; s < L.prof.length - 1; s++) {
      const slope = Math.abs(L.prof[s + 1] - L.prof[s]) / stepDist;
      assert.ok(slope <= 0.28, `lane ${L.layer} slope=${slope.toFixed(3)} exceeds gentle glide limit`);
    }
    if (L.nextIdx !== undefined) {
      ringLinks++;
      const N = c.lanes[L.nextIdx];
      assert.ok(Math.abs(L.prof[L.prof.length - 1] - N.prof[0]) < 1e-6, 'orbital ring altitude stitched continuously');
      assert.ok(Math.hypot(L.x2 - N.x1, L.z2 - N.z1) < 1e-4, 'orbital ring XZ endpoint stitched continuously');
    }
  }
  assert.ok(ringLinks >= 24, `expected >=24 stitched orbital ring segments, got ${ringLinks}`);
});

test('Phase-9 landmarks include pyramids, cantilevered sky-wings & ziggurats, and streets form horizontal grade-separated layers with turns & ramps', () => {
  const c = generateCity({ seed: 4417, radius: 5 });
  const lmKinds = new Set(c.landmarks.map((l) => l.kind));
  assert.ok(lmKinds.has('pyramid'), 'city generates pyramid landmark');
  assert.ok(lmKinds.has('cantilever'), 'city generates cantilevered sky-wing landmark');
  assert.ok(lmKinds.has('ziggurat'), 'city generates stepped ziggurat landmark');

  // Verify street segments are predominantly flat horizontal layers, with N-S vs E-W grade separation,
  // 90-degree corner turns, and occasional smooth elevation-switch ramps
  const streets = c.lanes.filter((L) => L.kind === 'street');
  const turns = c.lanes.filter((L) => L.kind === 'turn');
  const ramps = c.lanes.filter((L) => L.kind === 'ramp');
  const thrus = c.lanes.filter((L) => L.kind === 'thru');
  assert.ok(streets.length >= 80, `expected horizontal street segments, got ${streets.length}`);
  assert.ok(turns.length >= 40, `expected 90-degree corner turn segments, got ${turns.length}`);
  assert.ok(ramps.length >= 6 && ramps.length < streets.length * 0.45, `occasional smooth elevation ramps (${ramps.length} vs ${streets.length} flat)`);
  assert.ok(thrus.length >= 20, `expected straight-through intersection segments, got ${thrus.length}`);

  // Every flat street segment keeps exact constant altitude (y1 === y2)
  for (const S of streets) {
    assert.equal(S.y1, S.y2, 'horizontal street segment maintains flat deck altitude');
  }

  // On any given deck, N-S streets and perpendicular E-W streets use separated elevations (no traffic lights needed!)
  for (let deckIdx = 0; deckIdx < 5; deckIdx++) {
    const nsSeg = streets.find((L) => L.deck === deckIdx && L.axis === 'ns');
    const ewSeg = streets.find((L) => L.deck === deckIdx && L.axis === 'ew');
    assert.ok(nsSeg && ewSeg, `deck ${deckIdx} has both N-S and E-W street corridors`);
    assert.ok(Math.abs(nsSeg.y1 - ewSeg.y1) >= 12, `deck ${deckIdx} separates N-S (${nsSeg.y1}m) vs E-W (${ewSeg.y1}m) by >=12m`);
  }

  // Every 90-degree corner turn smoothly bridges the grade-separated yNS <-> yEW height difference and connects to outgoing street segments
  for (const T of turns.slice(0, 30)) {
    assert.ok(Math.abs(T.y2 - T.y1) >= 12, 'corner turn smoothly bridges perpendicular street elevations');
    assert.ok(Array.isArray(T.outs) && T.outs.length >= 1, 'corner turn links into outgoing perpendicular street');
  }
});

test('Phase-10 macro-environment: water/shoreline modes, distant mountains/deserts, curvilinear suburbs + POIs, and park tree networks', () => {
  assert.equal(WATER_MODE_NAMES.length, 5, '5 water modes exported');
  assert.equal(TERRAIN_MODE_NAMES.length, 5, '5 terrain modes exported');
  assert.ok(PLACE_KINDS.includes('park'), 'PLACE_KINDS includes park');

  // 1) Coastal Ocean & Bay + Distant Mountains + Curvilinear Suburbs + Farms
  const coastal = generateCity({
    seed: 4417,
    radius: 5,
    suburbReach: 1.2,
    waterMode: 1,
    terrainMode: 0,
    terrainScale: 1.2,
  });
  const coreSpan = coastal.radius * CELL;
  assert.ok(coastal.water.some((w) => w.kind === 'ocean'), 'waterMode=1 builds analytical ocean shoreline sector');
  assert.ok(coastal.suburbPOIs.some((p) => p.kind === 'shore' || p.kind === 'lighthouse'), 'coastal shoreline generates pier/lighthouse POI');

  // Verify core basin stays flat (0m) while inland mountain horizon rises strongly (>120m)
  const coreElev = evalTerrainHeight(
    0, 0, coreSpan, coastal.suburbSpan,
    coastal.terrainMode, coastal.terrainScale, coastal.coastAngle, coastal.waterMode,
    coastal.terrainSeedX, coastal.terrainSeedZ
  );
  assert.equal(coreElev, 0, 'urban core sits on level 0m basin');

  const inlandAng = coastal.coastAngle + Math.PI;
  let maxMountainY = 0;
  for (let d = 5500; d <= 10500; d += 500) {
    const h = evalTerrainHeight(
      Math.cos(inlandAng) * d, Math.sin(inlandAng) * d,
      coreSpan, coastal.suburbSpan,
      coastal.terrainMode, coastal.terrainScale, coastal.coastAngle, coastal.waterMode,
      coastal.terrainSeedX, coastal.terrainSeedZ
    );
    if (h > maxMountainY) maxMountainY = h;
  }
  assert.ok(maxMountainY > 120, `expected distant mountain relief >120m, got ${maxMountainY.toFixed(1)}m`);

  const col = makeCityCollider(coastal);
  const probeX = Math.cos(inlandAng) * 7000;
  const probeZ = Math.sin(inlandAng) * 7000;
  const expectedH = Math.max(0, evalTerrainHeight(
    probeX, probeZ, coreSpan, coastal.suburbSpan,
    coastal.terrainMode, coastal.terrainScale, coastal.coastAngle, coastal.waterMode,
    coastal.terrainSeedX, coastal.terrainSeedZ
  ));
  assert.ok(Math.abs(col.groundHeightAt(probeX, probeZ) - expectedH) < 1e-6, 'collider groundHeightAt matches terrain field');

  // 2) Suburban houses follow curved streets (non-orthogonal continuous rotations, low-story) + shops, power stations, farms
  const poiKinds = new Set(coastal.suburbPOIs.map((p) => p.kind));
  assert.ok(poiKinds.has('shop'), 'suburbs include neighborhood shops');
  assert.ok(poiKinds.has('power'), 'suburbs include power stations');
  assert.ok(poiKinds.has('farm'), 'rural fringe includes farmsteads');

  const suburbStart = coreSpan + 400;
  let suburbTotal = 0;
  let nonGridRotated = 0;
  let lowStoryCount = 0;
  for (let i = coastal.towers; i < coastal.count; i++) {
    const dist = Math.hypot(coastal.x[i], coastal.z[i]);
    if (dist < suburbStart) continue;
    suburbTotal++;
    const mod90 = Math.abs(((coastal.rot[i] % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2));
    if (mod90 > 0.08 && mod90 < (Math.PI / 2 - 0.08)) nonGridRotated++;
    if (coastal.h[i] <= 14.5) lowStoryCount++;
    const coastDist = evalCoastSignedDist(
      coastal.x[i], coastal.z[i],
      coreSpan, coastal.coastAngle, coastal.waterMode,
      coastal.terrainSeedX, coastal.terrainSeedZ
    );
    assert.ok(coastDist > -145, `suburban/pier structure at (${coastal.x[i].toFixed(0)}, ${coastal.z[i].toFixed(0)}) should not sit deep offshore (sd=${coastDist.toFixed(1)})`);
  }
  assert.ok(suburbTotal > 300, `expected >300 suburban/rural structures, got ${suburbTotal}`);
  assert.ok(nonGridRotated > suburbTotal * 0.55, `expected majority of suburban structures to follow curved non-grid streets (${nonGridRotated}/${suburbTotal})`);
  assert.ok(lowStoryCount > suburbTotal * 0.60, `expected majority of suburban structures to be simple low-story buildings (${lowStoryCount}/${suburbTotal})`);

  // 3) Harbor & Winding River (0), Archipelago (2), Great Crater Lake (3), Dry Desert Mesas (4 + terrain 1)
  const harbor = generateCity({ seed: 4417, radius: 5, waterMode: 0, terrainMode: 2 });
  assert.ok(harbor.water.some((w) => w.kind === 'river'), 'waterMode=0 generates meandering river ribbon');

  const arch = generateCity({ seed: 4417, radius: 5, waterMode: 2, terrainMode: 0 });
  assert.ok(arch.water.some((w) => w.kind === 'ocean'), 'waterMode=2 generates archipelago sea');

  const lake = generateCity({ seed: 4417, radius: 5, waterMode: 3, terrainMode: 3 });
  assert.ok(lake.water.some((w) => w.kind === 'lake'), 'waterMode=3 generates Great Crater Lake');

  const desert = generateCity({ seed: 4417, radius: 5, waterMode: 4, terrainMode: 1, terrainScale: 1.25 });
  assert.equal(desert.water.length, 0, 'waterMode=4 produces dry arid basin');

  // 4) Parks & procedural tree canopy network
  assert.ok(coastal.places.some((p) => p.kind === 'park'), 'city guarantees at least one botanical/cyber park');
  assert.ok(coastal.trees.length >= 90, `expected lush park & avenue tree count >=90, got ${coastal.trees.length}`);
  assert.ok(Array.isArray(coastal.treeLinks) && coastal.treeLinks.length >= 18, `expected >=18 inter-tree canopy links, got ${coastal.treeLinks?.length}`);
});

test('Phase-11: strict water-body exclusion, road-web trapezoid subdivision, dense far suburbs & organic arterial highway growth', () => {
  // 1) Never build inside water bodies across all 4 wet water modes (Harbor+River, Coastal Ocean, Archipelago, Crater Lake)
  for (const wm of [0, 1, 2, 3]) {
    const c = generateCity({ seed: 4417 + wm * 31, radius: 5, suburbReach: 1.0, waterMode: wm, terrainMode: 0 });
    let wetBoxes = 0;
    for (let i = 0; i < c.count; i++) {
      const cx = c.x[i], cz = c.z[i];
      const hw = c.w[i] * 0.5, hd = c.d[i] * 0.5;
      const cs = Math.cos(c.rot[i]), sn = Math.sin(c.rot[i]);
      if (
        isPointInWater(c, cx, cz, 0) ||
        isPointInWater(c, cx + hw * cs + hd * sn, cz - hw * sn + hd * cs, 0) ||
        isPointInWater(c, cx - hw * cs - hd * sn, cz + hw * sn - hd * cs, 0)
      ) {
        wetBoxes++;
      }
    }
    assert.equal(wetBoxes, 0, `waterMode=${wm} must place 0 building boxes in water, got ${wetBoxes}`);
    for (const lm of c.landmarks) {
      assert.equal(isPointInWater(c, lm.x, lm.z, 0), false, `landmark ${lm.name} in water on waterMode=${wm}`);
    }
    for (const pl of c.places) {
      assert.equal(isPointInWater(c, pl.x, pl.z, 0), false, `place ${pl.name} in water on waterMode=${wm}`);
    }
    for (const lp of c.lamps) {
      assert.equal(isPointInWater(c, lp.x, lp.z, 0), false, `street lamp in water on waterMode=${wm}`);
    }
  }

  // 2) Curvilinear trapezoid road-web inverse & parallel road-aligned suburban lots
  const city = generateCity({ seed: 4417, radius: 5, suburbReach: 1.0, waterMode: 0, terrainMode: 2 });
  for (let cellU = 0; cellU < 12; cellU += 3) {
    for (const cellV of [3, 8, 14]) {
      const p = roadWebToWorld(cellU, 0.37, cellV, 0.61, city.terrainSeedX, city.terrainSeedZ);
      const rw = evalRoadWeb(p.x, p.z, city.terrainSeedX, city.terrainSeedZ);
      assert.equal(rw.cellU, cellU, 'roadWebToWorld round-trips radial sector');
      assert.equal(rw.cellV, cellV, 'roadWebToWorld round-trips collector ring');
      assert.ok(Math.abs(rw.fu - 0.37) < 0.01 && Math.abs(rw.fv - 0.61) < 0.01, 'roadWebToWorld round-trips trapezoid (fu,fv)');
    }
  }

  // 3) Denser & farther-stretching suburban sprawl (out to ~8 km at default r=5)
  assert.ok(city.suburbSpan >= 7500, `expected suburbSpan >= 7500m, got ${city.suburbSpan}`);
  assert.ok(city.suburbCount >= 10000, `expected dense suburban/rural sprawl >= 10000 boxes, got ${city.suburbCount}`);
  let farBeyond4500 = 0;
  for (let i = city.towers; i < city.count; i++) {
    if (Math.hypot(city.x[i], city.z[i]) > 4500) farBeyond4500++;
  }
  assert.ok(farBeyond4500 > 1200, `expected >1200 structures stretching past 4.5 km, got ${farBeyond4500}`);

  // 4) Organic ribbon/finger city growth along major radial arterial highways
  const coreSpan = 5 * CELL;
  let corrTowers = 0;
  let wedgeTowers = 0;
  for (let i = 0; i < city.towers; i++) {
    const dist = Math.hypot(city.x[i], city.z[i]);
    if (dist < coreSpan * 1.45 || city.h[i] < 22) continue;
    const rw = evalRoadWeb(city.x[i], city.z[i], city.terrainSeedX, city.terrainSeedZ);
    if (rw.dArt < 95) corrTowers++;
    else if (rw.dArt > 145) wedgeTowers++;
  }
  assert.ok(corrTowers > 60 && corrTowers > wedgeTowers * 3.0, `arterial highway fingers grow out organically (corr=${corrTowers} vs wedge=${wedgeTowers})`);

  // 5) Dedicated closed railLoop monorail rings exist for smooth 5-car Sky-Trains
  const railLoops = city.lanes.filter((L) => L.railLoop);
  assert.ok(railLoops.length >= 16, `expected >=16 closed railLoop segments, got ${railLoops.length}`);
});

test('Phase-12: feature amount dials (0=off .. cranked), shoreline distance, showcase park, river bridges, harbor ships, transit network & spaceport', () => {
  // 1) Zero-amount dials completely turn off each major feature
  const bare = generateCity({
    seed: 4417,
    radius: 5,
    suburbReach: 0,
    waterMode: 1,
    waterAmount: 0,
    terrainMode: 4,
    terrainScale: 0,
    vegCover: 0,
    transitAmt: 0,
    maritimeAmt: 0,
    airAmt: 0,
    signAmt: 0,
    megaWrap: 0,
  });
  assert.equal(bare.water.length, 0, 'waterAmount=0 turns off all water bodies');
  assert.equal(bare.trees.length, 0, 'vegCover=0 turns off all vegetation');
  assert.equal(bare.suburbCount, 0, 'suburbReach=0 turns off suburbs');
  assert.equal(bare.transit.active, false, 'transitAmt=0 disables public transit network');
  assert.equal(bare.transit.stations.length, 0, 'transitAmt=0 builds 0 transit stations');
  assert.equal(bare.harbor, null, 'maritimeAmt=0 disables harbor & ships');
  assert.equal(bare.spaceport, null, 'airAmt=0 disables spaceport');
  assert.equal(bare.bills.length, 0, 'signAmt=0 turns off all billboards');
  assert.equal(bare.signs.length, 0, 'signAmt=0 turns off all street signs');
  assert.equal(bare.holos.length, 0, 'signAmt=0 turns off all holograms');

  // 2) Full rich world: Showcase Park, River + Bridges, Harbor + Cruise/Container Ships, Spaceport & Transit Network
  const rich = generateCity({
    seed: 4417,
    radius: 5,
    suburbReach: 1.0,
    waterMode: 1,
    waterAmount: 1.2,
    shoreDist: 1.0,
    vegCover: 1.4,
    vegScale: 2.6,
    transitAmt: 1.4,
    maritimeAmt: 1.5,
    airAmt: 1.4,
    signAmt: 1.8,
    megaWrap: 1.6,
  });

  const showcasePark = rich.places.find((p) => p.kind === 'park' && p.showcase);
  assert.ok(showcasePark && showcasePark.r >= 85, 'Grand Conservatory Showcase Park exists on 2x2 superblock');
  assert.ok(rich.trees.some((t) => t.h > 45), 'elevated vegScale grows monumental supertree bio-structures');

  assert.ok(rich.bridges.length >= 3, `expected >=3 architectural river bridges, got ${rich.bridges.length}`);
  assert.ok(rich.harbor && rich.harbor.piers.length >= 3, 'harbor builds multiple finger piers');
  assert.ok(rich.harbor.cranes.length >= 2, 'harbor builds straddle gantry cranes');
  assert.ok(rich.harbor.ships.some((s) => s.kind === 'cruise'), 'harbor features Luxury Cruise Liners');
  assert.ok(rich.harbor.ships.some((s) => s.kind === 'container'), 'harbor features Heavy Container Ships');

  assert.ok(rich.spaceport && rich.spaceport.runways.length === 2, 'spaceport builds twin illuminated runways');
  assert.ok(rich.spaceport.pads.length >= 1 && rich.spaceport.flights.length >= 2, 'spaceport has orbital launch pads & active flights');
  // Verify zero core/suburb building boxes intrude onto the spaceport runway plateau
  const sp = rich.spaceport;
  for (let i = 0; i < rich.count; i++) {
    const dx = rich.x[i] - sp.x;
    const dz = rich.z[i] - sp.z;
    const lx = dx * sp.cos + dz * sp.sin;
    const lz = -dx * sp.sin + dz * sp.cos;
    assert.ok(
      Math.abs(lx) >= sp.halfLen || Math.abs(lz) >= sp.halfWid,
      `building box ${i} must not intrude onto spaceport runway apron`
    );
  }

  assert.ok(rich.transit.active && rich.transit.lines.length === 3, '3-line cross-city public transit network active');
  assert.ok(rich.transit.stations.length >= 4, `expected >=4 elevated transit stations, got ${rich.transit.stations.length}`);
  assert.ok(rich.bills.length > 60 && rich.bills.some((b) => b.mega), 'elevated signAmt & megaWrap produce abundant billboards + mega-facade wraps');

  // 3) Shoreline distance shifts coastal water boundary monotonically outward
  const cSpan = 5 * CELL;
  const dNear = evalCoastSignedDist(cSpan * 1.1, 0, cSpan, 0, 1, 0, 0, 0.5, 1.0);
  const dFar = evalCoastSignedDist(cSpan * 1.1, 0, cSpan, 0, 1, 0, 0, 2.0, 1.0);
  assert.ok(dFar > dNear + 400, `larger shoreDist pushes shoreline further offshore (dNear=${dNear.toFixed(0)}, dFar=${dFar.toFixed(0)})`);
});

test('Phase-13 city: dry-land traffic grid (no street lanes over water), bridge lanes, street infrastructure, harbor beach & organic water shapes', () => {
  for (const wm of [0, 1, 2, 3]) {
    const c = generateCity({ seed: 4417, radius: 5, waterMode: wm, waterAmount: 1.0, shoreDist: 1.0 });
    const streetGridLanes = c.lanes.filter((L) => L.kind === 'street' || L.kind === 'thru' || L.kind === 'turn');
    assert.ok(streetGridLanes.length > 80, `wm=${wm}: healthy dry street grid (${streetGridLanes.length} lanes)`);
    for (const L of streetGridLanes) {
      const mx = (L.x1 + L.x2) * 0.5;
      const mz = (L.z1 + L.z2) * 0.5;
      assert.equal(
        isPointInWater(c, mx, mz, 2),
        false,
        `wm=${wm}: street-grid lane (${L.kind} deck=${L.deck}) midpoint (${mx.toFixed(0)}, ${mz.toFixed(0)}) must not cross water`
      );
    }
  }

  const coastal = generateCity({ seed: 4417, radius: 5, waterMode: 1, waterAmount: 1.1, maritimeAmt: 1.2 });
  // River bridges carry dedicated elevated crossing lanes
  if (coastal.bridges.length > 0) {
    assert.ok(coastal.lanes.some((L) => L.kind === 'bridge'), 'river bridges carry explicit elevated bridge traffic lanes');
  }

  // Street infrastructure: cantilevered traffic lights, utility poles, sagging catenary cables & public furniture
  assert.ok(coastal.streetInfra, 'city.streetInfra generated');
  assert.ok(coastal.streetInfra.signals.length >= 16, `expected >=16 intersection signal nodes, got ${coastal.streetInfra.signals.length}`);
  assert.ok(coastal.streetInfra.poles.length >= 20, `expected >=20 sidewalk utility poles, got ${coastal.streetInfra.poles.length}`);
  assert.ok(coastal.streetInfra.cables.length >= 20, `expected >=20 overhead power/cross-street cables, got ${coastal.streetInfra.cables.length}`);
  assert.ok(coastal.streetInfra.furniture.length >= 20, `expected >=20 sidewalk shelters/kiosks/plaza benches, got ${coastal.streetInfra.furniture.length}`);
  for (const sig of coastal.streetInfra.signals) {
    assert.equal(isPointInWater(coastal, sig.x, sig.z, 6), false, 'traffic signal intersection sits on dry land');
  }

  // Multi-lobed harbor lagoons, inland kettle pond & smooth 44-step river + harbor beach & promenade
  const pond = coastal.water.find((w) => w.kind === 'pond');
  const river = coastal.water.find((w) => w.kind === 'river');
  assert.ok(pond && pond.pts.length >= 24, 'organic multi-lobed inland pond generated');
  assert.ok(river && river.pts.length >= 80, 'high-resolution meandering river ribbon generated');
  assert.ok(coastal.harbor && coastal.harbor.beach && coastal.harbor.promenade, 'harbor features golden crescent beach & boardwalk promenade');
});

test('Phase-14 city: dry-coastline transit retraction, airway blimps & adjustable side-street lamp density', () => {
  const c = generateCity({ seed: 4417, radius: 5, suburbReach: 1.0, waterMode: 1, shoreDist: 0.95, transitAmt: 1.4, lampDensity: 2.0 });
  const sdAt = (px, pz) => evalCoastSignedDist(
    px, pz, c.span, c.coastAngle, c.waterMode,
    c.terrainSeedX, c.terrainSeedZ, c.shoreDist, c.waterAmount
  );

  // 1) All 3 transit lines stay strictly inland of ocean coastline (no guideways or trains over open ocean!)
  assert.equal(c.transit.lines.length, 3, 'all 3 transit lines generated');
  const railLoops = c.lanes.filter((l) => l.railLoop);
  assert.ok(railLoops.length >= 24, `expected >=24 railLoop segments, got ${railLoops.length}`);
  for (const ln of c.transit.lines) {
    for (const seg of ln.segments) {
      const mx = (seg.x1 + seg.x2) * 0.5;
      const mz = (seg.z1 + seg.z2) * 0.5;
      assert.ok(sdAt(seg.x1, seg.z1) > 0 && sdAt(seg.x2, seg.z2) > 0 && sdAt(mx, mz) > 0, `transit line ${ln.name} segment stays strictly inland of ocean shoreline`);
    }
  }

  // 2) Blimp routes are never tagged kind: 'street'
  const blimpLanes = c.lanes.filter((l) => l.layer === 'blimp');
  assert.ok(blimpLanes.length >= 16, `expected >=16 blimp ring + avenue segments, got ${blimpLanes.length}`);
  for (const bl of blimpLanes) {
    assert.notEqual(bl.kind, 'street', 'blimp route is never kind street');
  }

  // 3) Secondary side-street lamps extend city.lamps beyond primaryLampCount while keeping first 64 on avenues and all dry
  assert.ok(c.primaryLampCount > 100, 'primaryLampCount recorded');
  assert.ok(c.lamps.length > c.primaryLampCount + 40, `lampDensity=2.0 adds secondary side-street lamps (${c.lamps.length} > ${c.primaryLampCount})`);
  for (let i = c.primaryLampCount; i < c.lamps.length; i++) {
    assert.equal(c.lamps[i].secondary, true);
    assert.equal(isPointInWater(c, c.lamps[i].x, c.lamps[i].z, 4), false, 'secondary side-street lamp stays out of water');
  }
});

test('Phase-15 city: shoreDist-exact ocean river mouths, river-aware streets, and undulating curved scenic transit trajectories', () => {
  // 1) Across extreme shoreDist values (close shore 0.45 and far shore 2.35), coastal rivers always reach & enter the ocean (cDist < 0 at river mouth)!
  for (const shoreDist of [0.45, 1.0, 2.35]) {
    const c = generateCity({ seed: 4417, radius: 5, waterMode: 1, waterAmount: 1.0, shoreDist, transitAmt: 1.0 });
    assert.equal(c.riverFlow.active, true, `river active for shoreDist=${shoreDist}`);
    assert.equal(c.riverFlow.oceanMouth, true, `oceanMouth active for shoreDist=${shoreDist}`);
    const river = c.water.find((w) => w.kind === 'river');
    assert.ok(river && river.pts.length >= 20, 'coastal river polyline generated');
    const [mx0, mz0] = river.pts[0];
    const coreSpan = c.radius * CELL;
    const cDistAtMouth = evalCoastSignedDist(
      mx0, mz0, coreSpan, c.coastAngle, c.waterMode,
      c.terrainSeedX, c.terrainSeedZ, c.shoreDist, c.waterAmount
    );
    assert.ok(cDistAtMouth < -20, `river mouth reaches deep into ocean for shoreDist=${shoreDist} (cDist=${cDistAtMouth.toFixed(1)})`);

    // Analytical O(1) evalRiverSignedDist agrees with river channel (< 0 inside river, > 0 far away)
    const [midX, midZ] = river.pts[Math.floor(river.pts.length * 0.45)];
    assert.ok(evalRiverSignedDist(midX, midZ, c.riverFlow) < 0, 'evalRiverSignedDist < 0 at river centerline');
    assert.ok(evalRiverSignedDist(midX + 600, midZ - 600, c.riverFlow) > 50, 'evalRiverSignedDist > 0 away from river');

    // Street-level non-bridge lanes never dip through the river channel
    const streetSegs = c.lanes.filter((l) => l.kind === 'street' && !l.bridge);
    assert.ok(streetSegs.length > 40, 'dry street segments exist');
    for (const seg of streetSegs) {
      const mx = (seg.x1 + seg.x2) * 0.5;
      const mz = (seg.z1 + seg.z2) * 0.5;
      assert.ok(evalRiverSignedDist(mx, mz, c.riverFlow) > -4, 'non-bridge street lane respects riverbank');
    }
  }

  // 2) Public transport trajectories have curved Bézier segments + smooth undulating elevation profiles (not flat axis-aligned boxes!)
  const ct = generateCity({ seed: 4417, radius: 5, transitAmt: 1.0 });
  assert.equal(ct.transit.lines.length, 3);
  for (const ln of ct.transit.lines) {
    const curvedSegs = ln.segments.filter((s) => !s.straight);
    assert.ok(curvedSegs.length >= 6, `transit line "${ln.name}" has >=6 smooth Bézier curves (got ${curvedSegs.length})`);
    const ys = ln.segments.map((s) => s.y1);
    const ySpread = Math.max(...ys) - Math.min(...ys);
    assert.ok(ySpread > 2.5, `transit line "${ln.name}" undulates in elevation (spread=${ySpread.toFixed(2)}m)`);
  }
});







