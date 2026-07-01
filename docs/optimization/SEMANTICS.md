# SEMANTICS — Contrato semántico solver ↔ verifier

> **v1 — 2026-07-01 (sesión SOTA).** El verifier
> (`src/lib/optimization/verifier/`) es independiente del solver
> (`vroom-optimizer.ts` + `optimization-runner/`) **a propósito** — pero
> comparten una semántica que hoy solo se sincroniza por comentarios y por
> los 28 escenarios golden. Este doc ES esa semántica compartida, más el
> **registro de asimetrías** encontradas leyendo ambos lados completos.
> Tocar cualquiera de los dos lados ⇒ leer esto primero (rúbrica
> "Verifier ↔ Solver").

## 1. Unidades y formatos canónicos

| Magnitud | Formato canónico | Cuidado |
|---|---|---|
| Distancia | **metros** (`totalDistance`) | checkTravelLimits compara en km (÷1000) |
| Duración | **segundos** | VROOM `route.duration` = SOLO viaje; `totalDuration = duration + service + waiting_time` |
| Hora del día | string `"HH:MM"` | VROOM usa **segundos desde medianoche** (`parseTimeWindow`: h·3600+m·60; `"24:00"` → null en el solver pero 86400 en `hhmmToSeconds` del verifier) |
| Coordenadas | numbers WGS84 (DB: varchar → parseFloat) | VROOM recibe `[longitude, latitude]` — **orden invertido** |
| Capacidades | enteros (Math.round por slot); VALUE en cents | el verifier suma **floats crudos** (asimetría A4) |
| Arrival en el plan | `SolvedStop.estimatedArrival "HH:MM"` (`formatArrivalTime`, trunca a minuto, aritmética pura sin `Date` — no corre el offset de Perú) | el verifier re-parsea con `hhmmToSeconds` + `normalizeArrivalSeconds` (% 86400 si > 2 días) |

## 2. Time windows — la semántica compartida

- VROOM devuelve por step `arrival` y `waiting_time`.
  **`service-start = arrival + waiting`.**
- El verifier valida el **service-start** contra la ventana del PEDIDO
  (±60 s de gracia por borde, cada borde independiente), y el **arrival
  crudo** contra la jornada del VEHÍCULO (±60 s, sin flex).
- `flexibleTimeWindows` es la única suavización real: el solver ensancha
  las ventanas de los pedidos **±30 min ANTES de llamar a VROOM**
  (`adjustTimeWindow`, `timeWindowTolerance = 30`); el verifier debe
  replicar el ensanche con `FLEX_TOLERANCE_SEC = 1800` o produce falsos
  HARD. **Las dos constantes están duplicadas** (cada una local a su
  archivo, sincronizadas solo por comentario) — ver A1 y §5.
- `strictness HARD/SOFT` de los presets **NO lo consume ni el solver ni el
  verifier** hoy: `createVroomJob` siempre manda ventanas duras y
  `checkTimeWindows` siempre emite severity `"HARD"` (su docstring miente).
  `time-window-strictness.ts` solo vive en la asignación manual.
- Solo el verifier emite violaciones. `VroomRoute.violations` nunca se lee;
  `RawSolvedRoute.timeWindowViolations` está **hardcodeado a 0** (el
  `timeWindowComplianceRate` de las métricas del plan es siempre 100 — la
  verdad vive únicamente en el `VerificationReport`).

## 3. Catálogo de checks del verifier

| Check | Código | Sev | Regla (literal) |
|---|---|---|---|
| integrity | UNKNOWN_VEHICLE_ID / UNKNOWN_ORDER_ID | HARD | id fuera del input |
| integrity | INVALID_SEQUENCE | HARD | sequence no estrictamente creciente |
| integrity | DUPLICATE_ORDER_ASSIGNMENT | HARD | order en >1 ruta, o en ruta Y unassigned |
| integrity | MISSING_ORDER | HARD | order ni asignada ni unassigned |
| time-windows | TIME_WINDOW_MISSING_ON_OUTPUT | INFO | pedido con ventana y arrival null/imparseable |
| time-windows | TIME_WINDOW_VIOLATED | HARD | serviceStart ∉ [start−flex−60, end+flex+60] |
| time-windows | VEHICLE_WORKDAY_EXCEEDED | HARD | arrival crudo ∉ [workdayStart−60, workdayEnd+60]; **sin fallback al depot window** |
| break-time | BREAK_TIME_NOT_TAKEN | SOFT | 4 sub-reglas (config inválida / no cabe / fuera de jornada / no colocado — esta última solo si `route.breaks !== undefined`) |
| skills | SKILL_MISSING | HARD | comparación por **string exacto** (el solver usa skill-ids numéricos — A13) |
| capacity | CAPACITY_EXCEEDED_{WEIGHT,VOLUME,VALUE,UNITS} | HARD | Σ cruda > cap, **sin tolerancia, sin redondeo, ignorando `profile.activeDimensions`** (A3, A4) |
| capacity | MAX_ORDERS_EXCEEDED | HARD | stops > maxOrders (>0) |
| priority | PRIORITY_INVERSION | SOFT | unassigned con orderType URGENT o priority cruda ≥90 (no ve el priorityMapping — A9) |
| travel-limits | MAX_DISTANCE_EXCEEDED | HARD | km > maxDistanceKm + 0.5 |
| travel-limits | MAX_TRAVEL_TIME_EXCEEDED | HARD | **dead code en prod** (run.ts fija `maxTravelTimeMinutes: undefined`) |
| unassigned | UNASSIGNED_ORDER | INFO | una por unassigned (el harness la promueve vía `expected.maxUnassigned`) |
| assignments | ROUTE_WITHOUT_DRIVER + DRIVER_* | HARD/SOFT | solo vía `verifyPlan`; clasifica por **substring** de los mensajes de `validateDriverAssignment` (acoplamiento frágil a texto) |

