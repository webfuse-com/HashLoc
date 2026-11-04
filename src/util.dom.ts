import { type ElementFeatures, type Geometry, type Rect } from "./types.js";


export interface DomOptions {
	/** Subtree or shadow root to index (default: document.body). */
	root?: Element | ShadowRoot;
	/** Layout override, e.g. for tests or non-rendering environments. Must return document coordinates. */
	rectOf?: (element: Element) => Rect | null;
	/** Keep elements without a visible box (default false). */
	includeHidden?: boolean;
	/** Extra filter for candidate elements. */
	filter?: (element: Element) => boolean;
	/** Margin in px around an element in which neighbor text is collected (default 60). */
	neighborMargin?: number;
	/**
	 * Ancestor levels searched for an enclosing block whose text adds context, e.g. the card around a
	 * "Learn more" link. Default 0 = purely spatial neighbor text, as in Similo.
	 */
	contextLevels?: number;
	/** Override page width (default: read from the document's window). */
	pageWidth?: number;
	/** Override viewport height (default: read from the document's window). */
	viewportHeight?: number;
}

interface TextSource {
	element: Element;
	centerX: number;
	centerY: number;
	text: string;
}

interface NeighborHit {
	distance: number;
	text: string;
	cellX: number;
	cellY: number;
	order: number;
}

interface OccupiedCell {
	cellX: number;
	cellY: number;
	sources: TextSource[];
}


class NeighborIndex {
	private readonly grid: Map<string, TextSource[]> = new Map<string, TextSource[]>();
	private readonly occupied: OccupiedCell[] = [];

	constructor(sources: TextSource[]) {
		for(const source of sources) {
			const cellX: number = Math.floor(source.centerX / GRID_CELL);
			const cellY: number = Math.floor(source.centerY / GRID_CELL);
			const key: string = `${cellX},${cellY}`;
			const bucket: TextSource[] | undefined = this.grid.get(key);

			if(bucket) {
				bucket.push(source);
			} else {
				const fresh: TextSource[] = [ source ];

				this.grid.set(key, fresh);
				this.occupied.push({
					cellX: cellX,
					cellY: cellY,
					sources: fresh
				});
			}
		}
	}

	// Text of sources whose center lies in the rect grown by `margin`, nearest first. Large regions scan
	// the occupied cells instead of every covered cell; ties keep the grid order.
	textAround(element: Element, rect: Rect, margin: number): string {
		const left: number = rect.x - margin;
		const top: number = rect.y - margin;
		const right: number = rect.x + rect.width + margin;
		const bottom: number = rect.y + rect.height + margin;
		const centerX: number = rect.x + rect.width / 2;
		const centerY: number = rect.y + rect.height / 2;
		const firstX: number = Math.floor(left / GRID_CELL);
		const lastX: number = Math.floor(right / GRID_CELL);
		const firstY: number = Math.floor(top / GRID_CELL);
		const lastY: number = Math.floor(bottom / GRID_CELL);
		const hits: NeighborHit[] = [];

		const collect = (cellX: number, cellY: number, sources: TextSource[]): void => {
			sources.forEach((source: TextSource, order: number) => {
				if(source.centerX < left || source.centerX > right || source.centerY < top || source.centerY > bottom) return;

				if(source.element === element || call<boolean>(element, "contains", source.element)) return;

				hits.push({
					distance: Math.hypot(source.centerX - centerX, source.centerY - centerY),
					text: source.text,
					cellX: cellX,
					cellY: cellY,
					order: order
				});
			});
		};

		if((lastX - firstX + 1) * (lastY - firstY + 1) <= this.occupied.length) {
			for(let cellX: number = firstX; cellX <= lastX; cellX++) {
				for(let cellY: number = firstY; cellY <= lastY; cellY++) {
					collect(cellX, cellY, this.grid.get(`${cellX},${cellY}`) ?? []);
				}
			}
		} else {
			for(const cell of this.occupied) {
				if(cell.cellX < firstX || cell.cellX > lastX || cell.cellY < firstY || cell.cellY > lastY) continue;

				collect(cell.cellX, cell.cellY, cell.sources);
			}
		}

		hits.sort((first: NeighborHit, second: NeighborHit) =>
			first.distance - second.distance || first.cellX - second.cellX || first.cellY - second.cellY || first.order - second.order
		);

		return truncate(hits.map((hit: NeighborHit) => hit.text).join(" "));
	}
}

