import math
import sys
from typing import Optional


_RAW_ARGS = [None, *sys.argv[1:]]


def parse_flag(arg: str) -> bool:
    return arg in _RAW_ARGS

def parse_option(arg: str) -> Optional[str]:
    try:
        i = _RAW_ARGS.index(arg)
    except ValueError:
        return None

    return _RAW_ARGS[i + 1] if i + 1 < len(_RAW_ARGS) else None

def parse_split(count: int) -> range:
    split = (parse_option("--split") or "0").split(",")
    split_size = int(split[0]) if split[0] and int(split[0]) > 0 else math.inf
    split_offset = int(split[1]) if len(split) > 1 and split[1] else 0
    split_offset_end = min(count, split_offset + (split_size if split_size != math.inf else count))

    return range(split_offset, split_offset_end)

def echo(message: str, always: bool = False) -> None:
    if not always and not parse_flag("--verbose"):
        return

    print(f"\x1b[2m{message}\x1b[0m")
