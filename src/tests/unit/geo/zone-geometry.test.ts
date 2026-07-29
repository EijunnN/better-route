import { describe, expect, test } from "bun:test";
import {
  getZoneForOrder,
  groupOrdersByZone,
  isOrderInRestrictedZone,
  isPointInZone,
} from "@/lib/geo/zone-utils";
import {
  makeRandom,
  muteWarnings,
  order,
  squareZone,
  zoneWithGeometry,
  zoneWithRing,
} from "./fixtures";

/**
 * Point-in-polygon is the foundation of zone isolation: if a drop-off is
 * matched to the wrong polygon, a vehicle gets dispatched into an area it
 * was never assigned to, and — for RESTRICTED zones — into an area the
 * operator explicitly marked as no-delivery.
 *
 * Every failure path here degrades to "not in this zone" rather than
 * throwing, which is deliberate (a corrupt polygon must not tumble a
 * 1000-order run) but means bad data fails *silently*. The tests below pin
 * that down so the silence stays intentional.
 */

describe("isPointInZone", () => {
  const zone = squareZone("z", { minLng: 0, minLat: 0, size: 10 });

  test("a point strictly inside the polygon is inside", () => {
    expect(isPointInZone(5, 5, zone)).toBe(true);
  });

  test("a point outside the polygon is outside", () => {
    expect(isPointInZone(50, 50, zone)).toBe(false);
    expect(isPointInZone(5, 10.0001, zone)).toBe(false);
  });

  test("takes (latitude, longitude) and swaps them for GeoJSON's [lng, lat]", () => {
    // The zone spans lng 0..10 / lat 0..10 but the probe point is only inside
    // when the arguments are read as (lat, lng): a naive pass-through would
    // build point([2, 30]) and land outside.
    const tallZone = squareZone("tall", {
      minLng: 0,
      minLat: 20,
      size: 20,
    });
    expect(isPointInZone(30, 2, tallZone)).toBe(true);
    expect(isPointInZone(2, 30, tallZone)).toBe(false);
  });

  test("boundary points count as inside (turf's ignoreBoundary default)", () => {
    expect(isPointInZone(0, 0, zone)).toBe(true); // vertex
    expect(isPointInZone(0, 5, zone)).toBe(true); // edge midpoint
    expect(isPointInZone(10, 10, zone)).toBe(true); // opposite vertex
  });

  test("accepts a geometry stored as a JSON string (text→jsonb migration)", () => {
    const stringified = zoneWithGeometry("z", JSON.stringify(zone.geometry));
    expect(isPointInZone(5, 5, stringified)).toBe(true);
  });

  test("accepts a Feature wrapper as well as a raw geometry", () => {
    const wrapped = zoneWithGeometry("z", {
      type: "Feature",
      properties: {},
      geometry: zone.geometry,
    });
    expect(isPointInZone(5, 5, wrapped)).toBe(true);
  });

  test("accepts MultiPolygon and respects the gap between its parts", () => {
    const multi = zoneWithGeometry("z", {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10],
            [0, 0],
          ],
        ],
        [
          [
            [20, 20],
            [30, 20],
            [30, 30],
            [20, 30],
            [20, 20],
          ],
        ],
      ],
    });
    expect(isPointInZone(5, 5, multi)).toBe(true);
    expect(isPointInZone(25, 25, multi)).toBe(true);
    expect(isPointInZone(15, 15, multi)).toBe(false);
  });

  describe("degraded inputs never throw — they answer 'not in this zone'", () => {
    const warnings = muteWarnings();

    test("null / undefined geometry", () => {
      expect(isPointInZone(5, 5, zoneWithGeometry("z", null))).toBe(false);
      expect(isPointInZone(5, 5, zoneWithGeometry("z", undefined))).toBe(false);
      expect(warnings.calls).toBeGreaterThan(0);
    });

    test("geometry that is not valid JSON", () => {
      expect(isPointInZone(5, 5, zoneWithGeometry("z", "not-json"))).toBe(
        false,
      );
    });

    test("geometry of an unsupported type (Point, LineString, …)", () => {
      const point = zoneWithGeometry("z", {
        type: "Point",
        coordinates: [5, 5],
      });
      expect(isPointInZone(5, 5, point)).toBe(false);
    });

    test("ring that is not closed (first !== last vertex)", () => {
      // turf throws "First and last coordinates in a ring must be the same";
      // the catch turns it into `false`, so an order inside an unclosed
      // polygon silently falls through to the "unzoned" bucket.
      const open = zoneWithRing("z", [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ]);
      expect(isPointInZone(5, 5, open)).toBe(false);
    });

    test("ring with fewer than 3 vertices", () => {
      const degenerate = zoneWithRing("z", [
        [0, 0],
        [10, 10],
      ]);
      expect(isPointInZone(5, 5, degenerate)).toBe(false);
    });

    test("empty ring", () => {
      expect(isPointInZone(5, 5, zoneWithRing("z", []))).toBe(false);
    });

    test("coordinates outside the valid lat/lng range are not rejected, just outside", () => {
      // No range validation happens here — the polygon simply does not
      // contain (500, 5), so the answer is a plain `false`.
      expect(isPointInZone(500, 5, zone)).toBe(false);
      expect(isPointInZone(5, -900, zone)).toBe(false);
    });
  });
});

