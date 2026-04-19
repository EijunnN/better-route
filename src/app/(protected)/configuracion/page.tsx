"use client";

import { ProtectedPage } from "@/components/auth/protected-page";
import { ConfiguracionProvider, ConfiguracionView } from "@/components/configuracion";

export default function ConfiguracionPage() {
  return (
    <ProtectedPage requiredPermission="company:update">
      <ConfiguracionProvider>
        <ConfiguracionView />
      </ConfiguracionProvider>
    </ProtectedPage>
  );
}