// XPaths of one document state, memoized per element and computed from sibling positions found once per parent.
class PathCache {
	private readonly steps: WeakMap<Element, string> = new WeakMap<Element, string>();
	private readonly absolutePaths: WeakMap<Element, string> = new WeakMap<Element, string>();
	private readonly idPaths: WeakMap<Element, string> = new WeakMap<Element, string>();

	absolute(element: Element): string {
		return this.extend(element, this.absolutePaths, () => null);
	}

	id(element: Element): string {
		return this.extend(element, this.idPaths, (current: Element) => {
			const id: string | null = attributeOf(current, "id");

			return id ? `//*[@id="${id}"]` : null;
		});
	}

	private extend(element: Element, memo: WeakMap<Element, string>, anchor: (current: Element) => string | null): string {
		const chain: Element[] = [];
		let base: string = "";

		for(let current: Element | null = element; current; current = parentOf(current)) {
			const known: string | undefined = memo.get(current);

			if(known !== undefined) {
				base = known;
				break;
			}

			const anchored: string | null = anchor(current);

			if(anchored !== null) {
				memo.set(current, anchored);
				base = anchored;
				break;
			}

			chain.push(current);
		}

		for(let index: number = chain.length - 1; index >= 0; index--) {
			base = `${base}/${this.step(chain[index])}`;
			memo.set(chain[index], base);
		}

		return base;
	}

	private step(element: Element): string {
		const cached: string | undefined = this.steps.get(element);

		if(cached !== undefined) return cached;

		const parent: Element | null = parentOf(element);

		if(!parent) {
			const tag: string = tagOf(element);

			this.steps.set(element, tag);

			return tag;
		}

		const children: Element[] = childrenOf(parent);
		const counts: Map<string, number> = new Map<string, number>();
		const seen: Map<string, number> = new Map<string, number>();

		for(const child of children) {
			counts.set(rawTag(child), (counts.get(rawTag(child)) ?? 0) + 1);
		}

		for(const child of children) {
			const position: number = (seen.get(rawTag(child)) ?? 0) + 1;
			const tag: string = tagOf(child);

			seen.set(rawTag(child), position);
			this.steps.set(child, (counts.get(rawTag(child)) ?? 0) > 1 ? `${tag}[${position}]` : tag);
		}

		return this.steps.get(element) ?? tagOf(element);
	}
}

// A scan of one document state: candidate elements, their boxes, and a neighbor-text index.
export class DomScan {
	readonly elements: Element[] = [];
	readonly rects: Rect[] = [];
	private readonly neighbors: NeighborIndex;
	private readonly rectOf: (element: Element) => Rect | null;
	private readonly margin: number;
	private readonly contextLevels: number;
	private readonly pageWidth: number;
	private readonly viewportHeight: number;
	private readonly paths: PathCache = new PathCache();

	constructor(document: Document, options: DomOptions = {}) {
		const root: Element | ShadowRoot = options.root ?? native<HTMLElement | null>(document, "body") ?? native<HTMLElement>(document, "documentElement");
		const view: Window | null = native<Window | null>(document, "defaultView");

		this.rectOf = options.rectOf ?? defaultRect;
		this.margin = options.neighborMargin ?? 60;
		this.contextLevels = options.contextLevels ?? 0;
		this.pageWidth = options.pageWidth ?? Math.max(native<number>(native<HTMLElement>(document, "documentElement"), "scrollWidth") || 0, view?.innerWidth || 0, 1);
		this.viewportHeight = options.viewportHeight ?? Math.max(view?.innerHeight || 0, 1);

		const sources: TextSource[] = [];

		for(const element of Array.from(call<NodeListOf<Element>>(root, "querySelectorAll", "*"))) {
			if(SKIP_TAGS.has(tagOf(element))) continue;

			if(options.filter && !options.filter(element)) continue;

			const rect: Rect | null = this.rectOf(element);
			const visible: boolean = isVisible(element, rect);

			if(!visible && !options.includeHidden) continue;

			this.elements.push(element);
			this.rects.push(rect ?? {
				x: 0,
				y: 0,
				width: 0,
				height: 0
			});

			const text: string = visible && rect ? ownText(element) : "";

			if(rect && text) {
				sources.push({
					element: element,
					centerX: rect.x + rect.width / 2,
					centerY: rect.y + rect.height / 2,
					text: truncate(text, 120)
				});
			}
		}

		this.neighbors = new NeighborIndex(sources);
	}

