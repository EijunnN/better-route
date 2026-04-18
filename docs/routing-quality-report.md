# Routing Quality Report

Generated: 2026-04-18T23:36:13.594Z

Scenarios: 28 × 1 solver = 28 runs

Passed: **28** / 28

## Summary table

| Scenario | VROOM |
|---|---|
| 01-basic-10-orders | ✅ 0un 138ms |
| 02-tight-time-windows | ✅ 0un 86ms |
| 03-skills-scarce | ✅ 0un 68ms |
| 04-capacity-at-limit | ✅ 0un 58ms |
| 05-urgent-priority | ✅ 5un 69ms |
| 06-vehicle-workday | ✅ 6un 85ms |
| 07-multi-dimensional-capacity | ✅ 0un 94ms |
| 08-max-orders-per-vehicle | ✅ 0un 111ms |
| 09-break-time | ✅ 0un 74ms |
| 10-infeasible-skill | ✅ 5un 54ms |
| 11-mixed-priorities | ✅ 0un 71ms |
| 12-stress-50-orders | ✅ 0un 98ms |
| 13-soft-time-windows | ✅ 0un 77ms |
| 14-batched-shifts | ✅ 0un 144ms |
| 15-depot-closes-early | ✅ 0un 70ms |
| 16-exact-time-tolerance | ✅ 0un 42ms |
| 17-zone-by-skill-proxy | ✅ 0un 62ms |
| 18-value-dimension-active | ✅ 0un 56ms |
| 19-mixed-fleet-heavy-light | ✅ 0un 41ms |
| 20-full-day-with-break | ✅ 0un 94ms |
| 21-high-traffic-factor | ✅ 8un 85ms |
| 22-200-orders-real-scale | ✅ 22un 1121ms |
| 23-urgent-same-window | ✅ 5un 67ms |
| 24-max-distance-km-tight | ✅ 4un 86ms |
| 25-open-end-mode | ✅ 0un 53ms |
| 26-driver-origin-mode | ✅ 0un 63ms |
| 27-zero-orders | ✅ 0un 14ms |
| 28-unreachable-coords | ✅ 0un 24ms |

## Per-scenario detail

### 01-basic-10-orders

10 orders, 2 vehicles, no constraints — smoke test

**VROOM** — PASS in 138ms

- routes=1, assigned=10, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 02-tight-time-windows

16 orders split into strict morning and afternoon windows

**VROOM** — PASS in 86ms

- routes=1, assigned=16, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 03-skills-scarce

Skill-gated orders with limited capable vehicles

**VROOM** — PASS in 68ms

- routes=1, assigned=12, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 04-capacity-at-limit

10 orders × 100kg, 2 vehicles × 500kg — exactly at limit

**VROOM** — PASS in 58ms

- routes=2, assigned=10, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 05-urgent-priority

Capacity-constrained: URGENT orders must prevail

**VROOM** — PASS in 69ms

- routes=1, assigned=10, unassigned=5
- violations: HARD=0, SOFT=0, INFO=5
- breakdown:
  - `UNASSIGNED_ORDER`: 5

### 06-vehicle-workday

Narrow vehicle workday — stops must not spill past window

**VROOM** — PASS in 85ms

- routes=1, assigned=14, unassigned=6
- violations: HARD=0, SOFT=0, INFO=6
- breakdown:
  - `UNASSIGNED_ORDER`: 6

### 07-multi-dimensional-capacity

Mixed weight/volume demands — both dimensions matter

**VROOM** — PASS in 94ms

- routes=2, assigned=20, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 08-max-orders-per-vehicle

maxOrders limit forces distribution across vehicles

**VROOM** — PASS in 111ms

- routes=3, assigned=20, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 09-break-time

Mandatory lunch break 12:00-13:00 inside 08:00-18:00 workday

**VROOM** — PASS in 74ms

- routes=1, assigned=15, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 10-infeasible-skill

