# Spec — Hook determinista: gate de tenancy/RBAC en rutas API

> **v1 — 2026-07-01 (sesión SOTA). Implementa: Opus.** Convierte la
> invariante de seguridad #1 (aislamiento de tenant) en un gate automático.
> Hoy el único gate del repo es `biome check` (estilo); este hook hace
> **fallar el turno** cuando aparece una `route.ts` sin los guards
> canónicos. Diseñado con la allowlist real del código (extraída en la
> auditoría del seam) para que no dé falsos positivos el día uno.
>
> **Calibración 2026-07-02:** el smoke inicial sobre las ~60 rutas dio 18
> falsos positivos — todos verificados a mano como rutas guardeadas por
> wrappers equivalentes del proyecto, no huecos. Se extendieron los tokens
> (§1) para reconocer esos wrappers (equivalencia verificada leyendo
> `route-helpers.ts`, `api-middleware.ts` y `tenant-aware.ts`) y se
> agregaron 6 entradas a la allowlist (§3) para las rutas cuyo guard es
> inline y grep-invisible o deliberadamente sin RBAC.

## 1. Qué detecta

Para cada archivo `src/app/api/**/route.ts` **nuevo o modificado**:

- **PASA** si el contenido contiene al menos un token **RBAC** y al menos un
  token de **tenancy** (tablas abajo).
- **PASA** si contiene un **wrapper completo** (tabla abajo).
- **PASA** si su path está en la allowlist (§3).
- **FALLA** en cualquier otro caso, con exit code 2 y el mensaje de §4.

Tokens RBAC (uno requerido):

| Token | Por qué equivale |
|---|---|
| `requireRoutePermission(` | Patrón canónico (`api-middleware.ts`): JWT + permiso merged (matriz legacy + custom roles DB). |
| `checkPermissionOrError(` | Misma lógica merged que `requireRoutePermission`, en `route-helpers.ts`; se usa junto a `setupAuthContext`. |

Tokens de tenancy (uno requerido):

| Token | Por qué equivale |
|---|---|
| `extractTenantContextAuthed(` | Patrón canónico (`route-helpers.ts`): JWT autoritativo, header solo hint, mismatch = 403. |
| `assertSameTenant(` | Para rutas con `companyId` en el path. |
| `setupAuthContext(` | Wrapper (`route-helpers.ts`) que llama `extractTenantContextAuthed` internamente y setea el tenant context. |
| `withTenantFilter(` | Scoping Drizzle por `companyId` (`src/db/tenant-aware.ts`); cae en `requireTenantContext()` si no le pasan companyId. |

Wrappers completos (suficientes por sí solos):

| Token | Por qué equivale |
|---|---|
| `withAuthAndAudit(` | Middleware (`api-middleware.ts`) = `withAuth` (JWT) + `requirePermission` (RBAC) + audit log. Para recursos admin globales sin datos tenant (hoy: `admin/cache`). |

**`requireRoutePermission(` solo NO pasa** — esa asimetría es deliberada:
una ruta con RBAC pero sin derivación de tenant es exactamente el bug que el
gate existe para atrapar. Rutas legítimas con chequeo de tenant/self inline
(no tokenizable por grep) van a la allowlist con justificación, no a un
token más débil.

Deliberadamente simple y literal (grep, no AST): cero falsos negativos por
parsing, y el patrón canónico es textual en este repo. **Non-goal:** validar
que cada query Drizzle filtre por `companyId` — eso es trabajo del subagente
auditor de tenancy (rúbrica §1), no de un grep.

## 2. Implementación

- Script **Bun** cross-platform: `scripts/check-route-guards.ts`.
  - Modo hook: recibe paths por stdin/argv; sin args, escanea
    `git diff --name-only --diff-filter=ACMR HEAD -- 'src/app/api'` +
    untracked (`git ls-files --others --exclude-standard`).
  - Salida: silencioso si pasa; a stderr el reporte de §4 si falla.
- Cableado en `.claude/settings.json`:
  - **`PostToolUse`** sobre `Write|Edit` cuyo `file_path` matchee
    `src/app/api/**/route.ts` → feedback inmediato al agente.
  - **`Stop`** (junto al biome existente) sobre el diff completo → red de
    seguridad al final del turno.
- Exit codes: `0` pasa · `2` bloquea (el harness lo muestra al agente).

