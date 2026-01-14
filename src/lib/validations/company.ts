import { z } from "zod";

export const companySchema = z.object({
  legalName: z.string().min(1, "Nombre legal es requerido").max(255),
  commercialName: z.string().min(1, "Nombre comercial es requerido").max(255),
  email: z.string().email("Correo electrónico inválido"),
  phone: z.string().optional(),
  taxAddress: z.string().optional(),
  country: z.string().length(2, "Código de país debe ser ISO 3166-1 alpha-2"),
  timezone: z.string().default("UTC"),
  currency: z
    .string()
    .length(3, "Código de moneda debe ser ISO 4217")
    .default("USD"),
  dateFormat: z.string().default("DD/MM/YYYY"),
  active: z.boolean().default(true),
});

export const updateCompanySchema = z.object({
  id: z.string().uuid(),
  legalName: z.string().min(1).max(255).optional(),
  commercialName: z.string().min(1).max(255).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  taxAddress: z.string().optional(),
  country: z.string().length(2).optional(),
  timezone: z.string().optional(),
  currency: z.string().length(3).optional(),
  dateFormat: z.string().optional(),
  active: z.boolean().optional(),
});

export const companyQuerySchema = z.object({
  active: z.coerce.boolean().optional(),
  country: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

export type CompanyInput = z.infer<typeof companySchema>;
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;
export type CompanyQuery = z.infer<typeof companyQuerySchema>;
