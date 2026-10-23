import assert from "node:assert/strict";
import { test } from "node:test";

import {
    codeLength,
    decodeCode,
    encodeElement,
    getSketch,
    PageIndex,
    PROFILE_M,
    ProfileRegistry,
    registerSketch,
    resolveCode,
    SIMHASH_SKETCH,
    sketchNames,
    withSketch
} from "../../dist.lib/api.js";
import { page, V1 } from "../test.util.js";


const VARIANTS = [ [ "minhash", 4 ], [ "minhash", 2 ], [ "minhash", 1 ], [ "simhash", 1 ] ];
const VERSION_1 = page(V1);
const INDEX_1 = PageIndex.fromDocument(VERSION_1.document, VERSION_1.options);

const onVersion1 = selector => VERSION_1.document.querySelector(selector);

// Toy plug-in: the first `values` characters of the normalized text, one value each.
const PREFIX_SKETCH = {
    name: "prefix",
    encode: (input, segment) => Array.from({ length: segment.values }, (_, position) =>
        (position < input.text.length) ? input.text.charCodeAt(position) % 2 ** segment.bitsPerValue : 0
    ),
    similarity: (left, right) => {
        let equal = 0;

        while(equal < left.length && left[equal] === right[equal]) equal++;

        return equal / left.length;
    }
};


test("Register built-in sketches", () => {
    assert.ok(sketchNames().includes("minhash"), "Missing built-in sketch ('minhash')");
    assert.ok(sketchNames().includes("simhash"), "Missing built-in sketch ('simhash')");
    assert.throws(() => getSketch("nope"), Error, "Invalid lookup (unknown sketch)");
});

test("Compute SimHash similarity", () => {
    const segment = {
        kind: "sketch",
        feature: "text",
        algorithm: "simhash",
        values: 64,
        bitsPerValue: 1,
        tokenizer: "char3",
        weight: 1
    };
    const encode = tokens => SIMHASH_SKETCH.encode({
        tokens: new Set(tokens),
        text: tokens.join(" ")
    }, segment, 7);
    const signUp = encode([ "sig", "ign", "gn ", "n u", " up" ]);
    const signUpFree = encode([ "sig", "ign", "gn ", "n u", " up", "up ", "p f", " fr", "fre", "ree" ]);
    const search = encode([ "sea", "ear", "arc", "rch" ]);

    assert.deepEqual(SIMHASH_SKETCH.similarity(signUp, signUp, segment), 1, "Invalid similarity (identical sets)");
    assert.ok(SIMHASH_SKETCH.similarity(signUp, signUpFree, segment) > SIMHASH_SKETCH.similarity(signUp, search, segment), `Invalid similarity (overlapping vs unrelated sets) (${SIMHASH_SKETCH.similarity(signUp, signUpFree, segment)} > ${SIMHASH_SKETCH.similarity(signUp, search, segment)})`);
});

test("Keep code length and decoding across sketch variants", () => {
    const lengths = VARIANTS.map(([ algorithm, bits ]) => codeLength(withSketch(PROFILE_M, algorithm, bits)));

    assert.deepEqual(new Set(lengths).size, 1, "Invalid code lengths (variants differ)");

    for(const [ algorithm, bits ] of VARIANTS) {
        const variant = withSketch(PROFILE_M, algorithm, bits, 9);
        const code = encodeElement(onVersion1("#signup"), {
            page: INDEX_1,
            profile: variant
        });

        assert.deepEqual(decodeCode(code, new ProfileRegistry([ variant ])).profile.name, `M+${algorithm}-b${bits}`, "Invalid decoded profile");
    }
});

test("Plug in a custom sketch", () => {
    registerSketch(PREFIX_SKETCH);

    const custom = withSketch(PROFILE_M, "prefix", 5, 10);
    const code = encodeElement(onVersion1("#email"), {
        page: INDEX_1,
        profile: custom
    });
    const result = resolveCode(code, {
        page: INDEX_1,
        registry: new ProfileRegistry([ custom ]),
        tau: 0
    });

    assert.equal(result.candidates[0].element, onVersion1("#email"), "Invalid resolution (custom sketch)");
    assert.throws(() => registerSketch({
        ...PREFIX_SKETCH,
        name: "Bad Name"
    }), RangeError, "Invalid registration (bad name accepted)");
});
