"use client";

import { Inbox, MessageSquarePlus } from "lucide-react";
import { Can } from "@/components/auth/can";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useChat } from "./chat-context";

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const seconds = Math.floor((Date.now() - then) / 1000);
  if (seconds < 60) return "ahora";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
  });
}

export function ChatInbox() {
  const { state, actions } = useChat();

  if (state.isLoadingConversations && state.conversations.length === 0) {
    return (
      <div className="flex items-center justify-center flex-1">
        <div className="animate-spin size-5 border-2 border-[var(--cockpit-live)] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (state.conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 px-6 text-center">
        <div className="size-10 rounded-full border border-border/60 flex items-center justify-center mb-3 bg-background/40">
          <Inbox className="size-4 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium">La bandeja está limpia</p>
        <p className="cockpit-label mt-2 max-w-[220px]">
          Empieza un hilo con un conductor o difunde a toda la flota.
        </p>
        <Can perm="chat:create">
          <Button
            variant="secondary"
            size="sm"
            className="mt-4 h-8 gap-1.5 text-xs border border-border/60"
            onClick={actions.openPicker}
          >
            <MessageSquarePlus className="size-3.5 text-[var(--cockpit-live)]" />
            Iniciar conversación
          </Button>
        </Can>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto cockpit-scroll cockpit-divide">
      {state.conversations.map((conv) => {
        const hasUnread = conv.unreadForDispatch > 0;
        const isSelected = state.selectedDriverId === conv.driverId;
        return (
          <button
            type="button"
            key={conv.id}
            onClick={() => actions.openConversation(conv.driverId)}
            className={cn(
              "cockpit-enter w-full text-left px-3.5 py-3 transition-colors relative",
              "hover:bg-muted/60 focus:bg-muted/60 focus:outline-none",
              isSelected && "bg-muted",
              hasUnread && "bg-muted/30",
            )}
          >
            {hasUnread && (
              <span
                aria-hidden
                className="absolute left-0 top-0 bottom-0 w-[2px] bg-[var(--cockpit-live)]"
              />
            )}
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <span
                className={cn(
                  "text-sm truncate",
                  hasUnread ? "font-semibold" : "font-medium",
                )}
              >
                {conv.driverName ?? "Conductor"}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="cockpit-mono text-[10px] text-muted-foreground">
                  {relativeTime(conv.lastMessageAt)}
                </span>
                {hasUnread && (
                  <span className="cockpit-mono inline-flex h-[18px] min-w-[18px] items-center justify-center px-1 text-[10px] font-semibold rounded-full bg-[var(--cockpit-live)] text-primary-foreground">
                    {conv.unreadForDispatch}
                  </span>
                )}
              </div>
            </div>
            <p
              className={cn(
                "text-xs truncate",
                hasUnread ? "text-foreground/90" : "text-muted-foreground",
              )}
            >
              {conv.lastMessagePreview ?? "Sin mensajes"}
            </p>
          </button>
        );
      })}
    </div>
  );
}
