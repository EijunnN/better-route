import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  generateTokenPair,
  getRefreshToken,
  setAuthCookies,
  verifyToken,
} from "@/lib/auth/auth";
import {
  checkRefreshJti,
  invalidateSession,
  isRefreshTokenValid,
  registerRefreshJti,
} from "@/lib/auth/session";
import {
  checkRateLimit,
  getClientIp,
  getRateLimitHeaders,
  RATE_LIMITS,
} from "@/lib/infra/rate-limit";
import { withContractHeader } from "@/lib/mobile-contract";
import { AUTH_ERRORS } from "@/lib/validations/auth";

const ACCESS_TOKEN_EXPIRES_IN_SECONDS =
  process.env.NODE_ENV === "development" ? 24 * 60 * 60 : 15 * 60;

/**
 * POST /api/auth/refresh
 *
 * Refresh access token using a valid refresh token
 * Returns a new access token (and optionally a new refresh token)
 */
async function handlePost(request: NextRequest) {
  try {
    // Endpoint no autenticado (el refresh token ES la credencial): limitar por
    // IP para que no sea un multiplicador de trabajo JWT+DB+Redis sin cota.
    //
    // El bucket es API (100/min), NO AUTH (5/min): una flota entera de
    // conductores sale por la misma IP pública (CGNAT de la operadora), y si
    // el reverse proxy no manda `X-Real-IP` caen todos en la cubeta
    // "unknown". Con 5/min, el sexto conductor en refrescar su token queda
    // afuera. El límite estricto se aplica más abajo por sesión, que es la
    // unidad que de verdad describe el abuso.
    const ip = getClientIp(request);
    const rateLimit = await checkRateLimit(`refresh:ip:${ip}`, RATE_LIMITS.API);
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: AUTH_ERRORS.RATE_LIMITED },
        {
          status: 429,
          headers: getRateLimitHeaders(rateLimit, RATE_LIMITS.API),
        },
      );
    }

    // Get refresh token from cookie or request body
    const cookieToken = await getRefreshToken();

    let refreshToken = cookieToken;

    // Try to get from body if not in cookie
    if (!refreshToken) {
      try {
        const body = await request.json();
        refreshToken = body.refreshToken;
      } catch {
        // Body might be empty
      }
    }

    if (!refreshToken) {
      return NextResponse.json(
        { error: AUTH_ERRORS.INVALID_TOKEN },
        { status: 401 },
      );
    }

    // Verify refresh token
    const payload = await verifyToken(refreshToken);

    if (!payload || payload.type !== "refresh") {
      return NextResponse.json(
        { error: AUTH_ERRORS.INVALID_TOKEN },
        { status: 401 },
      );
    }

    // Rotación verificable exige sesión: un refresh token sin sessionId no
    // puede validarse contra Redis (reuso/revocación), así que se rechaza en
    // lugar de emitir un nuevo par igualmente huérfano de sesión.
    if (!payload.sessionId) {
      return NextResponse.json(
        { error: AUTH_ERRORS.INVALID_TOKEN },
        { status: 401 },
      );
    }

    // Límite estricto por SESIÓN: una sesión legítima refresca ~1 vez cada 15
    // min (el TTL del access token), así que 5/min es holgado y no lo comparte
    // con nadie — a diferencia de la IP.
    const sessionRateLimit = await checkRateLimit(
      `refresh:session:${payload.sessionId}`,
      RATE_LIMITS.AUTH,
    );
    if (!sessionRateLimit.success) {
      return NextResponse.json(
        { error: AUTH_ERRORS.RATE_LIMITED },
        { status: 429, headers: getRateLimitHeaders(sessionRateLimit) },
      );
    }

    // Validate refresh token against Redis session store
    // Prevents reuse of revoked tokens after logout
    const tokenValid = await isRefreshTokenValid(payload.sessionId);
    if (!tokenValid) {
      return NextResponse.json(
        { error: AUTH_ERRORS.INVALID_TOKEN },
        { status: 401 },
      );
    }

    // Rotación verificable: este token tiene que ser el vigente de su sesión.
    const jtiVerdict = await checkRefreshJti(payload.sessionId, payload.jti);

    if (jtiVerdict === "reused") {
      // Un token ya rotado y fuera de la ventana de gracia implica que hay
      // dos poseedores. No se puede saber cuál es el legítimo, así que se
      // corta la sesión entera y ambos re-autentican (OAuth 2.0 Security
      // BCP §4.14.2).
      await invalidateSession(payload.sessionId);
      console.warn(
        `[Auth] Refresh token reusado en la sesión ${payload.sessionId} — sesión revocada.`,
      );
      return NextResponse.json(
        { error: AUTH_ERRORS.INVALID_TOKEN },
        { status: 401 },
      );
    }

    if (jtiVerdict === "unavailable") {
      return NextResponse.json(
        { error: AUTH_ERRORS.INVALID_TOKEN },
        { status: 401 },
      );
    }

    // Get user from database
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
      return NextResponse.json(
        { error: AUTH_ERRORS.USER_INACTIVE },
        { status: 403 },
      );
    }

    // Generate new token pair (preserve sessionId for continued Redis validation)
    const tokens = await generateTokenPair({
      id: user.id,
      companyId: user.companyId,
      email: user.email,
      role: user.role,
      sessionId: payload.sessionId,
    });

    // El token que acabamos de reemplazar pasa a la ventana de gracia; a partir
    // de ahí, reusarlo es señal de robo.
    if (payload.sessionId) {
      await registerRefreshJti(payload.sessionId, tokens.refreshJti);
    }

    // Set new cookies
    await setAuthCookies(tokens.accessToken, tokens.refreshToken);

    return NextResponse.json({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: ACCESS_TOKEN_EXPIRES_IN_SECONDS,
    });
  } catch (error) {
    console.error("Token refresh error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export const POST = withContractHeader(handlePost);
