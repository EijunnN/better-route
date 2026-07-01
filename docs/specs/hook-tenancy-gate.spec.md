# Spec — Hook determinista: gate de tenancy/RBAC en rutas API

> **v1 — 2026-07-01 (sesión SOTA). Implementa: Opus.** Convierte la
> invariante de seguridad #1 (aislamiento de tenant) en un gate automático.
> Hoy el único gate del repo es `biome check` (estilo); este hook hace
> **fallar el turno** cuando aparece una `route.ts` sin los guards
> canónicos. Diseñado con la allowlist real del código (extraída en la
> auditoría del seam) para que no dé falsos positivos el día uno.

## 1. Qué detecta

Para cada archivo `src/app/api/**/route.ts` **nuevo o modificado**:

- **PASA** si el contenido contiene `requireRoutePermission(` **y** al menos
  uno de `extractTenantContextAuthed(` / `assertSameTenant(`.
- **PASA** si su path está en la allowlist (§3).
- **FALLA** en cualquier otro caso, con exit code 2 y el mensaje de §4.

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

## 3. Allowlist inicial (`scripts/route-guards-allowlist.json`)

Excepciones **deliberadas**, verificadas contra el código el 2026-07-01
(`docs/API-CONTRACT-MOBILE.md §8` + rutas públicas/auth):

```jsonc
[
  "src/app/api/auth/",                       // login/refresh/logout/me/sessions: pre-RBAC por naturaleza
  "src/app/api/public/",                     // tracking público: sin auth by design
  "src/app/api/realtime/token/route.ts",     // authz real = derivación de canales por rol
  "src/app/api/upload/presigned-url/route.ts" // solo auth; companyId del JWT (ignora header)
]
```

(Prefijo = subtree completo; path exacto = solo ese archivo. `GET
mobile/driver/location` es self-only sin RBAC, pero su archivo contiene el
`requireRoutePermission` del POST, así que pasa sin excepción.)

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
