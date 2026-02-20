# PROCESS - Auditoria Full-Stack BetterRoute

## Estado: COMPLETADO ✓

---

## FASE 1: BUGS CRITICOS (Features rotos)

- [x] **1.1** Fix `driver-skills-context.tsx` - ELIMINADO componente completo `driver-skills/` (duplicado de `user-skills/`)
- [x] **1.2** Fix DELETE workflow transitions - Creado `[transitionId]/route.ts` con auth y soft-delete
- [x] **1.3** Fix `fleets-context.tsx` roles inválidos - Corregido a ADMIN_FLOTA/PLANIFICADOR/ADMIN_SISTEMA/MONITOR
- [x] **1.4** Fix `order-form-context.tsx` - Agregado mapeo de customFields al editar
- [x] **1.5** Fix `users.company_id` nullable - CORRECTO: ya es nullable en schema (ADMIN_SISTEMA necesita null)

## FASE 2: SEGURIDAD

- [x] **2.1** Eliminar `/api/debug-vroom` - ELIMINADO endpoint debug
- [x] **2.2** Proteger `/api/optimization/engines` - Agregado setupAuthContext + unauthorizedResponse
- [x] **2.3** Proteger hard delete de órdenes - Agregado auth + RBAC (solo ADMIN_SISTEMA puede hard delete)
- [x] **2.4** Mobile routes auth - FALSO POSITIVO: los 3 endpoints ya verifican JWT via `getAuthenticatedUser()`

## FASE 3: BASE DE DATOS

- [x] **3.1** Generar migration para tablas faltantes - Consolidado en migración única 0000 (40 tablas, schema limpio)
- [x] **3.2** Eliminar `audit_logs.tenant_id` redundante - Eliminado de schema + tenant-aware.ts + audit.ts
- [x] **3.3** Fix `vehicle_skills.code` unique global → UNIQUE(company_id, code) - Cambiado a uniqueIndex compuesto
- [x] **3.4** Agregar unique constraints en junction tables - 5 uniqueIndex agregados
- [x] **3.5** Agregar FK constraint a `users.primary_fleet_id` → fleets.id (onDelete: set null)
- [x] **3.6** Fix timestamps nullable en workflow/field tables → .notNull().defaultNow()
- [x] **3.7** Agregar indexes en orders, routeStops, driverLocations, workflow/field tables
- [x] **3.8** Estandarizar ON DELETE: csvTemplates y driverLocations → RESTRICT
- [x] **3.9** Migrar 15+ columnas text → jsonb + safeParseJson + eliminar JSON.stringify en writes

## FASE 4: LIMPIEZA DE CÓDIGO MUERTO

- [x] **4.1** Eliminar exports dead en `use-api.ts` - Removidos useApiList, useApiMutation, useApiPolling, useApiImmutable, createCompanyFetcher
- [x] **4.2** Eliminar ruta duplicada `/api/optimization/presets` - ELIMINADO
- [x] **4.3** Extraer `extractTenantContext` a `@/lib/routing/route-helpers` - 76 archivos migrados
- [x] **4.4** Fix `companyId ?? ""` → null guard explícito - 21 instancias corregidas en 7 archivos
- [x] **4.5** Fix `driver-skills-context.tsx` - ELIMINADO con todo el componente
- [x] **4.6** Eliminar componente `driver-skills/` - ELIMINADO completo (duplicado de user-skills)
- [x] **4.7** Sistema dual de roles - INVESTIGADO: Backend usa `users.role` (JWT), frontend usa `user_roles` (RBAC dinámico). Ya están sincronizados via `/api/users/[id]/roles`. Es diseño intencional (legacy + RBAC coexisten).

## FASE 5: MEJORAS

- [x] **5.1** Fix `/auth/logout` y `/auth/refresh` - Removido soporte GET (CSRF risk)
- [x] **5.2** Fix `updatedAt` - Solo 1 instancia faltante (optimization-runner.ts RUNNING status), corregida
- [x] **5.3** Estandarizar formato de error responses - 27 instancias corregidas en 5 archivos: `{error}` como estándar

---

## Notas adicionales

- DB fue dropeada y re-migrada con esquema limpio (migración única 0000)
- Scripts de migración one-time eliminados (migrate-extract-tenant.ts, migrate-json-parse.ts)
- `safeParseJson` utility creado en `src/lib/utils/safe-json.ts` para compatibilidad text↔jsonb
- Build pasa limpio (solo pre-existing `/_global-error` bug de Next.js)
