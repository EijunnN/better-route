# BetterRoute — Modelo de datos (entidades core)

> Derivado de `src/db/schema/` (fuente de verdad: el schema Drizzle, no este
> doc). Las invariantes citadas viven en **`docs/CONTEXT.md` §Invariantes
> globales** y en los ADRs — acá solo se referencian. Migraciones:
> `db:generate` + `db:migrate`, nunca `db:push` (ADR-0009).

## Regla transversal

**Toda tabla principal lleva `companyId` → `companies.id`** (invariante #1,
ADR-0008). `companies` es el tenant root; casi todos los FKs a companies son
`onDelete: restrict`.

## Grafo core

```
companies ─┬─ users (role: CONDUCTOR ⇒ campos de driver embebidos)
           ├─ vehicles ──── fleets (vehicle_fleets N:M)
           ├─ zones (GeoJSON, type: DELIVERY | RESTRICTED)
           ├─ orders ─────────────────┐
           ├─ optimization_configurations ─ optimization_presets
           │        │
           │  optimization_jobs (result JSONB = VerifiedPlan)
           │        │
           │  route_stops (jobId, orderId, userId=driver, vehicleId, zoneId?)
           │        │
           │  delivery_visits (routeStopId, orderId, driverId, planId?)
           │
           ├─ chat_conversations (1 por driver) ─ chat_messages
           ├─ plan_metrics · output_history · reassignments_history
           └─ history: route_stop_history · order_status_history · ...
```

## Entidades por contexto

### Identity & Tenancy (`companies.ts`, `users.ts`, `rbac.ts`)

- **`companies`** — tenant root: nombres legales, país, timezone.
- **`users`** — persona autenticada; `companyId` **nullable** solo para
  `ADMIN_SISTEMA`. No existe tabla `drivers`: role `CONDUCTOR` embebe los
  campos de driver (licencia, `driverStatus` con `DRIVER_STATUS_TRANSITIONS`,
  `primaryFleetId`, `appOnline`).
- **RBAC** — `roles`, `permissions`, `role_permissions`, `user_roles`
  (roles custom por empresa; ADR-0010). Roles legacy en código
  (`authorization.ts → ROLE_PERMISSIONS`).
- **`audit_logs`**, **`user_availability`** (jornada por día de semana),
  **`user_driver_status_history`**.

### Master Data (`vehicles.ts`, `fleets.ts`, `zones.ts`, `skills.ts`, `workflow.ts`, `custom-fields.ts`)

- **`vehicles`** — capacidades por dimensión (peso/volumen/valor/unidades,
  `maxOrders`), origen, jornada + break, licencia requerida,
  `assignedDriverId` (driver por defecto).
- **`fleets`** + `vehicle_fleets` (N:M) + `user_secondary_fleets` +
  `vehicle_fleet_history`.
