import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { extractTokenFromAuthHeader, verifyToken } from "./lib/auth/auth";
import { setTenantContext } from "./lib/infra/tenant";
import { AUTH_ERRORS } from "./lib/validations/auth";

const PUBLIC_API_ROUTES = [
  "/api/auth/login",
  "/api/auth/refresh",
  "/api/health",
  "/api/docs",
  "/api/public/tracking",
];

const PUBLIC_PAGE_ROUTES = ["/login"];

const OPTIONAL_AUTH_ROUTES = [
  "/api/monitoring/summary",
  "/api/monitoring/geojson",
];

function isPublicApiRoute(pathname: string): boolean {
  return PUBLIC_API_ROUTES.some((route) => pathname.startsWith(route));
}

function isPublicPageRoute(pathname: string): boolean {
  return PUBLIC_PAGE_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

function isOptionalAuthRoute(pathname: string): boolean {
  return OPTIONAL_AUTH_ROUTES.some((route) => pathname.startsWith(route));
}

function isApiRoute(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Handle public page routes
  if (isPublicPageRoute(pathname)) {
    return NextResponse.next();
  }

  // Handle API routes
  if (isApiRoute(pathname)) {
    const isPublic = isPublicApiRoute(pathname);
    const isOptionalAuth = isOptionalAuthRoute(pathname);

    let payload = null;

    // Try to get token from Authorization header first
    const authHeader = request.headers.get("authorization");
    if (authHeader) {
      const token = extractTokenFromAuthHeader(authHeader);
      if (token) {
        payload = await verifyToken(token);
      }
    }

    // If no Authorization header, try cookie (for browser requests)
    if (!payload) {
      const accessToken = request.cookies.get("access_token")?.value;
      if (accessToken) {
        payload = await verifyToken(accessToken);
      }
    }

    if (!isPublic && !isOptionalAuth && !payload) {
      return NextResponse.json(
        { error: AUTH_ERRORS.UNAUTHORIZED },
        { status: 401 },
      );
    }

    const headerCompanyId = request.headers.get("x-company-id");
    let userId = request.headers.get("x-user-id");
    let effectiveCompanyId: string | null = headerCompanyId;

    if (payload && payload.type === "access") {
      userId = payload.userId;

      // Determine effective companyId:
      // - ADMIN_SISTEMA (companyId=null in JWT) can use header to switch companies
      // - Other roles must use their JWT companyId for security
      if (payload.role === "ADMIN_SISTEMA") {
        // ADMIN_SISTEMA uses header companyId if provided, otherwise null
        effectiveCompanyId = headerCompanyId || null;
      } else {
        // Non-admin users always use their JWT companyId
        effectiveCompanyId = payload.companyId;
      }
    }

    if (effectiveCompanyId) {
      setTenantContext({
        companyId: effectiveCompanyId,
        userId: userId || undefined,
      });
    }

    // Create new request headers with the auth context
    const requestHeaders = new Headers(request.headers);

    if (payload && payload.type === "access") {
      requestHeaders.set("x-user-id", payload.userId);
      requestHeaders.set("x-user-email", payload.email);
      requestHeaders.set("x-user-role", payload.role);
      // Set the effective companyId (or remove if null)
      if (effectiveCompanyId) {
        requestHeaders.set("x-company-id", effectiveCompanyId);
      } else {
        requestHeaders.delete("x-company-id");
      }
    }

    // Pass modified headers to the route handler
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  // Handle protected page routes - check access_token cookie
  const accessToken = request.cookies.get("access_token")?.value;

  if (!accessToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Optionally verify the token for page routes
  const payload = await verifyToken(accessToken);
  if (!payload) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
