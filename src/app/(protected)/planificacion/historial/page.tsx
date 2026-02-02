"use client";

import { ProtectedPage } from "@/components/auth/protected-page";
import { HistorialProvider } from "@/components/planificacion/historial-context";
import {
  HistorialHeader,
  HistorialCompanySelector,
  HistorialFilters,
  HistorialError,
  HistorialContent,
} from "@/components/planificacion/historial-components";

function PlanificacionHistorialPageContent() {
  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <div className="mb-8">
        <HistorialHeader />
        <HistorialCompanySelector />
        <HistorialFilters />
      </div>
      <HistorialError />
      <HistorialContent />
    </div>
  );
}

/**
 * Historial Page - Compound Component Pattern
 *
 * Uses composition to separate:
 * - State management (HistorialProvider)
 * - UI components (HistorialHeader, HistorialFilters, etc.)
 *
 * For custom layouts:
 * ```tsx
 * <HistorialProvider>
 *   <HistorialHeader />
 *   <HistorialFilters />
 *   <HistorialComparisonCard />
 *   <HistorialJobList />
 * </HistorialProvider>
 * ```
 */
export default function PlanificacionHistorialPage() {
  return (
    <ProtectedPage requiredPermission="plan:read">
      <HistorialProvider>
        <PlanificacionHistorialPageContent />
      </HistorialProvider>
    </ProtectedPage>
  );
}
