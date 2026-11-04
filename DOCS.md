# HashLoc API

`HashLoc` is a typed JavaScript library for encoding web elements into short-code locators, and UI-change-tolerant loclisation based on these locators.

## Installation

#### Module

``` console
npm install webfuse-com/HashLoc
```

``` js
import * as HashLoc from "@webfuse-com/hashloc";
```

#### Browser

``` html
<script src="dist.browser/HashLoc.js"></script>
```

> The browser bundle exposes the API via the global `window.HashLoc`.

## Encoding Functions

### `encode()`

Encode a live DOM element.

``` ts
function encode(
  element: Element,
  options?: EncodeOptions
): string
```

#### Parameters

| Parameter | Description | Range |
| :-| :- | :- |
| `element` | Element to encode. Features are read from the element's document (layout via `getBoundingClientRect`). | `Element` |
| `options.profile` | Profile object, or the name of a registered profile. | `"S"`, `"M"`, `"L"`, `Profile`; default `"M"` |
| `options.page` | Reuse an index of the same document state (avoids a rescan). | `PageIndex` |
| `options.registry` | Registry to look up profile names in. | `ProfileRegistry`; default `defaultRegistry` |
| `options.*` | DOM scan options (see [DOM Utilities](#dom-utilities)). | `DomOptions` |

#### Return Value

The code: Crockford base32 (`0-9A-Z` without `I`, `L`, `O`, `U`), 19 (S), 33 (M) or 44 (L) characters including the check character.

#### Examples

``` ts
const code = encode(document.querySelector("#signup")); // profile M
const short = encode(document.querySelector("#signup"), { profile: "S" });

const page = PageIndex.fromDocument(document);  // scan once
const codes = [ "#q", "#email" ].map(selector => encode(document.querySelector(selector), { page }));
```

### `encodeFeatures()`

Encode element features (e.g., collected earlier with `DomScan`) into a code.

``` ts
function encodeFeatures(features: ElementFeatures, profile: Profile): string
```

### `decodeCode()`

Parse a code into its profile and segment values. Accepts lower case, hyphens and spaces, and maps `I`/`L` to `1` and `O` to `0`.

``` ts
function decodeCode(code: string, registry?: ProfileRegistry): {
  profile: Profile;
  values: number[][];
  code: string; // canonical form
}
```

> Throws `CodeError` for a wrong check character (every single-character typo is detected), an unknown version or a wrong length.

## Resolution Functions

### `resolve()`

Resolve a code on a live document.

``` ts
function resolve(
  code: string,
  options?: ResolveOptions & DomOptions & { document?: Document; page?: PageIndex; }
): ResolveResult
```

#### Parameters

| Parameter | Description | Range |
| :-| :- | :- |
| `code` | Code to resolve. | `string` |
| `options.tau` | Auto-accept threshold on the calibrated confidence. | `[0, 1]`; default: the profile's (`0.9`) |
| `options.floor` | Raw score below which the result is `unconfident`. | `[0, 1]`; default: the profile's (`0.35`) |
| `options.topK` | Candidates returned for review. | `N`; default `5` |
| `options.registry` | Registry that maps the code's version to a profile. | `ProfileRegistry`; default `defaultRegistry` |
| `options.lookup` | `"scan"` scores every element; `"buckets"` scores only elements that share an LSH bucket (a band of MinHash slots) with the code, without falling back to a scan. | `"scan"`, `"buckets"`; default `"scan"` |
| `options.bandSize` | Bucket lookup: MinHash slots per band; smaller bands make bigger buckets (more candidates, fewer misses). | `N`; default `2` |
| `options.idShortcut` | Take the only element whose ID segment equals the code's without scoring the page; falls back to `lookup` if the code has no ID, or none or several elements match. Profiles M and L. | `boolean`; default `false` |
| `options.document`, `options.page` | Document to scan (default: the global `document`), or an existing index. | `Document`, `PageIndex` |

#### Return Value

``` ts
type ResolveResult = {
  status: "confident" | "ambiguous" | "unconfident";
  element: Element | null;
  index: number;
  confidence: number;
  score: number;
  margin: number;
  candidates: { index: number; element: Element | null; score: number; }[];
  scored: number;
  profile: string;
}
```

| Property | Description |
| :-| :- |
| `status` | `confident`: confidence ≥ `tau`; `ambiguous`: review the shortlist; `unconfident`: score below `floor`, or no candidate. |
| `element` | The chosen element if confident, else `null`. |
| `index` | Index of the best candidate in the page index (`-1` if none). |
| `confidence` | Calibrated probability that the best candidate is the encoded element. |
| `score`, `margin` | Best raw score, and its lead over the runner-up. |
| `candidates` | Top-n candidates, best first. |
| `scored` | Elements scored: the whole page for a scan, the bucket matches for bucket lookup, `1` for an ID shortcut. |

### `resolveAll()`

Resolve several codes on one document jointly: a one-to-one assignment ensures no two codes claim the same element (`options.shortlist`: candidates per code considered, default `10`).

``` ts
function resolveAll(codes: string[], options?: ResolveAllOptions & DomOptions & { document?: Document; page?: PageIndex; }): ResolveResult[]
```

> `idShortcut` does not apply: the joint assignment always scores every code's candidates.

### `PageIndex`

Candidates of one page state with their features. Segment values are cached per profile, so many codes resolve against one scan.

``` ts
PageIndex.fromDocument(document?: Document, options?: DomOptions): PageIndex
new PageIndex(features: ElementFeatures[], elements?: (Element | null)[])

resolveIn(code: string, page: PageIndex, options?: ResolveOptions): ResolveResult
resolveAllIn(codes: string[], page: PageIndex, options?: ResolveAllOptions): ResolveResult[]
```

#### Weights

| Constant | Description |
| :-| :- |
| `DEFAULT_FEATURE_WEIGHTS` | Median optimised weights (defaults of all profiles). |
| `SIMILO_WEIGHTS` | Original Similo weights. |
| `SIMILO_PP_WEIGHTS` | Similo++ (Ext, M9) weights mapped onto HashLoc's segments (equal-weight comparisons). |
| `DEFAULT_CALIBRATOR` | Heuristic confidence calibrator; replace with `fitCalibrator()` output for unattended use. |
| `PROPERTY_GROUPS` | Similo property groups and the segment features that realise them. |

#### Helpers

``` ts
withFeatureWeights(profile, weights)                     // same layout, other weights
withoutGroup(profile, "Class")                           // ablation: drop one property group
withSketch(profile, "simhash", 1, version?)              // re-encode token sets with another sketch
codeLength(profile); profileBits(profile)                // characters; payload bits
new ProfileRegistry([ profile ]); defaultRegistry        // version → profile
```

## Sketches

Token-set properties are summarised by a sketch. The built-in profiles use b-bit MinHash; any profile can be re-encoded with another algorithm at the same payload (`withSketch()`), and new algorithms plug in by name:

``` ts
const myAlgorithm: SketchAlgorithm = {
  name: "my-sketch",
  encode: (input: SketchInput, segment: SketchSegment, seed: number) => [ /* segment.values integers */ ],
  similarity: (left: number[], right: number[], segment: SketchSegment) => 0 /* in [0, 1] */
};

registerSketch(myAlgorithm);

const profile = withSketch(PROFILE_M, "my-sketch", 4, 7);
```

| Sketch | Description |
| :-| :- |
| `minhash` | One-permutation b-bit MinHash with densification; chance-corrected Jaccard estimate. |
| `simhash` | Unweighted SimHash; estimated cosine `cos(π · hamming / bits)`. |

> `encode()` receives the token set and the normalised text, and must return exactly `segment.values` integers of `segment.bitsPerValue` bits. A sketch segment stores a presence bit before its values, so an absent feature never collides with a value, and every variant of a profile has the same length. Sketch names are part of the code format: an algorithm must not change behaviour once its codes are in use.

## Training and Evaluation

The shipped weights and calibrator are starting points. Fit them on samples of your own (`Sample`: the element's features on one version, all candidates' features on a later version, and the index of the true element or `-1`):

``` ts
const prepared = prepare(train, PROFILE_M);
let profile = fitWeights(prepared, PROFILE_M);
profile = fitCalibrator(prepared, profile);
profile = chooseTauRiskControl(prepared, profile, 0.001);   // E[silent-error rate] ≤ 0.1%

evaluate(test, profile);   // accuracy, coverage, precision, silent errors, recall@n, end-to-end
```

| Function | Description |
| :-| :- |
| `prepare()` | Cache weight-independent segment similarities of samples. |
| `fitWeights()` | Coordinate search on segment weights for top-1 accuracy. |
| `fitCalibrator()` | Fit the logistic confidence calibrator. |
| `chooseTau()` | Threshold for an empirical auto-accept precision. |
| `chooseTauRiskControl()` | Threshold with a statistical guarantee on the silent-error rate: conformal risk control (expected rate ≤ `alpha`), or with `delta` Learn-then-Test (rate ≤ `alpha` with probability ≥ 1 − `delta`). |
| `evaluate()`, `precisionCoverage()` | Decision metrics; precision–coverage curve. |
| `allocateBits()` | Greedy bit allocation: the accuracy-vs-length trace. |
| `compareProfiles()`, `groupAblation()` | Profiles side by side; leave-one-group-out ablation. |

> Collect samples with `new DomScan(document).allFeatures()`: features are plain JSON, so datasets can be re-encoded with new profiles.

## Uncompressed Reference and Error Bound

| Function | Description |
| :-| :- |
| `exactValues()`, `exactScore()` | Score uncompressed features with the same profile and weights: exact equality, exact Jaccard (cosine for SimHash), unquantised geometry. This is what a code approximates. |
| `pairTerms()` | Concentration terms of one code–candidate pair: effective MinHash slots K and the bias of hash collisions and bucket quantisation. |
| `topOneErrorBound()` | Upper bound on the probability that a code ranks a different element first than uncompressed scoring does (Hoeffding per candidate, union over competitors). |

## DOM Utilities

``` ts
new DomScan(document: Document, options?: DomOptions)   // .elements, .features(element), .allFeatures()
visibleText(element); absoluteXPath(element); idXPath(element); isButton(element)
```

| Option | Description | Default |
| :-| :- | :- |
| `root` | Subtree or shadow root to index. Inside a shadow root, XPaths are relative to the root. | `document.body` |
| `rectOf` | Layout override returning document coordinates (e.g., for jsdom). | `getBoundingClientRect()` |
| `includeHidden` | Keep elements without a visible box. | `false` |
| `filter` | Extra candidate filter. | |
| `neighborMargin` | Margin in pixels around an element for neighbour text. | `60` |
| `contextLevels` | Ancestor levels searched for enclosing-block text (separates look-alikes, e.g., repeated "Learn more" links). `0`: Similo's purely spatial neighbour text. | `0` |
| `pageWidth`, `viewportHeight` | Geometry normalisation. | from the document's window |

## Types

Types are provided for TypeScript usage:

``` ts
import type { ElementFeatures, Profile, ResolveResult } from "hashloc";
```

| Type | Description |
| :-| :- |
| `ElementFeatures` | Raw, JSON-serialisable element features (Similo++ property set). |
| `Profile`, `SegmentSpec` | Code layout: version, segments, weights, calibrator, thresholds. |
| `ResolveResult`, `ResolveStatus`, `RankedCandidate` | Result of `resolve()` and `resolveIn()`. |
| `EncodeOptions`, `ResolveOptions`, `ResolveAllOptions`, `DomOptions` | Options of the encoding, resolution and scanning functions. |
| `SketchAlgorithm`, `SketchInput`, `SketchSegment` | Sketch plug-in interface. |
| `Sample`, `Metrics`, `AllocationStep`, `AblationRow` | Training and evaluation. |
| `ExactValue`, `PairTerms` | Uncompressed reference and error bound. |

## Limitations

- **Default calibrator**: a hand-set heuristic, conservative on large changes; fit a calibrator and threshold before relying on `confident` results unattended.
- **Version gaps**: codes are compared with the original capture and never refreshed, so accuracy falls as the gap grows.
- **Icons**: elements without text or labels are hard to tell apart, as in Similo.
- **Layout (Node.js)**: geometry comes from `getBoundingClientRect()`; in non-rendering environments (jsdom), pass `rectOf`.