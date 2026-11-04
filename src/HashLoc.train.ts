import {
	type ElementFeatures,
	type FeatureName,
	type Profile,
	type SegmentSpec,
	type SegmentValues,
	type Tokenizer,
	type PropertyGroup
} from "./types.js";
import { segmentValues } from "./HashLoc.js";
import { DEFAULT_CALIBRATOR, DEFAULT_FEATURE_WEIGHTS, PROPERTY_GROUPS } from "./constants.weights.js";
import { finalizeSegments, profileBits, withoutGroup } from "./util.profile.js";
import { calibrate, codeCoverage, sigmoid, similarityVector, weightedScore } from "./HashLoc.score.js";


/**
 * One relocalization case: the element as captured on the old version, all candidates on the
 * new version, and the index of the true match (-1 if it no longer exists).
 */
export interface Sample {
	target: ElementFeatures;
	candidates: ElementFeatures[];
	answer: number;
}

export interface PreparedRow {
	similarities: (number | null)[][];
	answer: number;
	coverage: number;
}

/** Weight-independent similarity vectors, cached so weight search is cheap. */
export interface Prepared {
	profile: Profile;
	rows: PreparedRow[];
}

export interface Metrics {
	/** Samples whose true element exists on the new version. */
	n: number;
	/** Top-1 exact-match accuracy at full coverage (= precision = recall there). */
	accuracy: number;
	/** Share auto-accepted at the threshold. */
	coverage: number;
	/** Correct among auto-accepted. */
	precision: number;
	/** Wrong auto-accepts over all samples. */
	silentErrorRate: number;
	/** Escalated cases whose true element is in the top-n shortlist. */
	recallAtN: number;
	/** Correct auto-accepts plus escalated shortlist hits, over all samples. */
	endToEnd: number;
	bits: number;
	chars: number;
}

export interface EvaluateOptions {
	tau?: number;
	topK?: number;
}

export interface PrecisionCoveragePoint {
	confidence: number;
	coverage: number;
	precision: number;
}

export interface FitWeightsOptions {
	rounds?: number;
}

export interface FitCalibratorOptions {
	epochs?: number;
	learningRate?: number;
	l2?: number;
}

export interface PlanItem {
	feature: FeatureName;
	kind: SegmentSpec["kind"];
	tokenizer?: Tokenizer;
}

export interface AllocationStep {
	bits: number;
	chars: number;
	accuracy: number;
	change: string;
	profile: Profile;
}

export interface AllocationOptions {
	maxBits?: number;
	version?: number;
	refitWeights?: boolean;
	patience?: number;
}

export interface RiskControlOptions {
	delta?: number;
}

export interface CompareOptions extends EvaluateOptions {
	fit?: boolean;
}

export interface ProfileComparisonRow extends Metrics {
	profile: string;
}

export interface AblationRow {
	group: PropertyGroup;
	bitsSaved: number;
	accuracy: number;
	/** Accuracy change versus the full profile (negative = the group carried information). */
	delta: number;
}

interface Ranked {
	best: number;
	topScore: number;
	margin: number;
	scores: number[];
}

interface ScoredProfile {
	accuracy: number;
	profile: Profile;
}

interface CandidateStep {
	accuracy: number;
	profile: Profile;
	gain: number;
	change: string;
}

interface ConfidencePoint {
	confidence: number;
	correct: boolean;
}


const WEIGHT_FACTORS: number[] = [ 0, 0.5, 0.75, 1.25, 1.5, 2 ];

const ZERO_WEIGHT_TRIES: number[] = [ 0.25, 0.5, 1, 2 ];


