# The Similo-family locators of the replication package and their exact ranking semantics.
#
# Weights and comparator lists are copied from:
#   similo/legacy/LegacySimilo.scala, LegacyVonSimilo.scala
#   similo/optimized/OptimizedSimilo.scala, OptimizedMinimalSimilo.scala,
#   OptimizedVonSimilo.scala, OptimizedCombinedSimilo.scala
#   similo/baseline/SinglePropertyEqual.scala

import functools
from dataclasses import dataclass, field

import numpy as np

from subjects.similo_compare import Page, compare

Comp = tuple[str, str, float]  # (property, comparator, weight)

LEGACY: list[Comp] = [
    ("tag", "L.equal", 1.5),
    ("className", "L.distance", 0.5),
    ("name", "L.equal", 1.5),
    ("id", "L.equal", 1.5),
    ("href", "L.distance", 0.5),
    ("alt", "L.distance", 0.5),
    ("selenium", "L.distance", 0.5),
    ("idxpath", "L.distance", 0.5),
    ("isButton", "L.bool", 0.5),
    ("location", "L.location", 0.5),
    ("area", "L.int", 0.5),
    ("shape", "L.int", 0.5),
    ("visibleText", "L.distance", 1.5),
    ("neighbourText", "L.stringSet", 1.5),
]

OPTIMIZED_SIMILO: list[Comp] = [
    ("tag", "O.jaccard", 0.8),
    ("name", "O.levenshtein", 2.85),
    ("id", "O.levenshtein", 0.5),
    ("href", "O.equal", 0.95),
    ("alt", "O.equal", 1.85),
    ("typeName", "O.equal", 2.75),
    ("ariaLabel", "O.jaccard", 0.9),
    ("chrome", "O.jaccard", 0.1),
    ("idxpath", "O.levenshtein", 0.45),
    ("location", "O.locationMediumDecay", 1.2),
    ("dimension", "O.area", 0.35),
    ("visibleText", "O.levenshtein", 2.80),
    ("neighbourText", "O.stringSet", 1.45),
    ("attributes", "O.mapIntersectValue", 1.8),
]

OPTIMIZED_MINIMAL: list[Comp] = [
    ("tag", "O.jaccard", 0.8),
    ("name", "O.levenshtein", 2.85),
    ("href", "O.equal", 0.65),
    ("alt", "O.equal", 1.75),
    ("typeName", "O.equal", 0.6),
    ("ariaLabel", "O.jaccard", 0.95),
    ("idxpath", "O.levenshtein", 0.35),
    ("location", "O.locationMediumDecay", 0.95),
    ("dimension", "O.area", 0.35),
    ("visibleText", "O.levenshtein", 2.70),
    ("neighbourText", "O.stringSet", 1.45),
    ("attributes", "O.mapIntersectValue", 1.95),
]

OPTIMIZED_VON: list[Comp] = [
    ("tag", "O.jaroWinkler", 0.8),
    ("className", "O.equal", 0.35),
    ("name", "O.equal", 0.35),
    ("id", "O.equal", 2.9),
    ("href", "O.equal", 1.9),
    ("alt", "O.equal", 1.55),
    ("typeName", "O.equal", 1.25),
    ("ariaLabel", "O.jaccard", 2.1),
    ("chrome", "O.equal", 0.95),
    ("idxpath", "O.levenshtein", 0.7),
    ("isButton", "O.bool", 0.0),
    ("location", "O.locationLinear", 2.4),
    ("dimension", "O.area", 1.85),
    ("visibleText", "O.levenshtein", 2.55),
    ("neighbourText", "O.stringSet", 1.95),
    ("attributes", "O.mapIntersectValue", 0.85),
]


@dataclass(frozen=True)
class SimiloSpec:
    name: str
    comps: tuple


@dataclass(frozen=True)
class VonSpec:
    name: str
    comps: tuple


@dataclass(frozen=True)
class CombinedSpec:
    name: str
    von: tuple
    similo: tuple
    consideration: int = 10


@dataclass(frozen=True)
class SingleSpec:
    name: str
    props: tuple  # extract property names


