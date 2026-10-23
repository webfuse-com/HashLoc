import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import numpy as np
import pandas as pd

from util import parse_option, echo
from metrics import normalize_columns, summarize as summarize_rows


_RESULTS_ROOT = Path(__file__).parent / "results"
SUMMARY_FILENAME = "summary.json"

# Kluge & Stocco, Table 5, extended benchmark (10,376 pairs, 2,012 with broken locators), percent;
# their metric numbers in PAPER_LABELS.
PAPER_EXTENDED = {
    "Similo (Similo)":        {"parent_child": 99.0, "visual_textual_overlap": 99.0, "exact_match": 99.0, "exact_match_broken": 95.8, "visual_overlap": 99.0, "top10": 99.8, "fitness": 97.6},
    "VON Similo (VON)":       {"parent_child": 97.9, "visual_textual_overlap": 98.9, "exact_match": 91.0, "exact_match_broken": 83.9, "visual_overlap": 98.9, "top10": 99.8, "fitness": 90.6},
    "Similo++ (Ext, M9)":     {"parent_child": 99.8, "exact_match": 99.7, "fitness": 99.4},
    "VON Similo++ (Ext, M8)": {"parent_child": 98.2, "visual_textual_overlap": 99.4, "exact_match": 91.3, "exact_match_broken": 84.5, "visual_overlap": 99.4, "top10": 99.9, "fitness": 91.1},
    "HybridSimilo (Ext, M9)": {"parent_child": 99.8, "visual_textual_overlap": 99.8, "exact_match": 99.7, "exact_match_broken": 98.8, "visual_overlap": 99.8, "top10": 99.9, "fitness": 99.4},
}
PAPER_LABELS = {"exact_match": "M4", "exact_match_broken": "M5", "top10": "M8", "parent_child": "M1",
                "visual_textual_overlap": "M3", "visual_overlap": "M7", "fitness": "M9"}

METRICS = list(PAPER_LABELS)


def _fmt(x, nd=2):
    return "" if x is None or (isinstance(x, float) and np.isnan(x)) else f"{x:.{nd}f}"


def _md(df: pd.DataFrame) -> str:
    cols = list(df.columns)
    out = ["| " + " | ".join(map(str, cols)) + " |", "| " + " | ".join("---" for _ in cols) + " |"]
    for _, r in df.iterrows():
        out.append("| " + " | ".join(_fmt(v) if isinstance(v, float) else str(v) for v in r.values) + " |")
    return "\n".join(out)


def _mode_months(df: pd.DataFrame) -> dict:
    return df.groupby("mode").months.median().to_dict()


# --- decomposition and margin analysis --------------------------------------------------------


PAIR_KEY = ["site", "old_date", "new_date", "row"]
MARGIN_BINS = [0.0, 0.01, 0.03, 0.1, 0.3, 1.0001]


def decomposition_table(df: pd.DataFrame, mode: str) -> pd.DataFrame:
    """A = Similo++, B = HashLoc scoring on uncompressed features, C = the short code, with equal weights
    within each row. B - C is the accuracy the code length costs; A - B the effect of HashLoc's design."""
    d = df[df["mode"] == mode]
    ref = d[d.method == "Similo++ (Ext, M9)"].sort_values(PAIR_KEY)
    rows = []
    for unc in sorted(m for m in d.method.unique() if m.endswith(" (uncompressed)")):
        comp_name = unc.removesuffix(" (uncompressed)")
        b = d[d.method == unc].sort_values(PAIR_KEY)
        c = d[d.method == comp_name].sort_values(PAIR_KEY)
        if len(b) != len(c) or not len(b):
            continue
        profile, _, weights = comp_name.removeprefix("HashLoc ").partition("@")
        bm, cm = b.exact_match.to_numpy(bool), c.exact_match.to_numpy(bool)
        row = {"profile": profile, "weights": weights or "default", "chars": int(c.chars.iloc[0]),
               "uncompressed_exact_match": bm.mean() * 100, "code_exact_match": cm.mean() * 100,
               "compression_cost": (bm.mean() - cm.mean()) * 100, "p_uncompressed_vs_code": mcnemar_p(bm, cm)}
        if len(ref) == len(b):
            am = ref.exact_match.to_numpy(bool)
            row = {**row, "similo_pp_exact_match": am.mean() * 100, "design_effect": (am.mean() - bm.mean()) * 100,
                   "p_similo_pp_vs_code": mcnemar_p(am, cm)}
        rows.append(row)
    return pd.DataFrame(rows)


