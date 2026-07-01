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
8. `job.result` parseable y no-null.
9. `validatePlanForConfirmation`: ERRORs bloqueantes (rutas sin driver,
   unassigned, assignment errors, **licencia vencida**) → 400 con detalle.
10. WARNINGs (licencia <30 d, quality<50, TW compliance<80) sin
    `overrideWarnings` → 409 `{requiresOverride:true}`.
11. `routes.length > 0`.
12. Vehículos sin stops activos (PENDING/IN_PROGRESS) → 409 si ocupados.
    **Corre fuera de la tx** — TOCTOU real (`[C-5]`).
13. Órdenes vigentes: missing/no-PENDING se **saltan** (confirm parcial
    legítimo, reportado en el 200); si TODAS caen → 400.

Antes de validar, los `driverAssignments` del body **mutan `result.routes`
in-memory** — dominan sobre el optimizer para validación e insert. El
`optimization_jobs.result` persistido NO se re-escribe (`[C-7]`: drift
silencioso entre `job.result` y `route_stops.userId` — asumido).

## 2. La transacción (una sola, 4 statements)

`db.transaction` (postgres-js, READ COMMITTED, sin FOR UPDATE):

1. **CAS anti doble-confirm** — `UPDATE optimization_configurations SET
   status='CONFIRMED', confirmedAt, confirmedBy [, name] WHERE
   id=... AND status IN ('DRAFT','CONFIGURED') RETURNING *`. Cero filas →
   `throw "CONFLICT:..."` → rollback → 409. **Este CAS es la única
   protección de concurrencia del endpoint — no quitarlo jamás.**
2. `UPDATE orders SET status='ASSIGNED' WHERE id IN (...) AND
   companyId=tenant AND status='PENDING' RETURNING id` — el predicado
   `status='PENDING'` es el guard optimista por orden.
3. `SELECT count(*) FROM delivery_visits GROUP BY orderId` → INSERT masivo
   `route_stops` con `attemptNumber = visitCount + 1` (ADR-0005), status
   PENDING, `scheduledDate = startDate ?? hoy`, `estimatedServiceTime = 600`
   hardcodeado (`[C-8]`: ignora `configuration.serviceTimeMinutes`).
   Órdenes agrupadas comparten `sequence`. **Sin unique constraint** en la
   tabla.
4. INSERT `plan_metrics` (1 fila, incluye comparación vs job previo).

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
  total de los 4 statements. `driverAssignments` con userId inexistente
  explota recién en el FK de `route_stops.user_id` → 500 genérico
  (`[C-3]`: validar existencia/rol/tenant del driver en el guard 9 para
  dar un 400 útil).
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
| Confirms concurrentes de **configs distintas** compartiendo órdenes PENDING | guard por-orden del statement 2, pero ambos insertan stops (`[C-4]`) | ⚠️ un solo ASSIGNED, dos stops posibles |
| Confirms concurrentes con el **mismo vehículo** | check 12 fuera de la tx | ⚠️ TOCTOU (`[C-5]`): vehículo con dos rutas PENDING. Fix candidato: mover el check dentro de la tx o constraint parcial |
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

| ID | Sev | Qué |
|---|---|---|
| C-4 | 🔴 | stops huérfanos de órdenes no-PENDING: re-filtrar insert contra RETURNING del update |
| C-5 | 🟠 | TOCTOU de vehículos ocupados: mover el guard dentro de la tx |
| C-3 | 🟠 | validar driverAssignments (existe, CONDUCTOR, mismo tenant) en la validación → 400, no 500-por-FK |
| C-2 | 🟡 | body JSON malformado se traga (`.catch(()=>({}))`) — al menos loguear; un `overrideWarnings` mal serializado se vuelve `false` |
| C-9 | 🟡 | `startDate` imparseable cae silenciosamente a HOY (plan de mañana aparece en la ruta de hoy) — rechazar con 400 |
| C-8 | 🟡 | `estimatedServiceTime` 600 hardcodeado ignora `serviceTimeMinutes` de la config |
| C-1 | 🟢 | 409 con `confirmedAt: {id,status}` (mislabel) |
| C-6 | 🟢 | `skippedOrderIds.includes()` O(n²) con 1000+ órdenes |

Tests que fijan el contrato (integration, DB real): doble-confirm
concurrente → exactamente un 200 y un 409, sin stops duplicados; confirm
parcial con orden CANCELLED intercalada → ni ASSIGNED ni stop para esa
orden (rojo hoy — C-4); attemptNumber con Visits previas; rollback total
ante FK inválido de driverAssignments.
