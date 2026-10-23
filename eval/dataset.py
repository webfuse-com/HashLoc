# Loading the Kluge & Stocco benchmark and building localization pairs.
#
# Mirrors util/Load.scala, evalutation/EvaluationData.scala, EvaluationComputing.firstAndLastMapper
# and ComputeClassification.classifyElements from the replication package.

import json
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

try:  # orjson is ~5x faster on the large elements.json files
    import orjson

    def _loads(b: bytes):
        return orjson.loads(b)
except ImportError:  # pragma: no cover
    def _loads(b: bytes):
        return json.loads(b)


@dataclass(slots=True, eq=False)
class Element:
    """One DOM element as stored in elements.json (cssStyles dropped; never used by any locator)."""

    tag: str
    innerText: str | None
    nodeText: str | None
    childrenLength: int
    neighbourText: str | None
    chrome: str
    selenium: str
    idxpath: str
    cssSelector: str
    x: int
    y: int
    width: int
    height: int
    attributes: dict[str, str]
    index: int = -1  # position in its page (candidate order)

    # Element.scala accessors -------------------------------------------------------------
    def attr(self, key: str) -> str | None:
        return self.attributes.get(key)

    @property
    def visible_text(self) -> str | None:
        """getVisibleText: first of innerText, value, placeholder whose trim is non-empty."""
        from jstr import java_trim

        for v in (self.innerText, self.attributes.get("value"), self.attributes.get("placeholder")):
            if v is not None and java_trim(v) != "":
                return v
        return None

    @property
    def is_button(self) -> bool:
        t = self.tag.lower() if self.tag is not None else None
        if t is None:
            return False
        if t == "a" and "btn" in (self.attributes.get("class") or "") and self.attributes.get("class") is not None:
            return True
        if t == "button":
            return True
        typ = self.attributes.get("type")
        return t == "input" and typ is not None and typ.lower() in ("button", "submit", "reset")

    def xpath_equals(self, s: str) -> bool:
        return self.chrome == s or self.selenium == s or self.idxpath == s

    def scala_equals(self, o: "Element") -> bool:
        return (
            self.tag == o.tag
            and self.innerText == o.innerText
            and self.nodeText == o.nodeText
            and self.childrenLength == o.childrenLength
            and self.neighbourText == o.neighbourText
            and (self.chrome, self.selenium, self.idxpath) == (o.chrome, o.selenium, o.idxpath)
            and self.cssSelector == o.cssSelector
            and (self.x, self.y) == (o.x, o.y)
            and (self.width, self.height) == (o.width, o.height)
            and self.attributes == o.attributes
        )

    def tolerant_equals(self, o: "Element") -> bool:
        return (
            self.tag == o.tag
            and self.nodeText == o.nodeText
            and abs(self.x - o.x) < 10
            and abs(self.y - o.y) < 10
            and abs(self.width - o.width) < 5
            and abs(self.height - o.height) < 5
            and self.attributes == o.attributes
        )


def _element(d: dict, i: int) -> Element:
    xp = d.get("xpath") or {}
    loc = d.get("location") or (0, 0)
    dim = d.get("dimension") or (0, 0)
    return Element(
        tag=d.get("tag"),
        innerText=d.get("innerText"),
        nodeText=d.get("nodeText"),
        childrenLength=int(d.get("childrenLength") or 0),
        neighbourText=d.get("neighbourText"),
        chrome=xp.get("chrome", "-"),
        selenium=xp.get("selenium", "-"),
        idxpath=xp.get("idxpath", "-"),
        cssSelector=d.get("cssSelector") or "",
        x=int(loc[0]),
        y=int(loc[1]),
        width=int(dim[0]),
        height=int(dim[1]),
        attributes={k: v for k, v in (d.get("attributes") or {}).items()},
        index=i,
    )


def load_page(path: Path) -> list[Element]:
    raw = _loads((path / "elements.json").read_bytes())
    return [_element(d, i) for i, d in enumerate(raw)]


# --- classification ---------------------------------------------------------------------------

ELEMENT_SYMBOLS = {"same": "same", "minor": "minor", "major": "major", "deleted": "deleted", "initial": "initial"}
LOCATOR_SYMBOLS = {"same": "same", "xchange": "xchange", "lchange": "lchange", "deleted": "deleted", "initial": "initial"}


@dataclass(frozen=True, slots=True)
class Classification:
    element: str  # same | minor | major | deleted | initial
    locator: str  # same | xchange | lchange | deleted | initial

    @property
    def deleted(self) -> bool:
        return self.element == "deleted" or self.locator == "deleted"


CLASSIFICATION_SCORE = {
    ("same", "same"): 0, ("same", "xchange"): 3, ("same", "lchange"): 6,
    ("minor", "same"): 2, ("minor", "xchange"): 6, ("minor", "lchange"): 12,
    ("major", "same"): 4, ("major", "xchange"): 12, ("major", "lchange"): 24,
}


