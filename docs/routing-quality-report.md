# Routing Quality Report

Generated: 2026-04-18T16:38:16.427Z

Scenarios: 28 × 2 solvers = 56 runs

Passed: **50** / 56

## Summary table

| Scenario | VROOM | PyVRP |
|---|---|---|
| 01-basic-10-orders | ✅ 0un 175ms | ✅ 0un 15216ms |
| 02-tight-time-windows | ✅ 0un 150ms | ✅ 0un 30120ms |
| 03-skills-scarce | ✅ 0un 76ms | ❌ 0H 0S 4un |
| 04-capacity-at-limit | ✅ 0un 88ms | ✅ 0un 15096ms |
| 05-urgent-priority | ✅ 5un 77ms | ✅ 5un 30107ms |
| 06-vehicle-workday | ✅ 6un 156ms | ✅ 6un 30130ms |
| 07-multi-dimensional-capacity | ✅ 0un 141ms | ✅ 0un 30133ms |
| 08-max-orders-per-vehicle | ✅ 0un 106ms | ✅ 0un 30118ms |
| 09-break-time | ✅ 0un 85ms | ✅ 0un 30089ms |
| 10-infeasible-skill | ✅ 5un 75ms | ✅ 5un 15126ms |
| 11-mixed-priorities | ✅ 0un 83ms | ✅ 0un 30089ms |
| 12-stress-50-orders | ✅ 0un 104ms | ⚠️ error |
| 13-soft-time-windows | ❌ 6H 0S 0un | ✅ 0un 30192ms |
| 14-batched-shifts | ✅ 0un 183ms | ⚠️ error |
| 15-depot-closes-early | ✅ 0un 82ms | ✅ 0un 30183ms |
| 16-exact-time-tolerance | ✅ 0un 53ms | ✅ 0un 15079ms |
| 17-zone-by-skill-proxy | ✅ 0un 71ms | ❌ 0H 0S 6un |
| 18-value-dimension-active | ✅ 0un 79ms | ✅ 0un 15070ms |
| 19-mixed-fleet-heavy-light | ✅ 0un 46ms | ✅ 0un 15068ms |
| 20-full-day-with-break | ✅ 0un 114ms | ✅ 0un 30118ms |
| 21-high-traffic-factor | ✅ 8un 99ms | ✅ 7un 30091ms |
| 22-200-orders-real-scale | ✅ 22un 1031ms | ⚠️ error |
| 23-urgent-same-window | ✅ 5un 69ms | ✅ 5un 31125ms |
| 24-max-distance-km-tight | ✅ 4un 88ms | ✅ 4un 30093ms |
| 25-open-end-mode | ✅ 0un 68ms | ✅ 0un 15072ms |
| 26-driver-origin-mode | ✅ 0un 69ms | ✅ 0un 30099ms |
| 27-zero-orders | ✅ 0un 18ms | ✅ 0un 2ms |
| 28-unreachable-coords | ✅ 0un 32ms | ✅ 2un 15066ms |

## Per-scenario detail

### 01-basic-10-orders

10 orders, 2 vehicles, no constraints — smoke test

**VROOM** — PASS in 175ms

- routes=1, assigned=10, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — PASS in 15216ms

- routes=1, assigned=10, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 02-tight-time-windows

16 orders split into strict morning and afternoon windows

**VROOM** — PASS in 150ms

- routes=1, assigned=16, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — PASS in 30120ms

- routes=1, assigned=16, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 03-skills-scarce

Skill-gated orders with limited capable vehicles

**VROOM** — PASS in 76ms

- routes=1, assigned=12, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — FAIL in 30097ms

- routes=1, assigned=8, unassigned=4
- violations: HARD=0, SOFT=0, INFO=4
- breakdown:
  - `UNASSIGNED_ORDER`: 4
- expectation failures:
  - unassigned 4 > allowed 0

### 04-capacity-at-limit

10 orders × 100kg, 2 vehicles × 500kg — exactly at limit

**VROOM** — PASS in 88ms

- routes=2, assigned=10, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — PASS in 15096ms

- routes=2, assigned=10, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 05-urgent-priority

Capacity-constrained: URGENT orders must prevail

