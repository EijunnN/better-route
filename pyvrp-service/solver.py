"""Core VRP solver using PyVRP library with OSRM integration."""

from __future__ import annotations

import math
import os
import time
from typing import List, Optional, Tuple

import httpx
from pyvrp import Model
from pyvrp.stop import MaxRuntime

from models import (
    Config,
    Metrics,
    Order,
    Route,
    SolveRequest,
    SolveResponse,
    Stop,
    UnassignedOrder,
    Vehicle,
)

# ── Constants ───────────────────────────────────────────────────────

EARTH_RADIUS_M = 6_371_000  # meters
DEFAULT_SPEED_MPS = 8.33  # ~30 km/h urban driving, in m/s
OSRM_URL = os.environ.get("OSRM_URL", "http://osrm-backend:5000")
OSRM_TIMEOUT = 15  # seconds


# ── OSRM helpers ─────────────────────────────────────────────────────


def _fetch_osrm_table(
    lats: List[float], lngs: List[float]
) -> Optional[Tuple[List[List[float]], List[List[float]]]]:
    """Fetch distance and duration matrices from OSRM /table endpoint.

    Returns (durations, distances) or None if OSRM is unavailable.
    """
    coords = ";".join(f"{lng},{lat}" for lat, lng in zip(lats, lngs))
    radiuses = ";".join(["35000"] * len(lats))
    url = (
        f"{OSRM_URL}/table/v1/car/{coords}"
        f"?annotations=duration,distance&radiuses={radiuses}"
    )
    try:
        resp = httpx.get(url, timeout=OSRM_TIMEOUT)
        if resp.status_code != 200:
            print(f"[OSRM] table returned {resp.status_code}")
            return None
        data = resp.json()
        if data.get("code") != "Ok":
            print(f"[OSRM] table error: {data.get('message', data.get('code'))}")
            return None
        return data["durations"], data["distances"]
    except Exception as exc:
        print(f"[OSRM] table request failed: {exc}")
        return None


def _fetch_osrm_route(
    lats: List[float], lngs: List[float]
) -> Optional[str]:
    """Fetch road geometry from OSRM /route endpoint.

    Returns encoded polyline string or None.
    """
    if len(lats) < 2:
        return None
    coords = ";".join(f"{lng},{lat}" for lat, lng in zip(lats, lngs))
    radiuses = ";".join(["35000"] * len(lats))
    url = (
        f"{OSRM_URL}/route/v1/car/{coords}"
        f"?alternatives=false&steps=false&overview=full"
        f"&continue_straight=false&radiuses={radiuses}"
    )
    try:
        resp = httpx.get(url, timeout=OSRM_TIMEOUT)
        if resp.status_code != 200:
            return None
        data = resp.json()
        if data.get("code") != "Ok" or not data.get("routes"):
            return None
        route = data["routes"][0]
        return route.get("geometry")
    except Exception as exc:
        print(f"[OSRM] route request failed: {exc}")
        return None


