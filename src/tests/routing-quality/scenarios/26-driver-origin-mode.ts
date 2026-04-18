import type { Scenario } from "../types";
import { baseConfig, makeOrder, makeVehicle, LIMA_POINTS } from "../fixtures";

/**
 * routeEndMode=DRIVER_ORIGIN — each vehicle starts and ends at its
 * own origin (where the driver lives), not the main depot. 3 drivers
 * living in different districts; the solver should pick orders near
 * each driver's origin to minimize distance.
 */
export const scenario: Scenario = {
  name: "26-driver-origin-mode",
  description: "3 vehicles each starting/ending at driver's own origin",
  orders: Array.from({ length: 12 }, (_, i) => makeOrder(i)),
  vehicles: [
    makeVehicle(1, {
      identifier: "DRIVER-NORTE",
      originLatitude: LIMA_POINTS[9].lat, // SMP
      originLongitude: LIMA_POINTS[9].lng,
    }),
    makeVehicle(2, {
      identifier: "DRIVER-ESTE",
      originLatitude: LIMA_POINTS[14].lat, // Ate
      originLongitude: LIMA_POINTS[14].lng,
    }),
    makeVehicle(3, {
      identifier: "DRIVER-SUR",
      originLatitude: LIMA_POINTS[12].lat, // Chorrillos Sur
      originLongitude: LIMA_POINTS[12].lng,
    }),
  ],
  config: baseConfig({ routeEndMode: "DRIVER_ORIGIN" }),
  expected: {
    maxHardViolations: 0,
    maxUnassigned: 0,
    minRoutes: 1,
    maxRoutes: 3,
  },
};
