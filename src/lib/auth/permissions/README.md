# Permissions — RBAC contract

Este módulo es el **single source of truth** para autorización en BetterRoute.
Servidor y cliente importan los mismos enums (`EntityType`, `Action`) y el mismo
tipo `Permission`. TypeScript rechaza permisos inválidos en compile time.

```
src/lib/auth/permissions/
├── types.ts      ← EntityType, Action, Permission, USER_ROLES (browser-safe)
├── index.ts      ← barrel export público
└── README.md     ← este archivo
```

El registro de **qué role tiene qué permission** vive en
`src/lib/auth/authorization.ts` (server-only — toca DB para custom roles).

---

## Patrón obligatorio para features nuevas

### 1. Servidor — proteger el endpoint

```ts
// src/app/api/widgets/route.ts
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { EntityType, Action } from "@/lib/auth/permissions";

export async function POST(request: NextRequest) {
  const authResult = await requireRoutePermission(
    request,
    EntityType.WIDGET,
    Action.CREATE,
  );
  if (authResult instanceof NextResponse) return authResult;
  // ... resto del handler ...
}
```

**Reglas:**
- Toda ruta API que muta datos llama a `requireRoutePermission` antes del handler.
- Para multi-tenant: si la ruta recibe `companyId` por path/body, validá contra
  el JWT con `assertSameTenant(user, companyId)` (patrón usado en
  `workflow-states/route.ts`) o usá `extractTenantContextAuthed`.
- **Nunca** uses `setupAuthContext` solo — siempre acompañado de un check de
  permission.

### 2. Cliente — proteger el botón

```tsx
import { Can } from "@/components/auth/can";

<Can perm="widget:create">
  <Button onClick={createWidget}>Nuevo Widget</Button>
</Can>
```

**Variantes:**
- `<Can perm="...">...</Can>` — un solo permiso requerido.
- `<Can anyOf={["plan:update", "plan:confirm"]}>...</Can>` — al menos uno.
- `<Can allOf={["order:update", "route:assign"]}>...</Can>` — todos.
- `<Can perm="..." fallback={<Disabled />}>...</Can>` — qué mostrar cuando no.

Cuando necesitás el booleano (disabled state, tooltip, branching):

```tsx
import { useCan } from "@/components/auth/can";

const canEdit = useCan("widget:update");
<Button disabled={!canEdit}>Editar</Button>
```

### 3. Página — proteger la entrada

```tsx
import { ProtectedPage } from "@/components/auth/protected-page";

export default function WidgetsPage() {
  return (
    <ProtectedPage requiredPermission="widget:read">
      <WidgetsContent />
    </ProtectedPage>
  );
}
```

**Fail-closed por defecto.** Si te olvidás de pasar `requiredPermission`,
`requiredPermissions`, o `authenticatedOnly`, la página deniega acceso.

### 4. Sidebar — registrar el item

```tsx
// src/components/layout/sidebar.tsx
{ title: "Widgets", href: "/widgets", icon: Box, requiredPermission: "widget:read" }
```

---

## Cómo agregar una entity o action nueva

1. **Agregar la entity** en `types.ts`:
   ```ts
   export enum EntityType {
     // ...
     WIDGET = "widget",
   }
   ```
   El tipo `Permission` se expande automáticamente — `"widget:create"`,
   `"widget:update"`, etc., quedan disponibles inmediatamente.

2. **Agregar la action** (solo si no existe):
   ```ts
   export enum Action {
     // ...
     APPROVE = "approve",
   }
   ```

3. **Asignar a roles legacy** en `authorization.ts → ROLE_PERMISSIONS`:
   ```ts
   [USER_ROLES.PLANIFICADOR]: [
     // ...
     `${EntityType.WIDGET}:${Action.READ}`,
     `${EntityType.WIDGET}:${Action.CREATE}`,
   ],
   ```

4. **Sembrar el permiso en DB** (para custom roles) si aplica — los seeders
   viven bajo `src/db/seed/`.

5. **Usar el permiso** en cliente y servidor como muestran los ejemplos arriba.

TypeScript se encarga de catchear typos. Si tipeás `"widget:edit"` te marca
error porque no existe `Action.EDIT` (el alias correcto es `UPDATE`).

---

## Roles legacy — ¿quién puede qué?

Los 5 roles legacy (`ADMIN_SISTEMA`, `ADMIN_FLOTA`, `PLANIFICADOR`, `MONITOR`,
`CONDUCTOR`) tienen permisos hardcodeados en `ROLE_PERMISSIONS`. Para casos
especiales, las empresas pueden crear **custom roles** vía la UI de `/roles`
que se almacenan en la tabla `roles` con permisos toggleable.

`getUserPermissionsFromDB()` combina ambos: base role permissions + custom
role permissions.

| Rol | Resumen |
|---|---|
| `ADMIN_SISTEMA` | Wildcard `*` — acceso total cross-tenant |
| `ADMIN_FLOTA` | Flota, vehículos, conductores, skills, zonas, configuración de empresa |
| `PLANIFICADOR` | Pedidos (CRUD + import + bulk), planes, optimización, asignación de rutas |
| `MONITOR` | Lectura + accionar alertas + actualizar status de paradas desde web |
| `CONDUCTOR` | Solo sus rutas asignadas y actualización de status de paradas |

Cuando ampliés un rol, **mantené la separation of concerns**: ADMIN_FLOTA no
debería poder editar pedidos, PLANIFICADOR no debería poder borrar conductores.
Si una feature transversal aparece, considerá si necesita un nuevo rol o si
debe ser custom-role-only.

---

## Anti-patterns

### ❌ NO uses strings hardcoded fuera del módulo

```tsx
// MAL — bypass del tipo Permission
if (user.permissions.includes("order:edit")) { ... }
```

```tsx
// BIEN
const canEdit = useCan("order:update");
```

### ❌ NO inventes permission strings que no existen

```tsx
<Can perm="order:approve">  // ❌ Action.APPROVE no existe
```

```tsx
<Can perm="order:confirm">  // ✅ usa Action.CONFIRM que sí existe
```

### ❌ NO confíes solo en el cliente

```ts
// MAL — si el cliente lo deja pasar, el server acepta
export async function POST(request: NextRequest) {
  // sin requireRoutePermission
  const data = await db.insert(...);
}
```

El cliente esconde el botón por UX. **El server enforce siempre**.

### ❌ NO escribas helpers `canAccessX()` ad-hoc por archivo

Ya existe el patrón `assertSameTenant(user, companyId)` para multi-tenant
checks. No reimplementar en cada handler.

### ❌ NO `<ProtectedPage>` sin `requiredPermission`

```tsx
<ProtectedPage>  // ❌ fail-closed: deniega a todos
```

```tsx
<ProtectedPage requiredPermission="widget:read">  // ✅
// o si es página para todo usuario logueado:
<ProtectedPage authenticatedOnly>  // ✅ explícito
```

---

## Convenciones de naming

- Entity en singular: `order`, no `orders`. (DB usa plural; el normalizador
  de `authorization.ts` traduce.)
- Action en lowercase con underscores: `change_status`, `bulk_delete`.
- Permission concatenado con `:` — sin espacios.

Si dudás del nombre exacto de un permission, IDE autocomplete del tipo
`Permission` te lo da.