describe("getZoneForOrder", () => {
  const delivery = squareZone("delivery", { minLng: 0, minLat: 0 });
  const restricted = squareZone("restricted", {
    minLng: 0,
    minLat: 0,
    type: "RESTRICTED",
  });

  test("returns the containing zone", () => {
    expect(getZoneForOrder(order("o", 5, 5), [delivery])?.id).toBe("delivery");
  });

  test("returns null when the point is outside every zone", () => {
    expect(getZoneForOrder(order("o", 80, 80), [delivery])).toBeNull();
  });

  test("returns null when there are no zones at all", () => {
    expect(getZoneForOrder(order("o", 5, 5), [])).toBeNull();
  });

  test("parses string coordinates (numeric DB columns arrive as strings)", () => {
    expect(getZoneForOrder(order("o", "5", "5.5"), [delivery])?.id).toBe(
      "delivery",
    );
  });

  test("skips inactive zones", () => {
    const inactive = squareZone("inactive", { active: false });
    expect(getZoneForOrder(order("o", 5, 5), [inactive])).toBeNull();
  });

  describe("RESTRICTED wins over DELIVERY on overlap", () => {
    test("regardless of the order of the zones array", () => {
      expect(
        getZoneForOrder(order("o", 5, 5), [delivery, restricted])?.id,
      ).toBe("restricted");
      expect(
        getZoneForOrder(order("o", 5, 5), [restricted, delivery])?.id,
      ).toBe("restricted");
    });

    test("an inactive RESTRICTED zone does not win", () => {
      const off = squareZone("restricted", {
        type: "RESTRICTED",
        active: false,
      });
      expect(getZoneForOrder(order("o", 5, 5), [delivery, off])?.id).toBe(
        "delivery",
      );
    });
  });

  describe("two overlapping DELIVERY zones", () => {
    // NOTE — documents current behavior, not necessarily desirable behavior.
    // The tie-break between two non-RESTRICTED zones is "first match in the
    // array wins", so the answer depends on the caller's zone ordering.
    // `loadInputs` selects zones without an ORDER BY, which makes this
    // effectively DB-row-order dependent. Reported to the team lead.
    test("resolve to whichever zone appears first in the array", () => {
      const a = squareZone("a");
      const b = squareZone("b");
      expect(getZoneForOrder(order("o", 5, 5), [a, b])?.id).toBe("a");
      expect(getZoneForOrder(order("o", 5, 5), [b, a])?.id).toBe("b");
    });

    test("a point on a shared border belongs to the first of the two", () => {
      const west = squareZone("west", { minLng: 0 });
      const east = squareZone("east", { minLng: 10 });
      expect(getZoneForOrder(order("o", 5, 10), [west, east])?.id).toBe("west");
      expect(getZoneForOrder(order("o", 5, 10), [east, west])?.id).toBe("east");
    });
  });

  describe("degenerate coordinates", () => {
    const warnings = muteWarnings();

    test("unparseable string coordinates → null, with a warning", () => {
      expect(getZoneForOrder(order("o", "abc", "5"), [delivery])).toBeNull();
      expect(warnings.calls).toBeGreaterThan(0);
    });

    test("NaN coordinates → null", () => {
      expect(getZoneForOrder(order("o", Number.NaN, 5), [delivery])).toBeNull();
    });

    test("null / undefined coordinates → null", () => {
      // NOTE — these slip past the `Number.isNaN` guard (`Number.isNaN(null)`
      // is false). They are caught one level down, where `turf.point` throws
      // "coordinates must contain numbers" and `isPointInZone` swallows it.
      // The result is right; the guard is just not the thing producing it.
      const nullish = {
        id: "o",
        latitude: null as unknown as number,
        longitude: 5,
      };
      expect(getZoneForOrder(nullish, [delivery])).toBeNull();

      const undef = {
        id: "o",
        latitude: 5,
        longitude: undefined as unknown as number,
      };
      expect(getZoneForOrder(undef, [delivery])).toBeNull();
    });
  });
});

