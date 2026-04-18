import { scenario as s01 } from "./01-basic";
import { scenario as s02 } from "./02-tight-time-windows";
import { scenario as s03 } from "./03-skills-scarce";
import { scenario as s04 } from "./04-capacity-at-limit";
import { scenario as s05 } from "./05-urgent-priority";
import { scenario as s06 } from "./06-vehicle-workday";
import { scenario as s07 } from "./07-multi-dimensional-capacity";
import { scenario as s08 } from "./08-max-orders-per-vehicle";
import { scenario as s09 } from "./09-break-time";
import { scenario as s10 } from "./10-infeasible-skill";
import { scenario as s11 } from "./11-mixed-priorities";
import { scenario as s12 } from "./12-stress-50-orders";
import type { Scenario } from "../types";

export const SCENARIOS: Scenario[] = [
  s01, s02, s03, s04, s05, s06, s07, s08, s09, s10, s11, s12,
];
