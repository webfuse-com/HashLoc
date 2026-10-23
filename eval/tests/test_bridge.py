"""The bridge runs the sibling hashloc sources: codes are well formed, self-localization works."""
import shutil
from pathlib import Path

import pytest

from dataset import load_page
from features import features_of
from bridge import DEFAULT_HASHLOC_DIR, HashLocBridge

DATA = Path(__file__).parent / "data"
CROCKFORD = set("0123456789ABCDEFGHJKMNPQRSTVWXYZ")


@pytest.mark.skipif(shutil.which("node") is None or not (DEFAULT_HASHLOC_DIR / "dist.lib" / "api.js").exists(),
                    reason="needs Node.js and `npm run build`")
def test_bridge_self_localization():
    feats = [features_of(e) for e in load_page(DATA / "zoom-2020-01-01")]
    with HashLocBridge() as bridge:
        profiles = {p["name"]: p for p in bridge.profiles(["S", "M", "L"])}
        assert [profiles[n]["chars"] for n in "SML"] == [19, 33, 44]
        assert bridge.load_page("zoom", feats) == len(feats)
        for name in "SML":
            locs = bridge.locate("zoom", name, [(f, i) for i, f in enumerate(feats)])
            assert all(len(l["code"]) == profiles[name]["chars"] and set(l["code"]) <= CROCKFORD for l in locs)
            top1 = sum(l["rank"] == 1 for l in locs) / len(locs)
            print(f"{name}: {top1:.1%} of {len(locs)} elements relocated to themselves on the same page")
            assert top1 > 0.9  # look-alike elements (identical features) cap this below 100%
