# Leave-one-site-out weight fitting for HashLoc profiles (same objective as the library's fitWeights).
#
# Input per localization: the per-segment similarity vectors of the top-K candidates (by the default
# weights) plus the true element, as returned by the bridge's "similarities" op.

import numpy as np

FACTORS = (0.0, 0.5, 0.75, 1.25, 1.5, 2.0)
ZERO_TRIES = (0.25, 0.5, 1.0, 2.0)


def stack(records: list[dict], segments: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """records -> sims [L, K, S] (NaN = segment skipped or padding) and truth [L] (-1 = absent)."""
    k = max((len(r["similarities"]) for r in records), default=1)
    sims = np.full((len(records), k, segments), np.nan)
    valid = np.zeros((len(records), k), dtype=bool)
    truth = np.full(len(records), -1, dtype=np.int64)
    for i, r in enumerate(records):
        m = np.array([[np.nan if v is None else v for v in row] for row in r["similarities"]], dtype=float)
        if m.size:
            sims[i, : m.shape[0]] = m
            valid[i, : m.shape[0]] = True
        truth[i] = r["truth"]
    return sims, valid, truth


class Problem:
    """Precomputed arrays so each objective evaluation is two matrix-vector products."""

    def __init__(self, sims: np.ndarray, valid: np.ndarray, truth: np.ndarray):
        self.present = (~np.isnan(sims)).astype(np.float64)
        self.values = np.nan_to_num(sims, nan=0.0)
        self.valid = valid
        self.rows = np.where(truth >= 0)[0]
        self.truth = truth[self.rows]

    def scores(self, weights: np.ndarray) -> np.ndarray:
        num = self.values @ weights
        den = self.present @ weights
        with np.errstate(invalid="ignore", divide="ignore"):
            s = np.where(den > 0, num / den, 0.0)
        return np.where(self.valid, s, -np.inf)


def scores(sims: np.ndarray, valid: np.ndarray, weights: np.ndarray) -> np.ndarray:
    """Weighted mean over non-skipped segments (score.ts weightedScore); invalid rows get -inf."""
    return Problem(sims, valid, np.full(len(sims), -1)).scores(weights)


def _objective(problem: Problem, weights: np.ndarray) -> float:
    s = problem.scores(weights)
    rows, truth = problem.rows, problem.truth
    t = s[rows, truth]
    other = s[rows].copy()
    other[np.arange(len(rows)), truth] = -np.inf
    best_other = other.max(axis=1)
    correct = (t > best_other).sum()
    margin = np.where(np.isfinite(best_other), t - best_other, t).sum()
    return float(correct + 0.01 * margin)


def objective(sims, valid, truth, weights) -> float:
    return _objective(Problem(sims, valid, truth), np.asarray(weights, dtype=float))


def fit_weights(sims, valid, truth, start: np.ndarray, rounds: int = 3) -> np.ndarray:
    """Coordinate search maximizing top-1 accuracy (tie-break: mean margin), as in train.ts fitWeights."""
    problem = Problem(sims, valid, truth)
    w = start.astype(float).copy()
    best = _objective(problem, w)
    for _ in range(rounds):
        improved = False
        for i in range(len(w)):
            tries = ZERO_TRIES if w[i] == 0 else tuple(w[i] * f for f in FACTORS)
            for t in tries:
                cand = w.copy()
                cand[i] = round(t * 1000) / 1000
                if not cand.any():
                    continue
                o = _objective(problem, cand)
                if o > best + 1e-9:
                    best, w, improved = o, cand, True
        if not improved:
            break
    return w
