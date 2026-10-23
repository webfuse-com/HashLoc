# Vectorized ports of the Similo comparison functions (legacy and optimized).
#
# Each comparator returns a float64 matrix [targets x candidates] whose entries equal, bit for bit,
# what the Scala/Java code computes for that (target, candidate) pair:
#   legacy    -> java/legacy/LegacyComparisons.java, similo/comparing/LegacyCompare.scala
#   optimized -> similo/comparing/{StringCompare,MapCompare,DimensionCompare,LocationCompare}.scala
#                with Apache Commons Text 1.10 (Levenshtein, Jaccard, Jaro-Winkler)

import math
from typing import Callable, Sequence

import numpy as np
from rapidfuzz import process
from rapidfuzz.distance import Levenshtein
from scipy import sparse

from dataset import Element
from jstr import fold_key, java_lower, split_space_nl, split_ws, units

Values = Sequence


class Page:
    """Elements of one snapshot plus a cache for per-property preprocessing."""

    def __init__(self, elements: list[Element]):
        self.elements = elements
        self.cache: dict = {}

    def __len__(self) -> int:
        return len(self.elements)

    def prop(self, key: str, fn: Callable[[Element], object]) -> list:
        k = ("prop", key)
        if k not in self.cache:
            self.cache[k] = [fn(e) for e in self.elements]
        return self.cache[k]


# --- property extractors (Element.scala) ----------------------------------------------------

PROPS: dict[str, Callable[[Element], object]] = {
    "tag": lambda e: e.tag,
    "className": lambda e: e.attributes.get("class"),
    "name": lambda e: e.attributes.get("name"),
    "id": lambda e: e.attributes.get("id"),
    "href": lambda e: e.attributes.get("href"),
    "alt": lambda e: e.attributes.get("alt"),
    "typeName": lambda e: e.attributes.get("type"),
    "ariaLabel": lambda e: e.attributes.get("aria-label"),
    "chrome": lambda e: e.chrome,
    "selenium": lambda e: e.selenium,
    "idxpath": lambda e: e.idxpath,
    "visibleText": lambda e: e.visible_text,
    "neighbourText": lambda e: e.neighbourText,
    "isButton": lambda e: e.is_button,
    "location": lambda e: (e.x, e.y),
    "dimension": lambda e: (e.width, e.height),
    "area": lambda e: e.width * e.height,
    "shape": lambda e: 0 if e.height == 0 else (e.width * 100) // e.height,
    "attributes": lambda e: e.attributes,
}


def wrap32(a):
    """Two's-complement int32 wrap-around (Java int arithmetic) for numpy int64 arrays."""
    return ((np.asarray(a, dtype=np.int64) + 2**31) % 2**32) - 2**31


def jdiv(a, b):
    """Java int division (truncation toward zero)."""
    a = np.asarray(a, dtype=np.int64)
    b = np.asarray(b, dtype=np.int64)
    q = np.abs(a) // np.where(b == 0, 1, np.abs(b))
    return np.where((a < 0) != (b < 0), -q, q)


# --- shared helpers -----------------------------------------------------------------------------


def _codes(tv: Values, cv: Values, key=lambda s: s) -> tuple[np.ndarray, np.ndarray]:
    """Integer codes for value equality; None gets -1 (target) / -2 (candidate) so it never matches."""
    table: dict = {}
    t = np.array([-1 if v is None else table.setdefault(key(v), len(table)) for v in tv], dtype=np.int64)
    c = np.array([-2 if v is None else table.setdefault(key(v), len(table)) for v in cv], dtype=np.int64)
    return t, c


def _present(tv: Values, cv: Values) -> np.ndarray:
    t = np.array([v is not None for v in tv])
    c = np.array([v is not None for v in cv])
    return t[:, None] & c[None, :]


def _incidence(token_lists: list[list[str] | None], vocab: dict) -> sparse.csr_matrix:
    rows, cols = [], []
    for i, toks in enumerate(token_lists):
        if not toks:
            continue
        for t in set(toks):
            rows.append(i)
            cols.append(vocab.setdefault(t, len(vocab)))
    return rows, cols


