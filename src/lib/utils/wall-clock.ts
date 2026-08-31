/**
 * Dos semánticas viajan por el wire con el mismo formato ISO, y confundirlas
 * desfasa la hora por el offset del navegador.
 *
 * **Hora de pared** (`timeWindow.start`/`end`, `estimatedArrival`): la hora que
 * el operador cargó, que el conductor y el planificador deben leer tal cual.
 * El server la compone con `setUTCHours` para que los dígitos crucen intactos
 * un `timestamp` sin zona de Postgres, así que llega como `09:00Z` aunque
 * signifique las 9 de la mañana en Lima. Pasarla por `toLocaleTimeString()`
 * le resta el offset: una ventana de 9 a 14 se mostraba de 4 a 9.
 *
 * **Instante real** (`liveEtaAt`, `startedAt`, `completedAt`, `recordedAt`):
 * un momento absoluto, que sí debe mostrarse en la zona de quien mira.
 *
 * Ver `docs/API-CONTRACT-MOBILE.md` §1 — el móvil hace lo mismo en el borde
 * del parseo (`parseWallClock` / `parseInstant`).
 */

/** `HH:MM` de una hora de pared, sin mover los dígitos. */
export function formatWallClock(
  iso: string | Date | null | undefined,
  fallback = "--:--",
): string {
  if (!iso) return fallback;
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toISOString().slice(11, 16);
}

/** `HH:MM` de un instante real, en la zona de quien mira. */
export function formatInstant(
  iso: string | Date | null | undefined,
  fallback = "--:--",
): string {
  if (!iso) return fallback;
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * ETA de una parada. El recálculo en vivo es un instante y el horario del
 * plan es hora de pared: se eligen juntos para que quien llama no tenga que
 * acordarse de cuál recibió.
 */
export function formatStopEta(
  liveEtaAt: string | null | undefined,
  estimatedArrival: string | null | undefined,
  fallback = "--:--",
): string {
  if (liveEtaAt) return formatInstant(liveEtaAt, fallback);
  return formatWallClock(estimatedArrival, fallback);
}
