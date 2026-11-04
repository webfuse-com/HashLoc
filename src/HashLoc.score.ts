import { type Calibrator, type Profile, type SegmentSpec, type SegmentValues } from "./types.js";
import { minhashSimilarity } from "./MinHash.js";
import { getSketch } from "./options.sketches.js";


function isEmpty(values: number[]): boolean {
	return values.every((value: number) => value === 0);
}


// Similarity of one segment in [0,1], or null when both sides are empty (segment skipped).
export function segmentSimilarity(segment: SegmentSpec, left: number[], right: number[]): number | null {
	const leftEmpty: boolean = isEmpty(left);
	const rightEmpty: boolean = isEmpty(right);

	if(leftEmpty && rightEmpty) return null;

	if(leftEmpty || rightEmpty) return 0;

	if(segment.kind === "hash" || segment.kind === "bool") return left[0] === right[0] ? 1 : 0;

	if(segment.kind === "minhash") return minhashSimilarity(left, right, segment.bitsPerSlot);

	if(segment.kind === "sketch") return getSketch(segment.algorithm).similarity(left.slice(1), right.slice(1), segment);

	const buckets: number = 2 ** segment.bits - 1;

	if(buckets <= 1) return left[0] === right[0] ? 1 : 0;

	return 1 - Math.abs(left[0] - right[0]) / (buckets - 1);
}

// All segment similarities (null = skipped). Independent of weights, so it can be cached for training.
export function similarityVector(profile: Profile, code: SegmentValues, candidate: SegmentValues): (number | null)[] {
	return profile.segments.map((segment: SegmentSpec, index: number) =>
		segmentSimilarity(segment, code[index], candidate[index])
	);
}

// Weighted mean over active segments.
export function weightedScore(weights: number[], similarities: (number | null)[]): number {
	let numerator: number = 0;
	let denominator: number = 0;

	for(let index: number = 0; index < similarities.length; index++) {
		const similarity: number | null = similarities[index];

		if(similarity === null) continue;

		numerator += weights[index] * similarity;
		denominator += weights[index];
	}

	return denominator > 0 ? numerator / denominator : 0;
}

export function scoreValues(profile: Profile, code: SegmentValues, candidate: SegmentValues): number {
	const weights: number[] = profile.segments.map((segment: SegmentSpec) => segment.weight);

	return weightedScore(weights, similarityVector(profile, code, candidate));
}

// Share of total weight carried by non-empty segments of the code (how informative it is).
export function codeCoverage(profile: Profile, code: SegmentValues): number {
	let total: number = 0;
	let present: number = 0;

	profile.segments.forEach((segment: SegmentSpec, index: number) => {
		total += segment.weight;

		if(!isEmpty(code[index])) {
			present += segment.weight;
		}
	});

	return total > 0 ? present / total : 0;
}

export function sigmoid(value: number): number {
	return 1 / (1 + Math.exp(-value));
}

export function calibrate(calibrator: Calibrator, topScore: number, margin: number, coverage: number): number {
	return sigmoid(calibrator.bias + calibrator.score * topScore + calibrator.margin * margin + calibrator.coverage * coverage);
}