	// Features of any element of the scanned document (candidate or not).
	features(element: Element, rect?: Rect | null): ElementFeatures {
		const box: Rect | null = rect === undefined ? this.rectOf(element) : rect;
		const attributes: Record<string, string> = {};

		for(const attribute of Array.from(native<NamedNodeMap>(element, "attributes"))) {
			attributes[attribute.name] = truncate(attribute.value, 100);
		}

		const text: string = visibleText(element);
		const visibleBox: Rect | null = box && box.width > 0 && box.height > 0 ? box : null;
		const spatial: string = visibleBox ? this.neighbors.textAround(element, visibleBox, this.margin) : "";
		const context: string = this.contextLevels > 0 ? this.blockContext(element, text) : "";
		const geom: Geometry | null = visibleBox ? {
			x: (visibleBox.x + visibleBox.width / 2) / this.pageWidth,
			y: visibleBox.y / this.viewportHeight,
			area: visibleBox.width * visibleBox.height,
			shape: visibleBox.width / visibleBox.height
		} : null;

		const features: ElementFeatures = {
			tag: tagOf(element),
			classes: Array.from(native<DOMTokenList>(element, "classList")),
			name: attributeOf(element, "name") ?? "",
			id: attributeOf(element, "id") ?? "",
			href: attributeOf(element, "href") ?? "",
			alt: attributeOf(element, "alt") ?? "",
			xpath: "",
			idXpath: "",
			isButton: isButton(element),
			geom: geom,
			text: text,
			neighborText: truncate(context ? `${spatial} ${context}` : spatial),
			type: attributeOf(element, "type") ?? "",
			ariaLabel: attributeOf(element, "aria-label") ?? "",
			attributes: attributes
		};

		lazy(features, "xpath", () => this.paths.absolute(element));
		lazy(features, "idXpath", () => this.paths.id(element));

		return features;
	}

	// Features of all candidates, in `elements` order.
	allFeatures(): ElementFeatures[] {
		return this.elements.map((element: Element, index: number) => this.features(element, this.rects[index]));
	}

	// Text of the nearest ancestor (within `contextLevels`) that contains text beyond the element's own.
	private blockContext(element: Element, own: string): string {
		let ancestor: Element | null = parentOf(element);

		for(let level: number = 0; level < this.contextLevels && ancestor && tagOf(ancestor) !== "body"; level++) {
			const text: string = visibleText(ancestor);

			if(text.length > own.length + 3) return truncate(own ? text.split(own).join(" ") : text, 200);

			ancestor = parentOf(ancestor);
		}

		return "";
	}
}


