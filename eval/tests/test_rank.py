"""Rankings of the vectorized engine == a literal transliteration of the Scala control flow."""
from pathlib import Path

import numpy as np

from subjects.similo_compare import PROPS, Page, jaro_winkler
from dataset import discover_sites, load_page, pairs_for
from subjects.similo import BASELINES, PairContext, rank
import reference as R

SCALAR = {
    "L.equal": R.l_equal, "L.distance": R.l_distance, "L.bool": lambda a, b: 1.0 if a == b else 0.0,
    "L.location": R.l_location, "L.int": R.l_int, "L.stringSet": R.l_string_set,
    "O.equal": R.o_equal, "O.jaccard": R.o_jac, "O.levenshtein": R.o_lev, "O.jaroWinkler": R.else_set(jaro_winkler),
    "O.stringSet": R.o_string_set, "O.bool": lambda a, b: 1.0 if a == b else 0.0, "O.locationLinear": R.o_linear,
    "O.locationMediumDecay": R.o_decay, "O.area": R.o_area, "O.mapIntersectValue": R.o_map,
}


class Scalar:
    def __init__(self, comps):
        self.comps = comps
        self.cache = {}

    def score(self, t, c):
        key = (id(t), id(c))
        if key not in self.cache:
            total = 0.0
            for prop, comp, w in self.comps:
                total = total + SCALAR[comp](PROPS[prop](t), PROPS[prop](c)) * w
            self.cache[key] = total
        return self.cache[key]


def sort_reverse(lst):  # seq.sortBy(_._1).reverse with Double.compare order
    return sorted(lst, key=lambda t: (1, 0) if t[0] != t[0] else (0, t[0]))[::-1]


def are_overlap(t, c, thr=0.85):
    ix = min(t.x + t.width, c.x + c.width) - max(t.x, c.x)
    iy = min(t.y + t.height, c.y + c.height) - max(t.y, c.y)
    ux = max(t.x + t.width, c.x + c.width) - min(t.x, c.x)
    uy = max(t.y + t.height, c.y + c.height) - min(t.y, c.y)
    div = float(ux) * float(uy)
    if div == 0:
        return False
    ratio = (float(ix) * float(iy)) / div
    cx, cy = c.x + c.width / 2.0, c.y + c.height / 2.0
    return ratio >= thr and t.x <= cx < t.x + t.width and t.y <= cy < t.y + t.height


def get_overlap(t, cands):
    o = [c for c in cands if are_overlap(t, c)]
    return o if o else [t]


def similo_locate(sc, t, cands):  # Similo.locate (sorted) -> Locator.locateSorted (sorted again)
    return sort_reverse(sort_reverse([(sc.score(t, c), c.index) for c in cands]))


def von_locate(sc, t, old, cands):
    ot = get_overlap(t, old)
    res = []
    for c in cands:
        oc = get_overlap(c, cands)
        res.append((max(sc.score(a, b) for a in ot for b in oc), c.index))
    return sort_reverse(res)


def combined_locate(von_sc, sim_sc, t, old, cands, k=10):
    pre = von_locate(von_sc, t, old, cands)
    top, low = pre[:k], pre[k:]
    sel = sort_reverse(sort_reverse([(sim_sc.score(t, cands[i]), i) for _, i in top]))
    return sort_reverse(sel + [(0.0, i) for _, i in low])


def test_rankings():
    from make_sample import main as make_sample

    root = Path(__file__).parent / "_sample_dataset"
    if not root.exists():
        make_sample(root)
    site = discover_sites(root)[0]
    d0, d1 = site.dates[1], site.dates[2]
    oldp, newp = load_page(site.path / d0.isoformat()), load_page(site.path / d1.isoformat())
    pairs = pairs_for(site, d0, d1, True, oldp, newp)[::12][:4]
    rows = np.array([p.old.index for p in pairs])
    ctx = PairContext(Page(oldp), Page(newp))
    checked = 0
    for key in ("similo", "similo_pp", "von_similo", "von_similo_pp", "hybrid"):
        spec = BASELINES[key]
        got = rank(ctx, spec, rows)
        for p, g in zip(pairs, got):
            if key in ("similo", "similo_pp"):
                exp = similo_locate(Scalar(spec.comps), p.old, newp)
            elif key.startswith("von"):
                exp = von_locate(Scalar(spec.comps), p.old, oldp, newp)
            else:
                exp = combined_locate(Scalar(spec.von), Scalar(spec.similo), p.old, oldp, newp)
            assert [i for _, i in exp] == g.order, f"{key}: order differs for row {p.row}"
            assert np.allclose([s for s, _ in exp], g.scores, rtol=1e-15, atol=0), key
            checked += 1
    print(f"{checked} full rankings identical to the literal Scala transliteration")


if __name__ == "__main__":
    test_rankings()
