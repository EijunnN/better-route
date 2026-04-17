import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { reassignmentsHistory } from "@/db/schema";

import { safeParseJson } from "@/lib/utils/safe-json";
import type { ReassignmentHistoryEntry } from "./types";

export async function getReassignmentHistory(
  companyId: string,
  jobId?: string,
  driverId?: string,
  limit: number = 50,
  offset: number = 0,
): Promise<ReassignmentHistoryEntry[]> {
  const conditions = [eq(reassignmentsHistory.companyId, companyId)];

  if (jobId) {
    conditions.push(eq(reassignmentsHistory.jobId, jobId));
  }

  if (driverId) {
    conditions.push(eq(reassignmentsHistory.absentUserId, driverId));
  }

  const historyRecords = await db.query.reassignmentsHistory.findMany({
    where: and(...conditions),
    orderBy: [desc(reassignmentsHistory.executedAt)],
    limit,
    offset,
  });

  return historyRecords.map((record) => {
    const routeIds = safeParseJson<string[]>(record.routeIds);
    const reassignments = safeParseJson<Array<{ userId: string; userName: string; stopCount: number }>>(record.reassignments);

    return {
      id: record.id,
      absentDriverId: record.absentUserId,
      absentDriverName: record.absentUserName,
      replacementDrivers: reassignments.map(
        (r: { userId: string; userName: string; stopCount: number }) => ({
          id: r.userId,
          name: r.userName,
          stopsAssigned: r.stopCount,
        }),
      ),
      routeIds,
      reason: record.reason || "",
      createdAt: record.createdAt,
      createdBy: record.executedBy || "",
    };
  });
}
