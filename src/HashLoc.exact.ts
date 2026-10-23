import { type ElementFeatures, type Profile, type SegmentSpec } from "./types.js";
import { numericFraction } from "./HashLoc.js";
import { featureTokens, normalizeText } from "./util.text.js";
import { weightedScore } from "./HashLoc.score.js";


/**
 * The uncompressed counterpart of a segment value: a normalized string (hash segments), a token
 * set (MinHash and sketch segments), an unquantized fraction (bucket segments) or a boolean.
 * null marks an absent feature, exactly where the compressed segment would be empty.
 */
export type ExactValue = string | Set<string> | number | boolean | null;

/** Concentration terms of one (code, candidate) pair, see `pairTerms`. */
export interface PairTerms {
	/** Hoeffding parameter K: P(|compressed - uncompressed score| >= t) <= 2 exp(-2 K t²). */
	effectiveSlots: number;
	/** Upper bound on the deterministic part of the deviation (hash collisions, bucket quantization). */
	bias: number;
}


function setSimilarity(left: Set<string>, right: Set<string>, cosine: boolean): number {
	let shared: number = 0;

	left.forEach((token: string) => {
		if(right.has(token)) {
			shared++;
		}
	});

	return cosine ? shared / Math.sqrt(left.size * right.size) : shared / (left.size + right.size - shared);
}

function exactValue(segment: SegmentSpec, features: ElementFeatures): ExactValue {
	switch(segment.kind) {
		case "hash": {
			const text: string = normalizeText(features[segment.feature]);

			return text ? text : null;
		}
		case "minhash":
		case "sketch": {
			const tokens: Set<string> = featureTokens(features, segment.feature, segment.tokenizer, segment.excludeKeys);

			return tokens.size > 0 ? tokens : null;
		}
		case "bucket":
			return numericFraction(segment.feature, features);
		case "bool":
			return Boolean(features[segment.feature]);
	}
}


// Uncompressed values of an element under a profile (what the code approximates).
export function exactValues(features: ElementFeatures, profile: Profile): ExactValue[] {
	return profile.segments.map((segment: SegmentSpec) => exactValue(segment, features));
}

// Similarity a segment would have with unlimited bits: exact equality (hash, bool), exact Jaccard of
// the token sets (MinHash; cosine for SimHash sketches) or 1 - |difference| of the unquantized
// fractions (bucket). null when both sides are absent, 0 when one is, as in the compressed scoring.
export function exactSimilarity(segment: SegmentSpec, left: ExactValue, right: ExactValue): number | null {
	if(left === null && right === null) return null;

	if(left === null || right === null) return 0;

	if(segment.kind === "minhash" || segment.kind === "sketch") {
		const cosine: boolean = segment.kind === "sketch" && segment.algorithm === "simhash";

		return setSimilarity(left as Set<string>, right as Set<string>, cosine);
	}

	if(segment.kind === "bucket") return 1 - Math.abs((left as number) - (right as number));

	return left === right ? 1 : 0;
}

export function exactSimilarityVector(profile: Profile, left: ExactValue[], right: ExactValue[]): (number | null)[] {
	return profile.segments.map((segment: SegmentSpec, index: number) =>
		exactSimilarity(segment, left[index], right[index])
	);
}

// Weighted score with unlimited bits: the reference the compressed score approximates.
export function exactScore(profile: Profile, left: ExactValue[], right: ExactValue[]): number {
	const weights: number[] = profile.segments.map((segment: SegmentSpec) => segment.weight);

	return weightedScore(weights, exactSimilarityVector(profile, left, right));
}

// Concentration of the compressed score of one (code, candidate) pair around its uncompressed score.
// Each MinHash slot is one bounded term of the score (range share / (k (1 - r)), with share = w / W
// and r the chance-collision rate), so by Hoeffding the random deviation exceeds t with probability
// at most exp(-2 K t²) per side, K = 1 / Σ share² / (k (1 - r)²). Hash collisions (rate 1 / (2^b - 1))
// and bucket quantization (at most 2 / (B - 1)) add a bounded deterministic deviation `bias`.
// Segments of other sketch algorithms make the terms undefined (NaN).
export function pairTerms(profile: Profile, code: ExactValue[], candidate: ExactValue[]): PairTerms {
	let totalWeight: number = 0;

	profile.segments.forEach((segment: SegmentSpec, index: number) => {
		if(code[index] !== null || candidate[index] !== null) {
			totalWeight += segment.weight;
		}
	});

	if(totalWeight <= 0) {
		return {
			effectiveSlots: Infinity,
			bias: 0
		};
	}

	let varianceSum: number = 0;
	let bias: number = 0;

	for(let index: number = 0; index < profile.segments.length; index++) {
		const segment: SegmentSpec = profile.segments[index];

		if(code[index] === null || candidate[index] === null) continue;

		const share: number = segment.weight / totalWeight;

		if(segment.kind === "minhash") {
			const chance: number = 1 / (2 ** segment.bitsPerSlot - 1);

			varianceSum += share * share / (segment.slots * (1 - chance) ** 2);
		} else if(segment.kind === "sketch") {
			if(segment.algorithm !== "minhash") {
				return {
					effectiveSlots: NaN,
					bias: NaN
				};
			}

			const chance: number = 2 ** -segment.bitsPerValue;

			varianceSum += share * share / (segment.values * (1 - chance) ** 2);
		} else if(segment.kind === "hash") {
			bias += share / (2 ** segment.bits - 1);
		} else if(segment.kind === "bucket") {
			const buckets: number = 2 ** segment.bits - 1;

			bias += buckets > 1 ? share * 2 / (buckets - 1) : share;
		}
	}

	return {
		effectiveSlots: varianceSum > 0 ? 1 / varianceSum : Infinity,
		bias: bias
	};
}

// Upper bound on the probability that the compressed code ranks a different candidate first than
// uncompressed scoring does (union bound over competitors). `reference` is the index of the
// uncompressed top-1 and `scores` the uncompressed scores. A competitor within the bias of the
// reference makes the bound trivial (1); the result is capped at 1. NaN if the profile uses a sketch
// algorithm without concentration terms.
export function topOneErrorBound(profile: Profile, code: ExactValue[], candidates: ExactValue[][], reference: number, scores: number[]): number {
	const referenceTerms: PairTerms = pairTerms(profile, code, candidates[reference]);

	if(Number.isNaN(referenceTerms.effectiveSlots)) return NaN;

	let bound: number = 0;

	for(let index: number = 0; index < candidates.length; index++) {
		if(index === reference) continue;

		const terms: PairTerms = pairTerms(profile, code, candidates[index]);
		const slack: number = (scores[reference] - scores[index] - referenceTerms.bias - terms.bias) / 2;

		if(slack <= 0) return 1;

		bound += Math.exp(-2 * slack * slack * referenceTerms.effectiveSlots) + Math.exp(-2 * slack * slack * terms.effectiveSlots);

		if(bound >= 1) return 1;
	}

	return bound;
}
