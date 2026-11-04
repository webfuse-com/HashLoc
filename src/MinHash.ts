import { fmix32, murmur3, nonZero } from "./util.hash.js";


const GOLDEN_RATIO: number = 0x9e3779b9;


// One-permutation MinHash signature with rotation densification: `slots` raw 32-bit minima,
// or null for an empty token set. Cost is linear in the number of tokens (not tokens × slots).
export function minhashSignature(tokens: Set<string>, slots: number, seed: number): number[] | null {
	if(tokens.size === 0) return null;

	const minima: number[] = new Array<number>(slots).fill(Infinity);
	const valueSeed: number = (seed ^ GOLDEN_RATIO) >>> 0;

	tokens.forEach((token: string) => {
		const bin: number = murmur3(token, seed) % slots;
		const value: number = murmur3(token, valueSeed);

		if(value < minima[bin]) {
			minima[bin] = value;
		}
	});

	// Densify: an empty bin borrows from the next non-empty bin to its right (cyclic),
	// re-mixed with the distance so borrowed values differ from their source.
	const filled: number[] = minima.slice();

	for(let slot: number = 0; slot < slots; slot++) {
		if(minima[slot] !== Infinity) continue;

		for(let distance: number = 1; distance < slots; distance++) {
			const source: number = (slot + distance) % slots;

			if(minima[source] !== Infinity) {
				filled[slot] = fmix32((minima[source] + Math.imul(distance, GOLDEN_RATIO)) >>> 0);
				break;
			}
		}
	}

	return filled;
}

// b-bit MinHash of the built-in "minhash" segment kind: values in 1..2^bits-1, all zeros for an
// empty set (0 is reserved for "empty", so bits must be at least 2).
export function bbitMinHash(tokens: Set<string>, slots: number, bits: number, seed: number): number[] {
	const signature: number[] | null = minhashSignature(tokens, slots, seed);

	if(!signature) return new Array<number>(slots).fill(0);

	return signature.map((value: number) => nonZero(value, bits));
}

// Chance-corrected Jaccard estimate from two b-bit MinHash signatures with `values` distinct values per slot.
export function minhashSimilarity(left: number[], right: number[], bits: number, values: number = 2 ** bits - 1): number {
	let matches: number = 0;

	for(let slot: number = 0; slot < left.length; slot++) {
		if(left[slot] === right[slot]) {
			matches++;
		}
	}

	const chance: number = 1 / values;

	return Math.max(0, (matches / left.length - chance) / (1 - chance));
}