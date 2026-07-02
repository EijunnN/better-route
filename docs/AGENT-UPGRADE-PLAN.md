# Plan de potenciación del agente — sesión del modelo SOTA

> **Qué es esto.** El desarrollo de BetterRoute se dirige con un agente cotidiano
> (Claude Opus 4.8). Habrá acceso temporal (**una sola sesión**) a un modelo SOTA
> mucho más capaz. Este documento es el plan para usar esa ventana construyendo
> **artefactos durables** que potencien a Opus de forma **permanente** sobre este
> proyecto — porque después el SOTA ya no estará. **Se ejecuta todo en una sesión, en
> orden de dependencia (no día por día).**
>
> Filosofía rectora (estilo `shadcn/improve`): **el modelo más capaz entiende,
> juzga y ESPECIFICA; el modelo barato EJECUTA.**
>
> Generado a partir de una exploración multi-agente del repo (mapas de harness,
> arquitectura, docs/dominio) sintetizada y criticada adversarialmente. Fecha: 2026-07-01.

---

## Diagnóstico

- 🟢 **Documentación de dominio excepcional.** `docs/CONTEXT.md` (lenguaje ubicuo +
  8 bounded contexts + 8 invariantes) y 7 ADRs disciplinados (Nygard, fechados,
  cruzados). Mejor que el 95% de los proyectos.
- 🔴 **Tooling ejecutable casi nulo.** Los ~20 skills son genéricos de terceros
  (Matt Pocock / Vercel). **Cero** skills/subagentes anclados al código propio. El
  único gate automático es Biome (estilo) — no ve seguridad ni correctness.
- 🟠 **Drift documental peligroso.** Varios docs mienten (ver más abajo). Opus los
  lee como verdad y escribe código muerto o la arquitectura equivocada.

**Tesis:** ya existe el *conocimiento* escrito; falta convertirlo en
**guardarraíles ejecutables** que Opus siga sin re-derivar ni equivocarse.

---

## Los 3 niveles: cómo el SOTA potencia a Opus

Cada tarea cae en un nivel según cuánto necesita realmente al modelo bestial.

| Nivel | Qué es | Ejemplos |
|---|---|---|
| **🅰️ Solo el SOTA** | Requiere leer varios archivos grandes a la vez y **juzgar**; Opus solo no lo sostiene en contexto | Contrato semántico verifier↔solver (`vroom-optimizer.ts` 1019L + los 8 checks); reconciliar drift entre ~10 docs; spec del `confirm` route (849L); rúbrica de las 8 invariantes |
| **🅱️ SOTA diseña, Opus rellena** | El SOTA fija el contrato/esqueleto; Opus completa lo mecánico | `ARCHITECTURE.md`, `DATA-MODEL.md`, READMEs de módulo |
| **🅲 Opus solo** | Mecánico y determinista — no malgastar al SOTA | slash-commands, `codegraph`, poda de infra muerta, regenerar ER |

---

## Ejecución en una sola sesión — 3 fases por orden de dependencia

Se hace **todo en una sesión**. El calendario no importa; el **orden sí**: la *fuente
única de verdad* va PRIMERO, porque la rúbrica, las skills y los specs se construyen
encima (hacer skills sobre docs contradictorios las contamina). Y como la sesión del
SOTA es finita, que dedique su tiempo **solo a lo 🅰️** y deje lo 🅱️/🅲 a Opus.

**Fase 0 — Alinear (rápido, no quemar la sesión).** Leer los mapas/plan, devolver una
crítica breve y fijar la lista final de artefactos 🅰️ (SOTA) vs lo que queda para Opus.
Esperar OK.

**Fase 1 — Fuente única de verdad (la base de todo lo demás):**
- Reconciliar el drift documental (ver abajo) + regla de precedencia.
- ADR-0008 (tenancy), 0009 (migraciones), 0010 (RBAC tipado) + `CLAUDE.md v2`.
- *Cross-repo (con el móvil):* el **contrato del seam** — ver
  `aea/docs/AGENT-UPGRADE-PLAN.md`. Es lo único que SOLO el SOTA puede escribir (ve
  ambos repos a la vez).

