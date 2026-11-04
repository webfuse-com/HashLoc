class NeighborIndex {
  grid = /* @__PURE__ */ new Map();
  occupied = [];
  constructor(sources) {
    for (const source of sources) {
      const cellX = Math.floor(source.centerX / GRID_CELL);
      const cellY = Math.floor(source.centerY / GRID_CELL);
      const key = `${cellX},${cellY}`;
      const bucket = this.grid.get(key);
      if (bucket) {
        bucket.push(source);
      } else {
        const fresh = [source];
        this.grid.set(key, fresh);
        this.occupied.push({
          cellX,
          cellY,
          sources: fresh
        });
      }
    }
  }
  // Text of sources whose center lies in the rect grown by `margin`, nearest first. Large regions scan
  // the occupied cells instead of every covered cell; ties keep the grid order.
  textAround(element, rect, margin) {
    const left = rect.x - margin;
    const top = rect.y - margin;
    const right = rect.x + rect.width + margin;
    const bottom = rect.y + rect.height + margin;
    const centerX = rect.x + rect.width / 2;
    const centerY = rect.y + rect.height / 2;
    const firstX = Math.floor(left / GRID_CELL);
    const lastX = Math.floor(right / GRID_CELL);
    const firstY = Math.floor(top / GRID_CELL);
    const lastY = Math.floor(bottom / GRID_CELL);
    const hits = [];
    const collect = (cellX, cellY, sources) => {
      sources.forEach((source, order) => {
        if (source.centerX < left || source.centerX > right || source.centerY < top || source.centerY > bottom) return;
        if (source.element === element || element.contains(source.element)) return;
        hits.push({
          distance: Math.hypot(source.centerX - centerX, source.centerY - centerY),
          text: source.text,
          cellX,
          cellY,
          order
        });
      });
    };
    if ((lastX - firstX + 1) * (lastY - firstY + 1) <= this.occupied.length) {
      for (let cellX = firstX; cellX <= lastX; cellX++) {
        for (let cellY = firstY; cellY <= lastY; cellY++) {
          collect(cellX, cellY, this.grid.get(`${cellX},${cellY}`) ?? []);
        }
      }
    } else {
      for (const cell of this.occupied) {
        if (cell.cellX < firstX || cell.cellX > lastX || cell.cellY < firstY || cell.cellY > lastY) continue;
        collect(cell.cellX, cell.cellY, cell.sources);
      }
    }
    hits.sort(
      (first, second) => first.distance - second.distance || first.cellX - second.cellX || first.cellY - second.cellY || first.order - second.order
    );
    return truncate(hits.map((hit) => hit.text).join(" "));
  }
}
class PathCache {
  steps = /* @__PURE__ */ new WeakMap();
  absolutePaths = /* @__PURE__ */ new WeakMap();
  idPaths = /* @__PURE__ */ new WeakMap();
  absolute(element) {
    return this.extend(element, this.absolutePaths, () => null);
  }
  id(element) {
    return this.extend(element, this.idPaths, (current) => {
      const id = current.getAttribute("id");
      return id ? `//*[@id="${id}"]` : null;
    });
  }
  extend(element, memo, anchor) {
    const chain = [];
    let base = "";
    for (let current = element; current; current = current.parentElement) {
      const known = memo.get(current);
      if (known !== void 0) {
        base = known;
        break;
      }
      const anchored = anchor(current);
      if (anchored !== null) {
        memo.set(current, anchored);
        base = anchored;
        break;
      }
      chain.push(current);
    }
    for (let index = chain.length - 1; index >= 0; index--) {
      base = `${base}/${this.step(chain[index])}`;
      memo.set(chain[index], base);
    }
    return base;
  }
  step(element) {
    const cached = this.steps.get(element);
    if (cached !== void 0) return cached;
    const parent = element.parentElement;
    if (!parent) {
      const tag = element.tagName.toLowerCase();
      this.steps.set(element, tag);
      return tag;
    }
    const children = Array.from(parent.children);
    const counts = /* @__PURE__ */ new Map();
    const seen = /* @__PURE__ */ new Map();
    for (const child of children) {
      counts.set(child.tagName, (counts.get(child.tagName) ?? 0) + 1);
    }
    for (const child of children) {
      const position = (seen.get(child.tagName) ?? 0) + 1;
      const tag = child.tagName.toLowerCase();
      seen.set(child.tagName, position);
      this.steps.set(child, (counts.get(child.tagName) ?? 0) > 1 ? `${tag}[${position}]` : tag);
    }
    return this.steps.get(element) ?? element.tagName.toLowerCase();
  }
}
class DomScan {
  elements = [];
  rects = [];
  neighbors;
  rectOf;
  margin;
  contextLevels;
  pageWidth;
  viewportHeight;
  paths = new PathCache();
  constructor(document, options = {}) {
    const root = options.root ?? document.body ?? document.documentElement;
    const view = document.defaultView;
    this.rectOf = options.rectOf ?? defaultRect;
    this.margin = options.neighborMargin ?? 60;
    this.contextLevels = options.contextLevels ?? 0;
    this.pageWidth = options.pageWidth ?? Math.max(document.documentElement.scrollWidth || 0, view?.innerWidth || 0, 1);
    this.viewportHeight = options.viewportHeight ?? Math.max(view?.innerHeight || 0, 1);
    const sources = [];
    for (const element of Array.from(root.querySelectorAll("*"))) {
      if (SKIP_TAGS.has(element.tagName.toLowerCase())) continue;
      if (options.filter && !options.filter(element)) continue;
      const rect = this.rectOf(element);
      const visible = isVisible(element, rect);
      if (!visible && !options.includeHidden) continue;
      this.elements.push(element);
      this.rects.push(rect ?? {
        x: 0,
        y: 0,
        width: 0,
        height: 0
      });
      const text = visible && rect ? ownText(element) : "";
      if (rect && text) {
        sources.push({
          element,
          centerX: rect.x + rect.width / 2,
          centerY: rect.y + rect.height / 2,
          text: truncate(text, 120)
        });
      }
    }
    this.neighbors = new NeighborIndex(sources);
  }
  // Features of any element of the scanned document (candidate or not).
  features(element, rect) {
    const box = rect === void 0 ? this.rectOf(element) : rect;
    const attributes = {};
    for (const attribute of Array.from(element.attributes)) {
      attributes[attribute.name] = truncate(attribute.value, 100);
    }
    const text = visibleText(element);
    const visibleBox = box && box.width > 0 && box.height > 0 ? box : null;
    const spatial = visibleBox ? this.neighbors.textAround(element, visibleBox, this.margin) : "";
    const context = this.contextLevels > 0 ? this.blockContext(element, text) : "";
    const geom = visibleBox ? {
      x: (visibleBox.x + visibleBox.width / 2) / this.pageWidth,
      y: visibleBox.y / this.viewportHeight,
      area: visibleBox.width * visibleBox.height,
      shape: visibleBox.width / visibleBox.height
    } : null;
    const features = {
      tag: element.tagName.toLowerCase(),
      classes: Array.from(element.classList),
      name: element.getAttribute("name") ?? "",
      id: element.getAttribute("id") ?? "",
      href: element.getAttribute("href") ?? "",
      alt: element.getAttribute("alt") ?? "",
      xpath: "",
      idXpath: "",
      isButton: isButton(element),
      geom,
      text,
      neighborText: truncate(context ? `${spatial} ${context}` : spatial),
      type: element.getAttribute("type") ?? "",
      ariaLabel: element.getAttribute("aria-label") ?? "",
      attributes
    };
    lazy(features, "xpath", () => this.paths.absolute(element));
    lazy(features, "idXpath", () => this.paths.id(element));
    return features;
  }
  // Features of all candidates, in `elements` order.
  allFeatures() {
    return this.elements.map((element, index) => this.features(element, this.rects[index]));
  }
  // Text of the nearest ancestor (within `contextLevels`) that contains text beyond the element's own.
  blockContext(element, own) {
    let ancestor = element.parentElement;
    for (let level = 0; level < this.contextLevels && ancestor && ancestor.tagName.toLowerCase() !== "body"; level++) {
      const text = visibleText(ancestor);
      if (text.length > own.length + 3) return truncate(own ? text.split(own).join(" ") : text, 200);
      ancestor = ancestor.parentElement;
    }
    return "";
  }
}
const SKIP_TAGS = /* @__PURE__ */ new Set([
  "html",
  "head",
  "body",
  "script",
  "style",
  "noscript",
  "template",
  "meta",
  "link",
  "title",
  "base",
  "br",
  "wbr",
  "path",
  "defs",
  "g",
  "use",
  "symbol",
  "clippath",
  "lineargradient",
  "radialgradient",
  "stop",
  "mask",
  "pattern",
  "filter"
]);
const BUTTONISH_INPUTS = /* @__PURE__ */ new Set(["submit", "button", "reset"]);
const MAX_TEXT = 300;
const GRID_CELL = 256;
function defaultRect(element) {
  const bounds = element.getBoundingClientRect();
  const view = element.ownerDocument.defaultView;
  return {
    x: bounds.left + (view?.scrollX ?? 0),
    y: bounds.top + (view?.scrollY ?? 0),
    width: bounds.width,
    height: bounds.height
  };
}
function isVisible(element, rect) {
  if (!rect || rect.width <= 0 || rect.height <= 0) return false;
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  return !(style && (style.display === "none" || style.visibility === "hidden" || style.opacity === "0"));
}
function truncate(text, maxLength = MAX_TEXT) {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > maxLength ? collapsed.slice(0, maxLength) : collapsed;
}
function lazy(target, key, compute) {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    get: () => {
      const value = compute();
      Object.defineProperty(target, key, {
        value,
        configurable: true,
        enumerable: true,
        writable: true
      });
      return value;
    }
  });
}
function xpathStep(element) {
  const tag = element.tagName.toLowerCase();
  const parent = element.parentElement;
  if (!parent) return tag;
  const sameTag = Array.from(parent.children).filter((child) => child.tagName === element.tagName);
  return sameTag.length > 1 ? `${tag}[${sameTag.indexOf(element) + 1}]` : tag;
}
function ownText(element) {
  let text = "";
  for (const node of Array.from(element.childNodes)) {
    if (node.nodeType === 3) {
      text += " " + (node.nodeValue ?? "");
    }
  }
  return text.trim();
}
function visibleText(element) {
  const tag = element.tagName.toLowerCase();
  if (tag === "input") {
    const type = (element.getAttribute("type") ?? "text").toLowerCase();
    if (BUTTONISH_INPUTS.has(type)) {
      return truncate(element.value || element.getAttribute("value") || "");
    }
    return truncate(element.getAttribute("placeholder") ?? "");
  }
  if (tag === "textarea") return truncate(element.getAttribute("placeholder") ?? "");
  if (tag === "img") return truncate(element.getAttribute("alt") ?? "");
  const inner = element.innerText;
  return truncate(typeof inner === "string" ? inner : element.textContent ?? "");
}
function absoluteXPath(element) {
  const steps = [];
  for (let current = element; current; current = current.parentElement) {
    steps.unshift(xpathStep(current));
  }
  return "/" + steps.join("/");
}
function idXPath(element) {
  const steps = [];
  for (let current = element; current; current = current.parentElement) {
    const id = current.getAttribute("id");
    if (id) {
      steps.unshift(`*[@id="${id}"]`);
      return "//" + steps.join("/");
    }
    steps.unshift(xpathStep(current));
  }
  return "/" + steps.join("/");
}
function isButton(element) {
  const tag = element.tagName.toLowerCase();
  if (tag === "button") return true;
  if (tag === "a") {
    return Array.from(element.classList).some((className) => className.toLowerCase().indexOf("btn") >= 0);
  }
  if (tag === "input") return BUTTONISH_INPUTS.has((element.getAttribute("type") ?? "").toLowerCase());
  return false;
}
export {
  DomScan,
  absoluteXPath,
  idXPath,
  isButton,
  visibleText
};