**VROOM** — PASS in 77ms

- routes=1, assigned=10, unassigned=5
- violations: HARD=0, SOFT=0, INFO=5
- breakdown:
  - `UNASSIGNED_ORDER`: 5

**PYVRP** — PASS in 30107ms

- routes=1, assigned=10, unassigned=5
- violations: HARD=0, SOFT=0, INFO=5
- breakdown:
  - `UNASSIGNED_ORDER`: 5

### 06-vehicle-workday

Narrow vehicle workday — stops must not spill past window

**VROOM** — PASS in 156ms

- routes=1, assigned=14, unassigned=6
- violations: HARD=0, SOFT=0, INFO=6
- breakdown:
  - `UNASSIGNED_ORDER`: 6

**PYVRP** — PASS in 30130ms

- routes=1, assigned=14, unassigned=6
- violations: HARD=0, SOFT=0, INFO=6
- breakdown:
  - `UNASSIGNED_ORDER`: 6

### 07-multi-dimensional-capacity

Mixed weight/volume demands — both dimensions matter

**VROOM** — PASS in 141ms

- routes=2, assigned=20, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — PASS in 30133ms

- routes=2, assigned=20, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 08-max-orders-per-vehicle

maxOrders limit forces distribution across vehicles

**VROOM** — PASS in 106ms

- routes=3, assigned=20, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — PASS in 30118ms

- routes=3, assigned=20, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 09-break-time

Mandatory lunch break 12:00-13:00 inside 08:00-18:00 workday

**VROOM** — PASS in 85ms

- routes=1, assigned=15, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — PASS in 30089ms

- routes=1, assigned=15, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 10-infeasible-skill

Orders require skill no vehicle provides — must unassign

**VROOM** — PASS in 75ms

- routes=1, assigned=5, unassigned=5
- violations: HARD=0, SOFT=0, INFO=5
- breakdown:
  - `UNASSIGNED_ORDER`: 5

**PYVRP** — PASS in 15126ms

- routes=1, assigned=5, unassigned=5
- violations: HARD=0, SOFT=0, INFO=5
- breakdown:
  - `UNASSIGNED_ORDER`: 5

### 11-mixed-priorities

Mixed orderTypes — all must be assigned when capacity suffices

**VROOM** — PASS in 83ms

- routes=1, assigned=16, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — PASS in 30089ms

- routes=1, assigned=16, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 12-stress-50-orders

Scale test — 50 orders, 5 vehicles

**VROOM** — PASS in 104ms

- routes=1, assigned=50, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — FAIL in 60024ms

Error: `The operation timed out.`

### 13-soft-time-windows

Tight windows with flexibleTimeWindows=true — solver gets ±30min

**VROOM** — FAIL in 83ms

- routes=1, assigned=16, unassigned=0
- violations: HARD=6, SOFT=0, INFO=0
- breakdown:
  - `TIME_WINDOW_VIOLATED`: 6
- expectation failures:
  - HARD violations 6 > allowed 0
- sample hard violations:
  - [TIME_WINDOW_VIOLATED] (order TRK-00007) expected=<= 11:00 actual=11:08
  - [TIME_WINDOW_VIOLATED] (order TRK-00001) expected=<= 11:00 actual=11:18
  - [TIME_WINDOW_VIOLATED] (order TRK-00003) expected=<= 11:00 actual=11:30

**PYVRP** — PASS in 30192ms

- routes=1, assigned=16, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 14-batched-shifts

40 orders across two shifts (MAÑANA / TARDE), 3 vehicles full-day

**VROOM** — PASS in 183ms

- routes=3, assigned=40, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — FAIL in 60011ms

Error: `The operation timed out.`

### 15-depot-closes-early

Depot 08:00-16:00, vehicle 08:00-18:00 — depot window binds

**VROOM** — PASS in 82ms

- routes=1, assigned=15, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — PASS in 30183ms

- routes=1, assigned=15, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 16-exact-time-tolerance

5 orders with 30-minute windows at specific times

**VROOM** — PASS in 53ms

- routes=1, assigned=5, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — PASS in 15079ms

- routes=1, assigned=5, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 17-zone-by-skill-proxy

