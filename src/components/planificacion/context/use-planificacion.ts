"use client";

import { use } from "react";
import { PlanificacionContext } from "./context-instance";
import type { PlanificacionContextValue } from "./types";

export function usePlanificacion(): PlanificacionContextValue {
  const context = use(PlanificacionContext);
  if (context === undefined) {
    throw new Error("usePlanificacion must be used within a PlanificacionProvider");
  }
  return context;
}
