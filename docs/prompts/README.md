# Biblioteca de prompts

Prompts reutilizables para tareas recurrentes del repo. Copiá el bloque tal
cual (ajustando los `<placeholders>`); cada uno referencia su doc canónico —
el prompt no reemplaza al doc, obliga a leerlo.

## 1. Auditar una ruta API nueva contra la rúbrica

```
Auditá src/app/api/<ruta>/route.ts contra docs/REVIEW-RUBRIC.md, regla por
regla (fail-closed: si no podés probar que una regla se respeta, falla).
En particular:
1. Tenancy: ¿llama a extractTenantContextAuthed (directo o vía
   setupAuthContext) antes de tocar la DB? Si el companyId viene en el path,
   ¿lo compara contra el user con 403 en mismatch (patrón canAccessCompany de
   companies/[id]/route.ts)? ¿Toda query Drizzle filtra por companyId?
   Cuidado con withTenantFilter en tablas sin columna companyId.
2. RBAC: ¿arranca con requireRoutePermission(request, EntityType.X,
   Action.Y)? ¿El flujo de 5 pasos de CLAUDE.md está completo (Can,
   ProtectedPage, sidebar)?
3. Estados terminales: ¿alguna transición esquiva STOP_STATUS_TRANSITIONS
   o los grafos de src/lib/workflow/?
4. Evidence y history: ¿un fallo de R2 aborta la operación? ¿Las tablas
   history solo reciben INSERTs?
Devolvé una tabla regla → PASA/FALLA → evidencia (archivo:línea).
```

Canónicos: `docs/REVIEW-RUBRIC.md`, invariantes en `docs/CONTEXT.md`.

## 2. Tocar el seam móvil (checklist del contrato)

```
Voy a modificar <endpoint> (parte del seam móvil). Antes de escribir código:
1. Leé docs/API-CONTRACT-MOBILE.md — la sección del endpoint, §9 (campos
   congelados que crashean el parser Dart si desaparecen) y §8 (capability
   set de CONDUCTOR).
2. Decime si mi cambio modifica un shape de request o response. Si sí:
   exige bump de CONTRACT_VERSION (§10) y actualizar el espejo
   aea/docs/API-CONTRACT-MOBILE.md byte-idéntico EN EL MISMO CAMBIO.
3. Respetá el envelope existente del endpoint (§1: 4 familias — los
   endpoints existentes NO migran de envelope sin bump).
4. Implementá y listá exactamente qué campos agregaste/quitaste/renombraste
   en el wire format, aunque parezcan inocuos.
```

Canónico: `docs/API-CONTRACT-MOBILE.md` (espejo en `aea/docs/`).

## 3. Correr y leer el harness golden de routing

```
Corré bun run src/tests/routing-quality/run.ts (28 escenarios golden; los
que necesitan DB corren con integration-runner.ts — requiere Postgres up).
Después:
1. Resumí escenarios PASS/FAIL y, por cada FAIL, qué check del verifier
   disparó (catálogo de checks: docs/optimization/SEMANTICS.md §3).
2. Antes de proponer un fix, decidí de qué lado está el bug: solver
   (vroom-optimizer / optimization-runner) o verifier — la semántica
   compartida (unidades, ventanas, flex) vive en SEMANTICS §1-2 y en
   src/lib/optimization/{constants,time-window-policy}.ts. Tocar un lado
   sin releer SEMANTICS está prohibido.
3. No "arregles" un escenario relajando el verifier salvo que SEMANTICS
   respalde que el check está mal.
```

Canónicos: `docs/optimization/SEMANTICS.md`, `src/lib/optimization/README.md`.

## 4. Revisar una migración Drizzle

```
Cambié src/db/schema/<archivo>.ts. Guiame por el flujo de ADR-0009:
1. bun run db:generate y mostrame el SQL generado en drizzle/ (NUNCA
   db:push — rompe el historial versionado).
2. Revisá el SQL: ¿DROPs o renames destructivos no intencionales? ¿La
   tabla nueva lleva companyId NOT NULL con FK a companies (invariante #1)?
   ¿Índices para los patrones de query (companyId, status)?
3. Si la tabla es history/audit: confirmá que el diseño es append-only
   (las filas no se editan ni borran desde la aplicación) — invariante #8
   de CONTEXT.md.
4. Recién entonces bun run db:migrate (requiere Postgres arriba) y
   actualizá docs/DATA-MODEL.md si cambió una entidad core.
```

Canónicos: `docs/adr/0009-versioned-drizzle-migrations.md`, `docs/DATA-MODEL.md`.
