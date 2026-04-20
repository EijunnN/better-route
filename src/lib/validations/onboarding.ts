import { z } from "zod";

export const onboardingSetupSchema = z.object({
  legalName: z.string().min(1, "Nombre legal es requerido").max(255),
  commercialName: z.string().min(1, "Nombre comercial es requerido").max(255),
  email: z.string().email("Correo electrónico inválido"),
  country: z.string().length(2, "Código de país debe ser ISO 3166-1 alpha-2"),
  timezone: z.string().default("UTC"),
});

export type OnboardingSetupInput = z.infer<typeof onboardingSetupSchema>;
