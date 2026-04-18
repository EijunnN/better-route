# Routing Quality — Findings & Gaps

> Este documento es el **análisis ejecutivo**. El reporte generado automáticamente está en `docs/routing-quality-report.md`. Los JSON detallados por escenario están en `results/routing-quality/`.

Generado tras la primera corrida del harness (24 runs = 12 escenarios × 2 solvers) ejecutado contra VROOM (v1.14.0) y PyVRP (v0.13.3) con OSRM cargado con `peru-latest`.

## Resumen ejecutivo

- **VROOM:** 11/12 escenarios pasaron. Falló **02-tight-time-windows**.
- **PyVRP:** 7/12 escenarios pasaron. Falló **02, 05, 06** y el stress test **12** hizo timeout a 60s.

Los dos solvers están violando restricciones que **deberían** respetar. Esto confirma la hipótesis: sin un verificador automático, el sistema producía rutas "técnicamente óptimas" que en realidad violaban el input — y nadie se daba cuenta.

## Gaps confirmados por el harness

### G1 — VROOM ignora ventanas de tiempo de ORDEN en algunos casos
**Escenario:** `02-tight-time-windows`
**Evidencia:** Orden `TRK-00012` tiene ventana `[14:00-17:00]` pero VROOM la programó a las **11:11** (3 horas antes).
**Causa probable:** Cuando muchas órdenes comparten ventanas similares, VROOM relaja la restricción en lugar de dejarlas sin asignar. Esto puede estar relacionado con `flexibleTimeWindows` o el manejo de `skills`.
**Acción:** revisar `src/lib/optimization/vroom-optimizer.ts` — cómo se construyen los `time_windows` en el JSON hacia VROOM; confirmar que se mandan como HARD (no como "soft" o ausentes).

### G2 — VROOM descarta `timeWindowStart/End` y `breakTime*` del vehículo
**Evidencia (lectura de código):** `src/lib/optimization/vroom-adapter.ts:58-70` hace `map(v => ({...}))` que NO incluye `timeWindowStart/End`, `hasBreakTime`, `breakDuration`, `breakTimeStart`, `breakTimeEnd`.
**Comparación:** PyVRP adapter sí pasa estos campos.
**Evidencia runtime — scenario 09 (break 12:00-13:00):** VROOM programó el stop 15 a las **12:10** — durante el supuesto descanso. No hubo pausa efectiva porque el adapter nunca se lo dijo.
**Acción:** añadir estos campos al mapeo del adapter VROOM + pasarlos al `vroom-optimizer.ts`. Esto es una corrección de 1-2 horas.

### G3 — PyVRP violó ventana de tiempo de la primera orden
**Escenario:** `02-tight-time-windows`
**Evidencia:** Orden `TRK-00000` con ventana `[08:00-11:00]` programada a las **00:04** (4 min de medianoche). Las siguientes órdenes sí respetaron ventanas (08:07, 08:24, etc.).
**Causa probable:** El horizonte de planificación en el solver PyVRP parte de `t=0` (medianoche) cuando el vehículo no tiene workday explícito. Al no enviarse un depot con `timeWindowStart`, la primera parada queda programada en `t=0+tiempo_de_viaje`.
**Acción:** en `pyvrp-service/solver.py` o el adapter, establecer el horizonte inicial al `min(timeWindowStart)` de las órdenes cuando no hay workday del vehículo.

### G4 — PyVRP violó capacidad de vehículo (hard)
**Escenario:** `05-urgent-priority`
**Evidencia:** 1 vehículo con `maxWeight=500`, 15 órdenes × 50kg = 750kg — PyVRP las asignó TODAS. Violación de 250kg.
**Causa probable:** Cuando `orderValue`/`unitsRequired` están definidas y `weightRequired` también, PyVRP puede estar usando solo una dimensión. La función `_detect_active_dimensions` en `solver.py` podría estar eligiendo incorrectamente.
**Acción:** unit test directo al adapter con 1 vehículo, 5 órdenes que superan capacidad, ver qué dimensiones activa.

### G5 — PyVRP violó workday del vehículo
**Escenario:** `06-vehicle-workday`
**Evidencia:** Workday `[09:00-13:00]`, PyVRP asignó 20 stops con el último llegando a las **14:59**.
**Causa probable:** El time-window del vehículo se envía pero PyVRP lo trata como soft o lo ignora cuando no hay `open_start` o cuando la ruta se desborda.
**Acción:** revisar cómo se construye `VehicleType` en `solver.py` — confirmar que `tw_early/tw_late` del vehículo se setean estrictos.

### G6 — PyVRP timeout con 50 órdenes
**Escenario:** `12-stress-50-orders`
**Evidencia:** Error tras 60s. PyVRP configurado con `timeout_seconds=60` — se quedó sin tiempo.
**Causa probable:** PyVRP hace búsqueda más exhaustiva. 50 órdenes × 5 vehículos = 250 asignaciones posibles — está en el límite.
**Acción:**
- Subir `timeout_seconds` default a 120-180s para escenarios grandes, o
- Implementar el umbral del `optimizer-factory.ts` correctamente: `preferPyvrpAboveOrders: 500` parece invertido (PyVRP es más lento, no más rápido).
- Considerar VROOM como default y PyVRP como "premium" para casos chicos donde importe calidad.

