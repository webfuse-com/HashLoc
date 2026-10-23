import { type Calibrator, type Profile, type SegmentSpec, type SegmentValues } from "./types.js";
export declare function segmentSimilarity(segment: SegmentSpec, left: number[], right: number[]): number | null;
export declare function similarityVector(profile: Profile, code: SegmentValues, candidate: SegmentValues): (number | null)[];
export declare function weightedScore(weights: number[], similarities: (number | null)[]): number;
export declare function scoreValues(profile: Profile, code: SegmentValues, candidate: SegmentValues): number;
export declare function codeCoverage(profile: Profile, code: SegmentValues): number;
export declare function sigmoid(value: number): number;
export declare function calibrate(calibrator: Calibrator, topScore: number, margin: number, coverage: number): number;
