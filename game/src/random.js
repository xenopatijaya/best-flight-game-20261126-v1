// random.js — one job: a small seeded RNG (mulberry32) so worlds and
// screenshot scenes are reproducible from a seed.
export function createRandom(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic 2D value noise in [-1, 1], built from a seeded hash grid. */
export function makeNoise2D(seed) {
  const rand = createRandom(seed);
  const perm = new Uint8Array(512);
  const base = new Uint8Array(256);
  for (let i = 0; i < 256; i++) base[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = base[i];
    base[i] = base[j];
    base[j] = t;
  }
  for (let i = 0; i < 512; i++) perm[i] = base[i & 255];
  function fade(t) {
    return t * t * (3 - 2 * t);
  }
  function grad(hash, x, y) {
    // gradient from hash: one of 4 diagonal directions
    switch (hash & 3) {
      case 0:
        return x + y;
      case 1:
        return -x + y;
      case 2:
        return x - y;
      default:
        return -x - y;
    }
  }
  return function noise(x, y) {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);
    const aa = grad(perm[perm[xi] + yi], xf, yf);
    const ba = grad(perm[perm[xi + 1] + yi], xf - 1, yf);
    const ab = grad(perm[perm[xi] + yi + 1], xf, yf - 1);
    const bb = grad(perm[perm[xi + 1] + yi + 1], xf - 1, yf - 1);
    const x1 = aa + (ba - aa) * u;
    const x2 = ab + (bb - ab) * u;
    return (x1 + (x2 - x1) * v) * 1.4142;
  };
}
