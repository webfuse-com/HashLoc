"""Vectorized comparators == scalar Java transliterations, on real and perturbed benchmark elements."""
import copy
import random
from pathlib import Path

import numpy as np

from subjects.similo_compare import Page, compare, PROPS, jaro_winkler
from dataset import load_page
import reference as R

PAGE = Path(__file__).parent / "data" / "zoom-2020-01-01"


def perturbed(elements, seed=1):
    rnd = random.Random(seed)
    out = []
    for e in elements:
        f = copy.deepcopy(e)
        f.x += rnd.randint(-80, 80)
        f.y += rnd.randint(-80, 80) + (60000 if rnd.random() < 0.02 else 0)  # exercise int32 overflow
        if rnd.random() < 0.05:
            f.width, f.height = 50000, 60000  # area overflow
        if f.innerText and rnd.random() < 0.3:
            f.innerText = f.innerText[::-1] + " " + "😀 x" * rnd.randint(0, 3)
        if rnd.random() < 0.2:
            f.attributes = {**f.attributes, "class": (f.attributes.get("class") or "") + " Extra", "name": ""}
        if f.neighbourText and rnd.random() < 0.3:
            w = f.neighbourText.split(" ")
            rnd.shuffle(w)
            f.neighbourText = (" " if rnd.random() < 0.2 else "") + " ".join(w[: max(1, len(w) // 2)])
        out.append(f)
    return out


def check(name, prop, ref, old, new, rows, ulp=False):
    m = compare(name, prop, old, np.array(rows), new)
    tv = [PROPS[prop](old.elements[r]) for r in rows]
    cv = [PROPS[prop](e) for e in new.elements]
    exp = np.array([[ref(a, b) for b in cv] for a in tv])
    # exp() differs by <= 1 ulp between libms (numpy, CPython, JVM); everything else is bitwise.
    same = np.allclose(m, exp, rtol=4e-16, atol=0) if ulp else np.array_equal(m, exp, equal_nan=True)
    assert same, f"{name}/{prop}: max diff {np.nanmax(np.abs(m - exp))}"
    return m.size


def test_all():
    els = load_page(PAGE)
    new_els = perturbed(els)
    old, new = Page(els), Page(new_els)
    rows = list(range(0, len(els), 7))
    n = 0
    n += check("L.equal", "tag", R.l_equal, old, new, rows)
    n += check("L.equal", "name", R.l_equal, old, new, rows)
    n += check("L.equal", "id", R.l_equal, old, new, rows)
    for p in ("className", "href", "alt", "selenium", "idxpath", "visibleText"):
        n += check("L.distance", p, R.l_distance, old, new, rows)
    n += check("L.bool", "isButton", lambda a, b: 1.0 if a == b else 0.0, old, new, rows)
    n += check("L.location", "location", R.l_location, old, new, rows)
    n += check("L.int", "area", R.l_int, old, new, rows)
    n += check("L.int", "shape", R.l_int, old, new, rows)
    n += check("L.stringSet", "neighbourText", R.l_string_set, old, new, rows)
    n += check("O.jaccard", "tag", R.o_jac, old, new, rows)
    n += check("O.jaccard", "ariaLabel", R.o_jac, old, new, rows)
    n += check("O.jaccard", "chrome", R.o_jac, old, new, rows)
    for p in ("name", "id", "idxpath", "visibleText"):
        n += check("O.levenshtein", p, R.o_lev, old, new, rows)
    for p in ("href", "alt", "typeName", "className", "chrome"):
        n += check("O.equal", p, R.o_equal, old, new, rows)
    n += check("O.stringSet", "neighbourText", R.o_string_set, old, new, rows)
    n += check("O.area", "dimension", R.o_area, old, new, rows)
    n += check("O.mapIntersectValue", "attributes", R.o_map, old, new, rows)
    n += check("O.locationMediumDecay", "location", R.o_decay, old, new, rows, ulp=True)
    n += check("O.locationLinear", "location", R.o_linear, old, new, rows)
    n += check("O.jaroWinkler", "tag", R.else_set(jaro_winkler), old, new, rows)
    print(f"{n} comparator values identical to the scalar Java transliterations")


if __name__ == "__main__":
    test_all()