**Fase 2 — Guardarraíles construidos encima de la Fase 1:**
- Gate de seguridad: `REVIEW-RUBRIC.md` + subagente `tenancy-invariant-auditor` + **hook
  determinista** que falla rutas nuevas sin tenancy/RBAC.
- Skills de scaffolding: `new-api-route`, `add-feature-rbac`, `new-feature-module`,
  `touch-state-machines`.
- Núcleo del solver: `SEMANTICS.md` (verifier↔solver) + `touch-optimization-pipeline`
  + subagentes `verifier-solver-sync-auditor` y `realtime-channel-auth`.
- Specs de hotspots: `confirm-plan.md` (849L), `csv-import.md`, `reassignment.md`.
- Mapas/guía: `ADDING-A-FEATURE.md` (🅰️), y `ARCHITECTURE.md`/`DATA-MODEL.md` (🅱️: Opus rellena).

> **Si la sesión se acorta, prioriza la Fase 1.** Es lo único irrecuperable después (el
> resto lo termina Opus). Al final, prueba de humo: pedir a Opus una feature de ejemplo
> usando solo los artefactos nuevos y corregir fricciones con el SOTA aún presente.

Lo mecánico (slash-commands, poda, biblioteca de prompts) lo hace Opus, no gasta SOTA.

---

## Entregables (priorizados)

### P0 — hacer sí o sí
1. **`CLAUDE.md v2`** — secciones Migraciones / Testing / Definition-of-Done +
   regla de precedencia. *(Esqueleto ya añadido — ver "Ya hecho".)*
2. **`docs/REVIEW-RUBRIC.md`** — mecaniza las 8 invariantes. *(v1 ya creada.)*
3. **Skill `new-api-route`** — scaffold de ruta API tenant-aware (elige entre los
   dos helpers de permisos y los dos patrones de tenancy).
4. **Skill `add-feature-rbac`** — scaffold del flujo RBAC de 5 pasos.
5. **Subagente `tenancy-invariant-auditor`** — audita el diff contra el aislamiento
   multi-tenant (incluido el fallback silencioso de `withTenantFilter`).
6. **Reconciliación de drift documental** — pase de verdad única sobre ~10 docs.
7. **Hook determinista de enforcement** *(añadido por el crítico)* — grep que hace
   fallar (exit 2) toda `route.ts` nueva sin `extractTenantContextAuthed` /
   `requireRoutePermission`. Convierte la invariante de seguridad #1 en gate
   automático (hoy solo Biome/estilo lo es).

### P1 — alto valor
8. **`docs/optimization/SEMANTICS.md`** — contrato compartido verifier↔solver.
9. **Skill `touch-optimization-pipeline`** — mapa de stages + boundaries Zod.
10. **ADRs 0008 (tenancy), 0009 (migraciones), 0010 (RBAC tipado)** — capturan el
    "por qué" de decisiones hoy dispersas como prosa.
11. **`docs/ADDING-A-FEATURE.md`** — walkthrough vertical que teje las 8 capas.
12. **Skill `new-feature-module`** + ADR del patrón compound-component *(añadido)*.
13. **Skill/spec `touch-state-machines`** *(añadido)* — editar `order-states.ts` /
    `states.ts` sin resucitar terminales (ADR-0005).
14. **Subagente + contrato de autorización de canales realtime** *(añadido)*.

### P2 — completar cobertura
15. **`ARCHITECTURE.md` + `DATA-MODEL.md`** (🅱️: SOTA diseña, Opus rellena) +
    READMEs de `src/lib/optimization/`, `orders/`, `routing/`.
16. **Specs `confirm-plan.md` (849L), `csv-import.md`, `reassignment.md`** *(confirm
    añadido por el crítico: el hotspot transaccional de peor blast-radius)*.
