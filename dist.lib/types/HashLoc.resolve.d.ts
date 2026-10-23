import { type ElementFeatures, type Profile, type SegmentValues } from "./types.js";
import { DomScan, type DomOptions } from "./util.dom.js";
import { ProfileRegistry } from "./ProfileRegistry.js";
export type ResolveStatus = "accepted" | "ambiguous" | "not_found";
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
    topN?: number;
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
export declare class PageIndex {
    readonly features: ElementFeatures[];
    readonly elements: (Element | null)[];
    private readonly cache;
    private readonly buckets;
    private readonly scan;
    constructor(features: ElementFeatures[], elements?: (Element | null)[], scan?: DomScan | null);
    static fromDocument(target?: Document, options?: DomOptions): PageIndex;
    get size(): number;
    valuesFor(profile: Profile): SegmentValues[];
    bucketsFor(profile: Profile, bandSize: number): Map<string, number[]>;
    featuresOf(element: Element): ElementFeatures;
}
export declare function resolveIn(code: string, page: PageIndex, options?: ResolveOptions): ResolveResult;
export declare function resolveAllIn(codes: string[], page: PageIndex, options?: ResolveAllOptions): ResolveResult[];
export declare function encodeElement(element: Element, options?: EncodeOptions): string;
export declare function resolveCode(code: string, options?: DocumentResolveOptions): ResolveResult;
export declare function resolveAll(codes: string[], options?: DocumentResolveOptions): ResolveResult[];
