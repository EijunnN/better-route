import { type NextRequest, NextResponse } from "next/server";
import { Action, EntityType } from "@/lib/auth/authorization";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { monitoringBus, monitoringChannel } from "@/lib/realtime";

// SSE stays open for the lifetime of the page — must run on Node.js
// (Edge has aggressive request timeouts) and never be cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_INTERVAL_MS = 25_000;
const encoder = new TextEncoder();

function sseFrame(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/**
 * Resolve the tenant for an SSE connection. Mirrors the security rules
 * of `extractTenantContextAuthed` but reads from the query string —
 * the browser `EventSource` constructor doesn't allow custom headers,
 * so we can't rely on `x-company-id` here.
 */
function resolveTenantForStream(
  request: NextRequest,
  user: { role: string; userId: string; companyId: string | null },
): { companyId: string } | NextResponse {
  const queryCompanyId = request.nextUrl.searchParams.get("companyId");

  if (user.role === "ADMIN_SISTEMA") {
    if (!queryCompanyId) {
      return NextResponse.json(
        {
          error: "companyId query param required for ADMIN_SISTEMA",
          code: "COMPANY_REQUIRED",
        },
        { status: 400 },
      );
    }
    return { companyId: queryCompanyId };
  }

  if (!user.companyId) {
    return NextResponse.json(
      { error: "User has no company", code: "NO_COMPANY" },
      { status: 403 },
    );
  }

  if (queryCompanyId && queryCompanyId !== user.companyId) {
    return NextResponse.json(
      { error: "Tenant mismatch", code: "TENANT_MISMATCH" },
      { status: 403 },
    );
  }

  return { companyId: user.companyId };
}

export async function GET(request: NextRequest) {
  const authResult = await requireRoutePermission(
    request,
    EntityType.METRICS,
    Action.READ,
  );
  if (authResult instanceof NextResponse) return authResult;
  const tenantCtx = resolveTenantForStream(request, authResult);
  if (tenantCtx instanceof NextResponse) return tenantCtx;

  const channel = monitoringChannel(tenantCtx.companyId);

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const safeEnqueue = (chunk: Uint8Array) => {
        if (closed) return;
        try {
          controller.enqueue(chunk);
        } catch {
          closed = true;
        }
      };

      // Initial handshake — lets the client confirm the channel and
      // measure round-trip time before any real event lands.
      safeEnqueue(sseFrame("ready", { channel, at: new Date().toISOString() }));

      const unsubscribe = monitoringBus.subscribe(channel, (event) => {
        safeEnqueue(sseFrame(event.kind, event));
      });

      // Heartbeat — proxies and load balancers drop idle SSE
      // connections after ~30-60s. A comment frame keeps the pipe
      // warm without polluting the event stream client-side.
      const heartbeat = setInterval(() => {
        safeEnqueue(encoder.encode(": heartbeat\n\n"));
      }, HEARTBEAT_INTERVAL_MS);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      request.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
