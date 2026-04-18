import { describe, test, expect } from "bun:test";
import {
  buildOrderCapacityVector,
  buildVehicleCapacityVector,
  resolveOrderPriority,
} from "@/lib/orders/profile-schema";
import { baseSchema, fullCapacitySchema } from "./fixtures";

describe("buildOrderCapacityVector", () => {
  test("returns values in activeDimensions order", () => {
    const schema = fullCapacitySchema();
    const vec = buildOrderCapacityVector(
      {
        weightRequired: 500,
        volumeRequired: 12,
        orderValue: 3400,
        unitsRequired: 2,
      },
      schema,
    );
    expect(vec.dimensions).toEqual(["WEIGHT", "VOLUME", "VALUE", "UNITS"]);
    expect(vec.values).toEqual([500, 12, 3400, 2]);
  });

  test("applies per-dimension defaults when missing", () => {
    const schema = fullCapacitySchema();
    const vec = buildOrderCapacityVector({}, schema);
    // units default to 1 so an order without an explicit count still occupies a slot
    expect(vec.values).toEqual([0, 0, 0, 1]);
  });

  test("weight-only schema produces single-element vectors", () => {
    const schema = baseSchema();
    const vec = buildOrderCapacityVector({ weightRequired: 250 }, schema);
    expect(vec.dimensions).toEqual(["WEIGHT"]);
    expect(vec.values).toEqual([250]);
  });
});

describe("buildVehicleCapacityVector", () => {
  test("large defaults when vehicle missing a dimension", () => {
    const schema = fullCapacitySchema();
    const vec = buildVehicleCapacityVector({}, schema);
    // All four defaults are returned
    expect(vec.values).toHaveLength(4);
    expect(vec.values[0]).toBeGreaterThan(0); // WEIGHT default
  });
});

describe("resolveOrderPriority", () => {
  test("uses priorityMapping when order type is enabled", () => {
    const schema = baseSchema({ requireOrderType: true });
    expect(
      resolveOrderPriority({ orderType: "URGENT" }, schema),
    ).toBe(100);
    expect(
      resolveOrderPriority({ orderType: "NEW" }, schema),
    ).toBe(50);
  });

  test("falls back to order.priority when orderType not required", () => {
    const schema = baseSchema({ requireOrderType: false });
    expect(
      resolveOrderPriority({ orderType: "URGENT", priority: 42 }, schema),
    ).toBe(42);
  });

  test("returns undefined when neither orderType nor priority is set", () => {
    const schema = baseSchema();
    expect(resolveOrderPriority({}, schema)).toBeUndefined();
  });
});
