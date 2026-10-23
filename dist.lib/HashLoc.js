import { base32ToBits, BitReader, BitWriter, bitsToBase32, canonicalize, luhnCheckChar, luhnValid } from "./util.bits.js";
import { murmur3, nonZero } from "./util.hash.js";
import { bbitMinHash } from "./MinHash.js";
import { featureTokens, normalizeText } from "./util.text.js";
import { codeLength } from "./util.profile.js";
import { defaultRegistry } from "./ProfileRegistry.js";
import { getSketch } from "./options.sketches.js";
const SEED_SALT = "simcode";
class CodeError extends Error {
  constructor(message) {
    super(message);
    this.name = "CodeError";
  }
}
const SEED_CACHE = /* @__PURE__ */ new WeakMap();
function seeds(profile) {
  let cached = SEED_CACHE.get(profile);
  if (!cached) {
    cached = profile.segments.map(
      (segment, index) => murmur3(`${SEED_SALT}:v${profile.version}:${index}:${segment.kind}:${segment.feature}`, 24301)
    );
    SEED_CACHE.set(profile, cached);
  }
  return cached;
}
function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
function segmentValue(segment, features, seed) {
  if (segment.kind === "hash") {
    const value = normalizeText(features[segment.feature]);
    return [value ? nonZero(murmur3(value, seed), segment.bits) : 0];
  }
  if (segment.kind === "minhash") {
    const tokens = featureTokens(features, segment.feature, segment.tokenizer, segment.excludeKeys);
    return bbitMinHash(tokens, segment.slots, segment.bitsPerSlot, seed);
  }
  if (segment.kind === "bool") return [features[segment.feature] ? 2 : 1];
  if (segment.kind === "sketch") return sketchValue(segment, features, seed);
  const fraction = numericFraction(segment.feature, features);
  if (fraction === null) return [0];
  const buckets = 2 ** segment.bits - 1;
  return [1 + Math.min(buckets - 1, Math.floor(fraction * buckets))];
}
function sketchValue(segment, features, seed) {
  const tokens = featureTokens(features, segment.feature, segment.tokenizer, segment.excludeKeys);
  if (tokens.size === 0) return new Array(segment.values + 1).fill(0);
  const text = segment.feature === "attributes" || segment.feature === "classes" ? Array.from(tokens).sort().join(" ") : normalizeText(features[segment.feature], segment.feature === "neighborText" ? 300 : 200);
  const values = getSketch(segment.algorithm).encode({
    tokens,
    text
  }, segment, seed);
  if (values.length !== segment.values) {
    throw new RangeError(`sketch '${segment.algorithm}' returned ${values.length} values, expected ${segment.values}`);
  }
  return [1].concat(values);
}
function widths(segment) {
  if (segment.kind === "minhash") return new Array(segment.slots).fill(segment.bitsPerSlot);
  if (segment.kind === "sketch") return [1].concat(new Array(segment.values).fill(segment.bitsPerValue));
  if (segment.kind === "bool") return [2];
  return [segment.bits];
}
function numericFraction(feature, features) {
  const geom = features.geom;
  if (!geom) return null;
  switch (feature) {
    case "x":
      return clamp01(geom.x);
    case "y":
      return clamp01(Math.log1p(Math.max(0, geom.y)) / Math.log1p(10));
    case "area":
      return clamp01((Math.log2(Math.max(1, geom.area)) - 4) / 16);
    case "shape":
      return geom.shape > 0 ? clamp01((Math.log2(geom.shape) + 5) / 10) : null;
  }
}
function segmentValues(features, profile) {
  const segmentSeeds = seeds(profile);
  return profile.segments.map(
    (segment, index) => segmentValue(segment, features, segmentSeeds[index])
  );
}
function valuesToCode(values, profile) {
  const writer = new BitWriter();
  writer.write(profile.version, 4);
  profile.segments.forEach((segment, index) => {
    const segmentWidths = widths(segment);
    values[index].forEach((value, position) => {
      writer.write(value, segmentWidths[position]);
    });
  });
  const body = bitsToBase32(writer.bits);
  return body + luhnCheckChar(body);
}
function encodeFeatures(features, profile) {
  return valuesToCode(segmentValues(features, profile), profile);
}
function decodeCode(code, registry = defaultRegistry) {
  const canonical = canonicalize(code);
  if (canonical.length < 2) throw new CodeError("code too short");
  let valid;
  try {
    valid = luhnValid(canonical);
  } catch (error) {
    throw new CodeError(error.message);
  }
  if (!valid) throw new CodeError("check character mismatch (typo or truncated code)");
  const reader = new BitReader(base32ToBits(canonical.slice(0, -1)));
  const version = reader.read(4);
  const profile = registry.get(version);
  if (!profile) {
    throw new CodeError(`unknown code version ${version}`);
  }
  if (canonical.length !== codeLength(profile)) {
    throw new CodeError(`expected ${codeLength(profile)} characters for profile ${profile.name}, got ${canonical.length}`);
  }
  const values = profile.segments.map(
    (segment) => widths(segment).map((width) => reader.read(width))
  );
  return {
    profile,
    values,
    code: canonical
  };
}
export {
  CodeError,
  decodeCode,
  encodeFeatures,
  numericFraction,
  segmentValues,
  valuesToCode
};