def set_jaccard(t_tokens: list, c_tokens: list) -> np.ndarray:
    """|A ∩ B| / |A ∪ B| for token sets; 0/0 gives NaN exactly like Scala's Double division."""
    vocab: dict = {}
    tr, tc = _incidence(t_tokens, vocab)
    cr, cc = _incidence(c_tokens, vocab)
    n = max(len(vocab), 1)
    T = sparse.csr_matrix((np.ones(len(tr), dtype=np.int32), (tr, tc)), shape=(len(t_tokens), n))
    C = sparse.csr_matrix((np.ones(len(cr), dtype=np.int32), (cr, cc)), shape=(len(c_tokens), n))
    inter = (T @ C.T).toarray().astype(np.float64)
    st = np.array([len(set(x)) if x else 0 for x in t_tokens], dtype=np.float64)
    sc = np.array([len(set(x)) if x else 0 for x in c_tokens], dtype=np.float64)
    union = st[:, None] + sc[None, :] - inter
    with np.errstate(invalid="ignore", divide="ignore"):
        return inter / union


def string_set_similarity(tv: list[str], cv: list[str]) -> np.ndarray:
    """StringCompare.stringSetSimilarity: split on '( |\\n)', Jaccard of the token sets."""
    return set_jaccard([split_space_nl(s) for s in tv], [split_space_nl(s) for s in cv])


def _else_set_equal(tv_u: list, cv_u: list, short_fn) -> np.ndarray:
    """StringCompare.elseSetEqual: if either string is longer than 50 -> stringSet, else short_fn.
    Inputs are unit strings (or None); the result has 0 where a value is None (forOption)."""
    nt, nc = len(tv_u), len(cv_u)
    out = np.zeros((nt, nc))
    t_ok = np.array([v is not None for v in tv_u])
    c_ok = np.array([v is not None for v in cv_u])
    t_long = np.array([v is not None and len(v) > 50 for v in tv_u])
    c_long = np.array([v is not None and len(v) > 50 for v in cv_u])
    ts, cs = np.where(t_ok & ~t_long)[0], np.where(c_ok & ~c_long)[0]
    if len(ts) and len(cs):
        out[np.ix_(ts, cs)] = short_fn([tv_u[i] for i in ts], [cv_u[j] for j in cs])
    # Any pair involving a long string (and both present) uses the set similarity.
    tl, cl = np.where(t_ok & t_long)[0], np.where(c_ok & c_long)[0]
    ta, ca = np.where(t_ok)[0], np.where(c_ok)[0]
    if len(tl) and len(ca):
        out[np.ix_(tl, ca)] = string_set_similarity([tv_u[i] for i in tl], [cv_u[j] for j in ca])
    if len(ta) and len(cl):
        out[np.ix_(ta, cl)] = string_set_similarity([tv_u[i] for i in ta], [cv_u[j] for j in cl])
    return out


def _lev_dist(a: list[str], b: list[str]) -> np.ndarray:
    return process.cdist(a, b, scorer=Levenshtein.distance, dtype=np.int32, workers=1).astype(np.int64)


# --- legacy (original Similo) -----------------------------------------------------------------


def legacy_equal(tv, cv) -> np.ndarray:
    """compareEqualProcessed: both present -> equalsIgnoreCase (two empty strings match)."""
    t, c = _codes(tv, cv, key=fold_key)
    return ((t[:, None] == c[None, :]) & (t[:, None] >= 0)).astype(np.float64)


def _legacy_prep(v: str | None) -> str | None:
    if v is None:
        return None
    u = units(v)
    if len(u) > 50:
        u = u[:49]  # substring(0, 49)
    return java_lower(u)


