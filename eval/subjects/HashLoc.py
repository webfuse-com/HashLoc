import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from metrics import make_row


def collect_rows(bridge, profiles: list[dict], site: str, mode: str, pairs: list, targets: list, page_key: str, keep: int) -> list[dict]:
    """Per-segment similarity vectors of the top candidates (input to leave-one-site-out weight fitting)."""
    rows = []
    for prof in profiles:
        for _, record in zip(pairs, bridge.similarities(page_key, prof["name"], targets, keep=keep)):
            rows.append({
                "site": site,
                "mode": mode,
                "profile": prof["name"],
                "truth": record["truth"],
                "similarities": record["similarities"],
            })

    return rows


def locate_rows(bridge, profiles: list[dict], mode: str, pairs: list, targets: list, page_key: str, new_elements: list,
                visual_overlaps: list, uncompressed: bool, fitted: bool, band_sizes: list[int] | None = None) -> list[dict]:
    """One row per (profile, localization): the code's ranking, and optionally uncompressed scoring with the bound."""
    rows = []
    for prof in profiles:
        name = prof["name"]
        if fitted:
            if not name.endswith(f":{mode}"):
                continue
            label = name.split(":")[0]
        else:
            label = name

        variants = [ (False, f"HashLoc {label}", None) ]
        if uncompressed and prof["kind"] in ("base", "weights"):
            variants.append((True, f"HashLoc {label} (uncompressed)", None))
        if prof["kind"] == "base" and not fitted:
            variants += [ (False, f"HashLoc {label} [buckets r={r}]", r) for r in (band_sizes or []) ]

        for exact, method, band_size in variants:
            for p, loc in zip(pairs, bridge.locate(page_key, name, targets, exact=exact, band_size=band_size)):
                row = make_row(
                    method, p, loc["order"], loc["scores"], 1.0, new_elements, visual_overlaps[p.target.index],
                    chars=prof["chars"],
                    bound=float("nan") if loc["bound"] is None else loc["bound"],
                )
                row.rank = loc["rank"]
                row.scored, row.page_size = loc["scored"], loc["pageSize"]
                row.top10 = 0 < row.rank <= 10

                rows.append({**row.dict(), "mode": mode, "code": loc["code"]})

    return rows
