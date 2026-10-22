// Seeded randomness + smooth noise. Pure JS, no dependencies (node-testable).

/** Fast deterministic PRNG. Same seed -> same stream. */
export function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stateless hash of 2 ints + seed -> 0..1. */
export function hash2i(x, y, seed = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

/** Smooth 2D value noise in roughly 0..1. */
export function makeNoise2D(seed = 0) {
  return function noise(x, y) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = smooth(x - xi);
    const yf = smooth(y - yi);
    return lerp(
      lerp(hash2i(xi, yi, seed), hash2i(xi + 1, yi, seed), xf),
      lerp(hash2i(xi, yi + 1, seed), hash2i(xi + 1, yi + 1, seed), xf),
      yf
    );
  };
}

/** Fractal sum of noise, roughly 0..1. */
export function fbm2D(noise, x, y, octaves = 3) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let fx = x;
  let fy = y;
  for (let i = 0; i < octaves; i++) {
    sum += noise(fx, fy) * amp;
    norm += amp;
    amp *= 0.5;
    fx *= 2.17;
    fy *= 2.17;
  }
  return sum / norm;
}
