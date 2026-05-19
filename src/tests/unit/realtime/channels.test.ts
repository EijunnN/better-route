import { describe, expect, test } from "bun:test";
import {
  centrifugoChannels,
  computeAllowedChannels,
} from "@/lib/realtime/channels";

/**
 * `computeAllowedChannels` is the security boundary of the realtime
 * layer: it decides which channels go into a user's connection token,
 * and Centrifugo subscribes the connection to exactly those. A driver
 * must never get `monitoring:*`; a dispatcher must never get another
 * driver's chat through the connection token.
 */
describe("computeAllowedChannels", () => {
  const companyId = "company-1";
  const userId = "user-1";

  test("CONDUCTOR gets own chat thread + broadcast only", () => {
    expect(
      computeAllowedChannels({ role: "CONDUCTOR", userId, companyId }),
    ).toEqual([
      centrifugoChannels.driverChat(companyId, userId),
      centrifugoChannels.broadcast(companyId),
    ]);
  });

  test("CONDUCTOR never receives the monitoring channel", () => {
    const channels = computeAllowedChannels({
      role: "CONDUCTOR",
      userId,
      companyId,
    });
    expect(channels).not.toContain(centrifugoChannels.monitoring(companyId));
  });

  test.each(["PLANIFICADOR", "ADMIN_FLOTA", "ADMIN_SISTEMA"])(
    "%s gets monitoring + chat inbox + broadcast",
    (role) => {
      expect(computeAllowedChannels({ role, userId, companyId })).toEqual([
        centrifugoChannels.monitoring(companyId),
        centrifugoChannels.chatInbox(companyId),
        centrifugoChannels.broadcast(companyId),
      ]);
    },
  );

  test("dispatcher token carries no per-driver chat channel", () => {
    // Per-driver chat is opened ad-hoc with a subscription token (010),
    // never baked into the connection token.
    const channels = computeAllowedChannels({
      role: "PLANIFICADOR",
      userId,
      companyId,
    });
    expect(channels.some((c) => c.includes(":driver:"))).toBe(false);
  });

  test("MONITOR gets monitoring only, no chat", () => {
    expect(
      computeAllowedChannels({ role: "MONITOR", userId, companyId }),
    ).toEqual([centrifugoChannels.monitoring(companyId)]);
  });

  test("unknown role gets no channels", () => {
    expect(
      computeAllowedChannels({ role: "SOMETHING_ELSE", userId, companyId }),
    ).toEqual([]);
  });

  test("channels are scoped to the caller's company", () => {
    const channels = computeAllowedChannels({
      role: "PLANIFICADOR",
      userId,
      companyId: "company-XYZ",
    });
    expect(channels.every((c) => c.includes("company-XYZ"))).toBe(true);
  });
});
