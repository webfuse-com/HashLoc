import assert from "node:assert/strict";
import { test } from "node:test";

import {
    chooseTauRiskControl,
    evaluate,
    exactScore,
    exactValues,
    fitCalibrator,
    PROFILE_L,
    PROFILE_M,
    PROFILE_S,
    scoreValues,
    segmentValues,
    SIMILO_PP_WEIGHTS,
    topOneErrorBound,
    withFeatureWeights
} from "../../dist.lib/api.js";
import { samples } from "../test.util.js";


const DATA = samples(150, 60, 1.0, 21);


function scaledSlots(profile, factor) {
    return {
        ...profile,
        name: `${profile.name}x${factor}`,
        segments: profile.segments.map(segment => (segment.kind === "minhash")
            ? {
                ...segment,
                slots: segment.slots * factor
            }
            : segment)
    };
}

function meanDeviation(profile) {
    let sum = 0;
    let count = 0;

    for(const sample of DATA.slice(0, 40)) {
        const code = segmentValues(sample.target, profile);
        const exact = exactValues(sample.target, profile);

        for(const candidate of sample.candidates) {
            sum += Math.abs(scoreValues(profile, code, segmentValues(candidate, profile)) - exactScore(profile, exact, exactValues(candidate, profile)));
            count++;
        }
    }

    return sum / count;
}

function argmax(scores) {
    return scores.reduce((best, score, index) => (score > scores[best]) ? index : best, 0);
}


test("Score an element with itself as 1 (uncompressed)", () => {
    for(const profile of [ PROFILE_S, PROFILE_M, PROFILE_L ]) {
        const values = exactValues(DATA[0].target, profile);

        assert.deepEqual(exactScore(profile, values, values), 1, `Invalid uncompressed self-score (profile ${profile.name})`);
    }
});

test("Converge compressed to uncompressed scores as sketches grow", () => {
    const deviations = [ 1, 4, 16 ].map(factor => meanDeviation(scaledSlots(PROFILE_M, factor)));

    assert.ok(deviations[0] > deviations[1], `Invalid convergence (1x vs 4x slots) (${deviations[0]} > ${deviations[1]})`);
    assert.ok(deviations[1] > deviations[2], `Invalid convergence (4x vs 16x slots) (${deviations[1]} > ${deviations[2]})`);
});

test("Bound the code's top-1 disagreement with uncompressed scoring", () => {
    let disagreements = 0;
    let boundSum = 0;

    for(const sample of DATA) {
        const code = segmentValues(sample.target, PROFILE_M);
        const exactCode = exactValues(sample.target, PROFILE_M);
        const exactCandidates = sample.candidates.map(candidate => exactValues(candidate, PROFILE_M));
        const exactScores = exactCandidates.map(values => exactScore(PROFILE_M, exactCode, values));
        const compressedScores = sample.candidates.map(candidate => scoreValues(PROFILE_M, code, segmentValues(candidate, PROFILE_M)));
        const reference = argmax(exactScores);

        if(argmax(compressedScores) !== reference) disagreements++;

        boundSum += topOneErrorBound(PROFILE_M, exactCode, exactCandidates, reference, exactScores);
    }

    assert.ok(disagreements / DATA.length < boundSum / DATA.length, `Invalid bound (observed disagreement exceeds bound) (${disagreements / DATA.length} < ${boundSum / DATA.length})`);
});

test("Keep held-out silent errors near alpha with risk control", () => {
    const train = samples(300, 60, 1.0, 31);
    const heldOut = samples(300, 60, 1.0, 32);
    const calibrated = fitCalibrator(train, PROFILE_M);
    const alpha = 0.02;
    const conformal = chooseTauRiskControl(train, calibrated, alpha);
    const highProbability = chooseTauRiskControl(train, calibrated, alpha, {
        delta: 0.1
    });

    assert.ok(evaluate(heldOut, conformal).silentErrorRate < alpha + 0.015, `Invalid risk control (held-out silent errors) (${evaluate(heldOut, conformal).silentErrorRate} < ${alpha + 0.015})`);
    assert.ok(highProbability.tau >= conformal.tau, "Invalid risk control (LTT less strict than CRC)");
});

test("Map Similo++ weights onto segments", () => {
    const mapped = withFeatureWeights(PROFILE_L, SIMILO_PP_WEIGHTS);
    const weightOf = feature => mapped.segments.find(segment => segment.feature === feature)?.weight ?? -1;

    assert.deepEqual(weightOf("x") + weightOf("y"), 1.2, "Invalid weight mapping (location)");
    assert.deepEqual(weightOf("classes"), 0, "Invalid weight mapping (class)");
    assert.deepEqual(weightOf("name"), 2.85, "Invalid weight mapping (name)");
});
