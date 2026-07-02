# Hallazgos del review adversarial — 2026-07-02 (PENDIENTES de aplicar)

> Review de 5 agentes (2 auditores custom + 3 revisores adversariales) sobre el trabajo del 2026-07-02
> (Cola de Opus completa). Los fixes NO se aplicaron: la sesión alcanzó su límite. Cada hallazgo tiene
> escenario de falla verificado y fix sugerido. Prioridad: el crítico primero, luego los medios.

## [CRITICO] Spec §5 sin implementar: my-route resucita stops con PendingClose vivo (hasPendingFor tiene 0 call sites)
*Fuente: review-outbox* — lib/providers/route_provider.dart

**Escenario de falla:** Driver cierra stop offline → applyLocalClose lo marca terminal → vuelve la señal → el timer de 60s de home_screen (o el pull-to-refresh) llama loadRoute ANTES de que el drain complete → el server aún ve IN_PROGRESS → state.copyWith(data: server) pisa el estado local y el stop reaparece ABIERTO en la UI con pendingCount=1. Además loadRoute dispara flush() fire-and-forget DESPUÉS de setear data, y tras un drain exitoso vía timer nadie refetchea my-route (spec §5: 'tras un drain exitoso → refetch'), así que el stop queda resucitado hasta el próximo tick. El driver puede re-cerrarlo, gatillando el hallazgo #2.

**Fix sugerido:** En loadRoute, mergear: si OfflineOutbox().hasPendingFor(stop.id), conservar el estado local del stop (la regla exacta de spec §5). Y que el outbox notifique drain exitoso para disparar refresh().

## [MEDIO] Boundaries Zod de solved-plan no se ejecutan en producción — el enum de A15 no valida nada en runtime (SEMANTICS §6 regla 5 / ADR-0002; §4-A15 sobrevende)
*Fuente: audit-verifier* — src/lib/optimization/solved-plan/schemas.ts (parsers sin uso prod); src/app/api/optimization/jobs/[id]/confirm/route.ts:227, jobs/[id]/validate/route.ts:128, configure/[id]/route.ts:257 (casts `as VerifiedPlan`)

**Escenario de falla:** Un job optimizado ANTES del cambio A15 persiste `assignmentQuality.errors: string[]` en optimization_jobs.result. Al leerlo, confirm/validate usan `safeParseJson(job.result) as VerifiedPlan` (cast, sin Zod) → los strings viejos fluyen como si fueran objetos → `validatePlanForConfirmation` (plan-validation.ts:185) emite issues con `message: undefined` y la UI (driver-route-detail.tsx:537, driver-assignment-quality.tsx:195) renderiza badges vacíos. Nadie falla visible: exactamente el fallo silencioso de shape que `parseVerifiedPlan` (boundary 3, schemas.ts:291) existe para atrapar — pero solo lo llaman los tests. Lo mismo aplica al persistir: `assertPersistableVerifiedPlan` (boundary 2) tampoco se invoca en el runner.

**Fix sugerido:** Wire-in de los parsers: `assertPersistableVerifiedPlan(plan)` en el runner antes de escribir optimization_jobs.result, y `parseVerifiedPlan(safeParseJson(job.result))` en confirm/validate/configure en lugar del cast. Pre-deploy: wipe de jobs con shape viejo en DB dev. Alternativa mínima: corregir SEMANTICS §4-A15 quitando la afirmación 'su Zod boundary validan el enum' y registrar el gap como pendiente — el doc es parte del contrato y hoy no describe el código.

## [MEDIO] El guard de vehículos ocupados sigue con TOCTOU frente a escritores que no toman el advisory lock (reopen, PATCH status→PENDING, POST /api/route-stops)
*Fuente: review-confirm* — src/app/api/optimization/jobs/[id]/confirm/route.ts

**Escenario de falla:** Vehículo V tiene un único stop del plan A en estado FAILED (no cuenta como activo). Operador 1 confirma el plan B que usa V: el SELECT del guard (línea 558) pasa porque solo filtra PENDING/IN_PROGRESS. Antes de que el confirm commitee, Operador 2 ejecuta POST /api/route-stops/[id]/reopen sobre ese stop: su tx (src/app/api/route-stops/[id]/reopen/route.ts:191-236) flippea FAILED→PENDING y commitea sin tomar pg_advisory_xact_lock. Ambos commits aterrizan → V queda con stops PENDING de dos planes simultáneos, exactamente el estado que C-5 declaraba cerrado. Mismo agujero vía PATCH /api/route-stops/[id] (transición a PENDING) y vía POST /api/route-stops, que además inserta stops con status default PENDING haciendo delete+insert SIN transacción (src/app/api/route-stops/route.ts:128-165). El lock solo serializa confirm↔confirm; la spec §6 sobrevende la resolución.

