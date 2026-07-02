# Spec — Confirm de plan (`POST /api/optimization/jobs/[id]/confirm`)

> **v1 — 2026-07-01 (sesión SOTA).** El endpoint de mayor blast-radius del
> sistema (~849 líneas): convierte un `OptimizationJob` COMPLETED en
> realidad operativa — configura CONFIRMED, órdenes ASSIGNED, inserta
> `route_stops` masivos y `plan_metrics`. Este spec documenta su anatomía
> exacta (extraída del código completo), los **invariantes que cualquier
> cambio debe preservar** y las deudas conocidas `[C-n]`.

## 1. Guards, en orden (todo pre-transacción)

1. RBAC: `requireRoutePermission(request, EntityType.PLAN, Action.CONFIRM)`.
2. Tenancy: `extractTenantContextAuthed` + `setTenantContext` (el audit log
   posterior lee este AsyncLocalStorage).
3. Body: `request.json().catch(() => ({}))` — **JSON malformado NO falla**,
   confirma con defaults (`[C-2]`). Zod `planConfirmationSchema`:
   `overrideWarnings=false`, `confirmationNote?`, `planName?`, `startDate?`,
   `endDate?`, `driverAssignments?` (vehicleId→driverId).
4. Job existe + tenant en el WHERE (cross-tenant se ve como 404).
5. Job `COMPLETED` → si no, 400.
6. Config ya `CONFIRMED` → 409 (`[C-1]`: el campo `confirmedAt` de ese 409
   devuelve `{id,status}`, no una fecha — mislabel cosmético).
7. Config ∉ {DRAFT, CONFIGURED} → 409.
8. `job.result` parseable, no-null y **Zod-validado** con `parseVerifiedPlan`
   (boundary 3 de `solved-plan/schemas`) — shape drifteado → 500 con mensaje
   explícito, nunca un cast silencioso. `driverId/driverName: null` (driver
   removido post-solve) se normaliza a `""` y cae en el guard 9 como 400.
9. `validatePlanForConfirmation`: ERRORs bloqueantes (rutas sin driver,
   unassigned, assignment errors, **licencia vencida**) → 400 con detalle.
10. WARNINGs (licencia <30 d, quality<50, TW compliance<80) sin
    `overrideWarnings` → 409 `{requiresOverride:true}`.
11. `routes.length > 0`.
12. Vehículos sin stops activos (PENDING/IN_PROGRESS) → 409 si ocupados.
    El check corre **dentro de la tx**, detrás del advisory lock (C-5
    resuelta); acá solo se recolectan los vehicle ids.
13. Órdenes vigentes: missing/no-PENDING se **saltan** (confirm parcial
    legítimo, reportado en el 200); si TODAS caen → 400.

Antes de validar, los `driverAssignments` del body **mutan `result.routes`
in-memory** — dominan sobre el optimizer para validación e insert. El
`optimization_jobs.result` persistido NO se re-escribe (`[C-7]`: drift
silencioso entre `job.result` y `route_stops.userId` — asumido).

## 2. La transacción (una sola)

`db.transaction` (postgres-js, READ COMMITTED, sin FOR UPDATE), serializada
por empresa con `SELECT pg_advisory_xact_lock(hashtext(companyId))` como
primer statement:

1. **CAS anti doble-confirm** — `UPDATE optimization_configurations SET
   status='CONFIRMED', confirmedAt, confirmedBy [, name] WHERE
   id=... AND status IN ('DRAFT','CONFIGURED') RETURNING *`. Cero filas →
   `throw "CONFLICT:..."` → rollback → 409. **Este CAS es la única
   protección de concurrencia del endpoint — no quitarlo jamás.**
2. Guard de vehículos ocupados (stops PENDING/IN_PROGRESS de otros planes)
   → `VehiclesBusyError` → 409 con detalle.
3. Re-check de drivers bajo el lock: todos los `userId` de los stops a
   insertar existen, son del tenant y conservan rol CONDUCTOR — un driver
   borrado/demovido en la ventana validación→commit sería un FK-500 o, peor,
   stops commiteados para un user que la app móvil no sirve. Falta alguno →
   `CONFLICT:` → 409.
4. `UPDATE orders SET status='ASSIGNED' WHERE id IN (... ordenados) AND
   companyId=tenant AND status='PENDING' RETURNING id` — el predicado
   `status='PENDING'` es el guard optimista por orden; los ids van
   ordenados para reducir inversión de row-locks (40P01) contra otros
   bulk-writers.
