"""Write the old and new element features of every localisation, as the evaluation sees them.

Usage (from ids/):  PYTHONPATH=eval python eval/rho/dump_pairs.py dataset eval/rho/pairs.jsonl
One JSON line per localisation: {"gap": "gap1" | "firstlast", "site", "row", "old": features, "new": features}.
"""
import json
import sys
from pathlib import Path

from dataset import discover_sites, load_page, pairs_for
from features import features_of


def main(dataset_dir: str, out_path: str) -> None:
    count = 0
    with open(out_path, "w", encoding="utf-8") as out:
        for site in discover_sites(Path(dataset_dir)):
            pages = {}

            def page(d):
                if d not in pages:
                    pages[d] = load_page(site.path / d.isoformat())
                return pages[d]

            gaps = [ ("gap1", old, new, True) for old, new in zip(site.dates, site.dates[1:]) ]
            gaps.append(("firstlast", site.dates[0], site.dates[-1], False))
            for gap, old_d, new_d, consecutive in gaps:
                for p in pairs_for(site, old_d, new_d, consecutive, page(old_d), page(new_d)):
                    out.write(json.dumps({"gap": gap, "site": site.name, "row": p.row,
                                          "old": features_of(p.old), "new": features_of(p.target)}) + "\n")
                    count += 1
    print(f"{count} localisations written to {out_path}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
