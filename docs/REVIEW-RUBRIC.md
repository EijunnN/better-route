# BetterRoute — Rúbrica de revisión (correctness y seguridad)

> Mecaniza las **8 invariantes globales** de `docs/CONTEXT.md` en checks
> accionables sobre un diff. Se consume a mano, desde los subagentes auditores
> (`tenancy-invariant-auditor`, `verifier-solver-sync-auditor`,
> `realtime-channel-auth-auditor`) y desde `docs/prompts/README.md §1`.
>
> **Esta rúbrica es la capa humana de la Definition of Done.** Los gates
> automáticos (`biome check` en el hook `Stop`; `tsc`, lint, unit tests y
> `scripts/check-route-guards.ts` en CI) no ven nada de lo que hay acá salvo el
> guard de tenancy/RBAC sobre rutas nuevas. Aislamiento multi-tenant real, RBAC
> de punta a punta, máquinas de estado, evidence y history append-only se
> verifican leyendo.

## Cómo usarla

Para cada archivo tocado en el diff, recorré las reglas aplicables. Una regla
"falla" si el cambio la viola **o** si no podés probar que la respeta. Ante duda,
**falla** (fail-closed).

---

## 1. Aislamiento multi-tenant (invariantes #1, #2, #3)

**Regla:** toda query a una tabla principal lleva `WHERE companyId = $tenant`. El
`companyId` sale de `extractTenantContextAuthed(request, user)`
(`src/lib/routing/route-helpers.ts`), **nunca** del header `x-company-id` crudo.

- [ ] ¿La ruta API nueva/modificada llama a `extractTenantContextAuthed`
      (directo o vía `setupAuthContext`) antes de tocar la DB? Si el `companyId`
      viene en el path, ¿lo compara contra el user con 403 en mismatch (patrón
      `canAccessCompany` de `src/app/api/companies/[id]/route.ts`)?
- [ ] ¿Toda query Drizzle filtra por `companyId`? **Cuidado con**
      `withTenantFilter` (`src/db/tenant-aware.ts`): para tablas **sin** columna
      `companyId` devuelve las conditions **SIN filtro** → hay que pasar el tenant
      explícito. No confíes en `AsyncLocalStorage` (marcado no-confiable en App
      Router).
- [ ] ¿`ADMIN_SISTEMA` es el único camino que acepta un `x-company-id` distinto al
      del JWT?
- [ ] Si la ruta **no** usa los helpers a propósito: ¿está en la allowlist de
      excepciones deliberadas (`docs/API-CONTRACT-MOBILE.md §8`: `GET
      mobile/driver/location` self-only, `GET realtime/token`, `GET
      upload/presigned-url`)? Cualquier excepción nueva se agrega a la
      allowlist del hook (ver `docs/specs/hook-tenancy-gate.spec.md`), nunca
      se deja implícita.

**Falla:** `db.select().from(orders)` sin `.where(eq(orders.companyId, tenant))`.
**Pasa:** el filtro de tenant está presente y el tenant proviene del helper canónico.

## 2. RBAC (contrato tipado)

**Regla:** toda mutación/lectura protegida arranca con el check de permiso y el
flujo de 5 pasos está completo.

- [ ] Servidor: `requireRoutePermission(request, EntityType.X, Action.Y)` al inicio
      del handler (patrón recomendado; evitá el legacy `checkPermissionOrError`).
- [ ] Cliente: `<Can perm="x:y">` / `useCan("x:y")` alrededor del control.
- [ ] Página: `<ProtectedPage requiredPermission="x:read">`.
- [ ] Sidebar: item con `requiredPermission`.
- [ ] Entity nueva → `EntityType.X` agregado en `permissions/types.ts`.

- [ ] Si el cambio toca `ROLE_PERMISSIONS` o roles custom: ¿`CONDUCTOR`
      conserva el **capability set del móvil** (`ROUTE:read`,
      `ROUTE_STOP:read+update`, `ORDER:read`, `CHAT:read+create`)? Quitarle
      uno rompe la app del conductor **en silencio** (contrato §8).

**Falla:** una `route.ts` mutativa sin `requireRoutePermission`; un botón sin `<Can>`.

