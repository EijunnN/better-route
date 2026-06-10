"use client";

import { ArrowLeft, Loader2, Send } from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useCan } from "@/components/auth/can";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { quickReplyLabel } from "@/lib/chat/quick-replies";
import { cn } from "@/lib/utils";
import { type ChatMessage, useChat } from "./chat-context";

/** Distance from the bottom (px) under which a new arrival auto-scrolls. */
const STICK_BOTTOM_THRESHOLD = 120;
/** Distance from the top (px) under which we trigger scroll-back. */
const LOAD_OLDER_THRESHOLD = 80;

function messageTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function messageLabel(message: ChatMessage): string {
  if (message.kind === "TEMPLATE" && message.templateCode) {
    return quickReplyLabel(message.templateCode) ?? message.body;
  }
  return message.body;
}

function findConversationDriverName(
  conversations: { driverId: string; driverName: string | null }[],
  driverId: string,
): string {
  return (
    conversations.find((c) => c.driverId === driverId)?.driverName ??
    "Conductor"
  );
}

export function ChatThread() {
  const { state, actions } = useChat();
  const canSend = useCan("chat:create");

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const previousMessageCountRef = useRef(0);
  const previousScrollHeightRef = useRef(0);
  const previousScrollTopRef = useRef(0);
  const wasAtBottomRef = useRef(true);
  const justLoadedOlderRef = useRef(false);

  const [draft, setDraft] = useState("");

  const driverId = state.selectedDriverId;
  const driverName = driverId
    ? findConversationDriverName(state.conversations, driverId)
    : "";

  // Capture scroll state *before* the message list mutates so the
  // post-mutation effect can either stick to the bottom or preserve
  // the read position after a scroll-back load.
  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    previousScrollHeightRef.current = container.scrollHeight;
    previousScrollTopRef.current = container.scrollTop;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    wasAtBottomRef.current = distanceFromBottom <= STICK_BOTTOM_THRESHOLD;
  });

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const previousCount = previousMessageCountRef.current;
    previousMessageCountRef.current = state.messages.length;

    if (state.messages.length === 0) return;

    if (justLoadedOlderRef.current) {
      // Older messages were prepended — preserve the user's read
      // position by offsetting scrollTop by the height delta.
      const delta = container.scrollHeight - previousScrollHeightRef.current;
      container.scrollTop = previousScrollTopRef.current + delta;
      justLoadedOlderRef.current = false;
      return;
    }

    if (previousCount === 0) {
      // Initial load — pin to the latest message.
      container.scrollTop = container.scrollHeight;
      return;
    }

    if (state.messages.length > previousCount && wasAtBottomRef.current) {
      container.scrollTop = container.scrollHeight;
    }
  }, [state.messages]);

  const handleScroll = () => {
    const container = scrollRef.current;
    if (!container) return;
    if (
      container.scrollTop <= LOAD_OLDER_THRESHOLD &&
      state.hasMoreOlder &&
      !state.isLoadingOlder
    ) {
      justLoadedOlderRef.current = true;
      actions.loadOlder();
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || state.isSending) return;
    setDraft("");
    await actions.sendMessage(body);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends. Shift+Enter inserts a newline so dispatchers can
    // still compose multi-line messages when they actually want one.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  };

  if (!driverId) return null;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2.5 shrink-0 border-b border-border/60">
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          onClick={actions.closeConversation}
          aria-label="Volver"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm truncate tracking-tight">
            {driverName}
          </p>
          <span className="cockpit-label">Conductor</span>
        </div>
        <span
          role="img"
          aria-label={
            state.threadSubState === "subscribed"
              ? "Hilo en vivo"
              : state.threadSubState === "error"
                ? "Hilo sin tiempo real"
                : "Conectando hilo"
          }
          className="cockpit-led shrink-0"
          data-status={
            state.threadSubState === "subscribed"
              ? undefined
              : state.threadSubState === "error"
                ? "danger"
                : "warn"
          }
        />
      </div>

      {state.threadSubState === "error" && (
        <div className="cockpit-mono text-[10px] text-amber-300 bg-amber-500/10 border-b border-amber-500/30 px-3 py-1.5">
          Sin tiempo real — los mensajes nuevos llegarán al recargar la
          conversación.
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto cockpit-scroll p-3 space-y-2.5"
      >
        {state.hasMoreOlder && (
          <div className="flex justify-center py-1">
            {state.isLoadingOlder ? (
              <Loader2 className="size-3 animate-spin text-muted-foreground" />
            ) : (
              <span className="cockpit-label">Subí para ver más</span>
            )}
          </div>
        )}
        {state.isLoadingMessages && state.messages.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : state.messages.length === 0 ? (
          <div className="text-center py-12 px-4">
            <p className="text-xs font-medium text-foreground">Hilo nuevo</p>
            <p className="cockpit-label mt-2">
              Escribí el primer mensaje abajo
            </p>
          </div>
        ) : (
          state.messages.map((message) => {
            const outbound = message.direction === "TO_DRIVER";
            const isBroadcast = message.kind === "BROADCAST";
            return (
              <div
                key={message.id}
                className={cn(
                  "cockpit-enter flex flex-col max-w-[82%]",
                  outbound ? "self-end items-end ml-auto" : "items-start",
                )}
              >
                <div
                  className={cn(
                    "px-3 py-2 text-sm whitespace-pre-wrap break-words rounded-md border",
                    outbound
                      ? "bg-[var(--cockpit-live)]/10 border-[var(--cockpit-live)]/30 text-foreground"
                      : "bg-muted border-border/60 text-foreground",
                    isBroadcast && "bg-amber-500/10 border-amber-500/30",
                  )}
                >
                  {messageLabel(message)}
                </div>
                <div className="flex items-center gap-1.5 mt-1 px-1">
                  {isBroadcast && (
                    <span className="cockpit-mono text-[9px] uppercase tracking-wider text-amber-400 px-1.5 py-0.5 border border-amber-500/30 rounded-sm">
                      Difusión
                    </span>
                  )}
                  <span className="cockpit-mono text-[10px] text-muted-foreground">
                    {messageTime(message.createdAt)}
                  </span>
                  {outbound && message.readAt && (
                    <span
                      className="cockpit-mono text-[10px] text-[var(--cockpit-live)]"
                      title={`Leído ${messageTime(message.readAt)}`}
                    >
                      ✓✓ Leído
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="border-t border-border/60 p-2 flex items-end gap-2 shrink-0"
      >
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder={
            canSend
              ? "Escribe un mensaje…"
              : "No tienes permiso para enviar mensajes"
          }
          disabled={!canSend || state.isSending}
          className="min-h-[36px] max-h-32 text-sm resize-none bg-background/60 border-border/60"
        />
        <Button
          type="submit"
          size="icon"
          className="size-9 shrink-0"
          disabled={!canSend || state.isSending || draft.trim().length === 0}
          aria-label="Enviar"
        >
          {state.isSending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
        </Button>
      </form>
      {state.sendError && (
        <p className="px-3 pb-2 -mt-1 text-[11px] text-destructive">
          {state.sendError}
        </p>
      )}
    </div>
  );
}
