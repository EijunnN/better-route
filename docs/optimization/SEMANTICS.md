# SEMANTICS — Contrato semántico solver ↔ verifier

> **v2 — 2026-07-02 (sesión "optimizador potente").** El verifier
> (`src/lib/optimization/verifier/`) es independiente del solver
> (`vroom-optimizer.ts` + `optimization-runner/`) **a propósito** — pero
> comparten una semántica que ahora vive en **módulos compartidos**
> (`constants.ts`, `time-window-policy.ts`) además de este doc. En v2 se
> resolvieron las asimetrías críticas de v1 (A1, A2, A3, A5, A6, A7, A10,
> A11 — ver §4) y se eliminó el fallback nearest-neighbor. Tocar cualquiera
> de los dos lados ⇒ leer esto primero (rúbrica "Verifier ↔ Solver").

## 0. Cambios estructurales v2 (2026-07-02)

- **No hay fallback.** `optimizeRoutes` lanza si VROOM falla; el job de
  optimización FALLA con error explícito. `optimizeWithNearestNeighbor`
  fue borrado. `engineUsed: "VROOM"` es honesto por construcción.
- **El objetivo es real.** El array `objectives` que se mandaba a VROOM
  **no existe en su API** (se ignoraba en silencio). DISTANCE/TIME/BALANCED
  ahora se expresan via `vehicle.costs {fixed, per_hour, per_km}`
  (`buildVehicleCosts`); `minimizeVehicles` usa `costs.fixed` en vez de
  recortar la flota por promedios.
- **`maxDistanceKm` es nativo.** `vehicle.max_distance` (VROOM 1.14)
  reemplaza al proxy 35 km/h + trim post-solve con `stops.pop()`.
- **No hay mutaciones post-solve.** `redistributeOrders` (balanceo
  post-solve) fue borrado; `balanceVisits` significa SOLO el clamp
  pre-solve de `max_tasks` al fair share (min con el `maxOrders` propio del
  vehículo).
- **Grouping honesto.** `groupOrdersByLocation` agrupa por coordenadas
  **y ventana idéntica**, y suma peso/volumen/valor/unidades/servicio del
  grupo (antes: solo los valores de la orden representante).
- **Gate de confirmación.** `validatePlanForConfirmation` bloquea si
  `verification` tiene violaciones HARD (Check 0). El verifier dejó de ser
  solo un badge.
- **Métricas honestas.** `verifyPlan` recomputa `timeWindowComplianceRate`
  y `route.timeWindowViolations` desde las violaciones reales (antes:
  hardcodeadas 100 / 0).
- **Telemetría.** `summary.solveTelemetry[]` persiste por llamada VROOM:
  órdenes, vehículos, `computingTimeMs` y `computing_times` de VROOM.
- **Timeouts alineados.** Cliente `VROOM_TIMEOUT=310s ≥` server 300s;
  `solveVRP` acepta el AbortSignal del job (cancelar corta el HTTP).
  OSRM `--max-table-size 5000` casa con `maxlocations: 5000` de VROOM.

## 1. Unidades y formatos canónicos

| Magnitud | Formato canónico | Cuidado |
|---|---|---|
| Distancia | **metros** (`totalDistance`) | checkTravelLimits compara en km (÷1000) |
| Duración | **segundos** | VROOM `route.duration` = SOLO viaje; `totalDuration = duration + service + waiting_time` |
| Hora del día | string `"HH:MM"` | VROOM usa **segundos desde medianoche**. Parsing compartido: `time-window-policy.ts` (`parseTimeWindow` + `resolveTimeWindowEdges`) — solver y verifier aplican el MISMO predicado de validez |
| Coordenadas | numbers WGS84 (DB: varchar → parseFloat) | VROOM recibe `[longitude, latitude]` — **orden invertido** |
| Capacidades | enteros (Math.round por slot); VALUE en cents | el verifier suma **floats crudos** (asimetría A4, aceptada) |
| Arrival en el plan | `SolvedStop.estimatedArrival "HH:MM"` (`formatArrivalTime`, trunca a minuto) | guard `!== undefined` — arrival 0 (medianoche) es válido |