## 3. Allowlist (`scripts/route-guards-allowlist.json`)

Excepciones **deliberadas**, verificadas contra el código el 2026-07-01
(`docs/API-CONTRACT-MOBILE.md §8` + rutas públicas/auth) y ampliadas en la
calibración del 2026-07-02:

```jsonc
[
  // — v1 (2026-07-01) —
  "src/app/api/auth/",                       // login/refresh/logout/me/sessions: pre-RBAC por naturaleza
  "src/app/api/public/",                     // tracking público: sin auth by design
  "src/app/api/realtime/token/route.ts",     // authz real = derivación de canales por rol
  "src/app/api/upload/presigned-url/route.ts", // solo auth; companyId del JWT (ignora header)

  // — calibración 2026-07-02: deliberadamente sin RBAC —
  "src/app/api/health/route.ts",             // health check público para load balancers/monitoring: sin auth by design
  "src/app/api/onboarding/setup/route.ts",   // bootstrap one-shot pre-tenant: JWT + ADMIN_SISTEMA inline, 409 si ya existe empresa
  "src/app/api/playground/route.ts",         // dev-only: NEXT_PUBLIC_ENABLE_PLAYGROUND + ADMIN_SISTEMA + extractTenantContextAuthed, sin entity RBAC

  // — calibración 2026-07-02: guard real pero inline (grep-invisible) —
  "src/app/api/optimization/engines/route.ts",   // catálogo estático del solver sin datos tenant; RBAC vía requireRoutePermission
  "src/app/api/users/[id]/sessions/route.ts",    // self-or-admin (authorize) + guard cross-tenant inline por query scoped a companyId
  "src/app/api/companies/[id]/csv-profile-schema/route.ts" // requireRoutePermission + validación inline del companyId del path (ADMIN o misma empresa)
]
```

(Prefijo = subtree completo; path exacto = solo ese archivo. `GET
mobile/driver/location` es self-only sin RBAC, pero su archivo contiene el
`requireRoutePermission` del POST, así que pasa sin excepción.)

Las tres entradas "guard real pero inline" son candidatas a salir de la
allowlist si algún refactor las migra a los helpers canónicos
(`assertSameTenant` para las que reciben `companyId`/`userId` por path).

**Regla:** agregar una entrada a la allowlist es un cambio de seguridad —
requiere justificación en el PR y anotarla también en el contrato §8 si es
del seam. El hook NO se apaga; se agrega la excepción explícita.

## 4. Mensaje de fallo (para que el agente se auto-corrija)

```
✗ route-guards: src/app/api/foo/route.ts no tiene guards de tenancy/RBAC.
  Toda ruta API necesita:
    1. requireRoutePermission(request, EntityType.X, Action.Y)
    2. extractTenantContextAuthed(request, user)  (o assertSameTenant si el
       companyId viene en el path)
  Patrón completo: docs/REVIEW-RUBRIC.md §1-2 y CLAUDE.md §RBAC.
  ¿Excepción deliberada? Agregala a scripts/route-guards-allowlist.json y
  justificala (ver docs/specs/hook-tenancy-gate.spec.md §3).
```

## 5. Auto-tests del script (Opus, junto a la implementación)

1. Ruta con ambos guards → pasa.
2. Ruta con `requireRoutePermission` pero sin tenant helper → falla.
3. Ruta sin nada → falla; misma ruta agregada a la allowlist → pasa.
4. Prefijo de allowlist cubre subtree (`auth/refresh/route.ts`).
5. Las ~60 rutas actuales del repo pasan en verde (smoke: correrlo sobre
   `git ls-files 'src/app/api/**/route.ts'` completo debe dar 0 fallos; si
   alguno falla, es un hallazgo real a arreglar ANTES de cablear el hook,
   no a allowlistear).

Calibración 2026-07-02 (tokens nuevos de §1):

6. `setupAuthContext` + `checkPermissionOrError` → pasa (wrapper (a)).
7. `setupAuthContext` solo (tenant sin RBAC) → falla.
8. `checkPermissionOrError` solo (RBAC sin tenant) → falla.
9. `requireRoutePermission` + `withTenantFilter` → pasa (patrón (b)).
10. `withTenantFilter` solo → falla.
11. `withAuthAndAudit` solo → pasa (wrapper completo (c)).
