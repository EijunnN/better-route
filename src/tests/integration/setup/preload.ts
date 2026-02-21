/**
 * Global test preload — runs before every test file.
 *
 * Responsibilities:
 *  1. Set environment variables needed by production modules.
 *  2. Mock modules that depend on the Next.js runtime or external services.
 *  3. Point `@/db` at the test database.
 */
import { mock } from "bun:test";
import { testDb } from "./test-db";

// ---------------------------------------------------------------------------
// 1. Environment
// ---------------------------------------------------------------------------
process.env.JWT_SECRET =
  "test-secret-key-for-integration-tests-minimum-32-characters!!";
process.env.NODE_ENV = "test";

// ---------------------------------------------------------------------------
// 2. Core framework mocks
// ---------------------------------------------------------------------------

// @/db → test database
mock.module("@/db", () => ({ db: testDb }));

// next/headers — cookies() only works inside a Next.js request
mock.module("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
    set: () => {},
    delete: () => {},
    has: () => false,
  }),
  headers: async () => new Headers(),
}));

// next/server — provide lightweight NextRequest/NextResponse + no-op after()
class TestNextRequest extends Request {
  nextUrl: URL;
  cookies: {
    get: (name: string) => { name: string; value: string } | undefined;
    set: () => void;
    delete: () => void;
    has: (name: string) => boolean;
  };

  constructor(input: string | URL | Request, init?: RequestInit) {
    super(input instanceof Request ? input : input, init);
    this.nextUrl = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url,
    );
    const self = this;
    this.cookies = {
      get(name: string) {
        const cookie = self.headers.get("cookie");
        if (!cookie) return undefined;
        const match = cookie.match(new RegExp(`${name}=([^;]+)`));
        return match ? { name, value: match[1] } : undefined;
      },
      set() {},
      delete() {},
      has(name: string) {
        return !!self.cookies.get(name);
      },
    };
  }
}

class TestNextResponse extends Response {
  static json(body: unknown, init?: ResponseInit) {
    const headers = new Headers(init?.headers);
    headers.set("content-type", "application/json");
    return new TestNextResponse(JSON.stringify(body), { ...init, headers });
  }

  static redirect(url: string | URL, status = 307) {
    return Response.redirect(url, status);
  }
}

mock.module("next/server", () => ({
  NextRequest: TestNextRequest,
  NextResponse: TestNextResponse,
  after: () => {}, // no-op in test context
}));

// ---------------------------------------------------------------------------
// 3. Infrastructure mocks (audit, locks, external optimizers)
// ---------------------------------------------------------------------------

mock.module("@/lib/infra/audit", () => ({
  logCreate: async () => {},
  logUpdate: async () => {},
  logDelete: async () => {},
  createAuditLog: async () => {},
}));

mock.module("@/lib/infra/job-queue", () => ({
  releaseCompanyLock: () => {},
  acquireCompanyLock: () => true,
  markCompanyLockCompleted: () => {},
  cancelJob: async () => true,
  canStartJob: () => true,
  registerJob: () => {},
  unregisterJob: () => {},
  setJobTimeout: () => {},
  updateJobProgress: async () => {},
  completeJob: async () => {},
  failJob: async () => {},
  getCachedResult: async () => null,
  getJobStatus: async () => null,
  isJobAborting: () => false,
  calculateInputHash: () => "test-hash",
  getActiveJobCount: () => 0,
  recoverStaleJobs: async () => {},
}));

// Plan validation — default to "valid" so confirm tests control it per-test
mock.module("@/lib/optimization/plan-validation", () => ({
  validatePlanForConfirmation: async () => ({
    isValid: true,
    canConfirm: true,
    issues: [],
    summary: { totalChecks: 5, errorCount: 0, warningCount: 0, infoCount: 0 },
    metrics: {},
  }),
  canConfirmPlan: () => true,
  getIssuesByCategory: () => ({}),
  getIssuesBySeverity: () => ({}),
  getValidationSummaryText: () => "Plan is valid and ready for confirmation",
}));