def classify_elements(before: Element, now: Element | None) -> Classification:
    """ComputeClassification.classifyElements."""
    if now is None:
        return Classification("deleted", "deleted")
    if before.scala_equals(now):
        el = "same"
    elif before.tolerant_equals(now):
        el = "minor"
    else:
        el = "major"
    same_xpath = before.chrome == now.chrome
    bid, nid = before.attributes.get("id"), now.attributes.get("id")
    same_id = bid is not None and nid is not None and bid.lower() == nid.lower()  # noneEmptyEqual(Option)
    same_idxpath = before.idxpath == now.idxpath
    if same_xpath:
        loc = "same"
    elif not same_id and not same_idxpath:
        loc = "lchange"
    else:
        loc = "xchange"
    return Classification(el, loc)


# --- site -------------------------------------------------------------------------------------


@dataclass
class Site:
    name: str
    path: Path
    dates: list[date]
    #: per date: list of (classification, xpath) in row order
    classified: dict[date, list[tuple[Classification, str]]] = field(repr=False)

    def __hash__(self) -> int:
        return hash(self.path)


def _read_classified(path: Path) -> dict[date, list[tuple[Classification, str]]]:
    lines = [l for l in path.read_text(encoding="utf-8").splitlines() if l.strip()]
    headers = [date.fromisoformat(h.strip()) for h in lines[0].split(";")]
    cols: dict[date, list[tuple[Classification, str]]] = {h: [] for h in headers}
    for line in lines[1:]:
        cells = line.split(";")
        for h, cell in zip(headers, cells):
            el, loc, xpath = cell.split("|")
            cols[h].append((Classification(el.strip(), loc.strip()), xpath))
    return cols


def discover_sites(root: Path, cross_validation: bool = False) -> list[Site]:
    """Sites with xpaths.csv and classified.csv (Load.getFullLoadedSuitableSites).

    cross_validation=True returns the zz_* sites instead (Load.crossValidate).
    """
    sites = []
    for p in sorted(root.iterdir()):
        if not p.is_dir() or p.name.startswith("."):
            continue
        if p.name.startswith("zz_") != cross_validation:
            continue
        if not ((p / "xpaths.csv").exists() and (p / "classified.csv").exists()):
            continue
        dates = sorted(date.fromisoformat(c.name) for c in p.iterdir() if c.is_dir() and _is_date(c.name))
        sites.append(Site(p.name.removeprefix("zz_"), p, dates, _read_classified(p / "classified.csv")))
    return sites


def _is_date(s: str) -> bool:
    try:
        date.fromisoformat(s)
        return True
    except ValueError:
        return False


# --- pairs ------------------------------------------------------------------------------------


@dataclass(slots=True)
class Pair:
    """One localization: find `target` (new page) given `old` (old page)."""

    site: str
    old_date: date
    new_date: date
    row: int
    old: Element
    target: Element
    classification: Classification

    @property
    def months(self) -> int:
        return (self.new_date.year - self.old_date.year) * 12 + self.new_date.month - self.old_date.month


def find_xpath(xpath: str, page: list[Element]) -> Element | None:
    """Utils.fromXpath / getElement: '-' means absent; match chrome, selenium or idxpath."""
    if xpath == "-":
        return None
    for e in page:
        if e.xpath_equals(xpath):
            return e
    raise LookupError(f"Element {xpath} not found!")


def date_pairs(site: Site, mode: str | int) -> list[tuple[date, date]]:
    """Version pairs: 1 = consecutive (4 months), k = all pairs k steps apart, 'firstlast' = first vs last."""
    d = site.dates
    if mode == "firstlast":
        return [(d[0], d[-1])] if len(d) > 1 else []
    k = int(mode)
    return [(d[i], d[i + k]) for i in range(len(d) - k)]


def pairs_for(site: Site, old_date: date, new_date: date, consecutive: bool,
              old_page: list[Element], new_page: list[Element]) -> list[Pair]:
    """Localizations for one version pair. Consecutive pairs use classified.csv labels verbatim;
    other gaps recompute the classification as firstAndLastMapper does."""
    out = []
    for row, ((_, old_x), (cls, new_x)) in enumerate(zip(site.classified[old_date], site.classified[new_date])):
        try:
            old = find_xpath(old_x, old_page)
            target = find_xpath(new_x, new_page)
        except LookupError as e:
            raise LookupError(f"{site.name} {old_date} -> {new_date}, row {row}: {e}") from None
        if old is None:
            continue
        if not consecutive:
            cls = classify_elements(old, target)
        if target is None or cls.deleted:
            continue  # result.existsOnNewVersion == false: excluded from every metric
        out.append(Pair(site.name, old_date, new_date, row, old, target, cls))
    return out