## 4. Registro de asimetrías (los fallos silenciosos)

Cada entrada: qué diverge, consecuencia, y disposición
(**[FIX]** = Opus debe arreglar; **[DOC]** = aceptado, no "corregir" de pasada).

- **A1 [FIX·crítico] `flexibleTimeWindows` no llega al verifier en
  producción.** `run.ts` arma el config del verifier solo con
  depot/objective/maxDistanceKm/maxTravelTime; `RunnerConfigInput` ni tiene
  el campo → `flex = 0` mientras el solver ensanchó ±30 min ⇒ **falsos
  HARD `TIME_WINDOW_VIOLATED` en producción** para cualquier arrival legal
  dentro de la extensión. El harness SÍ lo pasa (escenario
  13-soft-time-windows verde en golden, rojo en prod). Fix: propagar el
  flag + unificar las constantes duplicadas (§5) en un módulo compartido.
- **A2 [FIX] `waitingTimeSeconds` recomputado neutraliza un check.** Prod
  descarta el `waiting_time` real de VROOM (`VroomStopShape` no lo
  transporta) y lo recomputa como `max(0, twStart_sin_flex − arrival)` ⇒
  `serviceStart` queda clavado en `twStart` cuando se llega temprano ⇒ el
  brazo "service antes de abrir la ventana" **no puede disparar jamás** en
  prod. El harness usa el waiting real — dos fuentes para el mismo campo.
  Fix: transportar `waiting_time` de VROOM en `VroomStopShape`.
- **A3 [FIX] Dimensiones de capacidad.** Solver restringe solo
  `profile.activeDimensions` (default WEIGHT, VOLUME); `checkCapacity`
  valida las 4 siempre que el vehículo tenga cap>0 (y el profile ni se le
  pasa) ⇒ posible `CAPACITY_EXCEEDED_VALUE` HARD sobre una restricción que
  VROOM nunca vio. Fix: pasar el profile al verifier y validar solo dims
  activas (o decidir lo inverso por ADR).
- **A4 [DOC] Redondeo.** Solver: `Math.round` por pedido; verifier: suma de
  floats crudos (30×0.4 kg = 0 para VROOM, 12 kg para el verifier).
  Divergencia acotada; documentada.
- **A5 [FIX] `balanceVisits` rompe invariantes post-solve.** (a)
  `calculateBalancedMaxOrders` ignora el `maxOrders` individual → puede
  generar `MAX_ORDERS_EXCEEDED` HARD el propio pipeline; (b)
  `redistributeOrders` mueve stops chequeando solo peso/volumen/maxOrders +
  inserción haversine — **ignora skills y time windows** — y reescribe los
  stops movidos **sin** arrival/service/waiting → la violación TW degrada a
  INFO invisible. Fix mínimo: respetar maxOrders individual y skills; TW
  al menos re-flaggear.
- **A6 [DOC] `maxDistanceKm` = tres fórmulas.** VROOM optimiza un proxy
  temporal (km/35 km/h ×1.2); el trim post-solve descuenta estimaciones
  (avgLeg, 8.33 m/s) **sin re-rutear ni recortar geometry**; el check
  compara ese total ESTIMADO vs km+0.5. Aceptado: es heurística asumida.
- **A7 [FIX] Ventanas de un solo lado.** El solver descarta la ventana si
  falta un borde o start>end (VROOM sin restricción); el verifier valida
  cada borde independiente → HARD sobre constraint nunca aplicada. Mismo
  bug con `"24:00"` (null en solver, 86400 en verifier) y con el wrap de
  medianoche del ensanche flexible. Fix: unificar `parseTimeWindow`/
  `hhmmToSeconds` en un util compartido con la misma política.
- **A8 [DOC] Jornada heredada del depot.** Solver: vehículo sin workday
  hereda el depot window ('06:00'–'22:00'); verifier solo valida workdays
  propios (leniente). El `depot.timeWindow*` llega al verifier y ningún
  check lo lee.