def margin_table(df: pd.DataFrame, mode: str) -> pd.DataFrame:
    """Observed rate at which the code's top-1 differs from uncompressed scoring's top-1, against the
    bound of Proposition 1, by the uncompressed margin between the best and second-best candidate."""
    d = df[df["mode"] == mode]
    rows = []
    for unc in sorted(m for m in d.method.unique() if m.endswith(" (uncompressed)")):
        b = d[d.method == unc].sort_values(PAIR_KEY)
        c = d[d.method == unc.removesuffix(" (uncompressed)")].sort_values(PAIR_KEY)
        if len(b) != len(c) or not len(b) or b.bound.isna().all():
            continue
        margin = (b.s1 - b.s2.fillna(0)).to_numpy()
        differs = b.top1.to_numpy() != c.top1.to_numpy()
        bound = b.bound.to_numpy()
        bins = pd.cut(margin, MARGIN_BINS, right=False)
        for interval in bins.categories:
            sel = np.asarray(bins == interval)
            if not sel.any():
                continue
            rows.append({"method": unc.removesuffix(" (uncompressed)"), "margin": f"[{interval.left:g}, {min(interval.right, 1):g})",
                         "localizations": int(sel.sum()), "disagreement": differs[sel].mean() * 100,
                         "bound_mean": bound[sel].mean() * 100, "nontrivial_bounds": (bound[sel] < 1).mean() * 100})
        rows.append({"method": unc.removesuffix(" (uncompressed)"), "margin": "all", "localizations": len(b),
                     "disagreement": differs.mean() * 100, "bound_mean": bound.mean() * 100,
                     "nontrivial_bounds": (bound < 1).mean() * 100})
    return pd.DataFrame(rows)


# --- figures ------------------------------------------------------------------------------------


# --- figures and statistics ----------------------------------------------------------------


def _plots(df: pd.DataFrame, summary: pd.DataFrame, out: Path, suffix: str) -> list[str]:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    files = []
    months = _mode_months(df)
    # accuracy vs code length, one panel per mode
    sc = summary[summary.method.str.startswith("HashLoc")]
    base = summary[~summary.method.str.startswith("HashLoc")]
    for mode in summary["mode"].unique():
        fig, ax = plt.subplots(figsize=(6.4, 4))
        s = sc[sc["mode"] == mode].sort_values("chars")
        main = s[s.method.str.fullmatch(r"HashLoc [SML]")]
        abl = s[s.method.str.contains(r"HashLoc L-")]
        if len(abl):
            ax.scatter(abl.chars, abl.exact_match, s=12, alpha=0.5, label="L minus one group")
        ax.plot(main.chars, main.exact_match, "o-", label="HashLoc S / M / L")
        for _, r in main.iterrows():
            ax.annotate(r.method.split()[-1], (r.chars, r.exact_match), textcoords="offset points", xytext=(4, -10))
        shown = ("Similo (Similo)", "Similo++ (Ext, M9)", "HybridSimilo (Ext, M9)", "VON Similo (VON)", "XPath", "ID-XPath")
        levels: dict = {}
        for _, r in base[(base["mode"] == mode) & base.method.isin(shown)].iterrows():
            levels.setdefault(round(float(r.exact_match), 2), []).append(r.method)
        for k, (y, names) in enumerate(sorted(levels.items())):
            ax.axhline(y, ls="--", lw=0.8, color="gray")
            ax.annotate(" = ".join(names) + f"  ({y:.2f})", xy=(0.01, y), xycoords=("axes fraction", "data"),
                        fontsize=7, va="bottom", color="dimgray")
        ax.set_xlabel("code length (characters)")
        ax.set_ylabel("exact match (%)")
        ax.set_title(f"Accuracy vs code length, {mode} (~{months.get(mode, 0):.0f} months)")
        ax.legend(fontsize=7, loc="lower right")
        f = out / f"accuracy_vs_length_{mode}{suffix}.png"
        fig.tight_layout()
        fig.savefig(f, dpi=150)
        plt.close(fig)
        files.append(f.name)
    # accuracy vs version gap
    if summary["mode"].nunique() > 1:
        fig, ax = plt.subplots(figsize=(6.4, 4))
        for m, g in summary.groupby("method", sort=False):
            if m.startswith("HashLoc") and not re.fullmatch(r"HashLoc [SML]", m):
                continue
            g = g.assign(months=g["mode"].map(months)).sort_values("months")
            ax.plot(g.months, g.exact_match, "o-", ms=3, label=m)
        ax.set_xlabel("months between versions")
        ax.set_ylabel("exact match (%)")
        ax.set_title("Accuracy vs version gap")
        ax.legend(fontsize=6, ncol=2)
        f = out / f"accuracy_vs_gap{suffix}.png"
        fig.tight_layout()
        fig.savefig(f, dpi=150)
        plt.close(fig)
        files.append(f.name)
    return files


