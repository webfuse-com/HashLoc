#!/usr/bin/env node


import { readFileSync } from "fs";
import { join, resolve } from "path";
import { createInterface } from "readline";
import { pathToFileURL } from "url";


// JSON-lines bridge between the Python evaluation and a built hashloc library (dist.lib).
// Every request is one line of JSON on stdin; every response one line on stdout.
//
//   { "op": "info" }
//   { "op": "profiles", "names": [ "S" ], "ablation": "L", "sketches": [ "simhash:1" ], "weightSets": [ "similopp" ] }
//   { "op": "register", "name": "L@fitted", "base": "L", "weights": { "name": 2.1 } }
//   { "op": "page", "key": "...", "features": [ ... ] }
//   { "op": "locate", "page": "...", "profile": "M", "targets": [ { "features": {}, "truth": 12 } ], "keep": 50, "exact": false }
//   { "op": "similarities", "page": "...", "profile": "M", "targets": [ ... ], "keep": 50 }
//   { "op": "drop", "key": "..." }


// The HashLoc checkout to evaluate (argument), by default this repository.
const HASHLOC_DIR = resolve(process.argv[2] ?? join(import.meta.dirname, ".."));

const {
    codeLength,
    decodeCode,
    encodeFeatures,
    exactScore,
    exactValues,
    PageIndex,
    profileBits,
    PROFILE_L,
    PROFILE_M,
    PROFILE_S,
    ProfileRegistry,
    PROPERTY_GROUPS,
    resolveIn,
    scoreValues,
    SIMILO_PP_WEIGHTS,
    similarityVector,
    topOneErrorBound,
    withFeatureWeights,
    withoutGroup,
    withSketch
} = await import(pathToFileURL(join(HASHLOC_DIR, "dist.lib", "api.js")).href);

const BASE_PROFILES = {
    S: PROFILE_S,
    M: PROFILE_M,
    L: PROFILE_L
};
const WEIGHT_SETS = {
    similopp: SIMILO_PP_WEIGHTS
};
const PACKAGE_JSON_PATH = join(HASHLOC_DIR, "package.json");

const pages = new Map();
const profiles = new Map();
const exactCache = new Map();


function register(profile, kind) {
    profiles.set(profile.name, {
        profile,
        registry: new ProfileRegistry([ profile ])
    });

    for(const key of Array.from(exactCache.keys())) {
        if(key.endsWith(`|${profile.name}`)) exactCache.delete(key);
    }

    return {
        name: profile.name,
        kind,
        version: profile.version,
        bits: profileBits(profile),
        chars: codeLength(profile),
        features: profile.segments.map(segment => segment.feature),
        weights: profile.segments.map(segment => segment.weight)
    };
}

function baseProfile(name) {
    const profile = BASE_PROFILES[name];

    if(!profile) throw new Error(`unknown profile '${name}'`);

    return profile;
}

function registerProfiles(names, ablation, sketches, weightSets) {
    const summaries = [];

    for(const name of names) {
        const profile = baseProfile(name);

        summaries.push(register(profile, "base"));

        for(const set of weightSets) {
            const weights = WEIGHT_SETS[set];

            if(!weights) throw new Error(`unknown weight set '${set}'`);

            summaries.push(register({
                ...withFeatureWeights(profile, weights),
                name: `${name}@${set}`
            }, "weights"));
        }

        for(const sketch of sketches) {
            const [ algorithm, bits ] = sketch.split(":");

            summaries.push(register(withSketch(profile, algorithm, Number(bits ?? "1")), "sketch"));
        }
    }

    if(ablation) {
        const base = baseProfile(ablation);

        for(const group of Object.keys(PROPERTY_GROUPS)) {
            const present = base.segments.some(segment => PROPERTY_GROUPS[group].includes(segment.feature));

            present && summaries.push(register(withoutGroup(base, group), "ablation"));
        }
    }

    return summaries;
}

function lookup(pageKey, profileName) {
    const page = pages.get(pageKey);
    const registered = profiles.get(profileName);

    if(!page) throw new Error(`unknown page '${pageKey}'`);
    if(!registered) throw new Error(`unknown profile '${profileName}'`);

    return [ page, registered ];
}

function exactPage(pageKey, page, profile) {
    const key = `${pageKey}|${profile.name}`;

    !exactCache.has(key)
        && exactCache.set(key, page.features.map(features => exactValues(features, profile)));

    return exactCache.get(key);
}