## 3. Máquinas de estado / terminales (invariante #6)

**Regla:** no se reabren terminales por el camino normal. **Stops**:
`COMPLETED` es el único terminal; `FAILED → PENDING` es legal SOLO vía el
reopen del operador (no existe `SKIPPED`). **Órdenes**: `CANCELLED` es
terminal definitivo (ADR-0006); `FAILED` es reactivable (revisita);
`COMPLETED` solo se revierte por `order:revert`. **Jobs**:
`COMPLETED`/`FAILED`/`CANCELLED` no transicionan.

- [ ] ¿La transición pasa por `STOP_STATUS_TRANSITIONS` / los grafos
      `ALLOWED_*_TRANSITIONS` (`src/lib/workflow/`)?
- [ ] ¿Se agregó alguna arista que resucite un terminal (p. ej. `CANCELLED → *`)?
      Eso viola ADR-0005.
- [ ] El revert privilegiado (`order:revert`) está separado del grafo normal.

## 4. Evidence falla la operación (invariante #7)

- [ ] ¿La subida a R2 que falla **aborta** la operación en vez de silenciarla?

## 5. History append-only (invariante #8)

- [ ] ¿`route_stop_history`, `reassignments_history`, `output_history` y
      `delivery_visits` se **insertan**, nunca se editan/borran?

## 6. Zonas RESTRICTED (invariante #5)

- [ ] ¿`getZoneForOrder` evalúa `RESTRICTED` antes que `DELIVERY`?
- [ ] ¿Las órdenes en zona `RESTRICTED` se excluyen **antes** de invocar VROOM?

## 7. VROOM único solver (invariante #4)

- [ ] ¿El código nuevo referencia PyVRP / `IOptimizer` / `OptimizerFactory`?
      Eso es un bug (ADR-0001).

---

## Seams de alto riesgo (chequeos extra que biome no ve)

### Verifier ↔ Solver (sincronía semántica)
Si tocaste `src/lib/optimization/vroom-optimizer.ts` o
`src/lib/optimization/verifier/*`: ¿los cambios mantienen la semántica compartida
(tolerancias tipo `FLEX_TOLERANCE_SEC`, `service-start = arrival + waiting`,
capacity vectors por company profile)? El fallo es **silencioso** — solo lo atrapan
los 29 escenarios golden, y ni siquiera todos. Ver
`docs/optimization/SEMANTICS.md`: contrato completo + registro de asimetrías
A1–A16 (con su estado: resuelta / aceptada / [DOC]) + reglas al tocar cada lado.

### Autorización de canales realtime
Si tocaste `src/lib/realtime/channels.ts` / `centrifugo.ts`: ¿`computeAllowedChannels`
da a cada rol solo sus canales per-tenant? ¿El JWT de Centrifugo usa su HMAC
**separado** del session JWT? Un error suscribe cross-tenant o filtra el secret.

### Confirm de plan (mayor blast-radius)
Si tocaste `src/app/api/optimization/jobs/[id]/confirm/route.ts` (mutación masiva
orders + stops + métricas + lock): ¿es transaccional y deja estado consistente ante
error? Ver `docs/specs/confirm-plan.md`.

### Contrato del seam móvil
Si tocaste `src/app/api/mobile/**`, `route-stops/[id]` (+`reopen`), `chat/**`,
`realtime/*`, `upload/presigned-url` o `auth/{login,refresh,logout}`:
- [ ] ¿Consultaste `docs/API-CONTRACT-MOBILE.md`? ¿Los **campos congelados**
      (§9) siguen presentes con su tipo (el parser Dart crashea si faltan)?
- [ ] ¿El envelope del endpoint no cambió de familia (§1)?
- [ ] En el PATCH de stops: ¿se preservó la **idempotencia terminal** (re-PATCH
      del mismo status → 200 sin duplicar Visits) y la semántica parcial
      (campos omitidos no se pisan — FIX-3)?
- [ ] Si cambió un shape: ¿bump de `CONTRACT_VERSION`, fixtures + schemas
      actualizados, y espejo `aea/docs/API-CONTRACT-MOBILE.md` re-copiado?
