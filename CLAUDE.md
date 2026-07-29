# BetterRoute — Planeamiento

Multi-tenant SaaS de optimización de rutas vehiculares. Next.js 16 (App
Router) + Bun + Postgres (Neon) + Drizzle + Redis (docker-compose, ioredis) +
VROOM solver + OSRM road network.

---

## Stack y arquitectura

- **Frontend:** Next.js 16.1.1 (Turbopack), React 19, Tailwind, shadcn/ui.
- **Backend:** Next.js API routes, Drizzle ORM, JWT cookies + SWR.
- **Optimización:** VROOM (HTTP, C++) — único solver soportado tras la
  remoción de PyVRP.
- **Mapas:** OSRM con peru-latest.
- **Patrón compound:** `Provider > State / Actions / Meta / Derived`.
- **Layout chain:** `AppShell > ThemeProvider > PermissionsProvider >
  CompanyProvider > LayoutProvider`.

---

## RBAC — autorización

**Único contrato tipado entre server y cliente** (ADR-0010). Lee
[`src/lib/auth/permissions/README.md`](./src/lib/auth/permissions/README.md)
antes de tocar cualquier botón mutativo o ruta API.

**Resumen del flujo cuando agregás una feature:**

1. Si necesita una entity nueva → `EntityType.X` en `permissions/types.ts`.
2. Servidor: `requireRoutePermission(request, EntityType.X, Action.Y)` al
   inicio del handler.
3. Cliente: `<Can perm="x:y">` alrededor del botón / `useCan("x:y")` para
   estado derivado.
4. Página: `<ProtectedPage requiredPermission="x:read">`.
5. Sidebar: agregar item con `requiredPermission: "x:read"`.

TypeScript rechaza permisos inválidos en compile time (template literal
`${EntityType}:${Action}`).

**Roles legacy** viven en `authorization.ts → ROLE_PERMISSIONS`. **Custom
roles** se crean por empresa en `/roles` y se almacenan en DB.

---

## Multi-tenancy

- Cliente envía `x-company-id` header como hint.
- Servidor valida contra JWT con `extractTenantContextAuthed(request, user)`
  en `src/lib/routing/route-helpers.ts`.
- Non-admin: JWT `companyId` es autoritativo; mismatch con header = 403.
- `ADMIN_SISTEMA` debe pasar header explícitamente para switchear workspace.

Para rutas con `companyId` en el path (ej. `/api/companies/[id]/...`):
`setupAuthContext` + `checkPermissionOrError`, y después comparar el
`companyId` del path contra el user — mismatch = 403, solo `ADMIN_SISTEMA`
lo salta. Patrón de referencia: `canAccessCompany` en
`src/app/api/companies/[id]/route.ts`.

---

## Compound component pattern

Lo invariante es la **forma del context**, no cómo se reparte en archivos: un
`Provider` que expone `state` / `actions` / `derived` / `meta`, la UI en
`<feature>-views.tsx` y un barrel `index.ts` por feature.

La descomposición en archivos se decide por **tamaño**, con una sola regla:

> **Archivo único por defecto. Cuando un context supera las ~400 líneas,
> convertilo en directorio y partilo por rol (state / actions / derived /
> effects).** El umbral aplica **por archivo de context**, no por feature: una
> feature puede tener uno chico y uno grande (`planificacion` tiene
> `historial-context.tsx` en un archivo y `context/` descompuesto).

**Caso simple — archivo único** (la mayoría). Ejemplo:
`src/components/fleets/fleets-context.tsx` (183 LOC).

```
src/components/<feature>/
├── <feature>-context.tsx   — provider + state + actions + derived + tipos
├── <feature>-views.tsx     — UI (lista, form, etc.)
└── index.ts                — barrel export
```

**Caso descompuesto — directorio**. Ejemplo real:
`src/components/planificacion/context/` (~1500 LOC repartidas).

