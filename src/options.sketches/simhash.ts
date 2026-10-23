import { type SketchAlgorithm, type SketchInput, type SketchSegment } from "../types.js";
import { murmur3 } from "../util.hash.js";


const GOLDEN_RATIO: number = 0x9e3779b9;


// SimHash (Charikar 2002) over the unweighted token set: one signature bit per random hyperplane,
// `values × bitsPerValue` bits in total, packed into the values. Similarity is the estimated cosine
// cos(π · hamming / bits), clipped at 0.
const SIMHASH_SKETCH: SketchAlgorithm = {
	name: "simhash",
	encode: (input: SketchInput, segment: SketchSegment, seed: number) => {
		const bitCount: number = segment.values * segment.bitsPerValue;
		const balance: number[] = new Array<number>(bitCount).fill(0);
		const chunks: number = Math.ceil(bitCount / 32);

		input.tokens.forEach((token: string) => {
			for(let chunk: number = 0; chunk < chunks; chunk++) {
				const hash: number = murmur3(token, (seed ^ Math.imul(chunk + 1, GOLDEN_RATIO)) >>> 0);

				for(let bit: number = 0; bit < 32 && chunk * 32 + bit < bitCount; bit++) {
					balance[chunk * 32 + bit] += (hash >>> bit) & 1 ? 1 : -1;
				}
			}
		});

		return packBits(balance.map((value: number) => value > 0 ? 1 : 0), segment.bitsPerValue);
	},
	similarity: (left: number[], right: number[], segment: SketchSegment) => {
		const leftBits: number[] = unpackBits(left, segment.bitsPerValue);
		const rightBits: number[] = unpackBits(right, segment.bitsPerValue);
		let hamming: number = 0;

		for(let bit: number = 0; bit < leftBits.length; bit++) {
			if(leftBits[bit] !== rightBits[bit]) {
				hamming++;
			}
		}

		return Math.max(0, Math.cos(Math.PI * hamming / leftBits.length));
	}
};


function packBits(bits: number[], bitsPerValue: number): number[] {
	const values: number[] = [];

	for(let offset: number = 0; offset < bits.length; offset += bitsPerValue) {
		let value: number = 0;

		for(let bit: number = 0; bit < bitsPerValue; bit++) {
			value = value * 2 + (bits[offset + bit] ?? 0);
		}

		values.push(value);
	}

	return values;
}

function unpackBits(values: number[], bitsPerValue: number): number[] {
	const bits: number[] = [];

	for(const value of values) {
		for(let bit: number = bitsPerValue - 1; bit >= 0; bit--) {
			bits.push(Math.floor(value / 2 ** bit) % 2);
		}
	}

	return bits;
}


export default SIMHASH_SKETCH;