**Fix sugerido:** Todo escritor que pueda crear o revivir stops activos (reopen, PATCH a PENDING, POST /api/route-stops) debe ejecutar SELECT pg_advisory_xact_lock(hashtext(companyId)) como primer statement de su tx, y el reopen debe re-chequear que el vehículo no tenga stops activos de otro plan (o aceptarse explícitamente como excepción documentada). Alternativa declarativa: constraint/trigger que impida stops activos de jobs distintos para el mismo vehicle_id. Actualizar la fila C-5 de docs/specs/confirm-plan.md para acotar qué serializa el lock.

## [MEDIO] DELETE /api/optimization/configure/[id] revierte órdenes ASSIGNED→PENDING sin lock ni transacción y puede dejar una orden PENDING con stop activo de otro plan
*Fuente: review-confirm* — src/app/api/optimization/configure/[id]/route.ts

**Escenario de falla:** La orden X estuvo en el plan A (CONFIRMED) y volvió a PENDING (p.ej. stop FAILED). Se re-optimiza en el plan B. Confirm de B commitea: X pasa a ASSIGNED con un route_stop PENDING del job B. Inmediatamente después, un operador borra el plan A: el DELETE parsea el result viejo de A, arma assignedOrderIds que incluye X, y ejecuta UPDATE orders SET status='PENDING' WHERE status='ASSIGNED' (líneas 270-281) — el predicado matchea el ASSIGNED que acaba de poner B. Resultado commiteado: X en PENDING con un stop PENDING vivo del plan B (el inverso de C-4: la próxima optimización puede volver a asignarla y duplicar el stop). Además el revert y el DELETE cascade corren como statements sueltos, sin db.transaction ni advisory lock, y ordersReverted reporta assignedOrderIds.length en vez de las filas realmente afectadas.

**Fix sugerido:** Envolver revert+delete en una tx que tome pg_advisory_xact_lock(hashtext(companyId)); revertir solo órdenes cuyo stop activo pertenezca a jobs de la config borrada (JOIN route_stops ON jobId IN (jobs de esta config) AND status IN ('PENDING','IN_PROGRESS')) en lugar del listado ciego del result; usar .returning() para contar ordersReverted real.

## [MEDIO] FIX-1/carrera: un drain in-flight clobberea la entrada reemplazada por re-cierre (submitClose ignora _flushing)
*Fuente: review-outbox* — lib/services/offline_outbox.dart

