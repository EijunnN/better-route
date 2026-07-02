# BetterRoute — Domain Context

> Vocabulario del dominio, bounded contexts e invariantes que rigen el
> producto. Pensado para que cualquier dev (o agente IA) pueda razonar
> sobre el código sin reverse-engineering.
>
> Este documento describe lo que **es**, no lo que está **planeado**. Las
> decisiones arquitectónicas con motivación viven en `docs/adr/`.

---

## Producto en una frase

BetterRoute es un producto de **planeamiento y ejecución de rutas de
última milla**: una empresa cliente (logística, retail, courier) modela
su flota, importa órdenes, corre un optimizador para generar planes de
ruta, los conductores las ejecutan en una app móvil, y los clientes
finales siguen su entrega vía un link público.

**Modelo de tenancy (ADR-0008)**: el *código* es multi-tenant (toda fila
lleva `companyId`, RBAC per-company), pero el *deployment* es
single-tenant: una instalación por empresa cliente en su propio VPS, con
su propia DB y Redis locales. No hay SaaS público compartido.

---

## Ubiquitous Language

Estos términos tienen **un solo significado** en todo el sistema. Si
encontrás un sinónimo en el código (ej. `delivery` en lugar de `Order`),
considerá si es una traducción legítima o un naming a corregir.

### Actores

| Término | Definición |
|---|---|
| **Company** | Tenant root. Toda fila de DB lleva `companyId`. Una `Company` tiene su propia flota, vehículos, conductores, zonas, presets, planes y órdenes. |
| **User** | Persona que se autentica. Puede ser conductor (`Driver`), planificador, admin de empresa, o admin del sistema. Su `role` define los `Permissions` que tiene. |
| **Driver** | `User` que ejecuta paradas en terreno. Se asigna a uno o más `Vehicles` y/o `Zones`. La app móvil es para él. |
| **Customer** | Destinatario final de la entrega. **No tiene cuenta**: solo recibe un `trackingId` para ver el progreso. |

### Flota y geografía

| Término | Definición |
|---|---|
| **Vehicle** | Recurso físico con capacidades (peso, volumen, valor, unidades), licencias, habilidades requeridas y posiblemente un `Driver` por defecto. |
| **Fleet** | Agrupación lógica de `Vehicles` (ej. "Furgonetas Lima Norte"). Los planes pueden filtrar por flota. |
| **Skill** | Etiqueta de capacidad (ej. "REFRIGERACIÓN", "FRÁGIL"). Se requiere en `Order.requiredSkills` y se ofrece en `Vehicle.skills`. El optimizador respeta el match. |
| **Zone** | Polígono geográfico (GeoJSON) que define un área. Dos tipos: `DELIVERY` (área de servicio normal) y `RESTRICTED` (zona donde no se entregan órdenes — el conductor puede atravesar). En overlap, **RESTRICTED gana**. |
| **Depot** | Punto geográfico donde inicia una ruta. Configurable por `OptimizationConfiguration`. |

### Plan y ejecución

| Término | Definición |
|---|---|
| **Order** | Pedido de entrega. Tiene cliente, dirección georreferenciada, ventana de tiempo, capacidades requeridas, skills requeridos, prioridad. Estado: `PENDING → ASSIGNED → IN_PROGRESS → COMPLETED \| FAILED \| CANCELLED`. |
| **Stop** | Una `Order` materializada como parada dentro de una ruta optimizada. Vive en `route_stops`. Estado: `PENDING → IN_PROGRESS → COMPLETED \| FAILED` (4 estados — no existe `SKIPPED`). `COMPLETED` es terminal; `FAILED → PENDING` es legal (re-intento same-day disparado por el operador, ADR-0005). **Una Order puede tener múltiples Stops históricos** (reasignaciones, replanificaciones). |
| **Route** | Secuencia ordenada de `Stops` ejecutada por un `Driver` en un `Vehicle` un día determinado. Se identifica por `routeId` dentro de un `OptimizationJob`. |
| **OptimizationConfiguration** | Setup de un plan: depot, vehículos seleccionados, drivers seleccionados, objetivo (`DISTANCE \| TIME \| BALANCED`), strictness, ventana de trabajo. Estado: `DRAFT → CONFIGURED → CONFIRMED`. |
| **OptimizationPreset** | Conjunto de flags y parámetros del solver (`balanceVisits`, `minimizeVehicles`, `openStart`, `flexibleTimeWindows`, `routeEndMode`, etc.). Reutilizable entre planes. Cada empresa tiene un `isDefault=true`. |
| **OptimizationJob** | Ejecución async del solver para una `OptimizationConfiguration` dada. Estado: `PENDING → RUNNING → COMPLETED \| FAILED \| CANCELLED`. Tiene timeout, progreso, hash de input para caching, y `result` en JSONB. |
| **Plan** | Sinónimo informal de "OptimizationJob completado y confirmado". El término se usa en UI ("nueva planificación", "historial de planes"). |
| **Reassignment** | Acción de transferir los `Stops` de un `Driver` ausente a otro(s). Se audita en `reassignments_history`. |
| **TimeWindowPreset** | Plantilla reutilizable de ventana horaria. Tipos: `SHIFT` (turno), `RANGE` (rango), `EXACT` (hora exacta con tolerancia). Strictness: `HARD \| SOFT`. |

