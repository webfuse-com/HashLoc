import assert from "node:assert/strict";
import { test } from "node:test";

import {
    allocateBits,
    chooseTau,
    compareProfiles,
    encodeFeatures,
    evaluate,
    fitCalibrator,
    fitWeights,
    groupAblation,
    PageIndex,
    precisionCoverage,
    prepare,
    PROFILE_L,
    PROFILE_M,
    PROFILE_S,
    resolveIn,
    withoutGroup
} from "../../dist.lib/api.js";
import { element, samples, seededRandom } from "../test.util.js";


const TRAIN = samples(300, 80, 1.0, 7);
const TEST = samples(300, 80, 1.0, 99);

const excludedKeys = profile => profile.segments.find(segment => segment.feature === "attributes")?.excludeKeys ?? [];


test("Fit weights and calibrate to the precision target", () => {
    const before = evaluate(TEST, PROFILE_M);
    const prepared = prepare(TRAIN, PROFILE_M);
    const calibrated = chooseTau(prepared, fitCalibrator(prepared, fitWeights(prepared, PROFILE_M)), 0.98);
    const after = evaluate(TEST, calibrated);

    assert.ok(after.accuracy > before.accuracy - 0.02, `Invalid fitted accuracy (${after.accuracy} > ${before.accuracy - 0.02})`);
    assert.ok(after.precision > 0.95, `Invalid calibrated precision (${after.precision} > ${0.95})`);
    assert.ok(after.coverage > 0.3, `Invalid calibrated coverage (${after.coverage} > ${0.3})`);
    assert.deepEqual(precisionCoverage(TEST, calibrated).length, TEST.length, "Invalid precision-coverage curve length");
});

test("Gain accuracy with longer codes and shorter gaps", () => {
    const shortGap = samples(200, 80, 0.5, 3);
    const longGap = samples(200, 80, 2.0, 3);

    for(const data of [ shortGap, longGap ]) {
        assert.ok(evaluate(data, PROFILE_M).accuracy > evaluate(data, PROFILE_S).accuracy - 0.03, `Invalid accuracy (M vs S) (${evaluate(data, PROFILE_M).accuracy} > ${evaluate(data, PROFILE_S).accuracy - 0.03})`);
    }

    assert.ok(evaluate(shortGap, PROFILE_M).accuracy > evaluate(longGap, PROFILE_M).accuracy, `Invalid accuracy (short vs long gap) (${evaluate(shortGap, PROFILE_M).accuracy} > ${evaluate(longGap, PROFILE_M).accuracy})`);
});

test("Trace accuracy vs length by greedy bit allocation", () => {
    const trace = allocateBits(samples(80, 60, 1.0, 5), {
        maxBits: 100
    });

    assert.ok(trace.length > 3, `Invalid allocation trace length (${trace.length} > ${3})`);
    assert.ok(trace.every(step => step.bits <= 100), "Invalid allocation (budget exceeded)");
    assert.ok(trace[trace.length - 1].accuracy > trace[0].accuracy, `Invalid allocation (no accuracy gain) (${trace[trace.length - 1].accuracy} > ${trace[0].accuracy})`);
});

test("Absorb dropped groups into the attribute map", () => {
    assert.deepEqual(excludedKeys(PROFILE_S), [ "aria-label", "name", "style", "type" ], "Invalid excluded keys (profile S)");
    assert.ok(excludedKeys(PROFILE_M).includes("href"), "Missing excluded key (profile M, href)");
    assert.ok(!excludedKeys(withoutGroup(PROFILE_M, "HRef")).includes("href"), "Invalid excluded key (HRef dropped)");
    assert.ok(excludedKeys(PROFILE_L).includes("class"), "Missing excluded key (profile L, class)");
});

test("Compare profiles and ablate property groups", () => {
    const data = samples(120, 60, 1.0, 11);

    assert.deepEqual(compareProfiles(data, [ PROFILE_S, PROFILE_M, PROFILE_L ]).map(row => row.chars), [ 19, 33, 44 ], "Invalid profile comparison");
    assert.deepEqual(groupAblation(data, PROFILE_L).length, 17, "Invalid ablation (group count)");
});

test("Resolve fast on a feature-only index of 5,000 elements", () => {
    const random = seededRandom(42);
    const features = Array.from({ length: 5000 }, () => element(random));
    const index = new PageIndex(features);

    index.valuesFor(PROFILE_M);

    const codes = features.slice(0, 50).map(item => encodeFeatures(item, PROFILE_M));
    const start = performance.now();

    for(const code of codes) resolveIn(code, index);

    assert.ok((performance.now() - start) / codes.length < 200, `Invalid resolution time (ms per code) (${(performance.now() - start) / codes.length} < ${200})`);
});