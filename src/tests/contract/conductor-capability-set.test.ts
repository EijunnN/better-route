/**
 * API-CONTRACT-MOBILE.md §8 — el capability set del rol CONDUCTOR es
 * parte del contrato móvil: quitarle cualquiera de estos permisos
 * rompe la app del conductor en silencio (my-route, PATCH de stops,
 * location, field-definitions, chat). Unit test, sin DB.
 *
 * Igualdad EXACTA a propósito: agregar un permiso al rol también debe
 * pasar por acá (y por el doc del contrato), no solo quitar.
 */
import { describe, expect, test } from "bun:test";
import { ROLE_PERMISSIONS } from "@/lib/auth/authorization";
import {
  Action,
  EntityType,
  type Permission,
  USER_ROLES,
} from "@/lib/auth/permissions";

describe("API-CONTRACT-MOBILE.md §8 — capability set congelado de CONDUCTOR", () => {
  test("ROLE_PERMISSIONS[CONDUCTOR] es EXACTAMENTE el set de 6 permisos del §8", () => {
    const frozenCapabilitySet: Permission[] = [
      `${EntityType.ROUTE}:${Action.READ}`, // my-route
      `${EntityType.ROUTE_STOP}:${Action.READ}`, // delivery-policy
      `${EntityType.ROUTE_STOP}:${Action.UPDATE}`, // PATCH stop, location POST
      `${EntityType.ORDER}:${Action.READ}`, // field-definitions, my-orders
      `${EntityType.CHAT}:${Action.READ}`, // messages GET, read POST
      `${EntityType.CHAT}:${Action.CREATE}`, // messages POST
    ];

    const actual = [...ROLE_PERMISSIONS[USER_ROLES.CONDUCTOR]].sort();

    expect(actual).toEqual([...frozenCapabilitySet].sort());
  });
});