```
src/components/<feature>/
├── context/
│   ├── provider.tsx        — orquesta state + actions + derived + meta
│   ├── use-state.ts        — todos los useState
│   ├── use-actions.ts      — handlers (mutations)
│   ├── use-derived.ts      — derivaciones puras
│   ├── use-effects.ts      — useEffect + data loaders
│   ├── types.ts
│   └── index.ts            — barrel del context
├── <feature>-context.tsx   — re-export (`export * from "./context"`), para
│                             que los imports existentes no cambien
├── <feature>-views.tsx
└── index.ts
```

**Por qué 400**: es donde se parte la distribución real del repo. De los 25
contexts actuales, 19 están por debajo (mediana ≈ 300) y leen bien como un
archivo; los 6 que están arriba son los que duelen, y entre 409 y 387 hay un
hueco limpio. Un context nuevo prácticamente nunca nace pasado el umbral — o
sea, **la respuesta por defecto es archivo único**.

> **Migración pendiente (no la hagas de oficio).** La regla es para código
> nuevo. Hoy solo `planificacion/context/` está descompuesto; estos 6 contexts
> superan el umbral y esperan una decisión explícita antes de migrarse
> (LOC medidas el 2026-07-28):
> `optimization/optimization-dashboard-context.tsx` (590),
> `chat/chat-context.tsx` (544), `monitoring/monitoring-context.tsx` (446),
> `users/users-context.tsx` (420), `configuracion/configuracion-context.tsx`
> (411), `zones/zones-context.tsx` (409). Si ya estás tocando uno a fondo,
> partirlo es bienvenido; no abras un refactor de los 6 sin acordarlo.

---

## Convenciones del proyecto

- **Pre-deploy stage**: sin usuarios reales todavía. Preferimos refactors
  agresivos a compat shims. Eliminar código deprecated en lugar de mantenerlo.
- **Organización**: cuando un módulo crece, convertir en directorio +
  `index.ts`. Borrar archivos muertos sin temor.
- **Imports**: barrels (`index.ts`) en cada feature module.
- **No comentarios redundantes**: solo comentarios cuando explican el "why",
  nunca el "what". Identificadores bien nombrados son la documentación
  primaria.

---

## Convenciones de React / hooks

El hilo común: mantener los hooks **estables y honestos**. La mayoría de los
problemas de `useExhaustiveDependencies` nacen de un effect que no debería
existir.

- **`useEffect` solo para sincronizar con sistemas externos** (MapLibre,
  timers, suscripciones, listeners del DOM). Antes de escribir uno:
  - Data fetching → `useApiData` / SWR (`src/hooks/use-api.ts`), nunca
    `fetch` dentro de `useEffect`.
  - Estado derivado de props/state → calcularlo en el render (o `useMemo`),
    no un effect que llama `setState`.
  - Reacción a una acción del usuario → en el handler del evento.
- **Data fetching compartido entre módulos** → hook de dominio sobre
  `useApiData` en `src/hooks/queries/` (barrel en `index.ts`), p. ej.
  `useDrivers`, `useVehicleList`, `useCompanyProfile`. Varios consumidores de la
  misma URL comparten una entrada de caché SWR; los context (`useVehicles`, …)
  consumen estos hooks en lugar de `fetch` en `useEffect`. Los tipos de dominio
  aún viven en sus features y se importan con `import type` (sin ciclo runtime).
- **`useExhaustiveDependencies` se arregla con `useCallback` / `useMemo`**, no
  con `biome-ignore`. Envolvé el closure con sus deps reales y listalo en el
  array del effect. Único caso donde `biome-ignore` es legítimo: effects
  `init-once` (montaje de una librería imperativa como MapLibre), con el
  comentario justo encima del `useEffect`.
