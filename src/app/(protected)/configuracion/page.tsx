"use client";

import { ProtectedPage } from "@/components/auth/protected-page";
import { ConfiguracionProvider, ConfiguracionView } from "@/components/configuracion";

export default function ConfiguracionPage() {
  return (
    <ProtectedPage requiredPermission="optimization_preset:read">
      <ConfiguracionProvider>
        <ConfiguracionView />
      </ConfiguracionProvider>
    </ProtectedPage>
  );
}
