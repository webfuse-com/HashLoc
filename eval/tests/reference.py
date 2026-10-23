"""Scalar, line-by-line transliterations of the Java/Scala comparison functions.
Used only to verify the vectorized implementations in subjects.similo_compare."""
import math
from jstr import units, java_lower, split_ws, split_space_nl, fold_key


def i32(x):
    return ((x + 2**31) % 2**32) - 2**31


def jdiv(a, b):
    q = abs(a) // abs(b)
    return -q if (a < 0) != (b < 0) else q


# LegacyComparisons.java ------------------------------------------------------------------------
def compute_distance(s1, s2):
    costs = [0] * (len(s2) + 1)
    for i in range(len(s1) + 1):
        last = i
        for j in range(len(s2) + 1):
            if i == 0:
                costs[j] = j
            elif j > 0:
                new = costs[j - 1]
                if s1[i - 1] != s2[j - 1]:
                    new = min(min(new, last), costs[j]) + 1
                costs[j - 1] = last
                last = new
        if i > 0:
            costs[len(s2)] = last
    return costs[len(s2)]


def compare_distance(t1, t2, mx):
    s1, s2 = java_lower(t1), java_lower(t2)
    if s1 == s2:
        return mx
    if len(s1) < len(s2):
        s1, s2 = s2, s1
    big = len(s1)
    ed = compute_distance(s1, s2)
    return mx if big == 0 else (big - ed) * mx // big


def l_distance(a, b):
    if a is None or b is None:
        return 0.0
    a, b = units(a), units(b)
    a = a[:49] if len(a) > 50 else a
    b = b[:49] if len(b) > 50 else b
    return compare_distance(a, b, 100) / 100.0


def l_equal(a, b):
    return 1.0 if a is not None and b is not None and fold_key(a) == fold_key(b) else 0.0


def l_location(t, c):
    dx, dy = i32(t[0] - c[0]), i32(t[1] - c[1])
    s = i32(i32(dx * dx) + i32(dy * dy))
    d = int(math.sqrt(s)) if s >= 0 else 0
    return max(100 - d, 0) / 100.0


def l_int(v1, v2):
    v1, v2 = i32(v1), i32(v2)
    diff = i32(v1 - v2)
    dist = diff if diff == -(2**31) else abs(diff)
    mx = max(v1, v2)
    if mx == 0:
        return 1.0
    return jdiv(i32(i32(mx - dist) * 100), mx) / 100.0


def contains_word(w1, words):
    for w in words:
        if len(w1) < len(w) and (w.startswith(w1) or w.endswith(w1)):
            return True
        elif len(w) < len(w1) and (w1.startswith(w) or w1.endswith(w)):
            return True
        elif w1 == w:
            return True
    return False


def l_string_set(t1, t2):
    if t1 is None or t2 is None:
        return 0.0
    t1, t2 = units(t1), units(t2)
    if t1 == "" or t2 == "":
        return 0.0
    w1, w2 = split_ws(t1), split_ws(t2)
    exists = sum(len(w) for w in w1 if contains_word(w, w2))
    wc = max(len(t1) - len(w1) + 1, len(t2) - len(w2) + 1)
    return min(exists * 100.0 / wc, 100) / 100.0


# StringCompare.scala + commons-text ------------------------------------------------------------------
def string_set(a, b):
    A, B = set(split_space_nl(a)), set(split_space_nl(b))
    u = len(A | B)
    return len(A & B) / u if u else float("nan")


def else_set(fn):
    def g(a, b):
        if a is None or b is None:
            return 0.0
        a, b = units(a), units(b)
        return string_set(a, b) if len(a) > 50 or len(b) > 50 else fn(a, b)
    return g


def lev(a, b):
    d = compute_distance(a, b)
    m = min(max(len(a), len(b)), 50)
    return 1.0 if m == 0 else 1 - d / m


def jac(a, b):
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    A, B = set(a), set(b)
    return 1.0 * (len(A) + len(B) - len(A | B)) / len(A | B)


o_lev = else_set(lev)
o_jac = else_set(jac)


def o_equal(a, b):
    return 1.0 if a is not None and b is not None and a == b else 0.0


def o_string_set(a, b):
    return 0.0 if a is None or b is None else string_set(units(a), units(b))


def o_area(a, b):
    x, y = float(i32(a[0] * a[1])), float(i32(b[0] * b[1]))
    return 0.0 if x == 0 or y == 0 else min(x, y) / max(x, y)


def o_map(a, b):
    m = max(len(a), len(b))
    return 0.0 if m == 0 else sum(1 for k in a.keys() & b.keys() if a[k] == b[k]) / m


def o_decay(t, c, lam=0.005):
    return math.exp(-lam * math.sqrt((t[0] - c[0]) ** 2 + (t[1] - c[1]) ** 2))


def o_linear(t, c):
    return max(0, 1 - math.sqrt((t[0] - c[0]) ** 2 + (t[1] - c[1]) ** 2) / math.sqrt(1080**2 + 1920**2))
