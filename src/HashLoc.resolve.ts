import type { ElementFeatures, Profile, SegmentSpec, SegmentValues } from "./types.js";
import { type DomOptions, DomScan } from "./util.dom.js";
import { type DecodedCode, decodeCode, encodeFeatures, segmentValues } from "./HashLoc.js";
import { hungarian } from "./Hungarian.js";
import { defaultRegistry, ProfileRegistry } from "./ProfileRegistry.js";
import { calibrate, codeCoverage, scoreValues } from "./HashLoc.score.js";


export type ResolveStatus = "confident" | "ambiguous" | "unconfident";

export interface RankedCandidate {
	index: number;
	element: Element | null;
	score: number;
}

export interface ResolveResult {
	status: ResolveStatus;
	/** Chosen element when accepted (null otherwise or for feature-only indexes). */
	element: Element | null;
	/** Index of the best candidate in the PageIndex, -1 if none. */
	index: number;
	/** Calibrated probability that the best candidate is the right element. */
	confidence: number;
	score: number;
	margin: number;
	/** Top-n candidates, best first (for human or agent review when ambiguous). */
	candidates: RankedCandidate[];
	/** Elements scored: the whole page for "scan", the bucket matches for "buckets". */
	scored: number;
	profile: string;
}

export interface ResolveOptions {
	/** Auto-accept threshold on calibrated confidence (default: profile.tau). */
	tau?: number;
	/** Raw-score floor below which the result is not_found (default: profile.floor). */
	floor?: number;
	/** Candidates returned for review (default 5). */
	topK?: number;
	registry?: ProfileRegistry;
	/** "scan" scores every element (default); "buckets" scores only elements that share a bucket with the code. */
	lookup?: "scan" | "buckets";
	/** Bucket lookup: MinHash slots per bucket band (default 2); smaller bands make bigger buckets. */
	bandSize?: number;
}

export interface ResolveAllOptions extends ResolveOptions {
	/** Candidates per code considered in the joint assignment (default 10). */
	shortlist?: number;
}

export interface EncodeOptions extends DomOptions {
	/** Profile object or registered name ("S", "M", "L"). Default "M". */
	profile?: Profile | string;
	/** Reuse an existing index of the same document state. */
	page?: PageIndex;
	registry?: ProfileRegistry;
}

export interface DocumentResolveOptions extends ResolveAllOptions, DomOptions {
	document?: Document;
	page?: PageIndex;
}

type ScoredIndex = [ number, number ];


// Candidate elements of one page state plus their features. Encoding work is cached per
// profile, so resolving many codes against the same page encodes the page only once.
export class PageIndex {
	readonly features: ElementFeatures[];
	readonly elements: (Element | null)[];
	private readonly cache: WeakMap<Profile, SegmentValues[]> = new WeakMap<Profile, SegmentValues[]>();
	private readonly buckets: WeakMap<Profile, Map<number, Map<string, number[]>>> = new WeakMap<Profile, Map<number, Map<string, number[]>>>();
	private readonly scan: DomScan | null;

	constructor(features: ElementFeatures[], elements?: (Element | null)[], scan: DomScan | null = null) {
		this.features = features;
		this.elements = elements ?? features.map(() => null);
		this.scan = scan;

		if(this.elements.length !== features.length) throw new RangeError("features and elements differ in length");
	}

	// Scan a live document (default: the global `document`).
	static fromDocument(target: Document = document, options: DomOptions = {}): PageIndex {
		const scan: DomScan = new DomScan(target, options);

		return new PageIndex(scan.allFeatures(), scan.elements, scan);
	}

	get size(): number {
		return this.features.length;
	}

	valuesFor(profile: Profile): SegmentValues[] {
		let values: SegmentValues[] | undefined = this.cache.get(profile);

		if(!values) {
			values = this.features.map((features: ElementFeatures) => segmentValues(features, profile));
			this.cache.set(profile, values);
		}

		return values;
	}

