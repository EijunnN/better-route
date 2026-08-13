/**
 * Guardas a nivel proceso contra fallos asíncronos huérfanos.
 *
 * Next atrapa cualquier throw dentro de un handler y responde 500: una ruta
 * que falla no se lleva el resto puesto. Lo que sí mata el proceso entero —y
 * con él las ~127 rutas— es una promesa rechazada sin dueño: desde Node 15
 * `unhandledRejection` termina el proceso por defecto.
 *
 * El trabajo en background del optimizador es la fuente natural de esas
 * rechazadas: corre fuera del ciclo de vida del request, así que no hay
 * boundary de Next que lo contenga.
 *
 * La asimetría entre los dos handlers es deliberada:
 *
 * - `unhandledRejection` → se loguea y el proceso SIGUE. Una promesa huérfana
 *   arruina un job, no el servidor; tirar abajo el HTTP de toda la empresa por
 *   eso es peor que el fallo original.
 * - `uncaughtException` → se loguea y el proceso SALE con código 1. Acá el
 *   stack se desenrolló a la fuerza y el estado es indeterminado (locks a
 *   medio liberar, transacciones abiertas). Seguir sirviendo desde ahí
 *   corrompe datos en silencio; mejor que el supervisor levante uno limpio.
 *
 * Esto es una red de contención, no una solución: cada rejection logueada acá
 * es un `.catch()` faltante que hay que arreglar en su origen.
 */

let installed = false;

export function installProcessGuards(): void {
  // `register()` se re-ejecuta en cada recompilación con HMR; sin este guard
  // los listeners se apilan y Node avisa por MaxListenersExceeded.
  if (installed) return;
  installed = true;

  process.on("unhandledRejection", (reason) => {
    console.error(
      "[process] Unhandled promise rejection — el proceso sigue vivo a propósito. Falta un .catch() en el origen:",
      reason instanceof Error ? reason.stack : reason,
    );
  });

  process.on("uncaughtException", (error) => {
    console.error(
      "[process] Uncaught exception — estado indeterminado, saliendo para que el supervisor reinicie:",
      error instanceof Error ? error.stack : error,
    );
    process.exit(1);
  });
}
