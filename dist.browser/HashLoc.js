"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // src/api.ts
  var api_exports = {};
  __export(api_exports, {
    ALLOCATION_PLAN: () => ALLOCATION_PLAN,
    CodeError: () => CodeError,
    DEFAULT_CALIBRATOR: () => DEFAULT_CALIBRATOR,
    DEFAULT_FEATURE_WEIGHTS: () => DEFAULT_FEATURE_WEIGHTS,
    DomScan: () => DomScan,
    MINHASH_SKETCH: () => minhash_default,
    PROFILE_L: () => PROFILE_L,
    PROFILE_M: () => PROFILE_M,
    PROFILE_S: () => PROFILE_S,
    PROPERTY_GROUPS: () => PROPERTY_GROUPS,
    PageIndex: () => PageIndex,
    ProfileRegistry: () => ProfileRegistry,
    SIMHASH_SKETCH: () => simhash_default,
    SIMILO_PP_WEIGHTS: () => SIMILO_PP_WEIGHTS,
    SIMILO_WEIGHTS: () => SIMILO_WEIGHTS,
    absoluteXPath: () => absoluteXPath,
    allocateBits: () => allocateBits,
    calibrate: () => calibrate,
    canonicalize: () => canonicalize,
    chooseTau: () => chooseTau,
    chooseTauRiskControl: () => chooseTauRiskControl,
    codeCoverage: () => codeCoverage,
    codeLength: () => codeLength,
    compareProfiles: () => compareProfiles,
    decodeCode: () => decodeCode,
    defaultRegistry: () => defaultRegistry,
    encode: () => encode,
    encodeFeatures: () => encodeFeatures,
    evaluate: () => evaluate,
    exactScore: () => exactScore,
    exactSimilarity: () => exactSimilarity,
    exactSimilarityVector: () => exactSimilarityVector,
    exactValues: () => exactValues,
    featureTokens: () => featureTokens,
    finalizeSegments: () => finalizeSegments,
    fitCalibrator: () => fitCalibrator,
    fitWeights: () => fitWeights,
    getSketch: () => getSketch,
    groupAblation: () => groupAblation,
    idXPath: () => idXPath,
    isButton: () => isButton,
    murmur3: () => murmur3,
    normalizeText: () => normalizeText,
    numericFraction: () => numericFraction,
    pairTerms: () => pairTerms,
    precisionCoverage: () => precisionCoverage,
    prepare: () => prepare,
    profileBits: () => profileBits,
    registerSketch: () => registerSketch,
    resolve: () => resolve,
    resolveAll: () => resolveAll,
    resolveAllIn: () => resolveAllIn,
    resolveIn: () => resolveIn,
    scoreValues: () => scoreValues,
    segmentValues: () => segmentValues,
    similarityVector: () => similarityVector,
    sketchNames: () => sketchNames,
    topOneErrorBound: () => topOneErrorBound,
    valuesToCode: () => valuesToCode,
    visibleText: () => visibleText,
    withFeatureWeights: () => withFeatureWeights,
    withSketch: () => withSketch,
    withoutGroup: () => withoutGroup
  });

  // src/util.bits.ts
  var ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  var BitWriter = class {
    bits = [];
    write(value, count) {
      for (let bit = count - 1; bit >= 0; bit--) {
        this.bits.push(Math.floor(value / 2 ** bit) % 2);
      }
    }
  };
  var BitReader = class {
    bits;
    position = 0;
    constructor(bits) {
      this.bits = bits;
    }
    read(count) {
      let value = 0;
      for (let bit = 0; bit < count; bit++) {
        value = value * 2 + (this.bits[this.position++] ?? 0);
      }
      return value;
    }
    get remaining() {
      return this.bits.length - this.position;
    }
  };
  function symbolIndex(symbol) {
    const index = ALPHABET.indexOf(symbol);
    if (index < 0 || symbol.length !== 1) {
      throw new Error(`invalid character '${symbol}'`);
    }
    return index;
  }
  function luhnSum(text, startFactor) {
    const base = ALPHABET.length;
    let factor = startFactor;
    let sum = 0;
    for (let position = text.length - 1; position >= 0; position--) {
      let addend = factor * symbolIndex(text[position]);
      factor = factor === 2 ? 1 : 2;
      addend = Math.floor(addend / base) + addend % base;
      sum += addend;
    }
    return sum;
  }
  function bitsToBase32(bits) {
    let output = "";
    for (let offset = 0; offset < bits.length; offset += 5) {
      let value = 0;
      for (let bit = 0; bit < 5; bit++) {
        value = value * 2 + (bits[offset + bit] ?? 0);
      }
      output += ALPHABET[value];
    }
    return output;
  }
  function base32ToBits(text) {
    const bits = [];
    for (let position = 0; position < text.length; position++) {
      const value = symbolIndex(text[position]);
      for (let bit = 4; bit >= 0; bit--) {
        bits.push(value >> bit & 1);
      }
    }
    return bits;
  }
  function canonicalize(code) {
    return code.toUpperCase().replace(/[\s-]/g, "").replace(/[IL]/g, "1").replace(/O/g, "0");
  }
  function luhnCheckChar(body) {
    const base = ALPHABET.length;
    return ALPHABET[(base - luhnSum(body, 2) % base) % base];
  }
  function luhnValid(full) {
    return luhnSum(full, 1) % ALPHABET.length === 0;
  }

  // src/util.hash.ts
  var TEXT_ENCODER = new TextEncoder();
  var MURMUR_C1 = 3432918353;
  var MURMUR_C2 = 461845907;
  function fmix32(value) {
    let hash = value;
    hash ^= hash >>> 16;
    hash = Math.imul(hash, 2246822507);
    hash ^= hash >>> 13;
    hash = Math.imul(hash, 3266489909);
    hash ^= hash >>> 16;
    return hash >>> 0;
  }
  function murmur3(text, seed = 0) {
    const data = TEXT_ENCODER.encode(text);
    const length = data.length;
    const blockEnd = length & ~3;
    let hash = seed >>> 0;
    for (let offset = 0; offset < blockEnd; offset += 4) {
      let block2 = data[offset] | data[offset + 1] << 8 | data[offset + 2] << 16 | data[offset + 3] << 24;
      block2 = Math.imul(block2, MURMUR_C1);
      block2 = block2 << 15 | block2 >>> 17;
      block2 = Math.imul(block2, MURMUR_C2);
      hash ^= block2;
      hash = hash << 13 | hash >>> 19;
      hash = Math.imul(hash, 5) + 3864292196 | 0;
    }
    const tail = length & 3;
    let block = 0;
    if (tail === 3) {
      block ^= data[blockEnd + 2] << 16;
    }
    if (tail >= 2) {
      block ^= data[blockEnd + 1] << 8;
    }
    if (tail >= 1) {
      block ^= data[blockEnd];
      block = Math.imul(block, MURMUR_C1);
      block = block << 15 | block >>> 17;
      block = Math.imul(block, MURMUR_C2);
      hash ^= block;
    }
    hash ^= length;
    return fmix32(hash);
  }
  function nonZero(hash, bits) {
    if (bits < 2 || bits > 31) {
      throw new RangeError(`bits must be in 2..31, got ${bits}`);
    }
    return 1 + hash % (2 ** bits - 1);
  }

  // src/MinHash.ts
  var GOLDEN_RATIO = 2654435769;
  function minhashSignature(tokens, slots, seed) {
    if (tokens.size === 0) return null;
    const minima = new Array(slots).fill(Infinity);
    const valueSeed = (seed ^ GOLDEN_RATIO) >>> 0;
    tokens.forEach((token) => {
      const bin = murmur3(token, seed) % slots;
      const value = murmur3(token, valueSeed);
      if (value < minima[bin]) {
        minima[bin] = value;
      }
    });
    const filled = minima.slice();
    for (let slot = 0; slot < slots; slot++) {
      if (minima[slot] !== Infinity) continue;
      for (let distance = 1; distance < slots; distance++) {
        const source = (slot + distance) % slots;
        if (minima[source] !== Infinity) {
          filled[slot] = fmix32(minima[source] + Math.imul(distance, GOLDEN_RATIO) >>> 0);
          break;
        }
      }
    }
    return filled;
  }
  function bbitMinHash(tokens, slots, bits, seed) {
    const signature = minhashSignature(tokens, slots, seed);
    if (!signature) return new Array(slots).fill(0);
    return signature.map((value) => nonZero(value, bits));
  }
  function minhashSimilarity(left, right, bits, values = 2 ** bits - 1) {
    let matches = 0;
    for (let slot = 0; slot < left.length; slot++) {
      if (left[slot] === right[slot]) {
        matches++;
      }
    }
    const chance = 1 / values;
    return Math.max(0, (matches / left.length - chance) / (1 - chance));
  }

  // src/util.text.ts
  var UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
  var GENERATED_PATTERN = /^(?=(?:[^0-9]*[0-9]){3})(?=.*[a-z])[a-z0-9_-]{5,}$/;
  var WORD_SEPARATOR_PATTERN = new RegExp("[^\\p{L}\\p{N}#]+", "u");
  var ID_STEP_PATTERN = /^\*\[@id=(["'])(.*)\1\]$/;
  function char3(text) {
    const grams = /* @__PURE__ */ new Set();
    if (!text) return grams;
    if (text.length <= 3) {
      grams.add(text);
      return grams;
    }
    for (let start = 0; start + 3 <= text.length; start++) {
      grams.add(text.slice(start, start + 3));
    }
    return grams;
  }
  function words(text) {
    return new Set(text.split(WORD_SEPARATOR_PATTERN).filter((word) => word.length > 0));
  }
  function normalizeStep(step) {
    const match = ID_STEP_PATTERN.exec(step);
    if (match) {
      const id = normalizeText(match[2], 60);
      return id ? `#${id}` : "#";
    }
    return step.toLowerCase();
  }
  function pathTokens(path) {
    const steps = path.split("/").filter((step) => step.length > 0).map(normalizeStep);
    const sequence = ["^"].concat(steps);
    const tokens = /* @__PURE__ */ new Set();
    for (let position = 0; position + 1 < sequence.length; position++) {
      tokens.add(`${sequence[position]}/${sequence[position + 1]}`);
    }
    return tokens;
  }
  function normalizeText(text, maxLength = 200) {
    if (!text) return "";
    const lowered = text.normalize("NFKC").toLowerCase().replace(UUID_PATTERN, " ");
    const kept = lowered.split(/\s+/).filter((word) => word.length > 0 && !GENERATED_PATTERN.test(word)).join(" ");
    const normalized = kept.replace(/[0-9]+/g, "#").trim();
    return normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized;
  }
  function featureTokens(features, feature, tokenizer, excludeKeys = []) {
    if (feature === "attributes") {
      const tokens = /* @__PURE__ */ new Set();
      Object.keys(features.attributes).forEach((name) => {
        const key = name.toLowerCase();
        if (excludeKeys.indexOf(key) >= 0) return;
        tokens.add(tokenizer === "pairs" ? `${key}=${normalizeText(features.attributes[name], 100)}` : key);
      });
      return tokens;
    }
    if (feature === "classes") {
      const tokens = /* @__PURE__ */ new Set();
      for (const className of features.classes) {
        const normalized = normalizeText(className, 60);
        if (normalized) {
          tokens.add(normalized);
        }
      }
      return tokens;
    }
    const value = features[feature];
    if (tokenizer === "path") return pathTokens(value);
    const text = normalizeText(value, feature === "neighborText" ? 300 : 200);
    return tokenizer === "char3" ? char3(text) : words(text);
  }

  // src/constants.weights.ts
  var PROPERTY_GROUPS = {
    Tag: ["tag"],
    Class: ["classes"],
    Name: ["name"],
    ID: ["id"],
    HRef: ["href"],
    Alt: ["alt"],
    AbsoluteXPath: ["xpath"],
    IdXPath: ["idXpath"],
    IsButton: ["isButton"],
    Location: ["x", "y"],
    Area: ["area"],
    Shape: ["shape"],
    VisibleText: ["text"],
    NeighborText: ["neighborText"],
    Type: ["type"],
    AriaLabel: ["ariaLabel"],
    Attributes: ["attributes"]
  };
  var SIMILO_WEIGHTS = {
    tag: 1.5,
    classes: 0.5,
    name: 1.5,
    id: 1.5,
    href: 0.5,
    alt: 0.5,
    xpath: 0.5,
    idXpath: 0.5,
    isButton: 0.5,
    x: 0.25,
    y: 0.25,
    area: 0.5,
    shape: 0.5,
    text: 1.5,
    neighborText: 1.5,
    type: 0,
    ariaLabel: 0,
    attributes: 0
  };
  var DEFAULT_FEATURE_WEIGHTS = {
    tag: 1.025,
    classes: 0.825,
    name: 2.325,
    id: 2.6,
    href: 0.875,
    alt: 1.225,
    xpath: 0.3,
    idXpath: 0.625,
    isButton: 0.05,
    x: 1,
    y: 1,
    area: 1.125,
    shape: 0.5,
    text: 2.675,
    neighborText: 1.575,
    type: 2.6,
    ariaLabel: 1.875,
    attributes: 2
  };
  var SIMILO_PP_WEIGHTS = {
    tag: 0.8,
    classes: 0,
    name: 2.85,
    id: 0.5,
    href: 0.95,
    alt: 1.85,
    xpath: 0.1,
    idXpath: 0.45,
    isButton: 0,
    x: 0.6,
    y: 0.6,
    area: 0.35,
    shape: 0,
    text: 2.8,
    neighborText: 1.45,
    type: 2.75,
    ariaLabel: 0.9,
    attributes: 1.8
  };
  var DEFAULT_CALIBRATOR = {
    bias: -9,
    score: 8,
    margin: 12,
    coverage: 1
  };

  // src/options.sketches/minhash.ts
  var MINHASH_SKETCH = {
    name: "minhash",
    encode: (input, segment, seed) => {
      const signature = minhashSignature(input.tokens, segment.values, seed) ?? [];
      const modulus = 2 ** segment.bitsPerValue;
      return signature.map((value) => value % modulus);
    },
    similarity: (left, right, segment) => minhashSimilarity(left, right, segment.bitsPerValue, 2 ** segment.bitsPerValue)
  };
  var minhash_default = MINHASH_SKETCH;

  // src/options.sketches/simhash.ts
  var GOLDEN_RATIO2 = 2654435769;
  var SIMHASH_SKETCH = {
    name: "simhash",
    encode: (input, segment, seed) => {
      const bitCount = segment.values * segment.bitsPerValue;
      const balance = new Array(bitCount).fill(0);
      const chunks = Math.ceil(bitCount / 32);
      input.tokens.forEach((token) => {
        for (let chunk = 0; chunk < chunks; chunk++) {
          const hash = murmur3(token, (seed ^ Math.imul(chunk + 1, GOLDEN_RATIO2)) >>> 0);
          for (let bit = 0; bit < 32 && chunk * 32 + bit < bitCount; bit++) {
            balance[chunk * 32 + bit] += hash >>> bit & 1 ? 1 : -1;
          }
        }
      });
      return packBits(balance.map((value) => value > 0 ? 1 : 0), segment.bitsPerValue);
    },
    similarity: (left, right, segment) => {
      const leftBits = unpackBits(left, segment.bitsPerValue);
      const rightBits = unpackBits(right, segment.bitsPerValue);
      let hamming = 0;
      for (let bit = 0; bit < leftBits.length; bit++) {
        if (leftBits[bit] !== rightBits[bit]) {
          hamming++;
        }
      }
      return Math.max(0, Math.cos(Math.PI * hamming / leftBits.length));
    }
  };
  function packBits(bits, bitsPerValue) {
    const values = [];
    for (let offset = 0; offset < bits.length; offset += bitsPerValue) {
      let value = 0;
      for (let bit = 0; bit < bitsPerValue; bit++) {
        value = value * 2 + (bits[offset + bit] ?? 0);
      }
      values.push(value);
    }
    return values;
  }
  function unpackBits(values, bitsPerValue) {
    const bits = [];
    for (const value of values) {
      for (let bit = bitsPerValue - 1; bit >= 0; bit--) {
        bits.push(Math.floor(value / 2 ** bit) % 2);
      }
    }
    return bits;
  }
  var simhash_default = SIMHASH_SKETCH;

  // src/options.sketches.ts
  var REGISTRY = /* @__PURE__ */ new Map([
    [minhash_default.name, minhash_default],
    [simhash_default.name, simhash_default]
  ]);
  function registerSketch(algorithm) {
    if (!/^[a-z][a-z0-9-]*$/.test(algorithm.name)) {
      throw new RangeError(`sketch name must be lowercase letters, digits and hyphens, got '${algorithm.name}'`);
    }
    REGISTRY.set(algorithm.name, algorithm);
  }
  function getSketch(name) {
    const algorithm = REGISTRY.get(name);
    if (!algorithm) {
      throw new RangeError(`unknown sketch algorithm '${name}' (registered: ${sketchNames().join(", ")})`);
    }
    return algorithm;
  }
  function sketchNames() {
    return Array.from(REGISTRY.keys()).sort();
  }

  // src/util.profile.ts
  var ATTRIBUTE_KEY = {
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

  // src/constants.profiles.ts
  var PROFILE_S = makeProfile(4, "S", [
    hashSegment("name", 6),
    hashSegment("type", 3),
    minHashSegment("ariaLabel", 3, "char3"),
    minHashSegment("text", 6, "char3"),
    minHashSegment("neighborText", 4, "word"),
    minHashSegment("attributes", 4, "pairs"),
    bucketSegment("x", 4),
    bucketSegment("y", 4)
  ]);
  var PROFILE_M = makeProfile(5, "M", [
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
  var PROFILE_L = makeProfile(6, "L", [
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

  // src/ProfileRegistry.ts
  var ProfileRegistry = class {
    byVersion = /* @__PURE__ */ new Map();
    constructor(profiles = []) {
      for (const profile of profiles) {
        this.register(profile);
      }
    }
    register(profile) {
      validateProfile(profile);
      this.byVersion.set(profile.version, profile);
      return this;
    }
    get(version) {
      return this.byVersion.get(version);
    }
    byName(name) {
      let found;
      this.byVersion.forEach((profile) => {
        if (!found && profile.name === name) {
          found = profile;
        }
      });
      return found;
    }
  };
  var defaultRegistry = new ProfileRegistry([PROFILE_S, PROFILE_M, PROFILE_L]);

  // src/HashLoc.ts
  var SEED_SALT = "simcode";
  var CodeError = class extends Error {
    constructor(message) {
      super(message);
      this.name = "CodeError";
    }
  };
  var SEED_CACHE = /* @__PURE__ */ new WeakMap();
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

  // src/util.dom.ts
  var NeighborIndex = class {
    grid = /* @__PURE__ */ new Map();
    occupied = [];
    constructor(sources) {
      for (const source of sources) {
        const cellX = Math.floor(source.centerX / GRID_CELL);
        const cellY = Math.floor(source.centerY / GRID_CELL);
        const key = `${cellX},${cellY}`;
        const bucket = this.grid.get(key);
        if (bucket) {
          bucket.push(source);
        } else {
          const fresh = [source];
          this.grid.set(key, fresh);
          this.occupied.push({
            cellX,
            cellY,
            sources: fresh
          });
        }
      }
    }
    // Text of sources whose center lies in the rect grown by `margin`, nearest first. Large regions scan
    // the occupied cells instead of every covered cell; ties keep the grid order.
    textAround(element, rect, margin) {
      const left = rect.x - margin;
      const top = rect.y - margin;
      const right = rect.x + rect.width + margin;
      const bottom = rect.y + rect.height + margin;
      const centerX = rect.x + rect.width / 2;
      const centerY = rect.y + rect.height / 2;
      const firstX = Math.floor(left / GRID_CELL);
      const lastX = Math.floor(right / GRID_CELL);
      const firstY = Math.floor(top / GRID_CELL);
      const lastY = Math.floor(bottom / GRID_CELL);
      const hits = [];
      const collect = (cellX, cellY, sources) => {
        sources.forEach((source, order) => {
          if (source.centerX < left || source.centerX > right || source.centerY < top || source.centerY > bottom) return;
          if (source.element === element || element.contains(source.element)) return;
          hits.push({
            distance: Math.hypot(source.centerX - centerX, source.centerY - centerY),
            text: source.text,
            cellX,
            cellY,
            order
          });
        });
      };
      if ((lastX - firstX + 1) * (lastY - firstY + 1) <= this.occupied.length) {
        for (let cellX = firstX; cellX <= lastX; cellX++) {
          for (let cellY = firstY; cellY <= lastY; cellY++) {
            collect(cellX, cellY, this.grid.get(`${cellX},${cellY}`) ?? []);
          }
        }
      } else {
        for (const cell of this.occupied) {
          if (cell.cellX < firstX || cell.cellX > lastX || cell.cellY < firstY || cell.cellY > lastY) continue;
          collect(cell.cellX, cell.cellY, cell.sources);
        }
      }
      hits.sort(
        (first, second) => first.distance - second.distance || first.cellX - second.cellX || first.cellY - second.cellY || first.order - second.order
      );
      return truncate(hits.map((hit) => hit.text).join(" "));
    }
  };
  var PathCache = class {
    steps = /* @__PURE__ */ new WeakMap();
    absolutePaths = /* @__PURE__ */ new WeakMap();
    idPaths = /* @__PURE__ */ new WeakMap();
    absolute(element) {
      return this.extend(element, this.absolutePaths, () => null);
    }
    id(element) {
      return this.extend(element, this.idPaths, (current) => {
        const id = current.getAttribute("id");
        return id ? `//*[@id="${id}"]` : null;
      });
    }
    extend(element, memo, anchor) {
      const chain = [];
      let base = "";
      for (let current = element; current; current = current.parentElement) {
        const known = memo.get(current);
        if (known !== void 0) {
          base = known;
          break;
        }
        const anchored = anchor(current);
        if (anchored !== null) {
          memo.set(current, anchored);
          base = anchored;
          break;
        }
        chain.push(current);
      }
      for (let index = chain.length - 1; index >= 0; index--) {
        base = `${base}/${this.step(chain[index])}`;
        memo.set(chain[index], base);
      }
      return base;
    }
    step(element) {
      const cached = this.steps.get(element);
      if (cached !== void 0) return cached;
      const parent = element.parentElement;
      if (!parent) {
        const tag = element.tagName.toLowerCase();
        this.steps.set(element, tag);
        return tag;
      }
      const children = Array.from(parent.children);
      const counts = /* @__PURE__ */ new Map();
      const seen = /* @__PURE__ */ new Map();
      for (const child of children) {
        counts.set(child.tagName, (counts.get(child.tagName) ?? 0) + 1);
      }
      for (const child of children) {
        const position = (seen.get(child.tagName) ?? 0) + 1;
        const tag = child.tagName.toLowerCase();
        seen.set(child.tagName, position);
        this.steps.set(child, (counts.get(child.tagName) ?? 0) > 1 ? `${tag}[${position}]` : tag);
      }
      return this.steps.get(element) ?? element.tagName.toLowerCase();
    }
  };
  var DomScan = class {
    elements = [];
    rects = [];
    neighbors;
    rectOf;
    margin;
    contextLevels;
    pageWidth;
    viewportHeight;
    paths = new PathCache();
    constructor(document2, options = {}) {
      const root = options.root ?? document2.body ?? document2.documentElement;
      const view = document2.defaultView;
      this.rectOf = options.rectOf ?? defaultRect;
      this.margin = options.neighborMargin ?? 60;
      this.contextLevels = options.contextLevels ?? 0;
      this.pageWidth = options.pageWidth ?? Math.max(document2.documentElement.scrollWidth || 0, view?.innerWidth || 0, 1);
      this.viewportHeight = options.viewportHeight ?? Math.max(view?.innerHeight || 0, 1);
      const sources = [];
      for (const element of Array.from(root.querySelectorAll("*"))) {
        if (SKIP_TAGS.has(element.tagName.toLowerCase())) continue;
        if (options.filter && !options.filter(element)) continue;
        const rect = this.rectOf(element);
        const visible = isVisible(element, rect);
        if (!visible && !options.includeHidden) continue;
        this.elements.push(element);
        this.rects.push(rect ?? {
          x: 0,
          y: 0,
          width: 0,
          height: 0
        });
        const text = visible && rect ? ownText(element) : "";
        if (rect && text) {
          sources.push({
            element,
            centerX: rect.x + rect.width / 2,
            centerY: rect.y + rect.height / 2,
            text: truncate(text, 120)
          });
        }
      }
      this.neighbors = new NeighborIndex(sources);
    }
    // Features of any element of the scanned document (candidate or not).
    features(element, rect) {
      const box = rect === void 0 ? this.rectOf(element) : rect;
      const attributes = {};
      for (const attribute of Array.from(element.attributes)) {
        attributes[attribute.name] = truncate(attribute.value, 100);
      }
      const text = visibleText(element);
      const visibleBox = box && box.width > 0 && box.height > 0 ? box : null;
      const spatial = visibleBox ? this.neighbors.textAround(element, visibleBox, this.margin) : "";
      const context = this.contextLevels > 0 ? this.blockContext(element, text) : "";
      const geom = visibleBox ? {
        x: (visibleBox.x + visibleBox.width / 2) / this.pageWidth,
        y: visibleBox.y / this.viewportHeight,
        area: visibleBox.width * visibleBox.height,
        shape: visibleBox.width / visibleBox.height
      } : null;
      const features = {
        tag: element.tagName.toLowerCase(),
        classes: Array.from(element.classList),
        name: element.getAttribute("name") ?? "",
        id: element.getAttribute("id") ?? "",
        href: element.getAttribute("href") ?? "",
        alt: element.getAttribute("alt") ?? "",
        xpath: "",
        idXpath: "",
        isButton: isButton(element),
        geom,
        text,
        neighborText: truncate(context ? `${spatial} ${context}` : spatial),
        type: element.getAttribute("type") ?? "",
        ariaLabel: element.getAttribute("aria-label") ?? "",
        attributes
      };
      lazy(features, "xpath", () => this.paths.absolute(element));
      lazy(features, "idXpath", () => this.paths.id(element));
      return features;
    }
    // Features of all candidates, in `elements` order.
    allFeatures() {
      return this.elements.map((element, index) => this.features(element, this.rects[index]));
    }
    // Text of the nearest ancestor (within `contextLevels`) that contains text beyond the element's own.
    blockContext(element, own) {
      let ancestor = element.parentElement;
      for (let level = 0; level < this.contextLevels && ancestor && ancestor.tagName.toLowerCase() !== "body"; level++) {
        const text = visibleText(ancestor);
        if (text.length > own.length + 3) return truncate(own ? text.split(own).join(" ") : text, 200);
        ancestor = ancestor.parentElement;
      }
      return "";
    }
  };
  var SKIP_TAGS = /* @__PURE__ */ new Set([
    "html",
    "head",
    "body",
    "script",
    "style",
    "noscript",
    "template",
    "meta",
    "link",
    "title",
    "base",
    "br",
    "wbr",
    "path",
    "defs",
    "g",
    "use",
    "symbol",
    "clippath",
    "lineargradient",
    "radialgradient",
    "stop",
    "mask",
    "pattern",
    "filter"
  ]);
  var BUTTONISH_INPUTS = /* @__PURE__ */ new Set(["submit", "button", "reset"]);
  var MAX_TEXT = 300;
  var GRID_CELL = 256;
  function defaultRect(element) {
    const bounds = element.getBoundingClientRect();
    const view = element.ownerDocument.defaultView;
    return {
      x: bounds.left + (view?.scrollX ?? 0),
      y: bounds.top + (view?.scrollY ?? 0),
      width: bounds.width,
      height: bounds.height
    };
  }
  function isVisible(element, rect) {
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;
    const style = element.ownerDocument.defaultView?.getComputedStyle(element);
    return !(style && (style.display === "none" || style.visibility === "hidden" || style.opacity === "0"));
  }
  function truncate(text, maxLength = MAX_TEXT) {
    const collapsed = text.replace(/\s+/g, " ").trim();
    return collapsed.length > maxLength ? collapsed.slice(0, maxLength) : collapsed;
  }
  function lazy(target, key, compute) {
    Object.defineProperty(target, key, {
      configurable: true,
      enumerable: true,
      get: () => {
        const value = compute();
        Object.defineProperty(target, key, {
          value,
          configurable: true,
          enumerable: true,
          writable: true
        });
        return value;
      }
    });
  }
  function xpathStep(element) {
    const tag = element.tagName.toLowerCase();
    const parent = element.parentElement;
    if (!parent) return tag;
    const sameTag = Array.from(parent.children).filter((child) => child.tagName === element.tagName);
    return sameTag.length > 1 ? `${tag}[${sameTag.indexOf(element) + 1}]` : tag;
  }
  function ownText(element) {
    let text = "";
    for (const node of Array.from(element.childNodes)) {
      if (node.nodeType === 3) {
        text += " " + (node.nodeValue ?? "");
      }
    }
    return text.trim();
  }
  function visibleText(element) {
    const tag = element.tagName.toLowerCase();
    if (tag === "input") {
      const type = (element.getAttribute("type") ?? "text").toLowerCase();
      if (BUTTONISH_INPUTS.has(type)) {
        return truncate(element.value || element.getAttribute("value") || "");
      }
      return truncate(element.getAttribute("placeholder") ?? "");
    }
    if (tag === "textarea") return truncate(element.getAttribute("placeholder") ?? "");
    if (tag === "img") return truncate(element.getAttribute("alt") ?? "");
    const inner = element.innerText;
    return truncate(typeof inner === "string" ? inner : element.textContent ?? "");
  }
  function absoluteXPath(element) {
    const steps = [];
    for (let current = element; current; current = current.parentElement) {
      steps.unshift(xpathStep(current));
    }
    return "/" + steps.join("/");
  }
  function idXPath(element) {
    const steps = [];
    for (let current = element; current; current = current.parentElement) {
      const id = current.getAttribute("id");
      if (id) {
        steps.unshift(`*[@id="${id}"]`);
        return "//" + steps.join("/");
      }
      steps.unshift(xpathStep(current));
    }
    return "/" + steps.join("/");
  }
  function isButton(element) {
    const tag = element.tagName.toLowerCase();
    if (tag === "button") return true;
    if (tag === "a") {
      return Array.from(element.classList).some((className) => className.toLowerCase().indexOf("btn") >= 0);
    }
    if (tag === "input") return BUTTONISH_INPUTS.has((element.getAttribute("type") ?? "").toLowerCase());
    return false;
  }

  // src/Hungarian.ts
  function hungarian(cost) {
    const rowCount = cost.length;
    if (rowCount === 0) return [];
    const columnCount = cost[0].length;
    if (rowCount > columnCount) throw new RangeError("hungarian: rows must be <= columns");
    const rowPotential = new Array(rowCount + 1).fill(0);
    const columnPotential = new Array(columnCount + 1).fill(0);
    const columnOwner = new Array(columnCount + 1).fill(0);
    const previousColumn = new Array(columnCount + 1).fill(0);
    for (let row = 1; row <= rowCount; row++) {
      columnOwner[0] = row;
      let currentColumn = 0;
      const minimum = new Array(columnCount + 1).fill(Infinity);
      const used = new Array(columnCount + 1).fill(false);
      do {
        used[currentColumn] = true;
        const currentRow = columnOwner[currentColumn];
        let delta = Infinity;
        let nextColumn = 0;
        for (let column = 1; column <= columnCount; column++) {
          if (used[column]) continue;
          const reduced = cost[currentRow - 1][column - 1] - rowPotential[currentRow] - columnPotential[column];
          if (reduced < minimum[column]) {
            minimum[column] = reduced;
            previousColumn[column] = currentColumn;
          }
          if (minimum[column] < delta) {
            delta = minimum[column];
            nextColumn = column;
          }
        }
        for (let column = 0; column <= columnCount; column++) {
          if (used[column]) {
            rowPotential[columnOwner[column]] += delta;
            columnPotential[column] -= delta;
          } else {
            minimum[column] -= delta;
          }
        }
        currentColumn = nextColumn;
      } while (columnOwner[currentColumn] !== 0);
      do {
        const nextColumn = previousColumn[currentColumn];
        columnOwner[currentColumn] = columnOwner[nextColumn];
        currentColumn = nextColumn;
      } while (currentColumn !== 0);
    }
    const assignment = new Array(rowCount).fill(-1);
    for (let column = 1; column <= columnCount; column++) {
      if (columnOwner[column] > 0) {
        assignment[columnOwner[column] - 1] = column - 1;
      }
    }
    return assignment;
  }

  // src/HashLoc.score.ts
  function isEmpty(values) {
    return values.every((value) => value === 0);
  }
  function segmentSimilarity(segment, left, right) {
    const leftEmpty = isEmpty(left);
    const rightEmpty = isEmpty(right);
    if (leftEmpty && rightEmpty) return null;
    if (leftEmpty || rightEmpty) return 0;
    if (segment.kind === "hash" || segment.kind === "bool") return left[0] === right[0] ? 1 : 0;
    if (segment.kind === "minhash") return minhashSimilarity(left, right, segment.bitsPerSlot);
    if (segment.kind === "sketch") return getSketch(segment.algorithm).similarity(left.slice(1), right.slice(1), segment);
    const buckets = 2 ** segment.bits - 1;
    if (buckets <= 1) return left[0] === right[0] ? 1 : 0;
    return 1 - Math.abs(left[0] - right[0]) / (buckets - 1);
  }
  function similarityVector(profile, code, candidate) {
    return profile.segments.map(
      (segment, index) => segmentSimilarity(segment, code[index], candidate[index])
    );
  }
  function weightedScore(weights, similarities) {
    let numerator = 0;
    let denominator = 0;
    for (let index = 0; index < similarities.length; index++) {
      const similarity = similarities[index];
      if (similarity === null) continue;
      numerator += weights[index] * similarity;
      denominator += weights[index];
    }
    return denominator > 0 ? numerator / denominator : 0;
  }
  function scoreValues(profile, code, candidate) {
    const weights = profile.segments.map((segment) => segment.weight);
    return weightedScore(weights, similarityVector(profile, code, candidate));
  }
  function codeCoverage(profile, code) {
    let total = 0;
    let present = 0;
    profile.segments.forEach((segment, index) => {
      total += segment.weight;
      if (!isEmpty(code[index])) {
        present += segment.weight;
      }
    });
    return total > 0 ? present / total : 0;
  }
  function sigmoid(value) {
    return 1 / (1 + Math.exp(-value));
  }
  function calibrate(calibrator, topScore, margin, coverage) {
    return sigmoid(calibrator.bias + calibrator.score * topScore + calibrator.margin * margin + calibrator.coverage * coverage);
  }

  // src/HashLoc.resolve.ts
  var PageIndex = class _PageIndex {
    features;
    elements;
    cache = /* @__PURE__ */ new WeakMap();
    buckets = /* @__PURE__ */ new WeakMap();
    ids = /* @__PURE__ */ new WeakMap();
    scan;
    constructor(features, elements, scan = null) {
      this.features = features;
      this.elements = elements ?? features.map(() => null);
      this.scan = scan;
      if (this.elements.length !== features.length) throw new RangeError("features and elements differ in length");
    }
    // Scan a live document (default: the global `document`).
    static fromDocument(target = document, options = {}) {
      const scan = new DomScan(target, options);
      return new _PageIndex(scan.allFeatures(), scan.elements, scan);
    }
    get size() {
      return this.features.length;
    }
    valuesFor(profile) {
      let values = this.cache.get(profile);
      if (!values) {
        values = this.features.map((features) => segmentValues(features, profile));
        this.cache.set(profile, values);
      }
      return values;
    }
    // LSH index over the MinHash slots: bucket key -> elements. Built on first use, cached per profile and band size.
    bucketsFor(profile, bandSize) {
      let byBand = this.buckets.get(profile);
      if (!byBand) {
        byBand = /* @__PURE__ */ new Map();
        this.buckets.set(profile, byBand);
      }
      let index = byBand.get(bandSize);
      if (!index) {
        index = /* @__PURE__ */ new Map();
        const target = index;
        this.valuesFor(profile).forEach((values, element) => {
          for (const key of bucketKeys(profile, values, bandSize)) {
            const members = target.get(key);
            members ? members.push(element) : target.set(key, [element]);
          }
        });
        byBand.set(bandSize, index);
      }
      return index;
    }
    // ID-segment value -> elements, for the profile's ID segment. Built on first use, cached per profile.
    idsFor(profile, segmentIndex) {
      let index = this.ids.get(profile);
      if (!index) {
        index = /* @__PURE__ */ new Map();
        const target = index;
        this.valuesFor(profile).forEach((values, element) => {
          const value = values[segmentIndex][0];
          if (value === 0) return;
          const members = target.get(value);
          members ? members.push(element) : target.set(value, [element]);
        });
        this.ids.set(profile, index);
      }
      return index;
    }
    // Features for an element: from the index when it is a candidate, otherwise computed on the fly.
    featuresOf(element) {
      const index = this.elements.indexOf(element);
      if (index >= 0) return this.features[index];
      if (!this.scan) throw new Error("element is not in this index and the index has no DOM scan");
      return this.scan.features(element);
    }
  };
  function decide(decoded, page, scores, best, second, options) {
    const profile = decoded.profile;
    const topK = options.topK ?? 5;
    const scored = scores.filter((score) => score >= 0).length;
    const ranked = scores.map((score, index) => [score, index]).filter(([score]) => score >= 0).sort((first, second2) => second2[0] - first[0] || first[1] - second2[1]).slice(0, topK);
    const candidates = ranked.map(([score, index]) => ({
      index,
      score,
      element: page.elements[index]
    }));
    if (best < 0) {
      return {
        status: "unconfident",
        element: null,
        index: -1,
        confidence: 0,
        score: 0,
        margin: 0,
        candidates,
        scored,
        profile: profile.name
      };
    }
    const topScore = scores[best];
    const secondScore = second >= 0 ? scores[second] : 0;
    const margin = topScore - secondScore;
    const confidence = calibrate(profile.calibrator, topScore, margin, codeCoverage(profile, decoded.values));
    const tau = options.tau ?? profile.tau;
    const floor = options.floor ?? profile.floor;
    let status = "ambiguous";
    if (topScore < floor) {
      status = "unconfident";
    } else if (confidence >= tau) {
      status = "confident";
    }
    return {
      status,
      element: status === "confident" ? page.elements[best] : null,
      index: best,
      confidence,
      score: topScore,
      margin,
      candidates,
      scored,
      profile: profile.name
    };
  }
  function bucketKeys(profile, values, bandSize) {
    const keys = [];
    profile.segments.forEach((segment, segmentIndex) => {
      if (segment.kind !== "minhash") return;
      const slots = values[segmentIndex];
      for (let start = 0; start + bandSize <= slots.length; start += bandSize) {
        const band = slots.slice(start, start + bandSize);
        if (band.every((value) => value !== 0)) keys.push(`${segmentIndex}:${start}:${band.join(",")}`);
      }
    });
    return keys;
  }
  function scoresFor(decoded, page, options = {}) {
    const candidates = page.valuesFor(decoded.profile);
    if (options.lookup !== "buckets") {
      return candidates.map((candidate) => scoreValues(decoded.profile, decoded.values, candidate));
    }
    const bandSize = options.bandSize ?? 2;
    const index = page.bucketsFor(decoded.profile, bandSize);
    const scores = new Array(candidates.length).fill(-1);
    for (const key of bucketKeys(decoded.profile, decoded.values, bandSize)) {
      for (const element of index.get(key) ?? []) {
        if (scores[element] < 0) scores[element] = scoreValues(decoded.profile, decoded.values, candidates[element]);
      }
    }
    return scores;
  }
  function idMatch(decoded, page) {
    const segmentIndex = decoded.profile.segments.findIndex((segment) => segment.kind === "hash" && segment.feature === "id");
    if (segmentIndex < 0) return -1;
    const value = decoded.values[segmentIndex][0];
    if (value === 0) return -1;
    const members = page.idsFor(decoded.profile, segmentIndex).get(value) ?? [];
    return members.length === 1 ? members[0] : -1;
  }
  function topTwo(scores) {
    let best = -1;
    let second = -1;
    for (let index = 0; index < scores.length; index++) {
      if (scores[index] < 0) continue;
      if (best < 0 || scores[index] > scores[best]) {
        second = best;
        best = index;
      } else if (second < 0 || scores[index] > scores[second]) {
        second = index;
      }
    }
    return [best, second];
  }
  function pickProfile(profile, registry) {
    if (profile && typeof profile !== "string") return profile;
    const found = registry.byName(profile ?? "M");
    if (!found) {
      throw new Error(`unknown profile '${profile}'`);
    }
    return found;
  }
  function resolveIn(code, page, options = {}) {
    const decoded = decodeCode(code, options.registry ?? defaultRegistry);
    const match = options.idShortcut ? idMatch(decoded, page) : -1;
    if (match >= 0) {
      const scores2 = new Array(page.size).fill(-1);
      scores2[match] = scoreValues(decoded.profile, decoded.values, page.valuesFor(decoded.profile)[match]);
      return decide(decoded, page, scores2, match, -1, options);
    }
    const scores = scoresFor(decoded, page, options);
    const [best, second] = topTwo(scores);
    return decide(decoded, page, scores, best, second, options);
  }
  function resolveAllIn(codes, page, options = {}) {
    const registry = options.registry ?? defaultRegistry;
    const decodedCodes = codes.map((code) => decodeCode(code, registry));
    const scores = decodedCodes.map((decoded) => scoresFor(decoded, page, options));
    if (page.size === 0) {
      return decodedCodes.map(
        (decoded, index) => decide(decoded, page, scores[index], -1, -1, options)
      );
    }
    const shortlistSize = Math.max(options.shortlist ?? 10, options.topK ?? 5);
    const columns = [];
    for (const codeScores of scores) {
      codeScores.map((score, index) => [score, index]).sort((first, second) => second[0] - first[0]).slice(0, shortlistSize).forEach(([, index]) => {
        if (columns.indexOf(index) < 0) {
          columns.push(index);
        }
      });
    }
    const dummyCount = Math.max(0, codes.length - columns.length);
    const cost = scores.map(
      (codeScores) => columns.map((column) => 1 - codeScores[column]).concat(new Array(dummyCount).fill(1))
    );
    const assignment = hungarian(cost);
    return decodedCodes.map((decoded, codeIndex) => {
      const column = assignment[codeIndex];
      const best = column < columns.length ? columns[column] : -1;
      if (best < 0) return decide(decoded, page, scores[codeIndex], -1, -1, options);
      const others = scores[codeIndex].map((score, index) => index === best ? -Infinity : score);
      const alternative = topTwo(others)[0];
      return decide(decoded, page, scores[codeIndex], best, alternative, options);
    });
  }
  function encode(element, options = {}) {
    const registry = options.registry ?? defaultRegistry;
    const page = options.page ?? PageIndex.fromDocument(element.ownerDocument, options);
    return encodeFeatures(page.featuresOf(element), pickProfile(options.profile, registry));
  }
  function resolve(code, options = {}) {
    const page = options.page ?? PageIndex.fromDocument(options.document ?? document, options);
    return resolveIn(code, page, options);
  }
  function resolveAll(codes, options = {}) {
    const page = options.page ?? PageIndex.fromDocument(options.document ?? document, options);
    return resolveAllIn(codes, page, options);
  }

  // src/HashLoc.exact.ts
  function setSimilarity(left, right, cosine) {
    let shared = 0;
    left.forEach((token) => {
      if (right.has(token)) {
        shared++;
      }
    });
    return cosine ? shared / Math.sqrt(left.size * right.size) : shared / (left.size + right.size - shared);
  }
  function exactValue(segment, features) {
    switch (segment.kind) {
      case "hash": {
        const text = normalizeText(features[segment.feature]);
        return text ? text : null;
      }
      case "minhash":
      case "sketch": {
        const tokens = featureTokens(features, segment.feature, segment.tokenizer, segment.excludeKeys);
        return tokens.size > 0 ? tokens : null;
      }
      case "bucket":
        return numericFraction(segment.feature, features);
      case "bool":
        return Boolean(features[segment.feature]);
    }
  }
  function exactValues(features, profile) {
    return profile.segments.map((segment) => exactValue(segment, features));
  }
  function exactSimilarity(segment, left, right) {
    if (left === null && right === null) return null;
    if (left === null || right === null) return 0;
    if (segment.kind === "minhash" || segment.kind === "sketch") {
      const cosine = segment.kind === "sketch" && segment.algorithm === "simhash";
      return setSimilarity(left, right, cosine);
    }
    if (segment.kind === "bucket") return 1 - Math.abs(left - right);
    return left === right ? 1 : 0;
  }
  function exactSimilarityVector(profile, left, right) {
    return profile.segments.map(
      (segment, index) => exactSimilarity(segment, left[index], right[index])
    );
  }
  function exactScore(profile, left, right) {
    const weights = profile.segments.map((segment) => segment.weight);
    return weightedScore(weights, exactSimilarityVector(profile, left, right));
  }
  function pairTerms(profile, code, candidate) {
    let totalWeight = 0;
    profile.segments.forEach((segment, index) => {
      if (code[index] !== null || candidate[index] !== null) {
        totalWeight += segment.weight;
      }
    });
    if (totalWeight <= 0) {
      return {
        effectiveSlots: Infinity,
        bias: 0
      };
    }
    let varianceSum = 0;
    let bias = 0;
    for (let index = 0; index < profile.segments.length; index++) {
      const segment = profile.segments[index];
      if (code[index] === null || candidate[index] === null) continue;
      const share = segment.weight / totalWeight;
      if (segment.kind === "minhash") {
        const chance = 1 / (2 ** segment.bitsPerSlot - 1);
        varianceSum += share * share / (segment.slots * (1 - chance) ** 2);
      } else if (segment.kind === "sketch") {
        if (segment.algorithm !== "minhash") {
          return {
            effectiveSlots: NaN,
            bias: NaN
          };
        }
        const chance = 2 ** -segment.bitsPerValue;
        varianceSum += share * share / (segment.values * (1 - chance) ** 2);
      } else if (segment.kind === "hash") {
        bias += share / (2 ** segment.bits - 1);
      } else if (segment.kind === "bucket") {
        const buckets = 2 ** segment.bits - 1;
        bias += buckets > 1 ? share * 2 / (buckets - 1) : share;
      }
    }
    return {
      effectiveSlots: varianceSum > 0 ? 1 / varianceSum : Infinity,
      bias
    };
  }
  function topOneErrorBound(profile, code, candidates, reference, scores) {
    const referenceTerms = pairTerms(profile, code, candidates[reference]);
    if (Number.isNaN(referenceTerms.effectiveSlots)) return NaN;
    let bound = 0;
    for (let index = 0; index < candidates.length; index++) {
      if (index === reference) continue;
      const terms = pairTerms(profile, code, candidates[index]);
      const slack = (scores[reference] - scores[index] - referenceTerms.bias - terms.bias) / 2;
      if (slack <= 0) return 1;
      bound += Math.exp(-2 * slack * slack * referenceTerms.effectiveSlots) + Math.exp(-2 * slack * slack * terms.effectiveSlots);
      if (bound >= 1) return 1;
    }
    return bound;
  }

  // src/HashLoc.train.ts
  var WEIGHT_FACTORS = [0, 0.5, 0.75, 1.25, 1.5, 2];
  var ZERO_WEIGHT_TRIES = [0.25, 0.5, 1, 2];
  var ALLOCATION_PLAN = [
    planItem("tag", "hash"),
    planItem("classes", "minhash", "items"),
    planItem("name", "hash"),
    planItem("id", "hash"),
    planItem("href", "minhash", "char3"),
    planItem("alt", "minhash", "char3"),
    planItem("xpath", "minhash", "path"),
    planItem("idXpath", "minhash", "path"),
    planItem("isButton", "bool"),
    planItem("x", "bucket"),
    planItem("y", "bucket"),
    planItem("area", "bucket"),
    planItem("shape", "bucket"),
    planItem("text", "minhash", "char3"),
    planItem("neighborText", "minhash", "word"),
    planItem("type", "hash"),
    planItem("ariaLabel", "minhash", "char3"),
    planItem("attributes", "minhash", "pairs")
  ];
  function binomialUpperBound(failures, trials, delta) {
    if (failures >= trials) return 1;
    const logChoose = [0];
    for (let index = 0; index < failures; index++) {
      logChoose.push(logChoose[index] + Math.log(trials - index) - Math.log(index + 1));
    }
    const cumulative = (rate) => {
      const logTerms = logChoose.map(
        (logCoefficient, index) => logCoefficient + index * Math.log(rate) + (trials - index) * Math.log1p(-rate)
      );
      const maximum = Math.max(...logTerms);
      return Math.exp(maximum) * logTerms.reduce((sum, term) => sum + Math.exp(term - maximum), 0);
    };
    let low = failures / trials;
    let high = 1;
    for (let iteration = 0; iteration < 80; iteration++) {
      const middle = (low + high) / 2;
      if (cumulative(middle) > delta) {
        low = middle;
      } else {
        high = middle;
      }
    }
    return high;
  }
  function planItem(feature, kind, tokenizer) {
    return {
      feature,
      kind,
      tokenizer
    };
  }
  function rank(similarities, weights) {
    const scores = similarities.map((vector) => weightedScore(weights, vector));
    let best = -1;
    let second = -1;
    scores.forEach((score, index) => {
      if (best < 0 || score > scores[best]) {
        second = best;
        best = index;
      } else if (second < 0 || score > scores[second]) {
        second = index;
      }
    });
    const topScore = best >= 0 ? scores[best] : 0;
    return {
      best,
      topScore,
      margin: topScore - (second >= 0 ? scores[second] : 0),
      scores
    };
  }
  function weightsOf(profile) {
    return profile.segments.map((segment) => segment.weight);
  }
  function withWeights(profile, weights) {
    return {
      ...profile,
      segments: profile.segments.map((segment, index) => ({
        ...segment,
        weight: weights[index]
      }))
    };
  }
  function asPrepared(data, profile) {
    return Array.isArray(data) ? prepare(data, profile) : data;
  }
  function grow(item, current) {
    const weight = DEFAULT_FEATURE_WEIGHTS[item.feature];
    if (item.kind === "bool") {
      return current ? null : {
        kind: "bool",
        feature: "isButton",
        weight
      };
    }
    if (item.kind === "hash") {
      if (!current) {
        return {
          kind: "hash",
          feature: item.feature,
          bits: 4,
          weight
        };
      }
      return current.kind === "hash" && current.bits < 16 ? {
        ...current,
        bits: current.bits + 2
      } : null;
    }
    if (item.kind === "minhash") {
      if (!current) {
        return {
          kind: "minhash",
          feature: item.feature,
          slots: 2,
          bitsPerSlot: 3,
          tokenizer: item.tokenizer ?? "char3",
          weight
        };
      }
      if (current.kind !== "minhash") return null;
      if (current.bitsPerSlot < 4) {
        return {
          ...current,
          bitsPerSlot: 4
        };
      }
      return current.slots < 16 ? {
        ...current,
        slots: current.slots + 1
      } : null;
    }
    if (!current) {
      return {
        kind: "bucket",
        feature: item.feature,
        bits: 2,
        weight
      };
    }
    return current.kind === "bucket" && current.bits < 6 ? {
      ...current,
      bits: current.bits + 1
    } : null;
  }
  function prepare(samples, profile) {
    return {
      profile,
      rows: samples.map((sample) => {
        const code = segmentValues(sample.target, profile);
        return {
          similarities: sample.candidates.map(
            (candidate) => similarityVector(profile, code, segmentValues(candidate, profile))
          ),
          answer: sample.answer,
          coverage: codeCoverage(profile, code)
        };
      })
    };
  }
  function evaluate(data, profile, options = {}) {
    const prepared = asPrepared(data, profile);
    const weights = weightsOf(profile);
    const tau = options.tau ?? profile.tau;
    const topK = options.topK ?? 5;
    let present = 0;
    let correct = 0;
    let accepted = 0;
    let acceptedCorrect = 0;
    let escalated = 0;
    let escalatedHit = 0;
    for (const row of prepared.rows) {
      const exists = row.answer >= 0;
      const ranked = rank(row.similarities, weights);
      const isCorrect = exists && ranked.best === row.answer;
      const confidence = calibrate(profile.calibrator, ranked.topScore, ranked.margin, row.coverage);
      if (exists) {
        present++;
      }
      if (isCorrect) {
        correct++;
      }
      if (ranked.best >= 0 && ranked.topScore >= profile.floor && confidence >= tau) {
        accepted++;
        if (isCorrect) {
          acceptedCorrect++;
        }
      } else if (exists) {
        escalated++;
        const answerScore = ranked.scores[row.answer];
        const better = ranked.scores.filter((score) => score > answerScore).length;
        if (better < topK) {
          escalatedHit++;
        }
      }
    }
    const total = prepared.rows.length || 1;
    const bits = profileBits(profile);
    return {
      n: present,
      accuracy: present ? correct / present : 0,
      coverage: accepted / total,
      precision: accepted ? acceptedCorrect / accepted : 1,
      silentErrorRate: (accepted - acceptedCorrect) / total,
      recallAtN: escalated ? escalatedHit / escalated : 1,
      endToEnd: (acceptedCorrect + escalatedHit) / total,
      bits,
      chars: Math.ceil(bits / 5) + 1
    };
  }
  function precisionCoverage(data, profile) {
    const prepared = asPrepared(data, profile);
    const weights = weightsOf(profile);
    const points = prepared.rows.map((row) => {
      const ranked = rank(row.similarities, weights);
      return {
        confidence: calibrate(profile.calibrator, ranked.topScore, ranked.margin, row.coverage),
        correct: row.answer >= 0 && ranked.best === row.answer
      };
    });
    let good = 0;
    points.sort((first, second) => second.confidence - first.confidence);
    return points.map((point, index) => {
      if (point.correct) {
        good++;
      }
      return {
        confidence: point.confidence,
        coverage: (index + 1) / points.length,
        precision: good / (index + 1)
      };
    });
  }
  function fitWeights(data, profile, options = {}) {
    const prepared = asPrepared(data, profile);
    const objective = (weights2) => {
      let correct = 0;
      let marginSum = 0;
      for (const row of prepared.rows) {
        if (row.answer < 0) continue;
        const scores = row.similarities.map((vector) => weightedScore(weights2, vector));
        const truth = scores[row.answer];
        let other = -Infinity;
        scores.forEach((score, index) => {
          if (index !== row.answer && score > other) {
            other = score;
          }
        });
        if (truth > other) {
          correct++;
        }
        marginSum += truth - (other === -Infinity ? 0 : other);
      }
      return correct + 0.01 * marginSum;
    };
    let weights = weightsOf(profile);
    let best = objective(weights);
    for (let round = 0; round < (options.rounds ?? 3); round++) {
      let improved = false;
      for (let index = 0; index < weights.length; index++) {
        const current = weights[index];
        const tries = current === 0 ? ZERO_WEIGHT_TRIES : WEIGHT_FACTORS.map((factor) => current * factor);
        for (const tryWeight of tries) {
          const candidate = weights.slice();
          candidate[index] = Math.round(tryWeight * 1e3) / 1e3;
          if (candidate.every((weight) => weight === 0)) continue;
          const value = objective(candidate);
          if (value > best + 1e-9) {
            best = value;
            weights = candidate;
            improved = true;
          }
        }
      }
      if (!improved) break;
    }
    return withWeights(profile, weights);
  }
  function fitCalibrator(data, profile, options = {}) {
    const prepared = asPrepared(data, profile);
    const weights = weightsOf(profile);
    const inputs = [];
    const labels = [];
    for (const row of prepared.rows) {
      const ranked = rank(row.similarities, weights);
      if (ranked.best < 0) continue;
      inputs.push([1, ranked.topScore, ranked.margin, row.coverage]);
      labels.push(row.answer >= 0 && ranked.best === row.answer ? 1 : 0);
    }
    if (inputs.length === 0) return profile;
    const learningRate = options.learningRate ?? 0.5;
    const l2 = options.l2 ?? 1e-3;
    let theta = [DEFAULT_CALIBRATOR.bias, DEFAULT_CALIBRATOR.score, DEFAULT_CALIBRATOR.margin, DEFAULT_CALIBRATOR.coverage];
    for (let epoch = 0; epoch < (options.epochs ?? 3e3); epoch++) {
      const gradient = [0, 0, 0, 0];
      for (let sample = 0; sample < inputs.length; sample++) {
        const logit = inputs[sample].reduce((sum, value, feature) => sum + value * theta[feature], 0);
        const error = sigmoid(logit) - labels[sample];
        for (let feature = 0; feature < 4; feature++) {
          gradient[feature] += error * inputs[sample][feature];
        }
      }
      theta = theta.map(
        (value, feature) => value - learningRate * (gradient[feature] / inputs.length + (feature > 0 ? l2 * value : 0))
      );
    }
    return {
      ...profile,
      calibrator: {
        bias: theta[0],
        score: theta[1],
        margin: theta[2],
        coverage: theta[3]
      }
    };
  }
  function chooseTau(data, profile, targetPrecision = 0.99) {
    let tau = 1;
    for (const point of precisionCoverage(data, profile)) {
      if (point.precision >= targetPrecision) {
        tau = point.confidence;
      }
    }
    return {
      ...profile,
      tau
    };
  }
  function chooseTauRiskControl(data, profile, alpha, options = {}) {
    const prepared = asPrepared(data, profile);
    const weights = weightsOf(profile);
    const points = prepared.rows.map((row) => {
      const ranked = rank(row.similarities, weights);
      return {
        confidence: calibrate(profile.calibrator, ranked.topScore, ranked.margin, row.coverage),
        correct: row.answer >= 0 && ranked.best === row.answer
      };
    });
    const total = points.length;
    let tau = 1.01;
    let wrongAccepted = 0;
    points.sort((first, second) => second.confidence - first.confidence);
    for (let index = 0; index < total; index++) {
      if (!points[index].correct) {
        wrongAccepted++;
      }
      if (index + 1 < total && points[index + 1].confidence === points[index].confidence) continue;
      const holds = options.delta === void 0 ? (wrongAccepted + 1) / (total + 1) <= alpha : binomialUpperBound(wrongAccepted, total, options.delta) <= alpha;
      if (holds) {
        tau = points[index].confidence;
      } else if (options.delta !== void 0) {
        break;
      }
    }
    return {
      ...profile,
      tau
    };
  }
  function allocateBits(samples, options = {}) {
    const maxBits = options.maxBits ?? 160;
    const version = options.version ?? 15;
    const patience = options.patience ?? 3;
    const baseProfile = (segments2) => ({
      version,
      name: `alloc-${segments2.length}`,
      segments: finalizeSegments(segments2),
      calibrator: {
        ...DEFAULT_CALIBRATOR
      },
      tau: 0.9,
      floor: 0.35
    });
    const scoreProfile = (profile) => {
      const prepared = prepare(samples, profile);
      const fitted = options.refitWeights ? fitWeights(prepared, profile, {
        rounds: 1
      }) : profile;
      return {
        accuracy: evaluate(prepared, fitted).accuracy,
        profile: fitted
      };
    };
    const trace = [];
    let segments = [];
    let currentAccuracy = 0;
    let stale = 0;
    while (true) {
      const bits = profileBits(baseProfile(segments));
      let bestStep = null;
      for (const item of ALLOCATION_PLAN) {
        const index = segments.findIndex((segment) => segment.feature === item.feature && segment.kind === item.kind);
        const next = grow(item, index >= 0 ? segments[index] : void 0);
        if (!next) continue;
        const candidateSegments = segments.slice();
        if (index >= 0) {
          candidateSegments[index] = next;
        } else {
          candidateSegments.push(next);
        }
        const candidate = baseProfile(candidateSegments);
        if (profileBits(candidate) > maxBits) continue;
        const scored = scoreProfile(candidate);
        const gain = (scored.accuracy - currentAccuracy) / (profileBits(candidate) - bits);
        if (!bestStep || gain > bestStep.gain) {
          bestStep = {
            accuracy: scored.accuracy,
            profile: scored.profile,
            gain,
            change: `${index >= 0 ? "grow" : "add"} ${item.feature}`
          };
        }
      }
      if (!bestStep) break;
      stale = bestStep.gain > 0 ? 0 : stale + 1;
      if (stale > patience) break;
      const stepBits = profileBits(bestStep.profile);
      segments = bestStep.profile.segments;
      currentAccuracy = bestStep.accuracy;
      trace.push({
        bits: stepBits,
        chars: Math.ceil(stepBits / 5) + 1,
        accuracy: bestStep.accuracy,
        change: bestStep.change,
        profile: bestStep.profile
      });
    }
    return trace;
  }
  function compareProfiles(samples, profiles, options = {}) {
    return profiles.map((profile) => {
      const prepared = prepare(samples, profile);
      const evaluated = options.fit ? fitWeights(prepared, profile) : profile;
      return {
        profile: profile.name,
        ...evaluate(prepared, evaluated, options)
      };
    });
  }
  function groupAblation(samples, profile) {
    const baseAccuracy = evaluate(samples, profile).accuracy;
    const groups = Object.keys(PROPERTY_GROUPS).filter(
      (group) => profile.segments.some((segment) => PROPERTY_GROUPS[group].indexOf(segment.feature) >= 0)
    );
    return groups.map((group) => {
      const ablated = withoutGroup(profile, group);
      const accuracy = evaluate(samples, ablated).accuracy;
      return {
        group,
        bitsSaved: profileBits(profile) - profileBits(ablated),
        accuracy,
        delta: accuracy - baseAccuracy
      };
    }).sort((first, second) => first.delta - second.delta);
  }

  // src/api.browser.ts
  window.HashLoc = {
    ...api_exports
  };
})();
