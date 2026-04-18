"use client";

import { createContext } from "react";
import type { PlanificacionContextValue } from "./types";

export const PlanificacionContext = createContext<PlanificacionContextValue | undefined>(undefined);
