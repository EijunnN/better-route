/**
 * Test request builder.
 *
 * Constructs NextRequest instances with the auth and tenant headers
 * that route handlers expect.
 */
import { NextRequest } from "next/server";
import { createTestToken, type TestTokenPayload } from "./test-auth";

export interface TestRequestOptions {
  method?: string;
  body?: unknown;
  token?: string;
  companyId?: string;
  userId?: string;
  headers?: Record<string, string>;
  searchParams?: Record<string, string>;
}

/**
 * Build a NextRequest ready for direct route-handler invocation.
 */
export async function createTestRequest(
  path: string,
  options: TestRequestOptions = {},
): Promise<NextRequest> {
  const {
    method = "GET",
    body,
    token,
    companyId,
    userId,
    headers: extraHeaders = {},
    searchParams,
  } = options;

  const url = new URL(path, "http://localhost:3000");
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, value);
    }
  }

  const headers: Record<string, string> = { ...extraHeaders };

  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  if (companyId) {
    headers["x-company-id"] = companyId;
  }
  if (userId) {
    headers["x-user-id"] = userId;
  }

  const init: RequestInit = { method, headers };

  if (body !== undefined && method !== "GET") {
    init.body = JSON.stringify(body);
    headers["content-type"] = "application/json";
  }

  return new NextRequest(url, init as ConstructorParameters<typeof NextRequest>[1]);
}

/**
 * Convenience: create a request already authenticated for a given user.
 */
export async function createAuthenticatedRequest(
  path: string,
  user: TestTokenPayload & { id?: string },
  options: Omit<TestRequestOptions, "token" | "companyId" | "userId"> = {},
): Promise<NextRequest> {
  const token = await createTestToken({
    userId: user.id ?? user.userId,
    companyId: user.companyId,
    email: user.email,
    role: user.role,
  });

  return createTestRequest(path, {
    ...options,
    token,
    companyId: user.companyId ?? undefined,
    userId: user.id ?? user.userId,
  });
}