## 2. Time windows — la semántica compartida

- VROOM devuelve por step `arrival` y `waiting_time`.
  **`service-start = arrival + waiting`.** El `waiting_time` REAL de VROOM
  se transporta hasta el plan (`VroomStopShape.waitingTime`) — ya no se
  recomputa (A2 resuelta).
- El verifier valida el **service-start** contra la ventana del PEDIDO
  (±60 s de gracia por borde), y el **arrival crudo** contra la jornada del
  VEHÍCULO (±60 s, sin flex).
- Una ventana solo existe si **ambos bordes parsean y start ≤ end**
  (`resolveTimeWindowEdges`, compartido). Ventana malformada ⇒ el solver la
  descarta y el verifier emite `TIME_WINDOW_MALFORMED` INFO (no HARD) —
  A7 resuelta.
- `flexibleTimeWindows`: el solver ensancha ±30 min ANTES de VROOM y el
  verifier ensancha con la MISMA constante
  (`FLEX_TIME_WINDOW_TOLERANCE_*` en `constants.ts`). El flag viaja en
  `RunnerConfigInput.flexibleTimeWindows` — A1 resuelta.
- `strictness HARD/SOFT` de los presets **NO lo consume ni el solver ni el
  verifier** hoy (solo la asignación manual). Sin cambios en v2.
- Solo el verifier emite violaciones. `VroomRoute.violations` sigue sin
  leerse, pero `timeWindowViolations`/`timeWindowComplianceRate` ahora las
  recomputa `verifyPlan` desde el reporte (§0).

## 3. Catálogo de checks del verifier

| Check | Código | Sev | Regla (literal) |
|---|---|---|---|
| integrity | UNKNOWN_VEHICLE_ID / UNKNOWN_ORDER_ID | HARD | id fuera del input |
| integrity | INVALID_SEQUENCE | HARD | sequence no estrictamente creciente |
| integrity | DUPLICATE_ORDER_ASSIGNMENT | HARD | order en >1 ruta, o en ruta Y unassigned |
| integrity | MISSING_ORDER | HARD | order ni asignada ni unassigned |
| time-windows | TIME_WINDOW_MISSING_ON_OUTPUT | INFO | pedido con ventana y arrival null/imparseable |
| time-windows | TIME_WINDOW_MALFORMED | INFO | ventana descartada por el solver (borde único, formato inválido, start>end) — **nuevo en v2** |
| time-windows | TIME_WINDOW_VIOLATED | HARD | serviceStart ∉ [start−flex−60, end+flex+60]; ventana válida según política compartida |
| time-windows | VEHICLE_WORKDAY_EXCEEDED | HARD | arrival crudo ∉ [workdayStart−60, workdayEnd+60]; workday también pasa por `resolveTimeWindowEdges` |
| break-time | BREAK_TIME_NOT_TAKEN | SOFT | 4 sub-reglas; el harness ahora SÍ copia breaks (A10) |
| skills | SKILL_MISSING | HARD | comparación por **string exacto** (el solver usa skill-ids numéricos por-solve — A13) |
| capacity | CAPACITY_EXCEEDED_{WEIGHT,VOLUME,VALUE,UNITS} | **HARD si la dimensión está en `profile.activeDimensions`, INFO si no** (A3 resuelta) | Σ cruda > cap; fallback [WEIGHT, VOLUME] espejo del solver |
| capacity | MAX_ORDERS_EXCEEDED | HARD | stops > maxOrders (>0) |
| priority | PRIORITY_INVERSION | SOFT | unassigned con orderType URGENT o priority cruda ≥90 (A9) |
| travel-limits | MAX_DISTANCE_EXCEEDED | HARD | km > maxDistanceKm + 0.5; ahora valida distancia REAL (VROOM enforce nativo, sin trim estimado) |
| travel-limits | MAX_TRAVEL_TIME_EXCEEDED | HARD | dead code en prod (run.ts fija `maxTravelTimeMinutes: undefined` — A12) |
| unassigned | UNASSIGNED_ORDER | INFO | una por unassigned |
| assignments | ROUTE_WITHOUT_DRIVER + DRIVER_* | HARD/SOFT | solo vía `verifyPlan`; clasifica por **substring** de mensajes (frágil — pendiente) |

