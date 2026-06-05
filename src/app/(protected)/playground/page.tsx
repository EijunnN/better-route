"use client";

import { ProtectedPage } from "@/components/auth/protected-page";
import { PlaygroundView } from "@/components/playground";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const PLAYGROUND_ENABLED = process.env.NEXT_PUBLIC_ENABLE_PLAYGROUND === "true";

export default function PlaygroundPage() {
  if (!PLAYGROUND_ENABLED) {
    return (
      <div className="mx-auto w-full max-w-lg p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">No disponible</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            El playground de datos de prueba está deshabilitado en este entorno.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <ProtectedPage requiredPermission="company:create">
      <PlaygroundView />
    </ProtectedPage>
  );
}
