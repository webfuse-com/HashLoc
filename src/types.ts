/** Absolute (document-relative) layout box in CSS pixels. */
export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** Page-normalized geometry, stored with the features so they are self-contained. */
export interface Geometry {
	/** Horizontal center as a fraction of page width (0..1). */
	x: number;
	/** Top edge in viewport heights from the top of the document (0..). */
	y: number;
	/** Area in px² (Similo "Area"). */
	area: number;
	/** Width / height (Similo "Shape"). */
	shape: number;
}

/**
 * Raw, JSON-serializable element features: the Similo property set plus the Similo++ additions
 * type, aria-label and the full attribute map. Normalization happens at encoding time and is part
 * of the versioned format.
 */
export interface ElementFeatures {
	tag: string;
	classes: string[];
	name: string;
	id: string;
	href: string;
	alt: string;
	xpath: string;
	idXpath: string;
	isButton: boolean;
	/** Location (x, y), Area, Shape. */
	geom: Geometry | null;
	text: string;
	neighborText: string;
	type: string;
	ariaLabel: string;
	attributes: Record<string, string>;
}

export type CategoricalFeature = "tag" | "name" | "id" | "type" | "ariaLabel" | "text" | "href" | "alt";

export type SetFeature =
	| "classes"
	| "href"
	| "alt"
	| "xpath"
	| "idXpath"
	| "text"
	| "neighborText"
	| "ariaLabel"
	| "attributes"
	| "name"
	| "id";

export type NumericFeature = "x" | "y" | "area" | "shape";

export type BoolFeature = "isButton";

export type FeatureName = CategoricalFeature | SetFeature | NumericFeature | BoolFeature;

export type Tokenizer = "char3" | "word" | "pairs" | "items" | "path";

export interface HashSegment {
	kind: "hash";
	feature: CategoricalFeature;
	bits: number;
	weight: number;
}

export interface MinHashSegment {
	kind: "minhash";
	feature: SetFeature;
	slots: number;
	bitsPerSlot: number;
	tokenizer: Tokenizer;
	weight: number;
	/** For the attribute map: keys left out because a dedicated segment covers them. */
	excludeKeys?: string[];
}

export interface BucketSegment {
	kind: "bucket";
	feature: NumericFeature;
	bits: number;
	weight: number;
}

export interface BoolSegment {
	kind: "bool";
	feature: BoolFeature;
	weight: number;
}

/**
 * A token-set segment backed by a pluggable sketch algorithm (see `registerSketch`). The code
 * stores one presence bit followed by `values` values of `bitsPerValue` bits each, so algorithms
 * may use the full value range; an absent feature is encoded as presence 0.
 */
export interface SketchSegment {
	kind: "sketch";
	feature: SetFeature;
	/** Registered algorithm name, e.g. "minhash" or "simhash". */
	algorithm: string;
	values: number;
	bitsPerValue: number;
	tokenizer: Tokenizer;
	weight: number;
	/** For the attribute map: keys left out because a dedicated segment covers them. */
	excludeKeys?: string[];
}

export type SegmentSpec = HashSegment | MinHashSegment | BucketSegment | BoolSegment | SketchSegment;

/** What a sketch algorithm sees of a feature: its token set and its normalized text. */
export interface SketchInput {
	/** Tokens produced by the segment's tokenizer (never empty when `encode` is called). */
	tokens: Set<string>;
	/** Normalized feature text; for attributes and classes the sorted tokens joined by spaces. */
	text: string;
}

/**
 * A hashing-style summary of a token set with a similarity defined on its output. `encode` must
 * return exactly `segment.values` integers in 0..2^bitsPerValue-1; `similarity` gets two such
 * arrays and returns a value in [0, 1]. Both must be deterministic across runtimes.
 */
export interface SketchAlgorithm {
	readonly name: string;
	encode(input: SketchInput, segment: SketchSegment, seed: number): number[];
	similarity(left: number[], right: number[], segment: SketchSegment): number;
}

/** Logistic calibrator: p = sigmoid(bias + score * s1 + margin * (s1 - s2) + coverage * cov). */
export interface Calibrator {
	bias: number;
	score: number;
	margin: number;
	coverage: number;
}

export interface Profile {
	/** 1..15, written as the first 4 bits of every code. */
	version: number;
	name: string;
	segments: SegmentSpec[];
	calibrator: Calibrator;
	/** Default confidence threshold for auto-accept. */
	tau: number;
	/** Below this raw score the result is "unconfident" instead of "ambiguous". */
	floor: number;
}

/** Per-segment integer values. A segment whose values are all 0 is "empty". */
export type SegmentValues = number[][];

export type PropertyGroup =
	| "Tag"
	| "Class"
	| "Name"
	| "ID"
	| "HRef"
	| "Alt"
	| "AbsoluteXPath"
	| "IdXPath"
	| "IsButton"
	| "Location"
	| "Area"
	| "Shape"
	| "VisibleText"
	| "NeighborText"
	| "Type"
	| "AriaLabel"
	| "Attributes";
