import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { USER_ROLES, users } from "@/db/schema";
import {
  createAuthSession,
  generateTokenPair,
  setAuthCookies,
  verifyToken,
} from "@/lib/auth/auth";
import { registerRefreshJti } from "@/lib/auth/session";
import {
  checkRateLimit,
  getClientIp,
  getRateLimitHeaders,
  RATE_LIMITS,
  resetRateLimit,
} from "@/lib/infra/rate-limit";
import { withContractHeader } from "@/lib/mobile-contract";
import { AUTH_ERRORS, loginSchema } from "@/lib/validations/auth";

const ACCESS_TOKEN_EXPIRES_IN_SECONDS =
  process.env.NODE_ENV === "development" ? 24 * 60 * 60 : 15 * 60;

/**
 * Hash bcrypt (cost 10, el mismo que usa el alta de usuarios) de una cadena
 * aleatoria que nadie conoce. Se compara contra él cuando el email no existe,
 * para que un login fallido cueste lo mismo exista o no la cuenta: sin esto,
 * responder ~100 ms más rápido delata qué emails están registrados aunque el
 * mensaje de error sea idéntico.
 */
const DUMMY_PASSWORD_HASH =
  "$2b$10$s32UBLJcd.Ur26L.0mVIzujZDw2gW8viNua662zDKhg3dPY9xW7z2";

/**
 * POST /api/auth/login
 *
 * Authenticate a user with email and password
 * Returns access and refresh tokens
 */
async function handlePost(request: NextRequest) {
  try {
    // Rate limiting by IP
    const ip = getClientIp(request);
    const rateLimit = await checkRateLimit(`auth:ip:${ip}`, RATE_LIMITS.AUTH);

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

    // Segunda dimensión: sin reverse proxy que setee los headers de IP, todos
    // los clientes comparten la cubeta "unknown". Limitar también por email
    // mantiene protegida cada cuenta y evita que un atacante agote la cubeta
    // compartida y deje a todos afuera.
    const emailRateLimit = await checkRateLimit(
      `auth:email:${email.toLowerCase()}`,
      RATE_LIMITS.AUTH,
    );

    if (!emailRateLimit.success) {
      return NextResponse.json(
        { error: AUTH_ERRORS.RATE_LIMITED },
        { status: 429, headers: getRateLimitHeaders(emailRateLimit) },
      );
    }

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

    // Se corre bcrypt SIEMPRE (contra el hash dummy si no hay usuario) para no
    // filtrar por tiempo si el email existe.
    const isPasswordValid = await bcrypt.compare(
      password,
      user?.password ?? DUMMY_PASSWORD_HASH,
    );

    if (!user || !isPasswordValid) {
      // Respuesta única para "no existe" y "password incorrecta": distinguirlas
      // convierte al endpoint en un oráculo de emails registrados.
      return NextResponse.json(
        { error: AUTH_ERRORS.INVALID_CREDENTIALS },
        { status: 401, headers: getRateLimitHeaders(rateLimit) },
      );
    }

    // El chequeo de cuenta inactiva va DESPUÉS de validar la password: quien
    // llega hasta acá ya probó conocer la credencial, así que el 403 no revela
    // nada nuevo — y el móvil sigue distinguiendo "inactivo" de "credenciales".
    if (!user.active) {
      return NextResponse.json(
        { error: AUTH_ERRORS.USER_INACTIVE },
        { status: 403, headers: getRateLimitHeaders(rateLimit) },
      );
    }

    // A driver logging in is back online — the monitoring dashboard
    // reads users.appOnline (see the logout gap fix).
    if (user.role === USER_ROLES.CONDUCTOR) {
      await db
        .update(users)
        .set({ appOnline: true })
        .where(eq(users.id, user.id));
    }

    // Credencial correcta: liberá la cubeta por email para no arrastrar los
    // intentos fallidos previos de un usuario legítimo.
    await resetRateLimit(`auth:email:${email.toLowerCase()}`);

    // Create session in Redis and generate tokens with sessionId
    const sessionId = await createAuthSession(
      {
        id: user.id,
        companyId: user.companyId,
        email: user.email,
        role: user.role,
      },
      {
        userAgent: request.headers.get("user-agent") || undefined,
        ipAddress: ip,
      },
    );

    const { accessToken, refreshToken, refreshJti } = await generateTokenPair({
      id: user.id,
      companyId: user.companyId,
      email: user.email,
      role: user.role,
      sessionId,
    });

    await registerRefreshJti(sessionId, refreshJti);

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
        expiresIn: ACCESS_TOKEN_EXPIRES_IN_SECONDS,
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

export const POST = withContractHeader(handlePost);

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
