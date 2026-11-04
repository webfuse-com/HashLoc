import assert from "node:assert/strict";
import { test } from "node:test";

import {
    absoluteXPath,
    DomScan,
    encode,
    idXPath,
    PageIndex,
    PROFILE_L,
    PROFILE_M,
    PROFILE_S,
    resolveAll,
    resolve
} from "../../dist.lib/api.js";
import { page, V1, V2 } from "../test.util.js";


const PROFILES = [ PROFILE_S, PROFILE_M, PROFILE_L ];
const VERSION_1 = page(V1);
const VERSION_2 = page(V2);
const INDEX_1 = PageIndex.fromDocument(VERSION_1.document, VERSION_1.options);
const INDEX_2 = PageIndex.fromDocument(VERSION_2.document, VERSION_2.options);
const LOOKALIKES = [ "a[href=\"/p/trail\"]", "a[href=\"/p/city\"]" ];

const onVersion1 = selector => VERSION_1.document.querySelector(selector);
const onVersion2 = selector => VERSION_2.document.querySelector(selector);

// Element on version 1 -> the element it became on version 2 (the Road Racer card was removed).
const CASES = [
    [ "#q", "input[type=\"search\"]" ],
    [ "#login-link", "a.nav-link" ],
    [ "#signup", "button" ],
    [ "#email", "input[type=\"email\"]" ],
    [ "input[type=\"submit\"]", "input[type=\"submit\"]" ],
    [ "a[href=\"/p/trail\"]", "a[href=\"/p/trail-3\"]" ],
    [ "a[href=\"/p/city\"]", "a[href=\"/p/city\"]" ],
    [ "#logo img", "img" ]
];


test("Relocate on the same page (distinct elements resolved confidently)", () => {
    for(const profile of PROFILES) {
        for(const [ selector ] of CASES) {
            const code = encode(onVersion1(selector), {
                page: INDEX_1,
                profile
            });
            const result = resolve(code, {
                page: INDEX_1
            });

            assert.equal(result.candidates[0].element, onVersion1(selector), `Invalid top-1 (${profile.name}, ${selector})`);
            !LOOKALIKES.includes(selector)
                && assert.deepEqual(result.status, "confident", `Invalid status (${profile.name}, ${selector})`);
        }
    }
});

test("Separate look-alike links by enclosing-block context", () => {
    const contextIndex = PageIndex.fromDocument(VERSION_1.document, {
        ...VERSION_1.options,
        contextLevels: 3
    });

    for(const selector of LOOKALIKES) {
        const plain = resolve(encode(onVersion1(selector), {
            page: INDEX_1
        }), {
            page: INDEX_1
        });
        const withContext = resolve(encode(onVersion1(selector), {
            page: contextIndex
        }), {
            page: contextIndex
        });

        assert.ok(withContext.margin > plain.margin, `Invalid margin (context; ${selector})`);
    }
});

test("Relocate across the release (top-1, all profiles)", () => {
    for(const profile of PROFILES) {
        const hits = CASES.filter(([ before, after ]) => {
            const code = encode(onVersion1(before), {
                page: INDEX_1,
                profile
            });

            return resolve(code, {
                page: INDEX_2,
                tau: 0
            }).candidates[0]?.element === onVersion2(after);
        }).length;

        assert.ok(hits > CASES.length - 2, `Invalid relocation count (${profile.name}: ${hits}/${CASES.length})`);
    }
});

test("Do not auto-accept a removed element", () => {
    const code = encode(onVersion1("a[href=\"/p/road\"]"), {
        page: INDEX_1
    });
    const result = resolve(code, {
        page: INDEX_2
    });

    assert.notDeepEqual(result.status, "confident", "Invalid status (removed element resolved confidently)");
    assert.ok(result.candidates.length > 0, `Missing shortlist (${result.candidates.length} > ${0})`);
});

test("Assign distinct elements to look-alikes jointly", () => {
    const codes = LOOKALIKES.map(selector => encode(onVersion1(selector), {
        page: INDEX_1
    }));
    const results = resolveAll(codes, {
        page: INDEX_2,
        tau: 0
    });

    assert.notDeepEqual(results[0].index, results[1].index, "Invalid joint assignment (same element)");
    assert.equal(INDEX_2.elements[results[0].index], onVersion2("a[href=\"/p/trail-3\"]"), "Invalid joint assignment (trail)");
    assert.equal(INDEX_2.elements[results[1].index], onVersion2("a[href=\"/p/city\"]"), "Invalid joint assignment (city)");
});

