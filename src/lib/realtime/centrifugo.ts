/**
 * Server-side Centrifugo integration: publishing events and issuing
 * connection tokens. See ADR-0007.
 *
 * Replaces the in-process `monitoringBus`: instead of an EventEmitter,
 * the backend POSTs to Centrifugo's HTTP API and Centrifugo fans the
 * message out to every subscribed WebSocket.
 */

import { SignJWT } from "jose";
import { type ChannelSubject, computeAllowedChannels } from "./channels";

/** Connection token lifetime. The client SDK refreshes transparently. */
const TOKEN_TTL = "15m";

/**
 * Subscription token lifetime. Shorter than the connection token — a
 * subscription token only authorizes one channel, so a leak is narrow,
 * and a short window makes the lift of revoking access on a role change
 * negligible. The client re-asks per channel open.
 */
const SUBSCRIPTION_TOKEN_TTL = "5m";

/**
 * Publish an event to a Centrifugo channel.
 *
 * Best-effort: a publish failure is logged but never thrown. For
 * monitoring events the payload is only a revalidation hint; for chat
 * the message is already committed to Postgres before this is called.
 * The caller must not depend on delivery.
 */
export async function centrifugoPublish(
  channel: string,
  data: unknown,
): Promise<void> {
  const url = process.env.CENTRIFUGO_URL;
  const apiKey = process.env.CENTRIFUGO_API_KEY;

  if (!url || !apiKey) {
    console.warn(
      "[centrifugo] CENTRIFUGO_URL / CENTRIFUGO_API_KEY not set — publish skipped",
    );
    return;
  }

  try {
    const res = await fetch(`${url}/api/publish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({ channel, data }),
    });

    if (!res.ok) {
      console.error(`[centrifugo] publish to ${channel} failed: ${res.status}`);
      return;
    }

    const json = (await res.json()) as {
      error?: { code: number; message: string };
    };
    if (json.error) {
      console.error(
        `[centrifugo] publish to ${channel} error ${json.error.code}: ${json.error.message}`,
      );
    }
  } catch (err) {
    console.error(`[centrifugo] publish to ${channel} threw:`, err);
  }
}

/**
 * Issue a short-lived Centrifugo connection JWT for an authenticated
 * user. Signed with the Centrifugo HMAC secret — separate from the app
 * session JWT, so a leaked realtime token cannot touch the app.
 *
 * The `channels` claim drives Centrifugo's server-side subscriptions;
 * `info` is echoed back to other clients (e.g. message sender metadata).
 */
export async function issueCentrifugoToken(
  subject: ChannelSubject,
): Promise<string> {
  const secret = process.env.CENTRIFUGO_TOKEN_HMAC_SECRET_KEY;
  if (!secret) {
    throw new Error("CENTRIFUGO_TOKEN_HMAC_SECRET_KEY is not set");
  }

  return new SignJWT({
    info: { role: subject.role, companyId: subject.companyId },
    channels: computeAllowedChannels(subject),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(subject.userId)
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(new TextEncoder().encode(secret));
}

/**
 * Issue a Centrifugo subscription JWT for a single channel.
 *
 * Used by dispatchers to subscribe ad-hoc to per-driver chat channels
 * that are NOT in their connection token — opening one conversation
 * should not bloat the token with one entry per driver of the tenant.
 *
 * The `sub` must match the connection's userId so Centrifugo rejects
 * a token minted for a different user.
 */
export async function issueCentrifugoSubscriptionToken(input: {
  userId: string;
  channel: string;
}): Promise<string> {
  const secret = process.env.CENTRIFUGO_TOKEN_HMAC_SECRET_KEY;
  if (!secret) {
    throw new Error("CENTRIFUGO_TOKEN_HMAC_SECRET_KEY is not set");
  }

  return new SignJWT({ channel: input.channel })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(input.userId)
    .setIssuedAt()
    .setExpirationTime(SUBSCRIPTION_TOKEN_TTL)
    .sign(new TextEncoder().encode(secret));
}
