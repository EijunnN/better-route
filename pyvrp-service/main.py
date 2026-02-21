"""PyVRP FastAPI microservice for vehicle routing optimization."""

from __future__ import annotations

import traceback

import pyvrp
from fastapi import FastAPI, HTTPException

from models import SolveRequest, SolveResponse
from solver import solve

app = FastAPI(
    title="PyVRP Optimization Service",
    description="Vehicle routing optimization powered by PyVRP",
    version="1.0.0",
)


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "ok",
        "engine": "pyvrp",
        "version": pyvrp.__version__,
    }


@app.post("/solve", response_model=SolveResponse)
async def solve_vrp(request: SolveRequest):
    """Solve a vehicle routing problem.

    Accepts orders, vehicles, and configuration; returns optimized routes.
    """
    try:
        result = solve(request)
        return result
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Optimization failed: {str(exc)}",
        ) from exc
