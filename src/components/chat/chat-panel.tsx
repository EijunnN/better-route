"use client";

import { Megaphone, MessageSquarePlus, Radio, X } from "lucide-react";
import { Can } from "@/components/auth/can";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChatBroadcastDialog } from "./chat-broadcast-dialog";
import { useChat } from "./chat-context";
import { ChatDriverPicker } from "./chat-driver-picker";
import { ChatInbox } from "./chat-inbox";
import { ChatThread } from "./chat-thread";

/**
 * Right-side panel of the monitoring page — inbox by default, thread
 * once a conversation is selected. Wraps Picker + Broadcast modals so
 * they always live inside the cockpit tree regardless of where the
 * trigger fires (panel header, sidebar item, driver detail CTA).
 *
 * `chat:read` gates the panel; `chat:create` gates composer + dialogs.
 */
export function ChatPanel() {
  return (
    <Can perm="chat:read">
      <ChatPanelInner />
    </Can>
  );
}

function ChatPanelInner() {
  const { state, actions, meta } = useChat();
  const isThread = state.selectedDriverId !== null;

  return (
    <>
      <div className="flex flex-col h-full">
        {!isThread && (
          <div className="px-3 pt-3 pb-2 shrink-0 border-b border-border/60">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <Radio className="size-3.5 text-[var(--cockpit-live)]" />
                <span className="cockpit-label">Bandeja</span>
                {meta.totalUnread > 0 && (
                  <Badge
                    variant="destructive"
                    className="cockpit-mono h-4 min-w-[16px] px-1 text-[10px] font-medium"
                  >
                    {meta.totalUnread}
                  </Badge>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={actions.closePanel}
                aria-label="Cerrar"
              >
                <X className="size-4" />
              </Button>
            </div>

            <Can perm="chat:create">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-9 justify-start gap-2 text-xs font-medium border border-border/60 hover:bg-muted"
                  onClick={actions.openPicker}
                >
                  <MessageSquarePlus className="size-3.5 text-[var(--cockpit-live)]" />
                  Nuevo mensaje
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-9 justify-start gap-2 text-xs font-medium border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 text-amber-100"
                  onClick={actions.openBroadcast}
                >
                  <Megaphone className="size-3.5 text-amber-400" />
                  Difusión
                </Button>
              </div>
            </Can>
          </div>
        )}

        {isThread ? <ChatThread /> : <ChatInbox />}
      </div>

      <ChatDriverPicker />
      <ChatBroadcastDialog />
    </>
  );
}
