import { type Calibrator, type FeatureName, type PropertyGroup } from "./types.js";


// Similo property groups and the segment features that realize them.
export const PROPERTY_GROUPS: Readonly<Record<PropertyGroup, readonly FeatureName[]>> = {
	Tag: [ "tag" ],
	Class: [ "classes" ],
	Name: [ "name" ],
	ID: [ "id" ],
	HRef: [ "href" ],
	Alt: [ "alt" ],
	AbsoluteXPath: [ "xpath" ],
	IdXPath: [ "idXpath" ],
	IsButton: [ "isButton" ],
	Location: [ "x", "y" ],
	Area: [ "area" ],
	Shape: [ "shape" ],
	VisibleText: [ "text" ],
	NeighborText: [ "neighborText" ],
	Type: [ "type" ],
	AriaLabel: [ "ariaLabel" ],
	Attributes: [ "attributes" ]
};

// Original Similo weights (Nass et al. 2023; Table 1 in Kluge & Stocco). Location split over x and y.
export const SIMILO_WEIGHTS: Readonly<Record<FeatureName, number>> = {
	tag: 1.5,
	classes: 0.5,
	name: 1.5,
	id: 1.5,
	href: 0.5,
	alt: 0.5,
	xpath: 0.5,
	idXpath: 0.5,
	isButton: 0.5,
	x: 0.25,
	y: 0.25,
	area: 0.5,
	shape: 0.5,
	text: 1.5,
	neighborText: 1.5,
	type: 0,
	ariaLabel: 0,
	attributes: 0
};

// Default weights: per property, the median of the four optimized weight sets reported by
// Kluge & Stocco (Table 3; a blank entry counts as 0). Location is split evenly over x and y.
// Shape was not tuned there (Dimension used Area), so it keeps the original Similo weight.
export const DEFAULT_FEATURE_WEIGHTS: Readonly<Record<FeatureName, number>> = {
	tag: 1.025,
	classes: 0.825,
	name: 2.325,
	id: 2.6,
	href: 0.875,
	alt: 1.225,
	xpath: 0.3,
	idXpath: 0.625,
	isButton: 0.05,
	x: 1.0,
	y: 1.0,
	area: 1.125,
	shape: 0.5,
	text: 2.675,
	neighborText: 1.575,
	type: 2.6,
	ariaLabel: 1.875,
	attributes: 2.0
};

// The weights of Similo++ (Ext, M9) from the replication package (OptimizedSimilo.scala), mapped onto
// HashLoc's segments: Location (1.2) split over x and y, Dimension onto area; class, is-button and
// shape are not used by Similo++ (weight 0). For controlled comparisons with equal weights.
export const SIMILO_PP_WEIGHTS: Readonly<Record<FeatureName, number>> = {
	tag: 0.8,
	classes: 0,
	name: 2.85,
	id: 0.5,
	href: 0.95,
	alt: 1.85,
	xpath: 0.1,
	idXpath: 0.45,
	isButton: 0,
	x: 0.6,
	y: 0.6,
	area: 0.35,
	shape: 0,
	text: 2.8,
	neighborText: 1.45,
	type: 2.75,
	ariaLabel: 0.9,
	attributes: 1.8
};

// Heuristic defaults; replace with `fitCalibrator` output for real use.
export const DEFAULT_CALIBRATOR: Readonly<Calibrator> = {
	bias: -9,
	score: 8,
	margin: 12,
	coverage: 1
};