17. **Skill `add-routing-quality-scenario` + `docs/TESTING.md`** — cómo armar un
    fixture golden e interpretar severidades HARD/SOFT/INFO.
18. **slash-commands `/pre-pr`, `/migration`, `/routing-quality`** (🅲: mecánico).
19. **Biblioteca de prompts** (`docs/prompts/`) para el usuario no-programador.

---

## Antipatrones (en qué NO gastar el SOTA)

- ❌ Escribir código de feature o CRUD — eso lo ejecuta Opus contra los specs.
- ❌ Correr gates deterministas (Biome, tsc, tests, drizzle) — mecánico.
- ❌ Reescribir docs que ya son excelentes (`CONTEXT.md` núcleo, ADRs 0001-0007,
  README de permissions) — tocar solo donde hay drift comprobado.
- ❌ Redescubrir el repo con grep — ya están los mapas; su cerebro es para juicio.
- ❌ Specs de features especulativas que no existen — anclar a hotspots reales.
- ❌ Generar informes sobre su propio trabajo — cada entregable, un artefacto commiteado.

---

## Drift documental conocido (a reconciliar en la Fase 1)

- `docs/CONTEXT.md §7 Realtime` dice "SSE + Upstash Redis pub-sub" → **falso**:
  ADR-0007 adoptó **Centrifugo + OneSignal** (`src/lib/realtime/`).
- `docs/CONTEXT.md` (out of scope) dice que las push se introducirían "con
  ADR-0007" → ADR-0007 **ya las introdujo** (issues 011/012). Además sus
  "Referencias rápidas" no listan ADR-0007.
- `docs/SISTEMA_OPTIMIZACION.md` y `docs/routing-quality-findings.md` describen
  PyVRP / OptimizerFactory / IOptimizer como vivos → **eliminados** (ADR-0001).
- `docs/ESTADO_PROYECTO.md` congelado en "Enero 2025".
- README: "Single-tenant por instalación" (principios) vs "multi-tenant + RBAC"
  (features) — ambigüedad de lenguaje ubicuo a resolver en CONTEXT.
- "4 vs 5 estados de entrega": README (4) vs CONTEXT/config (5).

---

## Estado tras la sesión SOTA (2026-07-01) — hecho por el SOTA

- ✅ **`docs/API-CONTRACT-MOBILE.md`** (+ espejo en `aea/docs/`) — contrato
  completo del seam: 20 endpoints, campos congelados, FIX-1..10, versionado
  + mecanismo de contract-tests decidido (fixtures golden, sin codegen).
- ✅ **Drift reconciliado**: `CONTEXT.md` corregido (7 puntos), banners en
  `SISTEMA_OPTIMIZACION` / `ESTADO_PROYECTO` / `routing-quality-findings`,
  fix quirúrgico en `presets-optimizacion.md`, `CLAUDE.md` actualizado
  (sección "Seam con la app móvil").
- ✅ **ADR-0008** (tenancy + deployment) y **ADR-0011** (failure reasons).
- ✅ **`docs/optimization/SEMANTICS.md`** — contrato verifier↔solver +
  **14 asimetrías** (A1 y A11 son bugs de producción).
- ✅ **`docs/specs/confirm-plan.md`** — anatomía + deudas C-1..C-9 (C-4 y
  C-5 son carreras reales).
- ✅ **`docs/specs/hook-tenancy-gate.spec.md`** + rúbricas afinadas (ambos
  repos) + `aea/docs/specs/offline-outbox.spec.md` + regla NO-CODEGEN con
  casos borde.

### Cola de Opus (en orden; cada item tiene su spec)

1. ~~Hook de tenancy (`docs/specs/hook-tenancy-gate.spec.md`) — incluye smoke
   sobre las rutas existentes.~~ ✅ **Hecho 2026-07-02** — hook implementado
   y calibrado contra las rutas existentes.
