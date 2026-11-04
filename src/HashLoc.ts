// -------------------------------------
// Copyright (c) Thassilo M. Schiepanski
// -------------------------------------

import { type ElementFeatures, type NumericFeature, type Profile, type SegmentSpec, type SegmentValues, type SketchSegment } from "./types.js";
import { base32ToBits, BitReader, BitWriter, bitsToBase32, canonicalize, luhnCheckChar, luhnValid } from "./util.bits.js";
import { murmur3, nonZero } from "./util.hash.js";
import { bbitMinHash } from "./MinHash.js";
import { featureTokens, normalizeText } from "./util.text.js";
import { codeLength } from "./util.profile.js";
import { defaultRegistry, ProfileRegistry } from "./ProfileRegistry.js";
import { getSketch } from "./options.sketches.js";


// Salt of the per-segment hash seeds. Part of the code format: changing it changes every code, so it
// keeps the library's original name and changes only with a new format version.
const SEED_SALT: string = "simcode";


export interface DecodedCode {
	profile: Profile;
	values: SegmentValues;
	code: string;
}


export class CodeError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "CodeError";
	}
}


const SEED_CACHE: WeakMap<Profile, number[]> = new WeakMap<Profile, number[]>();


function seeds(profile: Profile): number[] {
	let cached: number[] | undefined = SEED_CACHE.get(profile);

	if(!cached) {
		cached = profile.segments.map((segment: SegmentSpec, index: number) =>
			murmur3(`${SEED_SALT}:v${profile.version}:${index}:${segment.kind}:${segment.feature}`, 0x5eed)
		);
		SEED_CACHE.set(profile, cached);
	}

	return cached;
}

function clamp01(value: number): number {
	return value < 0 ? 0 : value > 1 ? 1 : value;
}

function segmentValue(segment: SegmentSpec, features: ElementFeatures, seed: number): number[] {
	if(segment.kind === "hash") {
		const value: string = normalizeText(features[segment.feature]);

		return [ value ? nonZero(murmur3(value, seed), segment.bits) : 0 ];
	}

	if(segment.kind === "minhash") {
		const tokens: Set<string> = featureTokens(features, segment.feature, segment.tokenizer, segment.excludeKeys);

		return bbitMinHash(tokens, segment.slots, segment.bitsPerSlot, seed);
	}

	if(segment.kind === "bool") return [ features[segment.feature] ? 2 : 1 ];

	if(segment.kind === "sketch") return sketchValue(segment, features, seed);

	const fraction: number | null = numericFraction(segment.feature, features);

	if(fraction === null) return [ 0 ];

	const buckets: number = 2 ** segment.bits - 1;

	return [ 1 + Math.min(buckets - 1, Math.floor(fraction * buckets)) ];
}

// Presence bit plus the algorithm's values; all zeros when the feature has no tokens.
function sketchValue(segment: SketchSegment, features: ElementFeatures, seed: number): number[] {
	const tokens: Set<string> = featureTokens(features, segment.feature, segment.tokenizer, segment.excludeKeys);

	if(tokens.size === 0) return new Array<number>(segment.values + 1).fill(0);

	const text: string = segment.feature === "attributes" || segment.feature === "classes"
		? Array.from(tokens).sort().join(" ")
		: normalizeText(features[segment.feature], segment.feature === "neighborText" ? 300 : 200);
	const values: number[] = getSketch(segment.algorithm).encode({
		tokens: tokens,
		text: text
	}, segment, seed);

	if(values.length !== segment.values) {
		throw new RangeError(`sketch '${segment.algorithm}' returned ${values.length} values, expected ${segment.values}`);
	}

	return [ 1 ].concat(values);
}

// Bit width of every stored value of a segment, in order.
function widths(segment: SegmentSpec): number[] {
	if(segment.kind === "minhash") return new Array<number>(segment.slots).fill(segment.bitsPerSlot);

	if(segment.kind === "sketch") return [ 1 ].concat(new Array<number>(segment.values).fill(segment.bitsPerValue));

	if(segment.kind === "bool") return [ 2 ];

	return [ segment.bits ];
}


// Map a numeric feature to [0,1] with a feature-specific scale.
export function numericFraction(feature: NumericFeature, features: ElementFeatures): number | null {
	const geom: ElementFeatures["geom"] = features.geom;

	if(!geom) return null;

	switch(feature) {
		case "x":
			return clamp01(geom.x);
		case "y":
			return clamp01(Math.log1p(Math.max(0, geom.y)) / Math.log1p(10));
		case "area":
			return clamp01((Math.log2(Math.max(1, geom.area)) - 4) / 16);
		case "shape":
			return geom.shape > 0 ? clamp01((Math.log2(geom.shape) + 5) / 10) : null;
	}
}

// Compute the segment values of an element under a profile (what the code stores).
export function segmentValues(features: ElementFeatures, profile: Profile): SegmentValues {
	const segmentSeeds: number[] = seeds(profile);

	return profile.segments.map((segment: SegmentSpec, index: number) =>
		segmentValue(segment, features, segmentSeeds[index])
	);
}

// Serialize segment values into a code string (version prefix + payload + check char).
export function valuesToCode(values: SegmentValues, profile: Profile): string {
	const writer: BitWriter = new BitWriter();

	writer.write(profile.version, 4);

	profile.segments.forEach((segment: SegmentSpec, index: number) => {
		const segmentWidths: number[] = widths(segment);

		values[index].forEach((value: number, position: number) => {
			writer.write(value, segmentWidths[position]);
		});
	});

	const body: string = bitsToBase32(writer.bits);

	return body + luhnCheckChar(body);
}

// Encode element features into a short code.
export function encodeFeatures(features: ElementFeatures, profile: Profile): string {
	return valuesToCode(segmentValues(features, profile), profile);
}

// Parse a code: verifies the check character, looks up the profile by version, reads segments.
export function decodeCode(code: string, registry: ProfileRegistry = defaultRegistry): DecodedCode {
	const canonical: string = canonicalize(code);

	if(canonical.length < 2) throw new CodeError("code too short");

	let valid: boolean;

	try {
		valid = luhnValid(canonical);
	} catch(error: unknown) {
		throw new CodeError((error as Error).message);
	}

	if(!valid) throw new CodeError("check character mismatch (typo or truncated code)");

	const reader: BitReader = new BitReader(base32ToBits(canonical.slice(0, -1)));
	const version: number = reader.read(4);
	const profile: Profile | undefined = registry.get(version);

	if(!profile) {
		throw new CodeError(`unknown code version ${version}`);
	}

	if(canonical.length !== codeLength(profile)) {
		throw new CodeError(`expected ${codeLength(profile)} characters for profile ${profile.name}, got ${canonical.length}`);
	}

	const values: SegmentValues = profile.segments.map((segment: SegmentSpec) =>
		widths(segment).map((width: number) => reader.read(width))
	);

	return {
		profile: profile,
		values: values,
		code: canonical
	};
}