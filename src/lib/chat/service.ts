/**
 * Chat persistence + realtime fan-out (ADR-0007).
 *
 * Every write goes through here: Postgres is the source of truth, and
 * the Centrifugo publish is a best-effort realtime hint layered on top.
 */

import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  CHAT_DIRECTION,
  CHAT_MESSAGE_KIND,
  chatConversations,
  chatMessages,
  users,
} from "@/db/schema";
import { sendChatPush } from "@/lib/notifications/onesignal";
import { centrifugoChannels, centrifugoPublish } from "@/lib/realtime";

/** Conversation previews are capped — the full body lives in the message. */
const PREVIEW_MAX = 120;

export type ChatMessageRow = typeof chatMessages.$inferSelect;

export interface SendChatMessageInput {
  companyId: string;
  driverId: string;
  senderId: string;
  direction: keyof typeof CHAT_DIRECTION;
  kind: keyof typeof CHAT_MESSAGE_KIND;
  body: string;
  templateCode?: string | null;
}

/**
 * Persist a chat message and refresh its conversation index in one
 * transaction, then publish it to the driver's Centrifugo channel.
 * The publish never throws — if it fails the message is still safely
 * in Postgres and the recipient reconciles on reconnect.
 */
export async function sendChatMessage(
  input: SendChatMessageInput,
): Promise<ChatMessageRow> {
  const preview = input.body.slice(0, PREVIEW_MAX);
  const incUnread = input.direction === CHAT_DIRECTION.TO_DISPATCH ? 1 : 0;

  const message = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(chatMessages)
      .values({
        companyId: input.companyId,
        driverId: input.driverId,
        senderId: input.senderId,
        direction: input.direction,
        kind: input.kind,
        body: input.body,
        templateCode: input.templateCode ?? null,
      })
      .returning();

    await tx
      .insert(chatConversations)
      .values({
        companyId: input.companyId,
        driverId: input.driverId,
        lastMessageAt: row.createdAt,
        lastMessagePreview: preview,
        unreadForDispatch: incUnread,
      })
      .onConflictDoUpdate({
        target: [chatConversations.companyId, chatConversations.driverId],
        set: {
          lastMessageAt: row.createdAt,
          lastMessagePreview: preview,
          unreadForDispatch: sql`${chatConversations.unreadForDispatch} + ${incUnread}`,
          updatedAt: sql`now()`,
        },
      });

    return row;
  });

  await centrifugoPublish(
    centrifugoChannels.driverChat(input.companyId, input.driverId),
    { kind: "chat.message", message },
  );

  // Bump the dispatcher inbox — every dispatcher session of this tenant
  // is subscribed to the inbox channel server-side, so the conversation
  // list and unread badge update without needing a per-driver subscription.
  await centrifugoPublish(centrifugoChannels.chatInbox(input.companyId), {
    kind: "chat.inbox",
    driverId: input.driverId,
  });

  // Push only dispatcher→driver messages: a driver's own reply needs no
  // push, and dispatchers are on the web (no push surface). Always-push
  // — the mobile app suppresses the banner if the chat is foregrounded.
  if (input.direction === CHAT_DIRECTION.TO_DRIVER) {
    await sendChatPush({
      driverIds: [input.driverId],
      title: "Mensaje del despacho",
      body: preview,
      data: { type: "chat", driverId: input.driverId, messageId: message.id },
    });
  }

  return message;
}

/**
 * Mark every inbound (driver→dispatch) message in a conversation as
 * read and reset the dispatcher unread counter.
 */
