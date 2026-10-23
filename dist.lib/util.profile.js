import { PROPERTY_GROUPS } from "./constants.weights.js";
import { getSketch } from "./options.sketches.js";
const ATTRIBUTE_KEY = {
  id: "id",
  classes: "class",
  name: "name",
  type: "type",
  ariaLabel: "aria-label",
  href: "href",
  alt: "alt"
};
function finalizeSegments(segments) {
  const covered = ["style"];
  for (const segment of segments) {
    const key = ATTRIBUTE_KEY[segment.feature];
    if (key && segment.feature !== "attributes" && covered.indexOf(key) < 0) {
      covered.push(key);
    }
  }
  covered.sort();
  return segments.map((segment) => {
    if ((segment.kind === "minhash" || segment.kind === "sketch") && segment.feature === "attributes") {
      return {
        ...segment,
        excludeKeys: covered.slice()
      };
    }
    return segment;
  });
}
function segmentBits(segment) {
  if (segment.kind === "minhash") return segment.slots * segment.bitsPerSlot;
  if (segment.kind === "sketch") return 1 + segment.values * segment.bitsPerValue;
  if (segment.kind === "bool") return 2;
  return segment.bits;
}
function profileBits(profile) {
  return profile.segments.reduce((sum, segment) => sum + segmentBits(segment), 4);
}
function codeLength(profile) {
  return Math.ceil(profileBits(profile) / 5) + 1;
}
function withFeatureWeights(profile, weights) {
  return {
    ...profile,
    segments: profile.segments.map((segment) => ({
      ...segment,
      weight: weights[segment.feature] ?? segment.weight
    }))
  };
}
function withoutGroup(profile, group) {
  const dropped = PROPERTY_GROUPS[group];
  const kept = profile.segments.filter((segment) => dropped.indexOf(segment.feature) < 0);
  return {
    ...profile,
    name: `${profile.name}-${group}`,
    segments: finalizeSegments(kept)
  };
}
function withSketch(profile, algorithm, bitsPerValue, version = profile.version) {
  getSketch(algorithm);
  const segments = profile.segments.map((segment) => {
    if (segment.kind !== "minhash" && segment.kind !== "sketch") return segment;
    const payload = segment.kind === "minhash" ? segment.slots * segment.bitsPerSlot : segment.values * segment.bitsPerValue;
    const converted = {
      kind: "sketch",
      feature: segment.feature,
      algorithm,
      values: Math.max(1, Math.floor(payload / bitsPerValue)),
      bitsPerValue,
      tokenizer: segment.tokenizer,
      weight: segment.weight
    };
    return converted;
  });
  return {
    ...profile,
    version,
    name: `${profile.name}+${algorithm}-b${bitsPerValue}`,
    segments: finalizeSegments(segments)
  };
}
function validateProfile(profile) {
  if (!Number.isInteger(profile.version) || profile.version < 1 || profile.version > 15) {
    throw new RangeError(`profile version must be 1..15, got ${profile.version}`);
  }
  for (const segment of profile.segments) {
    if (segment.kind === "sketch") {
      getSketch(segment.algorithm);
      if (segment.bitsPerValue < 1 || segment.bitsPerValue > 31 || segment.values < 1) {
        throw new RangeError(`segment ${segment.feature}: sketch needs values >= 1 and bitsPerValue 1..31`);
      }
    } else if (segment.kind !== "bool") {
      const bits = segment.kind === "minhash" ? segment.bitsPerSlot : segment.bits;
      if (bits < 2 || bits > 31) {
        throw new RangeError(`segment ${segment.feature}: bits must be 2..31`);
      }
    }
    if (segment.kind === "minhash" && segment.slots < 1) {
      throw new RangeError(`segment ${segment.feature}: slots must be >= 1`);
    }
    if (!(segment.weight >= 0)) {
      throw new RangeError(`segment ${segment.feature}: weight must be >= 0`);
    }
  }
}
export {
  codeLength,
  finalizeSegments,
  profileBits,
  segmentBits,
  validateProfile,
  withFeatureWeights,
  withSketch,
  withoutGroup
};
