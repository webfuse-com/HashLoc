import { DEFAULT_CALIBRATOR, DEFAULT_FEATURE_WEIGHTS } from "./constants.weights.js";
import { finalizeSegments } from "./util.profile.js";
const PROFILE_S = makeProfile(4, "S", [
  hashSegment("name", 6),
  hashSegment("type", 3),
  minHashSegment("ariaLabel", 3, "char3"),
  minHashSegment("text", 6, "char3"),
  minHashSegment("neighborText", 4, "word"),
  minHashSegment("attributes", 4, "pairs"),
  bucketSegment("x", 4),
  bucketSegment("y", 4)
]);
const PROFILE_M = makeProfile(5, "M", [
  hashSegment("tag", 5),
  hashSegment("name", 8),
  hashSegment("id", 8),
  hashSegment("type", 4),
  minHashSegment("ariaLabel", 4, "char3"),
  minHashSegment("text", 8, "char3"),
  minHashSegment("neighborText", 6, "word"),
  minHashSegment("attributes", 4, "pairs"),
  minHashSegment("href", 4, "char3"),
  minHashSegment("alt", 3, "char3"),
  bucketSegment("x", 5),
  bucketSegment("y", 5),
  bucketSegment("area", 4)
]);
const PROFILE_L = makeProfile(6, "L", [
  hashSegment("tag", 5),
  minHashSegment("classes", 4, "items"),
  hashSegment("name", 8),
  hashSegment("id", 8),
  minHashSegment("href", 4, "char3"),
  minHashSegment("alt", 3, "char3"),
  minHashSegment("xpath", 4, "path"),
  minHashSegment("idXpath", 4, "path"),
  {
    kind: "bool",
    feature: "isButton",
    weight: DEFAULT_FEATURE_WEIGHTS.isButton
  },
  bucketSegment("x", 5),
  bucketSegment("y", 5),
  bucketSegment("area", 4),
  bucketSegment("shape", 3),
  minHashSegment("text", 8, "char3"),
  minHashSegment("neighborText", 6, "word"),
  hashSegment("type", 4),
  minHashSegment("ariaLabel", 4, "char3"),
  minHashSegment("attributes", 4, "pairs")
]);
function hashSegment(feature, bits) {
  return {
    kind: "hash",
    feature,
    bits,
    weight: DEFAULT_FEATURE_WEIGHTS[feature]
  };
}
function minHashSegment(feature, slots, tokenizer) {
  return {
    kind: "minhash",
    feature,
    slots,
    bitsPerSlot: 4,
    tokenizer,
    weight: DEFAULT_FEATURE_WEIGHTS[feature]
  };
}
function bucketSegment(feature, bits) {
  return {
    kind: "bucket",
    feature,
    bits,
    weight: DEFAULT_FEATURE_WEIGHTS[feature]
  };
}
function makeProfile(version, name, segments) {
  return {
    version,
    name,
    segments: finalizeSegments(segments),
    calibrator: {
      ...DEFAULT_CALIBRATOR
    },
    tau: 0.9,
    floor: 0.35
  };
}
export {
  PROFILE_L,
  PROFILE_M,
  PROFILE_S
};