- **A9 [DOC] Priority.** VROOM ve `resolveOrderPriority` (priorityMapping
  del profile); `checkPriority` usa la priority cruda y umbral literal ≥90.
  SOFT/informativo — documentado.
- **A10 [FIX·harness] Divergencias prod vs harness en la verificación
  misma:** (a) prod pierde `arrival === 0` (check truthy en solve-batches;
  el harness usa `!== undefined`); (b) el harness no copia `breaks` al
  AssignedSolvedRoute → la sub-regla de colocación de break **nunca corre
  en los 28 golden**; (c) el harness esquiva checkDriverAssignments con
  driver sintético. Fix: alinear el harness para que ejercite lo mismo que
  prod.
- **A11 [FIX·crítico] Fallback silencioso a nearest-neighbor.** Si VROOM
  está caído o lanza, `optimizeRoutes` cae a un greedy haversine que
  **ignora time windows y no emite arrivals** — y el runner reporta
  `engineUsed: 'VROOM'` incondicional. El verifier solo ve INFOs. Fix:
  propagar `usedVroom` al result + violación/flag explícito (pre-deploy:
  considerar fallar el job en vez de degradar en silencio).
- **A12 [DOC] `maxTravelTimeMinutes` muerto en prod** (run.ts:359,
  "reserved for future use").
- **A13 [DOC] Skills por id (solver) vs string (verifier)** — simétrico hoy
  porque ambos parten de `parseRequiredSkills`; cualquier normalización
  unilateral (trim/case) lo rompe en silencio.
- **A14 [DOC] Razón de `unassigned` inferida** (solo weight/volume/skills;
  no value/units/profile) — el reason puede ser incorrecto (INFO).

## 5. Constantes compartidas (y dónde viven)

| Constante | Valor | Ubicación | Regla |
|---|---|---|---|
| `FLEX_TOLERANCE_SEC` | 1800 s | `verifier/check-time-windows.ts` (local) | **gemela de** `timeWindowTolerance = 30 min` en `vroom-optimizer.ts` — cambiar una ⇒ cambiar la otra (A1 pide unificarlas en un módulo) |
| Gracia TW / jornada | ±60 s | inline en check-time-windows | |
| Tolerancia distancia | +0.5 km | check-travel-limits | |
| Tolerancia tiempo | +1 min | check-travel-limits | |
| Break: duración/arranque | −60 s / ±60 s | check-break-time | |
| `PRIORITY` umbral | ≥90 | check-priority | |
| `AVERAGE_SPEED_KMH` | 35 (+buffer ×1.2) | vroom-optimizer (proxy distancia→tiempo) | |
| Velocidad del trim | 8.33 m/s | vroom-optimizer | |
| `speed_factor` | `1.5 − trafficFactor/100` (≈1.49 default) | vroom-optimizer | |
| Balance | rebalancea <80, aplica si mejora >5, maxDeviation 20, cap 50 ×1.2 | vroom-optimizer / balance-utils | |
| Capacidad defaults | orden {W:0,V:0,VAL:0,U:1} / vehículo {10000,100,1e7,50} | profile-schema/capacity.ts | |
| Dims default | `['WEIGHT','VOLUME']`; priorityMapping {NEW:50, RESCHEDULED:80, URGENT:100} | profile-schema/resolve.ts | |
| Service time | 300 s default en solver y verify-runner; **el runner real usa 600 s** (`serviceTimeMinutes ?? 10`) | tres lugares | otra constante triplicada |
| maxOrders default | 50 (vroom-optimizer) / **30 (runner)** | dos lugares | |
| Depot window default | '06:00'–'22:00' | run.ts | |
| Gate del harness | maxHardViolations 0, maxUnassigned 0 | tests/routing-quality/run.ts | |

## 6. Reglas al tocar cualquiera de los dos lados

1. ¿Cambiaste una tolerancia/ensanche/fórmula de un lado? Buscá su gemela
   en la tabla §5 y en el registro §4 — si no existe del otro lado,
   probablemente acabas de crear la asimetría A15.
2. ¿Agregaste una restricción al solver (nuevo campo de VROOM)? El verifier
   necesita su check espejo — o una entrada [DOC] acá explicando por qué no.
3. ¿Agregaste un check al verifier? Verificá qué optimizó realmente VROOM
   para esa dimensión (¿la vio siquiera?) — si no la vio, tu check es un
   falso HARD en potencia (A3/A7 son el precedente).
4. Correr los 28 golden (`bun run src/tests/routing-quality/run.ts`) es
   necesario pero NO suficiente: A10 lista lo que el harness no ejercita.
5. Los shapes canónicos (`solved-plan/`) y sus 3 boundaries Zod son de
   ADR-0002; los stages, de ADR-0003.