test("Find elements by bucket lookup while scoring only part of the page", () => {
    for(const selector of [ "#email", "#signup", "#q" ]) {
        const code = encode(onVersion1(selector), {
            page: INDEX_1,
            profile: PROFILE_L
        });
        const scan = resolve(code, {
            page: INDEX_1
        });
        const buckets = resolve(code, {
            page: INDEX_1,
            lookup: "buckets",
            bandSize: 2
        });

        assert.equal(scan.scored, INDEX_1.size, `Invalid scan (scored ${scan.scored} of ${INDEX_1.size}; ${selector})`);
        assert.equal(buckets.candidates[0].element, onVersion1(selector), `Invalid bucket lookup (${selector})`);
        assert.ok(buckets.scored < INDEX_1.size, `Invalid bucket lookup (scored ${buckets.scored} of ${INDEX_1.size}; ${selector})`);
    }
});

test("Compute XPaths once per scan, identical to the standalone functions", () => {
    const items = Array.from({ length: 300 }, (_, i) => `<li><a href="/p/${i}" data-xywh="${(i % 30) * 30},${Math.floor(i / 30) * 20},28,18">Item ${i}</a></li>`).join("");
    const wide = page(`<main id="m"><ul>${items}</ul><div><span data-xywh="1,900,3,3">x</span><span id="k" data-xywh="9,900,3,3">y<b data-xywh="9,900,2,2">z</b></span></div></main>`);

    for(const version of [ VERSION_1, wide ]) {
        const scan = new DomScan(version.document, version.options);

        for(const element of version.document.querySelectorAll("*")) {
            const features = scan.features(element);

            assert.equal(features.xpath, absoluteXPath(element), "Invalid absolute XPath");
            assert.equal(features.idXpath, idXPath(element), "Invalid ID-XPath");
            assert.equal(JSON.parse(JSON.stringify(features)).xpath, features.xpath, "Invalid serialized XPath");
        }
    }
});

test("Short-circuit on a unique ID and fall back otherwise", () => {
    const code = encode(onVersion1("#email"), {
        page: INDEX_1,
        profile: PROFILE_L
    });
    const same = resolve(code, {
        page: INDEX_1,
        idShortcut: true
    });
    const changed = resolve(code, {
        page: INDEX_2,
        idShortcut: true,
        tau: 0
    });
    const withoutId = resolve(encode(onVersion1("#email"), {
        page: INDEX_1,
        profile: PROFILE_S
    }), {
        page: INDEX_1,
        idShortcut: true
    });

    assert.equal(same.scored, 1, `Invalid shortcut (scored ${same.scored} of ${INDEX_1.size})`);
    assert.equal(same.element, onVersion1("#email"), "Invalid shortcut (element)");
    assert.deepEqual(same.status, "confident", "Invalid shortcut (status)");
    assert.equal(changed.scored, INDEX_2.size, `Invalid fallback (ID changed; scored ${changed.scored} of ${INDEX_2.size})`);
    assert.equal(changed.candidates[0].element, onVersion2("input[type=\"email\"]"), "Invalid fallback (ID changed; element)");
    assert.equal(withoutId.scored, INDEX_1.size, `Invalid fallback (profile S; scored ${withoutId.scored} of ${INDEX_1.size})`);

    const duplicate = page(`<main><input id="mail" placeholder="Work" data-xywh="10,10,200,30"><input id="mail" placeholder="Home" data-xywh="10,60,200,30"></main>`);
    const duplicateIndex = PageIndex.fromDocument(duplicate.document, duplicate.options);
    const duplicateResult = resolve(encode(duplicate.document.querySelectorAll("#mail")[1], {
        page: duplicateIndex,
        profile: PROFILE_L
    }), {
        page: duplicateIndex,
        idShortcut: true
    });

    assert.equal(duplicateResult.scored, duplicateIndex.size, `Invalid fallback (duplicate ID; scored ${duplicateResult.scored} of ${duplicateIndex.size})`);

    const before = page(`<main><input id="q" type="search" placeholder="Search products" data-xywh="40,20,400,36"><a href="/cart" data-xywh="900,20,80,36">Cart</a></main>`);
    const after = page(`<main><button id="q" data-xywh="40,600,120,40">Subscribe to newsletter</button><a href="/cart" data-xywh="900,20,80,36">Cart</a></main>`);
    const reused = resolve(encode(before.document.querySelector("#q"), {
        page: PageIndex.fromDocument(before.document, before.options),
        profile: PROFILE_L
    }), {
        page: PageIndex.fromDocument(after.document, after.options),
        idShortcut: true
    });

    assert.notDeepEqual(reused.status, "confident", "Invalid status (reused ID resolved confidently)");
});