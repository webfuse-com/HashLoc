import json
import os
import re
import sys
import time
import traceback
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import numpy as np
import pandas as pd

from util import parse_flag, parse_option, parse_split, echo
from bridge import DEFAULT_DATASET_DIR, DEFAULT_HASHLOC_DIR, HashLocBridge
from dataset import Site, date_pairs, discover_sites, load_page, pairs_for
from features import features_of
from metrics import make_row
from sizes import SelectorIndex, record_size, selector_size
from subjects import HashLoc
from subjects.similo import BASELINES, PairContext, overlap_lists, rank, without_spatial
from subjects.similo_compare import Page


_HERE = Path(__file__).parent
_RESULTS_ROOT = _HERE / "results"
_WEIGHT_SETS = ("default", "similopp", "fitted")


def _parse_modes(raw: str) -> list:
    modes = []
    for part in raw.split(","):
        part = part.strip()
        if part == "firstlast":
            modes.append("firstlast")
        elif "-" in part:
            a, b = map(int, part.split("-"))
            modes.extend(range(a, b + 1))
        else:
            modes.append(int(part))

    return modes


def _list_option(name: str, default: str = "") -> list[str]:
    return [ x for x in (parse_option(name) or default).split(",") if x ]


def _run_site(site: Site, modes: list, methods: list[str], spec: dict, hashloc_dir: Path) -> list[dict]:
    """One site. spec["task"]: "main" (baselines and HashLoc variants), "collect" (similarity vectors
    for weight fitting) or "fitted" (HashLoc with this site's leave-one-site-out weights)."""
    needs_bridge = spec["task"] != "main" or spec["names"] or spec["ablation"]
    bridge = HashLocBridge(hashloc_dir) if needs_bridge else None

    try:
        profiles: list[dict] = []
        if bridge and spec["task"] == "main":
            profiles = bridge.profiles(spec["names"], spec["ablation"], spec["sketches"], spec["weight_sets"])
        elif bridge and spec["task"] == "collect":
            profiles = bridge.profiles(spec["names"])
        elif bridge and spec["task"] == "fitted":
            for mode_name, by_profile in spec["fitted"][site.name].items():
                for base, weights in by_profile.items():
                    profiles.append({**bridge.register(f"{base}@fitted:{mode_name}", base, weights), "kind": "weights"})

        return _run_site_pairs(site, modes, methods if spec["task"] == "main" else [], bridge, profiles, spec)
    finally:
        if bridge:
            bridge.close()


def _run_site_pairs(site: Site, modes: list, methods: list[str], bridge, profiles: list[dict], spec: dict) -> list[dict]:
    pages: dict = {}
    feats: dict = {}
    loaded: set = set()

    def page(d):
        if d not in pages:
            pages[d] = Page(load_page(site.path / d.isoformat()))
        return pages[d]

    def page_feats(d):
        if d not in feats:
            feats[d] = [ features_of(e) for e in page(d).elements ]
            if spec.get("no_spatial"):
                # Spatial properties ignored: no geometry, no neighbour text (empty segments are skipped).
                feats[d] = [ {**f, "geom": None, "neighborText": ""} for f in feats[d] ]
        return feats[d]

    def bridge_page(d) -> str:
        key = d.isoformat()
        if key not in loaded:
            bridge.load_page(key, page_feats(d))
            loaded.add(key)
        return key

    rows: list[dict] = []
    for mode in modes:
        mode_name = "firstlast" if mode == "firstlast" else f"gap{int(mode)}"

        for old_d, new_d in date_pairs(site, mode):
            pairs = pairs_for(site, old_d, new_d, mode == 1, page(old_d).elements, page(new_d).elements)
            if not pairs:
                continue

            old, new = page(old_d), page(new_d)
            new_els = new.elements
            ov_new = overlap_lists(new)
            idx = np.array([ p.old.index for p in pairs ], dtype=np.int64)
            selectors = SelectorIndex(old.elements) if methods else None
            ctx = PairContext(old, new)

            for m in methods:
                spec_m = without_spatial(BASELINES[m]) if spec.get("no_spatial") else BASELINES[m]
                if spec_m is None:
                    continue
                for p, r in zip(pairs, rank(ctx, spec_m, idx)):
                    row = make_row(spec_m.name, p, r.order, r.scores, r.normalizer, new_els, ov_new[p.target.index])
                    row.stored_bytes, row.stored_deflate = record_size(m, p.old)
                    row.selector_bytes = selector_size(selectors, p.old)
                    rows.append({**row.dict(), "mode": mode_name})

            if not (bridge and profiles):
                continue

            key = bridge_page(new_d)
            targets = [ (page_feats(old_d)[p.old.index], p.target.index) for p in pairs ]

            if spec["task"] == "collect":
                rows += HashLoc.collect_rows(bridge, profiles, site.name, mode_name, pairs, targets, key, spec["keep"])
            else:
                rows += HashLoc.locate_rows(bridge, profiles, mode_name, pairs, targets, key, new_els, ov_new,
                                            spec["uncompressed"], spec["task"] == "fitted", spec.get("band_sizes"))

    return rows


