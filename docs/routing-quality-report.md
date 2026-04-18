# Routing Quality Report

Generated: 2026-04-18T02:51:51.662Z

Scenarios: 12 × 2 solvers = 24 runs

Passed: **20** / 24

## Summary table

| Scenario | VROOM | PyVRP |
|---|---|---|
| 01-basic-10-orders | ✅ 0un 73ms | ✅ 0un 15090ms |
| 02-tight-time-windows | ❌ 1H 0S 0un | ❌ 3H 0S 0un |
| 03-skills-scarce | ✅ 0un 65ms | ❌ 0H 0S 4un |
| 04-capacity-at-limit | ✅ 0un 63ms | ✅ 0un 15087ms |
| 05-urgent-priority | ✅ 5un 85ms | ✅ 5un 30092ms |
| 06-vehicle-workday | ✅ 6un 99ms | ✅ 6un 30091ms |
| 07-multi-dimensional-capacity | ✅ 0un 114ms | ✅ 0un 30101ms |
| 08-max-orders-per-vehicle | ✅ 0un 104ms | ✅ 0un 30111ms |
| 09-break-time | ✅ 0un 75ms | ✅ 0un 30083ms |
| 10-infeasible-skill | ✅ 5un 59ms | ✅ 5un 15090ms |
| 11-mixed-priorities | ✅ 0un 81ms | ✅ 0un 30089ms |
| 12-stress-50-orders | ✅ 0un 105ms | ⚠️ error |

## Per-scenario detail

### 01-basic-10-orders

10 orders, 2 vehicles, no constraints — smoke test

**VROOM** — PASS in 73ms

- routes=1, assigned=10, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — PASS in 15090ms

- routes=1, assigned=10, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 02-tight-time-windows

16 orders split into strict morning and afternoon windows

**VROOM** — FAIL in 80ms

- routes=1, assigned=16, unassigned=0
- violations: HARD=1, SOFT=0, INFO=0
- breakdown:
  - `TIME_WINDOW_VIOLATED`: 1
- expectation failures:
  - HARD violations 1 > allowed 0
- sample hard violations:
  - [TIME_WINDOW_VIOLATED] (order TRK-00012) expected=>= 14:00 actual=11:11

**PYVRP** — FAIL in 30088ms

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

**VROOM** — PASS in 65ms

- routes=1, assigned=12, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — FAIL in 30082ms

- routes=1, assigned=8, unassigned=4
- violations: HARD=0, SOFT=0, INFO=4
- breakdown:
  - `UNASSIGNED_ORDER`: 4
- expectation failures:
  - unassigned 4 > allowed 0

### 04-capacity-at-limit

10 orders × 100kg, 2 vehicles × 500kg — exactly at limit

**VROOM** — PASS in 63ms

- routes=2, assigned=10, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — PASS in 15087ms

- routes=2, assigned=10, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 05-urgent-priority

Capacity-constrained: URGENT orders must prevail

**VROOM** — PASS in 85ms

- routes=1, assigned=10, unassigned=5
- violations: HARD=0, SOFT=0, INFO=5
- breakdown:
  - `UNASSIGNED_ORDER`: 5

**PYVRP** — PASS in 30092ms

- routes=1, assigned=10, unassigned=5
- violations: HARD=0, SOFT=0, INFO=5
- breakdown:
  - `UNASSIGNED_ORDER`: 5

### 06-vehicle-workday

Narrow vehicle workday — stops must not spill past window

**VROOM** — PASS in 99ms

- routes=1, assigned=14, unassigned=6
- violations: HARD=0, SOFT=0, INFO=6
- breakdown:
  - `UNASSIGNED_ORDER`: 6

**PYVRP** — PASS in 30091ms

- routes=1, assigned=14, unassigned=6
- violations: HARD=0, SOFT=0, INFO=6
- breakdown:
  - `UNASSIGNED_ORDER`: 6

### 07-multi-dimensional-capacity

Mixed weight/volume demands — both dimensions matter

**VROOM** — PASS in 114ms

- routes=2, assigned=20, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — PASS in 30101ms

- routes=2, assigned=20, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 08-max-orders-per-vehicle

maxOrders limit forces distribution across vehicles

**VROOM** — PASS in 104ms

- routes=3, assigned=20, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — PASS in 30111ms

- routes=3, assigned=20, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 09-break-time

Mandatory lunch break 12:00-13:00 inside 08:00-18:00 workday

**VROOM** — PASS in 75ms

- routes=1, assigned=15, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — PASS in 30083ms

- routes=1, assigned=15, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 10-infeasible-skill

Orders require skill no vehicle provides — must unassign

**VROOM** — PASS in 59ms

- routes=1, assigned=5, unassigned=5
- violations: HARD=0, SOFT=0, INFO=5
- breakdown:
  - `UNASSIGNED_ORDER`: 5

**PYVRP** — PASS in 15090ms

- routes=1, assigned=5, unassigned=5
- violations: HARD=0, SOFT=0, INFO=5
- breakdown:
  - `UNASSIGNED_ORDER`: 5

### 11-mixed-priorities

Mixed orderTypes — all must be assigned when capacity suffices

**VROOM** — PASS in 81ms

- routes=1, assigned=16, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — PASS in 30089ms

- routes=1, assigned=16, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 12-stress-50-orders

Scale test — 50 orders, 5 vehicles

**VROOM** — PASS in 105ms

- routes=1, assigned=50, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — FAIL in 60013ms

Error: `The operation timed out.`
