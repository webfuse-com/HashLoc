const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const GENERATED_PATTERN = /^(?=(?:[^0-9]*[0-9]){3})(?=.*[a-z])[a-z0-9_-]{5,}$/;
const WORD_SEPARATOR_PATTERN = new RegExp("[^\\p{L}\\p{N}#]+", "u");
const ID_STEP_PATTERN = /^\*\[@id=(["'])(.*)\1\]$/;
function char3(text) {
  const grams = /* @__PURE__ */ new Set();
  if (!text) return grams;
  if (text.length <= 3) {
    grams.add(text);
    return grams;
  }
  for (let start = 0; start + 3 <= text.length; start++) {
    grams.add(text.slice(start, start + 3));
  }
  return grams;
}
function words(text) {
  return new Set(text.split(WORD_SEPARATOR_PATTERN).filter((word) => word.length > 0));
}
function normalizeStep(step) {
  const match = ID_STEP_PATTERN.exec(step);
  if (match) {
    const id = normalizeText(match[2], 60);
    return id ? `#${id}` : "#";
  }
  return step.toLowerCase();
}
function pathTokens(path) {
  const steps = path.split("/").filter((step) => step.length > 0).map(normalizeStep);
  const sequence = ["^"].concat(steps);
  const tokens = /* @__PURE__ */ new Set();
  for (let position = 0; position + 1 < sequence.length; position++) {
    tokens.add(`${sequence[position]}/${sequence[position + 1]}`);
  }
  return tokens;
}
function normalizeText(text, maxLength = 200) {
  if (!text) return "";
  const lowered = text.normalize("NFKC").toLowerCase().replace(UUID_PATTERN, " ");
  const kept = lowered.split(/\s+/).filter((word) => word.length > 0 && !GENERATED_PATTERN.test(word)).join(" ");
  const normalized = kept.replace(/[0-9]+/g, "#").trim();
  return normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized;
}
function featureTokens(features, feature, tokenizer, excludeKeys = []) {
  if (feature === "attributes") {
    const tokens = /* @__PURE__ */ new Set();
    Object.keys(features.attributes).forEach((name) => {
      const key = name.toLowerCase();
      if (excludeKeys.indexOf(key) >= 0) return;
      tokens.add(tokenizer === "pairs" ? `${key}=${normalizeText(features.attributes[name], 100)}` : key);
    });
    return tokens;
  }
  if (feature === "classes") {
    const tokens = /* @__PURE__ */ new Set();
    for (const className of features.classes) {
      const normalized = normalizeText(className, 60);
      if (normalized) {
        tokens.add(normalized);
      }
    }
    return tokens;
  }
  const value = features[feature];
  if (tokenizer === "path") return pathTokens(value);
  const text = normalizeText(value, feature === "neighborText" ? 300 : 200);
  return tokenizer === "char3" ? char3(text) : words(text);
}
export {
  featureTokens,
  normalizeText
};
