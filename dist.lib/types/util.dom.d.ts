import { type ElementFeatures, type Rect } from "./types.js";
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
export declare class DomScan {
    readonly elements: Element[];
    readonly rects: Rect[];
    private readonly neighbors;
    private readonly rectOf;
    private readonly margin;
    private readonly contextLevels;
    private readonly pageWidth;
    private readonly viewportHeight;
    constructor(document: Document, options?: DomOptions);
    features(element: Element, rect?: Rect | null): ElementFeatures;
    allFeatures(): ElementFeatures[];
    private blockContext;
}
export declare function visibleText(element: Element): string;
export declare function absoluteXPath(element: Element): string;
export declare function idXPath(element: Element): string;
export declare function isButton(element: Element): boolean;