2. ~~Contract-tests + fixtures + `CONTRACT_VERSION` + sync script
   (contrato §10) y test del capability set CONDUCTOR (contrato §8).~~
   ✅ **Hecho 2026-07-02** — contract-tests + fixtures golden +
   `CONTRACT_VERSION=2` + `scripts/sync-contract-fixtures.{sh,ps1}`.
3. ~~FIX-1 y FIX-2 (pérdida de datos — contrato §11 y
   `aea/docs/specs/offline-outbox.spec.md` con sus tests).~~
   ✅ **Hecho 2026-07-02** — FIX-1..10 aplicados (ver ítem 5).
4. ~~A1/A11 de `SEMANTICS.md` y C-4/C-5 de `confirm-plan.md`.~~
   ✅ **Hecho 2026-07-02** — A1/A11 resueltos por SEMANTICS v2 (commit
   `b67bd44`); C-4/C-5 cerradas hoy con advisory lock en la ruta confirm.
5. ~~FIX-3..FIX-10 (contrato §11) y C-3..C-9.~~ ✅ **Hecho 2026-07-02** —
   FIX-1..10 aplicados y C-1..C-9 resueltas.
6. ~~ADR-0009 (migraciones — materia en CLAUDE.md §Migraciones) y ADR-0010
   (RBAC tipado — materia en `permissions/README.md`); numeración 0009/0010
   reservada.~~ ✅ **Hecho 2026-07-02** — `docs/adr/0009` y `0010` escritos
   y verificados contra código/git.
7. ~~Subagentes auditores (tenancy / verifier-solver / realtime /
   revisor-movil): el contenido ES la rúbrica + contrato + SEMANTICS —
   redactarlos como agents que los citan, no que los reinventan.~~
   ✅ **Hecho 2026-07-02**.
8. ~~Skills de scaffolding (`new-api-route`, `add-feature-rbac`,
   `new-feature-module`; móvil: `nuevo-modelo`/`provider`/`pantalla`
   anti-codegen) — deben citar rúbrica/contrato.~~ ✅ **Hecho 2026-07-02**.
9. ~~Reescribir-o-borrar los docs con banner; `SETUP.md`/`README` móvil
   (línea de `build_runner`, sobreventa offline); purga de deps codegen del
   pubspec.~~ ✅ **Hecho 2026-07-02** — tramo web: `SISTEMA_OPTIMIZACION` y
   `ESTADO_PROYECTO` borrados; `routing-quality-findings` queda como
   snapshot histórico con banner (decidido: se conserva). Tramo móvil:
   README/SETUP corregidos y pubspec purgado de deps codegen.
10. ~~`ARCHITECTURE.md`/`DATA-MODEL.md`/READMEs de módulo, slash-commands,
    biblioteca de prompts.~~ ✅ **Hecho 2026-07-02**.

## Ya hecho (2026-07-01, preparando la sesión — Nivel 🅲 y esqueletos 🅱️)

Adelantado por Opus para que el SOTA no gaste tiempo en lo mecánico:

- **CodeGraph eliminado.** No estaba enganchado a nivel de repo (sin `.mcp.json`).
  Borrado `.claude/CLAUDE.md` (guía rota: apuntaba a un índice inexistente) y
  quitados los permisos `mcp__codegraph__*` de `.claude/settings.json`.
- **Infra muerta podada.** Borrado `.claude/ralph-loop.local.md` (apuntaba a un
  `prompt.md` inexistente) y el symlink roto del skill `remotion-best-practices`
  (irrelevante, no estaba en `skills-lock.json`).
- **`PROCESS.md`** marcado como archivo histórico (era una auditoría completada que
  se leía como proceso vigente).
- **`CLAUDE.md`** ampliado: secciones *Precedencia de fuentes*, *Migraciones*,
  *Capas de testing* y *Definition of Done*.
- **`docs/REVIEW-RUBRIC.md`** creada (v1, para que el SOTA la afine).
- Este plan (`docs/AGENT-UPGRADE-PLAN.md`).