	// LSH index over the MinHash slots: bucket key -> elements. Built on first use, cached per profile and band size.
	bucketsFor(profile: Profile, bandSize: number): Map<string, number[]> {
		let byBand: Map<number, Map<string, number[]>> | undefined = this.buckets.get(profile);

		if(!byBand) {
			byBand = new Map<number, Map<string, number[]>>();
			this.buckets.set(profile, byBand);
		}

		let index: Map<string, number[]> | undefined = byBand.get(bandSize);

		if(!index) {
			index = new Map<string, number[]>();

			const target: Map<string, number[]> = index;

			this.valuesFor(profile).forEach((values: SegmentValues, element: number) => {
				for(const key of bucketKeys(profile, values, bandSize)) {
					const members: number[] | undefined = target.get(key);

					members ? members.push(element) : target.set(key, [ element ]);
				}
			});
			byBand.set(bandSize, index);
		}

		return index;
	}

	// Features for an element: from the index when it is a candidate, otherwise computed on the fly.
	featuresOf(element: Element): ElementFeatures {
		const index: number = this.elements.indexOf(element);

		if(index >= 0) return this.features[index];

		if(!this.scan) throw new Error("element is not in this index and the index has no DOM scan");

		return this.scan.features(element);
	}
}


function decide(
	decoded: DecodedCode,
	page: PageIndex,
	scores: number[],
	best: number,
	second: number,
	options: ResolveOptions
): ResolveResult {
	const profile: Profile = decoded.profile;
	const topK: number = options.topK ?? 5;
	const scored: number = scores.filter((score: number) => score >= 0).length;
	const ranked: ScoredIndex[] = scores
		.map((score: number, index: number): ScoredIndex => [ score, index ])
		.filter(([ score ]: ScoredIndex) => score >= 0)
		.sort((first: ScoredIndex, second: ScoredIndex) => second[0] - first[0] || first[1] - second[1])
		.slice(0, topK);
	const candidates: RankedCandidate[] = ranked.map(([ score, index ]: ScoredIndex) => ({
		index: index,
		score: score,
		element: page.elements[index]
	}));

	if(best < 0) {
		return {
			status: "unconfident",
			element: null,
			index: -1,
			confidence: 0,
			score: 0,
			margin: 0,
			candidates: candidates,
			scored: scored,
			profile: profile.name
		};
	}

	const topScore: number = scores[best];
	const secondScore: number = second >= 0 ? scores[second] : 0;
	const margin: number = topScore - secondScore;
	const confidence: number = calibrate(profile.calibrator, topScore, margin, codeCoverage(profile, decoded.values));
	const tau: number = options.tau ?? profile.tau;
	const floor: number = options.floor ?? profile.floor;
	let status: ResolveStatus = "ambiguous";

	if(topScore < floor) {
		status = "unconfident";
	} else if(confidence >= tau) {
		status = "confident";
	}

	return {
		status: status,
		element: status === "confident" ? page.elements[best] : null,
		index: best,
		confidence: confidence,
		score: topScore,
		margin: margin,
		candidates: candidates,
		scored: scored,
		profile: profile.name
	};
}

// Bucket keys of one element: each MinHash segment's slots split into bands of `bandSize` slots. A band
// containing an empty slot (0) yields no key, so absent features never share a bucket.
function bucketKeys(profile: Profile, values: SegmentValues, bandSize: number): string[] {
	const keys: string[] = [];

	profile.segments.forEach((segment: SegmentSpec, segmentIndex: number) => {
		if(segment.kind !== "minhash") return;

		const slots: number[] = values[segmentIndex];

		for(let start: number = 0; start + bandSize <= slots.length; start += bandSize) {
			const band: number[] = slots.slice(start, start + bandSize);

			if(band.every((value: number) => value !== 0)) keys.push(`${segmentIndex}:${start}:${band.join(",")}`);
		}
	});

	return keys;
}

// Scores per element; -1 for elements not scored (bucket lookup).
function scoresFor(decoded: DecodedCode, page: PageIndex, options: ResolveOptions = {}): number[] {
	const candidates: SegmentValues[] = page.valuesFor(decoded.profile);

	if(options.lookup !== "buckets") {
		return candidates.map((candidate: SegmentValues) => scoreValues(decoded.profile, decoded.values, candidate));
	}

	const bandSize: number = options.bandSize ?? 2;
	const index: Map<string, number[]> = page.bucketsFor(decoded.profile, bandSize);
	const scores: number[] = new Array<number>(candidates.length).fill(-1);

	for(const key of bucketKeys(decoded.profile, decoded.values, bandSize)) {
		for(const element of index.get(key) ?? []) {
			if(scores[element] < 0) scores[element] = scoreValues(decoded.profile, decoded.values, candidates[element]);
		}
	}

	return scores;
}