# ── Haversine ───────────────────────────────────────────────────────


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Return distance in meters between two lat/lng points."""
    rlat1, rlat2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(rlat1) * math.cos(rlat2) * math.sin(dlng / 2) ** 2
    )
    return EARTH_RADIUS_M * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ── Coordinate projection ──────────────────────────────────────────
# PyVRP expects integer x/y coordinates. We project lat/lng into a
# flat metric space (equirectangular approximation).


def _project(
    lat: float, lng: float, ref_lat: float
) -> Tuple[int, int]:
    """Project lat/lng to integer x/y (meters from origin)."""
    x = EARTH_RADIUS_M * math.radians(lng) * math.cos(math.radians(ref_lat))
    y = EARTH_RADIUS_M * math.radians(lat)
    return int(round(x)), int(round(y))


# ── Capacity helpers ────────────────────────────────────────────────


def _detect_active_dimensions(
    orders: List[Order], vehicles: List[Vehicle]
) -> List[str]:
    """Determine which capacity dimensions have non-zero demand.

    Only includes dimensions where at least one order has demand > 0.
    Always includes "orders" to enforce max_orders per vehicle.
    """
    dims: List[str] = []
    if any(o.weight > 0 for o in orders):
        dims.append("weight")
    if any(o.volume > 0 for o in orders):
        dims.append("volume")
    if any(o.value is not None and o.value > 0 for o in orders):
        dims.append("value")
    if any(o.units is not None and o.units > 0 for o in orders):
        dims.append("units")

    # Always include "orders" dimension for max_orders / balance enforcement
    dims.append("orders")
    return dims


def _capacity_vector(
    v: Vehicle, dims: List[str], max_orders_override: int | None = None
) -> List[int]:
    """Build capacity vector using only active dimensions."""
    cap: List[int] = []
    for d in dims:
        if d == "weight":
            cap.append(int(round(v.max_weight)))
        elif d == "volume":
            cap.append(int(round(v.max_volume)))
        elif d == "value":
            cap.append(int(round(v.max_value)) if v.max_value is not None else 100_000)
        elif d == "units":
            cap.append(int(v.max_units) if v.max_units is not None else 1000)
        elif d == "orders":
            # Use override (from balance logic) or vehicle's max_orders
            limit = max_orders_override or (v.max_orders if v.max_orders else 999)
            cap.append(int(limit))
    return cap


def _delivery_vector(o: Order, dims: List[str]) -> List[int]:
    """Build delivery demand vector using only active dimensions."""
    dem: List[int] = []
    for d in dims:
        if d == "weight":
            dem.append(int(round(o.weight)))
        elif d == "volume":
            dem.append(int(round(o.volume)))
        elif d == "value":
            dem.append(int(round(o.value)) if o.value is not None else 0)
        elif d == "units":
            dem.append(int(o.units) if o.units is not None else 0)
        elif d == "orders":
            dem.append(1)  # each order counts as 1
    return dem


# ── Time-window parsing ────────────────────────────────────────────


def _parse_tw(start_str: str | None, end_str: str | None) -> Tuple[int, int]:
    """Parse ISO time-window strings into seconds-from-midnight.

    Returns (0, very-large) when either bound is missing.
    """
    big = 24 * 3600  # 86400 – one full day
    if not start_str and not end_str:
        return 0, big

    def _to_secs(s: str) -> int:
        # Accept "HH:MM", "HH:MM:SS", or full ISO datetime (take time part)
        t = s
        if "T" in s:
            t = s.split("T")[1]
            if "Z" in t:
                t = t.replace("Z", "")
            if "+" in t:
                t = t.split("+")[0]
            if "-" in t and t.count("-") > 0 and t.index("-") > 0:
                t = t.split("-")[0]
        parts = t.split(":")
        h, m = int(parts[0]), int(parts[1]) if len(parts) > 1 else 0
        sec = int(parts[2]) if len(parts) > 2 else 0
        return h * 3600 + m * 60 + sec

    tw_start = _to_secs(start_str) if start_str else 0
    tw_end = _to_secs(end_str) if end_str else big
    return tw_start, tw_end


# ── Main solver ─────────────────────────────────────────────────────


def solve(request: SolveRequest) -> SolveResponse:
    """Build a PyVRP model from the request and solve it."""
    t0 = time.time()

    orders = request.orders
    vehicles = request.vehicles
    cfg = request.config

    # ── Log full config from preset ─────────────────────────────────
    print(f"[PyVRP] === Config received ===")
    print(f"[PyVRP]   objective={cfg.objective}")
    print(f"[PyVRP]   balance_visits={cfg.balance_visits}")
    print(f"[PyVRP]   minimize_vehicles={cfg.minimize_vehicles}")
    print(f"[PyVRP]   traffic_factor={cfg.traffic_factor}")
    print(f"[PyVRP]   max_distance_km={cfg.max_distance_km}")
    print(f"[PyVRP]   max_travel_time_minutes={cfg.max_travel_time_minutes}")
    print(f"[PyVRP]   route_end_mode={cfg.route_end_mode}")
    print(f"[PyVRP]   open_start={cfg.open_start}")
    print(f"[PyVRP]   flexible_time_windows={cfg.flexible_time_windows}")
    print(f"[PyVRP]   timeout_seconds={cfg.timeout_seconds}")
    print(f"[PyVRP]   depot=({cfg.depot.lat}, {cfg.depot.lng}) tw={cfg.depot.time_window_start}-{cfg.depot.time_window_end}")
    print(f"[PyVRP] ========================")

    # ── Edge case: no orders ────────────────────────────────────────
    if not orders:
        return _empty_response(vehicles, time.time() - t0)

    # ── Edge case: no vehicles ──────────────────────────────────────
    if not vehicles:
        return SolveResponse(
            routes=[],
            unassigned=[
                UnassignedOrder(
                    order_id=o.id,
                    tracking_id=o.tracking_id,
                    reason="No vehicles available",
                )
                for o in orders
            ],
            metrics=Metrics(
                total_distance=0,
                total_duration=0,
                total_routes=0,
                total_stops=0,
                computing_time_ms=(time.time() - t0) * 1000,
            ),
        )

    # ── Skills filtering ────────────────────────────────────────────
    vehicle_skills = {
        v.id: set(v.skills) if v.skills else set() for v in vehicles
    }
    feasible_orders: List[Order] = []
    skill_unassigned: List[UnassignedOrder] = []
    for o in orders:
        if o.skills:
            required = set(o.skills)
            if not any(required <= vs for vs in vehicle_skills.values()):
                skill_unassigned.append(
                    UnassignedOrder(
                        order_id=o.id,
                        tracking_id=o.tracking_id,
                        reason=f"No vehicle has required skills: {', '.join(o.skills)}",
                    )
                )
                continue
        feasible_orders.append(o)

    if not feasible_orders:
        return SolveResponse(
            routes=[],
            unassigned=skill_unassigned,
            metrics=Metrics(
                total_distance=0,
                total_duration=0,
                total_routes=0,
                total_stops=0,
                computing_time_ms=(time.time() - t0) * 1000,
            ),
        )

    # ── Traffic factor → duration multiplier ────────────────────────
    # traffic_factor 0-100:  0 = no traffic (fast), 50 = normal, 100 = heavy
    # Matches VROOM formula: speed_mult = 1.5 - traffic/100
    # duration_mult = 1 / speed_mult
    tf = cfg.traffic_factor if cfg.traffic_factor is not None else 50
    speed_mult = max(0.1, 1.5 - tf / 100)  # 0→1.5x speed, 50→1.0x, 100→0.5x
    duration_mult = 1.0 / speed_mult
    # For haversine fallback, road factor replaces the old hardcoded 1.3
    road_factor = 1.3  # haversine → road distance inflation
    print(f"[PyVRP] Traffic factor: {tf}% → speed {speed_mult:.2f}x, duration {duration_mult:.2f}x")

    # ── Reference latitude for projection ───────────────────────────
    ref_lat = cfg.depot.lat

    # ── Collect unique depot locations ──────────────────────────────
    # Each vehicle may have its own origin (driver's start point).
    # We register a separate PyVRP depot per unique origin so the
    # solver routes each vehicle starting from its real location.
    depot_coords: List[Tuple[float, float]] = []  # (lat, lng)
    depot_coord_to_idx: dict[Tuple[float, float], int] = {}

    def _depot_key(lat: float, lng: float) -> Tuple[float, float]:
        return (round(lat, 6), round(lng, 6))

    # Main depot always at index 0
    main_key = _depot_key(cfg.depot.lat, cfg.depot.lng)
    depot_coords.append((cfg.depot.lat, cfg.depot.lng))
    depot_coord_to_idx[main_key] = 0

    # Check each vehicle for a unique origin
    vehicle_start_depot_idx: List[int] = []
    for v in vehicles:
        if v.origin_lat is not None and v.origin_lng is not None:
            key = _depot_key(v.origin_lat, v.origin_lng)
            if key not in depot_coord_to_idx:
                depot_coord_to_idx[key] = len(depot_coords)
                depot_coords.append((v.origin_lat, v.origin_lng))
            vehicle_start_depot_idx.append(depot_coord_to_idx[key])
        else:
            vehicle_start_depot_idx.append(0)  # fallback to main depot

    num_depots = len(depot_coords)
    print(f"[PyVRP] {num_depots} depot(s): main + {num_depots - 1} vehicle origin(s)")

    # ── Detect active capacity dimensions ─────────────────────────
    active_dims = _detect_active_dimensions(feasible_orders, vehicles)
    print(f"[PyVRP] Active capacity dimensions: {active_dims}")

    # ── Balance: compute max orders per vehicle ─────────────────
    balanced_max_orders: int | None = None
    if cfg.balance_visits and len(vehicles) > 0:
        balanced_max_orders = math.ceil(len(feasible_orders) / len(vehicles)) + 1
        print(f"[PyVRP] Balance enabled: max {balanced_max_orders} orders/vehicle ({len(feasible_orders)} orders / {len(vehicles)} vehicles)")

    # ── Build PyVRP model ───────────────────────────────────────────
    m = Model()

    # Create all depots
    depot_tw_start, depot_tw_end = _parse_tw(
        cfg.depot.time_window_start, cfg.depot.time_window_end
    )
    print(f"[PyVRP] Depot time window: {cfg.depot.time_window_start}-{cfg.depot.time_window_end} → {depot_tw_start}s-{depot_tw_end}s")
    depot_objects = []
    for dlat, dlng in depot_coords:
        dx, dy = _project(dlat, dlng, ref_lat)
        d = m.add_depot(
            x=dx,
            y=dy,
            tw_early=depot_tw_start,
            tw_late=depot_tw_end,
        )
        depot_objects.append(d)

    main_depot = depot_objects[0]

    # Vehicles — each gets its own start_depot
    # end_depot depends on route_end_mode:
    #   RETURN_TO_DEPOT → main depot (warehouse)
    #   DRIVER_ORIGIN   → vehicle's own start depot (round trip from home)
    #   default         → vehicle's own start depot (best geographic clustering)
    is_open_end = cfg.route_end_mode == "OPEN_END"
    use_driver_return = cfg.route_end_mode == "DRIVER_ORIGIN" or (
        cfg.route_end_mode not in ("RETURN_TO_DEPOT", "SPECIFIC_DEPOT", "OPEN_END")
    )
    end_label = "open (no return)" if is_open_end else ("own origin" if use_driver_return else "main depot")
    print(f"[PyVRP] route_end_mode={cfg.route_end_mode}, drivers return to {end_label}")

    # open_start: when True, vehicles can depart at any time (tw_early=0)
    vehicle_tw_early = 0 if cfg.open_start else depot_tw_start
    if cfg.open_start:
        print("[PyVRP] Open start: vehicles can depart at any time")

    for v_idx, v in enumerate(vehicles):
        # Use balanced max or vehicle's own max_orders (whichever is smaller)
        effective_max = balanced_max_orders
        if v.max_orders and (effective_max is None or v.max_orders < effective_max):
            effective_max = v.max_orders
        caps = _capacity_vector(v, active_dims, effective_max)
        start_depot = depot_objects[vehicle_start_depot_idx[v_idx]]
        # OPEN_END: end at start depot but we skip return leg in metrics
        # DRIVER_ORIGIN: end at vehicle's own origin
        # RETURN_TO_DEPOT / SPECIFIC_DEPOT: end at main depot
        if is_open_end:
            end_depot = start_depot  # PyVRP needs an end depot; we skip return leg in output
        elif use_driver_return:
            end_depot = start_depot
        else:
            end_depot = main_depot

        vtype_kwargs = dict(
            num_available=1,
            capacity=caps,
            start_depot=start_depot,
            end_depot=end_depot,
            tw_early=vehicle_tw_early,
            tw_late=depot_tw_end,
            name=f"{v_idx}:{v.identifier}",
        )
        # max_duration / max_distance not natively supported in PyVRP <=0.13.x.
        # Approximate max_distance via time: dist_km / speed_kmh = hours
        if cfg.max_distance_km is not None:
            speed_kmh = (DEFAULT_SPEED_MPS * speed_mult) * 3.6  # m/s → km/h
            approx_hours = cfg.max_distance_km / speed_kmh
            max_late_dist = depot_tw_start + int(approx_hours * 3600)
            if max_late_dist < vtype_kwargs["tw_late"]:
                vtype_kwargs["tw_late"] = max_late_dist
                print(f"[PyVRP] max_distance_km={cfg.max_distance_km} → shift end {max_late_dist}s (≈{approx_hours:.1f}h at {speed_kmh:.0f}km/h)")

        if cfg.max_travel_time_minutes is not None:
            max_late = depot_tw_start + int(cfg.max_travel_time_minutes * 60)
            if max_late < vtype_kwargs["tw_late"]:
                vtype_kwargs["tw_late"] = max_late

        # Objective tuning via cost weights
        if cfg.objective == "DISTANCE":
            vtype_kwargs["unit_distance_cost"] = 1
            vtype_kwargs["unit_duration_cost"] = 0
        elif cfg.objective == "TIME":
            vtype_kwargs["unit_distance_cost"] = 0
            vtype_kwargs["unit_duration_cost"] = 1
        else:  # BALANCED
            vtype_kwargs["unit_distance_cost"] = 1
            vtype_kwargs["unit_duration_cost"] = 1

        # Minimize vehicles: moderate fixed cost (OSRM distances are in meters,
        # a typical 30km route ≈ 30,000m cost; 100k encourages fewer vehicles
        # without dominating the objective)
        if cfg.minimize_vehicles:
            vtype_kwargs["fixed_cost"] = 100_000

        m.add_vehicle_type(**vtype_kwargs)

    # Clients (orders)
    # flexible_time_windows: when True, widen time windows by ±30 min tolerance
    tw_tolerance = 1800 if cfg.flexible_time_windows else 0  # 30 min in seconds
    if tw_tolerance:
        print(f"[PyVRP] Flexible time windows: ±{tw_tolerance // 60} min tolerance")

    clients = []
    for o in feasible_orders:
        cx, cy = _project(o.lat, o.lng, ref_lat)
        tw_start, tw_end = _parse_tw(o.time_window_start, o.time_window_end)
        # Apply tolerance for flexible windows
        if tw_tolerance:
            tw_start = max(0, tw_start - tw_tolerance)
            tw_end = tw_end + tw_tolerance
        delivery = _delivery_vector(o, active_dims)
        service_dur = o.service_time if o.service_time else 300

        prize = 0
        required = True
        if o.priority is not None and o.priority > 0:
            prize = o.priority * 1000

        client = m.add_client(
            x=cx,
            y=cy,
            delivery=delivery,
            service_duration=service_dur,
            tw_early=tw_start,
            tw_late=tw_end,
            prize=prize,
            required=required,
            name=o.id,
        )
        clients.append(client)

    # ── Distance / duration matrix ──────────────────────────────────
    # locations = [depot_0, depot_1, ..., depot_k-1, client_0, client_1, ...]
    # OSRM matrix coordinates must follow the same order as m.locations
    all_lats = [d[0] for d in depot_coords] + [o.lat for o in feasible_orders]
    all_lngs = [d[1] for d in depot_coords] + [o.lng for o in feasible_orders]
    n = len(all_lats)

    # Try OSRM for real road distances/durations
    osrm_data = _fetch_osrm_table(all_lats, all_lngs)
    use_osrm = osrm_data is not None

    if use_osrm:
        durations_matrix, distances_matrix = osrm_data
        print(f"[PyVRP] Using OSRM distance/duration matrix ({n}x{n})")
    else:
        print(f"[PyVRP] OSRM unavailable, falling back to haversine ({n}x{n})")

    locations = m.locations
    for i in range(n):
        for j in range(n):
            if i == j:
                m.add_edge(locations[i], locations[j], distance=0, duration=0)
                continue

            if use_osrm:
                dur = durations_matrix[i][j]
                dist = distances_matrix[i][j]
                # OSRM returns null for unreachable pairs
                if dur is None or dist is None:
                    dist = haversine_m(all_lats[i], all_lngs[i], all_lats[j], all_lngs[j]) * road_factor
                    dur = dist / DEFAULT_SPEED_MPS
                # Apply traffic factor to duration (OSRM gives free-flow times)
                dur = dur * duration_mult
            else:
                dist = haversine_m(all_lats[i], all_lngs[i], all_lats[j], all_lngs[j]) * road_factor
                dur = (dist / DEFAULT_SPEED_MPS) * duration_mult

            m.add_edge(
                locations[i],
                locations[j],
                distance=int(round(dist)),
                duration=int(round(dur)),
            )

    # ── Solve ───────────────────────────────────────────────────────
    # Adaptive timeout: small instances solve fast
    base_timeout = cfg.timeout_seconds if cfg.timeout_seconds > 0 else 60
    n_clients = len(feasible_orders)
    if n_clients <= 3:
        timeout = min(base_timeout, 5)
    elif n_clients <= 10:
        timeout = min(base_timeout, 15)
    elif n_clients <= 30:
        timeout = min(base_timeout, 30)
    elif n_clients <= 100:
        timeout = min(base_timeout, 60)
    else:
        timeout = base_timeout

    # Multi-start: run solver multiple times with different seeds and keep best.
    # Skip multi-start for small problems (<=10 orders) — single run suffices.
    NUM_STARTS = 3
    use_multi_start = n_clients > 10

    if use_multi_start:
        run_timeout = max(5, timeout // NUM_STARTS)
        print(f"[PyVRP] Multi-start: {NUM_STARTS} runs x {run_timeout}s each, {n_clients} orders, {len(vehicles)} vehicles")

        best_solution = None
        best_cost = float("inf")
        best_run = -1

        for run in range(NUM_STARTS):
            seed = run * 42 + 1  # 1, 43, 85
            result = m.solve(stop=MaxRuntime(run_timeout), seed=seed, display=False)
            sol = result.best

            if sol is None or sol.num_routes() == 0:
                print(f"[PyVRP]   Run {run + 1}/{NUM_STARTS} (seed={seed}): no feasible solution")
                continue

            # Calculate cost based on objective
            if cfg.objective == "DISTANCE":
                cost = sol.distance()
            elif cfg.objective == "TIME":
                cost = sol.duration()
            else:  # BALANCED
                cost = sol.distance() + sol.duration()

            print(
                f"[PyVRP]   Run {run + 1}/{NUM_STARTS} (seed={seed}): "
                f"cost={cost:,.0f}, routes={sol.num_routes()}, "
                f"dist={sol.distance():,.0f}, dur={sol.duration():,.0f}"
            )

            if cost < best_cost:
                best_cost = cost
                best_solution = sol
                best_run = run + 1

        solution = best_solution
        if solution is not None:
            print(f"[PyVRP] Best: run {best_run}/{NUM_STARTS}, cost={best_cost:,.0f}")
        else:
            print("[PyVRP] Multi-start: no feasible solution found in any run")
    else:
        print(f"[PyVRP] Solving with {n_clients} orders, {len(vehicles)} vehicles, timeout={timeout}s")
        result = m.solve(stop=MaxRuntime(timeout), display=False)
        solution = result.best

    # ── Build response ──────────────────────────────────────────────
    routes: List[Route] = []
    assigned_order_ids: set[str] = set()

    model_data = m.data()

    if solution is not None and solution.num_routes() > 0:
        for sol_route in solution.routes():
            # route.vehicle_type() returns an int index in PyVRP <=0.13.x
            vtype_idx = sol_route.vehicle_type()
            vtype = model_data.vehicle_type(vtype_idx)
            v_idx = int(vtype.name.split(":")[0])
            vehicle = vehicles[v_idx]

            # Get this vehicle's actual origin coordinates
            start_didx = vehicle_start_depot_idx[v_idx]
            origin_lat, origin_lng = depot_coords[start_didx]

            stops: List[Stop] = []
            route_distance = 0.0
            route_travel_time = 0.0
            route_service_time = 0.0
            route_weight = 0.0
            route_volume = 0.0

            # Absolute clock time tracking (seconds from midnight)
            # Vehicle departs at depot time window start
            clock = depot_tw_start  # e.g., 09:00 = 32400

            # trip.visits() returns location indices; depots occupy
            # indices 0..num_depots-1, clients start at num_depots
            client_indices: list[int] = []
            for trip in sol_route.trips():
                client_indices.extend(trip.visits())

            # Route geometry starts from vehicle's ACTUAL origin
            route_lats = [origin_lat]
            route_lngs = [origin_lng]

            prev_lat, prev_lng = origin_lat, origin_lng

            for seq, loc_idx in enumerate(client_indices):
                client_idx = loc_idx - num_depots  # offset by number of depots
                order = feasible_orders[client_idx]
                assigned_order_ids.add(order.id)

                # Use OSRM matrix values if available
                if use_osrm:
                    # For first stop, previous is the vehicle's start depot
                    prev_osrm_idx = start_didx if seq == 0 else client_indices[seq - 1]
                    leg_dist = distances_matrix[prev_osrm_idx][loc_idx]
                    leg_time = durations_matrix[prev_osrm_idx][loc_idx]
                    if leg_dist is None or leg_time is None:
                        leg_dist = haversine_m(prev_lat, prev_lng, order.lat, order.lng) * road_factor
                        leg_time = leg_dist / DEFAULT_SPEED_MPS
                    # Apply traffic factor to duration
                    leg_time = leg_time * duration_mult
                else:
                    leg_dist = haversine_m(prev_lat, prev_lng, order.lat, order.lng) * road_factor
                    leg_time = (leg_dist / DEFAULT_SPEED_MPS) * duration_mult

                route_distance += leg_dist
                route_travel_time += leg_time
                svc = order.service_time if order.service_time else 300
                route_service_time += svc
                route_weight += order.weight
                route_volume += order.volume

                # Advance clock: travel to this stop
                clock += leg_time

                # If we arrive before the time window opens, wait
                tw_start, tw_end = _parse_tw(order.time_window_start, order.time_window_end)
                wait = max(0, tw_start - clock)

                route_lats.append(order.lat)
                route_lngs.append(order.lng)

                stops.append(
                    Stop(
                        order_id=order.id,
                        tracking_id=order.tracking_id,
                        address=order.address,
                        lat=order.lat,
                        lng=order.lng,
                        sequence=seq + 1,
                        arrival_time=clock,  # absolute seconds from midnight
                        service_time=float(svc),
                        waiting_time=wait,
                    )
                )

                # Advance clock past waiting + service before departing
                clock += wait + svc
                prev_lat, prev_lng = order.lat, order.lng

            # Return leg — skip for OPEN_END
            if not is_open_end:
                end_didx = start_didx if use_driver_return else 0
                end_lat, end_lng = depot_coords[end_didx]
                if use_osrm:
                    last_loc_idx = client_indices[-1] if client_indices else start_didx
                    return_dist = distances_matrix[last_loc_idx][end_didx]
                    return_time = durations_matrix[last_loc_idx][end_didx]
                    if return_dist is None or return_time is None:
                        return_dist = haversine_m(prev_lat, prev_lng, end_lat, end_lng) * road_factor
                        return_time = return_dist / DEFAULT_SPEED_MPS
                    return_time = return_time * duration_mult
                else:
                    return_dist = haversine_m(prev_lat, prev_lng, end_lat, end_lng) * road_factor
                    return_time = (return_dist / DEFAULT_SPEED_MPS) * duration_mult

                route_distance += return_dist
                route_travel_time += return_time

                # Add return point for geometry
                route_lats.append(end_lat)
                route_lngs.append(end_lng)

            # Fetch road geometry from OSRM
            geometry = _fetch_osrm_route(route_lats, route_lngs) if use_osrm else None

            total_duration = route_travel_time + route_service_time

            routes.append(
                Route(
                    vehicle_id=vehicle.id,
                    vehicle_identifier=vehicle.identifier,
                    stops=stops,
                    total_distance=round(route_distance, 1),
                    total_duration=round(total_duration, 1),
                    total_service_time=round(route_service_time, 1),
                    total_travel_time=round(route_travel_time, 1),
                    total_weight=round(route_weight, 2),
                    total_volume=round(route_volume, 2),
                    geometry=geometry,
                )
            )

    # Unassigned orders
    unassigned: List[UnassignedOrder] = list(skill_unassigned)
    for o in feasible_orders:
        if o.id not in assigned_order_ids:
            unassigned.append(
                UnassignedOrder(
                    order_id=o.id,
                    tracking_id=o.tracking_id,
                    reason="Could not fit in any vehicle route (capacity/time constraints)",
                )
            )

    # Metrics
    total_dist = sum(r.total_distance for r in routes)
    total_dur = sum(r.total_duration for r in routes)
    total_stops = sum(len(r.stops) for r in routes)
    balance_score = _compute_balance_score(routes) if len(routes) > 1 else 1.0

    elapsed_ms = (time.time() - t0) * 1000

    return SolveResponse(
        routes=routes,
        unassigned=unassigned,
        metrics=Metrics(
            total_distance=round(total_dist, 1),
            total_duration=round(total_dur, 1),
            total_routes=len(routes),
            total_stops=total_stops,
            computing_time_ms=round(elapsed_ms, 1),
            balance_score=round(balance_score, 4),
        ),
    )


# ── Helpers ─────────────────────────────────────────────────────────


def _empty_response(vehicles: List[Vehicle], elapsed: float) -> SolveResponse:
    return SolveResponse(
        routes=[],
        unassigned=[],
        metrics=Metrics(
            total_distance=0,
            total_duration=0,
            total_routes=0,
            total_stops=0,
            computing_time_ms=round(elapsed * 1000, 1),
        ),
    )


def _compute_balance_score(routes: List[Route]) -> float:
    """Compute a 0-1 balance score based on stop count variance.

    1.0 = perfectly balanced, 0.0 = extremely unbalanced.
    """
    if not routes:
        return 1.0
    counts = [len(r.stops) for r in routes]
    mean = sum(counts) / len(counts)
    if mean == 0:
        return 1.0
    variance = sum((c - mean) ** 2 for c in counts) / len(counts)
    cv = math.sqrt(variance) / mean  # coefficient of variation
    # Map CV to 0-1: CV=0 -> 1.0, CV>=2 -> 0.0
    return max(0.0, 1.0 - cv / 2)