## 4. Registro de asimetrías

Estado v2: **RESUELTA** = corregida en código (2026-07-02); **[DOC]** =
aceptada a propósito; **[FIX]** = pendiente.

- **A1 RESUELTA** — `flexibleTimeWindows` llega al verifier
  (`RunnerConfigInput.flexibleTimeWindows`, run.ts lo propaga) y la
  tolerancia vive una sola vez en `constants.ts`.
- **A2 RESUELTA** — `VroomStopShape.waitingTime` transporta el
  `waiting_time` real de VROOM; `calculateWaitingSeconds` fue borrado. El
  brazo "service antes de abrir" del verifier está vivo en prod.
- **A3 RESUELTA** — `checkCapacity` recibe el profile
  (`RunnerConfigInput.profile`) y solo trata como HARD las dimensiones
  activas; las inactivas degradan a INFO (la sobrecarga física sigue
  visible sin bloquear).
- **A4 [DOC] Redondeo.** Solver: `Math.round` por pedido; verifier: floats
  crudos. Divergencia acotada; documentada.
- **A5 RESUELTA** — `redistributeOrders` post-solve fue borrado. El
  balanceo es SOLO pre-solve: `max_tasks = min(ceil(fair·1.2),
  maxOrders_del_vehículo)` — respeta el límite individual (el clamp viejo
  lo pisaba).
- **A6 RESUELTA (disposición v1 [DOC] revertida)** — `vehicle.max_distance`
  nativo de VROOM 1.14 reemplaza las tres fórmulas (proxy 35 km/h, trim
  `stops.pop()`, check sobre estimados). VROOM respeta el límite DURANTE la
  optimización; distancia/geometry del plan son reales.
- **A7 RESUELTA** — `time-window-policy.ts` comparte el predicado de
  validez (ambos bordes, parseables, start ≤ end) entre `createVroomJob`/
  `createVroomVehicle` y `checkTimeWindows`. Ventana malformada ⇒
  `TIME_WINDOW_MALFORMED` INFO, nunca HARD.
- **A8 [DOC] Jornada heredada del depot.** Solver: vehículo sin workday
  hereda el depot window; verifier solo valida workdays propios (leniente).
- **A9 [DOC] Priority.** VROOM ve `resolveOrderPriority`; `checkPriority`
  usa la priority cruda y umbral ≥90. SOFT/informativo. (Fix v2 adyacente:
  `createVroomJob` ya no descarta priority 0 — guard `!== undefined`.)
- **A10 RESUELTA** — el harness materializa con `buildRawSolvedRoute` (el
  MISMO código de solve-batches), verifica con `verifyPlan` +
  `RunnerConfigInput` (como run.ts), copia breaks, y usa waiting/arrival
  reales. Exclusión deliberada que queda: driver sintético perfecto (el
  harness no tiene drivers). El integration-runner ahora falla con HARD>0.
- **A11 RESUELTA** — el fallback nearest-neighbor fue **eliminado**. VROOM
  caído/timeout/error ⇒ el job falla con mensaje claro (`solveVRP`
  distingue timeout vs conexión). `usedVroom` ya no existe en el output.
