import { beforeAll, describe, expect, test } from "bun:test";
import { jwtVerify } from "jose";
import { issueCentrifugoToken } from "@/lib/realtime/centrifugo";

const SECRET = "test-centrifugo-hmac-secret";

beforeAll(() => {
  process.env.CENTRIFUGO_TOKEN_HMAC_SECRET_KEY = SECRET;
});

/**
 * The Centrifugo connection token is what Centrifugo trusts to identify
 * a connection and decide its server-side subscriptions. It must be a
 * valid HS256 JWT, short-lived, and carry the role-scoped channels.
 */
describe("issueCentrifugoToken", () => {
  test("issues an HS256 JWT verifiable with the Centrifugo secret", async () => {
    const token = await issueCentrifugoToken({
      userId: "u-1",
      role: "PLANIFICADOR",
      companyId: "c-1",
    });
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(SECRET),
    );
    expect(payload.sub).toBe("u-1");
    expect(payload.info).toEqual({ role: "PLANIFICADOR", companyId: "c-1" });
    expect(payload.channels).toEqual(["monitoring:c-1", "chat:c-1:broadcast"]);
  });

  test("token expires 15 minutes after issuance", async () => {
    const token = await issueCentrifugoToken({
      userId: "u-1",
      role: "CONDUCTOR",
      companyId: "c-1",
    });
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(SECRET),
    );
    expect(payload.iat).toBeDefined();
    expect(payload.exp).toBeDefined();
    expect(Number(payload.exp) - Number(payload.iat)).toBe(15 * 60);
  });

  test("channels claim is role-scoped — a driver gets only their thread", async () => {
    const token = await issueCentrifugoToken({
      userId: "driver-9",
      role: "CONDUCTOR",
      companyId: "c-1",
    });
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(SECRET),
    );
    expect(payload.channels).toEqual([
      "chat:c-1:driver:driver-9",
      "chat:c-1:broadcast",
    ]);
  });

  test("a token signed for one secret fails verification under another", async () => {
    const token = await issueCentrifugoToken({
      userId: "u-1",
      role: "MONITOR",
      companyId: "c-1",
    });
    await expect(
      jwtVerify(token, new TextEncoder().encode("a-different-secret")),
    ).rejects.toThrow();
  });

  test("throws when the Centrifugo secret is not configured", async () => {
    const saved = process.env.CENTRIFUGO_TOKEN_HMAC_SECRET_KEY;
    delete process.env.CENTRIFUGO_TOKEN_HMAC_SECRET_KEY;
    try {
      await expect(
        issueCentrifugoToken({
          userId: "u-1",
          role: "MONITOR",
          companyId: "c-1",
        }),
      ).rejects.toThrow("CENTRIFUGO_TOKEN_HMAC_SECRET_KEY");
    } finally {
      process.env.CENTRIFUGO_TOKEN_HMAC_SECRET_KEY = saved;
    }
  });
});
