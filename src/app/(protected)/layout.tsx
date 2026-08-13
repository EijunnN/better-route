import { count } from "drizzle-orm";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout";
import { Toaster } from "@/components/ui/toaster";
import { db } from "@/db";
import { companies, USER_ROLES } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/auth";
import { getCompanyId } from "@/lib/infra/server-cache";

/**
 * Fresh-system guard: an ADMIN_SISTEMA with no companies yet is sent to
 * onboarding. Everything else renders normally, scoped to the *selected*
 * company (x-company-id header).
 *
 * Vive en el layout y no en la página a propósito. Estando en la página, el
 * layout ya había emitido el AppShell por streaming mientras el guard seguía
 * esperando el count contra Neon: el usuario veía el chrome del dashboard
 * durante toda esa query y recién después saltaba a onboarding. Acá el await
 * ocurre antes de que exista cualquier HTML, así que no hay flash.
 *
 * Barato para el caso normal: un usuario con companyId en el JWT sale en el
 * primer return sin tocar la DB. La query solo corre para un ADMIN_SISTEMA
 * sin workspace seleccionado.
 *
 * No hay riesgo de loop: /onboarding vive en el grupo (onboarding), fuera de
 * este layout.
 */
async function redirectIfNoCompanies() {
  const companyId = await getCompanyId();
  if (companyId) return;
  const user = await getCurrentUser();
  if (user?.role !== USER_ROLES.ADMIN_SISTEMA) return;
  const [c] = await db.select({ count: count() }).from(companies);
  if (c.count === 0) redirect("/onboarding");
}

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await redirectIfNoCompanies();
  return (
    <AppShell>
      {children}
      <Toaster />
    </AppShell>
  );
}
