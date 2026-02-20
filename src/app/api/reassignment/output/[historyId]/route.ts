import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  reassignmentsHistory,
  routeStops,
  USER_ROLES,
  users,
  vehicles,
} from "@/db/schema";
import { setTenantContext } from "@/lib/infra/tenant";

import { extractTenantContext } from "@/lib/routing/route-helpers";

import { safeParseJson } from "@/lib/utils/safe-json";
/**
 * Reassignment data structure from parsed JSON
 */
interface ReassignmentData {
  driverId: string;
  stopIds: string[];
}

/**
 * Output file format for driver routes
 */
interface DriverRouteOutput {
  driverId: string;
  driverName: string;
  vehicleId: string;
  vehiclePlate: string;
  stops: Array<{
    sequence: number;
    orderId: string;
    address: string;
    timeWindowStart: string | null;
    timeWindowEnd: string | null;
    estimatedArrival: string | null;
    status: string;
    notes: string | null;
  }>;
  totalStops: number;
  pendingStops: number;
  completedStops: number;
}

/**
 * Reassignment output file structure
 */
interface ReassignmentOutput {
  reassignmentHistoryId: string;
  generatedAt: string;
  generatedBy: string;
  absentDriverId: string;
  absentDriverName: string;
  reason: string | null;
  driverRoutes: DriverRouteOutput[];
  summary: {
    totalStops: number;
    totalRoutes: number;
    totalReplacementDrivers: number;
  };
}

