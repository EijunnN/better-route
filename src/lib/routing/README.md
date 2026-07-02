# src/lib/routing — ejecución de rutas y helpers de API

> Orientación del módulo. Dominio: bounded context **Route Execution**
> (`docs/CONTEXT.md` §5) + los helpers transversales de tenancy/RBAC que
> usan todas las API routes. Reglas de revisión: `docs/REVIEW-RUBRIC.md`.

## Qué vive acá

- **`route-helpers.ts`** — `extractTenantContextAuthed(request, user)`,
  el helper canónico de derivación de tenant de toda API route (JWT
  autoritativo; `x-company-id` solo para `ADMIN_SISTEMA`; mismatch = 403).
  Es el helper de la invariante #1 de CONTEXT.md (ADR-0008). Su
  complemento RBAC, `requireRoutePermission`, vive en
  `src/lib/infra/api-middleware.ts` (ADR-0010,
  `src/lib/auth/permissions/README.md`).
- **`driver-assignment.ts`** — scoring de asignación driver→vehículo
  (skills, disponibilidad, licencia, fleet, workload → `AssignmentScore`).
  Lo consume el stage 4 del runner
  (`src/lib/optimization/optimization-runner/stages/assign-drivers.ts`)
  y el endpoint `/api/driver-assignment`.
- **`reassignment/`** — transferencia de stops de un driver ausente:
  `options.ts` (candidatos), `impact.ts`, `execute.ts` (aplica y audita en
  `reassignments_history` — append-only, invariante #8), `history.ts`.
- **`output-generator.ts`** (+ `-types.ts`) — artefactos exportables del
  plan confirmado (`output_history`; contexto Reporting & Output).
- **`stop-custom-fields.ts`** — lectura/validación de custom fields de
  `route_stops` contra `company_field_definitions`.

## Qué NO vive acá (pero se confunde)

- Máquina de estados de stops: `STOP_STATUS_TRANSITIONS` está en
  `src/db/schema/routing.ts`; los grafos de workflow en `src/lib/workflow/`.
- Gate de confirmación de plan: `src/lib/optimization/plan-validation.ts`.
- Visits (`delivery_visits`, ADR-0005): schema en `src/db/schema/visits.ts`;
  la escritura ocurre en las rutas de `route-stops` (seam móvil).

## Seam móvil

Los endpoints de ejecución (`route-stops/[id]`, `reopen`, mobile `my-route`)
son parte del contrato **`docs/API-CONTRACT-MOBILE.md`**: cambiar un shape
exige bump de `CONTRACT_VERSION` y actualizar el espejo en `aea/docs/`.