### Tracking y feedback

| Término | Definición |
|---|---|
| **TrackingId** | String público corto y único por `Order` activa. Permite que el cliente final acceda a `/tracking/[token]` sin auth. |
| **Evidence** | Foto subida a R2 al completar o fallar un `Stop`. Almacenada en `RouteStop.evidenceUrls` (jsonb array). |
| **FailureReason** | Razón por la cual un `Stop` falló. **String libre en español**, elegido verbatim de la lista per-company `companyDeliveryPolicy.failureReasons` (servida al móvil vía `GET /api/mobile/driver/delivery-policy`) y guardado tal cual en `route_stops.failureReason` y `delivery_visits.failure_reason`. Obligatoria al marcar `FAILED` mientras la policy tenga motivos definidos (default: sí). El viejo enum (`CUSTOMER_ABSENT \| ...`) es **legacy** — ver ADR-0011. |
| **WorkflowState** | Estado custom definido por la empresa que extiende los terminales del sistema (ej. "Reagendado al jueves"). Vive en `company_workflow_states`. Un `Stop` puede llevar `workflowStateId` además del `status`. |
| **`Visit`** | Un intento físico de entregar una `Order` por parte de un `Driver`. Tiene `outcome: SUCCESS \| FAILURE`, `attempted_at`, `evidence_urls`, ubicación GPS, y en caso de fallo `failure_reason` + notas. Cada Visit referencia el `RouteStop` que la generó. **Inmutable** — los datos del intento no se borran ni sobreescriben. Vive en `delivery_visits`. |
| **`Revisita`** | Cualquier `Visit` de una `Order` posterior a la primera. Puede ocurrir el mismo día (driver vuelve tras una falla porque el cliente llamó) o en planes posteriores (la Order entra a un nuevo Plan después de un fallo previo). El historial completo de Visits constituye la trazabilidad de entrega — nunca se pierde. |
| **`attempt_number`** | Campo en `route_stops` que indica el N-ésimo intento físico de la `Order`. Se calcula como `COUNT(delivery_visits WHERE order_id = X) + 1` al crear el RouteStop. Permite filtrar/mostrar "Intento #2", "Intento #3" sin JOIN al historial de Visits. |

### Configuración y customización

| Término | Definición |
|---|---|
| **CustomField** | Campo dinámico definido por la empresa. Aplicable a `Order` o `Stop`. Validado en write-time, no por DB. |
| **CompanyOptimizationProfile** | Configuración por empresa de qué dimensiones de capacidad se usan (peso, volumen, valor, unidades), priority mapping por order type, y default time windows. |

---

## Bounded Contexts

El código no está físicamente separado por contextos (todo vive en
`src/`), pero conceptualmente se agrupa así. Cuando hagas refactors,
evitá hacer dependencias cruzadas que rompan estos límites.

### 1. Identity & Tenancy
**Qué resuelve**: quién es el usuario, qué empresa(s) puede ver, qué
puede hacer.
**Entidades**: `Company`, `User`, `Role`, `Permission`.
**Código**: `src/lib/auth/`, `src/lib/auth/permissions/`, `src/components/auth/`, `src/components/roles/`, `src/components/users/`.
**Reglas**:
- JWT cookie autoritativo. `companyId` del JWT es la fuente de verdad para non-admins.
- `ADMIN_SISTEMA` es el único rol que puede operar entre tenants vía header `x-company-id`.

