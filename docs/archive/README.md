# Archivo histórico

**Lo que está acá pasó una vez. No es fuente de verdad y sus instrucciones no
están vigentes** — no sigas sus "acciones recomendadas" ni asumas que el código
que describen sigue existiendo. Se conserva como registro de *por qué* el
sistema es como es.

Ante cualquier conflicto con un doc canónico, gana el canónico. `docs/archive/`
está **fuera** de la jerarquía de precedencia (ver `CLAUDE.md → Precedencia de
fuentes`): un archivado nunca gana, ni siquiera contra el `resto de docs/`.

Si necesitás algo de acá para tomar una decisión, **verificalo contra el código
primero**; si resulta seguir vigente, el lugar donde vive es un doc canónico
(`docs/CONTEXT.md`, un ADR, `docs/REVIEW-RUBRIC.md`), no este directorio.

## Contenido

| Doc | Qué fue | Estado |
|---|---|---|
| `AGENT-UPGRADE-PLAN.md` | Plan de la sesión SOTA (2026-07-01) para construir los guardarraíles del agente | Ejecutado — los 10 items de la "Cola de Opus" están cerrados |
| `pending-review-findings-2026-07-02.md` | 23 hallazgos de un review adversarial de 5 agentes | Los 23 fueron aplicados el mismo 2026-07-02 |
| `security-audit.md` | Auditoría de aislamiento tenant sobre 111 rutas API (2026-04-17) | El CRITICAL de header-trust se cerró con `extractTenantContextAuthed`; la decisión vive en ADR-0008 |
| `cache-audit.md` | Auditoría de la capa de caché (2026-04-18): fachada de 40+ exports muertos con defectos latentes de tenant-key | Se ejecutó la Opción A — `src/lib/infra/cache.ts` quedó reducido a primitivas y el endpoint de warmup se eliminó |
| `preprod-audit-report.md` | Auditoría pre-producción RBAC + discrepancias con el móvil (36 hallazgos) | Los CRITICAL/HIGH/MEDIUM verificados están cerrados. **Los LOW no fueron auditados uno por uno**: si citás uno, verificá contra el código antes de actuar |
| `routing-quality-findings.md` | Análisis de la primera corrida del harness, cuando PyVRP todavía existía | Snapshot. Se conserva a propósito: documenta **por qué existe el verifier**. PyVRP / `IOptimizer` / `OptimizerFactory` fueron eliminados (ADR-0001) |
| `issues/001-012` | Backlog de vertical slices (Visits/Revisitas y Realtime/chat) | Los 12 implementados. La verdad de esas features vive en ADR-0005/0006/0007 y `docs/CONTEXT.md` |
