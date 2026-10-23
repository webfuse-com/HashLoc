"""Weight fitting recovers an informative segment and ignores a misleading one."""
import numpy as np

from fit import fit_weights, objective


def test_fit_prefers_informative_segment():
    rng = np.random.default_rng(0)
    L, K = 300, 20
    sims = rng.random((L, K, 2))
    truth = rng.integers(0, K, L)
    sims[np.arange(L), truth, 0] = 1.0           # segment 0 identifies the target
    sims[np.arange(L), (truth + 1) % K, 1] = 1.0  # segment 1 points to a decoy
    sims[np.arange(L), truth, 1] = 0.0
    valid = np.ones((L, K), dtype=bool)
    start = np.array([1.0, 1.0])
    w = fit_weights(sims, valid, truth, start)
    assert objective(sims, valid, truth, w) > objective(sims, valid, truth, start)
    assert w[0] > w[1]
