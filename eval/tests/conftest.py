import sys
from pathlib import Path

_EVAL = Path(__file__).parent.parent

for path in (_EVAL, Path(__file__).parent):
    sys.path.insert(0, str(path))
