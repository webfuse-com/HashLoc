import { numericFraction } from "./HashLoc.js";
import { featureTokens, normalizeText } from "./util.text.js";
import { weightedScore } from "./HashLoc.score.js";
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
export {
  exactScore,
  exactSimilarity,
  exactSimilarityVector,
  exactValues,
  pairTerms,
  topOneErrorBound
};
