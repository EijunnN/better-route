"""Core VRP solver using PyVRP library."""

from __future__ import annotations

import math
import time
from typing import List, Tuple

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
SCALE = 100  # PyVRP uses integers; we scale floats by this factor


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
# flat metric space (equirectangular approximation) and scale to
# centimeters so the integer representation keeps ~1 m precision.


def _project(
    lat: float, lng: float, ref_lat: float
) -> Tuple[int, int]:
    """Project lat/lng to integer x/y (centimeters from origin)."""
    x = EARTH_RADIUS_M * math.radians(lng) * math.cos(math.radians(ref_lat))
    y = EARTH_RADIUS_M * math.radians(lat)
    return int(round(x * SCALE)), int(round(y * SCALE))


# ── Capacity helpers ────────────────────────────────────────────────


BIG_CAPACITY = 999_999_999  # effectively unconstrained


def _capacity_vector(v: Vehicle) -> List[int]:
    """Build multi-dimensional capacity vector [weight, volume, value, units]."""
    return [
        int(round(v.max_weight * SCALE)),
        int(round(v.max_volume * SCALE)),
        int(round(v.max_value * SCALE)) if v.max_value is not None else BIG_CAPACITY,
        int(v.max_units * SCALE) if v.max_units is not None else BIG_CAPACITY,
    ]


def _delivery_vector(o: Order) -> List[int]:
    """Build matching delivery demand vector for an order."""
    return [
        int(round(o.weight * SCALE)),
        int(round(o.volume * SCALE)),
        int(round(o.value * SCALE)) if o.value is not None else 0,
        int(o.units * SCALE) if o.units is not None else 0,
    ]


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
    # PyVRP does not have native skills support, so we pre-filter:
    # an order with required skills can only be served by vehicles
    # that have all those skills. We handle this by making orders
    # with unmet skills unassigned upfront.
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

    # ── Reference latitude for projection ───────────────────────────
    ref_lat = cfg.depot.lat

    # ── Build PyVRP model ───────────────────────────────────────────
    m = Model()

    # Depot
    depot_x, depot_y = _project(cfg.depot.lat, cfg.depot.lng, ref_lat)
    depot_tw_start, depot_tw_end = _parse_tw(
        cfg.depot.time_window_start, cfg.depot.time_window_end
    )
    depot = m.add_depot(
        x=depot_x,
        y=depot_y,
        tw_early=depot_tw_start,
        tw_late=depot_tw_end,
    )

    # Vehicles
    for v_idx, v in enumerate(vehicles):
        caps = _capacity_vector(v)
        # Use vehicle-specific origin as start depot if provided
        # For now all vehicles share the single depot (PyVRP limitation
        # with single-depot models). Multi-depot support can be added later.
        # Use index-prefixed name to guarantee uniqueness for vehicle lookup
        vtype_kwargs = dict(
            num_available=1,
            capacity=caps,
            start_depot=depot,
            end_depot=depot,
            tw_early=depot_tw_start,
            tw_late=depot_tw_end,
            name=f"{v_idx}:{v.identifier}",
        )
        # Max distance constraint
        if cfg.max_distance_km is not None:
            vtype_kwargs["max_distance"] = int(cfg.max_distance_km * 1000 * SCALE)
        # Max travel time constraint
        if cfg.max_travel_time_minutes is not None:
            vtype_kwargs["max_duration"] = int(cfg.max_travel_time_minutes * 60)

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

        # Minimize vehicles: add fixed cost so solver prefers fewer vehicles
        if cfg.minimize_vehicles:
            vtype_kwargs["fixed_cost"] = 10_000_000

        m.add_vehicle_type(**vtype_kwargs)

    # Clients (orders)
    clients = []
    for o in feasible_orders:
        cx, cy = _project(o.lat, o.lng, ref_lat)
        tw_start, tw_end = _parse_tw(o.time_window_start, o.time_window_end)
        delivery = _delivery_vector(o)
        service_dur = o.service_time if o.service_time else 300

        # Priority: higher priority orders get a prize so the solver
        # strongly prefers to include them. Non-required orders get a lower
        # prize so they can be dropped if capacity is tight.
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
    # locations = [depot, client_0, client_1, ...]
    all_lats = [cfg.depot.lat] + [o.lat for o in feasible_orders]
    all_lngs = [cfg.depot.lng] + [o.lng for o in feasible_orders]
    n = len(all_lats)

    locations = m.locations
    for i in range(n):
        for j in range(n):
            if i == j:
                m.add_edge(locations[i], locations[j], distance=0, duration=0)
                continue
            dist_m = haversine_m(all_lats[i], all_lngs[i], all_lats[j], all_lngs[j])
            # Apply road-factor (straight-line to road distance approximation)
            dist_m *= 1.3
            duration_s = dist_m / DEFAULT_SPEED_MPS
            m.add_edge(
                locations[i],
                locations[j],
                distance=int(round(dist_m * SCALE)),
                duration=int(round(duration_s)),
            )

    # ── Solve ───────────────────────────────────────────────────────
    timeout = cfg.timeout_seconds if cfg.timeout_seconds > 0 else 60
    result = m.solve(stop=MaxRuntime(timeout), display=False)

    # ── Build response ──────────────────────────────────────────────
    solution = result.best
    routes: List[Route] = []
    assigned_order_ids: set[str] = set()

    if solution is not None and solution.num_routes() > 0:
        for sol_route in solution.routes():
            # Identify vehicle via the "idx:identifier" name we set on VehicleType
            vtype = sol_route.vehicle_type()
            v_idx = int(vtype.name.split(":")[0])
            vehicle = vehicles[v_idx]

            stops: List[Stop] = []
            route_distance = 0.0
            route_travel_time = 0.0
            route_service_time = 0.0
            route_weight = 0.0
            route_volume = 0.0

            # Collect client indices from all trips in this route.
            # Each trip has visits() returning 0-based client indices.
            client_indices: list[int] = []
            for trip in sol_route.trips():
                client_indices.extend(trip.visits())

            prev_lat, prev_lng = cfg.depot.lat, cfg.depot.lng

            for seq, client_idx in enumerate(client_indices):
                order = feasible_orders[client_idx]
                assigned_order_ids.add(order.id)

                leg_dist = haversine_m(
                    prev_lat, prev_lng, order.lat, order.lng
                ) * 1.3
                leg_time = leg_dist / DEFAULT_SPEED_MPS

                route_distance += leg_dist
                route_travel_time += leg_time
                svc = order.service_time if order.service_time else 300
                route_service_time += svc
                route_weight += order.weight
                route_volume += order.volume

                stops.append(
                    Stop(
                        order_id=order.id,
                        tracking_id=order.tracking_id,
                        address=order.address,
                        lat=order.lat,
                        lng=order.lng,
                        sequence=seq + 1,
                        arrival_time=route_travel_time,
                        service_time=float(svc),
                        waiting_time=0,
                    )
                )
                prev_lat, prev_lng = order.lat, order.lng

            # Return leg to depot
            return_dist = haversine_m(
                prev_lat, prev_lng, cfg.depot.lat, cfg.depot.lng
            ) * 1.3
            return_time = return_dist / DEFAULT_SPEED_MPS
            route_distance += return_dist
            route_travel_time += return_time

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
