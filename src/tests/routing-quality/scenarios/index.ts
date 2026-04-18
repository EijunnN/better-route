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
import { scenario as s13 } from "./13-soft-time-windows";
import { scenario as s14 } from "./14-batched-shifts";
import { scenario as s15 } from "./15-depot-closes-early";
import { scenario as s16 } from "./16-exact-time-tolerance";
import { scenario as s17 } from "./17-zone-by-skill-proxy";
import { scenario as s18 } from "./18-value-dimension-active";
import { scenario as s19 } from "./19-mixed-fleet-heavy-light";
import { scenario as s20 } from "./20-full-day-with-break";
import { scenario as s21 } from "./21-high-traffic-factor";
import { scenario as s22 } from "./22-200-orders-real-scale";
import { scenario as s23 } from "./23-urgent-same-window";
import { scenario as s24 } from "./24-max-distance-km-tight";
import { scenario as s25 } from "./25-open-end-mode";
import { scenario as s26 } from "./26-driver-origin-mode";
import { scenario as s27 } from "./27-zero-orders";
import { scenario as s28 } from "./28-unreachable-coords";
import type { Scenario } from "../types";

export const SCENARIOS: Scenario[] = [
  s01, s02, s03, s04, s05, s06, s07, s08, s09, s10, s11, s12,
  s13, s14, s15, s16, s17, s18, s19, s20, s21, s22, s23, s24,
  s25, s26, s27, s28,
];
