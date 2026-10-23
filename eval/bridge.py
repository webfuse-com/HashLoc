import json
import shutil
import subprocess
from pathlib import Path


_EVAL_DIR = Path(__file__).parent
_BRIDGE = _EVAL_DIR / "HashLoc.bridge.mjs"

DEFAULT_HASHLOC_DIR = _EVAL_DIR.parent
DEFAULT_DATASET_DIR = _EVAL_DIR.parent / "dataset"


class BridgeError(RuntimeError):
    pass


def _source_files(hashloc_dir: Path) -> list[Path]:
    return sorted((hashloc_dir / "src").rglob("*.ts"))


def check_build(hashloc_dir: Path) -> None:
    """The bridge runs the built library (dist.lib): refuse to evaluate a stale build."""
    api = hashloc_dir / "dist.lib" / "api.js"
    if not api.exists():
        raise BridgeError(f"{api} not found: run `npm run build`")

    newest = max((f.stat().st_mtime for f in _source_files(hashloc_dir)), default=0)
    if newest > api.stat().st_mtime:
        raise BridgeError("HashLoc build is older than its sources: run `npm run build`")


class HashLocBridge:
    """One Node process per worker; requests are answered in order (one JSON line each)."""

    def __init__(self, hashloc_dir: Path = DEFAULT_HASHLOC_DIR):
        node = shutil.which("node")
        if node is None:
            raise BridgeError("node not found on PATH (Node.js 22 is required for the HashLoc bridge)")
        check_build(hashloc_dir)

        self.hashloc_dir = hashloc_dir
        self._proc = subprocess.Popen(
            [ node, str(_BRIDGE), str(hashloc_dir.resolve()) ],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            bufsize=1,
        )

    def call(self, op: str, **payload):
        self._proc.stdin.write(json.dumps({"op": op, **payload}, ensure_ascii=False) + "\n")
        self._proc.stdin.flush()

        line = self._proc.stdout.readline()
        if not line:
            raise BridgeError(f"[HashLoc Bridge rc={self._proc.poll()}] exited; see the Node error output above")

        response = json.loads(line)
        if not response["ok"]:
            raise BridgeError(f"[HashLoc Bridge] {response['error']}")

        return response["result"]

    def info(self) -> dict:
        return self.call("info")

    def profiles(self, names: list[str], ablation: str | None = None, sketches: list[str] | None = None,
                 weight_sets: list[str] | None = None) -> list[dict]:
        return self.call("profiles", names=names, ablation=ablation, sketches=sketches or [], weightSets=weight_sets or [])

    def register(self, name: str, base: str, weights: dict[str, float]) -> dict:
        """Register `base` with custom per-feature weights under `name` (e.g. fold-specific fitted weights)."""
        return self.call("register", name=name, base=base, weights=weights)

    def load_page(self, key: str, features: list[dict]) -> int:
        return self.call("page", key=key, features=features)

    def locate(self, page: str, profile: str, targets: list[tuple[dict, int]], keep: int = 50, exact: bool = False,
               band_size: int | None = None) -> list[dict]:
        """exact=True scores the uncompressed features with the same profile and weights; band_size selects
        bucket lookup (only elements sharing a bucket with the code are scored)."""
        lookup = {"lookup": "buckets", "bandSize": band_size} if band_size else {}
        return self.call("locate", page=page, profile=profile, keep=keep, exact=exact, **lookup,
                         targets=[ {"features": f, "truth": t} for f, t in targets ])

    def similarities(self, page: str, profile: str, targets: list[tuple[dict, int]], keep: int = 50) -> list[dict]:
        """Per-segment similarities of the top `keep` candidates plus the truth (for weight fitting)."""
        return self.call("similarities", page=page, profile=profile, keep=keep,
                         targets=[ {"features": f, "truth": t} for f, t in targets ])

    def drop_page(self, key: str) -> None:
        self.call("drop", key=key)

    def close(self) -> None:
        if self._proc.poll() is None:
            self._proc.stdin.close()
            self._proc.wait(timeout=10)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()
