"use client";

import { MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useChat } from "./chat-context";

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const seconds = Math.floor((Date.now() - then) / 1000);
  if (seconds < 60) return "ahora";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days}d`;
  return new Date(iso).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
  });
}

export function ChatInbox() {
  const { state, actions } = useChat();

  if (state.isLoadingConversations && state.conversations.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin size-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (state.conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-6 text-center">
        <MessageSquare className="size-8 mb-2 opacity-50" />
        <p className="text-sm">Sin conversaciones todavía</p>
        <p className="text-xs mt-1">
          Cuando un conductor envíe un mensaje aparecerá aquí.
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="divide-y">
        {state.conversations.map((conv) => {
          const hasUnread = conv.unreadForDispatch > 0;
          return (
            <button
              type="button"
              key={conv.id}
              onClick={() => actions.openConversation(conv.driverId)}
              className={cn(
                "w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors",
                "focus:outline-none focus:bg-muted/50",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    "text-sm truncate",
                    hasUnread ? "font-semibold" : "font-medium",
                  )}
                >
                  {conv.driverName ?? "Conductor"}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] text-muted-foreground">
                    {relativeTime(conv.lastMessageAt)}
                  </span>
                  {hasUnread && (
                    <Badge
                      variant="destructive"
                      className="h-5 min-w-[20px] px-1.5 text-[10px]"
                    >
                      {conv.unreadForDispatch}
                    </Badge>
                  )}
                </div>
              </div>
              <p
                className={cn(
                  "text-xs mt-0.5 truncate",
                  hasUnread ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {conv.lastMessagePreview ?? "Sin mensajes"}
              </p>
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
}
