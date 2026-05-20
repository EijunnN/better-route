import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { sendChatPush } from "@/lib/notifications/onesignal";

/**
 * `sendChatPush` is a best-effort side channel — it must never throw
 * into the chat send path, and must address drivers by External ID.
 */

const realFetch = globalThis.fetch;

function clearCreds() {
  delete process.env.ONESIGNAL_APP_ID;
  delete process.env.ONESIGNAL_REST_API_KEY;
}

describe("sendChatPush", () => {
  beforeEach(clearCreds);
  afterEach(() => {
    globalThis.fetch = realFetch;
    clearCreds();
  });

  test("skips silently when credentials are not configured", async () => {
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return new Response("{}");
    }) as unknown as typeof fetch;

    await sendChatPush({ driverIds: ["d1"], title: "t", body: "b", data: {} });
    expect(called).toBe(false);
  });

  test("does not call the API for an empty recipient list", async () => {
    process.env.ONESIGNAL_APP_ID = "app";
    process.env.ONESIGNAL_REST_API_KEY = "key";
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return new Response("{}");
    }) as unknown as typeof fetch;

    await sendChatPush({ driverIds: [], title: "t", body: "b", data: {} });
    expect(called).toBe(false);
  });

  test("posts to OneSignal addressing drivers by external_id", async () => {
    process.env.ONESIGNAL_APP_ID = "app-123";
    process.env.ONESIGNAL_REST_API_KEY = "rest-key";

    let url = "";
    let headers: Record<string, string> = {};
    let payload: Record<string, unknown> = {};
    globalThis.fetch = (async (target: string, init: RequestInit) => {
      url = target;
      headers = init.headers as Record<string, string>;
      payload = JSON.parse(init.body as string);
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    await sendChatPush({
      driverIds: ["driver-9"],
      title: "Mensaje del despacho",
      body: "Llamá al cliente",
      data: { type: "chat", messageId: "m-1" },
    });

    expect(url).toBe("https://api.onesignal.com/notifications");
    expect(headers.Authorization).toBe("Key rest-key");
    expect(payload.app_id).toBe("app-123");
    expect(payload.target_channel).toBe("push");
    expect(payload.include_aliases).toEqual({ external_id: ["driver-9"] });
    expect(payload.contents).toEqual({ en: "Llamá al cliente" });
    expect(payload.data).toEqual({ type: "chat", messageId: "m-1" });
  });

  test("a network failure is swallowed, not thrown", async () => {
    process.env.ONESIGNAL_APP_ID = "app";
    process.env.ONESIGNAL_REST_API_KEY = "key";
    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    await expect(
      sendChatPush({ driverIds: ["d1"], title: "t", body: "b", data: {} }),
    ).resolves.toBeUndefined();
  });

  test("a non-OK response is swallowed, not thrown", async () => {
    process.env.ONESIGNAL_APP_ID = "app";
    process.env.ONESIGNAL_REST_API_KEY = "key";
    globalThis.fetch = (async () =>
      new Response("bad request", { status: 400 })) as unknown as typeof fetch;

    await expect(
      sendChatPush({ driverIds: ["d1"], title: "t", body: "b", data: {} }),
    ).resolves.toBeUndefined();
  });
});