### 2. Master Data (Catálogo)
**Qué resuelve**: lo que la empresa configura una vez y reutiliza.
**Entidades**: `Vehicle`, `Fleet`, `Zone`, `OptimizationPreset`,
`TimeWindowPreset`, `Skill`, `WorkflowState`, `CustomFieldDefinition`.
**Código**: `src/components/{vehicles,fleets,zones,...}/`, `src/lib/{validations,workflow,custom-fields}/`.

### 3. Order Management
**Qué resuelve**: ingesta, mantenimiento y reactivación de pedidos.
**Entidades**: `Order`, `CsvColumnMappingTemplate`.
**Código**: `src/components/orders/`, `src/lib/orders/`, `src/lib/csv/`.
**Reglas**:
- Un `Order.trackingId` es único por empresa **mientras esté activo**.
- Una `Order` cae fuera del ruteo si su geocoordinate está dentro de una `Zone` con `type=RESTRICTED`.
- **CSV import con preview-and-confirm.** La importación nunca aplica
  cambios sin confirmación del operador. Cuando un `trackingId` del CSV
  colisiona con una Order existente:
  - Si la Order existente está en `FAILED`, el preview ofrece
    reactivarla (status → `PENDING`) para que entre al próximo Plan. Es
    el mecanismo principal de "Revisita cross-day".
  - Si la Order existente está en `CANCELLED`, se salta con razón
    específica: ese estado es terminal definitivo. El operador puede
    re-introducir el pedido con un trackingId nuevo (lo trata el
    sistema como Order distinta).
  - Si la Order existente está en estado **activo**
    (`PENDING|ASSIGNED|IN_PROGRESS|COMPLETED`), el CSV la salta con
    warning explícito.
  El preview muestra: nuevas, reactivables, saltadas (con sub-categoría
  de motivo). El operador confirma; recién entonces se ejecuta el
  batch.
- **Semántica de los estados terminales de `Order`**:
  - `FAILED` = uno o más intentos físicos fallaron, pero la Order
    sigue elegible para revisitas. **Reactivable** vía CSV o botón
    manual desde el detail.
  - `CANCELLED` = decisión humana explícita: la Order no se entregará
    nunca más. **Estado terminal definitivo y NO reactivable**. Si el
    cliente vuelve a pedir lo mismo, se trata como Order nueva con
    trackingId distinto.
- **Cancelar definitivamente** requiere razón obligatoria
  (categoría + nota libre) y solo lo pueden ejecutar los roles
  `PLANIFICADOR` o `ADMIN_FLOTA`. La transición se audita.

### 4. Plan Optimization
**Qué resuelve**: convertir órdenes + flota + reglas en rutas viables.
**Entidades**: `OptimizationConfiguration`, `OptimizationJob`,
`OptimizationPreset`, `PlanMetrics`.
**Shapes canónicos del solver output** (cadena tipada):

| Term | Definition |
|---|---|
| **`SolvedStop`** | Una parada en una ruta resuelta. `orderId`, `sequence`, geocoordinate, `estimatedArrival`, `timeWindow`, `capacityUsed`, agrupamiento opcional. |
| **`RawSolvedRoute`** | Ruta tal como sale del solver y zone-batch builder. `routeId`, `vehicleId`, `zoneId?`, `stops[]`, totales, `capacityUsed`, `utilizationPercentage`, `geometry?`. **Sin driver todavía.** |
| **`AssignedSolvedRoute`** | `RawSolvedRoute` + asignación de driver: `driverId`, `driverName`, `driverOrigin?`, `assignmentQuality`. |
| **`AggregatedPlan`** | Plan completo: `AssignedSolvedRoute[]` + órdenes no asignadas + drivers/vehículos sin ruta + métricas plan-level + summary + depot. Puede llevar `isPartial: true` si el job fue cancelado. **No verificado todavía.** |
| **`VerifiedPlan`** | `AggregatedPlan` + `verification: VerificationReport` **obligatorio**. La invariante "todo plan es verificado" se cumple por tipo, no por convención. |
| **`VerificationReport`** | Output del verifier: `violations[]` (cada una con `severity: HARD \| SOFT \| INFO`), summary, totals. |
| **`CapacityUsage`** | `Partial<Record<CapacityDimension, number>>` con `CapacityDimension ∈ {WEIGHT, VOLUME, VALUE, UNITS}`. Map (no flat) para que agregar dimensions sea aditivo. |

