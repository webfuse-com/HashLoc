import { minhashSimilarity } from "./MinHash.js";
import { getSketch } from "./options.sketches.js";
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
export {
  calibrate,
  codeCoverage,
  scoreValues,
  segmentSimilarity,
  sigmoid,
  similarityVector,
  weightedScore
};