function topTwo(scores: number[]): [ number, number ] {
	let best: number = -1;
	let second: number = -1;

	for(let index: number = 0; index < scores.length; index++) {
		if(scores[index] < 0) continue;

		if(best < 0 || scores[index] > scores[best]) {
			second = best;
			best = index;
		} else if(second < 0 || scores[index] > scores[second]) {
			second = index;
		}
	}

	return [ best, second ];
}

function pickProfile(profile: Profile | string | undefined, registry: ProfileRegistry): Profile {
	if(profile && typeof profile !== "string") return profile;

	const found: Profile | undefined = registry.byName(profile ?? "M");

	if(!found) {
		throw new Error(`unknown profile '${profile}'`);
	}

	return found;
}


// Resolve one code against a page. Throws CodeError for malformed codes.
export function resolveIn(code: string, page: PageIndex, options: ResolveOptions = {}): ResolveResult {
	const decoded: DecodedCode = decodeCode(code, options.registry ?? defaultRegistry);
	const scores: number[] = scoresFor(decoded, page, options);
	const [ best, second ]: [ number, number ] = topTwo(scores);

	return decide(decoded, page, scores, best, second, options);
}

// Resolve several codes on the same page jointly: a one-to-one assignment ensures no two codes
// claim the same element. Each code's margin is measured against the best alternative to its
// assigned element.
export function resolveAllIn(codes: string[], page: PageIndex, options: ResolveAllOptions = {}): ResolveResult[] {
	const registry: ProfileRegistry = options.registry ?? defaultRegistry;
	const decodedCodes: DecodedCode[] = codes.map((code: string) => decodeCode(code, registry));
	const scores: number[][] = decodedCodes.map((decoded: DecodedCode) => scoresFor(decoded, page, options));

	if(page.size === 0) {
		return decodedCodes.map((decoded: DecodedCode, index: number) =>
			decide(decoded, page, scores[index], -1, -1, options)
		);
	}

	// Restrict the assignment to each code's shortlist to keep the matrix small.
	const shortlistSize: number = Math.max(options.shortlist ?? 10, options.topK ?? 5);
	const columns: number[] = [];

	for(const codeScores of scores) {
		codeScores
			.map((score: number, index: number): ScoredIndex => [ score, index ])
			.sort((first: ScoredIndex, second: ScoredIndex) => second[0] - first[0])
			.slice(0, shortlistSize)
			.forEach(([ , index ]: ScoredIndex) => {
				if(columns.indexOf(index) < 0) {
					columns.push(index);
				}
			});
	}

	const dummyCount: number = Math.max(0, codes.length - columns.length);
	const cost: number[][] = scores.map((codeScores: number[]) =>
		columns
			.map((column: number) => 1 - codeScores[column])
			.concat(new Array<number>(dummyCount).fill(1))
	);
	const assignment: number[] = hungarian(cost);

	return decodedCodes.map((decoded: DecodedCode, codeIndex: number) => {
		const column: number = assignment[codeIndex];
		const best: number = column < columns.length ? columns[column] : -1;

		if(best < 0) return decide(decoded, page, scores[codeIndex], -1, -1, options);

		const others: number[] = scores[codeIndex].map((score: number, index: number) => index === best ? -Infinity : score);
		const alternative: number = topTwo(others)[0];

		return decide(decoded, page, scores[codeIndex], best, alternative, options);
	});
}

// Encode a live DOM element into a short code.
export function encodeElement(element: Element, options: EncodeOptions = {}): string {
	const registry: ProfileRegistry = options.registry ?? defaultRegistry;
	const page: PageIndex = options.page ?? PageIndex.fromDocument(element.ownerDocument, options);

	return encodeFeatures(page.featuresOf(element), pickProfile(options.profile, registry));
}

// Resolve a code against a live document (default: global `document`).
export function resolveCode(code: string, options: DocumentResolveOptions = {}): ResolveResult {
	const page: PageIndex = options.page ?? PageIndex.fromDocument(options.document ?? document, options);

	return resolveIn(code, page, options);
}

// Resolve many codes against a live document with joint one-to-one assignment.
export function resolveAll(codes: string[], options: DocumentResolveOptions = {}): ResolveResult[] {
	const page: PageIndex = options.page ?? PageIndex.fromDocument(options.document ?? document, options);

	return resolveAllIn(codes, page, options);
}
