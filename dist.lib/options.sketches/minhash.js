import { minhashSignature, minhashSimilarity } from "../MinHash.js";
const MINHASH_SKETCH = {
  name: "minhash",
  encode: (input, segment, seed) => {
    const signature = minhashSignature(input.tokens, segment.values, seed) ?? [];
    const modulus = 2 ** segment.bitsPerValue;
    return signature.map((value) => value % modulus);
  },
  similarity: (left, right, segment) => minhashSimilarity(left, right, segment.bitsPerValue, 2 ** segment.bitsPerValue)
};
var minhash_default = MINHASH_SKETCH;
export {
  minhash_default as default
};
