"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="mx-auto max-w-md text-center p-8">
          <h1 className="text-2xl font-bold mb-4">Algo salio mal</h1>
          <p className="text-muted-foreground mb-6">
            Ocurrio un error inesperado. Por favor, intenta nuevamente.
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
      </body>
    </html>
  );
}
