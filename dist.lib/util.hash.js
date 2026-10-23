const TEXT_ENCODER = new TextEncoder();
const MURMUR_C1 = 3432918353;
const MURMUR_C2 = 461845907;
function fmix32(value) {
  let hash = value;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 2246822507);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 3266489909);
  hash ^= hash >>> 16;
  return hash >>> 0;
}
function murmur3(text, seed = 0) {
  const data = TEXT_ENCODER.encode(text);
  const length = data.length;
  const blockEnd = length & ~3;
  let hash = seed >>> 0;
  for (let offset = 0; offset < blockEnd; offset += 4) {
    let block2 = data[offset] | data[offset + 1] << 8 | data[offset + 2] << 16 | data[offset + 3] << 24;
    block2 = Math.imul(block2, MURMUR_C1);
    block2 = block2 << 15 | block2 >>> 17;
    block2 = Math.imul(block2, MURMUR_C2);
    hash ^= block2;
    hash = hash << 13 | hash >>> 19;
    hash = Math.imul(hash, 5) + 3864292196 | 0;
  }
  const tail = length & 3;
  let block = 0;
  if (tail === 3) {
    block ^= data[blockEnd + 2] << 16;
  }
  if (tail >= 2) {
    block ^= data[blockEnd + 1] << 8;
  }
  if (tail >= 1) {
    block ^= data[blockEnd];
    block = Math.imul(block, MURMUR_C1);
    block = block << 15 | block >>> 17;
    block = Math.imul(block, MURMUR_C2);
    hash ^= block;
  }
  hash ^= length;
  return fmix32(hash);
}
function nonZero(hash, bits) {
  if (bits < 2 || bits > 31) {
    throw new RangeError(`bits must be in 2..31, got ${bits}`);
  }
  return 1 + hash % (2 ** bits - 1);
}
export {
  fmix32,
  murmur3,
  nonZero
};