describe("isOrderInRestrictedZone", () => {
  const delivery = squareZone("delivery");
  const restricted = squareZone("restricted", { type: "RESTRICTED" });

  test("true when the drop-off falls in an active RESTRICTED zone", () => {
    expect(isOrderInRestrictedZone(order("o", 5, 5), [restricted])).toBe(true);
  });

  test("true even when a DELIVERY zone also covers the point", () => {
    expect(
      isOrderInRestrictedZone(order("o", 5, 5), [delivery, restricted]),
    ).toBe(true);
  });

  test("false for a DELIVERY zone, for no zone, and for an inactive restriction", () => {
    expect(isOrderInRestrictedZone(order("o", 5, 5), [delivery])).toBe(false);
    expect(isOrderInRestrictedZone(order("o", 80, 80), [restricted])).toBe(
      false,
    );
    expect(
      isOrderInRestrictedZone(order("o", 5, 5), [
        squareZone("off", { type: "RESTRICTED", active: false }),
      ]),
    ).toBe(false);
  });
});

describe("groupOrdersByZone", () => {
  const west = squareZone("west", { minLng: 0 });
  const east = squareZone("east", { minLng: 20 });

  test("pre-seeds a bucket for every active zone plus 'unzoned'", () => {
    const grouped = groupOrdersByZone([], [west, east]);
    expect([...grouped.keys()]).toEqual(["west", "east", "unzoned"]);
    expect(grouped.get("west")).toEqual([]);
  });

  test("inactive zones get no bucket", () => {
    const grouped = groupOrdersByZone(
      [],
      [west, squareZone("off", { active: false })],
    );
    expect([...grouped.keys()]).toEqual(["west", "unzoned"]);
  });

  test("with zero zones every order lands in 'unzoned'", () => {
    const orders = [order("a", 5, 5), order("b", 25, 25)];
    const grouped = groupOrdersByZone(orders, []);
    expect([...grouped.keys()]).toEqual(["unzoned"]);
    expect(grouped.get("unzoned")).toEqual(orders);
  });

  test("splits orders into their zone and leaves the rest unzoned", () => {
    const grouped = groupOrdersByZone(
      [order("a", 5, 5), order("b", 5, 25), order("c", 80, 80)],
      [west, east],
    );
    expect(grouped.get("west")?.map((o) => o.id)).toEqual(["a"]);
    expect(grouped.get("east")?.map((o) => o.id)).toEqual(["b"]);
    expect(grouped.get("unzoned")?.map((o) => o.id)).toEqual(["c"]);
  });

  test("preserves the caller's extra order fields (generic passthrough)", () => {
    const grouped = groupOrdersByZone(
      [{ id: "a", latitude: 5, longitude: 5, trackingId: "TRK-1" }],
      [west],
    );
    expect(grouped.get("west")?.[0].trackingId).toBe("TRK-1");
  });

  test("ISOLATION — no order lands in a bucket whose polygon excludes it", () => {
    // Four disjoint zones on a grid, 400 pseudo-random points across a bounding
    // box that is deliberately larger than their union so plenty of points fall
    // outside every polygon.
    const zones = [
      squareZone("z0", { minLng: 0, minLat: 0 }),
      squareZone("z1", { minLng: 20, minLat: 0 }),
      squareZone("z2", { minLng: 0, minLat: 20 }),
      squareZone("z3", { minLng: 20, minLat: 20 }),
    ];
    const random = makeRandom(20260728);
    const orders = Array.from({ length: 400 }, (_, i) =>
      order(`o${i}`, random() * 40, random() * 40),
    );

    const grouped = groupOrdersByZone(orders, zones);

    for (const [zoneId, bucket] of grouped) {
      if (zoneId === "unzoned") {
        for (const o of bucket) {
          const inSome = zones.some((z) =>
            isPointInZone(o.latitude, o.longitude, z),
          );
          expect(inSome).toBe(false);
        }
        continue;
      }

      const zone = zones.find((z) => z.id === zoneId);
      if (!zone) throw new Error(`bucket for unknown zone ${zoneId}`);
      for (const o of bucket) {
        expect(isPointInZone(o.latitude, o.longitude, zone)).toBe(true);
      }
    }
  });

  test("CONSERVATION — every order appears exactly once across all buckets", () => {
    const zones = [
      squareZone("z0", { minLng: 0, minLat: 0 }),
      squareZone("z1", { minLng: 20, minLat: 20 }),
    ];
    const random = makeRandom(7);
    const orders = Array.from({ length: 200 }, (_, i) =>
      order(`o${i}`, random() * 40, random() * 40),
    );

    const seen = [...groupOrdersByZone(orders, zones).values()]
      .flat()
      .map((o) => o.id);

    expect(seen).toHaveLength(orders.length);
    expect(new Set(seen).size).toBe(orders.length);
  });

  test("is deterministic for identical input", () => {
    const zones = [squareZone("z0"), squareZone("z1", { minLng: 20 })];
    const orders = [order("a", 5, 5), order("b", 5, 25), order("c", 80, 80)];
    const first = groupOrdersByZone(orders, zones);
    const second = groupOrdersByZone(orders, zones);
    expect([...first.entries()]).toEqual([...second.entries()]);
    expect(first.get("z1")?.map((o) => o.id)).toEqual(["b"]);
  });
});