- **Filas / cards clicables**: `<button type="button">` si no anidan controles
  interactivos; si anidan (Switch, dropdown, botón de borrar), usar
  `<div role="button" tabIndex={0} onKeyDown>` espejando el `onClick` en
  Enter/Espacio. `a11y/useSemanticElements` está desactivada a propósito por
  este patrón (Radix/shadcn).

---

## Optimización (VROOM)

- Único solver: VROOM. PyVRP fue removido por timeouts a escala.
- Tamaño típico: 1000+ órdenes por plan.
- Verifier (`src/lib/optimization/verifier/`) es independiente del solver y
  valida HARD/SOFT/INFO violations.
- Test harness en `src/tests/routing-quality/` corre 29 escenarios golden.
- Zonas: `createZoneBatches` en `src/lib/geo/zone-utils.ts` divide por zona
  para isolation hard.

---

## Comandos

- `bun dev` — dev server con Turbopack.
- `bun test` — todos los tests.
- `bun test src/tests/unit` — solo unit tests.
- `bun run tsc --noEmit` — type check.
- `bun run lint` — Biome (`biome check`).
- `bun run lint:summary` — resumen de lint agrupado por regla y severidad
  (útil cuando `biome check` trunca la salida a 20 diagnósticos).

Tests integration tocan DB real — requieren Postgres up.

Un hook `Stop` (`.claude/settings.json`) corre `biome check` al terminar cada
turno y bloquea si hay errores de lint/formato. Es la capa más barata y la más
ciega: el reparto completo entre hook, CI y revisión humana está en
"Definition of Done".

---

## Precedencia de fuentes (ante conflicto)

Cuando dos documentos se contradigan, gana en este orden:

**`docs/adr/` (el ADR más reciente) > `docs/CONTEXT.md` > este `CLAUDE.md` > el
resto de `docs/` > ⛔ `docs/archive/` (fuera de la jerarquía: nunca gana).**

Los ADR aceptados son la verdad canónica de las decisiones. Si un doc derivado
(CONTEXT, README, guías) contradice un ADR, el doc está *stale*: seguí el ADR y
corregí/anotá el doc.

**`docs/archive/` no es una fuente**, es un registro de lo que pasó. Nada de lo
que hay ahí gana un conflicto — ni siquiera contra el resto de `docs/` — y sus
"acciones recomendadas" no son trabajo pendiente. Si necesitás algo de ahí para
decidir, verificalo contra el código; si sigue vigente, su lugar es un doc
canónico. Ver [`docs/archive/README.md`](./docs/archive/README.md).

> **Drift reconciliado (2026-07-01, cerrado 2026-07-02):** los docs stale
> `SISTEMA_OPTIMIZACION.md` y `ESTADO_PROYECTO.md` fueron **eliminados** (la
> verdad vive en `CONTEXT.md` + ADRs); ADR-0009 (migraciones) y ADR-0010
> (RBAC tipado) fueron escritos.
>
> **Capas separadas (2026-07-28):** `docs/` mezclaba canónicos, snapshots
> históricos e issues cerrados al mismo nivel. Se creó `docs/archive/` y se
> movieron ahí las auditorías cerradas (`security-audit`, `cache-audit`,
> `preprod-audit-report`), el review aplicado
> (`pending-review-findings-2026-07-02`), el plan ejecutado
> (`AGENT-UPGRADE-PLAN`) y los 12 issues implementados (`issues/`).
> `docs/archive/routing-quality-findings.md` **se conserva** por la decisión del
> 2026-07-02 — documenta por qué existe el verifier — solo cambió de ruta.
> `docs/routing-quality-report.md` **no** se archivó: lo regenera
> `src/tests/routing-quality/run.ts` en esa ruta exacta. Y se corrigió la regla
> del compound pattern, que describía como universal una estructura que cumplía
> 1 de 21 features.

## Seam con la app móvil

