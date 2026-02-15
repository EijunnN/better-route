import { z } from "zod";

// Job creation schema
export const optimizationJobCreateSchema = z.object({
  configurationId: z.string().uuid(),
  vehicleIds: z
    .array(z.string().uuid())
    .min(1, "At least one vehicle required"),
  driverIds: z.array(z.string().uuid()).min(1, "At least one driver required"),
  timeoutMs: z.number().int().min(1000).max(600000).optional().default(300000), // 1 min to 10 mins
});

// Job query schema
export const optimizationJobQuerySchema = z.object({
  status: z
    .enum(["PENDING", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"])
    .optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

// Job status response schema
export const optimizationJobStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["PENDING", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"]),
  progress: z.number().int().min(0).max(100),
  result: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  cancelledAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type OptimizationJobCreate = z.infer<typeof optimizationJobCreateSchema>;
export type OptimizationJobQuery = z.infer<typeof optimizationJobQuerySchema>;
export type OptimizationJobStatus = z.infer<typeof optimizationJobStatusSchema>;
