import { describe, expect, test } from "bun:test";
import {
  calculateZoneStats,
  createZoneBatches,
  filterVehiclesForZone,
  getCurrentDayOfWeek,
  getDayOfWeek,
  getVehiclesForZone,
  getVehicleZoneIds,
  isPointInZone,
  isVehicleAssignedToZoneOnDay,
  isVehicleUnrestricted,
  isZoneActiveOnDay,
} from "@/lib/geo/zone-utils";
import {
  ALL_DAYS,
  assignment,
  makeRandom,
  muteWarnings,
  order,
  squareZone,
  unrestrictedVehicle,
  zonedVehicle,
} from "./fixtures";

// The "no vehicles for this zone" path narrates itself to stderr on every
// call; the assertions read `result.warnings`, so the console copy is noise.
muteWarnings();

/**
 * `createZoneBatches` is the hard-isolation seam: it decides which orders a
 * given set of vehicles is even allowed to see. Everything downstream (VROOM,
 * the verifier, the plan the operator signs off on) trusts that partition, so
 * the two invariants worth defending are:
 *
 *   ISOLATION    — an order only appears in a batch whose polygon contains it.
 *   CONSERVATION — every input order comes back exactly once, as a batched
 *                  order or as an `unroutable` entry. Anything that falls out
 *                  of both silently vanishes from the plan — the exact failure
 *                  the `unroutable` field was added to prevent.
 */

describe("isZoneActiveOnDay", () => {
  test("a zone with no activeDays is active every day", () => {
    const zone = squareZone("z");
    for (const day of ALL_DAYS) {
      expect(isZoneActiveOnDay(zone, day)).toBe(true);
    }
  });

  test("an empty activeDays array is treated as 'every day', not 'never'", () => {
    expect(
      isZoneActiveOnDay(squareZone("z", { activeDays: [] }), "MONDAY"),
    ).toBe(true);
  });

  test("otherwise only the listed days count", () => {
    const zone = squareZone("z", { activeDays: ["MONDAY", "FRIDAY"] });
    expect(isZoneActiveOnDay(zone, "MONDAY")).toBe(true);
    expect(isZoneActiveOnDay(zone, "FRIDAY")).toBe(true);
    expect(isZoneActiveOnDay(zone, "SUNDAY")).toBe(false);
  });
});

describe("isVehicleAssignedToZoneOnDay", () => {
  test("an inactive assignment is never in effect", () => {
    expect(
      isVehicleAssignedToZoneOnDay(
        assignment("v", "z", { active: false }),
        "MONDAY",
      ),
    ).toBe(false);
  });

  test("no assignedDays means every day", () => {
    expect(isVehicleAssignedToZoneOnDay(assignment("v", "z"), "SUNDAY")).toBe(
      true,
    );
  });

  test("assignedDays restricts to the listed days", () => {
    const a = assignment("v", "z", { assignedDays: ["TUESDAY"] });
    expect(isVehicleAssignedToZoneOnDay(a, "TUESDAY")).toBe(true);
    expect(isVehicleAssignedToZoneOnDay(a, "WEDNESDAY")).toBe(false);
  });
});

describe("isVehicleUnrestricted", () => {
  test("true when there are no assignments at all", () => {
    expect(isVehicleUnrestricted(unrestrictedVehicle("v"))).toBe(true);
    expect(isVehicleUnrestricted({ id: "v" })).toBe(true);
  });

  test("false as soon as one assignment exists — even an inactive one", () => {
    expect(isVehicleUnrestricted(zonedVehicle("v", ["z"]))).toBe(false);
    expect(
      isVehicleUnrestricted(zonedVehicle("v", ["z"], { active: false })),
    ).toBe(false);
  });
});

describe("getVehicleZoneIds", () => {
  test("lists only the zones in effect on that day", () => {
    const vehicle = {
      id: "v",
      zoneAssignments: [
        assignment("v", "always"),
        assignment("v", "mondays", { assignedDays: ["MONDAY"] }),
        assignment("v", "disabled", { active: false }),
      ],
    };
    expect(getVehicleZoneIds(vehicle, "MONDAY")).toEqual(["always", "mondays"]);
    expect(getVehicleZoneIds(vehicle, "TUESDAY")).toEqual(["always"]);
  });

  test("a vehicle with no assignments has no zone ids", () => {
    expect(getVehicleZoneIds(unrestrictedVehicle("v"), "MONDAY")).toEqual([]);
  });
});

