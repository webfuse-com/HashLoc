import { type SketchAlgorithm } from "./types.js";
import minhash from "./options.sketches/minhash.js";
import simhash from "./options.sketches/simhash.js";


const REGISTRY: Map<string, SketchAlgorithm> = new Map<string, SketchAlgorithm>([
	[ minhash.name, minhash ],
	[ simhash.name, simhash ]
]);


// Make an algorithm available to "sketch" segments by name. Names are part of the code format:
// an algorithm must not change behavior once codes produced with it are in use.
export function registerSketch(algorithm: SketchAlgorithm): void {
	if(!/^[a-z][a-z0-9-]*$/.test(algorithm.name)) {
		throw new RangeError(`sketch name must be lowercase letters, digits and hyphens, got '${algorithm.name}'`);
	}

	REGISTRY.set(algorithm.name, algorithm);
}

export function getSketch(name: string): SketchAlgorithm {
	const algorithm: SketchAlgorithm | undefined = REGISTRY.get(name);

	if(!algorithm) {
		throw new RangeError(`unknown sketch algorithm '${name}' (registered: ${sketchNames().join(", ")})`);
	}

	return algorithm;
}

export function sketchNames(): string[] {
	return Array.from(REGISTRY.keys()).sort();
}


export { minhash as MINHASH_SKETCH, simhash as SIMHASH_SKETCH };