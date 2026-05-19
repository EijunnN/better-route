"use client";

import { MessageSquare, X } from "lucide-react";
import { Can } from "@/components/auth/can";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useChat } from "./chat-context";
import { ChatInbox } from "./chat-inbox";
import { ChatThread } from "./chat-thread";

interface ChatPanelProps {
  onClose: () => void;
}

/**
 * Right-side panel of the monitoring page. Either the inbox or the
 * open thread renders; closing the thread returns to the inbox.
 *
 * Gated by `chat:read`: a viewer without it never sees the panel.
 * Inside, the composer is further gated by `chat:create`.
 */
export function ChatPanel({ onClose }: ChatPanelProps) {
  return (
    <Can perm="chat:read">
      <ChatPanelInner onClose={onClose} />
    </Can>
  );
}

function ChatPanelInner({ onClose }: ChatPanelProps) {
  const { state, meta } = useChat();
  const isThread = state.selectedDriverId !== null;

  return (
    <div className="flex flex-col h-full">
      {!isThread && (
        <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
          <div className="flex items-center gap-2">
            <MessageSquare className="size-4 text-muted-foreground" />
            <span className="font-medium text-sm">Mensajes</span>
            {meta.totalUnread > 0 && (
              <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                {meta.totalUnread}
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <X className="size-4" />
          </Button>
        </div>
      )}

      {isThread ? <ChatThread /> : <ChatInbox />}
    </div>
  );
}
