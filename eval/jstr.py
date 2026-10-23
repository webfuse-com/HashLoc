# String semantics of the JVM (baselines) and of JavaScript (HashLoc) reproduced in Python.
#
# Both platforms use UTF-16 code units for length, indexing and slicing. Python strings use code
# points, so astral characters (emoji, some CJK) would otherwise change lengths, truncation points
# and edit distances. Strings are converted to a "unit string": a Python str in which every
# astral character is replaced by its two surrogate code points.

import re

_ASTRAL = re.compile("[\U00010000-\U0010FFFF]")


def units(s: str) -> str:
    """UTF-16 unit string: astral characters become surrogate pairs (len == Java/JS length)."""
    if not _ASTRAL.search(s):
        return s
    b = s.encode("utf-16-le", "surrogatepass")
    return "".join(chr(b[i] | (b[i + 1] << 8)) for i in range(0, len(b), 2))


def from_units(u: str) -> str:
    """Inverse of units(); lone surrogates are kept."""
    if not any(0xD800 <= ord(c) <= 0xDFFF for c in u):
        return u
    return u.encode("utf-16-le", "surrogatepass").decode("utf-16-le", "surrogatepass")


def js_utf8(u: str) -> bytes:
    """Bytes produced by JavaScript's TextEncoder for a unit string (lone surrogates -> U+FFFD)."""
    if not any(0xD800 <= ord(c) <= 0xDFFF for c in u):
        return u.encode("utf-8")
    return u.encode("utf-16-le", "surrogatepass").decode("utf-16-le", "replace").encode("utf-8")


# --- Java -------------------------------------------------------------------------------------

_JAVA_WS_PLUS = re.compile(r"[ \t\n\x0b\f\r]+")  # java.util.regex "\s+" without UNICODE_CHARACTER_CLASS
_SPACE_OR_NL = re.compile(r"[ \n]")              # "( |\n)"


def java_split(s: str, pattern: re.Pattern) -> list[str]:
    """String.split(regex): no match -> [s]; keeps leading empty strings, drops trailing ones."""
    if not pattern.search(s):
        return [s]
    parts = pattern.split(s)
    while parts and parts[-1] == "":
        parts.pop()
    return parts


def split_ws(s: str) -> list[str]:
    return java_split(s, _JAVA_WS_PLUS)


def split_space_nl(s: str) -> list[str]:
    return java_split(s, _SPACE_OR_NL)


def java_trim(s: str) -> str:
    """String.trim(): strips code points <= U+0020 at both ends."""
    i, j = 0, len(s)
    while i < j and ord(s[i]) <= 0x20:
        i += 1
    while j > i and ord(s[j - 1]) <= 0x20:
        j -= 1
    return s[i:j]


def _one(c: str, f) -> str:
    r = f(c)
    return r if len(r) == 1 else c


def fold_key(s: str) -> str:
    """Key with key(a) == key(b) iff a.equalsIgnoreCase(b) (char-wise upper, then lower)."""
    return "".join(_one(_one(c, str.upper), str.lower) for c in s)


def java_lower(u: str) -> str:
    """String.toLowerCase() on a unit string (surrogates are left untouched, as for BMP-only text)."""
    return u.lower()
