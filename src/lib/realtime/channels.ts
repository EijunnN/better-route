/**
 * Centrifugo channel names and per-role channel resolution.
 *
 * Browser-safe: pure string helpers, no node / DB / server imports — so
 * the client can share the channel vocabulary if it ever needs to.
 *
 * Channel layout (see ADR-0007):
 *   monitoring:{companyId}              — location, stop transitions, alerts
 *   chat:{companyId}:driver:{driverId}  — 1:1 dispatcher↔driver thread
 *   chat:{companyId}:broadcast          — dispatcher emergency broadcast
 *
 * The namespace is the segment before the first ":" — `monitoring` and
 * `chat` — and must match the namespaces declared in
 * `docker/centrifugo/config.json`.
 */

import { USER_ROLES } from "@/lib/auth/permissions";

export const centrifugoChannels = {
  monitoring: (companyId: string) => `monitoring:${companyId}`,
  driverChat: (companyId: string, driverId: string) =>
    `chat:${companyId}:driver:${driverId}`,
  broadcast: (companyId: string) => `chat:${companyId}:broadcast`,
} as const;

export interface ChannelSubject {
  role: string;
  userId: string;
  companyId: string;
}

/**
 * The channels a connection is subscribed to server-side, encoded into
 * the `channels` claim of the Centrifugo connection JWT.
 *
 * These are the *stable* channels a role always wants — Centrifugo
 * auto-subscribes the connection to them, so a client can never escalate
 * by subscribing to a channel its token does not list.
 *
 * A dispatcher's per-driver chat channel (`chat:...:driver:{X}`) is
 * deliberately NOT here: it is dynamic, opened ad-hoc when a dispatcher
 * views a conversation, and authorized per-subscription with a dedicated
 * subscription token (issue 010).
 */
export function computeAllowedChannels(subject: ChannelSubject): string[] {
  const { role, userId, companyId } = subject;

  switch (role) {
    case USER_ROLES.CONDUCTOR:
      return [
        centrifugoChannels.driverChat(companyId, userId),
        centrifugoChannels.broadcast(companyId),
      ];

    case USER_ROLES.PLANIFICADOR:
    case USER_ROLES.ADMIN_FLOTA:
    case USER_ROLES.ADMIN_SISTEMA:
      return [
        centrifugoChannels.monitoring(companyId),
        centrifugoChannels.broadcast(companyId),
      ];

    case USER_ROLES.MONITOR:
      return [centrifugoChannels.monitoring(companyId)];

    default:
      return [];
  }
}
