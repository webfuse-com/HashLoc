import { type FeatureName, type Profile, type PropertyGroup, type SegmentSpec } from "./types.js";
export declare function finalizeSegments(segments: SegmentSpec[]): SegmentSpec[];
export declare function segmentBits(segment: SegmentSpec): number;
export declare function profileBits(profile: Profile): number;
export declare function codeLength(profile: Profile): number;
export declare function withFeatureWeights(profile: Profile, weights: Partial<Record<FeatureName, number>>): Profile;
export declare function withoutGroup(profile: Profile, group: PropertyGroup): Profile;
export declare function withSketch(profile: Profile, algorithm: string, bitsPerValue: number, version?: number): Profile;
export declare function validateProfile(profile: Profile): void;