2 zones modeled via required skills; vehicles can't cross

**VROOM** — PASS in 71ms

- routes=2, assigned=12, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — FAIL in 30099ms

- routes=1, assigned=6, unassigned=6
- violations: HARD=0, SOFT=0, INFO=6
- breakdown:
  - `UNASSIGNED_ORDER`: 6
- expectation failures:
  - unassigned 6 > allowed 0
  - routes 1 < min 2

### 18-value-dimension-active

VALUE dimension — orders have orderValue, vehicles have maxValueCapacity

**VROOM** — PASS in 79ms

- routes=2, assigned=10, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — PASS in 15070ms

- routes=2, assigned=10, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 19-mixed-fleet-heavy-light

5 × 400kg orders, 2 LIGHT (500kg) + 1 HEAVY (2000kg)

**VROOM** — PASS in 46ms

- routes=1, assigned=5, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — PASS in 15068ms

- routes=1, assigned=5, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 20-full-day-with-break

25 orders across a 08:00-18:00 workday with 12:00-13:00 break

**VROOM** — PASS in 114ms

- routes=1, assigned=25, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — PASS in 30118ms

- routes=1, assigned=25, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 21-high-traffic-factor

trafficFactor=90 (rush hour) shrinks effective throughput

**VROOM** — PASS in 99ms

- routes=1, assigned=12, unassigned=8
- violations: HARD=0, SOFT=0, INFO=8
- breakdown:
  - `UNASSIGNED_ORDER`: 8

**PYVRP** — PASS in 30091ms

- routes=1, assigned=13, unassigned=7
- violations: HARD=0, SOFT=0, INFO=7
- breakdown:
  - `UNASSIGNED_ORDER`: 7

### 22-200-orders-real-scale

200 orders, 10 vehicles, mixed constraints — real morning import

**VROOM** — PASS in 1031ms

- routes=10, assigned=178, unassigned=22
- violations: HARD=0, SOFT=0, INFO=22
- breakdown:
  - `UNASSIGNED_ORDER`: 22

**PYVRP** — FAIL in 120020ms

Error: `The operation timed out.`

### 23-urgent-same-window

3 URGENT + 10 NEW all at 14:00-16:00; URGENT must prevail

**VROOM** — PASS in 69ms

- routes=1, assigned=8, unassigned=5
- violations: HARD=0, SOFT=0, INFO=5
- breakdown:
  - `UNASSIGNED_ORDER`: 5

**PYVRP** — PASS in 31125ms

- routes=1, assigned=8, unassigned=5
- violations: HARD=0, SOFT=0, INFO=5
- breakdown:
  - `UNASSIGNED_ORDER`: 5

### 24-max-distance-km-tight

15 orders with a 30km per-route distance cap

**VROOM** — PASS in 88ms

- routes=3, assigned=11, unassigned=4
- violations: HARD=0, SOFT=0, INFO=4
- breakdown:
  - `UNASSIGNED_ORDER`: 4

**PYVRP** — PASS in 30093ms

- routes=3, assigned=11, unassigned=4
- violations: HARD=0, SOFT=0, INFO=4
- breakdown:
  - `UNASSIGNED_ORDER`: 4

### 25-open-end-mode

10 orders with OPEN_END route mode — no return to depot

**VROOM** — PASS in 68ms

- routes=1, assigned=10, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — PASS in 15072ms

- routes=1, assigned=10, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 26-driver-origin-mode

3 vehicles each starting/ending at driver's own origin

**VROOM** — PASS in 69ms

- routes=1, assigned=12, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — PASS in 30099ms

- routes=1, assigned=12, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 27-zero-orders

Empty order list — exercises the empty-input code path

**VROOM** — PASS in 18ms

- routes=0, assigned=0, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — PASS in 2ms

- routes=0, assigned=0, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 28-unreachable-coords

2 orders outside OSRM Peru dataset — expected unassigned

**VROOM** — PASS in 32ms

- routes=1, assigned=5, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — PASS in 15066ms

- routes=1, assigned=3, unassigned=2
- violations: HARD=0, SOFT=0, INFO=2
- breakdown:
  - `UNASSIGNED_ORDER`: 2
