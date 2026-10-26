import { type ElementFeatures, type FeatureName, type Profile, type SegmentSpec, type Tokenizer, type PropertyGroup } from "./types.js";
/**
 * One relocalization case: the element as captured on the old version, all candidates on the
 * new version, and the index of the true match (-1 if it no longer exists).
 */
export interface Sample {
    target: ElementFeatures;
    candidates: ElementFeatures[];
    answer: number;
}
export interface PreparedRow {
    similarities: (number | null)[][];
    answer: number;
    coverage: number;
}
/** Weight-independent similarity vectors, cached so weight search is cheap. */
export interface Prepared {
    profile: Profile;
    rows: PreparedRow[];
}
export interface Metrics {
    /** Samples whose true element exists on the new version. */
    n: number;
    /** Top-1 exact-match accuracy at full coverage (= precision = recall there). */
    accuracy: number;
    /** Share auto-accepted at the threshold. */
    coverage: number;
    /** Correct among auto-accepted. */
    precision: number;
    /** Wrong auto-accepts over all samples. */
    silentErrorRate: number;
    /** Escalated cases whose true element is in the top-n shortlist. */
    recallAtN: number;
    /** Correct auto-accepts plus escalated shortlist hits, over all samples. */
    endToEnd: number;
    bits: number;
    chars: number;
}
export interface EvaluateOptions {
    tau?: number;
    topK?: number;
}
export interface PrecisionCoveragePoint {
    confidence: number;
    coverage: number;
    precision: number;
}
export interface FitWeightsOptions {
    rounds?: number;
}
export interface FitCalibratorOptions {
    epochs?: number;
    learningRate?: number;
    l2?: number;
}
export interface PlanItem {
    feature: FeatureName;
    kind: SegmentSpec["kind"];
    tokenizer?: Tokenizer;
}
export interface AllocationStep {
    bits: number;
    chars: number;
    accuracy: number;
    change: string;
    profile: Profile;
}
export interface AllocationOptions {
    maxBits?: number;
    version?: number;
    refitWeights?: boolean;
    patience?: number;
}
export interface RiskControlOptions {
    delta?: number;
}
export interface CompareOptions extends EvaluateOptions {
    fit?: boolean;
}
export interface ProfileComparisonRow extends Metrics {
    profile: string;
}
export interface AblationRow {
    group: PropertyGroup;
    bitsSaved: number;
    accuracy: number;
    /** Accuracy change versus the full profile (negative = the group carried information). */
    delta: number;
}
export declare const ALLOCATION_PLAN: readonly PlanItem[];
export declare function prepare(samples: Sample[], profile: Profile): Prepared;
export declare function evaluate(data: Sample[] | Prepared, profile: Profile, options?: EvaluateOptions): Metrics;
export declare function precisionCoverage(data: Sample[] | Prepared, profile: Profile): PrecisionCoveragePoint[];
export declare function fitWeights(data: Sample[] | Prepared, profile: Profile, options?: FitWeightsOptions): Profile;
export declare function fitCalibrator(data: Sample[] | Prepared, profile: Profile, options?: FitCalibratorOptions): Profile;
export declare function chooseTau(data: Sample[] | Prepared, profile: Profile, targetPrecision?: number): Profile;
export declare function chooseTauRiskControl(data: Sample[] | Prepared, profile: Profile, alpha: number, options?: RiskControlOptions): Profile;
export declare function allocateBits(samples: Sample[], options?: AllocationOptions): AllocationStep[];
export declare function compareProfiles(samples: Sample[], profiles: Profile[], options?: CompareOptions): ProfileComparisonRow[];
export declare function groupAblation(samples: Sample[], profile: Profile): AblationRow[];
