import { type ElementFeatures, type SetFeature, type Tokenizer } from "./types.js";


const UUID_PATTERN: RegExp = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

// Generated-looking token: letters and at least 3 digits, length >= 5 (ember1234, css-1x2y3z).
const GENERATED_PATTERN: RegExp = /^(?=(?:[^0-9]*[0-9]){3})(?=.*[a-z])[a-z0-9_-]{5,}$/;

// Unicode word separators; built at runtime because the `u` flag needs an ES2015+ type target.
const WORD_SEPARATOR_PATTERN: RegExp = new RegExp("[^\\p{L}\\p{N}#]+", "u");

const ID_STEP_PATTERN: RegExp = /^\*\[@id=(["'])(.*)\1\]$/;


function char3(text: string): Set<string> {
	const grams: Set<string> = new Set<string>();

	if(!text) return grams;

	if(text.length <= 3) {
		grams.add(text);

		return grams;
	}

	for(let start: number = 0; start + 3 <= text.length; start++) {
		grams.add(text.slice(start, start + 3));
	}

	return grams;
}

function words(text: string): Set<string> {
	return new Set<string>(text.split(WORD_SEPARATOR_PATTERN).filter((word: string) => word.length > 0));
}

function normalizeStep(step: string): string {
	const match: RegExpExecArray | null = ID_STEP_PATTERN.exec(step);

	if(match) {
		const id: string = normalizeText(match[2], 60);

		return id ? `#${id}` : "#";
	}

	return step.toLowerCase();
}

// XPath as overlapping step bigrams: an inserted or re-indexed level only changes nearby tokens.
function pathTokens(path: string): Set<string> {
	const steps: string[] = path
		.split("/")
		.filter((step: string) => step.length > 0)
		.map(normalizeStep);
	const sequence: string[] = [ "^" ].concat(steps);
	const tokens: Set<string> = new Set<string>();

	for(let position: number = 0; position + 1 < sequence.length; position++) {
		tokens.add(`${sequence[position]}/${sequence[position + 1]}`);
	}

	return tokens;
}


// Format-v1 text normalization: NFKC, lowercase, drop UUIDs and generated tokens,
// collapse remaining digit runs to "#", collapse whitespace, truncate.
export function normalizeText(text: string | null | undefined, maxLength: number = 200): string {
	if(!text) return "";

	const lowered: string = text.normalize("NFKC").toLowerCase().replace(UUID_PATTERN, " ");
	const kept: string = lowered
		.split(/\s+/)
		.filter((word: string) => word.length > 0 && !GENERATED_PATTERN.test(word))
		.join(" ");
	const normalized: string = kept.replace(/[0-9]+/g, "#").trim();

	return normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized;
}

// Token set of a feature under a tokenizer. Empty set = feature absent.
export function featureTokens(
	features: ElementFeatures,
	feature: SetFeature,
	tokenizer: Tokenizer,
	excludeKeys: string[] = []
): Set<string> {
	if(feature === "attributes") {
		const tokens: Set<string> = new Set<string>();

		Object.keys(features.attributes).forEach((name: string) => {
			const key: string = name.toLowerCase();

			if(excludeKeys.indexOf(key) >= 0) return;

			tokens.add(tokenizer === "pairs" ? `${key}=${normalizeText(features.attributes[name], 100)}` : key);
		});

		return tokens;
	}

	if(feature === "classes") {
		const tokens: Set<string> = new Set<string>();

		for(const className of features.classes) {
			const normalized: string = normalizeText(className, 60);

			if(normalized) {
				tokens.add(normalized);
			}
		}

		return tokens;
	}

	const value: string = features[feature];

	if(tokenizer === "path") return pathTokens(value);

	const text: string = normalizeText(value, feature === "neighborText" ? 300 : 200);

	return tokenizer === "char3" ? char3(text) : words(text);
}