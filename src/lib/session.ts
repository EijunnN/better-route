/**
 * Redis Session Management
 *
 * Implements Story 15.1 - Gestión de Sesiones con Redis
 * - Sessions stored in Redis with configurable TTL
 * - User activity renews session TTL
 * - Expired sessions automatically invalidated
 * - API validates session on each request
 * - Admins can invalidate user sessions
 * - Global invalidation supported
 * - Refresh tokens invalidated when session revoked
 */

import { Redis } from "@upstash/redis";

// Session configuration
const SESSION_TTL = 7 * 24 * 60 * 60; // 7 days in seconds
const SESSION_PREFIX = "session:";
const REFRESH_TOKEN_PREFIX = "refresh_token:";
const USER_SESSIONS_PREFIX = "user_sessions:";
const ALL_SESSIONS_SET = "all_sessions";

// Redis client singleton
let redisClient: Redis | null = null;

/**
 * Get or create Redis client
 */
function getRedisClient(): Redis {
  if (!redisClient) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
      throw new Error(
        "Upstash Redis credentials not configured. Please set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN environment variables.",
      );
    }

    redisClient = new Redis({
      url,
      token,
    });
  }

  return redisClient;
}

/**
 * Session data structure
 */
export interface SessionData {
  sessionId: string;
  userId: string;
  companyId: string | null; // null for ADMIN_SISTEMA who can manage all companies
  email: string;
  role: string;
  createdAt: number;
  lastActivityAt: number;
  refreshTokenId: string;
  userAgent?: string;
  ipAddress?: string;
}

/**
 * Create a new session
 *
 * @param sessionData - Session information
 * @param options - Optional metadata
 * @returns The session ID
 */
export async function createSession(
  sessionData: Omit<
    SessionData,
    "sessionId" | "createdAt" | "lastActivityAt" | "refreshTokenId"
  >,
  options?: { userAgent?: string; ipAddress?: string },
): Promise<string> {
  const redis = getRedisClient();

  // Generate unique session ID
  const sessionId = crypto.randomUUID();
  const refreshTokenId = crypto.randomUUID();
  const now = Date.now();

  const session: SessionData = {
    sessionId,
    ...sessionData,
    createdAt: now,
    lastActivityAt: now,
    refreshTokenId,
    userAgent: options?.userAgent,
    ipAddress: options?.ipAddress,
  };

  // Store session with TTL
  await redis.set(`${SESSION_PREFIX}${sessionId}`, JSON.stringify(session), {
    ex: SESSION_TTL,
  });

  // Map refresh token to session
  await redis.set(`${REFRESH_TOKEN_PREFIX}${refreshTokenId}`, sessionId, {
    ex: SESSION_TTL,
  });

  // Add to user's sessions list
  await redis.sadd(`${USER_SESSIONS_PREFIX}${sessionData.userId}`, sessionId);

  // Add to global sessions set
  await redis.sadd(ALL_SESSIONS_SET, sessionId);

  return sessionId;
}

/**
 * Get session by ID
 *
 * @param sessionId - Session ID
 * @returns Session data or null if not found/expired
 */
export async function getSession(
  sessionId: string,
): Promise<SessionData | null> {
  const redis = getRedisClient();

  const sessionData = await redis.get<string>(`${SESSION_PREFIX}${sessionId}`);

  if (!sessionData) {
    return null;
  }

  return JSON.parse(sessionData) as SessionData;
}

/**
 * Validate session and update last activity
 *
 * @param sessionId - Session ID
 * @returns Session data if valid, null otherwise
 */
export async function validateSession(
  sessionId: string,
): Promise<SessionData | null> {
  const session = await getSession(sessionId);

  if (!session) {
    return null;
  }

  // Update last activity and renew TTL
  await updateSessionActivity(sessionId);

  return session;
}

/**
 * Update session activity (renews TTL)
 *
 * @param sessionId - Session ID
 */
export async function updateSessionActivity(sessionId: string): Promise<void> {
  const redis = getRedisClient();

  const session = await getSession(sessionId);
  if (!session) {
    return;
  }

  // Update last activity timestamp
  session.lastActivityAt = Date.now();

  // Renew session TTL
  await redis.set(`${SESSION_PREFIX}${sessionId}`, JSON.stringify(session), {
    ex: SESSION_TTL,
  });
}

/**
 * Get session by refresh token ID
 *
 * @param refreshTokenId - Refresh token ID
 * @returns Session data or null if not found/expired
 */
export async function getSessionByRefreshToken(
  refreshTokenId: string,
): Promise<SessionData | null> {
  const redis = getRedisClient();

  const sessionId = await redis.get<string>(
    `${REFRESH_TOKEN_PREFIX}${refreshTokenId}`,
  );

  if (!sessionId) {
    return null;
  }

  return await getSession(sessionId);
}

/**
 * Invalidate a specific session
 *
 * @param sessionId - Session ID
 */
