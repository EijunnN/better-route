"use client";

import { useEffect } from "react";

export default function ProtectedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Protected Route Error]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="mx-auto max-w-md text-center p-8">
        <div className="mb-4 text-4xl">!</div>
        <h2 className="text-xl font-semibold mb-2">Error en la pagina</h2>
        <p className="text-muted-foreground mb-6">
          Ocurrio un error al cargar esta seccion. Puedes intentar recargarla.
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground mb-4">
            Referencia: {error.digest}
          </p>
        )}
        <button
          onClick={reset}
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Reintentar
        </button>
      </div>
    </div>
  );
}