**Escenario de falla:** submitClose llama _flushOne(entry) directo sin tomar el mutex _flushing (línea 117), y _replace/_removeById matchean por id == stopId. Secuencia: (1) cierre FAILED encolado con fotos; (2) timer flush empieza a drenarlo (upload lento en 2G); (3) el stop resucitó en UI (hallazgo #1) y el driver lo re-cierra como COMPLETED → submitClose reemplaza la entrada y lanza su propio _flushOne; (4) el drain viejo termina una foto y hace _replace(current) donde current = copyWith de la entrada VIEJA → pisa la entrada nueva en _entries y la persiste; (5) el drain viejo PATCHea FAILED y _removeById borra la entrada COMPLETED sin haberla enviado. El PATCH COMPLETED que corre en paralelo choca contra un stop ya FAILED → 4xx → drop definitivo. La corrección del driver se pierde en silencio.

**Fix sugerido:** Serializar submitClose con el mismo lock de flush (o invalidar drains in-flight con un token de generación por entrada: si generation cambió, abortar _replace/_removeById/PATCH).

## [MEDIO] FIX-2/cold-start: con reasons vacíos (offline sin policy) el driver no puede reportar FAILED en absoluto
*Fuente: review-outbox* — lib/widgets/sheets/failure_reason_sheet.dart

**Escenario de falla:** App cold-start en zona sin señal: workflowProvider.loadStates() falla → findBySystemState(FAILED) es null → reasons = []. El driver toca 'No entregó', la sheet muestra 'No hay motivos configurados' pero _confirm() exige _selectedReason != null incondicionalmente (línea 92) → alert 'Motivo requerido' con cero opciones seleccionables → imposible cerrar FAILED, exactamente en el escenario offline para el que existe el outbox. La spec dice 'cold-start sin policy → gate off', pero la UI lo deja fail-closed sin salida. Igual para una empresa con failureReasons legítimamente vacío.

**Fix sugerido:** Si widget.reasons.isEmpty, permitir confirmar sin selección (el gate del outbox también está off en ese caso, coherente con spec §4). Opcional: persistir la última policy cacheada a disco.

## [MEDIO] FIX-4: si _storage.clearAll() lanza dentro del catch, el Completer nunca se completa y los 401 en espera cuelgan para siempre
*Fuente: review-outbox* — lib/services/api_service.dart

**Escenario de falla:** Refresh devuelve 401 real → catch en _refreshedAccessToken (línea 166) hace await _storage.clearAll() ANTES de completer.complete(null). flutter_secure_storage puede lanzar PlatformException (keystore corrupto, backup restore en Android). Si lanza: la excepción sale del catch, el finally resetea _refreshCompleter=null, pero el completer queda sin completar → TODA request que estaba await-eando ese future cuelga indefinidamente (sin timeout). Requests posteriores arrancan un refresh nuevo, pero las colgadas nunca resuelven — p. ej. un _flushOne del outbox colgado deja _flushing=true para siempre y el outbox muere hasta reiniciar la app.

**Fix sugerido:** Completar el completer ANTES de clearAll, o envolver clearAll en su propio try/catch: `try { await _storage.clearAll(); } catch (_) {} completer.complete(null);`

## [MEDIO] FIX-3: route_stop_history y delivery_visits graban el delta del request (notesValue), no lo persistido — el Visit terminal pierde la nota vigente cuando `notes` viene omitida
*Fuente: review-seam-header* — src/app/api/route-stops/[id]/route.ts

**Escenario de falla:** Driver hace PATCH {status:'IN_PROGRESS', notes:'portón azul, tocar 2 veces'} y luego cierra con PATCH {status:'COMPLETED', evidenceUrls:[...]} SIN key notes (merge-patch: omitida = no tocar). El stop persiste conservando 'portón azul…' (línea 361-363: updateData.notes solo si notesProvided), pero `route_stop_history.notes` (línea 530) y `delivery_visits.notes` (línea 549) reciben `notesValue`, que para notes-omitida es null (línea 178-180). Resultado: el Visit — snapshot inmutable del intento según ADR-0005 — registra null mientras el estado persistido al momento del cierre tiene nota; además el history no distingue 'omitida' (stop conserva) de 'null explícito' (stop borra): ambos graban null con outcomes persistidos distintos. Auditoría del intento inconsistente con la fila.

**Fix sugerido:** En el path de status, resolver la nota efectiva post-merge: `const effectiveNotes = notesProvided ? notesValue : currentStop.notes;` y usarla en el insert de delivery_visits (y en el description del alert, línea 604). Para history, considerar registrar en metadata si notes fue tocada ({notesPatched: boolean}) para que null omitida ≠ null borrada.

## [MENOR] location POST acepta routeId/stopSequence del body sin validar pertenencia (a diferencia de jobId)
*Fuente: audit-tenancy* — C:/Users/vicen/Desktop/Projects/Bun/planeamiento/src/app/api/mobile/driver/location/route.ts (líneas ~230-241)

**Escenario de falla:** Conductor autenticado de la empresa A envía POST con routeId="ruta-de-otro-driver" (cualquier string ≤100 chars) y stopSequence=-99. Se persiste tal cual en driver_locations, se publica al canal monitoring(companyA) y dispara recomputeRouteEtas sobre ese routeId. NO es cross-tenant (el canal Centrifugo y el recompute van scoped al companyId del JWT, y driver_locations.routeId es varchar(100) sin FK — verificado en src/db/schema/tracking.ts:52), pero un driver puede contaminar el monitoring y los ETAs de rutas ajenas dentro de su propia empresa. El comentario FIX-7 justifica tratar valores mal tipados como ausentes, no saltarse la validación de pertenencia — asimétrico con jobId, que sí se valida contra el tenant. Regla: REVIEW-RUBRIC §1 fail-closed (no puedo probar que el routeId aceptado pertenece al job/driver).

**Fix sugerido:** Antes de aceptar routeId del body, verificar que exista un routeStops con ese routeId + jobId resuelto + userId=driverId (o al menos jobId+companyId); si no matchea, tratarlo como ausente igual que se hace con jobId ajeno.

## [MENOR] Lookup de routeStops en location POST sin filtro companyId explícito (seguro solo transitivamente)
*Fuente: audit-tenancy* — C:/Users/vicen/Desktop/Projects/Bun/planeamiento/src/app/api/mobile/driver/location/route.ts (líneas ~270-285)

**Escenario de falla:** La query fallback `db.query.routeStops.findFirst({ where: and(eq(routeStops.jobId, jobId), eq(routeStops.userId, driverId)) })` fue modificada hoy (ahora jobId puede venir del body) y no lleva `eq(routeStops.companyId, companyId)`. Hoy es seguro porque jobId se prueba tenant-owned justo antes (withTenantFilter sobre optimizationJobs, que sí tiene columna companyId) y driverId sale del JWT — pero viola literalmente REVIEW-RUBRIC §1 bullet 2 ("¿Toda query Drizzle filtra por companyId?") y ADR-0008 Consequences ("one WHERE companyId = $tenant per query"). Si un refactor futuro elimina o reordena la validación previa del jobId, esta query se vuelve el punto de fuga sin que nada lo detecte.

**Fix sugerido:** Agregar `eq(routeStops.companyId, companyId)` (o `withTenantFilter(routeStops, [...], companyId)`) al where — defensa en profundidad de una línea, el patrón que el ADR-0008 declara como costo aceptado.

## [MENOR] DELETE de route-stops/[id] quedó sin withContractHeader (asimetría en archivo del seam)
*Fuente: audit-tenancy* — C:/Users/vicen/Desktop/Projects/Bun/planeamiento/src/app/api/route-stops/[id]/route.ts (línea ~677)

**Escenario de falla:** GET y PATCH del archivo se exportan wrappeados (`export const GET/PATCH = withContractHeader(...)`) pero `export async function DELETE` quedó sin wrapper. Si DELETE es web-only (cleanup) no hay impacto en el móvil; pero el contrato §10.2 habla de "respuestas del seam" y el archivo entero es parte del seam (`route-stops/[id]` listado en REVIEW-RUBRIC §Contrato del seam móvil). Un cliente que llame DELETE no recibirá x-br-contract. Sin impacto de tenancy/RBAC — los guards de DELETE no fueron tocados.

**Fix sugerido:** Wrappear también DELETE con withContractHeader por uniformidad, o dejar un comentario explícito de que DELETE es web-only y está fuera del contrato móvil.

## [MENOR] checkSkillExpiry quedó como flag de configuración muerto tras el refactor validateDriverLicensesAndSkills → validateDrivers
*Fuente: audit-verifier* — src/lib/optimization/plan-validation.ts:62,76 + src/lib/validations/plan-confirmation.ts:37

**Escenario de falla:** Un cliente manda `validationConfig.checkSkillExpiry: true/false` al confirmar un plan: el Zod del request lo acepta (default true) y PlanValidationConfig lo tipa, pero ningún código lo lee — el gate viejo `if (config.checkLicenseExpiry || config.checkSkillExpiry)` desapareció y `validateDrivers` solo consume `checkLicenseExpiry`. El flag promete un comportamiento que no existe (la expiración de skills solo aparece como warning en validateDriverAssignment, fuera de este flujo).

**Fix sugerido:** Eliminar `checkSkillExpiry` de PlanValidationConfig, DEFAULT_VALIDATION_CONFIG y del schema de plan-confirmation (convención del proyecto: borrar código muerto), o implementar el check de skill expiry en validateDrivers si se quiere conservar la opción.

## [MENOR] CLAUDE.md stale: dice '28 escenarios golden' pero el harness tiene 29 (SEMANTICS §6.4 dice 29, correcto)
*Fuente: audit-verifier* — CLAUDE.md líneas 132 y 200 (vs src/tests/routing-quality/scenarios/ con 29 archivos, incl. 29-1000-orders-target-scale.ts)

**Escenario de falla:** Un implementador que siga CLAUDE.md espera 28 escenarios y no nota si el escenario 29 (escala objetivo 1000 órdenes, el que SEMANTICS §6.4 destaca) falta o falla en su corrida. Conflicto entre docs: por precedencia SEMANTICS/ADR ganan, pero CLAUDE.md fue tocado hoy y no se corrigió.

**Fix sugerido:** Actualizar las dos menciones de CLAUDE.md a '29 escenarios golden'.

## [MENOR] Deadlock de row-locks posible entre el UPDATE masivo de orders del confirm y otros bulk-writers de orders; se mapea a 500 genérico no reintentable
*Fuente: review-confirm* — src/app/api/optimization/jobs/[id]/confirm/route.ts

**Escenario de falla:** Confirm de un plan con 1000+ órdenes ejecuta UPDATE orders ... WHERE id IN (...) (línea 586) lockeando filas en el orden del plan de ejecución. En paralelo, POST /api/orders/batch/delete (o el revert del DELETE de configure) lockea un subconjunto solapado en otro orden. Ninguno toma el advisory lock del otro (batch/delete no lo toma en absoluto), así que corren concurrentes: Postgres detecta el ciclo y aborta uno con 40P01. Si mata al confirm, el rollback es limpio (correcto) pero el catch exterior lo convierte en 500 'Internal server error' — el operador no sabe que un simple retry funcionaría. Nota: el advisory lock en sí no puede deadlockear (cada tx toma exactamente uno, como primer statement, tanto en confirm como en onboarding/setup).

**Fix sugerido:** En el catch exterior, detectar el código Postgres 40P01 (deadlock_detected) y responder 409/503 con mensaje reintentable; opcionalmente ordenar los ids del inArray (sort estable) en todos los bulk-updates de orders para reducir la ventana de inversión de locks.

## [MENOR] Driver eliminado o demovido entre la validación (pre-tx) y el INSERT: FK→500 o stop con user no-CONDUCTOR
*Fuente: review-confirm* — src/app/api/optimization/jobs/[id]/confirm/route.ts

**Escenario de falla:** validateDrivers (C-3) corre en validatePlanForConfirmation, fuera de la tx y sin re-chequeo post-lock. Si el driver se borra entre la validación y el insert de route_stops, el FK de route_stops.user_id revienta → 500 genérico (rollback limpio, aceptable). Peor: si al usuario solo le cambian el rol (deja de ser CONDUCTOR) o lo desactivan en esa ventana, no hay FK que lo frene y el confirm commitea stops asignados a un usuario que ya no es conductor — la app móvil de ese user no los va a servir y no hay alerta.

**Fix sugerido:** Dentro de la tx, tras el advisory lock, re-verificar en un solo SELECT que todos los userId de stopsToInsert existen, pertenecen al tenant y conservan rol CONDUCTOR activo; si no, throw CONFLICT con el detalle del driver.

## [MENOR] plan_metrics se persiste con los números del plan completo aunque el confirm haya sido parcial
*Fuente: review-confirm* — src/app/api/optimization/jobs/[id]/confirm/route.ts

**Escenario de falla:** Plan de 500 órdenes; 60 caen (pre-check + stale dentro de la ventana). El confirm parcial commitea 440 stops, pero calculatePlanMetrics corrió pre-tx sobre result completo (línea 503): la fila de plan_metrics insertada dentro de la misma tx reporta totalStops=500, distancias y compliance del plan íntegro. Los dashboards y la comparación vs job previo (comparedToJobId) quedan calibrados contra una realidad que nunca se dispatchó — drift consistente con C-7 pero ahora amplificado por el confirm parcial que el propio refactor legitima.

**Fix sugerido:** Mínimo: persistir routeStopsCreatedCount/ordersUpdatedCount (o un flag partialConfirm + skippedCount) en plan_metrics para que el consumidor pueda descontar; ideal: recalcular totalStops/unassignedOrders contra stopsToInsert dentro de la tx antes del INSERT de metrics.

## [MENOR] 409 permanente en la cabeza de la cola bloquea el drain de todos los cierres posteriores hasta ~30 min
*Fuente: review-outbox* — lib/services/offline_outbox.dart

**Escenario de falla:** El cap de 60 SÍ se respeta (61 intentos × timer 30 s ≈ 30 min y drop). Pero flush() corta al primer fallo transitorio (línea 131) bajo el racional 'sin red el resto también falla' — un 409 es per-entrada, no de conectividad: un lock nunca liberado sobre stop-A hace que los cierres de stop-B..N (perfectamente enviables) queden retenidos ~30 minutos, reintentándose solo el A en cada tick. El operador ve N stops sin cerrar cuando solo uno está lockeado.

**Fix sugerido:** Distinguir fallo de transporte (DioException sin response → break) de fallo HTTP transitorio per-entrada (409/5xx → continue con la siguiente entrada).

## [MENOR] Tests: el invariante resume-safe de FIX-1 (persistir uploadedByPath tras CADA foto) no está cubierto — el test presiembra el mapa
*Fuente: review-outbox* — test/offline_outbox_test.dart

**Escenario de falla:** El test 2 (línea 173) inyecta uploadedByPath ya poblado en el PendingClose inicial y verifica que no re-sube. Si alguien borra el `await _persist()` dentro del loop de fotos de _flushOne (líneas 157-160), los 6 tests siguen verdes, pero un kill entre foto 2 y 3 pierde el registro de las subidas y el retry re-sube todo (spec §3: 'un crash a mitad de subida no re-sube'). Débiles también: (i) el skip de archivo local desaparecido (§3) no tiene test; (ii) el caso >60 del test 4 depende de que fake.onCompleteStop = networkError LEAKEE del bloque anterior — reordenar los bloques rompe el test por accidente; (iii) para 409 solo se asertea OutboxResult.queued, no el retryCount++; (iv) no hay test del reemplazo por re-cierre (spec §1 're-cerrar reemplaza').

**Fix sugerido:** Test: lanzar en onUploadEvidencePhoto tras la 2ª foto, releer rawOutbox y asertar que uploadedByPath contiene las fotos 1-2; luego drenar con instancia nueva y asertar que solo se sube la 3ª. Setear el hook explícitamente en el caso exhausted.

## [MENOR] Vías de cierre muertas que bypasearían el outbox: RouteNotifier.completeStop/failStop sin call sites
*Fuente: review-outbox* — lib/providers/route_provider.dart

**Escenario de falla:** Hoy TODAS las vías vivas de cierre terminal pasan por submitClose (DeliveryActionSheet → _completeDelivery, FailureReasonSheet → _handleFailure, workflow terminal → _closeViaOutbox; el branch transitionStop online solo corre para estados no-terminales). Pero routeProvider.completeStop (línea 123) y failStop (línea 150) siguen exportados y PATCHean directo sin outbox ni gate FIX-2 — el próximo feature que los llame reintroduce el bug de pérdida silenciosa. Además transitionStop no rechaza systemState terminal (el guard vive solo en los call sites). Y el backstop MissingFailureReasonException solo está atrapado en _closeViaOutbox: _handleFailure/_completeDelivery llaman submitClose sin catch (inalcanzable salvo policy string whitespace-only, pero sería crash de zone, no snackbar).

**Fix sugerido:** Borrar completeStop/failStop del provider (convención del repo: eliminar código muerto) y hacer que transitionStop haga assert/throw si systemState es terminal.

## [MENOR] my-orders emite timeWindow de la Order como HH:MM:SS pero el contrato §1/§4 promete 'HH:MM crudos'
*Fuente: review-seam-header* — src/app/api/mobile/driver/my-orders/route.ts

**Escenario de falla:** Order con time_window_start = 14:00. `orders.timeWindowStart` es columna `time` de Postgres (src/db/schema/orders.ts:122-123; el preset igual, líneas 39-40) y Postgres siempre la serializa como '14:00:00'. El handler (líneas 273-280) la pasa verbatim al wire → `timeWindow.start = "14:00:00"`, contradiciendo §1 ('HH:MM crudos') y §4 ('strings HH:MM crudos'). Hoy no crashea (el parser Dart tolera ambos y el endpoint no tiene consumidor móvil), pero el contract-test/fixture que se escriba desde el doc (§10.4) validará HH:MM y fallará contra la respuesta real — drift doc↔wire.

**Fix sugerido:** Alinear el doc (menos invasivo): en §1 y §4 cambiar 'HH:MM crudos' por 'HH:MM:SS crudos (formato `time` de Postgres; el parser Dart tolera HH:MM y HH:MM:SS)'. Es corrección descriptiva de un shape ya emitido — sin bump de CONTRACT_VERSION ni cambio de wire. Normalizar en el server tocaría un shape ya en producción de wire para ganar nada, y exigiría bump + espejo en aea.

## [MENOR] FIX-3: el path customFields-only (sin status) descarta en silencio una `notes` provista, violando la semántica merge-patch documentada
*Fuente: review-seam-header* — src/app/api/route-stops/[id]/route.ts

**Escenario de falla:** PATCH {customFields:{doc:'123'}, notes:'cliente pide tarde'} sin status: entra al short-path de líneas 259-275, que setea solo customFields+updatedAt → la nota provista se pierde sin error ni indicación. El contrato §3.6 declara todos los campos opcionales con notes = merge-patch ('omitida = no tocar, "" se almacena') sin condicionarla a que viaje status; el comportamiento real sí la condiciona. Hoy el móvil siempre manda status al cerrar, pero cualquier cliente que confíe en el doc pierde datos silenciosamente.

**Fix sugerido:** En el update del short-path incluir `...(notesProvided ? { notes: notesValue } : {})`, o bien documentar explícitamente en §3.6 que notes solo se aplica junto a status (menos deseable: complica el contrato).

## [MENOR] FIX-7: el fallback por-campo mezcla contexto — routeId del body + stopSequence derivado de OTRO job/route produce un par inconsistente persistido
*Fuente: review-seam-header* — src/app/api/mobile/driver/location/route.ts

**Escenario de falla:** El móvil manda {latitude, longitude, routeId:'R-A'} sin stopSequence ni jobId (o con jobId mal tipado, tratado como ausente). El server: routeId='R-A' del body (línea 230-235, validado solo como string ≤100 — ni tenant ni existencia); jobId cae al fallback 'job COMPLETED más reciente de hoy' (253-272) que puede ser el job de la ruta R-B; luego (274-291) como stopSequence===null, deriva currentStop de ESE job → stopSequence=12 de R-B, mientras routeId queda 'R-A' (el ?? de línea 288 no lo corrige porque no es null). Se persiste driver_locations con (routeId R-A, jobId de R-B, stopSequence 12 de R-B), se publica a monitoring con routeId R-A y se dispara recomputeRouteEtas para R-A con una secuencia que no le pertenece. Telemetría/ETA cruzada; sin pérdida del ping (por diseño), pero el trío ya no es interpretable.

**Fix sugerido:** Derivar en dos niveles coherentes: si el body trae routeId, buscar currentStop por (routeId del body + driverId) en vez de por el jobId derivado; si el body no trae routeId, tomar routeId Y stopSequence juntos del mismo currentStop (todo-o-nada por par routeId/stopSequence), manteniendo jobId como campo independiente. Opcionalmente validar bodyRouteId contra tenant igual que jobId.

## [MENOR] Cobertura del header: un throw no capturado en los handlers de chat/broadcast (y en los tramos pre-try de reopen/subscription-token) produce un 500 de Next sin x-br-contract ni envelope {error}
*Fuente: review-seam-header* — src/app/api/chat/conversations/[driverId]/messages/route.ts

**Escenario de falla:** withContractHeader estampa solo sobre la Response que el handler RETORNA; no captura throws. chat messages GET/POST (todo el handler), chat read y broadcast no tienen try/catch de tope, y reopen (try recién en línea 190) y subscription-token (línea 102) dejan fuera la carga previa de datos. Con Postgres caído, `sendChatMessage` o el select de cursor lanzan → Next devuelve su 500 genérico: sin `x-br-contract` (el handshake §10.2 no ve versión — tolerable, es advisory) y sin el shape `{error: string}` que §1 declara como 'Siempre'. El parser Dart de errores recibe un body no-JSON. Los demás casos verificados están bien: las 20 filas del §3 están envueltas (18 archivos / 21 métodos — incluso broadcast y subscription-token, más que los '16/18' declarados); los early-returns de requireRoutePermission/extractTenantContextAuthed sí se estampan; no hay middleware global que intercepte.

**Fix sugerido:** En withContractHeader, envolver `await handler(...)` en try/catch que ante throw construya `NextResponse.json({error:'Internal error'}, {status:500})` y le estampe el header — un solo punto arregla los 21 métodos. Alternativa: try/catch de tope en los 4 handlers de chat + mover el try de reopen/subscription-token al inicio.