// Search space: one entry per Similo++ property (Location contributes x and y).
export const ALLOCATION_PLAN: readonly PlanItem[] = [
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


// Clopper-Pearson upper confidence bound for a binomial rate with `failures` out of `trials`.
function binomialUpperBound(failures: number, trials: number, delta: number): number {
	if(failures >= trials) return 1;

	const logChoose: number[] = [ 0 ];

	for(let index: number = 0; index < failures; index++) {
		logChoose.push(logChoose[index] + Math.log(trials - index) - Math.log(index + 1));
	}

	const cumulative: (rate: number) => number = (rate: number) => {
		const logTerms: number[] = logChoose.map((logCoefficient: number, index: number) =>
			logCoefficient + index * Math.log(rate) + (trials - index) * Math.log1p(-rate)
		);
		const maximum: number = Math.max(...logTerms);

		return Math.exp(maximum) * logTerms.reduce((sum: number, term: number) => sum + Math.exp(term - maximum), 0);
	};
	let low: number = failures / trials;
	let high: number = 1;

	for(let iteration: number = 0; iteration < 80; iteration++) {
		const middle: number = (low + high) / 2;

		if(cumulative(middle) > delta) {
			low = middle;
		} else {
			high = middle;
		}
	}

	return high;
}

function planItem(feature: FeatureName, kind: SegmentSpec["kind"], tokenizer?: Tokenizer): PlanItem {
	return {
		feature: feature,
		kind: kind,
		tokenizer: tokenizer
	};
}

function rank(similarities: (number | null)[][], weights: number[]): Ranked {
	const scores: number[] = similarities.map((vector: (number | null)[]) => weightedScore(weights, vector));
	let best: number = -1;
	let second: number = -1;

	scores.forEach((score: number, index: number) => {
		if(best < 0 || score > scores[best]) {
			second = best;
			best = index;
		} else if(second < 0 || score > scores[second]) {
			second = index;
		}
	});

	const topScore: number = best >= 0 ? scores[best] : 0;

	return {
		best: best,
		topScore: topScore,
		margin: topScore - (second >= 0 ? scores[second] : 0),
		scores: scores
	};
}

function weightsOf(profile: Profile): number[] {
	return profile.segments.map((segment: SegmentSpec) => segment.weight);
}

function withWeights(profile: Profile, weights: number[]): Profile {
	return {
		...profile,
		segments: profile.segments.map((segment: SegmentSpec, index: number) => ({
			...segment,
			weight: weights[index]
		}))
	};
}

function asPrepared(data: Sample[] | Prepared, profile: Profile): Prepared {
	return Array.isArray(data) ? prepare(data, profile) : data;
}

function grow(item: PlanItem, current: SegmentSpec | undefined): SegmentSpec | null {
	const weight: number = DEFAULT_FEATURE_WEIGHTS[item.feature];

	if(item.kind === "bool") {
		return current ? null : {
			kind: "bool",
			feature: "isButton",
			weight: weight
		};
	}

	if(item.kind === "hash") {
		if(!current) {
			return {
				kind: "hash",
				feature: item.feature as never,
				bits: 4,
				weight: weight
			};
		}

		return current.kind === "hash" && current.bits < 16 ? {
			...current,
			bits: current.bits + 2
		} : null;
	}

	if(item.kind === "minhash") {
		if(!current) {
			return {
				kind: "minhash",
				feature: item.feature as never,
				slots: 2,
				bitsPerSlot: 3,
				tokenizer: item.tokenizer ?? "char3",
				weight: weight
			};
		}

		if(current.kind !== "minhash") return null;

		if(current.bitsPerSlot < 4) {
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

	if(!current) {
		return {
			kind: "bucket",
			feature: item.feature as never,
			bits: 2,
			weight: weight
		};
	}

	return current.kind === "bucket" && current.bits < 6 ? {
		...current,
		bits: current.bits + 1
	} : null;
}


export function prepare(samples: Sample[], profile: Profile): Prepared {
	return {
		profile: profile,
		rows: samples.map((sample: Sample) => {
			const code: SegmentValues = segmentValues(sample.target, profile);

			return {
				similarities: sample.candidates.map((candidate: ElementFeatures) =>
					similarityVector(profile, code, segmentValues(candidate, profile))
				),
				answer: sample.answer,
				coverage: codeCoverage(profile, code)
			};
		})
	};
}

export function evaluate(data: Sample[] | Prepared, profile: Profile, options: EvaluateOptions = {}): Metrics {
	const prepared: Prepared = asPrepared(data, profile);
	const weights: number[] = weightsOf(profile);
	const tau: number = options.tau ?? profile.tau;
	const topK: number = options.topK ?? 5;
	let present: number = 0;
	let correct: number = 0;
	let accepted: number = 0;
	let acceptedCorrect: number = 0;
	let escalated: number = 0;
	let escalatedHit: number = 0;

	for(const row of prepared.rows) {
		const exists: boolean = row.answer >= 0;
		const ranked: Ranked = rank(row.similarities, weights);
		const isCorrect: boolean = exists && ranked.best === row.answer;
		const confidence: number = calibrate(profile.calibrator, ranked.topScore, ranked.margin, row.coverage);

		if(exists) {
			present++;
		}

		if(isCorrect) {
			correct++;
		}

		if(ranked.best >= 0 && ranked.topScore >= profile.floor && confidence >= tau) {
			accepted++;

			if(isCorrect) {
				acceptedCorrect++;
			}
		} else if(exists) {
			escalated++;

			const answerScore: number = ranked.scores[row.answer];
			const better: number = ranked.scores.filter((score: number) => score > answerScore).length;

			if(better < topK) {
				escalatedHit++;
			}
		}
	}

	const total: number = prepared.rows.length || 1;
	const bits: number = profileBits(profile);

	return {
		n: present,
		accuracy: present ? correct / present : 0,
		coverage: accepted / total,
		precision: accepted ? acceptedCorrect / accepted : 1,
		silentErrorRate: (accepted - acceptedCorrect) / total,
		recallAtN: escalated ? escalatedHit / escalated : 1,
		endToEnd: (acceptedCorrect + escalatedHit) / total,
		bits: bits,
		chars: Math.ceil(bits / 5) + 1
	};
}

// Points of the precision–coverage curve, sorted by descending confidence.
export function precisionCoverage(data: Sample[] | Prepared, profile: Profile): PrecisionCoveragePoint[] {
	const prepared: Prepared = asPrepared(data, profile);
	const weights: number[] = weightsOf(profile);
	const points: ConfidencePoint[] = prepared.rows.map((row: PreparedRow) => {
		const ranked: Ranked = rank(row.similarities, weights);

		return {
			confidence: calibrate(profile.calibrator, ranked.topScore, ranked.margin, row.coverage),
			correct: row.answer >= 0 && ranked.best === row.answer
		};
	});
	let good: number = 0;

	points.sort((first: ConfidencePoint, second: ConfidencePoint) => second.confidence - first.confidence);

	return points.map((point: ConfidencePoint, index: number) => {
		if(point.correct) {
			good++;
		}

		return {
			confidence: point.confidence,
			coverage: (index + 1) / points.length,
			precision: good / (index + 1)
		};
	});
}

// Coordinate search on segment weights maximizing top-1 accuracy, with the mean margin of
// correct answers as tie-breaker. Similar in spirit to the genetic search used for Similo++.
export function fitWeights(data: Sample[] | Prepared, profile: Profile, options: FitWeightsOptions = {}): Profile {
	const prepared: Prepared = asPrepared(data, profile);
	const objective: (weights: number[]) => number = (weights: number[]) => {
		let correct: number = 0;
		let marginSum: number = 0;

		for(const row of prepared.rows) {
			if(row.answer < 0) continue;

			const scores: number[] = row.similarities.map((vector: (number | null)[]) => weightedScore(weights, vector));
			const truth: number = scores[row.answer];
			let other: number = -Infinity;

			scores.forEach((score: number, index: number) => {
				if(index !== row.answer && score > other) {
					other = score;
				}
			});

			if(truth > other) {
				correct++;
			}

			marginSum += truth - (other === -Infinity ? 0 : other);
		}

		return correct + 0.01 * marginSum;
	};
	let weights: number[] = weightsOf(profile);
	let best: number = objective(weights);

	for(let round: number = 0; round < (options.rounds ?? 3); round++) {
		let improved: boolean = false;

		for(let index: number = 0; index < weights.length; index++) {
			const current: number = weights[index];
			const tries: number[] = current === 0 ? ZERO_WEIGHT_TRIES : WEIGHT_FACTORS.map((factor: number) => current * factor);

			for(const tryWeight of tries) {
				const candidate: number[] = weights.slice();

				candidate[index] = Math.round(tryWeight * 1000) / 1000;

				if(candidate.every((weight: number) => weight === 0)) continue;

				const value: number = objective(candidate);

				if(value > best + 1e-9) {
					best = value;
					weights = candidate;
					improved = true;
				}
			}
		}

		if(!improved) break;
	}

	return withWeights(profile, weights);
}

// Fit the logistic confidence calibrator on whether the top-1 candidate is correct.
export function fitCalibrator(data: Sample[] | Prepared, profile: Profile, options: FitCalibratorOptions = {}): Profile {
	const prepared: Prepared = asPrepared(data, profile);
	const weights: number[] = weightsOf(profile);
	const inputs: number[][] = [];
	const labels: number[] = [];

	for(const row of prepared.rows) {
		const ranked: Ranked = rank(row.similarities, weights);

		if(ranked.best < 0) continue;

		inputs.push([ 1, ranked.topScore, ranked.margin, row.coverage ]);
		labels.push(row.answer >= 0 && ranked.best === row.answer ? 1 : 0);
	}

	if(inputs.length === 0) return profile;

	const learningRate: number = options.learningRate ?? 0.5;
	const l2: number = options.l2 ?? 1e-3;
	let theta: number[] = [ DEFAULT_CALIBRATOR.bias, DEFAULT_CALIBRATOR.score, DEFAULT_CALIBRATOR.margin, DEFAULT_CALIBRATOR.coverage ];

	for(let epoch: number = 0; epoch < (options.epochs ?? 3000); epoch++) {
		const gradient: number[] = [ 0, 0, 0, 0 ];

		for(let sample: number = 0; sample < inputs.length; sample++) {
			const logit: number = inputs[sample].reduce((sum: number, value: number, feature: number) => sum + value * theta[feature], 0);
			const error: number = sigmoid(logit) - labels[sample];

			for(let feature: number = 0; feature < 4; feature++) {
				gradient[feature] += error * inputs[sample][feature];
			}
		}

		theta = theta.map((value: number, feature: number) =>
			value - learningRate * (gradient[feature] / inputs.length + (feature > 0 ? l2 * value : 0))
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

// Lowest threshold whose auto-accept precision on the data reaches the target.
export function chooseTau(data: Sample[] | Prepared, profile: Profile, targetPrecision: number = 0.99): Profile {
	let tau: number = 1;

	for(const point of precisionCoverage(data, profile)) {
		if(point.precision >= targetPrecision) {
			tau = point.confidence;
		}
	}

	return {
		...profile,
		tau: tau
	};
}

// Choose the auto-accept threshold with a statistical guarantee on the silent-error rate (accepted
// and wrong, over all localizations), assuming calibration and future localizations are exchangeable.
// Returns the most permissive threshold that keeps the guarantee; 1.01 (accept nothing) if none does.
// Conformal risk control: Angelopoulos et al., "Conformal Risk Control" (2022); Learn-then-Test:
// Angelopoulos et al., "Learn then Test" (2021), with fixed-sequence testing (the risk is monotone).
export function chooseTauRiskControl(data: Sample[] | Prepared, profile: Profile, alpha: number, options: RiskControlOptions = {}): Profile {
	const prepared: Prepared = asPrepared(data, profile);
	const weights: number[] = weightsOf(profile);
	const points: ConfidencePoint[] = prepared.rows.map((row: PreparedRow) => {
		const ranked: Ranked = rank(row.similarities, weights);

		return {
			confidence: calibrate(profile.calibrator, ranked.topScore, ranked.margin, row.coverage),
			correct: row.answer >= 0 && ranked.best === row.answer
		};
	});
	const total: number = points.length;
	let tau: number = 1.01;
	let wrongAccepted: number = 0;

	points.sort((first: ConfidencePoint, second: ConfidencePoint) => second.confidence - first.confidence);

	for(let index: number = 0; index < total; index++) {
		if(!points[index].correct) {
			wrongAccepted++;
		}

		if(index + 1 < total && points[index + 1].confidence === points[index].confidence) continue;

		const holds: boolean = options.delta === undefined
			? (wrongAccepted + 1) / (total + 1) <= alpha
			: binomialUpperBound(wrongAccepted, total, options.delta) <= alpha;

		if(holds) {
			tau = points[index].confidence;
		} else if(options.delta !== undefined) {
			break;
		}
	}

	return {
		...profile,
		tau: tau
	};
}

// Forward-greedy allocation: repeatedly apply the increment (new feature, extra slot, extra bit)
// with the best accuracy gain per bit until `maxBits`. The trace is the accuracy-vs-length curve.
export function allocateBits(samples: Sample[], options: AllocationOptions = {}): AllocationStep[] {
	const maxBits: number = options.maxBits ?? 160;
	const version: number = options.version ?? 15;
	const patience: number = options.patience ?? 3;
	const baseProfile: (segments: SegmentSpec[]) => Profile = (segments: SegmentSpec[]) => ({
		version: version,
		name: `alloc-${segments.length}`,
		segments: finalizeSegments(segments),
		calibrator: {
			...DEFAULT_CALIBRATOR
		},
		tau: 0.9,
		floor: 0.35
	});
	const scoreProfile: (profile: Profile) => ScoredProfile = (profile: Profile) => {
		const prepared: Prepared = prepare(samples, profile);
		const fitted: Profile = options.refitWeights ? fitWeights(prepared, profile, {
			rounds: 1
		}) : profile;

		return {
			accuracy: evaluate(prepared, fitted).accuracy,
			profile: fitted
		};
	};
	const trace: AllocationStep[] = [];
	let segments: SegmentSpec[] = [];
	let currentAccuracy: number = 0;
	let stale: number = 0;

	while(true) {
		const bits: number = profileBits(baseProfile(segments));
		let bestStep: CandidateStep | null = null;

		for(const item of ALLOCATION_PLAN) {
			const index: number = segments.findIndex((segment: SegmentSpec) => segment.feature === item.feature && segment.kind === item.kind);
			const next: SegmentSpec | null = grow(item, index >= 0 ? segments[index] : undefined);

			if(!next) continue;

			const candidateSegments: SegmentSpec[] = segments.slice();

			if(index >= 0) {
				candidateSegments[index] = next;
			} else {
				candidateSegments.push(next);
			}

			const candidate: Profile = baseProfile(candidateSegments);

			if(profileBits(candidate) > maxBits) continue;

			const scored: ScoredProfile = scoreProfile(candidate);
			const gain: number = (scored.accuracy - currentAccuracy) / (profileBits(candidate) - bits);

			if(!bestStep || gain > bestStep.gain) {
				bestStep = {
					accuracy: scored.accuracy,
					profile: scored.profile,
					gain: gain,
					change: `${index >= 0 ? "grow" : "add"} ${item.feature}`
				};
			}
		}

		if(!bestStep) break;

		stale = bestStep.gain > 0 ? 0 : stale + 1;

		if(stale > patience) break;

		const stepBits: number = profileBits(bestStep.profile);

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

// Evaluate several profiles on the same samples (e.g. S, M, L for the accuracy-vs-length curve).
export function compareProfiles(samples: Sample[], profiles: Profile[], options: CompareOptions = {}): ProfileComparisonRow[] {
	return profiles.map((profile: Profile) => {
		const prepared: Prepared = prepare(samples, profile);
		const evaluated: Profile = options.fit ? fitWeights(prepared, profile) : profile;

		return {
			profile: profile.name,
			...evaluate(prepared, evaluated, options)
		};
	});
}

// Leave-one-group-out ablation: drop each Similo property group present in the profile and
// measure exact-match accuracy. Groups with delta near 0 are candidates for removal.
export function groupAblation(samples: Sample[], profile: Profile): AblationRow[] {
	const baseAccuracy: number = evaluate(samples, profile).accuracy;
	const groups: PropertyGroup[] = (Object.keys(PROPERTY_GROUPS) as PropertyGroup[]).filter((group: PropertyGroup) =>
		profile.segments.some((segment: SegmentSpec) => PROPERTY_GROUPS[group].indexOf(segment.feature) >= 0)
	);

	return groups
		.map((group: PropertyGroup) => {
			const ablated: Profile = withoutGroup(profile, group);
			const accuracy: number = evaluate(samples, ablated).accuracy;

			return {
				group: group,
				bitsSaved: profileBits(profile) - profileBits(ablated),
				accuracy: accuracy,
				delta: accuracy - baseAccuracy
			};
		})
		.sort((first: AblationRow, second: AblationRow) => first.delta - second.delta);
}