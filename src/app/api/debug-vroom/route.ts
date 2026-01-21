import { type NextRequest, NextResponse } from "next/server";

const VROOM_URL = process.env.VROOM_URL || "http://localhost:5000";

/**
 * Debug endpoint to test VROOM connectivity and request format
 * GET: Test VROOM with a simple request
 * POST: Forward a custom request to VROOM and return the result
 */
export async function GET() {
  try {
    // Test with Lima coordinates
    const testRequest = {
      vehicles: [
        {
          id: 1,
          profile: "car",
          start: [-77.015631, -12.209934],
          end: [-77.015631, -12.209934],
          capacity: [30000],

          max_tasks: 30,
        },
      ],
      jobs: [
        {
          id: 1,
          location: [-77.020, -12.210],
          service: 600,
          delivery: [3400],
          description: "TEST-001",
        },
        {
          id: 2,
          location: [-77.025, -12.215],
          service: 600,
          delivery: [3400],
          description: "TEST-002",
        },
      ],
      options: { g: true },
      objectives: [
        { type: "min-cost", weight: 1 },
        { type: "min-duration", weight: 1 },
      ],
    };

    console.log("[DEBUG-VROOM] Sending test request to:", VROOM_URL);
    console.log("[DEBUG-VROOM] Request:", JSON.stringify(testRequest, null, 2));

    const response = await fetch(VROOM_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testRequest),
      signal: AbortSignal.timeout(30000),
    });

    const result = await response.json();

    return NextResponse.json({
      vroomUrl: VROOM_URL,
      status: response.status,
      vroomCode: result.code,
      vroomError: result.error,
      success: result.code === 0,
      summary: result.summary,
      routesCount: result.routes?.length || 0,
      unassignedCount: result.unassigned?.length || 0,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        vroomUrl: VROOM_URL,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    console.log("[DEBUG-VROOM] Forwarding request to:", VROOM_URL);
    console.log("[DEBUG-VROOM] Request:", JSON.stringify(body, null, 2));

    const response = await fetch(VROOM_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });

    const result = await response.json();

    console.log("[DEBUG-VROOM] Response code:", result.code);
    if (result.error) {
      console.log("[DEBUG-VROOM] Error:", result.error);
    }

    return NextResponse.json({
      vroomUrl: VROOM_URL,
      status: response.status,
      result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        vroomUrl: VROOM_URL,
      },
      { status: 500 }
    );
  }
}
