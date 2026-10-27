import assert from "node:assert/strict";
import { test } from "node:test";

import {
    encode,
    PageIndex,
    PROFILE_M,
    ProfileRegistry,
    resolve,
    withSketch
} from "../../dist.lib/api.js";
import { page, V1, V2 } from "../test.util.js";


const VARIANTS = [ [ "minhash", 4 ], [ "minhash", 2 ], [ "minhash", 1 ], [ "simhash", 1 ] ];
const VERSION_1 = page(V1);
const VERSION_2 = page(V2);
const INDEX_1 = PageIndex.fromDocument(VERSION_1.document, VERSION_1.options);
const INDEX_2 = PageIndex.fromDocument(VERSION_2.document, VERSION_2.options);
const CASES = [
    [ "#q", "input[type=\"search\"]" ],
    [ "#signup", "button" ],
    [ "#email", "input[type=\"email\"]" ],
    [ "input[type=\"submit\"]", "input[type=\"submit\"]" ],
    [ "#logo img", "img" ]
];


test("Relocate across the release with every sketch variant", () => {
    for(const [ algorithm, bits ] of VARIANTS) {
        const variant = withSketch(PROFILE_M, algorithm, bits, 9);
        const registry = new ProfileRegistry([ variant ]);
        const hits = CASES.filter(([ before, after ]) => {
            const code = encode(VERSION_1.document.querySelector(before), {
                page: INDEX_1,
                profile: variant
            });

            return (
                resolve(code, {
                    page: INDEX_2,
                    registry,
                    tau: 0
                })
                    .candidates[0]
                    .element
                ) === VERSION_2.document.querySelector(after);
        }).length;

        assert.ok(hits > CASES.length - 2, `Invalid relocation count (M+${algorithm}-b${bits}: ${hits}/${CASES.length})`);
    }
});