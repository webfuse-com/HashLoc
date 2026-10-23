import { type SketchAlgorithm, type SketchInput, type SketchSegment } from "../types.js";
import { minhashSignature, minhashSimilarity } from "../MinHash.js";


// b-bit one-permutation MinHash (Broder 1997; Li & König 2010): one value per slot, the low
// `bitsPerValue` bits of the slot minimum. Similarity is the chance-corrected Jaccard estimate.
const MINHASH_SKETCH: SketchAlgorithm = {
	name: "minhash",
	encode: (input: SketchInput, segment: SketchSegment, seed: number) => {
		const signature: number[] = minhashSignature(input.tokens, segment.values, seed) ?? [];
		const modulus: number = 2 ** segment.bitsPerValue;

		return signature.map((value: number) => value % modulus);
	},
	similarity: (left: number[], right: number[], segment: SketchSegment) =>
		minhashSimilarity(left, right, segment.bitsPerValue, 2 ** segment.bitsPerValue)
};


export default MINHASH_SKETCH;
