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

Cada feature module sigue:

```
src/components/<feature>/
├── <feature>-context/
│   ├── provider.tsx       — orquesta state + actions + derived + meta
│   ├── use-state.ts       — todos los useState
│   ├── use-actions.ts     — handlers (mutations)
│   ├── use-derived.ts     — derivaciones puras
│   ├── use-effects.ts     — useEffect + data loaders
│   └── types.ts
├── <feature>-views.tsx     — UI (lista, form, etc.)
└── index.ts                — barrel export
```

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
turno y bloquea si hay errores de lint/formato.

---

## Precedencia de fuentes (ante conflicto)

Cuando dos documentos se contradigan, gana en este orden:

**`docs/adr/` (el ADR más reciente) > `docs/CONTEXT.md` > este `CLAUDE.md` > el
resto de `docs/`.**

Los ADR aceptados son la verdad canónica de las decisiones. Si un doc derivado
(CONTEXT, README, guías) contradice un ADR, el doc está *stale*: seguí el ADR y
corregí/anotá el doc.

> **Drift reconciliado (2026-07-01, cerrado 2026-07-02):** los docs stale
> `SISTEMA_OPTIMIZACION.md` y `ESTADO_PROYECTO.md` fueron **eliminados** (la
> verdad vive en `CONTEXT.md` + ADRs); ADR-0009 (migraciones) y ADR-0010
> (RBAC tipado) fueron escritos. `docs/routing-quality-findings.md` queda
> como snapshot histórico con banner (decidido 2026-07-02: se conserva —
> documenta por qué existe el verifier).

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

El hook `Stop` corre **solo `biome check`** (estilo) — **NO corre `tsc`**. Antes
de dar una tarea por terminada, además del hook:

1. `bun run tsc --noEmit` — type check (el hook lo excluye a propósito por lento).
2. `bun run lint` — biome (o dejá que el hook lo haga).
3. Tests de la capa afectada (unit / integration).
4. **Checklist de invariantes** → [`docs/REVIEW-RUBRIC.md`](./docs/REVIEW-RUBRIC.md)
   (aislamiento tenant, RBAC, estados terminales, evidence, history append-only).
   El hook de biome **no** verifica correctness ni seguridad.