def _worker(args):
    site, modes, methods, spec, hashloc_dir = args

    t0 = time.time()
    try:
        return site.name, _run_site(site, modes, methods, spec, hashloc_dir), time.time() - t0, None
    except Exception:
        return site.name, [], time.time() - t0, traceback.format_exc()


def _run_parallel(sites: list[Site], modes, methods, spec: dict, hashloc_dir: Path, workers: int, label: str) -> list[dict]:
    rows: list[dict] = []
    with ProcessPoolExecutor(max_workers=workers) as pool:
        futures = [ pool.submit(_worker, (s, modes, methods, spec, hashloc_dir)) for s in sites ]

        for k, future in enumerate(as_completed(futures), 1):
            name, site_rows, secs, err = future.result()
            if err:
                sys.stderr.write(f"[{label} {k}/{len(sites)}] {name}: FAILED\n{err}\n")
                continue

            rows.extend(site_rows)
            echo(f"[{label} {k}/{len(sites)}] {name}: {len(site_rows)} rows ({round(secs)}s)", always=True)

    return rows


def _fit_fold(args):
    """Weights for one held-out site, fitted on the other sites' similarity records."""
    from fit import fit_weights, stack

    held_out, records, start, segments = args
    sims, valid, truth = stack([ r for r in records if r["site"] != held_out ], segments)

    return held_out, fit_weights(sims, valid, truth, np.array(start, dtype=float))


def _fitted_weights(sites: list[Site], modes, names: list[str], hashloc_dir: Path, workers: int, keep: int) -> dict:
    """Leave-one-site-out weights: site -> mode -> profile -> {feature: weight}."""
    collect_spec = {
        "task": "collect",
        "names": names,
        "ablation": None,
        "sketches": [],
        "weight_sets": [],
        "uncompressed": False,
        "keep": keep,
    }
    records = _run_parallel(sites, modes, [], collect_spec, hashloc_dir, workers, "collect")

    with HashLocBridge(hashloc_dir) as bridge:
        summaries = { p["name"]: p for p in bridge.profiles(names) }

    folds = []
    for mode_name in sorted({ r["mode"] for r in records }):
        for name in names:
            recs = [ r for r in records if r["mode"] == mode_name and r["profile"] == name ]
            for s in sites:
                folds.append(((mode_name, name), (s.name, recs, summaries[name]["weights"], len(summaries[name]["features"]))))

    echo(f"Fitting {len(folds)} leave-one-site-out weight sets...", always=True)

    weights: dict = { s.name: {} for s in sites }
    with ProcessPoolExecutor(max_workers=workers) as pool:
        futures = { pool.submit(_fit_fold, args): key for key, args in folds }
        for future in as_completed(futures):
            mode_name, name = futures[future]
            held_out, w = future.result()
            features = summaries[name]["features"]

            weights[held_out].setdefault(mode_name, {})[name] = { feat: float(x) for feat, x in zip(features, w) }

    return weights


