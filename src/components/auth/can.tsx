"use client";

import type { ReactNode } from "react";
import { usePermissions } from "@/hooks/use-permissions";
import {
  type Permission,
  EntityType,
  Action,
  WILDCARD_PERMISSION,
} from "@/lib/auth/permissions";

/**
 * `<Can>` — single client-side gate for permissioned UI.
 *
 * Default behavior is FAIL-CLOSED: if the user lacks the permission, the
 * children are not rendered. Pass `fallback` to show an alternative
 * (e.g. a disabled button with a tooltip explaining why).
 *
 * Examples:
 *   <Can perm="vehicle:update">
 *     <Button>Editar</Button>
 *   </Can>
 *
 *   <Can perm="vehicle:delete" fallback={<DeleteDisabled />}>
 *     <DeleteButton />
 *   </Can>
 *
 *   <Can anyOf={["plan:update", "plan:confirm"]}>
 *     <PlanActions />
 *   </Can>
 *
 * Why one component instead of three:
 *   - `RequirePermission` (legacy, stringly-typed) → deprecated alias kept
 *      in use-permissions.tsx for the migration window.
 *   - Inline `if (hasPermission(...))` checks → drift over time.
 *   - `<Can>` enforces the typed `Permission` contract at every call site.
 */
type CanProps = {
  children: ReactNode;
  /** Optional fallback when the user lacks permission. Default: render nothing. */
  fallback?: ReactNode;
  /** Show children while permissions are still loading. Default: hide. */
  showWhileLoading?: boolean;
} & (
  | { perm: Permission; anyOf?: never; allOf?: never }
  | { anyOf: Permission[]; perm?: never; allOf?: never }
  | { allOf: Permission[]; perm?: never; anyOf?: never }
);

export function Can(props: CanProps) {
  const { children, fallback = null, showWhileLoading = false } = props;
  const { permissions, isLoading } = usePermissions();

  if (isLoading) {
    return showWhileLoading ? children : null;
  }

  if (checkAccess(permissions, props)) {
    return children;
  }

  return fallback;
}

/**
 * `useCan(permission)` — typed boolean check for use inside event handlers
 * or conditional logic where `<Can>` doesn't fit.
 *
 *   const canEdit = useCan("order:update");
 *   <Button disabled={!canEdit} onClick={...}>Edit</Button>
 *
 * Prefer `<Can>` for declarative show/hide. Use this hook only when you
 * truly need the boolean (disabled state, tooltip text, conditional logic).
 */
export function useCan(perm: Permission): boolean {
  const { permissions, isLoading } = usePermissions();
  if (isLoading) return false;
  return checkAccess(permissions, { perm });
}

/** Bulk variant — useful when one component renders many gated pieces. */
export function useCanAny(perms: Permission[]): boolean {
  const { permissions, isLoading } = usePermissions();
  if (isLoading) return false;
  return checkAccess(permissions, { anyOf: perms });
}

export function useCanAll(perms: Permission[]): boolean {
  const { permissions, isLoading } = usePermissions();
  if (isLoading) return false;
  return checkAccess(permissions, { allOf: perms });
}

// Pure check used by both component and hooks. Kept private so that the
// admin-wildcard logic is implemented exactly once.
function checkAccess(
  permissions: string[],
  spec:
    | { perm: Permission; anyOf?: undefined; allOf?: undefined }
    | { anyOf: Permission[]; perm?: undefined; allOf?: undefined }
    | { allOf: Permission[]; perm?: undefined; anyOf?: undefined },
): boolean {
  if (permissions.includes(WILDCARD_PERMISSION)) return true;
  const set = new Set(permissions);
  if (spec.perm !== undefined) return set.has(spec.perm);
  if (spec.anyOf !== undefined) return spec.anyOf.some((p) => set.has(p));
  if (spec.allOf !== undefined) return spec.allOf.every((p) => set.has(p));
  return false;
}

// Re-export the contract so component callers don't need a second import.
export { EntityType, Action, type Permission };
