# Spec — Hook determinista: gate de tenancy/RBAC en rutas API

> **Spec normativa de `scripts/check-route-guards.ts`.** Convierte la
> invariante de seguridad #1 (aislamiento de tenant) en un gate automático:
> hace **fallar el turno** cuando aparece una `route.ts` sin los guards
> canónicos. Es el **único** invariante de `docs/REVIEW-RUBRIC.md` mecanizado
> — el resto de la rúbrica se lee y se aplica a mano (ver `CLAUDE.md →
> Definition of Done`).
>
> Esta spec es **contrato ejecutable**: describe lo que el script hace hoy. Si
> encontrás una divergencia entre la spec y `scripts/check-route-guards.ts`,
> el script es la verdad y la spec está rota — arreglala.
>
> **Historial de calibración.**
> - *2026-07-01 (v1):* diseñada con la allowlist real del código, para que no
>   diera falsos positivos el día uno.
> - *2026-07-02:* el smoke sobre las ~60 rutas dio 18 falsos positivos, todos
>   verificados a mano como rutas guardeadas por wrappers equivalentes. Se
>   extendieron los tokens (§1) y se agregaron 6 entradas a la allowlist (§3).
> - *2026-07-28:* el wrapper completo `withAuthAndAudit` **fue eliminado del
>   código** junto al resto del middleware wrapper (`withAuth`,
>   `withPermission`, `withAuditLog`, `optionalRoutePermission`,
>   `checkPermissions`, `getUserFromRequest` y el subsistema de confirmación de
>   acción sensible): servía a una sola ruta mientras ~100 usaban el patrón
>   manual, y se consolidó en el manual. `src/lib/infra/api-middleware.ts` pasó
>   de 358 a 69 LOC y hoy exporta **solo** `requireRoutePermission`. El script
>   perdió `COMPLETE_WRAPPER_TOKENS` y su short-circuit; `admin/cache` migró al
>   patrón manual y entró a la allowlist. Ver §1, §3 y §5.

## 1. Qué detecta

Para cada archivo `src/app/api/**/route.ts` **nuevo o modificado**:

- **PASA** si el contenido contiene al menos un token **RBAC** y al menos un
  token de **tenancy** (tablas abajo).
- **PASA** si su path está en la allowlist (§3).
- **FALLA** en cualquier otro caso, con exit code 2 y el mensaje de §4.

Son **dos condiciones, no tres**: `hasGuards()` exige las dos mitades y no
tiene short-circuit.

Tokens RBAC (uno requerido):

| Token | Por qué equivale |
|---|---|
| `requireRoutePermission(` | Patrón canónico (`api-middleware.ts`): JWT + permiso merged (matriz legacy + custom roles DB). |
| `checkPermissionOrError(` | Misma lógica merged que `requireRoutePermission`, en `route-helpers.ts`; se usa junto a `setupAuthContext`. |

Tokens de tenancy (uno requerido):

| Token | Por qué equivale |
|---|---|
| `extractTenantContextAuthed(` | Patrón canónico (`route-helpers.ts`): JWT autoritativo, header solo hint, mismatch = 403. |
| `assertSameTenant(` | Pensado para rutas con `companyId` en el path. ⚠️ **El script acepta el token pero el helper no existe en `src/lib/`** — hoy esas rutas usan validación inline y van a la allowlist (§3). Sacar el token o escribir el helper es una decisión abierta; mientras tanto no lo cites como si existiera. |
| `setupAuthContext(` | Wrapper (`route-helpers.ts`) que llama `extractTenantContextAuthed` internamente y setea el tenant context. |
| `withTenantFilter(` | Scoping Drizzle por `companyId` (`src/db/tenant-aware.ts`); cae en `requireTenantContext()` si no le pasan companyId. |

**No hay wrappers completos.** Existió uno (`withAuthAndAudit`, = JWT + RBAC +
audit log) para recursos admin globales sin datos tenant. Se eliminó el
2026-07-28 junto al resto del middleware wrapper, y con él
`COMPLETE_WRAPPER_TOKENS` y la rama de short-circuit de `hasGuards()`. Hoy
`src/lib/infra/api-middleware.ts` exporta un solo símbolo público,
`requireRoutePermission`. **Un token de wrapper nuevo es un agujero potencial**:
haría pasar una ruta sin que el grep vea la mitad de tenancy. Si aparece un
wrapper legítimo en el futuro, la vía correcta es la allowlist con
justificación, no reintroducir el short-circuit (el test
`"withAuthAndAudit (wrapper borrado) ya no cuenta como guard"` existe
justamente para trabar esa regresión).

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
- También corre en **CI** (`.github/workflows/ci.yml`), de modo que el gate
  aplica a los commits que no pasaron por el harness de agentes. Las tres
  invocaciones comparten script, allowlist y exit codes: no hay una versión
  "de CI" distinta.
- Exit codes: `0` pasa · `2` bloquea (el harness lo muestra al agente).

## 3. Allowlist (`scripts/route-guards-allowlist.json`)

**Formato: objeto JSON `path → justificación`, no un array.** `loadAllowlist()`
hace `Object.keys(JSON.parse(...))`, así que la justificación vive *en el
archivo* y no en un comentario — un array de strings rompería el gate en
silencio (las claves pasarían a ser `"0"`, `"1"`, … y ninguna ruta quedaría
allowlisteada). Es JSON estricto: sin comentarios ni coma final.

Excepciones **deliberadas**, verificadas contra el código el 2026-07-01
(`docs/API-CONTRACT-MOBILE.md §8` + rutas públicas/auth), ampliadas en la
calibración del 2026-07-02 y en la del 2026-07-28 (`admin/cache`):

