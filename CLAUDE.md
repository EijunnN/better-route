# BetterRoute — Planeamiento

Multi-tenant SaaS de optimización de rutas vehiculares. Next.js 16 (App
Router) + Bun + Postgres (Neon) + Drizzle + Upstash Redis + VROOM solver +
OSRM road network.

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

**Único contrato tipado entre server y cliente.** Lee
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

Para rutas con `companyId` en el path (ej. `/api/companies/[id]/...`), usar
el patrón `assertSameTenant(user, companyIdFromPath)` que aparece en
`workflow-states/route.ts`.

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

## Optimización (VROOM)

- Único solver: VROOM. PyVRP fue removido por timeouts a escala.
- Tamaño típico: 1000+ órdenes por plan.
- Verifier (`src/lib/optimization/verifier/`) es independiente del solver y
  valida HARD/SOFT/INFO violations.
- Test harness en `src/tests/routing-quality/` corre 28 escenarios golden.
- Zonas: `createZoneBatches` en `src/lib/geo/zone-utils.ts` divide por zona
  para isolation hard.

---

## Comandos

- `bun dev` — dev server con Turbopack.
- `bun test` — todos los tests.
- `bun test src/tests/unit` — solo unit tests.
- `bun run tsc --noEmit` — type check.
- `bun run lint` — ESLint.

Tests integration tocan DB real — requieren Postgres up.
