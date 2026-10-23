import { type ElementFeatures, type SetFeature, type Tokenizer } from "./types.js";
export declare function normalizeText(text: string | null | undefined, maxLength?: number): string;
export declare function featureTokens(features: ElementFeatures, feature: SetFeature, tokenizer: Tokenizer, excludeKeys?: string[]): Set<string>;
