import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { users } from "./users";

/**
 * Dispatcher↔driver chat (ADR-0007). Postgres is the source of truth;
 * Centrifugo carries messages in realtime but its history is only a
 * cache. There is exactly one conversation per driver — the dispatch
 * desk is a single logical participant even when several dispatchers
 * staff it across shifts.
 */

/** Direction of a message relative to the dispatch desk. */
export const CHAT_DIRECTION = {
  TO_DRIVER: "TO_DRIVER", // dispatcher → driver
  TO_DISPATCH: "TO_DISPATCH", // driver → dispatcher
} as const;

/** What produced the message body. */
export const CHAT_MESSAGE_KIND = {
  TEXT: "TEXT", // free-text message
  TEMPLATE: "TEMPLATE", // driver quick-reply
  BROADCAST: "BROADCAST", // dispatcher emergency broadcast, fanned out per driver
} as const;

/**
 * One row per driver — the dispatcher inbox index. Keeping last-message
 * metadata here makes the inbox an O(drivers) scan instead of a
 * GROUP BY over the whole message table.
 */
export const chatConversations = pgTable(
  "chat_conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "restrict" }),
    driverId: uuid("driver_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    lastMessageAt: timestamp("last_message_at"),
    lastMessagePreview: text("last_message_preview"),
    unreadForDispatch: integer("unread_for_dispatch").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("chat_conv_company_driver_uq").on(
      table.companyId,
      table.driverId,
    ),
    index("chat_conv_inbox_idx").on(table.companyId, table.lastMessageAt),
  ],
);

/**
 * One row per message. A broadcast fans out to one row per active
 * driver so each driver's thread is simply
 * `WHERE company_id = ? AND driver_id = ?` ordered by `created_at`.
 */
export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "restrict" }),
    driverId: uuid("driver_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    direction: varchar("direction", { length: 12 })
      .notNull()
      .$type<keyof typeof CHAT_DIRECTION>(),
    kind: varchar("kind", { length: 12 })
      .notNull()
      .$type<keyof typeof CHAT_MESSAGE_KIND>()
      .default("TEXT"),
    body: text("body").notNull(),
    templateCode: varchar("template_code", { length: 40 }),
    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("chat_msg_thread_idx").on(
      table.companyId,
      table.driverId,
      table.createdAt,
    ),
  ],
);
