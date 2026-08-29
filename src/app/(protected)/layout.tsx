import { count, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout";
import { Toaster } from "@/components/ui/toaster";
import { db } from "@/db";
import { companies, USER_ROLES, users } from "@/db/schema";
import type { AuthUser } from "@/hooks/use-auth";
import { getCurrentUser } from "@/lib/auth/auth";
import { getUserPermissionsFromDB } from "@/lib/auth/authorization";
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

/**
 * Sesión para hidratar el cliente. Es exactamente lo que devuelve
 * `/api/auth/me`, resuelto acá para que el chrome salga pintado en el primer
 * HTML en vez de esperar esa llamada: verificar el JWT y sus tres queries
 * contra Neon costaban ~1,5 s de función fría, y durante ese rato el sidebar
 * mostraba skeleton en cada recarga.
 *
 * Las queries se hacen igual — pero acá, dentro de un render que ya está
 * corriendo y ya tiene conexión, en vez de en una invocación aparte.
 */
async function resolveInitialUser(): Promise<AuthUser | null> {
  const payload = await getCurrentUser();
  if (!payload) return null;

  const [user] = await db
    .select({
      id: users.id,
      companyId: users.companyId,
      email: users.email,
      name: users.name,
      role: users.role,
      active: users.active,
    })
    .from(users)
    .where(eq(users.id, payload.userId))
    .limit(1);

  if (!user?.active) return null;

  return {
    ...user,
    permissions: await getUserPermissionsFromDB(user.id, user.companyId),
  };
}

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await redirectIfNoCompanies();
  const initialUser = await resolveInitialUser();
  return (
    <AppShell initialUser={initialUser}>
      {children}
      <Toaster />
    </AppShell>
  );
}