**Boundaries con validación runtime (Zod)** — solo en 3 puntos:
1. Solver output → `RawSolvedRoute` (`rawSolvedRouteSchema`)
2. `VerifiedPlan` → DB persist (`optimization_jobs.result` JSONB)
3. DB JSONB → `VerifiedPlan` (read del mismo campo)

Adentro del pipeline: trust the types, sin overhead Zod.

**Estructura del módulo `src/lib/optimization/`**:

```
solved-plan/          — canonical shapes (types + Zod schemas).
                        Single source of truth for what a route/stop/plan
                        looks like across the entire system.
verifier/             — independent constraint checker. Consumes
                        AggregatedPlan, returns VerifiedPlan. Owns its
                        own input shapes (OptimizerOrder/Vehicle/Config).
optimization-job/     — OptimizationJob lifecycle (state machine, DB
                        transitions, orchestrator). API routes are thin
                        wrappers over this module.
optimization-runner/  — pipeline that produces a VerifiedPlan:
                          run.ts          — thin orchestrator
                          stages/load-inputs.ts    — DB I/O (Stage 1)
                          stages/solve-batches.ts  — VROOM (Stage 3)
                          stages/assign-drivers.ts — Raw → Assigned (Stage 4)
                          stages/aggregate-plan.ts — metrics (Stage 5)
                        (Verification is Stage 6 via verifier/.)
vroom-optimizer.ts    — VROOM domain adapter (orders/vehicles/config →
                        VROOM request, response → OptimizationOutput).
vroom-client.ts       — HTTP client to VROOM.
osrm-client.ts        — OSRM road network client.
```

**Código adicional**: `src/lib/geo/zone-utils.ts`, `src/components/optimization/`,
`src/components/planificacion/`.

**Reglas**:
- VROOM es el **único** solver (no hay `IOptimizer` interface — fue eliminada
  como hypothetical seam).
- El optimizador opera por **batches de zona** (`createZoneBatches`) para
  isolation hard entre zonas.
- Pre-filtro: órdenes en zonas `RESTRICTED` se excluyen ANTES de invocar
  VROOM.
- El `verifier` corre por defecto al final del pipeline — la invariante
  "todo plan es verificado" la cumple el sistema de tipos
  (`VerifiedPlan extends AggregatedPlan` con `verification` obligatorio).
- Una `OptimizationConfiguration` con `status: CONFIRMED` no puede
  re-optimizarse — el guard vive en `createAndExecuteJob`, no en la API
  route.
- Test harness golden en `src/tests/routing-quality/` con 28 escenarios.

**OptimizationJob state machine** (gestionado por `optimization-job/lifecycle.ts`):

```
PENDING ──createAndExecuteJob──> RUNNING
                                    │
              ┌─────────────────────┼─────────────────────┐
              ▼                     ▼                     ▼
          COMPLETED              FAILED              CANCELLED
```
Estados terminales (COMPLETED, FAILED, CANCELLED) no transicionan back.
La concurrency / locks / abort controllers viven en
`src/lib/infra/job-queue.ts` como primitives process-level genéricas.

### 5. Route Execution
**Qué resuelve**: la ejecución del plan en terreno por los drivers, incluida
la trazabilidad multi-intento de cada Order (Visits y Revisitas).
**Entidades**: `RouteStop`, `RouteStopHistory`, `Visit` (`delivery_visits`),
`ReassignmentsHistory`, `Evidence` (URLs en R2).
**Código**: `src/lib/routing/route-helpers.ts`, `src/lib/storage/r2.ts`,
`src/components/monitoring/`, app móvil (`test-mobile/aea`).
**Reglas**:
- Transiciones de estado validadas por `STOP_STATUS_TRANSITIONS`.
- `COMPLETED` es el único terminal de un Stop; `FAILED → PENDING` existe
  como re-intento same-day y solo lo dispara el operador (no existe `SKIPPED`).
- `FAILED` requiere `failureReason` (string libre de la policy — ver
  Ubiquitous Language).
- `Evidence` upload a R2 vía presigned URL **debe completarse** antes de cerrar la entrega — si falla, la operación se aborta (no se silencia).
- `zoneId` se snapshot-ea en `route_stops` al confirmar el plan; preserva history aún si la zona se borra.
- **Cada intento físico genera una `Visit` inmutable.** Cuando un driver
  marca COMPLETED o FAILED, se persiste una row en `delivery_visits` con
  driver, timestamp, evidencia, GPS, y motivo (si falló). Los datos del
  intento **nunca** se sobreescriben aunque el `route_stop` se reabra.
