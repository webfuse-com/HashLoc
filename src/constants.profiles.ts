import {
	type BucketSegment,
	type CategoricalFeature,
	type MinHashSegment,
	type NumericFeature,
	type Profile,
	type SegmentSpec,
	type SetFeature,
	type Tokenizer
} from "./types.js";
import { DEFAULT_CALIBRATOR, DEFAULT_FEATURE_WEIGHTS } from "./constants.weights.js";
import { finalizeSegments } from "./util.profile.js";


// S: the seven property groups that Kluge & Stocco found highly weighted under every optimization
// objective (name, type, aria-label, location, visible text, neighbor text, attributes).
// 89 bits -> 18 + 1 check = 19 characters.
export const PROFILE_S: Profile = makeProfile(4, "S", [
	hashSegment("name", 6),
	hashSegment("type", 3),
	minHashSegment("ariaLabel", 3, "char3"),
	minHashSegment("text", 6, "char3"),
	minHashSegment("neighborText", 4, "word"),
	minHashSegment("attributes", 4, "pairs"),
	bucketSegment("x", 4),
	bucketSegment("y", 4)
]);

// M: S plus the mid-ranked groups tag, ID, alt, href and area. 159 bits -> 33 characters.
export const PROFILE_M: Profile = makeProfile(5, "M", [
	hashSegment("tag", 5),
	hashSegment("name", 8),
	hashSegment("id", 8),
	hashSegment("type", 4),
	minHashSegment("ariaLabel", 4, "char3"),
	minHashSegment("text", 8, "char3"),
	minHashSegment("neighborText", 6, "word"),
	minHashSegment("attributes", 4, "pairs"),
	minHashSegment("href", 4, "char3"),
	minHashSegment("alt", 3, "char3"),
	bucketSegment("x", 5),
	bucketSegment("y", 5),
	bucketSegment("area", 4)
]);

// L: the full Similo++ property set. 212 bits -> 44 characters.
export const PROFILE_L: Profile = makeProfile(6, "L", [
	hashSegment("tag", 5),
	minHashSegment("classes", 4, "items"),
	hashSegment("name", 8),
	hashSegment("id", 8),
	minHashSegment("href", 4, "char3"),
	minHashSegment("alt", 3, "char3"),
	minHashSegment("xpath", 4, "path"),
	minHashSegment("idXpath", 4, "path"),
	{
		kind: "bool",
		feature: "isButton",
		weight: DEFAULT_FEATURE_WEIGHTS.isButton
	},
	bucketSegment("x", 5),
	bucketSegment("y", 5),
	bucketSegment("area", 4),
	bucketSegment("shape", 3),
	minHashSegment("text", 8, "char3"),
	minHashSegment("neighborText", 6, "word"),
	hashSegment("type", 4),
	minHashSegment("ariaLabel", 4, "char3"),
	minHashSegment("attributes", 4, "pairs")
]);


function hashSegment(feature: CategoricalFeature, bits: number): SegmentSpec {
	return {
		kind: "hash",
		feature: feature,
		bits: bits,
		weight: DEFAULT_FEATURE_WEIGHTS[feature]
	};
}

function minHashSegment(feature: SetFeature, slots: number, tokenizer: Tokenizer): MinHashSegment {
	return {
		kind: "minhash",
		feature: feature,
		slots: slots,
		bitsPerSlot: 4,
		tokenizer: tokenizer,
		weight: DEFAULT_FEATURE_WEIGHTS[feature]
	};
}

function bucketSegment(feature: NumericFeature, bits: number): BucketSegment {
	return {
		kind: "bucket",
		feature: feature,
		bits: bits,
		weight: DEFAULT_FEATURE_WEIGHTS[feature]
	};
}

function makeProfile(version: number, name: string, segments: SegmentSpec[]): Profile {
	return {
		version: version,
		name: name,
		segments: finalizeSegments(segments),
		calibrator: {
			...DEFAULT_CALIBRATOR
		},
		tau: 0.9,
		floor: 0.35
	};
}