import { db } from "@/db";
import { companyFieldDefinitions } from "@/db/schema";

/**
 * Seeds default custom field definitions for a company.
 * These are example fields that companies can customize or remove.
 */
export async function seedDefaultFieldDefinitions(companyId: string) {
  const definitions = await db
    .insert(companyFieldDefinitions)
    .values([
      {
        companyId,
        entity: "orders",
        code: "referencia_cliente",
        label: "Referencia del cliente",
        fieldType: "text",
        required: false,
        placeholder: "Ej: REF-12345",
        position: 0,
        showInList: true,
        showInMobile: true,
        showInCsv: true,
        validationRules: { maxLength: 100 },
      },
      {
        companyId,
        entity: "orders",
        code: "tipo_servicio",
        label: "Tipo de servicio",
        fieldType: "select",
        required: false,
        options: ["Instalación", "Mantenimiento", "Entrega", "Recojo"],
        position: 1,
        showInList: true,
        showInMobile: true,
        showInCsv: true,
      },
      {
        companyId,
        entity: "orders",
        code: "monto_cobrar",
        label: "Monto a cobrar",
        fieldType: "currency",
        required: false,
        placeholder: "0.00",
        position: 2,
        showInList: false,
        showInMobile: true,
        showInCsv: true,
        validationRules: { min: 0 },
      },
    ])
    .returning();

  return { definitions, count: definitions.length };
}
