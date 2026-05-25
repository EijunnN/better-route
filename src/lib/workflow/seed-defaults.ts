import { db } from "@/db";
import { companyDeliveryPolicy } from "@/db/schema";

/**
 * Seed a default delivery-policy row for a freshly-created company.
 * All columns have DB-level defaults so this insert really only needs
 * the `companyId`. We pass `onConflictDoNothing` so re-running the
 * seed on an existing company is a no-op rather than an error.
 */
export async function seedDefaultDeliveryPolicy(companyId: string) {
  await db
    .insert(companyDeliveryPolicy)
    .values({ companyId })
    .onConflictDoNothing();
}
