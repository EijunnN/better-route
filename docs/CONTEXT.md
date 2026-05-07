# BetterRoute — Domain Context

> Vocabulario del dominio, bounded contexts e invariantes que rigen el
> producto. Pensado para que cualquier dev (o agente IA) pueda razonar
> sobre el código sin reverse-engineering.
>
> Este documento describe lo que **es**, no lo que está **planeado**. Las
> decisiones arquitectónicas con motivación viven en `docs/adr/`.

---

## Producto en una frase

BetterRoute es un SaaS multi-tenant de **planeamiento y ejecución de
rutas de última milla**: una empresa cliente (logística, retail, courier)
modela su flota, importa órdenes, corre un optimizador para generar
planes de ruta, los conductores las ejecutan en una app móvil, y los
clientes finales siguen su entrega vía un link público.

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
| **Stop** | Una `Order` materializada como parada dentro de una ruta optimizada. Vive en `route_stops`. Estado: `PENDING → IN_PROGRESS → COMPLETED \| FAILED \| SKIPPED`. **Una Order puede tener múltiples Stops históricos** (reasignaciones, replanificaciones). |
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
| **FailureReason** | Razón categorizada por la cual un `Stop` falló: `CUSTOMER_ABSENT \| CUSTOMER_REFUSED \| ADDRESS_NOT_FOUND \| PACKAGE_DAMAGED \| RESCHEDULE_REQUESTED \| UNSAFE_AREA \| OTHER`. Obligatoria al marcar `FAILED`. |
| **WorkflowState** | Estado custom definido por la empresa que extiende los terminales del sistema (ej. "Reagendado al jueves"). Vive en `company_workflow_states`. Un `Stop` puede llevar `workflowStateId` además del `status`. |

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
**Qué resuelve**: ingesta y mantenimiento de pedidos.
**Entidades**: `Order`, `CsvColumnMappingTemplate`.
**Código**: `src/components/orders/`, `src/lib/orders/`, `src/lib/csv/`.
**Reglas**:
- Un `Order.trackingId` es único por empresa **mientras esté activo**.
- Una `Order` cae fuera del ruteo si su geocoordinate está dentro de una `Zone` con `type=RESTRICTED`.

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

**Código**: `src/lib/optimization/`, `src/lib/geo/zone-utils.ts`,
`src/components/optimization/`, `src/components/planificacion/`.
**Reglas**:
- VROOM es el **único** solver. No hay fallback.
- El optimizador opera por **batches de zona** (`createZoneBatches`) para isolation hard entre zonas.
- Pre-filtro: órdenes en zonas `RESTRICTED` se excluyen ANTES de invocar VROOM.
- El `verifier` valida HARD/SOFT/INFO violations sobre el resultado, independiente del solver.
- Test harness golden en `src/tests/routing-quality/` con 28 escenarios.

### 5. Route Execution
**Qué resuelve**: la ejecución del plan en terreno por los drivers.
**Entidades**: `RouteStop`, `RouteStopHistory`, `ReassignmentsHistory`,
`Evidence` (URLs en R2).
**Código**: `src/lib/routing/route-helpers.ts`, `src/lib/storage/r2.ts`,
`src/components/monitoring/`, app móvil (`test-mobile/aea`).
**Reglas**:
- Transiciones de estado validadas por `STOP_STATUS_TRANSITIONS`.
- `COMPLETED` y `SKIPPED` son terminales.
- `FAILED` requiere `failureReason`.
- `Evidence` upload a R2 vía presigned URL **debe completarse** antes de cerrar la entrega — si falla, la operación se aborta (no se silencia).
- `zoneId` se snapshot-ea en `route_stops` al confirmar el plan; preserva history aún si la zona se borra.

### 6. Public Tracking
**Qué resuelve**: visibilidad para el cliente final sin login.
**Entidades**: `Order.trackingId` (no es entidad propia, es un campo).
**Código**: `src/app/tracking/[token]/`, `src/app/api/public/tracking/`,
`src/components/tracking/`.
**Reglas**:
- Endpoint público, sin auth, sin RBAC.
- Devuelve la `Stop` más reciente o, si hay una `COMPLETED|FAILED`, esa (para preservar la evidencia tras reasignación).

### 7. Realtime & Alerts
**Qué resuelve**: monitoreo en tiempo real de la operación.
**Código**: `src/lib/realtime/`, `src/lib/alerts/`,
`src/components/monitoring/`.
**Reglas**:
- SSE para streaming de eventos a la consola de monitoreo.
- Upstash Redis como pub-sub.

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
6. **Estados terminales no se reabren.** `COMPLETED` y `SKIPPED` para
   stops; `COMPLETED`, `FAILED`, `CANCELLED` para órdenes; `COMPLETED`,
   `FAILED`, `CANCELLED` para optimization jobs.
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

---

## Estado de deployment

**Pre-deploy**: aún no hay usuarios reales. Las refactorizaciones
agresivas son preferibles a compat shims. Eliminar código deprecated en
lugar de mantenerlo. Sin migrations data-rescue todavía.

---

## Referencias rápidas

- `CLAUDE.md` — convenciones operativas (cómo correr, comandos, RBAC flow).
- `docs/SISTEMA_OPTIMIZACION.md` — detalle del solver y su integración.
- `docs/ROLES-PERMISSIONS.md` — catálogo completo de permisos y roles.
- `docs/ESTADO_PROYECTO.md` — estado de features.
- `docs/adr/` — decisiones arquitectónicas con su motivación (en
  construcción).