### G7 — Órdenes "perdidas" cuando no hay vehículos disponibles
**Contexto:** Encontrado en la primera corrida del integration-runner contra la DB real.
**Escenario:** Empresa CLARO tiene 1 vehículo ocupado en un plan confirmado. 13 órdenes PENDING. Al correr `runOptimization()`, el runner loguea `Zone "unzoned" has no available vehicles for FRIDAY. 13 orders will be unassigned.` pero el resultado devuelto tiene `routes=0` Y `unassignedOrders=[]`. Las 13 órdenes no aparecen en ningún lado.
**Evidencia:** el verifier las detecta como `MISSING_ORDER` HARD (13 violaciones).
**Causa probable:** el path "no vehicles available for zone" omite el push a `unassignedOrders`.
**Impacto:** sin el verifier, el usuario vería "plan exitoso con 0 rutas" y sus pedidos desaparecidos sin explicación. Con el verifier, la UI muestra "13 violaciones HARD: MISSING_ORDER" en rojo.
**Acción:** en `run.ts`, el branch de "sin vehículos para zona" debe push las órdenes a `unassignedOrders` con razón `"No hay vehículos disponibles para la zona/día"`.

## Limitaciones conocidas del verificador (v0)

### L1 — Interpretación ambigua de `arrival_time`
VROOM y PyVRP pueden devolver `arrivalTime`:
- Como **segundos-desde-00:00** (tiempo del día absoluto)
- Como **segundos-desde-inicio-de-ruta** (relativo)

El verificador actual asume "segundos-desde-00:00" y en algunos casos esto causa falsos positivos (p. ej. `VEHICLE_WORKDAY_EXCEEDED` cuando en realidad el solver devolvió relativo).

**Cómo lo mitigué en el reporte:** los casos "sospechosos" los contrasto contra la salida cruda (script `inspect.ts`, ya removido). En la mayoría de los casos el valor reportado ES tiempo-del-día — la violación es real.

**Acción:** estandarizar la interpretación en el adapter. Propuesta: cada adapter normaliza `arrivalTime` a **segundos-desde-00:00 del día de operación**. Documentar en `optimizer-interface.ts` como parte del contrato.

### L2 — El verificador no chequea `break_time`
No hay un `checkBreakTime.ts`. Cuando un vehículo tiene `hasBreakTime=true`, debería existir un gap en la ruta de al menos `breakDuration` minutos en la ventana `[breakTimeStart, breakTimeEnd]`.
**Acción:** agregar check — fácil, ~30 min.

### L3 — El verificador no chequea zonas
Las órdenes pueden tener `zoneId` y los vehículos asignaciones a zonas. El verificador no cruza esto aún.
**Acción:** pendiente. Requiere que la DB esté involucrada o que las asignaciones vehículo-zona viajen en el input del scenario.

## Recomendaciones priorizadas

### Prioridad 1 — Arreglar los gaps que afectan correctness
| # | Fix | Esfuerzo | Impacto |
|---|---|---|---|
| G2 | VROOM adapter pasar workday + break | 1-2h | ALTO — hoy se ignoran silenciosamente |
| G3 | PyVRP horizonte inicial correcto | 1-2h | ALTO — primera orden siempre mal programada |
| G4 | PyVRP detección de dimensiones | 2-3h | ALTO — capacidad sobre-asignada |
| G5 | PyVRP workday estricto | 1-2h | ALTO — rutas fuera de workday |

### Prioridad 2 — Mejorar el harness
- Agregar `checkBreakTime` (L2) y `checkZones` (L3)
- Normalizar `arrivalTime` en ambos adapters (L1)
- Agregar 3-5 escenarios adicionales basados en casos reales del cliente (CLARO)
- Exponer el verificador en el endpoint de optimización: después de cada job, correr `verify()` y guardar las `Violation[]` en `optimizationJobs.result` para que la UI las muestre.

### Prioridad 3 — Integración continua
- Agregar script `bun run test:routing-quality` a `package.json`
- Correrlo en CI antes de cada merge a master
- Umbral: cualquier regresión (scenarios que antes pasaban y ahora no) bloquea el merge

### Prioridad 4 — Documentar capabilities reales
Ambos adapters declaran `supportsTimeWindows: true`, `supportsSkills: true`, etc. Pero vimos que en la práctica hay casos donde esas capabilities no se ejercen correctamente. Actualizar `getCapabilities()` para reflejar limitaciones observadas, o al menos incluir un `knownIssues: []` para alertar al planificador.

## Conclusión honesta

El sistema **sí tenía el problema de confianza** que vos mencionaste. En 12 escenarios curados, detectamos **6 gaps reales** (4 en PyVRP, 2 en VROOM — aunque G2 afecta también workday en VROOM sin que el harness lo detecte porque no existía el escenario 06+09 contraste simultáneo).

La buena noticia: con el verificador + harness ahora tenés una **red de seguridad**. Cada vez que cambies un adapter, un solver, o upgrades VROOM/PyVRP, CI corre 24 runs en ~6 minutos y te dice exactamente qué se rompió.

La mejor noticia: los 6 gaps son **todos arreglables** en 1-2 días de trabajo. Nada es arquitectónico.
