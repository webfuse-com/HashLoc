import { type ElementFeatures, type Geometry, type Rect } from "./types.js";


export interface DomOptions {
	/** Subtree to index (default: document.body). */
	root?: Element;
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
}


class NeighborIndex {
	private readonly grid: Map<string, TextSource[]> = new Map<string, TextSource[]>();

	constructor(sources: TextSource[]) {
		for(const source of sources) {
			const key: string = `${Math.floor(source.centerX / GRID_CELL)},${Math.floor(source.centerY / GRID_CELL)}`;
			const bucket: TextSource[] | undefined = this.grid.get(key);

			if(bucket) {
				bucket.push(source);
			} else {
				this.grid.set(key, [ source ]);
			}
		}
	}

	// Text of sources whose center lies in the rect grown by `margin`, nearest first.
	textAround(element: Element, rect: Rect, margin: number): string {
		const left: number = rect.x - margin;
		const top: number = rect.y - margin;
		const right: number = rect.x + rect.width + margin;
		const bottom: number = rect.y + rect.height + margin;
		const centerX: number = rect.x + rect.width / 2;
		const centerY: number = rect.y + rect.height / 2;
		const hits: NeighborHit[] = [];

		for(let cellX: number = Math.floor(left / GRID_CELL); cellX <= Math.floor(right / GRID_CELL); cellX++) {
			for(let cellY: number = Math.floor(top / GRID_CELL); cellY <= Math.floor(bottom / GRID_CELL); cellY++) {
				for(const source of this.grid.get(`${cellX},${cellY}`) ?? []) {
					if(source.centerX < left || source.centerX > right || source.centerY < top || source.centerY > bottom) {
						continue;
					}

					if(source.element === element || element.contains(source.element)) continue;

					hits.push({
						distance: Math.hypot(source.centerX - centerX, source.centerY - centerY),
						text: source.text
					});
				}
			}
		}

		hits.sort((first: NeighborHit, second: NeighborHit) => first.distance - second.distance);

		return truncate(hits.map((hit: NeighborHit) => hit.text).join(" "));
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

	constructor(document: Document, options: DomOptions = {}) {
		const root: Element = options.root ?? document.body ?? document.documentElement;
		const view: Window | null = document.defaultView;

		this.rectOf = options.rectOf ?? defaultRect;
		this.margin = options.neighborMargin ?? 60;
		this.contextLevels = options.contextLevels ?? 0;
		this.pageWidth = options.pageWidth ?? Math.max(document.documentElement.scrollWidth || 0, view?.innerWidth || 0, 1);
		this.viewportHeight = options.viewportHeight ?? Math.max(view?.innerHeight || 0, 1);

		const sources: TextSource[] = [];

		for(const element of Array.from(root.querySelectorAll("*"))) {
			if(SKIP_TAGS.has(element.tagName.toLowerCase())) continue;

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

		for(const attribute of Array.from(element.attributes)) {
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

		return {
			tag: element.tagName.toLowerCase(),
			classes: Array.from(element.classList),
			name: element.getAttribute("name") ?? "",
			id: element.getAttribute("id") ?? "",
			href: element.getAttribute("href") ?? "",
			alt: element.getAttribute("alt") ?? "",
			xpath: absoluteXPath(element),
			idXpath: idXPath(element),
			isButton: isButton(element),
			geom: geom,
			text: text,
			neighborText: truncate(context ? `${spatial} ${context}` : spatial),
			type: element.getAttribute("type") ?? "",
			ariaLabel: element.getAttribute("aria-label") ?? "",
			attributes: attributes
		};
	}

	// Features of all candidates, in `elements` order.
	allFeatures(): ElementFeatures[] {
		return this.elements.map((element: Element, index: number) => this.features(element, this.rects[index]));
	}

	// Text of the nearest ancestor (within `contextLevels`) that contains text beyond the element's own.
	private blockContext(element: Element, own: string): string {
		let ancestor: Element | null = element.parentElement;

		for(let level: number = 0; level < this.contextLevels && ancestor && ancestor.tagName.toLowerCase() !== "body"; level++) {
			const text: string = visibleText(ancestor);

			if(text.length > own.length + 3) return truncate(own ? text.split(own).join(" ") : text, 200);

			ancestor = ancestor.parentElement;
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


function defaultRect(element: Element): Rect | null {
	const bounds: DOMRect = element.getBoundingClientRect();
	const view: Window | null = element.ownerDocument.defaultView;

	return {
		x: bounds.left + (view?.scrollX ?? 0),
		y: bounds.top + (view?.scrollY ?? 0),
		width: bounds.width,
		height: bounds.height
	};
}

function isVisible(element: Element, rect: Rect | null): boolean {
	if(!rect || rect.width <= 0 || rect.height <= 0) return false;

	const style: CSSStyleDeclaration | undefined = element.ownerDocument.defaultView?.getComputedStyle(element);

	return !(style && (style.display === "none" || style.visibility === "hidden" || style.opacity === "0"));
}

function truncate(text: string, maxLength: number = MAX_TEXT): string {
	const collapsed: string = text.replace(/\s+/g, " ").trim();

	return collapsed.length > maxLength ? collapsed.slice(0, maxLength) : collapsed;
}

function xpathStep(element: Element): string {
	const tag: string = element.tagName.toLowerCase();
	const parent: Element | null = element.parentElement;

	if(!parent) return tag;

	const sameTag: Element[] = Array.from(parent.children).filter((child: Element) => child.tagName === element.tagName);

	return sameTag.length > 1 ? `${tag}[${sameTag.indexOf(element) + 1}]` : tag;
}

function ownText(element: Element): string {
	let text: string = "";

	for(const node of Array.from(element.childNodes)) {
		if(node.nodeType === 3) {
			text += " " + (node.nodeValue ?? "");
		}
	}

	return text.trim();
}


// Visible text as Similo defines it: value of button-like inputs, placeholder, alt, or inner text.
export function visibleText(element: Element): string {
	const tag: string = element.tagName.toLowerCase();

	if(tag === "input") {
		const type: string = (element.getAttribute("type") ?? "text").toLowerCase();

		if(BUTTONISH_INPUTS.has(type)) {
			return truncate((element as HTMLInputElement).value || element.getAttribute("value") || "");
		}

		return truncate(element.getAttribute("placeholder") ?? "");
	}

	if(tag === "textarea") return truncate(element.getAttribute("placeholder") ?? "");

	if(tag === "img") return truncate(element.getAttribute("alt") ?? "");

	const inner: string | undefined = (element as HTMLElement).innerText;

	return truncate(typeof inner === "string" ? inner : (element.textContent ?? ""));
}

// Absolute XPath, e.g. /html/body/div[2]/a.
export function absoluteXPath(element: Element): string {
	const steps: string[] = [];

	for(let current: Element | null = element; current; current = current.parentElement) {
		steps.unshift(xpathStep(current));
	}

	return "/" + steps.join("/");
}

// XPath relative to the nearest element (self or ancestor) with an id, e.g. //*[@id="nav"]/a[2].
export function idXPath(element: Element): string {
	const steps: string[] = [];

	for(let current: Element | null = element; current; current = current.parentElement) {
		const id: string | null = current.getAttribute("id");

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
	const tag: string = element.tagName.toLowerCase();

	if(tag === "button") return true;

	if(tag === "a") {
		return Array.from(element.classList).some((className: string) => className.toLowerCase().indexOf("btn") >= 0);
	}

	if(tag === "input") return BUTTONISH_INPUTS.has((element.getAttribute("type") ?? "").toLowerCase());

	return false;
}