- **Re-intento mismo día**: el operador puede revertir un Stop FAILED a
  PENDING. Los campos `evidenceUrls`/`failureReason`/`notes` del Stop
  se limpian (los datos ya viven en la `Visit` previa); el driver lo ve
  otra vez en mobile. Cuando vuelva a marcar resultado, se crea una
  Visit nueva.
- **Revisita cross-day**: una Order failed que vuelve a entrar a un Plan
  posterior genera un `route_stop` nuevo (con `attempt_number` mayor que
  el anterior). El historial de Visits acumula a través de planes.
- **Trazabilidad de una Order**: `SELECT * FROM delivery_visits WHERE
  order_id = X ORDER BY attempted_at` devuelve el log completo,
  inmutable, de todos los intentos físicos.
- **Toda `Visit` tiene un `RouteStop`** (`route_stop_id` NOT NULL).
  BetterRoute no soporta entrega express / ad-hoc; cualquier entrega
  pasa primero por un `Plan` (sea batch nightly o un Plan ad-hoc de
  pocos stops generado durante el día). Si en el futuro se introduce
  un servicio express, este invariante se relaja con un ADR superseder
  de ADR-0005.
- **`Visit` guarda dos pares de coordenadas**: `intended_address` /
  `intended_latitude` / `intended_longitude` (la dirección target que
  la Order tenía al momento del intento) y `gps_latitude` /
  `gps_longitude` (la posición real del driver al marcar el outcome).
  La divergencia es informativa, no un bug — puede haber GPS ruidoso o
  coordinación remota driver-cliente sin que el driver se acerque.
- **Re-intento mismo día solo lo dispara el operador** desde el panel
  (no el driver desde mobile). Mantiene audit limpio y evita race
  conditions.
- **Reactivación cross-day** se dispara o (a) desde el preview del
  CSV import (ADR-0006) o (b) manualmente desde el detail de la Order
  ("Programar próxima entrega"). Ambos abren el mismo dialog con
  campos pre-rellenados que el operador puede editar (dirección,
  ventana horaria, fecha promesa, notas) antes de confirmar.

### 6. Public Tracking
**Qué resuelve**: visibilidad para el cliente final sin login.
**Entidades**: `Order.trackingId` (no es entidad propia, es un campo).
**Código**: `src/app/tracking/[token]/`, `src/app/api/public/tracking/`,
`src/components/tracking/`.
**Reglas**:
- Endpoint público, sin auth, sin RBAC.
- Devuelve la `Stop` más reciente o, si hay una `COMPLETED|FAILED`, esa (para preservar la evidencia tras reasignación).

### 7. Realtime & Alerts
**Qué resuelve**: monitoreo en tiempo real de la operación y chat
driver↔despacho.
**Código**: `src/lib/realtime/`, `src/lib/chat/`,
`src/lib/notifications/onesignal.ts`, `src/lib/alerts/`,
`src/components/monitoring/`.
**Reglas** (ADR-0007):
- **Centrifugo** (WebSocket, docker-compose) para eventos en vivo. Canales
  namespaced por tenant (`monitoring:{companyId}`,
  `chat:{companyId}:driver:{driverId}`, `chat:{companyId}:broadcast`).
- Token JWT de conexión (HMAC propio, ~15 min) vía `GET /api/realtime/token`;
  los canales permitidos se derivan del rol (`computeAllowedChannels`).
- **OneSignal** para push móvil (External ID = `user.id`, sin device tokens
  en el backend).
- La telemetría GPS del driver va por HTTP POST, no por el socket.
- Postgres es la fuente de verdad del chat (`chat_messages`,
  `chat_conversations`); Centrifugo solo transporta.
- El contrato exacto de canales/payloads con el móvil vive en
  `docs/API-CONTRACT-MOBILE.md`.

### 8. Reporting & Output
**Qué resuelve**: artefactos generados a partir de planes confirmados.
**Entidades**: `OutputHistory`, `PlanMetrics`.
**Código**: `src/lib/export/`, `src/components/planificacion/historial/`.

---

## Invariantes globales

Reglas que **siempre** son ciertas. Si tu cambio las viola, está mal.