SKETCH_METHOD = re.compile(r"HashLoc ([SML])\+([a-z0-9-]+)-b(\d+)")


def mcnemar_p(a: np.ndarray, b: np.ndarray) -> float:
    """Exact two-sided McNemar test on paired binary outcomes (same localizations, two methods)."""
    from scipy.stats import binomtest

    only_a, only_b = int((a & ~b).sum()), int((~a & b).sum())
    if only_a + only_b == 0:
        return 1.0
    return binomtest(only_a, only_a + only_b, 0.5).pvalue


def sketch_table(summary: pd.DataFrame, mode: str, df: pd.DataFrame | None = None) -> pd.DataFrame:
    """Equal-length comparison of sketch algorithms per profile (rows from --sketches), with the
    exact McNemar p-value of each variant against the best variant of the same profile."""
    rows = []
    s = summary[summary["mode"] == mode]
    for _, r in s.iterrows():
        m = SKETCH_METHOD.fullmatch(r.method)
        if not m:
            continue
        rows.append({"profile": m.group(1), "sketch": f"{m.group(2)} (b={m.group(3)})", "chars": int(r.chars),
                     "exact_match": r.exact_match, "exact_match_broken": r.exact_match_broken, "top10": r.top10, "fitness": r.fitness})
    if not rows:
        return pd.DataFrame()
    t = pd.DataFrame(rows).sort_values(["profile", "exact_match"], ascending=[True, False])
    best = t.groupby("profile").exact_match.transform("max")
    t = t.assign(delta_to_best=t.exact_match - best)
    if df is not None:
        key = ["site", "old_date", "new_date", "row"]
        d = df[df["mode"] == mode]
        pvals = []
        for _, r in t.iterrows():
            top = t[t.profile == r.profile].iloc[0]
            name = lambda row: f"HashLoc {row.profile}+{row.sketch.split(' ')[0]}-b{row.sketch.split('=')[1].rstrip(')')}"
            a = d[d.method == name(r)].sort_values(key).exact_match.to_numpy(bool)
            b = d[d.method == name(top)].sort_values(key).exact_match.to_numpy(bool)
            pvals.append(float("nan") if r.sketch == top.sketch or len(a) != len(b) else mcnemar_p(a, b))
        t = t.assign(p_vs_best=pvals)
    return t


def size_table(df: pd.DataFrame, mode: str) -> pd.DataFrame:
    """Per localization: bytes a stored-fingerprint method keeps for the old element, against code lengths."""
    d = df[df["mode"] == mode]
    rows = []
    if "stored_bytes" in d.columns:
        for name, g in d[d.stored_bytes > 0].groupby("method", sort=False):
            b, z = g.stored_bytes, g.stored_deflate
            rows.append({"method": name, "localizations": len(g), "median_bytes": float(b.median()), "mean_bytes": float(b.mean()),
                         "p90_bytes": float(b.quantile(0.9)), "max_bytes": float(b.max()), "median_deflated_bytes": float(z.median())})
    if "selector_bytes" in d.columns and (d.selector_bytes > 0).any():
        g = d[d.method == d[d.selector_bytes > 0].method.iloc[0]]
        b = g.selector_bytes
        rows.append({"method": "Shortest unique selector", "localizations": len(g), "median_bytes": float(b.median()), "mean_bytes": float(b.mean()),
                     "p90_bytes": float(b.quantile(0.9)), "max_bytes": float(b.max()), "median_deflated_bytes": float("nan")})
    for name, g in d[d.method.str.fullmatch(r"HashLoc [SML]")].groupby("method", sort=False):
        chars = float(g.chars.iloc[0])
        rows.append({"method": name, "localizations": len(g), "median_bytes": chars, "mean_bytes": chars,
                     "p90_bytes": chars, "max_bytes": chars, "median_deflated_bytes": float("nan")})

    return pd.DataFrame(rows)


def _records(df: pd.DataFrame) -> list[dict]:
    """Table rows as JSON objects; NaN becomes null."""
    return json.loads(df.to_json(orient="records", double_precision=4))