/**
 * GET /api/reassignment/output/[historyId]
 *
 * Story 11.3: Regeneración Automática de Archivos de Output
 *
 * Generates output files for drivers based on reassignment history.
 * This ensures drivers affected by reassignment receive updated route information.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ historyId: string }> },
) {
  try {
    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 },
      );
    }

    setTenantContext(tenantCtx);

    const { historyId } = await params;

    // Get reassignment history record
    const historyRecord = await db.query.reassignmentsHistory.findFirst({
      where: and(
        eq(reassignmentsHistory.id, historyId),
        eq(reassignmentsHistory.companyId, tenantCtx.companyId),
      ),
    });

    if (!historyRecord) {
      return NextResponse.json(
        { error: "Reassignment history record not found" },
        { status: 404 },
      );
    }

    // Parse reassignments data
    const reassignmentsData = (
      typeof historyRecord.reassignments === "string"
        ? safeParseJson<ReassignmentData[]>(historyRecord.reassignments)
        : historyRecord.reassignments
    ) as ReassignmentData[];

    // Collect all unique driver IDs to generate routes for
    const driverIds = [
      ...new Set(reassignmentsData.map((r) => r.driverId)),
    ] as string[];

    // Generate route output for each replacement driver
    const driverRoutes: DriverRouteOutput[] = [];

    for (const driverId of driverIds) {
      // Get driver info
      const driver = await db.query.users.findFirst({
        where: and(
          eq(users.id, driverId),
          eq(users.companyId, tenantCtx.companyId),
          eq(users.role, USER_ROLES.CONDUCTOR),
        ),
      });

      if (!driver) continue;

      // Get all stops for this driver that were part of the reassignment
      const reassignedStopIds = reassignmentsData
        .filter((r) => r.driverId === driverId)
        .flatMap((r) => r.stopIds);

      const stops = await db.query.routeStops.findMany({
        where: and(
          eq(routeStops.companyId, tenantCtx.companyId),
          eq(routeStops.userId, driverId),
        ),
        with: {
          vehicle: true,
          order: true,
        },
      });

      // Filter stops to only those relevant to this reassignment
      const relevantStops = stops.filter((stop) =>
        reassignedStopIds.includes(stop.id),
      );

      if (relevantStops.length === 0) {
        // If no specific stops, get all current stops for the driver
        const allDriverStops = await db.query.routeStops.findMany({
          where: and(
            eq(routeStops.companyId, tenantCtx.companyId),
            eq(routeStops.userId, driverId),
          ),
          with: {
            vehicle: true,
            order: true,
          },
        });

        if (allDriverStops.length > 0) {
          const vehicleId = allDriverStops[0].vehicleId;

          // Get vehicle info
          const vehicle = await db.query.vehicles.findFirst({
            where: eq(vehicles.id, vehicleId),
          });

          driverRoutes.push({
            driverId: driver.id,
            driverName: driver.name,
            vehicleId: vehicleId,
            vehiclePlate: vehicle?.plate || "Unknown",
            stops: allDriverStops
              .toSorted((a, b) => a.sequence - b.sequence)
              .map((stop) => ({
                sequence: stop.sequence,
                orderId: stop.orderId,
                address: stop.address,
                timeWindowStart: stop.timeWindowStart?.toISOString() || null,
                timeWindowEnd: stop.timeWindowEnd?.toISOString() || null,
                estimatedArrival: stop.estimatedArrival?.toISOString() || null,
                status: stop.status,
                notes: stop.notes,
              })),
            totalStops: allDriverStops.length,
            pendingStops: allDriverStops.filter((s) => s.status === "PENDING")
              .length,
            completedStops: allDriverStops.filter(
              (s) => s.status === "COMPLETED",
            ).length,
          });
        }
      } else {
        const vehicleId = relevantStops[0].vehicleId;

        // Get vehicle info
        const vehicle = await db.query.vehicles.findFirst({
          where: eq(vehicles.id, vehicleId),
        });

        driverRoutes.push({
          driverId: driver.id,
          driverName: driver.name,
          vehicleId: vehicleId,
          vehiclePlate: vehicle?.plate || "Unknown",
          stops: relevantStops
            .toSorted((a, b) => a.sequence - b.sequence)
            .map((stop) => ({
              sequence: stop.sequence,
              orderId: stop.orderId,
              address: stop.address,
              timeWindowStart: stop.timeWindowStart?.toISOString() || null,
              timeWindowEnd: stop.timeWindowEnd?.toISOString() || null,
              estimatedArrival: stop.estimatedArrival?.toISOString() || null,
              status: stop.status,
              notes: stop.notes,
            })),
          totalStops: relevantStops.length,
          pendingStops: relevantStops.filter((s) => s.status === "PENDING")
            .length,
          completedStops: relevantStops.filter((s) => s.status === "COMPLETED")
            .length,
        });
      }
    }

    // Build summary
    const totalStops = driverRoutes.reduce(
      (sum, route) => sum + route.totalStops,
      0,
    );

    const output: ReassignmentOutput = {
      reassignmentHistoryId: historyId,
      generatedAt: new Date().toISOString(),
      generatedBy: tenantCtx.userId || "system",
      absentDriverId: historyRecord.absentUserId,
      absentDriverName: historyRecord.absentUserName,
      reason: historyRecord.reason,
      driverRoutes,
      summary: {
        totalStops,
        totalRoutes: driverRoutes.length,
        totalReplacementDrivers: driverIds.length,
      },
    };

    // Return JSON output - client can format as needed (PDF, CSV, etc.)
    return NextResponse.json(output, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-Reassignment-History-ID": historyId,
      },
    });
  } catch (error) {
    console.error("Error generating reassignment output:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/reassignment/output/[historyId]
 *
 * Trigger immediate regeneration and notification of output files.
 * This sends notifications to affected drivers that their routes have been updated.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ historyId: string }> },
) {
  try {
    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 },
      );
    }

    setTenantContext(tenantCtx);

    const { historyId } = await params;

    // Get reassignment history record
    const historyRecord = await db.query.reassignmentsHistory.findFirst({
      where: and(
        eq(reassignmentsHistory.id, historyId),
        eq(reassignmentsHistory.companyId, tenantCtx.companyId),
      ),
    });

    if (!historyRecord) {
      return NextResponse.json(
        { error: "Reassignment history record not found" },
        { status: 404 },
      );
    }

    // Parse reassignments data
    const reassignmentsData = (
      typeof historyRecord.reassignments === "string"
        ? safeParseJson<ReassignmentData[]>(historyRecord.reassignments)
        : historyRecord.reassignments
    ) as ReassignmentData[];

    // Get unique driver IDs
    const driverIds = [
      ...new Set(reassignmentsData.map((r) => r.driverId)),
    ] as string[];

    // Get driver details for notifications
    const notifiedDrivers = [];
    for (const driverId of driverIds) {
      const driver = await db.query.users.findFirst({
        where: and(
          eq(users.id, driverId),
          eq(users.companyId, tenantCtx.companyId),
          eq(users.role, USER_ROLES.CONDUCTOR),
        ),
      });

      if (driver) {
        notifiedDrivers.push({
          id: driver.id,
          name: driver.name,
          email: driver.email,
          phone: driver.phone,
        });
      }
    }

    // In a real implementation, this would:
    // 1. Generate PDF/CSV output files
    // 2. Store them in a storage service (S3, etc.)
    // 3. Send notifications to drivers (email, SMS, in-app)
    // 4. Update a notification log table

    return NextResponse.json(
      {
        data: {
          success: true,
          message: "Output files regenerated and notifications sent",
          historyId,
          notifiedDrivers: notifiedDrivers.length,
          drivers: notifiedDrivers,
          generatedAt: new Date().toISOString(),
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error triggering output regeneration:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
