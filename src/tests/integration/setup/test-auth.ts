/**
 * Test authentication helpers.
 *
 * Signs JWTs directly with jose (same library as production) so tests
 * can create valid Bearer tokens without hitting the login endpoint.
 */
import { SignJWT } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ||
    "test-secret-key-for-integration-tests-minimum-32-characters!!",
);

export interface TestTokenPayload {
  userId: string;
  companyId: string | null;
  email: string;
  role: string;
}

/**
 * Create a valid access token for testing.
 */
export async function createTestToken(
  payload: TestTokenPayload,
): Promise<string> {
  return await new SignJWT({ ...payload, type: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15min")
    .setSubject(payload.userId)
    .sign(JWT_SECRET);
}

/**
 * Create an expired access token for testing expiration handling.
 */
export async function createExpiredToken(
  payload: TestTokenPayload,
): Promise<string> {
  return await new SignJWT({ ...payload, type: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 1800)
    .setSubject(payload.userId)
    .sign(JWT_SECRET);
}

/**
 * Create a refresh token for testing.
 */
export async function createTestRefreshToken(
  payload: TestTokenPayload & { sessionId?: string },
): Promise<string> {
  return await new SignJWT({ ...payload, type: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .setSubject(payload.userId)
    .sign(JWT_SECRET);
}
