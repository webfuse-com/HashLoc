import { murmur3 } from "../util.hash.js";
const GOLDEN_RATIO = 2654435769;
const SIMHASH_SKETCH = {
  name: "simhash",
  encode: (input, segment, seed) => {
    const bitCount = segment.values * segment.bitsPerValue;
    const balance = new Array(bitCount).fill(0);
    const chunks = Math.ceil(bitCount / 32);
    input.tokens.forEach((token) => {
      for (let chunk = 0; chunk < chunks; chunk++) {
        const hash = murmur3(token, (seed ^ Math.imul(chunk + 1, GOLDEN_RATIO)) >>> 0);
        for (let bit = 0; bit < 32 && chunk * 32 + bit < bitCount; bit++) {
          balance[chunk * 32 + bit] += hash >>> bit & 1 ? 1 : -1;
        }
      }
    });
    return packBits(balance.map((value) => value > 0 ? 1 : 0), segment.bitsPerValue);
  },
  similarity: (left, right, segment) => {
    const leftBits = unpackBits(left, segment.bitsPerValue);
    const rightBits = unpackBits(right, segment.bitsPerValue);
    let hamming = 0;
    for (let bit = 0; bit < leftBits.length; bit++) {
      if (leftBits[bit] !== rightBits[bit]) {
        hamming++;
      }
    }
    return Math.max(0, Math.cos(Math.PI * hamming / leftBits.length));
  }
};
function packBits(bits, bitsPerValue) {
  const values = [];
  for (let offset = 0; offset < bits.length; offset += bitsPerValue) {
    let value = 0;
    for (let bit = 0; bit < bitsPerValue; bit++) {
      value = value * 2 + (bits[offset + bit] ?? 0);
    }
    values.push(value);
  }
  return values;
}
function unpackBits(values, bitsPerValue) {
  const bits = [];
  for (const value of values) {
    for (let bit = bitsPerValue - 1; bit >= 0; bit--) {
      bits.push(Math.floor(value / 2 ** bit) % 2);
    }
  }
  return bits;
}
var simhash_default = SIMHASH_SKETCH;
export {
  simhash_default as default
};
