// -------------------------------------
// Copyright (c) Thassilo M. Schiepanski
// -------------------------------------


export { CodeError, decodeCode, encodeFeatures, numericFraction, segmentValues, valuesToCode } from "./HashLoc.js";
export { PageIndex, encode, resolve, resolveIn, resolveAll, resolveAllIn } from "./HashLoc.resolve.js";
export { calibrate, codeCoverage, scoreValues, similarityVector } from "./HashLoc.score.js";
export { exactScore, exactSimilarity, exactSimilarityVector, exactValues, pairTerms, topOneErrorBound } from "./HashLoc.exact.js";
export {
	ALLOCATION_PLAN,
	allocateBits,
	chooseTau,
	chooseTauRiskControl,
	compareProfiles,
	evaluate,
	fitCalibrator,
	fitWeights,
	groupAblation,
	precisionCoverage,
	prepare
} from "./HashLoc.train.js";
export { defaultRegistry, ProfileRegistry } from "./ProfileRegistry.js";
export { PROFILE_L, PROFILE_M, PROFILE_S } from "./constants.profiles.js";
export {
	DEFAULT_CALIBRATOR,
	DEFAULT_FEATURE_WEIGHTS,
	PROPERTY_GROUPS,
	SIMILO_PP_WEIGHTS,
	SIMILO_WEIGHTS
} from "./constants.weights.js";
export { codeLength, finalizeSegments, profileBits, withFeatureWeights, withoutGroup, withSketch } from "./util.profile.js";
export { getSketch, MINHASH_SKETCH, registerSketch, SIMHASH_SKETCH, sketchNames } from "./options.sketches.js";
export { absoluteXPath, DomScan, idXPath, isButton, visibleText } from "./util.dom.js";
export { canonicalize } from "./util.bits.js";
export { murmur3 } from "./util.hash.js";
export { featureTokens, normalizeText } from "./util.text.js";


export type * from "./types.js";
export type { DecodedCode } from "./HashLoc.js";
export type {
	DocumentResolveOptions,
	EncodeOptions,
	RankedCandidate,
	ResolveAllOptions,
	ResolveOptions,
	ResolveResult,
	ResolveStatus
} from "./HashLoc.resolve.js";
export type { ExactValue, PairTerms } from "./HashLoc.exact.js";
export type {
	AblationRow,
	AllocationOptions,
	AllocationStep,
	CompareOptions,
	EvaluateOptions,
	FitCalibratorOptions,
	FitWeightsOptions,
	Metrics,
	PlanItem,
	PrecisionCoveragePoint,
	Prepared,
	PreparedRow,
	ProfileComparisonRow,
	RiskControlOptions,
	Sample
} from "./HashLoc.train.js";
export type { DomOptions } from "./util.dom.js";