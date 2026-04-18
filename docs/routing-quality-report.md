# Routing Quality Report

Generated: 2026-04-18T02:16:49.657Z

Scenarios: 12 × 2 solvers = 24 runs

Passed: **19** / 24

## Summary table

| Scenario | VROOM | PyVRP |
|---|---|---|
| 01-basic-10-orders | ✅ 0un 218ms | ✅ 0un 15279ms |
| 02-tight-time-windows | ❌ 1H 0S 0un | ❌ 3H 0S 0un |
| 03-skills-scarce | ✅ 0un 84ms | ✅ 0un 30092ms |
| 04-capacity-at-limit | ✅ 0un 71ms | ✅ 0un 15087ms |
| 05-urgent-priority | ✅ 5un 83ms | ❌ 1H 0S 0un |
| 06-vehicle-workday | ✅ 6un 134ms | ❌ 7H 0S 0un |
| 07-multi-dimensional-capacity | ✅ 0un 110ms | ✅ 0un 30100ms |
| 08-max-orders-per-vehicle | ✅ 0un 104ms | ✅ 0un 30113ms |
| 09-break-time | ✅ 0un 86ms | ✅ 0un 30091ms |
| 10-infeasible-skill | ✅ 5un 61ms | ✅ 5un 15092ms |
| 11-mixed-priorities | ✅ 0un 83ms | ✅ 0un 30092ms |
| 12-stress-50-orders | ✅ 0un 107ms | ⚠️ error |

## Per-scenario detail

### 01-basic-10-orders

10 orders, 2 vehicles, no constraints — smoke test

**VROOM** — PASS in 218ms

- routes=1, assigned=10, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — PASS in 15279ms

- routes=1, assigned=10, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 02-tight-time-windows

16 orders split into strict morning and afternoon windows

**VROOM** — FAIL in 188ms

- routes=1, assigned=16, unassigned=0
- violations: HARD=1, SOFT=0, INFO=0
- breakdown:
  - `TIME_WINDOW_VIOLATED`: 1
- expectation failures:
  - HARD violations 1 > allowed 0
- sample hard violations:
  - [TIME_WINDOW_VIOLATED] (order TRK-00012) expected=>= 14:00 actual=11:11

**PYVRP** — FAIL in 30098ms

- routes=1, assigned=16, unassigned=0
- violations: HARD=3, SOFT=0, INFO=0
- breakdown:
  - `TIME_WINDOW_VIOLATED`: 2
  - `VEHICLE_WORKDAY_EXCEEDED`: 1
- expectation failures:
  - HARD violations 3 > allowed 0
- sample hard violations:
  - [TIME_WINDOW_VIOLATED] (order TRK-00000) expected=>= 08:00 actual=00:04
  - [VEHICLE_WORKDAY_EXCEEDED] (order TRK-00000) expected=>= 08:00 actual=00:04
  - [TIME_WINDOW_VIOLATED] (order TRK-00012) expected=>= 14:00 actual=09:33

### 03-skills-scarce

Skill-gated orders with limited capable vehicles

**VROOM** — PASS in 84ms

- routes=1, assigned=12, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — PASS in 30092ms

- routes=1, assigned=12, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 04-capacity-at-limit

10 orders × 100kg, 2 vehicles × 500kg — exactly at limit

**VROOM** — PASS in 71ms

- routes=2, assigned=10, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — PASS in 15087ms

- routes=2, assigned=10, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 05-urgent-priority

Capacity-constrained: URGENT orders must prevail

**VROOM** — PASS in 83ms

- routes=1, assigned=10, unassigned=5
- violations: HARD=0, SOFT=0, INFO=5
- breakdown:
  - `UNASSIGNED_ORDER`: 5

**PYVRP** — FAIL in 30105ms

- routes=1, assigned=15, unassigned=0
- violations: HARD=1, SOFT=0, INFO=0
- breakdown:
  - `CAPACITY_EXCEEDED_WEIGHT`: 1
- expectation failures:
  - HARD violations 1 > allowed 0
- sample hard violations:
  - [CAPACITY_EXCEEDED_WEIGHT] (veh VEH-1) expected=<= 500 actual=750

### 06-vehicle-workday

Narrow vehicle workday — stops must not spill past window

**VROOM** — PASS in 134ms

- routes=1, assigned=14, unassigned=6
- violations: HARD=0, SOFT=0, INFO=6
- breakdown:
  - `UNASSIGNED_ORDER`: 6

**PYVRP** — FAIL in 30145ms

- routes=1, assigned=20, unassigned=0
- violations: HARD=7, SOFT=0, INFO=0
- breakdown:
  - `VEHICLE_WORKDAY_EXCEEDED`: 7
- expectation failures:
  - HARD violations 7 > allowed 0
- sample hard violations:
  - [VEHICLE_WORKDAY_EXCEEDED] (order TRK-00002) expected=<= 13:00 actual=13:13
  - [VEHICLE_WORKDAY_EXCEEDED] (order TRK-00006) expected=<= 13:00 actual=13:31
  - [VEHICLE_WORKDAY_EXCEEDED] (order TRK-00005) expected=<= 13:00 actual=13:46

### 07-multi-dimensional-capacity

Mixed weight/volume demands — both dimensions matter

**VROOM** — PASS in 110ms

- routes=2, assigned=20, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — PASS in 30100ms

- routes=2, assigned=20, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 08-max-orders-per-vehicle

maxOrders limit forces distribution across vehicles

**VROOM** — PASS in 104ms

- routes=3, assigned=20, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — PASS in 30113ms

- routes=3, assigned=20, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 09-break-time

Mandatory lunch break 12:00-13:00 inside 08:00-18:00 workday

**VROOM** — PASS in 86ms

- routes=1, assigned=15, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — PASS in 30091ms

- routes=1, assigned=15, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 10-infeasible-skill

Orders require skill no vehicle provides — must unassign

**VROOM** — PASS in 61ms

- routes=1, assigned=5, unassigned=5
- violations: HARD=0, SOFT=0, INFO=5
- breakdown:
  - `UNASSIGNED_ORDER`: 5

**PYVRP** — PASS in 15092ms

- routes=1, assigned=5, unassigned=5
- violations: HARD=0, SOFT=0, INFO=5
- breakdown:
  - `UNASSIGNED_ORDER`: 5

### 11-mixed-priorities

Mixed orderTypes — all must be assigned when capacity suffices

**VROOM** — PASS in 83ms

- routes=1, assigned=16, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — PASS in 30092ms

- routes=1, assigned=16, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 12-stress-50-orders

Scale test — 50 orders, 5 vehicles

**VROOM** — PASS in 107ms

- routes=1, assigned=50, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — FAIL in 60005ms

Error: `The operation timed out.`