LOOKUP_METHOD = re.compile(r"HashLoc ([SML])(?: \[buckets r=(\d+)\])?")


def lookup_table(df: pd.DataFrame, mode: str) -> pd.DataFrame:
    """Full scan vs bucket lookup per profile: accuracy and the share of the page actually scored."""
    d = df[df["mode"] == mode]
    if "scored" not in d.columns or not d.method.str.contains("[buckets", regex=False).any():
        return pd.DataFrame()
    rows = []
    for name, g in d.groupby("method", sort=False):
        m = LOOKUP_METHOD.fullmatch(name)
        if not m or not (g.page_size > 0).all():
            continue
        rows.append({"method": name, "profile": m.group(1), "lookup": f"buckets r={m.group(2)}" if m.group(2) else "scan",
                     "exact_match": g.exact_match.mean() * 100, "top10": g.top10.mean() * 100,
                     "mean_scored": float(g.scored.mean()), "mean_page_size": float(g.page_size.mean()),
                     "scored_share": float((g.scored / g.page_size).mean() * 100),
                     "no_candidates": float((g.scored == 0).mean() * 100)})
    return pd.DataFrame(rows).sort_values([ "profile", "lookup" ]) if rows else pd.DataFrame()


def write_summary(df: pd.DataFrame, summary: pd.DataFrame, out: Path) -> None:
    """summary.json: per mode, every table the paper draws on; plus the figure files."""
    months = _mode_months(df)
    result = {"sites": int(df.site.nunique()), "modes": {}}

    for mode in summary["mode"].unique():
        section: dict = {"months": round(float(months[mode]), 1)}
        s = summary[summary["mode"] == mode].drop(columns=[ "mode" ])
        section["metrics"] = _records(s)

        # The paper's Table 5 covers the 30 main websites; other site sets (cross-validation) have no reference.
        if mode == "gap1" and df.site.nunique() == 30:
            ref = []
            for name, vals in PAPER_EXTENDED.items():
                r = s[s.method == name]
                if len(r):
                    ref.append({"method": name,
                                "ours": {k: round(float(r[k].iloc[0]), 4) for k in vals},
                                "paper": vals,
                                "paper_labels": {k: PAPER_LABELS[k] for k in vals}})
            if ref:
                section["replication"] = ref

        tables = {
            "stored_size": size_table(df, mode),
            "decomposition": decomposition_table(df, mode),
            "margin_analysis": margin_table(df, mode),
            "sketches": sketch_table(summary, mode, df),
            "lookup": lookup_table(df, mode),
        }
        for key, table in tables.items():
            if key == "stored_size" and not (len(table) and (table["max_bytes"] > 50).any()):
                continue
            if not table.empty:
                section[key] = _records(table)

        abl = summary[(summary["mode"] == mode) & summary.method.str.contains(r"HashLoc L-")]
        full = summary[(summary["mode"] == mode) & (summary.method == "HashLoc L")]
        if len(abl) and len(full):
            f4, fc = float(full.exact_match.iloc[0]), int(full.chars.iloc[0])
            t = abl.assign(group=abl.method.str.replace("HashLoc L-", ""), delta_exact_match=abl.exact_match - f4,
                           chars_saved=fc - abl.chars.astype(int))[[ "group", "chars", "chars_saved", "exact_match", "delta_exact_match", "exact_match_broken" ]]
            section["ablation"] = _records(t.sort_values("delta_exact_match"))

        result["modes"][mode] = section

    result["figures"] = _plots(df, summary, out, "")
    (out / SUMMARY_FILENAME).write_text(json.dumps(result, indent=2), encoding="utf-8")


def summarize(results_dir: Path) -> None:
    """Summary and figures for one results directory (from localizations.csv.gz)."""
    localizations = results_dir / "localizations.csv.gz"
    if not localizations.exists():
        raise ReferenceError(f"Results do not exist '{localizations}'")

    df = normalize_columns(pd.read_csv(localizations))
    summary = summarize_rows(df)

    write_summary(df, summary, results_dir)


if __name__ == "__main__":
    date = parse_option("--date")
    if not date:
        raise ValueError("Missing results date (--date <id>)")

    name = parse_option("--name")
    date_dir = _RESULTS_ROOT / date
    results_dirs = [ date_dir / name ] if name else sorted(d for d in date_dir.iterdir() if d.is_dir())

    for results_dir in results_dirs:
        summarize(results_dir)