describe("getVehiclesForZone", () => {
  const zone = squareZone("z");

  test("returns the vehicles assigned to the zone", () => {
    const vehicles = [zonedVehicle("v1", ["z"]), zonedVehicle("v2", ["other"])];
    expect(
      getVehiclesForZone(zone, vehicles, "MONDAY").map((v) => v.id),
    ).toEqual(["v1"]);
  });

  test("unrestricted vehicles are NOT returned — this helper wants an explicit assignment", () => {
    expect(
      getVehiclesForZone(zone, [unrestrictedVehicle("free")], "MONDAY"),
    ).toEqual([]);
  });

  test("returns nothing when the zone is closed that day", () => {
    const mondayOnly = squareZone("z", { activeDays: ["MONDAY"] });
    expect(
      getVehiclesForZone(mondayOnly, [zonedVehicle("v1", ["z"])], "SUNDAY"),
    ).toEqual([]);
  });
});

describe("filterVehiclesForZone", () => {
  test("unrestricted vehicles are eligible for every zone", () => {
    const free = unrestrictedVehicle("free");
    expect(filterVehiclesForZone([free], "z", "MONDAY")).toEqual([free]);
    expect(filterVehiclesForZone([free], "unzoned", "MONDAY")).toEqual([free]);
  });

  test("only unrestricted vehicles can serve 'unzoned' orders", () => {
    expect(
      filterVehiclesForZone([zonedVehicle("v", ["z"])], "unzoned", "MONDAY"),
    ).toEqual([]);
  });

  test("a zoned vehicle is eligible only for its own zones", () => {
    const v = zonedVehicle("v", ["north"]);
    expect(
      filterVehiclesForZone([v], "north", "MONDAY").map((x) => x.id),
    ).toEqual(["v"]);
    expect(filterVehiclesForZone([v], "south", "MONDAY")).toEqual([]);
  });

  test("day scheduling and inactive assignments drop the vehicle", () => {
    expect(
      filterVehiclesForZone(
        [zonedVehicle("v", ["z"], { assignedDays: ["MONDAY"] })],
        "z",
        "SUNDAY",
      ),
    ).toEqual([]);

    // The vehicle still counts as "restricted" (it has an assignment), so an
    // inactive-only assignment leaves it eligible for nothing at all.
    const disabled = zonedVehicle("v", ["z"], { active: false });
    expect(filterVehiclesForZone([disabled], "z", "MONDAY")).toEqual([]);
    expect(filterVehiclesForZone([disabled], "unzoned", "MONDAY")).toEqual([]);
  });
});

describe("getDayOfWeek / getCurrentDayOfWeek", () => {
  test("maps a Date to the day name used by the zone schedule", () => {
    // Local-time constructor on purpose: the module reads `Date#getDay()`,
    // which is local, so a UTC-built date would answer for a different day
    // in negative-offset timezones.
    expect(getDayOfWeek(new Date(2026, 6, 26))).toBe("SUNDAY");
    expect(getDayOfWeek(new Date(2026, 6, 28))).toBe("TUESDAY");
    expect(getDayOfWeek(new Date(2026, 6, 31))).toBe("FRIDAY");
  });

  test("every weekday maps to a name the schedule understands", () => {
    for (let offset = 0; offset < 7; offset++) {
      const day = getDayOfWeek(new Date(2026, 6, 26 + offset));
      expect(ALL_DAYS).toContain(day);
    }
  });

  test("getCurrentDayOfWeek agrees with getDayOfWeek(now)", () => {
    expect(getCurrentDayOfWeek()).toBe(getDayOfWeek(new Date()));
  });
});