BASELINES = {
    "similo": SimiloSpec("Similo (Similo)", tuple(LEGACY)),
    "von_similo": VonSpec("VON Similo (VON)", tuple(LEGACY)),
    "similo_pp": SimiloSpec("Similo++ (Ext, M9)", tuple(OPTIMIZED_SIMILO)),
    "similo_pp_min": SimiloSpec("Similo++ minimal", tuple(OPTIMIZED_MINIMAL)),
    "von_similo_pp": VonSpec("VON Similo++ (Ext, M8)", tuple(OPTIMIZED_VON)),
    "hybrid": CombinedSpec("HybridSimilo (Ext, M9)", tuple(OPTIMIZED_VON), tuple(OPTIMIZED_SIMILO)),
    "tag_text": SingleSpec("Tag + Text", ("tag", "visibleText")),
    "idxpath": SingleSpec("ID-XPath", ("idxpath",)),
    "xpath": SingleSpec("XPath", ("chrome",)),
    "id": SingleSpec("ID", ("id",)),
}


# --- Scala sorting semantics --------------------------------------------------------------------


def _double_key(x: float):
    """java.lang.Double.compare order: NaN is greater than +Infinity."""
    return (1, 0.0) if x != x else (0, x)


def sort_reverse(items: list[tuple[float, int]]) -> list[tuple[float, int]]:
    """`seq.sortBy(_._1).reverse`: stable ascending sort, then reversed."""
    return sorted(items, key=lambda t: _double_key(t[0]))[::-1]


def similo_order(scores: np.ndarray) -> list[tuple[float, int]]:
    """Similo.locate sorts+reverses and Locator.locateSorted does it again: ties end up in
    ascending candidate order."""
    items = [(float(s), i) for i, s in enumerate(scores)]
    return sort_reverse(sort_reverse(items))


def von_order(scores: np.ndarray) -> list[tuple[float, int]]:
    """VonSimilo.locate is unsorted; locateSorted sorts+reverses once: ties in descending order."""
    return sort_reverse([(float(s), i) for i, s in enumerate(scores)])


# --- overlap (VonSimilo.getOverlap / areOverlap) -----------------------------------------------


def overlap_lists(page: Page, threshold: float = 0.85, chunk: int = 512) -> list[np.ndarray]:
    """For every element i, the elements j with areOverlap(i, j); [i] if there are none."""
    key = ("overlap", threshold)
    if key in page.cache:
        return page.cache[key]
    els = page.elements
    x = np.array([e.x for e in els], dtype=np.int64)
    y = np.array([e.y for e in els], dtype=np.int64)
    w = np.array([e.width for e in els], dtype=np.int64)
    h = np.array([e.height for e in els], dtype=np.int64)
    cx, cy = x + w / 2.0, y + h / 2.0
    n = len(els)
    out: list[np.ndarray] = []
    for s in range(0, n, chunk):
        sl = slice(s, min(s + chunk, n))
        tx1, ty1, tw, th = x[sl, None], y[sl, None], w[sl, None], h[sl, None]
        # java.awt.Rectangle.intersection / union (all dimensions are non-negative here)
        ix = np.minimum(tx1 + tw, x[None] + w[None]) - np.maximum(tx1, x[None])
        iy = np.minimum(ty1 + th, y[None] + h[None]) - np.maximum(ty1, y[None])
        ux = np.maximum(tx1 + tw, x[None] + w[None]) - np.minimum(tx1, x[None])
        uy = np.maximum(ty1 + th, y[None] + h[None]) - np.minimum(ty1, y[None])
        div = ux.astype(np.float64) * uy.astype(np.float64)
        with np.errstate(invalid="ignore", divide="ignore"):
            ratio = (ix.astype(np.float64) * iy.astype(np.float64)) / div
        inside = (cx[None] >= tx1) & (cy[None] >= ty1) & (cx[None] < tx1 + tw) & (cy[None] < ty1 + th)
        ok = (div != 0) & (ratio >= threshold) & inside
        for r in range(ok.shape[0]):
            idx = np.nonzero(ok[r])[0]
            out.append(idx if len(idx) else np.array([s + r], dtype=np.int64))
    page.cache[key] = out
    return out


# --- engine -------------------------------------------------------------------------------------


@dataclass
class Ranking:
    """Ranked candidate indices (best first) and their raw scores; `normalizer` as in the locator."""

    order: list[int]
    scores: list[float]
    normalizer: float


