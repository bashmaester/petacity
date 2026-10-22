// City scaffolding: streets, blocks, lots, towers. Pure JS (node-testable).
// Everything is deterministic from the seed — same seed, same city.
import { mulberry32, hash2i, makeNoise2D, fbm2D } from './prng.js';

export const CELL = 150; // metres between street centrelines
export const AVENUE = 74; // width of every 4th street
export const STREET = 30; // width of normal streets

/** Width of the street whose centreline index is `idx`. */
export function streetWidth(idx) {
  return ((idx % 4) + 4) % 4 === 0 ? AVENUE : STREET;
}

/**
 * Instance kinds:
 *   0 wall   — windowed facade
 *   1 slab   — podium / roof / machine box (sparse windows)
 *   2 mast   — antenna (no windows)
 *   3 band   — emissive ring/band (landmark trim)
 */
export const KIND = { WALL: 0, SLAB: 1, MAST: 2, BAND: 3 };

/**
 * Grow the city.
 * @param {number} seed
 * @param {number} radius blocks each way from the centre
 * @returns flat instance arrays + stats
 */
export function generateCity(seed = 4417, radius = 13) {
  const noise = makeNoise2D(seed ^ 0x9e3779b9);
  const items = [];
  let towers = 0;

  const push = (x, y, z, w, h, d, s, kind) => {
    items.push(x, y, z, w, h, d, s, kind);
  };

  // A few landmark spires, placed by hash so they are stable per seed.
  const spireCells = new Set();
  const spireCount = 3 + Math.floor(hash2i(7, 7, seed) * 3);
  for (let k = 0; k < spireCount; k++) {
    const bi = Math.floor(hash2i(k, 11, seed) * (radius * 2)) - radius;
    const bj = Math.floor(hash2i(k, 23, seed) * (radius * 2)) - radius;
    spireCells.add(bi + ',' + bj);
  }

  for (let i = -radius; i < radius; i++) {
    for (let j = -radius; j < radius; j++) {
      const x0 = i * CELL + streetWidth(i) / 2;
      const x1 = (i + 1) * CELL - streetWidth(i + 1) / 2;
      const z0 = j * CELL + streetWidth(j) / 2;
      const z1 = (j + 1) * CELL - streetWidth(j + 1) / 2;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;

      // Per-block RNG: independent of iteration order.
      const rand = mulberry32(hash2i(i, j, seed ^ 0x51ed270b) * 4294967296);
      const h01 = fbm2D(noise, cx / 1150, cz / 1150, 3); // district height field

      if (spireCells.has(i + ',' + j)) {
        addSpire(push, rand, cx, cz, h01);
        towers++;
        continue;
      }

      // Split the block into lots (jittered grid, 2–4 per axis).
      const nx = 2 + Math.floor(rand() * (rand() < 0.25 ? 1 : 3));
      const nz = 2 + Math.floor(rand() * (rand() < 0.25 ? 1 : 3));
      const xs = splitSpan(x0, x1, nx, rand);
      const zs = splitSpan(z0, z1, nz, rand);

      for (let a = 0; a < nx; a++) {
        for (let b = 0; b < nz; b++) {
          // Occasional empty lot -> a gap/plaza in the block.
          if (a + 1 < nx && rand() < 0.12) continue;
          if (b + 1 < nz && rand() < 0.12) continue;
          addTower(push, rand, xs[a], xs[a + 1], zs[b], zs[b + 1], h01);
          towers++;
        }
      }
    }
  }

  const n = items.length / 8;
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const z = new Float32Array(n);
  const w = new Float32Array(n);
  const h = new Float32Array(n);
  const d = new Float32Array(n);
  const s = new Float32Array(n);
  const kind = new Float32Array(n);
  let maxY = 0;
  for (let k = 0; k < n; k++) {
    x[k] = items[k * 8 + 0];
    y[k] = items[k * 8 + 1];
    z[k] = items[k * 8 + 2];
    w[k] = items[k * 8 + 3];
    h[k] = items[k * 8 + 4];
    d[k] = items[k * 8 + 5];
    s[k] = items[k * 8 + 6];
    kind[k] = items[k * 8 + 7];
    maxY = Math.max(maxY, y[k] + h[k] / 2);
  }
  return { seed, radius, count: n, towers, maxY, x, y, z, w, h, d, s, kind };
}

