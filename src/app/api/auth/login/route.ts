import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createAuthSession, generateTokenPair, setAuthCookies, verifyToken } from "@/lib/auth/auth";
import {
  checkRateLimit,
  getClientIp,
  getRateLimitHeaders,
  RATE_LIMITS,
} from "@/lib/infra/rate-limit";
import { AUTH_ERRORS, loginSchema } from "@/lib/validations/auth";

/**
 * POST /api/auth/login
 *
 * Authenticate a user with email and password
 * Returns access and refresh tokens
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limiting by IP
    const ip = getClientIp(request);
    const rateLimit = checkRateLimit(ip, RATE_LIMITS.AUTH);

    if (!rateLimit.success) {
      return NextResponse.json(
        { error: AUTH_ERRORS.RATE_LIMITED },
        {
          status: 429,
          headers: getRateLimitHeaders(rateLimit),
        },
      );
    }

    // Parse and validate request body
    const body = await request.json().catch(() => ({}));
    const validation = loginSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: AUTH_ERRORS.INVALID_CREDENTIALS,
          details: validation.error.issues,
        },
        { status: 400, headers: getRateLimitHeaders(rateLimit) },
      );
    }

    const { email, password } = validation.data;

    // Find user by email
    const userResult = await db
      .select({
        id: users.id,
        companyId: users.companyId,
        email: users.email,
        password: users.password,
        name: users.name,
        role: users.role,
        active: users.active,
      })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    const user = userResult[0];

    if (!user) {
      return NextResponse.json(
        { error: AUTH_ERRORS.USER_NOT_FOUND },
        { status: 401, headers: getRateLimitHeaders(rateLimit) },
      );
    }

    // Check if user is active
    if (!user.active) {
      return NextResponse.json(
        { error: AUTH_ERRORS.USER_INACTIVE },
        { status: 403, headers: getRateLimitHeaders(rateLimit) },
      );
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return NextResponse.json(
        { error: AUTH_ERRORS.INVALID_CREDENTIALS },
        { status: 401, headers: getRateLimitHeaders(rateLimit) },
      );
    }

    // Create session in Redis and generate tokens with sessionId
    const sessionId = await createAuthSession(
      { id: user.id, companyId: user.companyId, email: user.email, role: user.role },
      { userAgent: request.headers.get("user-agent") || undefined, ipAddress: ip },
    );

    const { accessToken, refreshToken } = await generateTokenPair({
      id: user.id,
      companyId: user.companyId,
      email: user.email,
      role: user.role,
      sessionId,
    });

    // Set cookies
    await setAuthCookies(accessToken, refreshToken);

    // Return response with user info and tokens
    return NextResponse.json(
      {
        user: {
          id: user.id,
          companyId: user.companyId,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        accessToken,
        refreshToken,
        expiresIn: 15 * 60, // 15 minutes in seconds
      },
      { headers: getRateLimitHeaders(rateLimit) },
    );
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/auth/login
 *
 * Check if user is authenticated
 */
export async function GET(request: NextRequest) {
  try {
    const cookieHeader = request.headers.get("cookie");
    if (!cookieHeader) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    // Parse cookies
    const cookies: Record<string, string> = {};
    cookieHeader.split(";").forEach((cookie) => {
      const [name, value] = cookie.trim().split("=");
      if (name && value) {
        cookies[name] = value;
      }
    });

    const accessToken = cookies.access_token;
    if (!accessToken) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    // Verify token
    const payload = await verifyToken(accessToken);
    if (!payload || payload.type !== "access") {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    // Get user details
    const userResult = await db
      .select({
        id: users.id,
        companyId: users.companyId,
        email: users.email,
        name: users.name,
        role: users.role,
        active: users.active,
      })
      .from(users)
      .where(eq(users.id, payload.userId))
      .limit(1);

    const user = userResult[0];

    if (!user || !user.active) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        id: user.id,
        companyId: user.companyId,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Auth check error:", error);
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
}
