# BetterRoute — Arquitectura (mapa de orientación)

> Este documento **orienta y cita**: te dice dónde vive cada cosa y qué doc
> es canónico para cada tema. No duplica reglas — si buscás semántica de
> dominio, andá a `docs/CONTEXT.md`; si buscás una decisión con motivación,
> a `docs/adr/`. Precedencia ante conflicto (de `CLAUDE.md`):
> **ADR más reciente > CONTEXT.md > CLAUDE.md > resto de docs.**

## Capas

```
┌────────────────────────────────────────────────────────────────┐
│ Cliente web (Next.js 16 App Router, React 19, Tailwind/shadcn) │
│   src/app/(pages)  +  src/components/<feature>/                │
│   SWR via hooks de dominio (src/hooks/queries/)                │
├────────────────────────────────────────────────────────────────┤
│ API routes (src/app/api/**)                                    │
│   thin wrappers: RBAC (requireRoutePermission) + tenancy       │
│   (extractTenantContextAuthed) + delegación a lib de dominio   │
├────────────────────────────────────────────────────────────────┤
│ Lib de dominio (src/lib/**)                                    │
│   optimization/ routing/ orders/ auth/ chat/ realtime/ geo/    │
│   alerts/ csv/ export/ workflow/ eta/ storage/ infra/          │
├────────────────────────────────────────────────────────────────┤
│ Persistencia e infra                                           │
│   Drizzle ORM → Postgres (src/db/schema/, migraciones en       │
│   drizzle/ — ADR-0009) · Redis via ioredis (src/lib/infra/)    │
└────────────────────────────────────────────────────────────────┘
        │                │                 │              │
        ▼                ▼                 ▼              ▼
   VROOM (HTTP)     OSRM (red vial    Centrifugo      R2 (evidencia,
   único solver,    peru-latest)      (WebSocket) +   presigned URLs,
   ADR-0001                           OneSignal push  src/lib/storage/)
                                      (ADR-0007)
```

- **App móvil Flutter** (`../test-mobile/aea`): consume `src/app/api/mobile/**`
  y endpoints compartidos. Ver "Seam móvil" abajo.
- **Cliente final**: tracking público sin auth en `src/app/tracking/[token]/`.

## Tenancy y autorización (transversal)

- Multi-tenant en el **código**, single-tenant por VPS en el **deployment**
  (ADR-0008). Toda fila lleva `companyId`.
- Derivación de tenant: `extractTenantContextAuthed(request, user)` en
  `src/lib/routing/route-helpers.ts`. JWT autoritativo para non-admins;
  solo `ADMIN_SISTEMA` switchea workspace vía header `x-company-id`.
- RBAC tipado compartido server/cliente (ADR-0010): contrato y flujo de 5
  pasos en `src/lib/auth/permissions/README.md`; catálogo en
  `docs/ROLES-PERMISSIONS.md`. Checklist de revisión: `docs/REVIEW-RUBRIC.md`.

## Bounded contexts

Definidos y mantenidos en **`docs/CONTEXT.md` §Bounded Contexts** (canónico).
Índice rápido con su código:

| Contexto | Código principal |
|---|---|
| 1. Identity & Tenancy | `src/lib/auth/`, `src/components/{auth,roles,users}/` |
| 2. Master Data | `src/components/{vehicles,fleets,zones,...}/`, `src/lib/{validations,workflow,custom-fields}/` |
| 3. Order Management | `src/lib/{orders,csv}/`, `src/components/orders/` |
| 4. Plan Optimization | `src/lib/optimization/` (ver su README), `src/lib/geo/`, `src/components/{optimization,planificacion}/` |
| 5. Route Execution | `src/lib/routing/` (ver su README), `src/lib/storage/r2.ts`, `src/components/monitoring/`, app móvil |
| 6. Public Tracking | `src/app/tracking/[token]/`, `src/app/api/public/tracking/` |
| 7. Realtime & Alerts | `src/lib/{realtime,chat,alerts}/`, `src/lib/notifications/onesignal.ts` |
| 8. Reporting & Output | `src/lib/export/`, `src/lib/routing/output-generator.ts` |

## Frontend: layout chain y compound pattern

Convenciones canónicas en `CLAUDE.md`:

- Layout chain: `AppShell > ThemeProvider > PermissionsProvider >
  CompanyProvider > LayoutProvider`.
- Cada feature module sigue el compound pattern
  `Provider > State / Actions / Meta / Derived` con la estructura
  `<feature>-context/{provider,use-state,use-actions,use-derived,use-effects,types}`
  + `<feature>-views.tsx` + barrel `index.ts`.
- Data fetching compartido → hooks de dominio sobre `useApiData` en
  `src/hooks/queries/`; nunca `fetch` dentro de `useEffect`.

## Pipeline de optimización (resumen de una línea)

`optimization-job/` (lifecycle, ADR-0004) orquesta
`optimization-runner/run.ts` → stages (load-inputs → solve-batches vía
VROOM → assign-drivers → aggregate-plan) → `verifier/` ⇒ `VerifiedPlan`
persistido en `optimization_jobs.result`. Shapes canónicos en
`solved-plan/` (ADR-0002); semántica solver↔verifier en
**`docs/optimization/SEMANTICS.md`**. Detalle: `src/lib/optimization/README.md`.

## Seam móvil

El contrato con la app Flutter del conductor es
**`docs/API-CONTRACT-MOBILE.md`** (canónico acá, espejo byte-idéntico en
`aea/docs/`). Superficie: `src/app/api/mobile/**`, `route-stops/[id]`
(+`reopen`), `chat/**`, `realtime/token`, `upload/presigned-url`,
`auth/{login,refresh,logout}`. Cambiar un shape ⇒ bump de
`CONTRACT_VERSION` + actualizar el espejo en el mismo cambio (§10 del
contrato). Campos congelados en §9; capability set de `CONDUCTOR` en §8.

## Docs canónicos (a dónde ir según el tema)

| Tema | Doc |
|---|---|
| Vocabulario, bounded contexts, invariantes globales | `docs/CONTEXT.md` |
| Decisiones con motivación (12 ADRs) | `docs/adr/` |
| Semántica solver ↔ verifier | `docs/optimization/SEMANTICS.md` |
| Contrato móvil | `docs/API-CONTRACT-MOBILE.md` |
| Rúbrica de revisión (tenancy, RBAC, terminales, evidence, history) | `docs/REVIEW-RUBRIC.md` |
| RBAC: contrato tipado y flujo | `src/lib/auth/permissions/README.md` |
| Roles y permisos (catálogo) | `docs/ROLES-PERMISSIONS.md` |
| Modelo de datos (tablas y relaciones) | `docs/DATA-MODEL.md` |
| Comandos, testing, Definition of Done | `CLAUDE.md` |
| Prompts reutilizables | `docs/prompts/README.md` |
