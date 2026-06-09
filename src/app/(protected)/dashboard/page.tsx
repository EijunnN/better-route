import { count } from "drizzle-orm";
import { redirect } from "next/navigation";
import { ProtectedPage } from "@/components/auth/protected-page";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { db } from "@/db";
import { companies, USER_ROLES } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/auth";
import { getCompanyId } from "@/lib/infra/server-cache";

/**
 * Fresh-system guard: an ADMIN_SISTEMA with no companies yet is sent to
 * onboarding. Everything else renders the client dashboard, which fetches its
 * data scoped to the *selected* company (x-company-id header) — so switching
 * workspaces updates the dashboard live, like the rest of the app.
 */
async function redirectIfNoCompanies() {
  const companyId = await getCompanyId();
  if (companyId) return;
  const user = await getCurrentUser();
  if (user?.role !== USER_ROLES.ADMIN_SISTEMA) return;
  const [c] = await db.select({ count: count() }).from(companies);
  if (c.count === 0) redirect("/onboarding");
}

export default async function DashboardPage() {
  await redirectIfNoCompanies();
  return (
    <ProtectedPage requiredPermission="metrics:read">
      <DashboardClient />
    </ProtectedPage>
  );
}
