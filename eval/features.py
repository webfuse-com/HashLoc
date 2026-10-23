# ElementFeatures (the shape hashloc's TypeScript API expects) from benchmark elements.

from dataset import Element

PAGE_WIDTH, VIEWPORT_HEIGHT = 1920, 1080  # Selenium window used for the benchmark


def features_of(e: Element) -> dict:
    """Same inputs the baselines see: tag, attributes, Chrome XPath and ID-XPath, location and
    dimension, visible text (Similo's getVisibleText rule) and Similo's precomputed neighbor text."""
    a = e.attributes
    has_box = e.width > 0 and e.height > 0
    return {
        "tag": (e.tag or "").lower(),
        "classes": (a.get("class") or "").split(),
        "name": a.get("name") or "",
        "id": a.get("id") or "",
        "href": a.get("href") or "",
        "alt": a.get("alt") or "",
        "xpath": e.chrome if e.chrome != "-" else "",
        "idXpath": e.idxpath if e.idxpath != "-" else "",
        "isButton": e.is_button,
        "geom": {"x": (e.x + e.width / 2) / PAGE_WIDTH, "y": e.y / VIEWPORT_HEIGHT,
                 "area": e.width * e.height, "shape": e.width / e.height} if has_box else None,
        "text": e.visible_text or "",
        "neighborText": e.neighbourText or "",
        "type": a.get("type") or "",
        "ariaLabel": a.get("aria-label") or "",
        "attributes": dict(a),
    }
