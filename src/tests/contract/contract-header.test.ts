/**
 * Handshake del §10.2: toda respuesta del seam móvil lleva
 * `x-br-contract: <CONTRACT_VERSION>` vía el helper compartido
 * `withContractHeader`. Sin DB.
 */
import { describe, expect, test } from "bun:test";
import type { NextRequest } from "next/server";
import {
  CONTRACT_HEADER,
  CONTRACT_VERSION,
  withContractHeader,
} from "@/lib/mobile-contract";

const request = new Request("http://localhost/api/mobile/driver/my-route", {
  headers: { authorization: "Bearer x" },
}) as unknown as NextRequest;

describe("API-CONTRACT-MOBILE.md §10 — header x-br-contract", () => {
  test("estampa la versión vigente en respuestas de éxito", async () => {
    const handler = withContractHeader(
      async () =>
        new Response(JSON.stringify({ data: null }), {
          headers: { "content-type": "application/json" },
        }),
    );
    const response = await handler(request);
    expect(response.headers.get(CONTRACT_HEADER)).toBe(
      String(CONTRACT_VERSION),
    );
  });

  test("estampa la versión también en respuestas de error", async () => {
    const handler = withContractHeader(
      async () =>
        new Response(JSON.stringify({ error: "No autorizado" }), {
          status: 401,
        }),
    );
    const response = await handler(request);
    expect(response.status).toBe(401);
    expect(response.headers.get(CONTRACT_HEADER)).toBe(
      String(CONTRACT_VERSION),
    );
  });

  test("preserva status y body del handler envuelto", async () => {
    const handler = withContractHeader(
      async () => new Response(JSON.stringify({ ok: true }), { status: 201 }),
    );
    const response = await handler(request);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true });
  });

  test("handler que lanza → 500 con header y shape { error } del §1", async () => {
    const originalConsoleError = console.error;
    const logged: unknown[][] = [];
    console.error = (...args: unknown[]) => {
      logged.push(args);
    };
    try {
      const handler = withContractHeader(async () => {
        throw new Error("boom interno");
      });
      const response = await handler(request);
      expect(response.status).toBe(500);
      expect(response.headers.get(CONTRACT_HEADER)).toBe(
        String(CONTRACT_VERSION),
      );
      expect(await response.json()).toEqual({
        error: "Error interno del servidor",
      });
      // El log lleva requestId correlacionable y el stack del error real.
      expect(logged).toHaveLength(1);
      expect(String(logged[0]?.[0])).toMatch(/\[mobile-seam:[0-9a-f-]{36}\]/);
      expect(logged[0]?.[1]).toMatchObject({ message: "boom interno" });
    } finally {
      console.error = originalConsoleError;
    }
  });

  test("pasa los args extra (context de rutas dinámicas) sin tocarlos", async () => {
    const seen: { id?: string } = {};
    const handler = withContractHeader(
      async (_req, ctx: { params: Promise<{ id: string }> }) => {
        seen.id = (await ctx.params).id;
        return new Response("{}");
      },
    );
    await handler(request, { params: Promise.resolve({ id: "stop-1" }) });
    expect(seen.id).toBe("stop-1");
  });
});
