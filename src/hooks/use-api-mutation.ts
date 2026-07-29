"use client";

import { useCallback } from "react";
import { useCompanyContext } from "@/hooks/use-company-context";
import { toast } from "@/hooks/use-toast";

export interface MutationToast {
  title: string;
  description?: string;
}

export interface ApiMutationOptions<T> {
  method?: "POST" | "PATCH" | "PUT" | "DELETE";
  /** Serialized as JSON; `Content-Type` is set only when this is present. */
  body?: unknown;
  success?: MutationToast | ((result: T | undefined) => MutationToast);
  /**
   * Title of the destructive toast. Omit it for mutations that report failure
   * some other way (inline error state, a caller's `catch`).
   */
  errorTitle?: string;
  /**
   * Message used when the server answers without a readable `error`/`details`.
   * Defaults to `errorTitle`, which is what the toasting call sites want.
   */
  errorMessage?: string;
  /** `false` reports the failure through the toast only. Default `true`. */
  rethrow?: boolean;
  /**
   * Revalidation for this call, overriding the hook-level one. `null` skips
   * revalidation entirely — for mutations that don't touch the list the hook
   * was built around.
   */
  revalidate?: (() => unknown | Promise<unknown>) | null;
  /**
   * `/api/companies` is the ADMIN_SISTEMA workspace CRUD rather than a tenant
   * resource — sending `x-company-id` there would switch the workspace the
   * server resolves. Those call sites pass `false`, which also drops the
   * "no company selected" guard, since the guard only exists to keep the
   * header from going out empty.
   */
  tenantScoped?: boolean;
}

const UNEXPECTED_ERROR = "Ocurrió un error inesperado";

/**
 * Failed mutation. `message` is the human-readable normalization; `error` and
 * `details` keep the raw server fields, because the form components map
 * `details` (a Zod issue array) onto per-field messages.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly error?: string;
  readonly details?: unknown;
  readonly code?: string;
  /** Whole parsed body, for endpoints answering with extra fields. */
  readonly payload: unknown;

  constructor(
    message: string,
    init: {
      status: number;
      error?: string;
      details?: unknown;
      code?: string;
      payload: unknown;
    },
  ) {
    super(message);
    this.name = "ApiError";
    this.status = init.status;
    this.error = init.error;
    this.details = init.details;
    this.code = init.code;
    this.payload = init.payload;
  }
}

/**
 * Server error shape is `{ error, details?, code? }`. `details` carries the Zod
 * issues while `error` is only the headline ("Datos inválidos"), so the
 * specific field messages win whenever they are present.
 */
function serverMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const { error, details } = body as { error?: unknown; details?: unknown };

  if (Array.isArray(details) && details.length > 0) {
    const messages = details
      .map((detail) =>
        detail && typeof detail === "object"
          ? (detail as { message?: unknown }).message
          : undefined,
      )
      .filter((message): message is string => typeof message === "string");
    if (messages.length > 0) return messages.join(" ");
  }

  if (typeof details === "string" && details) return details;
  if (typeof error === "string" && error) return error;
  return fallback;
}

/**
 * Write-side twin of `useApiData`: injects the tenant header, serializes the
 * body, normalizes the server error shape, revalidates on success and fires
 * the success/error toasts.
 *
 * Unlike `useApiData`, the resolved value is the *raw* JSON body — mutation
 * responses are heterogeneous (`{ deleted }`, `{ data: [...] }`, `{ id }`),
 * so unwrapping `.data` the way the read fetcher does would silently reshape
 * them. Resolves to `undefined` when there is no company context yet, or when
 * the response carries no JSON body (204, empty DELETE).
 */
export function useApiMutation(revalidate?: () => unknown | Promise<unknown>) {
  const { effectiveCompanyId } = useCompanyContext();

  return useCallback(
    async <T = unknown>(
      url: string,
      options: ApiMutationOptions<T> = {},
    ): Promise<T | undefined> => {
      const {
        method = "POST",
        body,
        success,
        errorTitle,
        errorMessage,
        rethrow = true,
        revalidate: revalidateOverride,
        tenantScoped = true,
      } = options;

      if (tenantScoped && !effectiveCompanyId) return undefined;

      const headers: Record<string, string> = {};
      if (tenantScoped && effectiveCompanyId) {
        headers["x-company-id"] = effectiveCompanyId;
      }
      if (body !== undefined) headers["Content-Type"] = "application/json";

      try {
        const response = await fetch(url, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
        });

        const payload = await response.json().catch(() => undefined);

        if (!response.ok) {
          const { error, details, code } = (payload ?? {}) as {
            error?: string;
            details?: unknown;
            code?: string;
          };
          throw new ApiError(
            serverMessage(
              payload,
              errorMessage ?? errorTitle ?? UNEXPECTED_ERROR,
            ),
            { status: response.status, error, details, code, payload },
          );
        }

        const result = payload as T | undefined;
        const revalidation =
          revalidateOverride === null
            ? undefined
            : (revalidateOverride ?? revalidate);
        if (revalidation) await revalidation();

        if (success) {
          toast(typeof success === "function" ? success(result) : success);
        }

        return result;
      } catch (err) {
        if (errorTitle) {
          toast({
            title: errorTitle,
            description: err instanceof Error ? err.message : UNEXPECTED_ERROR,
            variant: "destructive",
          });
        }
        if (rethrow) throw err;
        return undefined;
      }
    },
    [effectiveCompanyId, revalidate],
  );
}