El contrato con la app Flutter del conductor (`../test-mobile/aea`) vive en
**`docs/API-CONTRACT-MOBILE.md`** (canónico acá, espejo byte-idéntico en
`aea/docs/`). Tocar cualquiera de estos endpoints exige consultarlo y, si
cambia un shape, bump de `CONTRACT_VERSION` + actualizar el espejo:
`src/app/api/mobile/**`, `route-stops/[id]` (+`reopen`), `chat/**`,
`realtime/token`, `upload/presigned-url`, `auth/{login,refresh,logout}`.
Los campos "congelados" (§9 del contrato) crashean el parser Dart si
desaparecen; el rol `CONDUCTOR` debe conservar el capability set del §8.

## Migraciones (Drizzle)

- **`db:generate` + `db:migrate`. NUNCA `db:push`.** `db:push` rompe el historial
  versionado de migraciones (ADR-0009).
- Flujo tras cambiar un archivo de `src/db/schema/`:
  1. `bun run db:generate` — genera el SQL en `drizzle/`.
  2. Revisá el SQL generado.
  3. `bun run db:migrate` — lo aplica (requiere Postgres **arriba**).

## Capas de testing

| Capa | Comando | Necesita Postgres |
|---|---|---|
| Unit | `bun test src/tests/unit` | No |
| Integration | `bun test src/tests/integration/` | **Sí** (DB real) |
| Todos | `bun test` | Sí (incluye integration) |
| Golden routing-quality (29 escenarios) | `bun run src/tests/routing-quality/run.ts` | Según escenario |
| Routing integration | `bun run src/tests/routing-quality/integration-runner.ts` | Sí |

Los tests de integración tocan la DB real: si Postgres no está arriba, fallan por
conexión, no por lógica.

## Definition of Done (checklist pre-PR)

Hay **tres capas de verificación** y ninguna reemplaza a las otras. Saber cuál
cubre qué evita tanto el trabajo duplicado como el falso "ya pasó el hook,
está listo".

| Capa | Qué corre | Cuándo | Qué **no** ve |
|---|---|---|---|
| Hook `Stop` (`.claude/settings.json`) | `biome check` (lint + formato) | al terminar cada turno; bloquea si falla | tipos, tests, correctness, seguridad |
| CI (GitHub Actions, `.github/workflows/ci.yml`) | `tsc --noEmit`, `bun run lint`, `bun test src/tests/unit`, `scripts/check-route-guards.ts` | en el push / PR | invariantes de dominio, y todo lo que necesite servicios arriba (Postgres, VROOM/OSRM) mientras ese job no esté en el pipeline — **mirá el workflow, no lo asumas** |
| Humano / agente | checklist de invariantes de `docs/REVIEW-RUBRIC.md` | antes de dar la tarea por terminada | — |

El hook corre **solo `biome check`** — **NO corre `tsc`** (excluido a propósito
por lento). Antes de dar una tarea por terminada:

1. `bun run tsc --noEmit` — type check. Corrélo local: enterarte en CI es el
   ciclo lento.
2. `bun run lint` — biome (o dejá que el hook lo haga).
3. Tests de la capa afectada. Unit corre en CI; **integration y el harness
   golden de routing-quality necesitan servicios arriba** (Postgres, VROOM/OSRM),
   así que verificá si el pipeline los incluye — si no, corrélos vos. Ver
   "Capas de testing".
4. **Checklist de invariantes** → [`docs/REVIEW-RUBRIC.md`](./docs/REVIEW-RUBRIC.md)
   (aislamiento tenant, RBAC, estados terminales, evidence, history append-only).
   **Esto sigue siendo responsabilidad humana**: ni biome ni CI verifican
   correctness ni seguridad de dominio. El único invariante mecanizado es el
   guard de tenancy/RBAC sobre rutas nuevas
   (`scripts/check-route-guards.ts`, spec en
   [`docs/specs/hook-tenancy-gate.spec.md`](./docs/specs/hook-tenancy-gate.spec.md));
   todo lo demás de la rúbrica se lee y se aplica a mano.
