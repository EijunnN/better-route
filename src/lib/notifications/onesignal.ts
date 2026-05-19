/**
 * OneSignal push notifications (ADR-0007).
 *
 * Devices are addressed by External ID — our own `userId`, set on the
 * mobile side via `OneSignal.login(userId)`. The backend never stores
 * device tokens; OneSignal resolves the External ID to whatever devices
 * the driver has registered.
 */

const ONESIGNAL_NOTIFICATIONS_URL = "https://api.onesignal.com/notifications";

export interface ChatPushInput {
  /** Driver user ids — the OneSignal External IDs to deliver to. */
  driverIds: string[];
  title: string;
  body: string;
  /** Custom payload the app reads to deep-link when the push is tapped. */
  data: Record<string, unknown>;
}

/**
 * Send a push to one or more drivers, addressed by External ID.
 *
 * Best-effort: a failure is logged, never thrown. By the time this runs
 * the message is already in Postgres and published to Centrifugo — the
 * push is an extra delivery path for a closed app, not the source of
 * truth. The caller must not depend on it.
 */
export async function sendChatPush(input: ChatPushInput): Promise<void> {
  if (input.driverIds.length === 0) return;

  const appId = process.env.ONESIGNAL_APP_ID;
  const apiKey = process.env.ONESIGNAL_REST_API_KEY;
  if (!appId || !apiKey) {
    console.warn(
      "[onesignal] ONESIGNAL_APP_ID / ONESIGNAL_REST_API_KEY not set — push skipped",
    );
    return;
  }

  try {
    const res = await fetch(ONESIGNAL_NOTIFICATIONS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${apiKey}`,
      },
      body: JSON.stringify({
        app_id: appId,
        target_channel: "push",
        include_aliases: { external_id: input.driverIds },
        headings: { en: input.title },
        contents: { en: input.body },
        data: input.data,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[onesignal] push failed: ${res.status} ${detail}`);
    }
  } catch (err) {
    console.error("[onesignal] push threw:", err);
  }
}