/** Split [a,b] into n spans with jittered interior cuts. */
function splitSpan(a, b, n, rand) {
  const out = [a];
  for (let i = 1; i < n; i++) {
    const t = i / n + (rand() - 0.5) * (0.55 / n);
    out.push(a + (b - a) * t);
  }
  out.push(b);
  return out;
}

/** One tower: stacked segments with setbacks, podium, roof clutter, mast. */
function addTower(push, rand, x0, x1, z0, z1, h01) {
  const w = x1 - x0;
  const d = z1 - z0;
  if (w < 12 || d < 12) return;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;

  const floorH = rand() < 0.3 ? 3.1 : rand() < 0.7 ? 3.6 : 4.4;
  let H = (24 + 520 * Math.pow(h01, 1.35)) * (0.5 + rand() * 1.05);
  if (rand() < 0.05) H *= 1.5 + rand() * 0.9; // rare spire-ish
  H = Math.max(28, Math.min(840, H));
  H = Math.round(H / floorH) * floorH;

  const nSeg = 2 + Math.floor(rand() * 4);
  const share = [];
  let total = 0;
  for (let i = 0; i < nSeg; i++) {
    const s = i === 0 ? 1.2 + rand() * 0.8 : 0.6 + rand() * 0.9;
    share.push(s);
    total += s;
  }

  let y = 0;
  let iw = 0;
  let id = 0;
  for (let i = 0; i < nSeg; i++) {
    const segH = (H * share[i]) / total;
    // Setbacks: step in more near the top.
    if (i > 0) {
      const t = i / nSeg;
      iw += rand() * (3 + t * 14);
      id += rand() * (3 + t * 14);
    }
    const sw = Math.max(10, w - iw * 2);
    const sd = Math.max(10, d - id * 2);
    push(cx, y + segH / 2, cz, sw, segH, sd, rand(), KIND.WALL);
    y += segH;

    // Machine boxes on some segment tops.
    if (rand() < 0.35) {
      const m = 1 + Math.floor(rand() * 2);
      for (let k = 0; k < m; k++) {
        const mw = 4 + rand() * Math.min(12, sw * 0.3);
        const md = 4 + rand() * Math.min(12, sd * 0.3);
        const mh = 3 + rand() * 7;
        push(
          cx + (rand() - 0.5) * Math.max(0, sw - mw - 4),
          y + mh / 2,
          cz + (rand() - 0.5) * Math.max(0, sd - md - 4),
          mw, mh, md, rand(), KIND.SLAB
        );
      }
    }
  }

  // Street-facing podium.
  if (rand() < 0.45 && Math.min(w, d) > 22) {
    const ph = 8 + rand() * 13;
    push(cx, ph / 2, cz, w * 1.02, ph, d * 1.02, rand(), KIND.SLAB);
  }

  // Roof slab + mast + aviation light.
  const tw = Math.max(10, w - iw * 2) * 0.92;
  const td = Math.max(10, d - id * 2) * 0.92;
  push(cx, y + 1.1, cz, tw, 2.2, td, rand(), KIND.SLAB);
  if (H > 170 && rand() < 0.7) {
    const ah = 12 + rand() * 40;
    push(cx, y + 2.2 + ah / 2, cz, 1.6, ah, 1.6, rand(), KIND.MAST);
    push(cx, y + 2.2 + ah + 0.7, cz, 1.1, 1.4, 1.1, rand(), KIND.BAND);
  }
}

/** Landmark: tall tapering stack with emissive bands and a long mast. */
function addSpire(push, rand, cx, cz, h01) {
  const H = 520 + h01 * 380 + rand() * 120;
  const r0 = 22 + rand() * 12;
  const nSeg = 6 + Math.floor(rand() * 3);
  let y = 0;
  for (let i = 0; i < nSeg; i++) {
    const segH = H / nSeg;
    const t = i / (nSeg - 1);
    const r = r0 * (1 - t * 0.62) * (0.92 + rand() * 0.16);
    push(cx, y + segH / 2, cz, r * 2, segH, r * 2, rand(), KIND.WALL);
    y += segH;
    if (i % 2 === 1) {
      push(cx, y + 0.8, cz, r * 2.35, 1.6, r * 2.35, rand(), KIND.BAND);
    }
  }
  push(cx, y + 2, cz, r0 * 0.9, 4, r0 * 0.9, rand(), KIND.BAND);
  const ah = 60 + rand() * 70;
  push(cx, y + 4 + ah / 2, cz, 2, ah, 2, rand(), KIND.MAST);
  push(cx, y + 4 + ah + 1, cz, 1.6, 2, 1.6, rand(), KIND.BAND);
}
