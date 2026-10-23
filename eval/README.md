## Evaluation

Reproduces every table and figure of the paper on the [Kluge & Stocco benchmark](https://github.com/ast-fortiss-tum/web-element-localization-using-similo-like-approaches) (30 websites, 16 versions each; place it in `./dataset`). The baselines are exact ports of the released Scala/Java code. Build the library first: the evaluation runs `dist.lib` through a Node bridge (`HashLoc.bridge.mjs`).

``` console
npm run eval:all
```

| Paper | Command | `summary.json` → `modes.<mode>.<key>` |
| :- | :- | :- |
| Table 6.1, Appendix A | `npm run eval:accuracy` | `metrics`, `stored_size`, `replication` (`gap1`, `firstlast`) |
| Table 6.2 | `npm run eval:decomposition` | `decomposition` (`gap1`, `firstlast`) |
| Section 6.3: five-year accuracy, margin table | `npm run eval:decomposition` | `metrics`, `margin_analysis` (`firstlast`) |
| Figure 1 | `npm run eval:drift` | `accuracy_vs_gap.png` |
| Section 6.4 | `npm run eval:crossval` | `metrics` (`gap1`) |
| Section 6.5: sketches | `npm run eval:sketches` | `sketches` (`gap1`, `firstlast`) |
| Section 6.5: properties | `npm run eval:ablation` | `ablation` (`gap1`, `firstlast`) |
| Bucket lookup (separate study, not in the paper yet) | `npm run eval:buckets` | `lookup` (`gap1`, `firstlast`) |

Results go to `eval/results/<date>/<study>/`; re-create summaries with:

``` console
npm run eval:_summarize -- <results-date>
```

#### Options

| Name | Description | Range | Default |
| :- | :- | :- | :- |
| `--modes` | Version gaps in steps of 4 months, ranges, or first vs last version. | `<gap>[,…]`, e.g. `1,3,6,9,12,firstlast` | `1` |
| `--methods` | Baselines. | `all`, `none`, or `similo,von_similo,similo_pp,similo_pp_min,von_similo_pp,hybrid,tag_text,idxpath,xpath,id` | `all` |
| `--profiles` | HashLoc profiles. | `S,M,L` subset | `S,M,L` |
| `--ablation` | Also run each profile minus one property group. | `S`, `M`, `L` | |
| `--sketches` | Also run every profile with these sketch algorithms at equal length. | `<algorithm>:<bitsPerValue>[,…]` | |
| `--weights` | HashLoc weight sets: library defaults, Similo++ weights, leave-one-site-out fitted. | `default,similopp,fitted` subset | `default` |
| `--uncompressed` | Also score uncompressed features with the same weights (decomposition, margin analysis). | | |
| `--lookup` | Also run each profile with bucket lookup: only elements sharing a MinHash band with the code are scored (smaller bands, bigger buckets). | `buckets:<slots per band>[,…]` | |
| `--fit-keep` | Candidates per localization kept for weight fitting. | `<N>` | `20` |
| `--sites` | Site subset by name. | `<site>[,…]` | |
| `--crossval` | Use the `zz_*` cross-validation sites. | | |
| `--name` | Results subdirectory. | `<name>` | `main` |
| `--out` | Results directory (overrides date and name). | `<path>` | `eval/results/<date>/<name>` |
| `--split` | Delineate site subset. | `<size>[,<offset>]` | `∞,0` |
| `--workers` | Define worker pool size. | `<N>` | `8` |
| `--verbose` | Print progress details. | | |
| `--dataset` | Benchmark location (one folder per site). | `<path>` | `./dataset` |
| `--hashloc` | HashLoc checkout to evaluate (built `dist.lib`). | `<path>` | `.` |

#### Results

| File | Description |
| :- | :- |
| `localizations.csv.gz` | One row per method and localization: rank of the target, metric flags, fitness, top-two scores; for baselines the stored record size (`stored_bytes`, `stored_deflate`) and the shortest unique selector of the old element (`selector_bytes`); for HashLoc the code length, the code and (uncompressed runs) the bound. |
| `summary.json` | Per mode (`modes.gap1`, `modes.firstlast`, …): `metrics`, `stored_size`, `replication` (against the paper's Table 5), `decomposition`, `margin_analysis`, `sketches`, `ablation`, as far as the run produces them; `figures` lists the PNG files. `stored_size` also reports the shortest unique CSS selector or XPath per element, checked for uniqueness against the page's recorded elements (a lower bound). |
| `*.png` | Accuracy vs code length; accuracy vs version gap (runs with several modes). |
| `fitted_weights.json` | Leave-one-site-out weights (decomposition only). |

Localizations whose target was removed are excluded, as in the paper.

#### Metrics

| Name | Meaning | Kluge & Stocco |
| :- | :- | :- |
| `exact_match` | First result is the target (primary) | M4 |
| `exact_match_broken` | Exact match on pairs where all unique locators (ID, XPath, ID-XPath) broke | M5 |
| `top10` | Target among the top ten results | M8 |
| `parent_child` | First result is the target or its direct DOM parent or child | M1 |
| `visual_textual_overlap` | First result is the target or overlaps it visually or textually | M3 |
| `visual_overlap` | First result is the target or overlaps it visually | M7 |
| `fitness` | Hits weighted by change difficulty (exact 4, visual overlap 1, times a per-class score) | M9 |

`exact_match`, `exact_match_broken`, `top10`, `visual_overlap` and `fitness` are ported from the released code; `parent_child` and `visual_textual_overlap` follow the paper's text, which the code does not implement. `broken_pairs` counts the pairs behind `exact_match_broken`.

#### Baselines

| Key | Name | Ported from |
| :- | :- | :- |
| `similo` | Similo (Similo) | `LegacySimilo.scala` |
| `von_similo` | VON Similo (VON) | `LegacyVonSimilo.scala` |
| `similo_pp` | Similo++ (Ext, M9) | `OptimizedSimilo.scala` |
| `similo_pp_min` | Similo++ minimal | `OptimizedMinimalSimilo.scala` |
| `von_similo_pp` | VON Similo++ (Ext, M8) | `OptimizedVonSimilo.scala` |
| `hybrid` | HybridSimilo (Ext, M9) | `OptimizedCombinedSimilo.scala` |
| `tag_text`, `idxpath`, `xpath`, `id` | Tag + Text, ID-XPath, XPath, ID | `SinglePropertyEqual.scala` |

> Exactness is tested against line-by-line transliterations of the Java/Scala code (`npm run test:eval`): all comparison functions (int32 overflow, Java `split`/`trim`, UTF-16 lengths, Commons Text 1.10) and complete rankings including tie order. Known deviation: `exp()` may differ by one ulp between numpy and the JVM.