5. `SELECT count(*) FROM delivery_visits GROUP BY orderId` → INSERT masivo
   `route_stops` con `attemptNumber = visitCount + 1` (ADR-0005), status
   PENDING, `scheduledDate = startDate ?? hoy`, `estimatedServiceTime =
   configuration.serviceTimeMinutes * 60`. Órdenes agrupadas comparten
   `sequence`. **Sin unique constraint** en la tabla.
6. INSERT `plan_metrics` (1 fila, incluye comparación vs job previo).
   `totalStops`/`unassignedOrders` se recalibran contra lo realmente
   dispatchado: un confirm parcial no persiste los números del plan íntegro.

**Post-commit (best-effort, NO transaccional):** audit log
(`CONFIRM_PLAN`; su fallo no revierte nada), `releaseCompanyLock`
(Map in-memory, auto-expira 5 min), respuesta 200 con
`{ordersAssigned, routeStopsCreated, skippedOrders, planMetrics, ...}`.

**Sin realtime**: cero Centrifugo/OneSignal/alertas aquí. El driver
descubre los stops en el próximo fetch de `my-route` (por `scheduledDate`).
Tampoco se escribe `route_stop_history` al nacer los stops.

## 3. Modos de fallo y estado resultante

- **Todo return de §1**: cero mutación.
- **Throw dentro de la tx** (CONFLICT, FK violation, deadlock): rollback
  total. Un userId inexistente se intercepta en el guard 9 (400, C-3) y
  se re-chequea dentro de la tx (409 CONFLICT si desapareció en la
  ventana). Un deadlock 40P01 contra otro bulk-writer de orders se mapea
  a **409 `{retryable: true}`**, no a 500.
- **Muerte del proceso post-commit / pre-respuesta**: DB consistente y
  CONFIRMED; el cliente ve error de red y su retry recibe 409. Pérdida
  máxima: la fila de audit.
- **`[C-4]` — el modo sutil sin throw**: el UPDATE de orders filtra
  `status='PENDING'` pero el INSERT de stops usa la lista congelada del
  pre-check. Una orden que cambió de estado en la ventana (validación +
  comparison metrics son lentas) **no** se marca ASSIGNED pero **sí**
  recibe un route_stop PENDING → stop huérfano commiteado, sin alerta
  (`ordersUpdatedCount < routeStopsCreatedCount`). Fix Opus: dentro de la
  tx, re-filtrar `routeStopsToCreate` contra los ids RETURNING del
  statement 2 (y si `ordersUpdatedCount === 0`, abortar con CONFLICT).

## 4. Concurrencia — mapa completo

| Carrera | Protección actual | Estado |
|---|---|---|
| Doble confirm, misma config (o 2 jobs de la misma config) | CAS del statement 1 | ✅ correcta y atómica |
| Confirms concurrentes de **configs distintas** compartiendo órdenes PENDING | guard por-orden + re-filtro del insert contra el RETURNING (C-4 resuelta) | ✅ un solo ASSIGNED, un solo stop |
| Confirms concurrentes con el **mismo vehículo** | check dentro de la tx, detrás del advisory lock (C-5 resuelta) | ✅ entre confirms; ⚠️ escritores que reviven stops sin tomar el lock (reopen, PATCH→PENDING) siguen abiertos — hallazgo aparte |
| Stops cerrándose en paralelo | N/A — solo inserta stops nuevos | ✅ |
| `companyOptimizationLocks` | Map in-memory por proceso; serializa **optimizaciones**, no confirms | solo vale single-instance (ADR-0008 lo hace aceptable) |

## 5. Invariantes a preservar en cualquier refactor

1. El CAS de la config (statement 1) permanece condicional + RETURNING.
2. `attemptNumber = COUNT(delivery_visits)+1` se calcula **dentro** de la
   tx (ADR-0005).
3. Confirm parcial: skipped orders se excluyen de AMBOS (update + insert) y
   se reportan; nunca abortan si queda ≥1 válida.
4. Las 4 mutaciones viven en UNA transacción; audit/lock quedan fuera
   (best-effort deliberado).
5. Los `driverAssignments` del operador dominan sobre el optimizer.
6. Cross-tenant = 404 (tenant en el WHERE del fetch), nunca 403 con exists.

## 6. Deudas conocidas (para Opus, en orden de valor)