export async function markConversationRead(
  companyId: string,
  driverId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(chatMessages)
      .set({ readAt: sql`now()` })
      .where(
        and(
          eq(chatMessages.companyId, companyId),
          eq(chatMessages.driverId, driverId),
          eq(chatMessages.direction, CHAT_DIRECTION.TO_DISPATCH),
          isNull(chatMessages.readAt),
        ),
      );
    await tx
      .update(chatConversations)
      .set({ unreadForDispatch: 0, updatedAt: sql`now()` })
      .where(
        and(
          eq(chatConversations.companyId, companyId),
          eq(chatConversations.driverId, driverId),
        ),
      );
  });

  // Propagate the cleared badge to every dispatcher session — a peer
  // dispatcher who already had the inbox open should not keep showing
  // an unread count that has been resolved on another tab.
  await centrifugoPublish(centrifugoChannels.chatInbox(companyId), {
    kind: "chat.inbox",
    driverId,
  });
}

/**
 * Espejo de markConversationRead para el otro sentido: estampa readAt en
 * los mensajes despacho→driver cuando el DRIVER abre su hilo. Es la base
 * del "Leído" que ve el despachador en sus propios mensajes. No hay
 * contador que resetear — la app del driver no lleva unread.
 */
export async function markDriverThreadRead(
  companyId: string,
  driverId: string,
): Promise<void> {
  await db
    .update(chatMessages)
    .set({ readAt: sql`now()` })
    .where(
      and(
        eq(chatMessages.companyId, companyId),
        eq(chatMessages.driverId, driverId),
        eq(chatMessages.direction, CHAT_DIRECTION.TO_DRIVER),
        isNull(chatMessages.readAt),
      ),
    );

  // Notificar a los despachadores con el hilo abierto para que el
  // "Leído" aparezca sin esperar al próximo fetch.
  await centrifugoPublish(centrifugoChannels.chatInbox(companyId), {
    kind: "chat.read",
    driverId,
  });
}

/**
 * Fan an emergency broadcast out to every driver of a company — one
 * `chat_messages` row per driver so it lands in each thread — and
 * publish once to the company broadcast channel. Returns the count of
 * drivers reached.
 */
export async function broadcastChatMessage(input: {
  companyId: string;
  senderId: string;
  body: string;
}): Promise<number> {
  const drivers = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(eq(users.companyId, input.companyId), eq(users.role, "CONDUCTOR")),
    );

  if (drivers.length === 0) return 0;

  const preview = input.body.slice(0, PREVIEW_MAX);
  const sentAt = new Date();

  const rows = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(chatMessages)
      .values(
        drivers.map((d) => ({
          companyId: input.companyId,
          driverId: d.id,
          senderId: input.senderId,
          direction: CHAT_DIRECTION.TO_DRIVER,
          kind: CHAT_MESSAGE_KIND.BROADCAST,
          body: input.body,
        })),
      )
      .returning();

    await tx
      .insert(chatConversations)
      .values(
        drivers.map((d) => ({
          companyId: input.companyId,
          driverId: d.id,
          lastMessageAt: sentAt,
          lastMessagePreview: preview,
        })),
      )
      .onConflictDoUpdate({
        target: [chatConversations.companyId, chatConversations.driverId],
        set: {
          lastMessageAt: sentAt,
          lastMessagePreview: preview,
          updatedAt: sql`now()`,
        },
      });

    return inserted;
  });

  // Live fan-out per driver: publish each row to the driver's OWN channel as
  // a regular `chat.message`, so the app surfaces the broadcast in-thread the
  // same way it handles 1:1 messages (its `chat.broadcast` branch is a no-op).
  // The broadcast-channel publish below stays for dispatcher/aggregate
  // consumers; the driver app simply ignores it.
  await Promise.all(
    rows.map((row) =>
      centrifugoPublish(
        centrifugoChannels.driverChat(input.companyId, row.driverId),
        { kind: "chat.message", message: row },
      ),
    ),
  );

  await centrifugoPublish(centrifugoChannels.broadcast(input.companyId), {
    kind: "chat.broadcast",
    body: input.body,
    sentAt: sentAt.toISOString(),
  });

  await sendChatPush({
    driverIds: drivers.map((d) => d.id),
    title: "Mensaje urgente del despacho",
    body: preview,
    data: { type: "broadcast" },
  });

  return drivers.length;
}
