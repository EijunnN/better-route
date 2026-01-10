import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { setTenantContext } from "./lib/tenant";

export function middleware(request: NextRequest) {
  const companyId = request.headers.get("x-company-id");
  const userId = request.headers.get("x-user-id");

  if (companyId) {
    setTenantContext({
      companyId,
      userId: userId || undefined,
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/api/:path*",
  ],
};
