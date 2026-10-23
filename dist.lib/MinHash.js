import { fmix32, murmur3, nonZero } from "./util.hash.js";
const GOLDEN_RATIO = 2654435769;
function minhashSignature(tokens, slots, seed) {
  if (tokens.size === 0) return null;
  const minima = new Array(slots).fill(Infinity);
  const valueSeed = (seed ^ GOLDEN_RATIO) >>> 0;
  tokens.forEach((token) => {
    const bin = murmur3(token, seed) % slots;
    const value = murmur3(token, valueSeed);
    if (value < minima[bin]) {
      minima[bin] = value;
    }
  });
  const filled = minima.slice();
  for (let slot = 0; slot < slots; slot++) {
    if (minima[slot] !== Infinity) continue;
    for (let distance = 1; distance < slots; distance++) {
      const source = (slot + distance) % slots;
      if (minima[source] !== Infinity) {
        filled[slot] = fmix32(minima[source] + Math.imul(distance, GOLDEN_RATIO) >>> 0);
        break;
      }
    }
  }
  return filled;
}
function bbitMinHash(tokens, slots, bits, seed) {
  const signature = minhashSignature(tokens, slots, seed);
  if (!signature) return new Array(slots).fill(0);
  return signature.map((value) => nonZero(value, bits));
}
function minhashSimilarity(left, right, bits, values = 2 ** bits - 1) {
  let matches = 0;
  for (let slot = 0; slot < left.length; slot++) {
    if (left[slot] === right[slot]) {
      matches++;
    }
  }
  const chance = 1 / values;
  return Math.max(0, (matches / left.length - chance) / (1 - chance));
}
export {
  bbitMinHash,
  minhashSignature,
  minhashSimilarity
};