// Optimization runner — no real optimization in tests
mock.module("@/lib/optimization/optimization-runner", () => ({
  createAndExecuteJob: async () => ({
    jobId: crypto.randomUUID(),
    cached: false,
  }),
}));

// Plan metrics — return sensible defaults
mock.module("@/lib/optimization/plan-metrics", () => ({
  calculatePlanMetrics: (
    companyId: string,
    jobId: string,
    configurationId: string,
  ) => ({
    companyId,
    jobId,
    configurationId,
    totalRoutes: 1,
    totalStops: 2,
    totalDistance: 1000,
    totalDuration: 3600,
    averageUtilizationRate: 50,
    maxUtilizationRate: 80,
    minUtilizationRate: 20,
    timeWindowComplianceRate: 90,
    totalTimeWindowViolations: 0,
    driverAssignmentCoverage: 100,
    averageAssignmentQuality: 85,
    assignmentsWithWarnings: 0,
    assignmentsWithErrors: 0,
    skillCoverage: 100,
    licenseCompliance: 100,
    fleetAlignment: 100,
    workloadBalance: 80,
    unassignedOrders: 0,
    objective: "BALANCED",
    processingTimeMs: 500,
  }),
  calculateComparisonMetrics: async () => null,
}));

// Alert engine — no-op in tests
mock.module("@/lib/alerts/engine", () => ({
  createAlert: async () => ({}),
}));

// VROOM optimizer — no HTTP calls in tests
mock.module("@/lib/optimization/vroom-optimizer", () => ({
  optimizeRoutes: async () => ({
    routes: [],
    unassignedOrders: [],
    metrics: {
      totalDistance: 0,
      totalDuration: 0,
      totalRoutes: 0,
      totalStops: 0,
      utilizationRate: 0,
      timeWindowComplianceRate: 0,
    },
    summary: {
      optimizedAt: new Date().toISOString(),
      objective: "DISTANCE",
      processingTimeMs: 100,
    },
  }),
}));

// ---------------------------------------------------------------------------
// 4. Session store mock (in-memory replacement for Redis)
// ---------------------------------------------------------------------------

mock.module("@/lib/auth/session", () => {
  const sessions = new Map<string, Record<string, unknown>>();
  return {
    createSession: async (userId: string, data: Record<string, unknown>) => {
      const id = crypto.randomUUID();
      sessions.set(id, { userId, ...data, createdAt: new Date() });
      return id;
    },
    getSession: async (id: string) => sessions.get(id) || null,
    validateSession: async (id: string) => sessions.has(id),
    invalidateSession: async (id: string) => sessions.delete(id),
    getUserSessions: async (userId: string) =>
      [...sessions.entries()]
        .filter(([, s]) => s.userId === userId)
        .map(([id, s]) => ({ id, ...s })),
    isRefreshTokenValid: async () => true,
    invalidateAllSessions: async () => {
      const c = sessions.size;
      sessions.clear();
      return c;
    },
  };
});

// ---------------------------------------------------------------------------
// 5. R2 storage mock (fake presigned URLs)
// ---------------------------------------------------------------------------

mock.module("@/lib/storage/r2", () => ({
  generatePresignedUploadUrl: async (key: string) => ({
    uploadUrl: `https://fake-r2.test/upload/${key}`,
    publicUrl: `https://fake-r2.test/public/${key}`,
    key,
    expiresIn: 300,
  }),
  getFilePublicUrl: (key: string) => `https://fake-r2.test/public/${key}`,
  generateEvidenceKey: (companyId: string, filename: string) =>
    `evidence/${companyId}/${filename}`,
  generateUniqueFilename: (name: string) => `${crypto.randomUUID()}-${name}`,
  generateTrackingFilename: (trackingId: string, contentType: string, index: number) =>
    `${trackingId}-${index}.${contentType.split("/")[1]}`,
}));
