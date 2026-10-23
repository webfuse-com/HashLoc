# Per-localization results and aggregate metrics (evalutation/EvaluationStatistics.scala).
#
# Metric names follow Kluge & Stocco, Table 5:
#   exact_match             first result is the target                                (M4; exactMatchPercentage)
#   exact_match_broken      exact match on pairs where all unique locators broke      (M5; locatorBreakFound)
#   top10                   target among the top ten                                  (M8; matchInFound)
#   parent_child            first result is the target or its direct DOM parent/child (M1; paper text, not in repo code)
#   visual_textual_overlap  first result in the target's visual or textual overlap    (M3; paper text, not in repo code)
#   visual_overlap          first result is the target or in its visual overlap       (M7; firstInOverlap)
#   fitness                 sum(matchScore * classificationScore) / sum(4 * cs)       (M9; score / possibleScore)
#
# Names in parentheses: Kluge & Stocco, Table 5, and the released Scala code.

from dataclasses import asdict, dataclass

import numpy as np

from dataset import CLASSIFICATION_SCORE, Element, Pair


@dataclass(slots=True)
class Row:
    method: str
    site: str
    old_date: str
    new_date: str
    months: int
    row: int
    element_cls: str
    locator_cls: str
    rank: int          # 1-based rank of the exact target in the returned list; 0 = not returned
    parent_child: bool
    visual_textual_overlap: bool
    exact_match: bool
    visual_overlap: bool
    top10: bool
    fitness: float
    fitness_max: float
    s1: float          # normalized score of the first result
    s2: float          # normalized score of the second result (nan if none)
    chars: int         # HashLoc code length (0 otherwise)
    top1: int = -1     # candidate index of the first result
    bound: float = float("nan")  # uncompressed HashLoc: upper bound on P(compressed top-1 differs)
    stored_bytes: int = 0        # stored-fingerprint baselines: record size of the old element (sizes.py)
    stored_deflate: int = 0      # the same, raw-deflate compressed
    selector_bytes: int = 0      # shortest unique CSS selector or XPath of the old element (sizes.py)
    scored: int = 0              # HashLoc: elements scored (the page for a scan, bucket matches for bucket lookup)
    page_size: int = 0           # HashLoc: elements on the new page

    def dict(self) -> dict:
        return asdict(self)


def _parent(xpath: str) -> str:
    return xpath.rsplit("/", 1)[0]


def textual_overlap(target: Element, page: list[Element]) -> set[int]:
    """LLM VON Similo textual overlap: same non-null visible text and ancestor/descendant XPaths."""
    t = target.visible_text
    if t is None:
        return set()
    out = set()
    for e in page:
        if e.visible_text == t and (e.chrome.startswith(target.chrome) or target.chrome.startswith(e.chrome)):
            out.add(e.index)
    return out


def make_row(method: str, pair: Pair, order: list[int], scores: list[float], normalizer: float,
             new_page: list[Element], visual_overlap: np.ndarray, *, chars=0, bound=float("nan")) -> Row:
    s1 = scores[0] / normalizer if scores else float("nan")
    s2 = scores[1] / normalizer if len(scores) > 1 else float("nan")
    cs = CLASSIFICATION_SCORE.get((pair.classification.element, pair.classification.locator), 0)
    if not order:
        # No candidate at all (bucket lookup without a matching bucket): a miss on every metric.
        return Row(method, pair.site, pair.old_date.isoformat(), pair.new_date.isoformat(), pair.months, pair.row,
                   pair.classification.element, pair.classification.locator, 0, False, False, False, False,
                   False, 0, 4 * cs, s1, s2, chars, -1, bound)
    tchrome = pair.target.chrome
    first = new_page[order[0]]
    exact = first.chrome == tchrome
    vis = set(int(i) for i in visual_overlap)
    in_vis = first.index in vis
    parent_child = exact or first.chrome == _parent(tchrome) or _parent(first.chrome) == tchrome
    visual_textual = exact or in_vis or first.index in textual_overlap(pair.target, new_page)
    rank = 0
    for k, i in enumerate(order):
        if new_page[i].chrome == tchrome:
            rank = k + 1
            break
    top10 = 0 < rank <= 10
    match_score = 4 if exact else 1 if in_vis else 0
    return Row(method, pair.site, pair.old_date.isoformat(), pair.new_date.isoformat(), pair.months, pair.row,
               pair.classification.element, pair.classification.locator, rank, parent_child, visual_textual, exact, exact or in_vis,
               top10, match_score * cs, 4 * cs, s1, s2, chars, order[0], bound)


# Column names of results written before the metrics were renamed.
LEGACY_COLUMNS = {"m1": "parent_child", "m3": "visual_textual_overlap", "m4": "exact_match", "m7": "visual_overlap", "m8": "top10"}


def normalize_columns(df):
    """Results written before metrics and the method were renamed (SimCode -> HashLoc) read like new ones."""
    df = df.rename(columns={k: v for k, v in LEGACY_COLUMNS.items() if k in df.columns})
    if "method" in df.columns:
        df["method"] = df["method"].str.replace(r"^SimCode ", "HashLoc ", regex=True)
    return df


def summarize(df) -> "pd.DataFrame":
    """Aggregate a localizations DataFrame into one line per (method, mode, chars)."""
    import pandas as pd

    def agg(g):
        lc = g[g.locator_cls == "lchange"]
        return pd.Series({
            "pairs": len(g),
            "broken_pairs": len(lc),
            "exact_match": g.exact_match.mean() * 100,
            "exact_match_broken": lc.exact_match.mean() * 100 if len(lc) else float("nan"),
            "top10": g.top10.mean() * 100,
            "parent_child": g.parent_child.mean() * 100,
            "visual_textual_overlap": g.visual_textual_overlap.mean() * 100,
            "visual_overlap": g.visual_overlap.mean() * 100,
            "fitness": g.fitness.sum() / g.fitness_max.sum() * 100 if g.fitness_max.sum() else float("nan"),
        })

    df = normalize_columns(df)
    keys = ["method", "mode", "chars"]
    return df.groupby(keys, sort=False).apply(agg, include_groups=False).reset_index()