- **A12 [DOC] `maxTravelTimeMinutes` muerto en prod** (run.ts, "reserved
  for future use").
- **A13 [DOC] Skills por id (solver) vs string (verifier)** — simétrico
  porque ambos parten de `parseRequiredSkills`; el skill-map del solver es
  por-solve desde v2 (antes global mutable de módulo).
- **A14 [DOC] Razón de `unassigned` inferida** (solo weight/volume/skills)
  — el reason puede ser incorrecto (INFO).
- **A15 [FIX] Clasificación de driver errors por substring** en
  check-assignments (acoplamiento frágil a texto libre de
  `validateDriverAssignment`) — pendiente de códigos estructurados.

## 5. Constantes compartidas (y dónde viven)

| Constante | Valor | Ubicación | Regla |
|---|---|---|---|
| `FLEX_TIME_WINDOW_TOLERANCE_{MINUTES,SECONDS}` | 30 min / 1800 s | **`optimization/constants.ts`** (única) | consumida por solver Y verifier |
| `DEFAULT_MAX_ORDERS_PER_VEHICLE` | 30 | `constants.ts` (única) | antes 50/30 duplicada |
| `DEFAULT_SERVICE_TIME_SECONDS` | 300 | `constants.ts` (única) | el runner de negocio usa `serviceTimeMinutes ?? 10` (600 s) y SIEMPRE setea order.serviceTime |
| Política de ventanas | ambos bordes + start ≤ end | **`time-window-policy.ts`** (única) | solver y verifier |
| Gracia TW / jornada | ±60 s | inline en check-time-windows | |
| Tolerancia distancia | +0.5 km | check-travel-limits | |
| Tolerancia tiempo | +1 min | check-travel-limits | |
| Break: duración/arranque | −60 s / ±60 s | check-break-time | |
| `PRIORITY` umbral | ≥90 | check-priority | |
| Costs por objetivo | TIME {3600,0} / DISTANCE {36,1200} / BALANCED {3600,120}; minimize fixed = 2·per_hour + 60·per_km | vroom-optimizer `buildVehicleCosts` | ratios asumen ~30 km/h urbano |
| `speed_factor` | `1.5 − trafficFactor/100`; **default trafficFactor 50 ⇒ 1.0** | vroom-optimizer / preset-config | el viejo `?? 1.0` producía 1.49 (~33% optimista) |
| Balance pre-solve | `min(ceil(orders/vehículos ×1.2), maxOrders propio)` | vroom-optimizer | post-solve eliminado |
| Capacidad defaults | orden {W:0,V:0,VAL:0,U:1} / vehículo {10000,100,1e7,50} | profile-schema/capacity.ts | |
| Dims default | `['WEIGHT','VOLUME']` | profile-schema/resolve.ts; espejo en check-capacity | |
| Depot window default | '06:00'–'22:00' | run.ts | |
| `VROOM_TIMEOUT` | 310 s (≥ server 300 s) | vroom-client / .env | cliente NUNCA menor que server |
| OSRM `--max-table-size` | 5000 (= `maxlocations` VROOM) | docker-compose.yml | <1000 ubicaciones era el techo real del producto |

## 6. Reglas al tocar cualquiera de los dos lados

1. ¿Cambiaste una tolerancia/ensanche/fórmula? Si no está en
   `constants.ts`/`time-window-policy.ts`, moverla ahí ANTES de cambiarla —
   duplicarla es crear la próxima asimetría.
2. ¿Agregaste una restricción al solver (nuevo campo de VROOM)? El verifier
   necesita su check espejo — o una entrada [DOC] acá explicando por qué no.
3. ¿Agregaste un check al verifier? Verificá qué optimizó realmente VROOM
   para esa dimensión (¿la vio siquiera?) — si no la vio, tu check es un
   falso HARD en potencia (A3/A7 son el precedente).
4. Correr los 29 golden (`bun run src/tests/routing-quality/run.ts`) — el
   harness ejercita la materialización y verificación REALES desde v2
   (única exclusión: driver sintético). El escenario 29 valida la escala
   objetivo (1000 órdenes).
5. Los shapes canónicos (`solved-plan/`) y sus 3 boundaries Zod son de
   ADR-0002; los stages, de ADR-0003.
6. **Nunca** reintroducir un fallback de solver silencioso: si VROOM no
   puede resolver, el job falla y el operador lo ve. Un plan degradado sin
   aviso es peor que ningún plan (historia: A11 v1).