| ID | Sev | Qué | Resolución |
|---|---|---|---|
| C-4 | 🔴 | stops huérfanos de órdenes no-PENDING: re-filtrar insert contra RETURNING del update | **RESUELTA 2026-07-02** — el insert se re-filtra contra los ids del RETURNING dentro de la tx; `ordersUpdatedCount===0` aborta con `CONFLICT:` → 409; las órdenes caídas en la ventana se reportan en `skippedOrders` |
| C-5 | 🟠 | TOCTOU de vehículos ocupados: mover el guard dentro de la tx | **RESUELTA 2026-07-02** — guard movido dentro de la tx, detrás de `pg_advisory_xact_lock(hashtext(companyId))` que serializa confirms por empresa (sin el lock, READ COMMITTED dejaba la carrera cross-config abierta); el detalle del 409 viaja en `VehiclesBusyError` |
| C-3 | 🟠 | validar driverAssignments (existe, CONDUCTOR, mismo tenant) en la validación → 400, no 500-por-FK | **RESUELTA 2026-07-02** — `validateDrivers` en `plan-validation.ts` corre siempre y emite ERROR `driver_not_found` por driver desconocido/otro tenant/no-CONDUCTOR |
| C-2 | 🟡 | body JSON malformado se traga (`.catch(()=>({}))`) — al menos loguear; un `overrideWarnings` mal serializado se vuelve `false` | **RESUELTA 2026-07-02** — body vacío = defaults; JSON malformado o no-objeto → 400 |
| C-9 | 🟡 | `startDate` imparseable cae silenciosamente a HOY (plan de mañana aparece en la ruta de hoy) — rechazar con 400 | **RESUELTA 2026-07-02** — `startDate` presente e imparseable → 400; el fallback a hoy solo aplica si está ausente |
| C-8 | 🟡 | `estimatedServiceTime` 600 hardcodeado ignora `serviceTimeMinutes` de la config | **RESUELTA 2026-07-02** — `estimatedServiceTime = configuration.serviceTimeMinutes * 60` |
| C-1 | 🟢 | 409 con `confirmedAt: {id,status}` (mislabel) | **RESUELTA 2026-07-02** — el fetch trae `confirmedAt` real y el 409 devuelve ISO string |
| C-6 | 🟢 | `skippedOrderIds.includes()` O(n²) con 1000+ órdenes | **RESUELTA 2026-07-02** — filtro contra `Set` |

C-7 (drift `job.result` vs `route_stops.userId` cuando el operador
reasigna drivers) sigue **asumido** por diseño (§1) — no se re-escribe el
result persistido.

> **Hardening 2026-07-02 (segunda tanda, review adversarial):**
> 1. `job.result` se lee vía `parseVerifiedPlan` (Zod boundary 3) en
>    confirm y validate — cast eliminado; el runner pasa por
>    `assertPersistableVerifiedPlan` (boundary 2) antes de persistir.
> 2. Re-check de drivers dentro de la tx (existencia + tenant + rol
>    CONDUCTOR) → 409 CONFLICT si un driver cayó en la ventana.
> 3. Deadlock 40P01 → 409 `{retryable: true}`; los ids de los bulk
>    UPDATE de orders van ordenados (confirm y revert del DELETE).
> 4. `plan_metrics.totalStops/unassignedOrders` recalibrados al confirm
>    parcial real.
> 5. `DELETE /api/optimization/configure/[id]`: revert+delete en una tx
>    detrás del mismo advisory lock; revierte solo órdenes cuyo stop
>    activo pertenece a jobs de la config borrada (deriva de
>    `route_stops`, no del result blob) y `ordersReverted` cuenta filas
>    reales (`RETURNING`).

Tests que fijan el contrato (integration, DB real): doble-confirm
concurrente → exactamente un 200 y un 409, sin stops duplicados; confirm
parcial con orden CANCELLED intercalada → ni ASSIGNED ni stop para esa
orden (rojo hoy — C-4); attemptNumber con Visits previas; rollback total
ante FK inválido de driverAssignments.

> **2026-07-02:** los dos primeros (más C-4 concurrente cross-config,
> vehículo ocupado, driver fantasma → 400, JSON malformado → 400,
> `startDate` inválido → 400 y `confirmedAt` real en el 409) viven en
> `src/tests/integration/plans/plan-confirmation-debts.test.ts`. El caso
> "rollback ante FK inválido de driverAssignments" ya no es alcanzable:
> C-3 lo intercepta con 400 antes de la tx. La segunda tanda agregó:
> shape drifteado → 500 sin mutación, `driverId: null` → 400 (no shape
> error), métricas recalibradas en confirm parcial, y en
> `plan-deletion.test.ts` el revert cross-plan (no toca el ASSIGNED de
> otro plan) + `ordersReverted` con conteo real. El re-check in-tx de
> drivers y el 40P01→409 no tienen test determinístico (ventanas de
> carrera puras).