def _run_evaluation() -> None:
    dataset_dir = Path(parse_option("--dataset") or DEFAULT_DATASET_DIR)
    hashloc_dir = Path(parse_option("--hashloc") or DEFAULT_HASHLOC_DIR)
    crossval = parse_flag("--crossval")
    workers = int(parse_option("--workers") or "8")
    modes = _parse_modes(parse_option("--modes") or "1")
    methods_raw = parse_option("--methods") or "all"
    methods = list(BASELINES) if methods_raw == "all" else [] if methods_raw == "none" else methods_raw.split(",")
    names = _list_option("--profiles", "S,M,L")
    sketches = _list_option("--sketches")
    weight_sets = _list_option("--weights", "default")
    ablation = parse_option("--ablation")
    keep = int(parse_option("--fit-keep") or "20")
    run_name = parse_option("--name") or ("crossval" if crossval else "main")

    unknown = set(weight_sets) - set(_WEIGHT_SETS)
    if unknown:
        raise ValueError(f"Unknown weight sets: {', '.join(sorted(unknown))}")

    sites = discover_sites(dataset_dir, cross_validation=crossval)
    if parse_option("--sites"):
        keep_sites = set(parse_option("--sites").split(","))
        sites = [ s for s in sites if s.name in keep_sites ]
    sites = [ sites[i] for i in parse_split(len(sites)) ]
    if not sites:
        raise ReferenceError(f"No sites found in '{dataset_dir}' (need xpaths.csv and classified.csv per site folder)")

    # Base profiles always run: cheap, and the reference for every weight variant.
    spec = {
        "task": "main",
        "names": names,
        "ablation": ablation,
        "sketches": sketches,
        "weight_sets": [ w for w in weight_sets if w == "similopp" ],
        "uncompressed": parse_flag("--uncompressed"),
        "keep": keep,
        "band_sizes": [ int(x.split(":")[1]) for x in _list_option("--lookup") if x.startswith("buckets:") ],
        "no_spatial": parse_flag("--no-spatial"),
    }

    if names or ablation:
        with HashLocBridge(hashloc_dir) as bridge:  # fail fast if Node or the library build is missing
            echo(f"HashLoc {bridge.info()['version']} from {hashloc_dir.resolve()}", always=True)

    echo(f"Evaluating relocalization on {len(sites)} sites (modes {modes}, {len(methods)} baselines)...", always=True)

    t0 = time.time()
    rows = _run_parallel(sites, modes, methods, spec, hashloc_dir, workers, "main")

    date_id = "-".join(re.split(r"[^\d]+", datetime.now().isoformat())[:-3])
    results_dir = Path(parse_option("--out") or (_RESULTS_ROOT / date_id / run_name))
    results_dir.mkdir(parents=True, exist_ok=True)

    if "fitted" in weight_sets and names:
        if len(sites) < 3:
            sys.stderr.write("Leave-one-site-out fitting needs at least 3 sites; skipping fitted weights\n")
        else:
            weights = _fitted_weights(sites, modes, names, hashloc_dir, workers, keep)
            rows += _run_parallel(sites, modes, [], {**spec, "task": "fitted", "fitted": weights}, hashloc_dir, workers, "fitted")

            (results_dir / "fitted_weights.json").write_text(json.dumps(weights, indent=1))

    echo(f"...done ({round(time.time() - t0)}s).", always=True)

    pd.DataFrame(rows).to_csv(results_dir / "localizations.csv.gz", index=False, compression="gzip")
    from _summarize import summarize

    summarize(results_dir)

    echo(f"Results: {results_dir}", always=True)


if __name__ == "__main__":
    _run_evaluation()