```json
{
  "src/app/api/auth/": "login/refresh/logout/me/sessions: pre-RBAC por naturaleza",
  "src/app/api/public/": "tracking público: sin auth by design",
  "src/app/api/realtime/token/route.ts": "authz real = derivación de canales por rol",
  "src/app/api/upload/presigned-url/route.ts": "solo auth; companyId del JWT (ignora header)",
  "src/app/api/health/route.ts": "health check público para load balancers/monitoring: sin auth by design",
  "src/app/api/onboarding/setup/route.ts": "bootstrap one-shot pre-tenant: JWT + ADMIN_SISTEMA inline, 409 si ya existe empresa",
  "src/app/api/playground/route.ts": "dev-only: NEXT_PUBLIC_ENABLE_PLAYGROUND + ADMIN_SISTEMA + extractTenantContextAuthed, sin entity RBAC",
  "src/app/api/optimization/engines/route.ts": "catálogo estático del solver sin datos tenant; RBAC vía requireRoutePermission",
  "src/app/api/admin/cache/route.ts": "cache Redis global (no particionada por tenant); RBAC vía requireRoutePermission sobre cache:* (solo ADMIN_SISTEMA lo tiene) + isAdmin re-check en DELETE",
  "src/app/api/users/[id]/sessions/route.ts": "self-or-admin (authorize) + guard cross-tenant inline por query scoped a companyId",
  "src/app/api/companies/[id]/csv-profile-schema/route.ts": "requireRoutePermission + validación inline del companyId del path (ADMIN o misma empresa)"
}
```

(Prefijo = subtree completo; path exacto = solo ese archivo. `GET
mobile/driver/location` es self-only sin RBAC, pero su archivo contiene el
`requireRoutePermission` del POST, así que pasa sin excepción.)

**Sobre `admin/cache` (entrada del 2026-07-28).** Antes pasaba por el wrapper
`withAuthAndAudit`; al eliminarse el wrapper migró al patrón manual y necesitó
excepción explícita. **Tiene RBAC y no tiene tenancy, a propósito**: la caché
Redis es global, no está particionada por empresa, así que no hay `companyId`
que derivar. El permiso `cache:*` lo tiene solo `ADMIN_SISTEMA` (vía wildcard) y
el DELETE hace un re-check de `isAdmin`. Es el caso que el wrapper resolvía y
que ahora resuelve la allowlist — un renglón visible en vez de un token que
apagaba medio gate.

Las tres entradas "guard real pero inline"
(`optimization/engines`, `users/[id]/sessions`,
`companies/[id]/csv-profile-schema`) son candidatas a salir de la allowlist si
un refactor las migra a helpers canónicos — pero ojo: `assertSameTenant` es hoy
un token sin implementación (§1), así que ese refactor implica escribir el
helper primero.

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

⚠️ El mensaje nombra `assertSameTenant`, que hoy **no existe** como helper
(§1). Si se decide no escribirlo, hay que corregir también esta línea de
`failureReport()` — el test `"failureReport usa el mensaje de la spec §4"` la
fija, así que spec, script y test se mueven juntos.

## 5. Auto-tests del script

Viven en `src/tests/unit/route-guards/check-route-guards.test.ts` (unit, sin
DB) contra la lógica exportada del script: `hasGuards`, `evaluateRoute`,
`isAllowlisted`, `loadAllowlist`, `toApiRoutePath`, `failureReport`.

| # | Caso | Esperado |
|---|---|---|
| 1 | Ambos guards (`requireRoutePermission` + `extractTenantContextAuthed`) | pasa |
| 2 | `requireRoutePermission` + `assertSameTenant` | pasa (token reconocido, aunque el helper no exista) |
| 3 | `requireRoutePermission` sin tenant helper | falla |
| 4 | `setupAuthContext` + `checkPermissionOrError` | pasa (patrón (a)) |
| 5 | `setupAuthContext` solo (tenant sin RBAC) | falla |
| 6 | `checkPermissionOrError` solo (RBAC sin tenant) | falla |
| 7 | `requireRoutePermission` + `withTenantFilter` | pasa (patrón (b)) |
| 8 | `withTenantFilter` solo | falla |
| 9 | **`withAuthAndAudit` solo (wrapper borrado)** | **falla** — test de regresión: si alguien reintroduce el token, esa ruta pasaría sin guards reales |
| 10 | Ruta sin nada → falla; la misma en la allowlist → pasa | ambos |
| 11 | Prefijo de allowlist cubre el subtree (`auth/refresh`, `auth/sessions/invalidate-all`) | pasa |
| 12 | `admin/cache` está allowlisteada | pasa |
| 13 | Path exacto de allowlist no cubre vecinos (`realtime/token/extra`) | no allowlisteado |
| 14 | `toApiRoutePath` normaliza paths absolutos de Windows y filtra no-rutas | — |
| 15 | `failureReport` emite el mensaje de §4 | — |

El caso 9 invierte el caso 11 de la spec v1 (`withAuthAndAudit` solo → pasa),
que quedó obsoleto al eliminarse el wrapper.

**Smoke sobre el repo completo** (no vive en el test file porque depende del
working tree, no de la lógica): pipear `git ls-files 'src/app/api/**/route.ts'`
al script debe dar 0 fallos. Si alguno falla, es un hallazgo real a arreglar —
**no** a allowlistear.

```bash
git ls-files 'src/app/api/**/route.ts' | bun run scripts/check-route-guards.ts
```

Última corrida verde: **2026-07-28, 127 rutas, exit 0** (tras eliminar
`withAuthAndAudit` y allowlistear `admin/cache`).
