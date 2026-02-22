"""Pydantic models matching the pyvrp-adapter.ts request/response contract."""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel


# ── Request models ──────────────────────────────────────────────────


class Order(BaseModel):
    id: str
    tracking_id: str
    address: str
    lat: float
    lng: float
    weight: float = 0
    volume: float = 0
    value: Optional[float] = None
    units: Optional[int] = None
    order_type: Optional[str] = None
    priority: Optional[int] = None
    time_window_start: Optional[str] = None
    time_window_end: Optional[str] = None
    service_time: Optional[int] = 300  # seconds
    skills: Optional[List[str]] = None


class Vehicle(BaseModel):
    id: str
    identifier: str
    max_weight: float
    max_volume: float
    max_value: Optional[float] = None
    max_units: Optional[int] = None
    max_orders: Optional[int] = None
    origin_lat: Optional[float] = None
    origin_lng: Optional[float] = None
    skills: Optional[List[str]] = None
    speed_factor: Optional[float] = 1.0


class Depot(BaseModel):
    lat: float
    lng: float
    time_window_start: Optional[str] = None
    time_window_end: Optional[str] = None


class Config(BaseModel):
    depot: Depot
    objective: str = "BALANCED"  # DISTANCE | TIME | BALANCED
    balance_visits: bool = False
    max_distance_km: Optional[float] = None
    max_travel_time_minutes: Optional[float] = None
    traffic_factor: Optional[int] = 50  # 0-100 scale (0=no traffic, 100=heavy)
    route_end_mode: Optional[str] = "DRIVER_ORIGIN"
    minimize_vehicles: bool = False
    open_start: bool = False
    flexible_time_windows: bool = False
    max_routes: Optional[int] = None
    timeout_seconds: int = 60


class SolveRequest(BaseModel):
    orders: List[Order]
    vehicles: List[Vehicle]
    config: Config


# ── Response models (snake_case, consumed by pyvrp-adapter.ts) ──────


class Stop(BaseModel):
    order_id: str
    tracking_id: str
    address: str
    lat: float
    lng: float
    sequence: int
    arrival_time: Optional[float] = None
    service_time: Optional[float] = None
    waiting_time: Optional[float] = None


class Route(BaseModel):
    vehicle_id: str
    vehicle_identifier: str
    stops: List[Stop]
    total_distance: float  # meters
    total_duration: float  # seconds
    total_service_time: float  # seconds
    total_travel_time: float  # seconds
    total_weight: float
    total_volume: float
    geometry: Optional[str] = None


class UnassignedOrder(BaseModel):
    order_id: str
    tracking_id: str
    reason: str


class Metrics(BaseModel):
    total_distance: float
    total_duration: float
    total_routes: int
    total_stops: int
    computing_time_ms: float
    balance_score: Optional[float] = None


class SolveResponse(BaseModel):
    routes: List[Route]
    unassigned: List[UnassignedOrder]
    metrics: Metrics
