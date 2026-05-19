"use client";

import { Centrifuge, type PublicationContext } from "centrifuge";
import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import useSWR from "swr";
import { useCompanyContext } from "@/hooks/use-company-context";

/**
 * Dispatcher chat (ADR-0007, issue 010).
 *
 * One Centrifuge connection per session subscribed to
 *   chat:{companyId}:inbox          — inbox bumps for every conversation
 * via the user's connection token (server-side subscription). When the
 * dispatcher opens a thread we ad-hoc subscribe to
 *   chat:{companyId}:driver:{id}
 * with a subscription token minted by /api/realtime/subscription-token —
 * a narrow, short-lived authorization per thread, so a leak only ever
 * exposes one conversation.
 */

const POLLING_INTERVAL = 60000;
const INITIAL_LIMIT = 50;
const SCROLL_BACK_LIMIT = 50;

export interface ConversationRow {
  id: string;
  driverId: string;
  driverName: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadForDispatch: number;
}

export interface ChatMessage {
  id: string;
  companyId: string;
  driverId: string;
  senderId: string;
  direction: "TO_DRIVER" | "TO_DISPATCH";
  kind: "TEXT" | "TEMPLATE" | "BROADCAST";
  body: string;
  templateCode: string | null;
  readAt: string | null;
  createdAt: string;
}

interface InboxPublication {
  kind?: string;
  driverId?: string;
}

interface ThreadPublication {
  kind?: string;
  message?: ChatMessage;
}

function resolveWsUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_CENTRIFUGO_WS_URL;
  if (explicit) return explicit;
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}/connection/websocket`;
}

async function fetchConversations(
  url: string,
  companyId: string,
): Promise<ConversationRow[]> {
  const res = await fetch(url, { headers: { "x-company-id": companyId } });
  if (!res.ok) throw new Error("Bandeja inalcanzable");
  const json = (await res.json()) as { data: ConversationRow[] };
  return json.data;
}

interface ChatState {
  conversations: ConversationRow[];
  isLoadingConversations: boolean;
  selectedDriverId: string | null;
  messages: ChatMessage[];
  isLoadingMessages: boolean;
  isLoadingOlder: boolean;
  hasMoreOlder: boolean;
  isSending: boolean;
  sendError: string | null;
}

interface ChatActions {
  openConversation: (driverId: string) => void;
  closeConversation: () => void;
  sendMessage: (body: string, templateCode?: string) => Promise<void>;
  loadOlder: () => Promise<void>;
  refreshConversations: () => Promise<void>;
}

interface ChatMeta {
  companyId: string | null;
  totalUnread: number;
}

interface ChatContextValue {
  state: ChatState;
  actions: ChatActions;
  meta: ChatMeta;
}

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

export function ChatProvider({ children }: { children: ReactNode }) {
  const { effectiveCompanyId: companyId } = useCompanyContext();

  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Latest message id — used to gap-fetch on subscription reconnect so we
  // never silently drop publications dispatched while the WS was down.
  const latestMessageIdRef = useRef<string | null>(null);
  const subscribedOnceRef = useRef(false);
  const centrifugeRef = useRef<Centrifuge | null>(null);

  const {
    data: conversations = [],
    isLoading: isLoadingConversations,
    mutate: mutateConversations,
  } = useSWR<ConversationRow[]>(
    companyId ? ["/api/chat/conversations", companyId] : null,
    ([url, cId]: [string, string]) => fetchConversations(url, cId),
    {
      refreshInterval: POLLING_INTERVAL,
      revalidateOnFocus: true,
      dedupingInterval: 2000,
    },
  );

  // One persistent Centrifuge connection — auto-subscribes to the
  // dispatcher's company channels (monitoring/inbox/broadcast) via the
  // token's `channels` claim. Per-thread subscriptions attach to this
  // same instance so we keep exactly one WS open per dispatcher tab.
  useEffect(() => {
    if (!companyId) return;

    const centrifuge = new Centrifuge(resolveWsUrl(), {
      getToken: async () => {
        const res = await fetch("/api/realtime/token", {
          headers: { "x-company-id": companyId },
        });
        if (!res.ok) throw new Error("Failed to fetch realtime token");
        const { token } = (await res.json()) as { token: string };
        return token;
      },
    });

    centrifuge.on("publication", (ctx) => {
      // Only inbox events matter at the connection level; per-thread
      // events arrive on their own Subscription handler.
      const data = ctx.data as InboxPublication | undefined;
      if (data?.kind === "chat.inbox") {
        mutateConversations();
      }
    });

    centrifuge.connect();
    centrifugeRef.current = centrifuge;

    return () => {
      centrifuge.disconnect();
      centrifugeRef.current = null;
    };
  }, [companyId, mutateConversations]);

  // Whenever the selected thread changes: tear down the previous
  // subscription, load the initial page, mint a subscription token for
  // the new channel, attach the publication handler, and POST /read so
  // the inbox unread badge clears.
  useEffect(() => {
    if (!companyId || !selectedDriverId) {
      setMessages([]);
      latestMessageIdRef.current = null;
      subscribedOnceRef.current = false;
      setHasMoreOlder(false);
      return;
    }

    const driverId = selectedDriverId;
    const centrifuge = centrifugeRef.current;
    if (!centrifuge) return;

    let cancelled = false;
    setIsLoadingMessages(true);
    setSendError(null);
    subscribedOnceRef.current = false;

    const channel = `chat:${companyId}:driver:${driverId}`;

    const loadInitial = async () => {
      const res = await fetch(
        `/api/chat/conversations/${driverId}/messages?limit=${INITIAL_LIMIT}`,
        { headers: { "x-company-id": companyId } },
      );
      if (!res.ok || cancelled) return;
      const json = (await res.json()) as { data: ChatMessage[] };
      if (cancelled) return;
      setMessages(json.data);
      setHasMoreOlder(json.data.length >= INITIAL_LIMIT);
      const newest = json.data[json.data.length - 1];
      latestMessageIdRef.current = newest?.id ?? null;
    };

    const markRead = async () => {
      try {
        await fetch(`/api/chat/conversations/${driverId}/read`, {
          method: "POST",
          headers: { "x-company-id": companyId },
        });
        if (!cancelled) mutateConversations();
      } catch {
        // Best-effort. The badge will clear on the next inbox bump.
      }
    };

    const setupSubscription = async () => {
      try {
        const tokenRes = await fetch(
          `/api/realtime/subscription-token?channel=${encodeURIComponent(channel)}`,
          { headers: { "x-company-id": companyId } },
        );
        if (!tokenRes.ok) throw new Error("subscription-token failed");
        const { token } = (await tokenRes.json()) as { token: string };

        if (cancelled) return null;

        const sub =
          centrifuge.getSubscription(channel) ??
          centrifuge.newSubscription(channel, { token });

        sub.on("publication", (ctx: PublicationContext) => {
          const data = ctx.data as ThreadPublication | undefined;
          if (data?.kind !== "chat.message" || !data.message) return;
          if (data.message.driverId !== driverId) return;

          setMessages((prev) => {
            if (prev.some((m) => m.id === data.message?.id)) return prev;
            return [...prev, data.message as ChatMessage];
          });
          latestMessageIdRef.current = data.message.id;
        });

        sub.on("subscribed", async () => {
          // First fire is the initial subscribe — the initial fetch
          // covers the load. Later fires are reconnects, where we need
          // to pull any messages that landed while the WS was offline.
          if (!subscribedOnceRef.current) {
            subscribedOnceRef.current = true;
            return;
          }
          const lastId = latestMessageIdRef.current;
          if (!lastId) return;
          try {
            const gap = await fetch(
              `/api/chat/conversations/${driverId}/messages?after=${lastId}`,
              { headers: { "x-company-id": companyId } },
            );
            if (!gap.ok || cancelled) return;
            const gapJson = (await gap.json()) as { data: ChatMessage[] };
            if (gapJson.data.length === 0 || cancelled) return;
            setMessages((prev) => {
              const seen = new Set(prev.map((m) => m.id));
              const fresh = gapJson.data.filter((m) => !seen.has(m.id));
              if (fresh.length === 0) return prev;
              const next = [...prev, ...fresh];
              latestMessageIdRef.current = next[next.length - 1].id;
              return next;
            });
          } catch {
            // Stay silent — the next inbox bump will eventually trigger
            // a manual reopen or another reconnect.
          }
        });

        sub.subscribe();
        return sub;
      } catch (err) {
        console.error("[chat] subscription setup failed:", err);
        return null;
      }
    };

    Promise.all([loadInitial(), setupSubscription()]).then(() => {
      if (!cancelled) {
        setIsLoadingMessages(false);
        markRead();
      }
    });

    return () => {
      cancelled = true;
      const sub = centrifuge.getSubscription(channel);
      if (sub) {
        sub.removeAllListeners();
        sub.unsubscribe();
        centrifuge.removeSubscription(sub);
      }
    };
  }, [companyId, selectedDriverId, mutateConversations]);

  const openConversation = useCallback((driverId: string) => {
    setSelectedDriverId(driverId);
  }, []);

  const closeConversation = useCallback(() => {
    setSelectedDriverId(null);
  }, []);

  const sendMessage = useCallback(
    async (body: string, templateCode?: string) => {
      if (!companyId || !selectedDriverId) return;
      const text = body.trim();
      if (!text) return;

      setIsSending(true);
      setSendError(null);
      try {
        const res = await fetch(
          `/api/chat/conversations/${selectedDriverId}/messages`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-company-id": companyId,
            },
            body: JSON.stringify({ body: text, templateCode }),
          },
        );
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(err.error ?? "No se pudo enviar el mensaje");
        }
        // The Centrifugo publish from the server will deliver the
        // message back to this client on the thread subscription, so
        // we do not optimistically insert — that would risk a duplicate
        // when the dedupe-by-id check in the subscription handler runs
        // a microsecond too late.
      } catch (err) {
        setSendError(err instanceof Error ? err.message : "Error desconocido");
      } finally {
        setIsSending(false);
      }
    },
    [companyId, selectedDriverId],
  );

  const loadOlder = useCallback(async () => {
    if (!companyId || !selectedDriverId || messages.length === 0) return;
    if (isLoadingOlder || !hasMoreOlder) return;

    const oldestId = messages[0].id;
    setIsLoadingOlder(true);
    try {
      const res = await fetch(
        `/api/chat/conversations/${selectedDriverId}/messages?before=${oldestId}&limit=${SCROLL_BACK_LIMIT}`,
        { headers: { "x-company-id": companyId } },
      );
      if (!res.ok) return;
      const json = (await res.json()) as { data: ChatMessage[] };
      if (json.data.length === 0) {
        setHasMoreOlder(false);
        return;
      }
      setMessages((prev) => [...json.data, ...prev]);
      setHasMoreOlder(json.data.length >= SCROLL_BACK_LIMIT);
    } finally {
      setIsLoadingOlder(false);
    }
  }, [companyId, selectedDriverId, messages, isLoadingOlder, hasMoreOlder]);

  const refreshConversations = useCallback(async () => {
    await mutateConversations();
  }, [mutateConversations]);

  const totalUnread = conversations.reduce(
    (acc, c) => acc + c.unreadForDispatch,
    0,
  );

  const state: ChatState = {
    conversations,
    isLoadingConversations,
    selectedDriverId,
    messages,
    isLoadingMessages,
    isLoadingOlder,
    hasMoreOlder,
    isSending,
    sendError,
  };

  const actions: ChatActions = {
    openConversation,
    closeConversation,
    sendMessage,
    loadOlder,
    refreshConversations,
  };

  const meta: ChatMeta = {
    companyId,
    totalUnread,
  };

  return <ChatContext value={{ state, actions, meta }}>{children}</ChatContext>;
}

export function useChat(): ChatContextValue {
  const ctx = use(ChatContext);
  if (!ctx) throw new Error("useChat must be used within a ChatProvider");
  return ctx;
}
