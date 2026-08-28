import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { after, type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { optimizationConfigurations, optimizationJobs } from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { Action, EntityType } from "@/lib/auth/authorization";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { logCreate } from "@/lib/infra/audit";
import { setTenantContext } from "@/lib/infra/tenant";
import { createAndExecuteJob } from "@/lib/optimization/optimization-job";
import type { PlanLevelMetrics } from "@/lib/optimization/solved-plan";
import { extractTenantContextAuthed } from "@/lib/routing/route-helpers";

/**
 * Con OPTIMIZATION_INLINE/VERCEL el solve corre dentro de este request en vez
 * de soltarse al proceso, así que el handler tiene que durar lo que dure la
 * corrida. 300 s es el techo del plan Hobby de Vercel y deja margen sobre
 * VROOM_TIMEOUT (240 s). En un VPS este export es inocuo: el job se suelta y
 * la respuesta sale igual de rápido.
 */
export const maxDuration = 300;

import {
  optimizationJobCreateSchema,
  optimizationJobQuerySchema,
} from "@/lib/validations/optimization-job";

/**
 * Lo único del VerifiedPlan que la vista de historial pinta por fila.
 * El plan completo (rutas, paradas, geometrías, violaciones) se pide por
 * `GET /api/optimization/jobs/[id]` cuando el usuario abre uno.
 */
interface OptimizationJobResultSummary {
  isPartial: boolean;
  metrics: PlanLevelMetrics | null;
  unassignedCount: number;
}

/**
 * Proyección del `result` JSONB a su resumen, calculada en Postgres.
 *
 * Seleccionar la columna entera acá cargaba el VerifiedPlan completo de cada
 * job del page —planes de 1000+ órdenes con geometrías— en el heap del
 * proceso, para después serializarlos al navegador y usar cuatro números.
 *
 * Defensivo con `jsonb_typeof` a propósito: los planes viejos pueden no
 * traer todas las claves, y `jsonb_array_length` sobre un escalar es error
 * de Postgres, no NULL.
 */
const resultSummarySql = sql<OptimizationJobResultSummary | null>`
  case
    when ${optimizationJobs.result} is null then null
    else jsonb_build_object(
      'isPartial',
        coalesce(${optimizationJobs.result} -> 'isPartial', 'false'::jsonb),
      'metrics',
        ${optimizationJobs.result} -> 'metrics',
      'unassignedCount',
        case
          when jsonb_typeof(${optimizationJobs.result} -> 'unassignedOrders') = 'array'
            then jsonb_array_length(${optimizationJobs.result} -> 'unassignedOrders')
          else 0
        end
    )
  end
`;

// GET - List optimization jobs
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRoutePermission(
      request,
      EntityType.OPTIMIZATION_JOB,
      Action.READ,
    );
    if (authResult instanceof NextResponse) return authResult;
    const tenantCtx = extractTenantContextAuthed(request, authResult);
    if (tenantCtx instanceof NextResponse) return tenantCtx;
    setTenantContext(tenantCtx);
    const { searchParams } = new URL(request.url);

    const query = optimizationJobQuerySchema.parse(
      Object.fromEntries(searchParams),
    );

    const conditions = [
      withTenantFilter(optimizationJobs, [], tenantCtx.companyId),
    ];

    if (query.status) {
      conditions.push(eq(optimizationJobs.status, query.status));
    }

    if (query.search) {
      conditions.push(
        ilike(optimizationConfigurations.name, `%${query.search}%`),
      );
    }

    // Always JOIN with configurations to get name and support search
    const joinClause = eq(
      optimizationJobs.configurationId,
      optimizationConfigurations.id,
    );

    // Execute paginated query and count in parallel
    const [jobs, [{ count }]] = await Promise.all([
      db
        .select({
          id: optimizationJobs.id,
          configurationId: optimizationJobs.configurationId,
          configurationName: optimizationConfigurations.name,
          configurationStatus: optimizationConfigurations.status,
          status: optimizationJobs.status,
          progress: optimizationJobs.progress,
          resultSummary: resultSummarySql,
          error: optimizationJobs.error,
          startedAt: optimizationJobs.startedAt,
          completedAt: optimizationJobs.completedAt,
          cancelledAt: optimizationJobs.cancelledAt,
          timeoutMs: optimizationJobs.timeoutMs,
          createdAt: optimizationJobs.createdAt,
          updatedAt: optimizationJobs.updatedAt,
        })
        .from(optimizationJobs)
        .leftJoin(optimizationConfigurations, joinClause)
        .where(and(...conditions))
        .orderBy(desc(optimizationJobs.createdAt))
        .limit(query.limit)
        .offset(query.offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(optimizationJobs)
        .leftJoin(optimizationConfigurations, joinClause)
        .where(and(...conditions)),
    ]);

    return NextResponse.json({
      data: jobs,
      meta: {
        total: count,
        limit: query.limit,
        offset: query.offset,
      },
    });
  } catch (error) {
    after(() => console.error("Error fetching optimization jobs:", error));
    return NextResponse.json(
      { error: "Failed to fetch jobs" },
      { status: 500 },
    );
  }
}

// POST - Create and start optimization job
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRoutePermission(
      request,
      EntityType.OPTIMIZATION_JOB,
      Action.CREATE,
    );
    if (authResult instanceof NextResponse) return authResult;
    const tenantCtx = extractTenantContextAuthed(request, authResult);
    if (tenantCtx instanceof NextResponse) return tenantCtx;
    setTenantContext(tenantCtx);

    const body = await request.json();
    const data = optimizationJobCreateSchema.parse(body);

    // Verify configuration exists and belongs to tenant
    const config = await db.query.optimizationConfigurations.findFirst({
      where: and(
        eq(optimizationConfigurations.id, data.configurationId),
        withTenantFilter(optimizationConfigurations, [], tenantCtx.companyId),
      ),
    });

    if (!config) {
      return NextResponse.json(
        { error: "Configuration not found" },
        { status: 404 },
      );
    }

    // Create and execute job
    const { jobId, cached } = await createAndExecuteJob(
      {
        configurationId: data.configurationId,
        companyId: tenantCtx.companyId,
        vehicleIds: data.vehicleIds,
        driverIds: data.driverIds,
      },
      data.timeoutMs,
    );

    // Log job creation (non-blocking)
    after(async () => {
      await logCreate("optimization_job", jobId, {
        configurationId: data.configurationId,
        vehicleCount: data.vehicleIds.length,
        driverCount: data.driverIds.length,
        cached,
      });
    });

    return NextResponse.json(
      {
        data: {
          id: jobId,
          cached,
          message: cached
            ? "Returned cached optimization result"
            : "Optimization job started",
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Error) {
      // Handle known errors
      if (error.message.includes("Maximum concurrent jobs")) {
        return NextResponse.json(
          { error: error.message },
          { status: 429 }, // Too Many Requests
        );
      }
    }
    after(() => console.error("Error creating optimization job:", error));
    return NextResponse.json(
      { error: "Failed to create optimization job" },
      { status: 500 },
    );
  }
}
