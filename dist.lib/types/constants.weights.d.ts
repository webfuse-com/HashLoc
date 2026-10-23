import { type Calibrator, type FeatureName, type PropertyGroup } from "./types.js";
export declare const PROPERTY_GROUPS: Readonly<Record<PropertyGroup, readonly FeatureName[]>>;
export declare const SIMILO_WEIGHTS: Readonly<Record<FeatureName, number>>;
export declare const DEFAULT_FEATURE_WEIGHTS: Readonly<Record<FeatureName, number>>;
export declare const SIMILO_PP_WEIGHTS: Readonly<Record<FeatureName, number>>;
export declare const DEFAULT_CALIBRATOR: Readonly<Calibrator>;
