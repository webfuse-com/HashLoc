import { segmentValues } from "./HashLoc.js";
import { DEFAULT_CALIBRATOR, DEFAULT_FEATURE_WEIGHTS, PROPERTY_GROUPS } from "./constants.weights.js";
import { finalizeSegments, profileBits, withoutGroup } from "./util.profile.js";
import { calibrate, codeCoverage, sigmoid, similarityVector, weightedScore } from "./HashLoc.score.js";
const WEIGHT_FACTORS = [0, 0.5, 0.75, 1.25, 1.5, 2];
const ZERO_WEIGHT_TRIES = [0.25, 0.5, 1, 2];
const ALLOCATION_PLAN = [
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
};
