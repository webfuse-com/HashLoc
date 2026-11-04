import { type FeatureName, type Profile, type PropertyGroup, type SegmentSpec, type SketchSegment } from "./types.js";
import { PROPERTY_GROUPS } from "./constants.weights.js";
import { getSketch } from "./options.sketches.js";


// Attribute keys that have their own segment when the corresponding feature is present.
const ATTRIBUTE_KEY: Partial<Record<FeatureName, string>> = {
	id: "id",
	classes: "class",
	name: "name",
	type: "type",
	ariaLabel: "aria-label",
	href: "href",
	alt: "alt"
};


// Recompute the attribute segment's excluded keys from the other segments, so information of a
// dropped property group (e.g. href in profile S) still reaches the code through the attribute map.
// "style" is always excluded as too volatile.
export function finalizeSegments(segments: SegmentSpec[]): SegmentSpec[] {
	const covered: string[] = [ "style" ];

	for(const segment of segments) {
		const key: string | undefined = ATTRIBUTE_KEY[segment.feature];

		if(key && segment.feature !== "attributes" && covered.indexOf(key) < 0) {
			covered.push(key);
		}
	}

	covered.sort();

	return segments.map((segment: SegmentSpec) => {
		if((segment.kind === "minhash" || segment.kind === "sketch") && segment.feature === "attributes") {
			return {
				...segment,
				excludeKeys: covered.slice()
			};
		}

		return segment;
	});
}

export function segmentBits(segment: SegmentSpec): number {
	if(segment.kind === "minhash") return segment.slots * segment.bitsPerSlot;

	if(segment.kind === "sketch") return 1 + segment.values * segment.bitsPerValue;

	if(segment.kind === "bool") return 2;

	return segment.bits;
}

// Payload bits including the 4-bit version prefix (excluding the check character).
export function profileBits(profile: Profile): number {
	return profile.segments.reduce((sum: number, segment: SegmentSpec) => sum + segmentBits(segment), 4);
}

// Total code length in characters, including the check character.
export function codeLength(profile: Profile): number {
	return Math.ceil(profileBits(profile) / 5) + 1;
}

// Same layout, different weights (e.g. SIMILO_WEIGHTS for a comparison run).
export function withFeatureWeights(profile: Profile, weights: Partial<Record<FeatureName, number>>): Profile {
	return {
		...profile,
		segments: profile.segments.map((segment: SegmentSpec) => ({
			...segment,
			weight: weights[segment.feature] ?? segment.weight
		}))
	};
}

// Ablation helper: the profile without one Similo property group. Attribute exclusions are
// recomputed, so the dropped group's attribute (if any) flows back into the attribute map.
// Give the result a new version number before encoding codes that must coexist with the original.
export function withoutGroup(profile: Profile, group: PropertyGroup): Profile {
	const dropped: readonly FeatureName[] = PROPERTY_GROUPS[group];
	const kept: SegmentSpec[] = profile.segments.filter((segment: SegmentSpec) => dropped.indexOf(segment.feature) < 0);

	return {
		...profile,
		name: `${profile.name}-${group}`,
		segments: finalizeSegments(kept)
	};
}

// The profile with every token-set segment ("minhash" or "sketch") backed by `algorithm`, keeping
// each segment's payload: `values = payload bits / bitsPerValue`. Every converted segment gains its
// presence bit, so all variants of one profile have the same length and compare fairly.
export function withSketch(profile: Profile, algorithm: string, bitsPerValue: number, version: number = profile.version): Profile {
	getSketch(algorithm);

	const segments: SegmentSpec[] = profile.segments.map((segment: SegmentSpec) => {
		if(segment.kind !== "minhash" && segment.kind !== "sketch") return segment;

		const payload: number = segment.kind === "minhash" ? segment.slots * segment.bitsPerSlot : segment.values * segment.bitsPerValue;
		const converted: SketchSegment = {
			kind: "sketch",
			feature: segment.feature,
			algorithm: algorithm,
			values: Math.max(1, Math.floor(payload / bitsPerValue)),
			bitsPerValue: bitsPerValue,
			tokenizer: segment.tokenizer,
			weight: segment.weight
		};

		return converted;
	});

	return {
		...profile,
		version: version,
		name: `${profile.name}+${algorithm}-b${bitsPerValue}`,
		segments: finalizeSegments(segments)
	};
}

export function validateProfile(profile: Profile): void {
	if(!Number.isInteger(profile.version) || profile.version < 1 || profile.version > 15) {
		throw new RangeError(`profile version must be 1..15, got ${profile.version}`);
	}

	for(const segment of profile.segments) {
		if(segment.kind === "sketch") {
			getSketch(segment.algorithm);

			if(segment.bitsPerValue < 1 || segment.bitsPerValue > 31 || segment.values < 1) {
				throw new RangeError(`segment ${segment.feature}: sketch needs values >= 1 and bitsPerValue 1..31`);
			}
		} else if(segment.kind !== "bool") {
			const bits: number = segment.kind === "minhash" ? segment.bitsPerSlot : segment.bits;

			if(bits < 2 || bits > 31) {
				throw new RangeError(`segment ${segment.feature}: bits must be 2..31`);
			}
		}

		if(segment.kind === "minhash" && segment.slots < 1) {
			throw new RangeError(`segment ${segment.feature}: slots must be >= 1`);
		}

		if(!(segment.weight >= 0)) {
			throw new RangeError(`segment ${segment.feature}: weight must be >= 0`);
		}
	}
}