function locateCompressed(page, registered, target, keep, lookup) {
    const code = encodeFeatures(target.features, registered.profile);
    const result = resolveIn(code, page, {
        registry: registered.registry,
        topK: page.size,
        ...lookup
    });
    const kept = result.candidates.slice(0, keep);

    return {
        code,
        order: kept.map(candidate => candidate.index),
        scores: kept.map(candidate => candidate.score),
        rank: result.candidates.findIndex(candidate => candidate.index === target.truth) + 1,
        top1: result.candidates.length ? result.candidates[0].index : -1,
        scored: result.scored,
        pageSize: page.size,
        bound: null
    };
}

// Uncompressed scoring with the same profile and weights; also returns the top-1 error bound.
function locateExact(pageKey, page, registered, target, keep) {
    const profile = registered.profile;
    const candidates = exactPage(pageKey, page, profile);
    const codeValues = exactValues(target.features, profile);
    const scores = candidates.map(values => exactScore(profile, codeValues, values));
    const ranked = scores
        .map((score, index) => ({ score, index }))
        .sort((first, second) => (second.score - first.score) || (first.index - second.index));
    const top1 = ranked.length ? ranked[0].index : -1;
    const bound = (top1 >= 0) ? topOneErrorBound(profile, codeValues, candidates, top1, scores) : NaN;
    const kept = ranked.slice(0, keep);

    return {
        code: "",
        order: kept.map(item => item.index),
        scores: kept.map(item => item.score),
        rank: ranked.findIndex(item => item.index === target.truth) + 1,
        top1,
        scored: page.size,
        pageSize: page.size,
        bound: Number.isNaN(bound) ? null : bound
    };
}

function locate(pageKey, profileName, targets, keep, exact, lookupOptions) {
    const [ page, registered ] = lookup(pageKey, profileName);

    return targets.map(target => exact
        ? locateExact(pageKey, page, registered, target, keep)
        : locateCompressed(page, registered, target, keep, lookupOptions));
}

// Per-segment similarities of the top `keep` candidates (by the profile's score) plus the truth.
function similarities(pageKey, profileName, targets, keep) {
    const [ page, registered ] = lookup(pageKey, profileName);
    const candidates = page.valuesFor(registered.profile);

    return targets.map(target => {
        const code = decodeCode(encodeFeatures(target.features, registered.profile), registered.registry).values;
        const indices = candidates
            .map((values, index) => ({
                score: scoreValues(registered.profile, code, values),
                index
            }))
            .sort((first, second) => (second.score - first.score) || (first.index - second.index))
            .slice(0, keep)
            .map(item => item.index);

        (target.truth >= 0 && !indices.includes(target.truth))
            && indices.push(target.truth);

        return {
            indices,
            truth: indices.indexOf(target.truth),
            similarities: indices.map(index => similarityVector(registered.profile, code, candidates[index]))
        };
    });
}

function handle(request) {
    switch(request.op) {
        case "info":
            return {
                version: JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8")).version
            };
        case "profiles":
            return registerProfiles(request.names ?? [], request.ablation, request.sketches ?? [], request.weightSets ?? []);
        case "register":
            return register({
                ...withFeatureWeights(baseProfile(request.base ?? ""), request.weights ?? {}),
                name: request.name ?? ""
            }, "weights");
        case "page":
            pages.set(request.key ?? "", new PageIndex(request.features ?? []));

            return pages.get(request.key ?? "")?.size ?? 0;
        case "locate":
            return locate(request.page ?? "", request.profile ?? "", request.targets ?? [], request.keep ?? 50, request.exact ?? false,
                request.lookup ? { lookup: request.lookup, bandSize: request.bandSize } : {});
        case "similarities":
            return similarities(request.page ?? "", request.profile ?? "", request.targets ?? [], request.keep ?? 50);
        case "drop":
            pages.delete(request.key ?? "");

            for(const key of Array.from(exactCache.keys())) {
                if(key.startsWith(`${request.key ?? ""}|`)) exactCache.delete(key);
            }

            return true;
        default:
            throw new Error(`unknown op '${request.op}'`);
    }
}


createInterface({
    input: process.stdin,
    crlfDelay: Infinity
})
    .on("line", line => {
        let response;

        try {
            response = {
                ok: true,
                result: handle(JSON.parse(line))
            };
        } catch(err) {
            process.stderr.write(`[HashLoc.bridge] ${err?.stack || err?.message}\n`);

            response = {
                ok: false,
                error: err.message
            };
        }

        process.stdout.write(`${JSON.stringify(response)}\n`);
    });
