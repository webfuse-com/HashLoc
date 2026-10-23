import minhash from "./options.sketches/minhash.js";
import simhash from "./options.sketches/simhash.js";
const REGISTRY = /* @__PURE__ */ new Map([
  [minhash.name, minhash],
  [simhash.name, simhash]
]);
function registerSketch(algorithm) {
  if (!/^[a-z][a-z0-9-]*$/.test(algorithm.name)) {
    throw new RangeError(`sketch name must be lowercase letters, digits and hyphens, got '${algorithm.name}'`);
  }
  REGISTRY.set(algorithm.name, algorithm);
}
function getSketch(name) {
  const algorithm = REGISTRY.get(name);
  if (!algorithm) {
    throw new RangeError(`unknown sketch algorithm '${name}' (registered: ${sketchNames().join(", ")})`);
  }
  return algorithm;
}
function sketchNames() {
  return Array.from(REGISTRY.keys()).sort();
}
export {
  minhash as MINHASH_SKETCH,
  simhash as SIMHASH_SKETCH,
  getSketch,
  registerSketch,
  sketchNames
};
