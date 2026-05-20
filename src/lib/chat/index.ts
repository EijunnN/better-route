// SERVER-ONLY barrel — re-exports `service.ts`, which imports the
// Postgres driver. A `from "@/lib/chat"` in a client component drags
// the entire DB layer into the browser bundle and fails the build with
// "Module not found: Can't resolve 'fs'". Client components must import
// browser-safe helpers from their leaf modules:
//   import { quickReplyLabel } from "@/lib/chat/quick-replies";
export { isDispatchRole } from "./access";
export {
  CHAT_QUICK_REPLIES,
  type ChatQuickReplyCode,
  isQuickReplyCode,
  quickReplyLabel,
} from "./quick-replies";
export {
  broadcastChatMessage,
  type ChatMessageRow,
  markConversationRead,
  type SendChatMessageInput,
  sendChatMessage,
} from "./service";
