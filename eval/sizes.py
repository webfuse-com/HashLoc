# Size of the record a stored-fingerprint method keeps per element: the property values it reads
# from the old element, without redundancy, as compact JSON (values only), in UTF-8 bytes. Codes are
# ASCII, so bytes and characters compare directly. Raw deflate gives the size if the record were
# compressed as well.

import json
import zlib

from dataset import Element


def _similo_values(e: Element) -> list:
    a = e.attributes
    return [ e.tag, a.get("class"), a.get("name"), a.get("id"), a.get("href"), a.get("alt"), e.chrome, e.idxpath,
             e.is_button, e.x, e.y, e.width, e.height, e.visible_text, e.neighbourText ]


def _similo_pp_values(e: Element) -> list:
    # Name, ID, href, alt, type and aria-label are read from the attribute map, so they are stored once.
    return [ e.tag, e.chrome, e.idxpath, e.x, e.y, e.width, e.height, e.innerText, e.neighbourText, e.attributes ]


# Baseline key -> record. VON variants and HybridSimilo also compare groups of visually overlapping
# elements, so their records are lower bounds (the element's own record).
RECORDS = {
    "similo": _similo_values,
    "von_similo": _similo_values,
    "similo_pp": _similo_pp_values,
    "similo_pp_min": _similo_pp_values,
    "von_similo_pp": _similo_pp_values,
    "hybrid": _similo_pp_values,
    "tag_text": lambda e: [ e.tag, e.visible_text ],
    "idxpath": lambda e: [ e.idxpath ],
    "xpath": lambda e: [ e.chrome ],
    "id": lambda e: [ e.attributes.get("id") ],
}


_SINGLE_PROPERTY = { "id", "idxpath", "xpath" }


def _deflate(data: bytes) -> int:
    compressor = zlib.compressobj(9, zlib.DEFLATED, -15)
    return len(compressor.compress(data) + compressor.flush())


def record_size(method_key: str, e: Element) -> tuple[int, int]:
    """(bytes, deflated bytes) of the stored record; (0, 0) for methods without a measured record, and for
    single-property locators whose property is absent (e.g. ID locators of elements without an ID)."""
    values = RECORDS.get(method_key)
    if values is None:
        return 0, 0
    if method_key in _SINGLE_PROPERTY and not any(values(e)):
        return 0, 0

    data = json.dumps(values(e), ensure_ascii=False, separators=(",", ":")).encode("utf-8")

    return len(data), _deflate(data)


# --- shortest unique locator ---------------------------------------------------------------------
#
# The shortest CSS selector or XPath that matches exactly one element of the page, as a selector
# generator would produce it: #id, tag[attr="value"], [attr="value"], tag.class, .class, the full class
# combination, the tag, or an XPath on short visible text. Without a unique candidate, the shorter of
# ID-XPath and absolute XPath. The benchmark stores a page's relevant elements, not its full DOM, so
# uniqueness is checked against those: the lengths are a lower bound.

_SKIP_ATTRIBUTES = { "class", "style" }
_MAX_TEXT = 50


def _css_string(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def _candidates(e: Element) -> list[tuple[str, tuple]]:
    """(selector, key) pairs; elements sharing a key match the same selector."""
    tag = (e.tag or "").lower()
    out = []
    element_id = e.attributes.get("id")
    if element_id:
        selector = f"#{element_id}" if element_id.replace("-", "").replace("_", "").isalnum() and not element_id[0].isdigit() else f"[id={_css_string(element_id)}]"
        out.append((selector, ("id", element_id)))
    for name, value in e.attributes.items():
        if name in _SKIP_ATTRIBUTES or name == "id" or value is None or value == "":
            continue
        out.append((f"[{name}={_css_string(value)}]", ("attr", name, value)))
        out.append((f"{tag}[{name}={_css_string(value)}]", ("tag-attr", tag, name, value)))
    classes = [ c for c in (e.attributes.get("class") or "").split() if c ]
    for c in classes:
        if c.replace("-", "").replace("_", "").isalnum() and not c[0].isdigit():
            out.append((f".{c}", ("class", c)))
            out.append((f"{tag}.{c}", ("tag-class", tag, c)))
    if len(classes) > 1:
        out.append((tag + "".join(f".{c}" for c in classes), ("tag-classes", tag, tuple(sorted(classes)))))
    out.append((tag, ("tag", tag)))
    text = (e.innerText or "").strip()
    if text and len(text) <= _MAX_TEXT and '"' not in text:
        out.append((f'//{tag}[text()="{text}"]', ("text", tag, text)))
    return out


class SelectorIndex:
    """Counts, per page, how many elements share each selector key."""

    def __init__(self, page: list[Element]):
        self.counts: dict = {}
        for e in page:
            for _, key in _candidates(e):
                self.counts[key] = self.counts.get(key, 0) + 1

    def shortest(self, e: Element) -> str:
        unique = [ selector for selector, key in _candidates(e) if self.counts.get(key, 0) == 1 ]
        fallback = [ p for p in (e.idxpath, e.chrome) if p ]
        return min(unique or fallback, key=lambda s: len(s.encode("utf-8")))


def selector_size(index: SelectorIndex, e: Element) -> int:
    return len(index.shortest(e).encode("utf-8"))
