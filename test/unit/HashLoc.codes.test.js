import assert from "node:assert/strict";
import { test } from "node:test";

import {
    canonicalize,
    CodeError,
    codeLength,
    decodeCode,
    encode,
    PageIndex,
    PROFILE_L,
    PROFILE_M,
    PROFILE_S
} from "../../dist.lib/api.js";
import { page, V1 } from "../test.util.js";


const VERSION_1 = page(V1);
const INDEX_1 = PageIndex.fromDocument(VERSION_1.document, VERSION_1.options);
const PROFILES = [ PROFILE_S, PROFILE_M, PROFILE_L ];

const onVersion1 = selector => VERSION_1.document.querySelector(selector);


test("Encode deterministically with the documented lengths", () => {
    for(const profile of PROFILES) {
        const fromIndex = encode(onVersion1("#signup"), {
            page: INDEX_1,
            profile
        });
        const fromFreshScan = encode(onVersion1("#signup"), {
            ...VERSION_1.options,
            profile
        });

        assert.deepEqual(fromIndex, fromFreshScan, `Invalid code (non-deterministic; profile ${profile.name})`);
        assert.deepEqual(fromIndex.length, codeLength(profile), `Invalid code length (profile ${profile.name})`);
        assert.ok(/^[0-9A-HJKMNP-TV-Z]+$/.test(fromIndex), `Invalid code alphabet (profile ${profile.name})`);
    }

    assert.deepEqual(PROFILES.map(profile => codeLength(profile)), [ 19, 33, 44 ], "Invalid profile code lengths");
});

test("Detect typos by check character, tolerate case and hyphens", () => {
    const code = encode(onVersion1("#q"), {
        page: INDEX_1
    });
    const pretty = code.toLowerCase().replace(/(.{5})/g, "$1-");

    assert.deepEqual(canonicalize(pretty), code, "Invalid canonicalization (case, hyphens)");
    assert.ok(!!decodeCode(pretty), "Invalid decoding (canonicalized code)");

    for(let position = 0; position < code.length; position++) {
        const replacement = (code[position] === "7") ? "8" : "7";
        const corrupted = code.slice(0, position) + replacement + code.slice(position + 1);

        assert.throws(() => decodeCode(corrupted), Error, `Invalid decoding (substitution at ${position} not detected)`);
    }
});

test("Reject malformed codes", () => {
    assert.throws(() => decodeCode("U"), Error, "Invalid decoding (too short)");
    assert.throws(() => decodeCode("ZZZZZZ"), CodeError, "Invalid decoding (bad check character)");
});