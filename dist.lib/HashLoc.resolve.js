import { DomScan } from "./util.dom.js";
import { decodeCode, encodeFeatures, segmentValues } from "./HashLoc.js";
import { hungarian } from "./Hungarian.js";
import { defaultRegistry } from "./ProfileRegistry.js";
import { calibrate, codeCoverage, scoreValues } from "./HashLoc.score.js";
class PageIndex {
  features;
  elements;
  cache = /* @__PURE__ */ new WeakMap();
  buckets = /* @__PURE__ */ new WeakMap();
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
    return new PageIndex(scan.allFeatures(), scan.elements, scan);
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
  // Features for an element: from the index when it is a candidate, otherwise computed on the fly.
  featuresOf(element) {
    const index = this.elements.indexOf(element);
    if (index >= 0) return this.features[index];
    if (!this.scan) throw new Error("element is not in this index and the index has no DOM scan");
    return this.scan.features(element);
  }
}
function decide(decoded, page, scores, best, second, options) {
  const profile = decoded.profile;
  const topN = options.topN ?? 5;
  const scored = scores.filter((score) => score >= 0).length;
  const ranked = scores.map((score, index) => [score, index]).filter(([score]) => score >= 0).sort((first, second2) => second2[0] - first[0] || first[1] - second2[1]).slice(0, topN);
  const candidates = ranked.map(([score, index]) => ({
    index,
    score,
    element: page.elements[index]
  }));
  if (best < 0) {
    return {
      status: "not_found",
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
    status = "not_found";
  } else if (confidence >= tau) {
    status = "accepted";
  }
  return {
    status,
    element: status === "accepted" ? page.elements[best] : null,
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
  const shortlistSize = Math.max(options.shortlist ?? 10, options.topN ?? 5);
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
function encodeElement(element, options = {}) {
  const registry = options.registry ?? defaultRegistry;
  const page = options.page ?? PageIndex.fromDocument(element.ownerDocument, options);
  return encodeFeatures(page.featuresOf(element), pickProfile(options.profile, registry));
}
function resolveCode(code, options = {}) {
  const page = options.page ?? PageIndex.fromDocument(options.document ?? document, options);
  return resolveIn(code, page, options);
}
function resolveAll(codes, options = {}) {
  const page = options.page ?? PageIndex.fromDocument(options.document ?? document, options);
  return resolveAllIn(codes, page, options);
}
export {
  PageIndex,
  encodeElement,
  resolveAll,
  resolveAllIn,
  resolveCode,
  resolveIn
};