class PairContext:
    """One (old page, new page) version pair; caches comparator matrices across locators."""

    def __init__(self, old: Page, new: Page):
        self.old, self.new = old, new
        self._mats: dict = {}

    def matrix(self, prop: str, comp: str, rows: np.ndarray) -> np.ndarray:
        """Similarity of old[rows] vs all new candidates, computed for the union of requested rows."""
        key = (prop, comp)
        have = self._mats.get(key)
        if have is None:
            have = ({}, None)
        cache, _ = have
        missing = [r for r in rows if r not in cache]
        if missing:
            m = compare(comp, prop, self.old, np.array(missing, dtype=np.int64), self.new)
            for k, r in enumerate(missing):
                cache[r] = m[k]
            self._mats[key] = (cache, None)
        return np.stack([cache[r] for r in rows]) if len(rows) else np.zeros((0, len(self.new)))

    def totals(self, comps: tuple, rows: np.ndarray) -> np.ndarray:
        """Sum of weight * similarity, accumulated in the locator's comparator order (foldLeft)."""
        total = np.zeros((len(rows), len(self.new)))
        for prop, comp, weight in comps:
            total = total + self.matrix(prop, comp, rows) * weight
        return total


def normalizer(comps: tuple) -> float:
    return functools.reduce(lambda a, c: a + c[2], comps, 0.0)


def rank_similo(ctx: PairContext, comps: tuple, rows: np.ndarray) -> list[Ranking]:
    tot = ctx.totals(comps, rows)
    out = []
    for r in range(len(rows)):
        order = similo_order(tot[r])
        out.append(Ranking([i for _, i in order], [s for s, _ in order], normalizer(comps)))
    return out


def _von_scores(ctx: PairContext, comps: tuple, rows: np.ndarray) -> np.ndarray:
    """VON score of every candidate for every target row: max over overlap combinations."""
    old_ov = overlap_lists(ctx.old)
    new_ov = overlap_lists(ctx.new)
    members = sorted({int(m) for r in rows for m in old_ov[r]})
    pos = {m: k for k, m in enumerate(members)}
    tot = ctx.totals(comps, np.array(members, dtype=np.int64))
    flat = np.concatenate(new_ov)
    offsets = np.cumsum([0] + [len(o) for o in new_ov[:-1]])
    out = np.empty((len(rows), len(ctx.new)))
    for k, r in enumerate(rows):
        colmax = tot[[pos[int(m)] for m in old_ov[r]]].max(axis=0)  # NaN propagates like Ordering max
        out[k] = np.maximum.reduceat(colmax[flat], offsets)
    return out


def rank_von(ctx: PairContext, comps: tuple, rows: np.ndarray) -> list[Ranking]:
    sc = _von_scores(ctx, comps, rows)
    out = []
    for k in range(len(rows)):
        order = von_order(sc[k])
        out.append(Ranking([i for _, i in order], [s for s, _ in order], normalizer(comps)))
    return out


def rank_combined(ctx: PairContext, spec: CombinedSpec, rows: np.ndarray) -> list[Ranking]:
    von = _von_scores(ctx, spec.von, rows)
    sim = ctx.totals(spec.similo, rows)
    out = []
    for k in range(len(rows)):
        pre = von_order(von[k])
        top, low = pre[: spec.consideration], pre[spec.consideration:]
        sel = sort_reverse(sort_reverse([(float(sim[k, i]), i) for _, i in top]))
        combined = sel + [(0.0, i) for _, i in low]
        final = sort_reverse(combined)
        out.append(Ranking([i for _, i in final], [s for s, _ in final], normalizer(spec.similo)))
    return out


def rank_single(ctx: PairContext, spec: SingleSpec, rows: np.ndarray) -> list[Ranking]:
    from subjects.similo_compare import PROPS

    def extract(e):
        vals = []
        for p in spec.props:
            v = PROPS[p](e)
            vals.append("" if v is None else v)
        return tuple(vals)

    key = ("single", spec.props)
    if key not in ctx.new.cache:
        table: dict = {}
        for i, e in enumerate(ctx.new.elements):
            table.setdefault(tuple(v.lower() for v in extract(e)), i)  # first match wins
        ctx.new.cache[key] = table
    table = ctx.new.cache[key]
    out = []
    for r in rows:
        want = tuple(v.lower() for v in extract(ctx.old.elements[r]))
        hit = table.get(want)
        if hit is not None:
            out.append(Ranking([hit], [1.0], 1.0))
        else:
            out.append(Ranking([0], [0.0], 1.0))
    return out


def rank(ctx: PairContext, spec, rows: np.ndarray) -> list[Ranking]:
    if isinstance(spec, SimiloSpec):
        return rank_similo(ctx, spec.comps, rows)
    if isinstance(spec, VonSpec):
        return rank_von(ctx, spec.comps, rows)
    if isinstance(spec, CombinedSpec):
        return rank_combined(ctx, spec, rows)
    if isinstance(spec, SingleSpec):
        return rank_single(ctx, spec, rows)
    raise TypeError(spec)