describe("createZoneBatches", () => {
  const north = squareZone("north", { minLng: 0, minLat: 0, name: "Norte" });
  const south = squareZone("south", { minLng: 20, minLat: 20, name: "Sur" });

  test("one batch per zone that has orders, plus 'unzoned' for the rest", () => {
    const result = createZoneBatches(
      [order("a", 5, 5), order("b", 25, 25), order("c", 80, 80)],
      [unrestrictedVehicle("free")],
      [north, south],
      "MONDAY",
    );

    expect(
      result.batches.map((b) => ({
        zone: b.zoneId,
        orders: b.orders.map((o) => o.id),
      })),
    ).toEqual([
      { zone: "north", orders: ["a"] },
      { zone: "south", orders: ["b"] },
      { zone: "unzoned", orders: ["c"] },
    ]);
    expect(result.unroutable).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  test("zones without orders produce no batch", () => {
    const result = createZoneBatches(
      [order("a", 5, 5)],
      [unrestrictedVehicle("free")],
      [north, south],
      "MONDAY",
    );
    expect(result.batches.map((b) => b.zoneId)).toEqual(["north"]);
  });

  test("the unzoned batch is labelled 'Sin Zona'", () => {
    const result = createZoneBatches(
      [order("a", 80, 80)],
      [unrestrictedVehicle("free")],
      [north],
      "MONDAY",
    );
    expect(result.batches[0]).toMatchObject({
      zoneId: "unzoned",
      zoneName: "Sin Zona",
    });
  });

  test("with zero zones everything collapses into a single unzoned batch", () => {
    const result = createZoneBatches(
      [order("a", 5, 5), order("b", 25, 25)],
      [unrestrictedVehicle("free")],
      [],
      "MONDAY",
    );
    expect(result.batches).toHaveLength(1);
    expect(result.batches[0].orders.map((o) => o.id)).toEqual(["a", "b"]);
  });

  test("empty order list produces nothing at all", () => {
    expect(
      createZoneBatches([], [unrestrictedVehicle("free")], [north], "MONDAY"),
    ).toEqual({ batches: [], warnings: [], unroutable: [] });
  });

  describe("vehicle eligibility", () => {
    test("a batch only carries vehicles allowed in that zone", () => {
      const result = createZoneBatches(
        [order("a", 5, 5), order("b", 25, 25)],
        [
          zonedVehicle("v-north", ["north"]),
          zonedVehicle("v-south", ["south"]),
          unrestrictedVehicle("free"),
        ],
        [north, south],
        "MONDAY",
      );

      const byZone = new Map(result.batches.map((b) => [b.zoneId, b]));
      expect(byZone.get("north")?.vehicles.map((v) => v.id)).toEqual([
        "v-north",
        "free",
      ]);
      expect(byZone.get("south")?.vehicles.map((v) => v.id)).toEqual([
        "v-south",
        "free",
      ]);
    });

    test("an unrestricted vehicle is offered to every batch — the caller dedupes", () => {
      // Documented design: `filterVehiclesForZone` lets a vehicle with no zone
      // assignments serve anywhere, so it shows up in each batch. Avoiding two
      // routes for it is the `oneRoutePerVehicle` flag's job, in solve-batches.
      const result = createZoneBatches(
        [order("a", 5, 5), order("b", 25, 25), order("c", 80, 80)],
        [unrestrictedVehicle("free")],
        [north, south],
        "MONDAY",
      );
      expect(result.batches).toHaveLength(3);
      for (const batch of result.batches) {
        expect(batch.vehicles.map((v) => v.id)).toEqual(["free"]);
      }
    });

    test("a zone with no eligible vehicle yields unroutable orders + a warning", () => {
      const result = createZoneBatches(
        [order("a", 5, 5), order("b", 5, 6)],
        [zonedVehicle("v-south", ["south"])],
        [north],
        "MONDAY",
      );

      expect(result.batches).toEqual([]);
      expect(result.warnings).toEqual([
        'Zone "Norte" has no available vehicles for MONDAY. 2 orders will be unassigned.',
      ]);
      expect(result.unroutable.map((u) => u.order.id)).toEqual(["a", "b"]);
      expect(result.unroutable[0].reason).toBe(
        'Zona "Norte" no tiene vehículos disponibles para MONDAY',
      );
    });

    test("no vehicles at all means every order is unroutable, never dropped", () => {
      const result = createZoneBatches(
        [order("a", 5, 5), order("b", 80, 80)],
        [],
        [north],
        "MONDAY",
      );
      expect(result.batches).toEqual([]);
      expect(result.unroutable.map((u) => u.order.id).sort()).toEqual([
        "a",
        "b",
      ]);
    });

    test("day scheduling on the vehicle assignment closes the zone", () => {
      const result = createZoneBatches(
        [order("a", 5, 5)],
        [zonedVehicle("v", ["north"], { assignedDays: ["MONDAY"] })],
        [north],
        "SUNDAY",
      );
      expect(result.batches).toEqual([]);
      expect(result.unroutable).toHaveLength(1);
    });
  });

  describe("RESTRICTED zones are pre-filtered before any batching", () => {
    const noGo = squareZone("no-go", {
      minLng: 0,
      minLat: 0,
      type: "RESTRICTED",
      name: "Centro Histórico",
    });

    test("an order inside one becomes unroutable with a Spanish reason", () => {
      const result = createZoneBatches(
        [order("a", 5, 5)],
        [unrestrictedVehicle("free")],
        [noGo],
        "MONDAY",
      );
      expect(result.batches).toEqual([]);
      expect(result.unroutable).toEqual([
        {
          order: { id: "a", latitude: 5, longitude: 5 },
          reason: 'Dirección dentro de zona restringida "Centro Histórico"',
        },
      ]);
      // The restriction is a data problem, not a fleet problem, so it does not
      // pollute `warnings` (which the UI shows as an operational note).
      expect(result.warnings).toEqual([]);
    });

    test("a RESTRICTED polygon on top of a DELIVERY one wins, whatever the array order", () => {
      const overlap = squareZone("delivery", { minLng: 0, minLat: 0 });
      for (const zones of [
        [overlap, noGo],
        [noGo, overlap],
      ]) {
        const result = createZoneBatches(
          [order("a", 5, 5)],
          [unrestrictedVehicle("free")],
          zones,
          "MONDAY",
        );
        expect(result.batches).toEqual([]);
        expect(result.unroutable).toHaveLength(1);
      }
    });

    test("an inactive RESTRICTED zone stops restricting", () => {
      const result = createZoneBatches(
        [order("a", 5, 5)],
        [unrestrictedVehicle("free")],
        [squareZone("no-go", { type: "RESTRICTED", active: false })],
        "MONDAY",
      );
      expect(result.batches.map((b) => b.zoneId)).toEqual(["unzoned"]);
      expect(result.unroutable).toEqual([]);
    });

    test("orders outside the restricted polygon are unaffected", () => {
      const result = createZoneBatches(
        [order("inside", 5, 5), order("outside", 80, 80)],
        [unrestrictedVehicle("free")],
        [noGo],
        "MONDAY",
      );
      expect(result.batches.map((b) => b.orders.map((o) => o.id))).toEqual([
        ["outside"],
      ]);
      expect(result.unroutable.map((u) => u.order.id)).toEqual(["inside"]);
    });
  });

  describe("invariants under load", () => {
    const zones = [
      squareZone("z0", { minLng: 0, minLat: 0 }),
      squareZone("z1", { minLng: 20, minLat: 0 }),
      squareZone("z2", { minLng: 0, minLat: 20 }),
      squareZone("z3", { minLng: 20, minLat: 20, type: "RESTRICTED" }),
    ];
    const vehicles = [
      zonedVehicle("v0", ["z0"]),
      zonedVehicle("v1", ["z1"]),
      zonedVehicle("v2", ["z2"]),
      unrestrictedVehicle("free"),
    ];

    function randomOrders(seed: number, count: number) {
      const random = makeRandom(seed);
      return Array.from({ length: count }, (_, i) =>
        order(`o${i}`, random() * 45, random() * 45),
      );
    }

    test("ISOLATION — every batched order is geometrically inside its batch's zone", () => {
      const result = createZoneBatches(
        randomOrders(20260728, 500),
        vehicles,
        zones,
        "MONDAY",
      );

      // Guard against a vacuous pass: the fixture must actually populate the
      // zone batches, not just 'unzoned'.
      expect(result.batches.length).toBeGreaterThan(1);

      for (const batch of result.batches) {
        if (batch.zoneId === "unzoned") {
          for (const o of batch.orders) {
            const inSome = zones.some((z) =>
              isPointInZone(o.latitude, o.longitude, z),
            );
            expect(inSome).toBe(false);
          }
          continue;
        }

        const zone = zones.find((z) => z.id === batch.zoneId);
        if (!zone) throw new Error(`batch for unknown zone ${batch.zoneId}`);
        for (const o of batch.orders) {
          expect(isPointInZone(o.latitude, o.longitude, zone)).toBe(true);
        }
      }
    });

    test("ISOLATION — no batch ever carries a vehicle barred from its zone", () => {
      const result = createZoneBatches(
        randomOrders(20260728, 500),
        vehicles,
        zones,
        "MONDAY",
      );

      for (const batch of result.batches) {
        for (const vehicle of batch.vehicles) {
          if (isVehicleUnrestricted(vehicle)) continue;
          expect(getVehicleZoneIds(vehicle, "MONDAY")).toContain(batch.zoneId);
        }
      }
    });

    test("ISOLATION — no RESTRICTED zone ever gets a batch", () => {
      const result = createZoneBatches(
        randomOrders(20260728, 500),
        vehicles,
        zones,
        "MONDAY",
      );
      expect(result.batches.map((b) => b.zoneId)).not.toContain("z3");
    });

    test("CONSERVATION — every input order comes back exactly once", () => {
      const orders = randomOrders(1337, 500);
      const result = createZoneBatches(orders, vehicles, zones, "MONDAY");

      const returned = [
        ...result.batches.flatMap((b) => b.orders.map((o) => o.id)),
        ...result.unroutable.map((u) => u.order.id),
      ];

      expect(returned).toHaveLength(orders.length);
      expect(new Set(returned).size).toBe(orders.length);
    });

    test("CONSERVATION holds when no vehicle can serve anything", () => {
      const orders = randomOrders(99, 200);
      const result = createZoneBatches(
        orders,
        [zonedVehicle("orphan", ["nonexistent-zone"])],
        zones,
        "MONDAY",
      );

      expect(result.batches).toEqual([]);
      expect(result.unroutable).toHaveLength(orders.length);
    });

    test("DETERMINISM — identical input yields an identical partition", () => {
      const orders = randomOrders(4242, 300);
      const first = createZoneBatches(orders, vehicles, zones, "MONDAY");
      const second = createZoneBatches(orders, vehicles, zones, "MONDAY");
      expect(first).toEqual(second);
    });

    test("batch order follows the zones array, with 'unzoned' last", () => {
      const result = createZoneBatches(
        [order("a", 25, 5), order("b", 5, 5), order("c", 80, 80)],
        vehicles,
        zones,
        "MONDAY",
      );
      // Input order was z2, z0, unzoned — the output follows the *zones*
      // array instead, which is what makes the partition stable.
      expect(result.batches.map((b) => b.zoneId)).toEqual([
        "z0",
        "z2",
        "unzoned",
      ]);
    });
  });

  describe("known gaps — documenting current behavior, not endorsing it", () => {
    test("a zone's own activeDays schedule is IGNORED when batching", () => {
      // `isZoneActiveOnDay` exists and `getVehiclesForZone` honors it, but
      // `createZoneBatches` routes through `filterVehiclesForZone`, which only
      // looks at the *vehicle* assignment days. A Monday-only zone therefore
      // still gets a Sunday batch. Reported to the team lead.
      const mondayOnly = squareZone("north", { activeDays: ["MONDAY"] });
      const result = createZoneBatches(
        [order("a", 5, 5)],
        [zonedVehicle("v", ["north"])],
        [mondayOnly],
        "SUNDAY",
      );

      expect(result.batches.map((b) => b.zoneId)).toEqual(["north"]);
      expect(result.unroutable).toEqual([]);
      expect(
        getVehiclesForZone(
          mondayOnly,
          [zonedVehicle("v", ["north"])],
          "SUNDAY",
        ),
      ).toEqual([]);
    });

    test("a zone whose id is literally 'unzoned' collides with the sentinel key", () => {
      // Only reachable with a hand-written id — real zone ids are UUIDs — but
      // it is the one input that breaks ISOLATION: orders outside the polygon
      // end up inside its batch. Reported to the team lead.
      const collide = squareZone("unzoned", { minLng: 0, minLat: 0 });
      const result = createZoneBatches(
        [order("inside", 5, 5), order("far-away", 80, 80)],
        [unrestrictedVehicle("free")],
        [collide],
        "MONDAY",
      );

      expect(result.batches).toHaveLength(1);
      expect(result.batches[0].orders.map((o) => o.id)).toEqual([
        "inside",
        "far-away",
      ]);
      expect(isPointInZone(80, 80, collide)).toBe(false);
    });
  });
});

describe("calculateZoneStats", () => {
  const north = squareZone("north", { minLng: 0, minLat: 0, name: "Norte" });
  const south = squareZone("south", { minLng: 20, minLat: 20, name: "Sur" });

  test("reports order and vehicle counts per zone", () => {
    const { stats, unzonedCount, unassignableCount } = calculateZoneStats(
      [order("a", 5, 5), order("b", 25, 25), order("c", 80, 80)],
      [zonedVehicle("v-north", ["north"]), unrestrictedVehicle("free")],
      [north, south],
      "MONDAY",
    );

    expect(stats).toEqual([
      {
        zoneId: "north",
        zoneName: "Norte",
        orderCount: 1,
        vehicleCount: 2,
        coverage: 100,
      },
      {
        zoneId: "south",
        zoneName: "Sur",
        orderCount: 1,
        vehicleCount: 1,
        coverage: 100,
      },
    ]);
    expect(unzonedCount).toBe(1);
    expect(unassignableCount).toBe(0);
  });

  test("zones with zero orders still appear, with coverage 0 when unstaffed", () => {
    const { stats } = calculateZoneStats(
      [order("a", 5, 5)],
      [zonedVehicle("v-north", ["north"])],
      [north, south],
      "MONDAY",
    );
    expect(stats.map((s) => [s.zoneId, s.orderCount, s.coverage])).toEqual([
      ["north", 1, 100],
      ["south", 0, 0],
    ]);
  });

  test("counts orders in unstaffed zones as unassignable", () => {
    const { unassignableCount } = calculateZoneStats(
      [order("a", 5, 5), order("b", 5, 6)],
      [zonedVehicle("v-south", ["south"])],
      [north],
      "MONDAY",
    );
    expect(unassignableCount).toBe(2);
  });

  test("unzoned orders are unassignable only when no unrestricted vehicle exists", () => {
    const orders = [order("c", 80, 80)];
    expect(
      calculateZoneStats(
        orders,
        [zonedVehicle("v", ["north"])],
        [north],
        "MONDAY",
      ),
    ).toMatchObject({ unzonedCount: 1, unassignableCount: 1 });
    expect(
      calculateZoneStats(
        orders,
        [unrestrictedVehicle("free")],
        [north],
        "MONDAY",
      ),
    ).toMatchObject({ unzonedCount: 1, unassignableCount: 0 });
  });

  test("RESTRICTED zones are NOT filtered out here — unlike createZoneBatches", () => {
    // `calculateZoneStats` runs `groupOrdersByZone` directly, with no
    // RESTRICTED pre-filter, so a no-delivery polygon shows up as a normal
    // zone with a normal order count. It is a reporting helper, so this is
    // informational rather than a routing risk.
    const noGo = squareZone("no-go", {
      type: "RESTRICTED",
      name: "Restringida",
    });
    const { stats } = calculateZoneStats(
      [order("a", 5, 5)],
      [unrestrictedVehicle("free")],
      [noGo],
      "MONDAY",
    );
    expect(stats).toEqual([
      {
        zoneId: "no-go",
        zoneName: "Restringida",
        orderCount: 1,
        vehicleCount: 1,
        coverage: 100,
      },
    ]);
  });
});
