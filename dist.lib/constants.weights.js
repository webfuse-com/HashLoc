const PROPERTY_GROUPS = {
  Tag: ["tag"],
  Class: ["classes"],
  Name: ["name"],
  ID: ["id"],
  HRef: ["href"],
  Alt: ["alt"],
  AbsoluteXPath: ["xpath"],
  IdXPath: ["idXpath"],
  IsButton: ["isButton"],
  Location: ["x", "y"],
  Area: ["area"],
  Shape: ["shape"],
  VisibleText: ["text"],
  NeighborText: ["neighborText"],
  Type: ["type"],
  AriaLabel: ["ariaLabel"],
  Attributes: ["attributes"]
};
const SIMILO_WEIGHTS = {
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
const DEFAULT_FEATURE_WEIGHTS = {
  tag: 1.025,
  classes: 0.825,
  name: 2.325,
  id: 2.6,
  href: 0.875,
  alt: 1.225,
  xpath: 0.3,
  idXpath: 0.625,
  isButton: 0.05,
  x: 1,
  y: 1,
  area: 1.125,
  shape: 0.5,
  text: 2.675,
  neighborText: 1.575,
  type: 2.6,
  ariaLabel: 1.875,
  attributes: 2
};
const SIMILO_PP_WEIGHTS = {
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
const DEFAULT_CALIBRATOR = {
  bias: -9,
  score: 8,
  margin: 12,
  coverage: 1
};
export {
  DEFAULT_CALIBRATOR,
  DEFAULT_FEATURE_WEIGHTS,
  PROPERTY_GROUPS,
  SIMILO_PP_WEIGHTS,
  SIMILO_WEIGHTS
};