- **`zones`** — polígono GeoJSON, `type: DELIVERY | RESTRICTED`
  (RESTRICTED gana en overlap, invariante #5); `zone_vehicles`.
- **Skills** — `vehicle_skills` (catálogo), `user_skills`,
  `vehicle_skill_assignments`. Match contra `orders.requiredSkills`.
- **`company_delivery_policy`** (`workflow.ts`) — incluye
  `failureReasons`: la taxonomía free-text per-company (ADR-0011).
- **`company_field_definitions`** — custom fields para `orders` /
  `route_stops`; validación en write-time, no en DB.
- **`time_window_presets`** (`orders.ts`) — `SHIFT | RANGE | EXACT`,
  strictness `HARD | SOFT`.

### Order Management (`orders.ts`)

- **`orders`** — dirección georreferenciada, ventana (preset o directa),
  capacidades requeridas, `priority` (0-100), `customFields` JSONB.
  Status: `PENDING → ASSIGNED → IN_PROGRESS → COMPLETED | FAILED | CANCELLED`.
  - `trackingId` único **mientras activo** (unique index parcial
    `WHERE active = true`).
  - `CANCELLED` es terminal definitivo, requiere
    `cancellationReasonCategory` + nota; `FAILED` es reactivable
    (invariante #6, ADR-0006).
- **`order_status_history`** — append-only, escrito **en la misma
  transacción** que el UPDATE de status; `source` tipado
  (`driver_sync | reopen | reactivate | cancel | unassign | revert`),
  `correlationId` como idempotency key.
- **`csv_column_mapping_templates`** — mappings reutilizables del import
  (flujo preview-and-confirm: ADR-0006).

### Plan Optimization (`optimization.ts`)

- **`optimization_configurations`** — depot, `selectedVehicleIds/DriverIds/
  OrderIds` (JSONB), objective `DISTANCE | TIME | BALANCED`, ventana de
  trabajo, preset. Status `DRAFT → CONFIGURED → CONFIRMED` (CONFIRMED no se
  re-optimiza — guard en `createAndExecuteJob`, ADR-0004).
- **`optimization_jobs`** — ejecución async: `PENDING → RUNNING →
  COMPLETED | FAILED | CANCELLED` (terminales no transicionan, invariante
  #6); `progress`, `timeoutMs`, `inputHash` (caching), `result` JSONB =
  `VerifiedPlan` (shape canónico: ADR-0002, Zod en el boundary).
- **`optimization_presets`** — flags del solver (`balanceVisits`,
  `minimizeVehicles`, `routeEndMode`, ...; semántica: `SEMANTICS.md`).
  Un `isDefault=true` por empresa.
- **`company_optimization_profiles`** — dimensiones de capacidad activas,
  priority mapping por `orderType`.
- **`plan_metrics`** — snapshot de métricas del plan confirmado (+
  comparación con job anterior).

### Route Execution (`routing.ts`, `visits.ts`)

- **`route_stops`** — Order materializada en una ruta: `jobId`, `routeId`,
  driver (`userId`), `vehicleId`, `sequence`, ETA, `scheduledDate` (día de
  entrega, no de confirmación — alimenta "ruta de hoy" del móvil).
  Status `PENDING → IN_PROGRESS → COMPLETED | FAILED` validado por
  `STOP_STATUS_TRANSITIONS` (no existe `SKIPPED`; `COMPLETED` terminal;
  `FAILED → PENDING` solo vía reopen del operador — ADR-0005).
  - `attemptNumber` = `COUNT(delivery_visits del order) + 1` al insertar.
  - `failureReason` = string verbatim de la policy (ADR-0011);
    `evidenceUrls` (R2); `zoneId` snapshot con `onDelete: set null`.
- **`delivery_visits`** — **una fila inmutable por intento físico**
  (ADR-0005): outcome `SUCCESS | FAILURE`, evidencia, dos pares de
  coordenadas (`intended_*` vs `gps_*`), `routeStopId` NOT NULL.
  Trazabilidad = `SELECT ... WHERE order_id = X ORDER BY attempted_at`.
- **`reassignments_history`** — transferencias de stops por ausencia.
- **`output_history`** — artefactos generados (JSON/CSV/PDF) por plan.

### Realtime, tracking y alertas (`chat.ts`, `tracking.ts`, `alerts.ts`)

- **`chat_conversations`** — una por driver (índice del inbox);
  **`chat_messages`** — Postgres es fuente de verdad, Centrifugo solo
  transporta (ADR-0007). `direction`, `kind` (`TEXT | TEMPLATE | BROADCAST`
  — broadcast fan-out: una fila por driver), `readAt`.
- **`driver_locations`** — telemetría GPS (HTTP POST, no socket).
- **`tracking_tokens`** + **`company_tracking_settings`** — tracking
  público del cliente final.
- **`alert_rules`**, **`alerts`**, **`alert_notifications`**.

## Tablas history (append-only — invariante #8)

Invariante #8 de `docs/CONTEXT.md`: `route_stop_history`,
`reassignments_history` y `output_history` no se editan ni borran.
`delivery_visits` es inmutable por ADR-0005 y `order_status_history` sigue
el mismo contrato (ver su docstring en `src/db/schema/orders.ts`). Las demás
`*_history` (`vehicle_status_history`, `user_driver_status_history`,
`vehicle_fleet_history`) y `audit_logs` siguen el mismo patrón. Checklist:
`docs/REVIEW-RUBRIC.md`.
