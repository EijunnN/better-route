/**
 * Rate limiter y derivación de IP del cliente.
 *
 * Por qué este archivo
 * ─────────────────────────────────────────────────────────────────────
 * `getClientIp` leía el PRIMER elemento de `x-forwarded-for`, que es texto
 * que manda el cliente. Bastaba con variar ese header en cada request para
 * estrenar una cubeta nueva y dejar el límite de 5 logins/min en nada —
 * fuerza bruta libre contra `/api/auth/login`.
 *
 * Estos tests fijan que solo se confíe en headers que escribe el reverse
 * proxy, y que la ventana del limiter cuente de verdad.
 */

import { beforeEach, describe, expect, test } from "bun:test";

import {
  checkRateLimit,
  getClientIp,
  resetRateLimit,
} from "@/lib/infra/rate-limit";

function requestWith(headers: Record<string, string>): Request {
  return new Request("https://app.test/api/auth/login", { headers });
}

describe("getClientIp", () => {
  test("prefiere x-real-ip: es el header que escribe nuestro nginx", () => {
    const ip = getClientIp(
      requestWith({
        "x-real-ip": "203.0.113.10",
        "x-forwarded-for": "1.2.3.4",
      }),
    );

    expect(ip).toBe("203.0.113.10");
  });

  test("ignora el x-forwarded-for falsificado por el cliente y toma el último hop", () => {
    // nginx concatena la IP real al final; todo lo previo lo puso el cliente.
    const ip = getClientIp(
      requestWith({ "x-forwarded-for": "6.6.6.6, 203.0.113.10" }),
    );

    expect(ip).toBe("203.0.113.10");
  });

  test("un atacante no puede estrenar cubeta variando x-forwarded-for", () => {
    const first = getClientIp(
      requestWith({ "x-forwarded-for": "1.1.1.1, 203.0.113.10" }),
    );
    const second = getClientIp(
      requestWith({ "x-forwarded-for": "2.2.2.2, 203.0.113.10" }),
    );

    expect(first).toBe(second);
  });

  test("respeta cf-connecting-ip cuando no hay x-real-ip", () => {
    const ip = getClientIp(
      requestWith({
        "cf-connecting-ip": "198.51.100.7",
        "x-forwarded-for": "1.2.3.4",
      }),
    );

    expect(ip).toBe("198.51.100.7");
  });

  test("sin headers de proxy devuelve 'unknown'", () => {
    expect(getClientIp(requestWith({}))).toBe("unknown");
  });
});

describe("checkRateLimit", () => {
  const config = { maxRequests: 3, windowMs: 60_000 };

  beforeEach(async () => {
    await resetRateLimit("test:bucket");
    await resetRateLimit("test:otro");
  });

  test("permite hasta el límite y rechaza el siguiente", async () => {
    const first = await checkRateLimit("test:bucket", config);
    expect(first.success).toBe(true);
    expect(first.remaining).toBe(2);

    await checkRateLimit("test:bucket", config);
    const third = await checkRateLimit("test:bucket", config);
    expect(third.success).toBe(true);
    expect(third.remaining).toBe(0);

    const fourth = await checkRateLimit("test:bucket", config);
    expect(fourth.success).toBe(false);
    expect(fourth.remaining).toBe(0);
  });

  test("las cubetas son independientes entre identificadores", async () => {
    for (let i = 0; i < 3; i++) {
      await checkRateLimit("test:bucket", config);
    }
    expect((await checkRateLimit("test:bucket", config)).success).toBe(false);

    expect((await checkRateLimit("test:otro", config)).success).toBe(true);
  });

  test("resetRateLimit libera la cubeta", async () => {
    for (let i = 0; i < 4; i++) {
      await checkRateLimit("test:bucket", config);
    }
    expect((await checkRateLimit("test:bucket", config)).success).toBe(false);

    await resetRateLimit("test:bucket");

    expect((await checkRateLimit("test:bucket", config)).success).toBe(true);
  });

  test("resetTime cae dentro de la ventana", async () => {
    const before = Date.now();
    const result = await checkRateLimit("test:bucket", config);

    expect(result.resetTime).toBeGreaterThan(before);
    expect(result.resetTime).toBeLessThanOrEqual(
      Date.now() + config.windowMs + 1_000,
    );
  });
});