const SKIP_TAGS: Set<string> = new Set<string>([
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

const BUTTONISH_INPUTS: Set<string> = new Set<string>([ "submit", "button", "reset" ]);

const MAX_TEXT: number = 300;

const GRID_CELL: number = 256;


const DESCRIPTORS: WeakMap<object, Map<string, PropertyDescriptor | null>> = new WeakMap<object, Map<string, PropertyDescriptor | null>>();


// DOM members are read from the prototype chain: a form's named controls (e.g. <input name="tagName">)
// shadow members on the form itself, but not on its prototypes.
function native<T>(target: object, key: string): T {
	const prototype: object | null = Object.getPrototypeOf(target) as object | null;

	if(!prototype) return undefined as T;

	let byKey: Map<string, PropertyDescriptor | null> | undefined = DESCRIPTORS.get(prototype);

	if(!byKey) {
		byKey = new Map<string, PropertyDescriptor | null>();
		DESCRIPTORS.set(prototype, byKey);
	}

	if(!byKey.has(key)) {
		let found: PropertyDescriptor | null = null;

		for(let current: object | null = prototype; current && !found; current = Object.getPrototypeOf(current) as object | null) {
			found = Object.getOwnPropertyDescriptor(current, key) ?? null;
		}

		byKey.set(key, found);
	}

	const descriptor: PropertyDescriptor | null = byKey.get(key) ?? null;

	if(!descriptor) return undefined as T;

	return (descriptor.get ? descriptor.get.call(target) : descriptor.value) as T;
}

function call<T>(target: object, key: string, ...args: unknown[]): T {
	return native<(...args: unknown[]) => T>(target, key).call(target, ...args);
}

function rawTag(element: Element): string {
	return native<string>(element, "tagName");
}

function tagOf(element: Element): string {
	return rawTag(element).toLowerCase();
}

function attributeOf(element: Element, name: string): string | null {
	return call<string | null>(element, "getAttribute", name);
}

function parentOf(element: Element): Element | null {
	return native<Element | null>(element, "parentElement");
}

function childrenOf(element: Element): Element[] {
	return Array.from(native<HTMLCollection>(element, "children"));
}

function defaultRect(element: Element): Rect | null {
	const bounds: DOMRect = call<DOMRect>(element, "getBoundingClientRect");
	const view: Window | null = native<Window | null>(documentOf(element), "defaultView");

	return {
		x: bounds.left + (view?.scrollX ?? 0),
		y: bounds.top + (view?.scrollY ?? 0),
		width: bounds.width,
		height: bounds.height
	};
}

function isVisible(element: Element, rect: Rect | null): boolean {
	if(!rect || rect.width <= 0 || rect.height <= 0) return false;

	const style: CSSStyleDeclaration | undefined = native<Window | null>(documentOf(element), "defaultView")?.getComputedStyle(element);

	return !(style && (style.display === "none" || style.visibility === "hidden" || style.opacity === "0"));
}

function truncate(text: string, maxLength: number = MAX_TEXT): string {
	const collapsed: string = text.replace(/\s+/g, " ").trim();

	return collapsed.length > maxLength ? collapsed.slice(0, maxLength) : collapsed;
}

// Computed on first read, then stored as a plain enumerable property.
function lazy(target: ElementFeatures, key: "xpath" | "idXpath", compute: () => string): void {
	Object.defineProperty(target, key, {
		configurable: true,
		enumerable: true,
		get: (): string => {
			const value: string = compute();

			Object.defineProperty(target, key, {
				value: value,
				configurable: true,
				enumerable: true,
				writable: true
			});

			return value;
		}
	});
}

function xpathStep(element: Element): string {
	const tag: string = tagOf(element);
	const parent: Element | null = parentOf(element);

	if(!parent) return tag;

	const sameTag: Element[] = childrenOf(parent).filter((child: Element) => rawTag(child) === rawTag(element));

	return sameTag.length > 1 ? `${tag}[${sameTag.indexOf(element) + 1}]` : tag;
}

function ownText(element: Element): string {
	let text: string = "";

	for(const node of Array.from(native<NodeListOf<ChildNode>>(element, "childNodes"))) {
		if(native<number>(node, "nodeType") === 3) {
			text += " " + (node.nodeValue ?? "");
		}
	}

	return text.trim();
}


// The element's document, read so that named form controls cannot shadow it.
export function documentOf(element: Element): Document {
	return native<Document>(element, "ownerDocument");
}

// Visible text as Similo defines it: value of button-like inputs, placeholder, alt, or inner text.
export function visibleText(element: Element): string {
	const tag: string = tagOf(element);

	if(tag === "input") {
		const type: string = (attributeOf(element, "type") ?? "text").toLowerCase();

		if(BUTTONISH_INPUTS.has(type)) {
			return truncate(native<string>(element, "value") || attributeOf(element, "value") || "");
		}

		return truncate(attributeOf(element, "placeholder") ?? "");
	}

	if(tag === "textarea") return truncate(attributeOf(element, "placeholder") ?? "");

	if(tag === "img") return truncate(attributeOf(element, "alt") ?? "");

	const inner: string | undefined = native<string | undefined>(element, "innerText");

	return truncate(typeof inner === "string" ? inner : (native<string | null>(element, "textContent") ?? ""));
}

// Absolute XPath, e.g. /html/body/div[2]/a.
export function absoluteXPath(element: Element): string {
	const steps: string[] = [];

	for(let current: Element | null = element; current; current = parentOf(current)) {
		steps.unshift(xpathStep(current));
	}

	return "/" + steps.join("/");
}

// XPath relative to the nearest element (self or ancestor) with an id, e.g. //*[@id="nav"]/a[2].
export function idXPath(element: Element): string {
	const steps: string[] = [];

	for(let current: Element | null = element; current; current = parentOf(current)) {
		const id: string | null = attributeOf(current, "id");

		if(id) {
			steps.unshift(`*[@id="${id}"]`);

			return "//" + steps.join("/");
		}

		steps.unshift(xpathStep(current));
	}

	return "/" + steps.join("/");
}

// Similo's "Is Button": a button tag, an a tag with "btn" in its class, or a button-like input.
export function isButton(element: Element): boolean {
	const tag: string = tagOf(element);

	if(tag === "button") return true;

	if(tag === "a") {
		return Array.from(native<DOMTokenList>(element, "classList")).some((className: string) => className.toLowerCase().indexOf("btn") >= 0);
	}

	if(tag === "input") return BUTTONISH_INPUTS.has((attributeOf(element, "type") ?? "").toLowerCase());

	return false;
}
