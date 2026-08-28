/**
 * Versión vigente del contrato del seam móvil
 * (docs/API-CONTRACT-MOBILE.md §10). Debe coincidir con
 * `lib/core/contract_version.dart` en el repo móvil (aea): todo bump
 * se hace en ambos repos en el mismo cambio.
 *
 * Historial: v1 = contrato inicial (2026-07-01); v2 = los 10 fixes
 * normativos del §11 (2026-07-02); v3 = endurecimiento de auth
 * (2026-08-13): 401 de login unificado, 403 de inactivo solo tras validar
 * la password, y rotación estricta de refresh tokens con detección de reuso.
 */
export const CONTRACT_VERSION = 3;
