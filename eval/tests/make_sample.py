"""Build a small benchmark-format dataset from one real snapshot by simulating releases."""
import copy
import sys as _sys
from pathlib import Path as _Path

_sys.path.insert(0, str(_Path(__file__).parent.parent))
import json
import random
import shutil
import sys
from datetime import date
from pathlib import Path

from dataset import classify_elements, load_page

SRC = Path(__file__).parent / "data" / "zoom-2020-01-01"
DATES = [date(2020, 1, 1), date(2020, 5, 1), date(2020, 9, 1), date(2021, 1, 1)]


def raw(e):
    return {"tag": e.tag, "innerText": e.innerText, "nodeText": e.nodeText, "childrenLength": e.childrenLength,
            "neighbourText": e.neighbourText, "xpath": {"chrome": e.chrome, "selenium": e.selenium, "idxpath": e.idxpath},
            "cssSelector": e.cssSelector, "location": [e.x, e.y], "dimension": [e.width, e.height],
            "attributes": e.attributes, "cssStyles": {}}


def release(els, rnd):
    out = []
    shift = rnd.randint(-30, 60)
    for e in els:
        f = copy.deepcopy(e)
        f.y += shift + rnd.randint(-5, 5)
        f.x += rnd.choice([0, 0, 0, rnd.randint(-40, 40)])
        if rnd.random() < 0.15 and f.innerText:
            f.innerText = f.innerText.replace("Learn", "Discover").replace("Sign", "Log") + (" " if rnd.random() < .5 else "")
        if rnd.random() < 0.2 and "id" in f.attributes:
            new_id = f"ember{rnd.randint(1000, 9999)}"
            f.attributes = {**f.attributes, "id": new_id}
            f.idxpath = f"//*[@id='{new_id}']"
        if rnd.random() < 0.1:
            f.attributes = {**f.attributes, "class": (f.attributes.get("class") or "") + " v2"}
        out.append(f)
    rnd.shuffle(out[len(out) // 2:])  # partial DOM reorder
    return out


def main(dst: Path = Path(__file__).parent / "_sample_dataset"):
    shutil.rmtree(dst, ignore_errors=True)
    base = load_page(SRC)
    rows = [r.split(";")[4].split("|")[2] for r in open(Path(__file__).parent / "data" / "zoom-classified.csv").read().splitlines()[1:]]
    tracked = [x for x in rows if x != "-"]
    for si, site in enumerate(["zoom", "zoomalt", "zoomthird"]):
        rnd = random.Random(si)
        versions = [base]
        for _ in DATES[1:]:
            versions.append(release(versions[-1], rnd))
        sp = dst / site
        for d, els in zip(DATES, versions):
            (sp / d.isoformat()).mkdir(parents=True)
            (sp / d.isoformat() / "elements.json").write_text(json.dumps([raw(e) for e in els]))
        # xpaths: the chrome xpath stays stable in this simulation; mark some as deleted in the last version
        cols = []
        for k, (d, els) in enumerate(zip(DATES, versions)):
            col = []
            for i, x in enumerate(tracked):
                col.append("-" if (k == len(DATES) - 1 and i % 9 == 0) else x)
            cols.append(col)
        (sp / "xpaths.csv").write_text(";".join(d.isoformat() for d in DATES) + "\n" +
                                       "\n".join(";".join(c[i] for c in cols) for i in range(len(tracked))))
        sym = {"same": "same   ", "minor": "minor  ", "major": "major  ", "deleted": "deleted", "initial": "initial"}
        lsym = {"same": "same   ", "xchange": "xchange", "lchange": "lchange", "deleted": "deleted", "initial": "initial"}
        lines = []
        for i in range(len(tracked)):
            cells = [f"initial|initial|{cols[0][i]}"]
            for k in range(1, len(DATES)):
                prev = next(e for e in versions[k - 1] if e.chrome == cols[k - 1][i])
                now = next((e for e in versions[k] if e.chrome == cols[k][i]), None) if cols[k][i] != "-" else None
                c = classify_elements(prev, now)
                cells.append(f"{sym[c.element]}|{lsym[c.locator]}|{cols[k][i]}")
            lines.append(";".join(cells))
        (sp / "classified.csv").write_text(";".join(d.isoformat() for d in DATES) + "\n" + "\n".join(lines))
    print(f"sample dataset written to {dst}")


if __name__ == "__main__":
    main(Path(sys.argv[1])) if len(sys.argv) > 1 else main()
