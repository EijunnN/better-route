/**
 * Hardcoded driver quick-reply templates (ADR-0007 MVP).
 *
 * A driver handling a vehicle should not be typing — tappable chips
 * cover the common cases. Per-company configurable templates are a
 * later iteration.
 */

export const CHAT_QUICK_REPLIES = [
  { code: "ON_THE_WAY", label: "Voy en camino" },
  { code: "ARRIVED", label: "Llegué al punto" },
  { code: "CUSTOMER_ABSENT", label: "Cliente ausente" },
  { code: "DELAYED", label: "Me demoro unos minutos" },
  { code: "NEED_HELP", label: "Necesito ayuda" },
] as const;

export type ChatQuickReplyCode = (typeof CHAT_QUICK_REPLIES)[number]["code"];

/** Runtime guard for a quick-reply code arriving from a client. */
export function isQuickReplyCode(code: string): code is ChatQuickReplyCode {
  return CHAT_QUICK_REPLIES.some((r) => r.code === code);
}

/** The display label for a quick-reply code, or null if unknown. */
export function quickReplyLabel(code: string): string | null {
  return CHAT_QUICK_REPLIES.find((r) => r.code === code)?.label ?? null;
}
