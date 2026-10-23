import { CodeError, decodeCode, encodeFeatures, numericFraction, segmentValues, valuesToCode } from "./HashLoc.js";
import { encodeElement, PageIndex, resolveAll, resolveAllIn, resolveCode, resolveIn } from "./HashLoc.resolve.js";
import { calibrate, codeCoverage, scoreValues, similarityVector } from "./HashLoc.score.js";
import { exactScore, exactSimilarity, exactSimilarityVector, exactValues, pairTerms, topOneErrorBound } from "./HashLoc.exact.js";
import {
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
import { defaultRegistry, ProfileRegistry } from "./ProfileRegistry.js";
import { PROFILE_L, PROFILE_M, PROFILE_S } from "./constants.profiles.js";
import {
  DEFAULT_CALIBRATOR,
  DEFAULT_FEATURE_WEIGHTS,
  PROPERTY_GROUPS,
  SIMILO_PP_WEIGHTS,
  SIMILO_WEIGHTS
} from "./constants.weights.js";
import { codeLength, finalizeSegments, profileBits, withFeatureWeights, withoutGroup, withSketch } from "./util.profile.js";
import { getSketch, MINHASH_SKETCH, registerSketch, SIMHASH_SKETCH, sketchNames } from "./options.sketches.js";
import { absoluteXPath, DomScan, idXPath, isButton, visibleText } from "./util.dom.js";
import { canonicalize } from "./util.bits.js";
import { murmur3 } from "./util.hash.js";
import { featureTokens, normalizeText } from "./util.text.js";
export {
  ALLOCATION_PLAN,
  CodeError,
  DEFAULT_CALIBRATOR,
  DEFAULT_FEATURE_WEIGHTS,
  DomScan,
  MINHASH_SKETCH,
  PROFILE_L,
  PROFILE_M,
  PROFILE_S,
  PROPERTY_GROUPS,
  PageIndex,
  ProfileRegistry,
  SIMHASH_SKETCH,
  SIMILO_PP_WEIGHTS,
  SIMILO_WEIGHTS,
  absoluteXPath,
  allocateBits,
  calibrate,
  canonicalize,
  chooseTau,
  chooseTauRiskControl,
  codeCoverage,
  codeLength,
  compareProfiles,
  decodeCode,
  defaultRegistry,
  encodeElement,
  encodeFeatures,
  evaluate,
  exactScore,
  exactSimilarity,
  exactSimilarityVector,
  exactValues,
  featureTokens,
  finalizeSegments,
  fitCalibrator,
  fitWeights,
  getSketch,
  groupAblation,
  idXPath,
  isButton,
  murmur3,
  normalizeText,
  numericFraction,
  pairTerms,
  precisionCoverage,
  prepare,
  profileBits,
  registerSketch,
  resolveAll,
  resolveAllIn,
  resolveCode,
  resolveIn,
  scoreValues,
  segmentValues,
  similarityVector,
  sketchNames,
  topOneErrorBound,
  valuesToCode,
  visibleText,
  withFeatureWeights,
  withSketch,
  withoutGroup
};
