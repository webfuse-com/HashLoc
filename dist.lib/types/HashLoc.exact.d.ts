import { type ElementFeatures, type Profile, type SegmentSpec } from "./types.js";
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
export declare function exactValues(features: ElementFeatures, profile: Profile): ExactValue[];
export declare function exactSimilarity(segment: SegmentSpec, left: ExactValue, right: ExactValue): number | null;
export declare function exactSimilarityVector(profile: Profile, left: ExactValue[], right: ExactValue[]): (number | null)[];
export declare function exactScore(profile: Profile, left: ExactValue[], right: ExactValue[]): number;
export declare function pairTerms(profile: Profile, code: ExactValue[], candidate: ExactValue[]): PairTerms;
export declare function topOneErrorBound(profile: Profile, code: ExactValue[], candidates: ExactValue[][], reference: number, scores: number[]): number;
