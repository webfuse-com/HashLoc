// Spatial weight share rho per localisation, from the library's own segment encoding.
// Usage (from ids/, after npm run build):  node eval/rho/rho.mjs eval/rho/pairs.jsonl
import { readFileSync } from "node:fs";
import { DEFAULT_FEATURE_WEIGHTS, PROFILE_L, SIMILO_PP_WEIGHTS, segmentValues, withFeatureWeights } from "../../dist.lib/api.js";

const SPATIAL = new Set([ "x", "y", "area", "shape" ]);
const SPATIAL_WITH_NEIGHBOUR = new Set([ ...SPATIAL, "neighborText" ]);

// A segment is empty when all its values are 0, exactly as the scoring decides (HashLoc.score.ts).
const empty = values => values.every(value => value === 0);

// Active segments: "either" = present on at least one side (the implemented scoring: a segment is
// skipped only if absent on both sides); "both" = present on both sides (the alternative definition).
function rho(profile, oldValues, newValues, spatial, activity) {
	let total = 0;
	let share = 0;

	profile.segments.forEach((segment, index) => {
		const oldPresent = !empty(oldValues[index]);
		const newPresent = !empty(newValues[index]);
		const active = activity === "either" ? oldPresent || newPresent : oldPresent && newPresent;

		if(!active) return;

		total += segment.weight;

		if(spatial.has(segment.feature)) share += segment.weight;
	});

	return total > 0 ? share / total : NaN;
}

function quantile(sorted, q) {
	const position = (sorted.length - 1) * q;
	const low = Math.floor(position);
	const high = Math.ceil(position);

	return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

function stats(values) {
	const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
	const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;

	return {
		n: sorted.length,
		median: quantile(sorted, 0.5),
		mean: mean,
		p90: quantile(sorted, 0.9),
		p95: quantile(sorted, 0.95),
		p99: quantile(sorted, 0.99),
		max: sorted[sorted.length - 1],
		atLeastHalf: sorted.filter(value => value >= 0.5).length / sorted.length
	};
}

const lines = readFileSync(process.argv[2], "utf-8").split("\n").filter(line => line.length > 0);
const pairs = lines.map(line => JSON.parse(line));
const profiles = {
	"Similo++": withFeatureWeights(PROFILE_L, SIMILO_PP_WEIGHTS),
	"default": withFeatureWeights(PROFILE_L, DEFAULT_FEATURE_WEIGHTS)
};

// Sanity: the evaluation uses this same vector for its "similopp" weight set (eval/HashLoc.bridge.mjs maps similopp to SIMILO_PP_WEIGHTS).
profiles["Similo++"].segments.forEach(segment => {
	if(segment.weight !== SIMILO_PP_WEIGHTS[segment.feature]) throw new Error(`weight mismatch for ${segment.feature}`);
});

const fmt = value => Number.isFinite(value) ? value.toFixed(4) : "n/a";

for(const [ weightsName, profile ] of Object.entries(profiles)) {
	const encoded = pairs.map(pair => ({
		gap: pair.gap,
		oldValues: segmentValues(pair.old, profile),
		newValues: segmentValues(pair.new, profile)
	}));

	for(const activity of [ "either", "both" ]) {
		for(const [ variant, spatial ] of [ [ "x,y,area,shape", SPATIAL ], [ "+ neighbour text", SPATIAL_WITH_NEIGHBOUR ] ]) {
			console.log(`\n== weights ${weightsName}; active = present on ${activity} side(s); spatial = ${variant}`);
			console.log("subset        n      median  mean    p90     p95     p99     max     share rho>=0.5");

			for(const gap of [ "all", "gap1", "firstlast" ]) {
				const subset = encoded.filter(pair => gap === "all" || pair.gap === gap);
				const values = subset.map(pair => rho(profile, pair.oldValues, pair.newValues, spatial, activity));
				const s = stats(values);

				console.log(`${gap.padEnd(12)} ${String(s.n).padStart(6)}  ${fmt(s.median)}  ${fmt(s.mean)}  ${fmt(s.p90)}  ${fmt(s.p95)}  ${fmt(s.p99)}  ${fmt(s.max)}  ${fmt(s.atLeastHalf)}`);
			}
		}
	}

	// Top decile by rho (implemented activity, spatial incl. neighbour text): which segments are inactive most often.
	const scored = encoded.map(pair => ({ ...pair, rho: rho(profile, pair.oldValues, pair.newValues, SPATIAL_WITH_NEIGHBOUR, "either") }))
		.filter(pair => Number.isFinite(pair.rho))
		.sort((a, b) => b.rho - a.rho);
	const top = scored.slice(0, Math.max(1, Math.ceil(scored.length / 10)));
	const inactive = profile.segments.map((segment, index) => ({
		feature: segment.feature,
		weight: segment.weight,
		topShare: top.filter(pair => empty(pair.oldValues[index]) && empty(pair.newValues[index])).length / top.length,
		allShare: scored.filter(pair => empty(pair.oldValues[index]) && empty(pair.newValues[index])).length / scored.length
	})).sort((a, b) => b.topShare - a.topShare);

	console.log(`\n== weights ${weightsName}: segments inactive (absent on both sides) in the top rho decile (n=${top.length}; rho >= ${fmt(top[top.length - 1].rho)}), vs all pairs`);
	console.log("segment        weight  inactive in top decile  inactive overall");

	for(const row of inactive) {
		console.log(`${row.feature.padEnd(13)}  ${row.weight.toFixed(3).padStart(6)}  ${fmt(row.topShare).padStart(22)}  ${fmt(row.allShare).padStart(16)}`);
	}
}