1. **Multi-tenancy es no-negociable.** Toda query a tabla principal lleva
   `WHERE companyId = $tenant`. Sin excepción. El helper canónico es
   `extractTenantContextAuthed(request, user)` en
   `src/lib/routing/route-helpers.ts`.
2. **El JWT manda.** Para non-admins, el `companyId` del JWT es la fuente
   de verdad. Cualquier mismatch con header `x-company-id` = `403`.
3. **`ADMIN_SISTEMA` es la única excepción de tenancy.** Solo este rol
   puede pasar `x-company-id` distinto al del JWT.
4. **VROOM es el único solver.** Cualquier referencia a PyVRP en código
   nuevo es un bug.
5. **RESTRICTED gana en zonas overlap.** `getZoneForOrder` chequea
   `RESTRICTED` antes que `DELIVERY`.
6. **Estados terminales no se reabren por el camino normal.**
   - Stops: `COMPLETED` es terminal. `FAILED` solo lo reabre el operador
     (re-intento same-day, ADR-0005) — nunca el driver. No existe `SKIPPED`.
   - Órdenes: `CANCELLED` es terminal definitivo y jamás reactivable
     (ADR-0006). `FAILED` es reactivable (revisita cross-day). `COMPLETED`
     solo se revierte por el camino privilegiado `order:revert`, fuera del
     grafo normal.
   - Optimization jobs: `COMPLETED`, `FAILED`, `CANCELLED` no transicionan.
7. **Evidence falla la operación.** Si la subida a R2 falla, la entrega
   no se cierra. El error sube al usuario.
8. **History es append-only.** `route_stop_history`,
   `reassignments_history`, `output_history` no se editan ni borran.

---

## Lo que NO es BetterRoute (out of scope explícito)

- **Multi-leg / cross-dock / hub-and-spoke**: solo última milla.
- **Pickup-delivery (PD) pairs**: hoy todo es delivery puro desde un
  depot.
- **Rebalancing en tiempo real**: el plan se confirma una vez y se
  ejecuta. Reasignaciones son parche manual, no replanificación
  automática.
- **Transportistas como tenant**: cada empresa cliente trae su propia
  flota; no somos marketplace.
- **Servicio express / on-demand**: BetterRoute no maneja entregas
  fuera de un `Plan`. Cualquier Order pasa primero por planning (sea
  batch nightly o un Plan ad-hoc de pocos stops creado durante el
  día). El modelo "driver recibe Orders en tiempo real sin Plan
  previo" (Glovo / Rappi / PedidosYa) está fuera de scope.
- **Notificaciones automáticas a cliente / driver al reabrir o
  reactivar Orders**: la trazabilidad queda registrada (Visit
  history, audit log) pero no se dispara push / email / SMS. Nota:
  ADR-0007 ya introdujo push (OneSignal) para **chat** — las
  notificaciones de reapertura/reactivación siguen fuera de scope y
  requerirían su propio ADR.

---

## Estado de deployment

**Pre-deploy**: aún no hay usuarios reales. Las refactorizaciones
agresivas son preferibles a compat shims. Eliminar código deprecated en
lugar de mantenerlo. Sin migrations data-rescue todavía.

---

## Referencias rápidas

- `CLAUDE.md` — convenciones operativas (cómo correr, comandos, RBAC flow).
- `docs/ROLES-PERMISSIONS.md` — catálogo completo de permisos y roles.
- `docs/API-CONTRACT-MOBILE.md` — contrato del seam con la app móvil
  (espejado en `aea/docs/`).
- `docs/adr/` — decisiones arquitectónicas con su motivación:
  - ADR-0001: VROOM como único solver
  - ADR-0002: Canonical SolvedPlan shape (cadena tipada)
  - ADR-0003: Runner como pipeline thin sobre stages explícitas
  - ADR-0004: OptimizationJob lifecycle ownership
  - ADR-0005: Visit como entidad de primera clase (trazabilidad multi-intento)
  - ADR-0006: CSV import con preview-and-confirm para colisiones de trackingId
  - ADR-0007: Realtime vía Centrifugo, push vía OneSignal
  - ADR-0008: Tenancy — multi-tenant lógico, single-tenant-per-VPS físico
  - ADR-0009: Migraciones Drizzle versionadas (`db:generate` + `db:migrate`, nunca `db:push`)
  - ADR-0010: Contrato RBAC tipado compartido server/cliente
  - ADR-0011: FailureReason como string libre per-company (enum legacy)