export async function invalidateSession(sessionId: string): Promise<void> {
  const redis = getRedisClient();

  const session = await getSession(sessionId);
  if (!session) {
    return;
  }

  // Remove session data
  await redis.del(`${SESSION_PREFIX}${sessionId}`);

  // Remove refresh token mapping
  await redis.del(`${REFRESH_TOKEN_PREFIX}${session.refreshTokenId}`);

  // Remove from user's sessions list
  await redis.srem(`${USER_SESSIONS_PREFIX}${session.userId}`, sessionId);

  // Remove from global sessions set
  await redis.srem(ALL_SESSIONS_SET, sessionId);
}

/**
 * Invalidate all sessions for a specific user
 *
 * @param userId - User ID
 */
export async function invalidateUserSessions(userId: string): Promise<void> {
  const redis = getRedisClient();

  // Get all user's session IDs
  const sessionIds = await redis.smembers<string[]>(
    `${USER_SESSIONS_PREFIX}${userId}`,
  );

  // Invalidate each session
  for (const sessionId of sessionIds) {
    await invalidateSession(sessionId);
  }

  // Remove user's sessions list
  await redis.del(`${USER_SESSIONS_PREFIX}${userId}`);
}

/**
 * Invalidate all sessions globally (admin emergency action)
 *
 * @returns Number of sessions invalidated
 */
export async function invalidateAllSessions(): Promise<number> {
  const redis = getRedisClient();

  // Get all session IDs
  const sessionIds = await redis.smembers<string[]>(ALL_SESSIONS_SET);

  // Invalidate each session
  for (const sessionId of sessionIds) {
    await invalidateSession(sessionId);
  }

  return sessionIds.length;
}

/**
 * Get all active sessions for a user
 *
 * @param userId - User ID
 * @returns Array of session data
 */
export async function getUserSessions(userId: string): Promise<SessionData[]> {
  const redis = getRedisClient();

  const sessionIds = await redis.smembers<string[]>(
    `${USER_SESSIONS_PREFIX}${userId}`,
  );

  const sessions: SessionData[] = [];

  for (const sessionId of sessionIds) {
    const session = await getSession(sessionId);
    if (session) {
      sessions.push(session);
    }
  }

  return sessions;
}

/**
 * Get session count for a user
 *
 * @param userId - User ID
 * @returns Number of active sessions
 */
export async function getUserSessionCount(userId: string): Promise<number> {
  const redis = getRedisClient();

  const sessionIds = await redis.smembers<string[]>(
    `${USER_SESSIONS_PREFIX}${userId}`,
  );

  // Filter out expired sessions
  let activeCount = 0;
  for (const sessionId of sessionIds) {
    const exists = await redis.exists(`${SESSION_PREFIX}${sessionId}`);
    if (exists) {
      activeCount++;
    }
  }

  return activeCount;
}

/**
 * Get global session statistics
 *
 * @returns Total active sessions count
 */
export async function getGlobalSessionCount(): Promise<number> {
  const redis = getRedisClient();

  const sessionIds = await redis.smembers<string[]>(ALL_SESSIONS_SET);

  // Filter out expired sessions
  let activeCount = 0;
  for (const sessionId of sessionIds) {
    const exists = await redis.exists(`${SESSION_PREFIX}${sessionId}`);
    if (exists) {
      activeCount++;
    }
  }

  return activeCount;
}

/**
 * Clean up expired sessions from user lists and global set
 * This is a maintenance function to ensure data consistency
 *
 * @returns Number of cleaned up sessions
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const redis = getRedisClient();

  const sessionIds = await redis.smembers<string[]>(ALL_SESSIONS_SET);
  let cleanedCount = 0;

  for (const sessionId of sessionIds) {
    const exists = await redis.exists(`${SESSION_PREFIX}${sessionId}`);

    if (!exists) {
      // Session expired, clean up references
      // Remove from global set
      await redis.srem(ALL_SESSIONS_SET, sessionId);

      // Note: user sessions list will be cleaned when user tries to access
      // or during periodic cleanup
      cleanedCount++;
    }
  }

  return cleanedCount;
}

/**
 * Check if a refresh token is valid
 *
 * @param refreshTokenId - Refresh token ID
 * @returns True if valid, false otherwise
 */
export async function isRefreshTokenValid(
  refreshTokenId: string,
): Promise<boolean> {
  const redis = getRedisClient();

  const sessionId = await redis.get<string>(
    `${REFRESH_TOKEN_PREFIX}${refreshTokenId}`,
  );

  return sessionId !== null;
}

/**
 * Invalidate refresh token (when session is revoked)
 *
 * @param refreshTokenId - Refresh token ID
 */
export async function invalidateRefreshToken(
  refreshTokenId: string,
): Promise<void> {
  const redis = getRedisClient();

  const sessionId = await redis.get<string>(
    `${REFRESH_TOKEN_PREFIX}${refreshTokenId}`,
  );

  if (sessionId) {
    await invalidateSession(sessionId);
  }
}