Orders require skill no vehicle provides — must unassign

**VROOM** — PASS in 54ms

- routes=1, assigned=5, unassigned=5
- violations: HARD=0, SOFT=0, INFO=5
- breakdown:
  - `UNASSIGNED_ORDER`: 5

### 11-mixed-priorities

Mixed orderTypes — all must be assigned when capacity suffices

**VROOM** — PASS in 71ms

- routes=1, assigned=16, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 12-stress-50-orders

Scale test — 50 orders, 5 vehicles

**VROOM** — PASS in 98ms

- routes=1, assigned=50, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 13-soft-time-windows

Tight windows with flexibleTimeWindows=true — solver gets ±30min

**VROOM** — PASS in 77ms

- routes=1, assigned=16, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 14-batched-shifts

40 orders across two shifts (MAÑANA / TARDE), 3 vehicles full-day

**VROOM** — PASS in 144ms

- routes=3, assigned=40, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 15-depot-closes-early

Depot 08:00-16:00, vehicle 08:00-18:00 — depot window binds

**VROOM** — PASS in 70ms

- routes=1, assigned=15, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 16-exact-time-tolerance

5 orders with 30-minute windows at specific times

**VROOM** — PASS in 42ms

- routes=1, assigned=5, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 17-zone-by-skill-proxy

2 zones modeled via required skills; vehicles can't cross

**VROOM** — PASS in 62ms

- routes=2, assigned=12, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 18-value-dimension-active

VALUE dimension — orders have orderValue, vehicles have maxValueCapacity

**VROOM** — PASS in 56ms

- routes=2, assigned=10, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 19-mixed-fleet-heavy-light

5 × 400kg orders, 2 LIGHT (500kg) + 1 HEAVY (2000kg)

**VROOM** — PASS in 41ms

- routes=1, assigned=5, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 20-full-day-with-break

25 orders across a 08:00-18:00 workday with 12:00-13:00 break

**VROOM** — PASS in 94ms

- routes=1, assigned=25, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 21-high-traffic-factor

trafficFactor=90 (rush hour) shrinks effective throughput

**VROOM** — PASS in 85ms

- routes=1, assigned=12, unassigned=8
- violations: HARD=0, SOFT=0, INFO=8
- breakdown:
  - `UNASSIGNED_ORDER`: 8

### 22-200-orders-real-scale

200 orders, 10 vehicles, mixed constraints — real morning import

**VROOM** — PASS in 1121ms

- routes=10, assigned=178, unassigned=22
- violations: HARD=0, SOFT=0, INFO=22
- breakdown:
  - `UNASSIGNED_ORDER`: 22

### 23-urgent-same-window

3 URGENT + 10 NEW all at 14:00-16:00; URGENT must prevail

**VROOM** — PASS in 67ms

- routes=1, assigned=8, unassigned=5
- violations: HARD=0, SOFT=0, INFO=5
- breakdown:
  - `UNASSIGNED_ORDER`: 5

### 24-max-distance-km-tight

15 orders with a 30km per-route distance cap

**VROOM** — PASS in 86ms

- routes=3, assigned=11, unassigned=4
- violations: HARD=0, SOFT=0, INFO=4
- breakdown:
  - `UNASSIGNED_ORDER`: 4

### 25-open-end-mode

10 orders with OPEN_END route mode — no return to depot

**VROOM** — PASS in 53ms

- routes=1, assigned=10, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 26-driver-origin-mode

3 vehicles each starting/ending at driver's own origin

**VROOM** — PASS in 63ms

- routes=1, assigned=12, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 27-zero-orders

Empty order list — exercises the empty-input code path

**VROOM** — PASS in 14ms

- routes=0, assigned=0, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 28-unreachable-coords

2 orders outside OSRM Peru dataset — expected unassigned

**VROOM** — PASS in 24ms

- routes=1, assigned=5, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0
