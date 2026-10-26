<h1 align="center">HashLoc</h1>

**HashLoc** is a stateless web element locator represenation compatible with [Similo](https://arxiv.org/abs/2208.00677) localisation.

##

### Example

<p align="center">UI v1</p>

``` html
<input id="email" type="email" placeholder="you@example.com">
```

<p align="center">↓ HashLoc <sub>(profile M)</sub> ↓</p>

``` console
AHVCYW0008RPTWTETQJPP5Q00000057JP
```

<p align="center">↓ UI v2 ↓</p>

``` html
<input id="nl-email" type="email" placeholder="you@example.com">
```

<p align="center"><code>resolveCode()</code></p>

``` ts
{
  status: "confident",
  confidence: 0.998,
  element: HTMLInputElement,
  candidates: []
}
```

##

### Integration

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

##

### Usage

``` ts
HashLoc.encodeElement(
  element: Element,
  options?: EncodeOptions     // profile: "S" | "M" | "L" (19 | 33 | 44 characters), page, DOM options
): string

HashLoc.resolveCode(
  code: string,
  options?: ResolveOptions    // tau, floor, topK, registry, document, page, DOM options
): {
  status: "confident" | "ambiguous" | "unconfident";
  element: Element | null;
  confidence: number;
  score: number;
  margin: number;
  candidates: { index: number; element: Element | null; score: number; }[];
  profile: string;
}

HashLoc.resolveAll(
  codes: string[],
  options?: ResolveAllOptions // one-to-one assignment: no two codes claim the same element
): ResolveResult[]
```

> Read the full [API Documentation](./DOCS.md).

##

### Experiments

#### Setup

> Requires Node.js 22 (and Python 3.10 or later for the evaluation).

``` console
npm install
```

#### Build

``` console
npm run build
```

#### Test

``` console
npm run test
```

```
npm run test:<SUITE>
node --test [--test-name-pattern="<TEST-TITLE>"] "test/<SUITE>/<FILE=*>.test.js"   # e.g., HashLoc.codes
```

| Suite | Note |
| :- | :- |
| `unit` | |
| `end-to-end` | _DOM release simulation, training and evaluation_ |
| `eval` | _Baseline ports vs Java/Scala reference (Python)_ |

> Tests use the built-in Node.js test runner (`node:test`) and run against `dist.lib`: build first.

#### Evaluate

> Place the [Kluge & Stocco benchmark](./eval/README.md) in `./dataset` (one folder per site), and build first: the evaluation runs `dist.lib` through a Node bridge (`eval/HashLoc.bridge.mjs`).

``` console
cd eval && pip install -r requirements.txt
```

##### Relocalization

``` console
npm run eval:all
```

``` console
npm run eval:<study>
```

> `<study>` ∈ { `accuracy`, `decomposition`, `drift`, `crossval`, `sketches`, `ablation` }

``` console
npm run eval -- --verbose --split 2 --modes 1,firstlast --profiles M
```

> Results go to `eval/results/<date>/<study>/`; re-create summaries with `npm run eval:_summarize -- <date>`.

##