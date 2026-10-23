import { type SketchAlgorithm } from "./types.js";
import minhash from "./options.sketches/minhash.js";
import simhash from "./options.sketches/simhash.js";
export declare function registerSketch(algorithm: SketchAlgorithm): void;
export declare function getSketch(name: string): SketchAlgorithm;
export declare function sketchNames(): string[];
export { minhash as MINHASH_SKETCH, simhash as SIMHASH_SKETCH };
