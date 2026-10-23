import { type ElementFeatures, type NumericFeature, type Profile, type SegmentValues } from "./types.js";
import { ProfileRegistry } from "./ProfileRegistry.js";
export interface DecodedCode {
    profile: Profile;
    values: SegmentValues;
    code: string;
}
export declare class CodeError extends Error {
    constructor(message: string);
}
export declare function numericFraction(feature: NumericFeature, features: ElementFeatures): number | null;
export declare function segmentValues(features: ElementFeatures, profile: Profile): SegmentValues;
export declare function valuesToCode(values: SegmentValues, profile: Profile): string;
export declare function encodeFeatures(features: ElementFeatures, profile: Profile): string;
export declare function decodeCode(code: string, registry?: ProfileRegistry): DecodedCode;