def legacy_distance(tv, cv) -> np.ndarray:
    """compareDistanceProcessed -> compareDistance(.., 100) / 100.0 (integer arithmetic)."""
    tp = [_legacy_prep(v) for v in tv]
    cp = [_legacy_prep(v) for v in cv]
    out = np.zeros((len(tp), len(cp)))
    ti = [i for i, v in enumerate(tp) if v is not None]
    ci = [j for j, v in enumerate(cp) if v is not None]
    if not ti or not ci:
        return out
    a, b = [tp[i] for i in ti], [cp[j] for j in ci]
    dist = _lev_dist(a, b)
    la = np.array([len(s) for s in a], dtype=np.int64)
    lb = np.array([len(s) for s in b], dtype=np.int64)
    big = np.maximum(la[:, None], lb[None, :])
    score = np.where(big == 0, 100, ((big - dist) * 100) // np.where(big == 0, 1, big))
    out[np.ix_(ti, ci)] = score / 100.0
    return out


def legacy_bool(tv, cv) -> np.ndarray:
    t = np.array(tv, dtype=bool)
    c = np.array(cv, dtype=bool)
    return (t[:, None] == c[None, :]).astype(np.float64)


def legacy_location(tv, cv) -> np.ndarray:
    t = np.array(tv, dtype=np.int64).reshape(-1, 2)
    c = np.array(cv, dtype=np.int64).reshape(-1, 2)
    dx = wrap32(t[:, None, 0] - c[None, :, 0])
    dy = wrap32(t[:, None, 1] - c[None, :, 1])
    s = wrap32(wrap32(dx * dx) + wrap32(dy * dy))
    with np.errstate(invalid="ignore"):
        d = np.where(s >= 0, np.floor(np.sqrt(np.maximum(s, 0).astype(np.float64))), 0)  # NaN.toInt == 0
    return np.maximum(100 - d, 0) / 100.0


def legacy_int_distance(tv, cv) -> np.ndarray:
    """compareIntegerDistance(v1, v2, 100) / 100.0 with int32 overflow."""
    t = wrap32(np.array(tv, dtype=np.int64))[:, None]
    c = wrap32(np.array(cv, dtype=np.int64))[None, :]
    diff = wrap32(t - c)
    dist = np.where(diff == -(2**31), diff, np.abs(diff))  # Math.abs(Integer.MIN_VALUE)
    mx = np.maximum(t, c)
    num = wrap32(wrap32(mx - dist) * 100)
    q = jdiv(num, mx)
    return np.where(mx == 0, 100, q) / 100.0


def _java_words(s: str) -> list[str]:
    return split_ws(s)


class _NeighbourIndex:
    """Inverted indexes over a page's neighbour-text words for LegacyComparisons.containsWord."""

    def __init__(self, texts: list[str | None]):
        self.n = len(texts)
        self.exact: dict[str, list[int]] = {}
        self.longer: dict[str, list[int]] = {}  # p -> candidates having a word w with len(w) > len(p), w starts/ends with p
        self.length = np.zeros(self.n, dtype=np.int64)
        self.nwords = np.zeros(self.n, dtype=np.int64)
        self.valid = np.zeros(self.n, dtype=bool)
        for j, t in enumerate(texts):
            if t is None or t == "":
                continue
            u = units(t)
            words = _java_words(u)
            self.valid[j] = True
            self.length[j] = len(u)
            self.nwords[j] = len(words)
            for w in set(words):
                self.exact.setdefault(w, []).append(j)
                affixes = {w[:k] for k in range(len(w))} | {w[len(w) - k:] if k else "" for k in range(len(w))}
                for p in affixes:
                    self.longer.setdefault(p, []).append(j)
        self.exact_np = {k: np.array(v, dtype=np.int64) for k, v in self.exact.items()}
        self.longer_np = {k: np.array(v, dtype=np.int64) for k, v in self.longer.items()}

    def matches(self, w1: str) -> np.ndarray:
        parts = []
        if w1 in self.exact_np:
            parts.append(self.exact_np[w1])
        if w1 in self.longer_np:
            parts.append(self.longer_np[w1])
        for k in range(len(w1)):  # proper prefixes and suffixes of w1 (including "")
            for p in (w1[:k], w1[len(w1) - k:] if k else ""):
                if p in self.exact_np:
                    parts.append(self.exact_np[p])
        if not parts:
            return np.empty(0, dtype=np.int64)
        return np.unique(np.concatenate(parts))


def legacy_string_set(tv, cv, page_cache: dict | None = None) -> np.ndarray:
    """LegacyCompare.stringSetCompare (forOption): word containment weighted by word length."""
    key = ("legacy_nindex",)
    idx = page_cache.get(key) if page_cache is not None else None
    if idx is None:
        idx = _NeighbourIndex(list(cv))
        if page_cache is not None:
            page_cache[key] = idx
    out = np.zeros((len(tv), idx.n))
    for i, t in enumerate(tv):
        if t is None or t == "":
            continue
        u = units(t)
        words1 = _java_words(u)
        exists = np.zeros(idx.n, dtype=np.int64)
        for w1 in words1:
            m = idx.matches(w1)
            if len(m):
                exists[m] += len(w1)
        wc = np.maximum(len(u) - len(words1) + 1, idx.length - idx.nwords + 1)
        score = np.minimum(exists * 100.0 / wc, 100.0) / 100.0
        out[i] = np.where(idx.valid, score, 0.0)
    return out


# --- optimized (Similo++ family) ---------------------------------------------------------------


def opt_equal(tv, cv) -> np.ndarray:
    """StringCompare.equal (and .forOption): exact, case-sensitive; None never matches."""
    t, c = _codes(tv, cv)
    return ((t[:, None] == c[None, :]) & (t[:, None] >= 0)).astype(np.float64)


def _char_jaccard(a: list[str], b: list[str]) -> np.ndarray:
    """Commons Text 1.10 JaccardSimilarity on characters (both empty -> 1, one empty -> 0)."""
    sim = set_jaccard([list(s) for s in a], [list(s) for s in b])
    la = np.array([len(s) for s in a])[:, None]
    lb = np.array([len(s) for s in b])[None, :]
    sim = np.where((la == 0) & (lb == 0), 1.0, sim)
    return np.where((la == 0) ^ (lb == 0), 0.0, sim)


def opt_jaccard(tv, cv) -> np.ndarray:
    return _else_set_equal([None if v is None else units(v) for v in tv],
                           [None if v is None else units(v) for v in cv], _char_jaccard)


def _short_levenshtein(a: list[str], b: list[str]) -> np.ndarray:
    dist = _lev_dist(a, b).astype(np.float64)
    la = np.array([len(s) for s in a])[:, None]
    lb = np.array([len(s) for s in b])[None, :]
    max_len = np.minimum(np.maximum(la, lb), 50)
    with np.errstate(invalid="ignore", divide="ignore"):
        return np.where(max_len == 0, 1.0, 1 - dist / max_len)


def opt_levenshtein(tv, cv) -> np.ndarray:
    return _else_set_equal([None if v is None else units(v) for v in tv],
                           [None if v is None else units(v) for v in cv], _short_levenshtein)


def jaro_winkler(left: str, right: str) -> float:
    """Commons Text 1.10 JaroWinklerSimilarity.apply (verbatim port)."""
    if left == right:
        return 1.0
    if len(left) > len(right):
        mx, mn = left, right
    else:
        mx, mn = right, left
    rng = max(len(mx) // 2 - 1, 0)
    match_idx = [-1] * len(mn)
    flags = [False] * len(mx)
    matches = 0
    for mi, c1 in enumerate(mn):
        for xi in range(max(mi - rng, 0), min(mi + rng + 1, len(mx))):
            if not flags[xi] and c1 == mx[xi]:
                match_idx[mi] = xi
                flags[xi] = True
                matches += 1
                break
    ms1 = [mn[i] for i in range(len(mn)) if match_idx[i] != -1]
    ms2 = [mx[i] for i in range(len(mx)) if flags[i]]
    half = sum(1 for a, b in zip(ms1, ms2) if a != b)
    prefix = 0
    for mi in range(min(4, len(mn))):
        if left[mi] != right[mi]:
            break
        prefix += 1
    m = float(matches)
    if m == 0:
        return 0.0
    j = (m / len(left) + m / len(right) + (m - half / 2) / m) / 3
    return j if j < 0.7 else j + 0.1 * prefix * (1.0 - j)


def _short_jw(a: list[str], b: list[str]) -> np.ndarray:
    ua, ia = np.unique(np.array(a, dtype=object), return_inverse=True)
    ub, ib = np.unique(np.array(b, dtype=object), return_inverse=True)
    small = np.array([[jaro_winkler(x, y) for y in ub] for x in ua], dtype=np.float64)
    return small[np.ix_(ia, ib)]


def opt_jaro_winkler(tv, cv) -> np.ndarray:
    return _else_set_equal([None if v is None else units(v) for v in tv],
                           [None if v is None else units(v) for v in cv], _short_jw)


def opt_string_set(tv, cv) -> np.ndarray:
    """StringCompare.stringSet.forOption (no length condition)."""
    out = np.zeros((len(tv), len(cv)))
    ti = [i for i, v in enumerate(tv) if v is not None]
    ci = [j for j, v in enumerate(cv) if v is not None]
    if ti and ci:
        out[np.ix_(ti, ci)] = string_set_similarity([units(tv[i]) for i in ti], [units(cv[j]) for j in ci])
    return out


def opt_bool(tv, cv) -> np.ndarray:
    return legacy_bool(tv, cv)


_W, _H = 1920, 1080
MAX_DISTANCE = math.sqrt(_H**2 + _W**2)


def _distance(tv, cv) -> np.ndarray:
    t = np.array(tv, dtype=np.int64).reshape(-1, 2)
    c = np.array(cv, dtype=np.int64).reshape(-1, 2)
    dx = wrap32(t[:, None, 0] - c[None, :, 0]).astype(np.float64)
    dy = wrap32(t[:, None, 1] - c[None, :, 1]).astype(np.float64)
    return np.sqrt(dx**2 + dy**2)


def opt_location_linear(tv, cv) -> np.ndarray:
    return np.maximum(0.0, 1 - _distance(tv, cv) / MAX_DISTANCE)


def opt_location_decay(lam: float):
    def fn(tv, cv):
        return np.exp(-lam * _distance(tv, cv))
    return fn


def opt_area(tv, cv) -> np.ndarray:
    """DimensionCompare.area: ratio of int32 areas (0 if either is 0)."""
    t = np.array(tv, dtype=np.int64).reshape(-1, 2)
    c = np.array(cv, dtype=np.int64).reshape(-1, 2)
    a = wrap32(t[:, 0] * t[:, 1]).astype(np.float64)[:, None]
    b = wrap32(c[:, 0] * c[:, 1]).astype(np.float64)[None, :]
    with np.errstate(invalid="ignore", divide="ignore"):
        r = np.minimum(a, b) / np.maximum(a, b)
    return np.where((a == 0) | (b == 0), 0.0, r)


def opt_map_intersect_value(tv, cv) -> np.ndarray:
    """MapCompare.intersectValueCompare: equal (key, value) pairs / max(|a|, |b|); 0 if both empty."""
    tt = [[f"{k}\x00{v}" for k, v in m.items()] for m in tv]
    ct = [[f"{k}\x00{v}" for k, v in m.items()] for m in cv]
    vocab: dict = {}
    tr, tc = _incidence(tt, vocab)
    cr, cc = _incidence(ct, vocab)
    n = max(len(vocab), 1)
    T = sparse.csr_matrix((np.ones(len(tr)), (tr, tc)), shape=(len(tt), n))
    C = sparse.csr_matrix((np.ones(len(cr)), (cr, cc)), shape=(len(ct), n))
    inter = (T @ C.T).toarray()
    st = np.array([len(m) for m in tv], dtype=np.float64)[:, None]
    sc = np.array([len(m) for m in cv], dtype=np.float64)[None, :]
    mx = np.maximum(st, sc)
    with np.errstate(invalid="ignore", divide="ignore"):
        return np.where(mx == 0, 0.0, inter / mx)


# Comparator registry: name -> (property, function, needs_page_cache)
COMPARATORS: dict[str, Callable] = {
    "L.equal": legacy_equal,
    "L.distance": legacy_distance,
    "L.bool": legacy_bool,
    "L.location": legacy_location,
    "L.int": legacy_int_distance,
    "L.stringSet": legacy_string_set,
    "O.equal": opt_equal,
    "O.jaccard": opt_jaccard,
    "O.levenshtein": opt_levenshtein,
    "O.jaroWinkler": opt_jaro_winkler,
    "O.stringSet": opt_string_set,
    "O.bool": opt_bool,
    "O.locationLinear": opt_location_linear,
    "O.locationMediumDecay": opt_location_decay(0.005),
    "O.area": opt_area,
    "O.mapIntersectValue": opt_map_intersect_value,
}


def compare(name: str, prop: str, old: Page, rows: np.ndarray, new: Page) -> np.ndarray:
    """Similarity matrix of comparator `name` on property `prop`: old[rows] x all of new."""
    fn = COMPARATORS[name]
    extract = PROPS[prop]
    tv_all = old.prop(prop, extract)
    tv = [tv_all[i] for i in rows]
    cv = new.prop(prop, extract)
    if name == "L.stringSet":
        return fn(tv, cv, page_cache=new.cache)
    return fn(tv, cv)
