"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, ChevronDown, Lock, MessageSquare } from "lucide-react";
import type { ChatRoomZone } from "@repo/shared";
import type { ChatScope } from "../../lib/space-api";
import type { ChatEntry, ChatRequest, DirectChat, OutgoingRequest } from "../../hooks/use-space-socket";

/** "general", "room", or a private chat with one person: "dm:<userId>". */
export type ChatChannel = "general" | "room" | `dm:${string}`;

const directUserId = (channel: ChatChannel) => (channel.startsWith("dm:") ? channel.slice(3) : null);

type ChatPanelProps = {
  generalMessages: ChatEntry[];
  roomMessages: ChatEntry[];
  currentRoom: ChatRoomZone | null;
  names: Record<string, string>;
  selfId: string | null;
  onSend: (text: string, scope: ChatScope) => void;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  channel: ChatChannel;
  onChannelChange: (channel: ChatChannel) => void;
  directChats: Record<string, DirectChat>;
  chatRequests: ChatRequest[];
  outgoingRequests: Record<string, OutgoingRequest>;
  /** People in the space right now, to offer "Ask again" when someone comes back. */
  onlineIds: Set<string>;
  onAnswerRequest: (userId: string, accept: boolean) => void;
  onSendDirect: (userId: string, text: string) => void;
  onRequestChat: (userId: string) => void;
};

export function ChatPanel({
  generalMessages,
  roomMessages,
  currentRoom,
  names,
  selfId,
  onSend,
  open,
  onOpen,
  onClose,
  channel,
  onChannelChange,
  directChats,
  chatRequests,
  outgoingRequests,
  onlineIds,
  onAnswerRequest,
  onSendDirect,
  onRequestChat,
}: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const isCollapsed = !open;
  const [generalUnread, setGeneralUnread] = useState(0);
  const [roomUnread, setRoomUnread] = useState(0);
  const [directUnread, setDirectUnread] = useState<Record<string, number>>({});
  const listRef = useRef<HTMLDivElement | null>(null);
  const previousGeneralCount = useRef(generalMessages.length);
  const previousRoomCount = useRef(roomMessages.length);
  const previousDirectCounts = useRef<Record<string, number>>({});
  // Chats counted as one unread for opening, before any message arrived.
  const openedUnseen = useRef<Set<string>>(new Set());

  const directId = directUserId(channel);
  const directChat = directId ? directChats[directId] : undefined;
  const messages = useMemo(
    () => (channel === "general" ? generalMessages : channel === "room" ? roomMessages : directChat?.messages ?? []),
    [channel, generalMessages, roomMessages, directChat],
  );
  const roomEnabled = !!currentRoom;
  const directIds = Object.keys(directChats);

  useEffect(() => {
    if (channel === "room" && !roomEnabled) onChannelChange("general");
    if (directId && !directChats[directId]) onChannelChange("general");
  }, [channel, roomEnabled, directId, directChats, onChannelChange]);

  useEffect(() => {
    const incoming = generalMessages.length - previousGeneralCount.current;
    if (incoming > 0 && (isCollapsed || channel !== "general")) {
      setGeneralUnread((count) => count + incoming);
    }
    previousGeneralCount.current = generalMessages.length;
  }, [generalMessages.length, isCollapsed, channel]);

  useEffect(() => {
    const incoming = roomMessages.length - previousRoomCount.current;
    if (incoming > 0 && (isCollapsed || channel !== "room")) {
      setRoomUnread((count) => count + incoming);
    }
    previousRoomCount.current = roomMessages.length;
  }, [roomMessages.length, isCollapsed, channel]);

  useEffect(() => {
    const previous = previousDirectCounts.current;
    const counts: Record<string, number> = {};
    const added: Record<string, number> = {};
    for (const [userId, chat] of Object.entries(directChats)) {
      counts[userId] = chat.messages.length;
      if (!isCollapsed && channel === `dm:${userId}`) {
        openedUnseen.current.delete(userId);
        continue;
      }
      const before = previous[userId];
      let incoming = chat.messages.length - (before ?? 0);
      if (before === undefined && chat.messages.length === 0) {
        // A chat that just opened counts once, so the person who asked sees the yes.
        incoming = 1;
        openedUnseen.current.add(userId);
      } else if (incoming > 0 && openedUnseen.current.delete(userId)) {
        // Its first message replaces that count instead of adding to it.
        incoming -= 1;
      }
      if (incoming > 0) added[userId] = incoming;
    }
    previousDirectCounts.current = counts;
    if (Object.keys(added).length > 0) {
      setDirectUnread((current) => {
        const next = { ...current };
        for (const [userId, count] of Object.entries(added)) next[userId] = (next[userId] ?? 0) + count;
        return next;
      });
    }
  }, [directChats, isCollapsed, channel]);

  useEffect(() => {
    if (!isCollapsed) {
      if (channel === "general") setGeneralUnread(0);
      else if (channel === "room") setRoomUnread(0);
      else if (directId) setDirectUnread((current) => (current[directId] ? { ...current, [directId]: 0 } : current));
      if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, isCollapsed, channel, directId]);

  const directUnreadTotal = Object.values(directUnread).reduce((sum, count) => sum + count, 0);
  const totalUnread = generalUnread + roomUnread + directUnreadTotal + chatRequests.length;
  const roomLabel = currentRoom?.name ?? "Room";

  function nameFor(userId: string) {
    const name = names[userId] ?? (userId === selfId ? "You" : userId.slice(0, 5));
    return name.length > 20 ? `${name.slice(0, 20)}...` : name;
  }

  const directName = directId ? nameFor(directId) : "";
  const emptyCopy = useMemo(() => {
    if (directId) {
      return {
        title: `Private chat with ${directName}`,
        body: "Only the two of you see these messages. They aren't saved, so they're gone once you leave the space.",
      };
    }
    if (channel === "general") {
      return { title: "No messages yet", body: "General chat reaches everyone in this space." };
    }
    if (!currentRoom) {
      return { title: "Enter a room", body: "Room chat becomes available inside a named room." };
    }
    return { title: `No messages in ${currentRoom.name}`, body: "Messages here stay with this room." };
  }, [channel, currentRoom, directId, directName]);

  const canSend = directId ? !!directChat?.open : channel === "general" || !!currentRoom;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !canSend) return;
    if (directId) onSendDirect(directId, text);
    else onSend(text, channel === "room" ? "room" : "general");
    setDraft("");
  }

  function accept(userId: string) {
    onAnswerRequest(userId, true);
    onChannelChange(`dm:${userId}`);
  }

  // Closed: a green chat icon in the bottom-left corner, with the unread count.
  if (isCollapsed) {
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-label={totalUnread > 0 ? `Open chat, ${totalUnread} unread` : "Open chat"}
        title="Chat"
        className="pointer-events-auto absolute bottom-20 left-3 z-[65] md:bottom-3 grid h-12 w-12 cursor-pointer place-items-center rounded-[14px] bg-[#30d158] text-white shadow-2xl transition hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-95"
      >
        <svg className="h-6 w-6 fill-current" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2C6.48 2 2 5.82 2 10.5c0 2.37 1.15 4.5 3 6.02L4 21l4.83-1.61c1 .35 2.08.61 3.17.61 5.52 0 10-3.82 10-8.5S17.52 2 12 2z" />
        </svg>
        {totalUnread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold tabular-nums" aria-hidden="true">
            {totalUnread > 99 ? "99+" : totalUnread}
          </span>
        )}
      </button>
    );
  }

  const placeholder = directId
    ? `Message ${directName}…`
    : channel === "room" && !currentRoom
      ? "Enter a room to chat"
      : `Message ${channel === "general" ? "everyone" : roomLabel}…`;

  return (
    <section
      aria-label="Chat"
      className="pointer-events-auto absolute bottom-20 left-3 z-[65] md:bottom-3 flex h-[min(380px,calc(100dvh-20rem))] min-h-[13rem] w-[min(20rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-black/5 bg-white/95 shadow-[0_18px_44px_-18px_rgba(18,21,28,0.45)] backdrop-blur-md"
    >
      <header className="flex items-center justify-between border-b border-[#eceef1] px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-[#12151c]">
          <MessageSquare size={16} aria-hidden="true" />
          Chat
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Minimise chat"
          className="grid h-7 w-7 cursor-pointer place-items-center rounded-lg text-[#8a909b] transition hover:bg-[#f4f5f7] hover:text-[#12151c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#12151c]"
        >
          <ChevronDown size={16} aria-hidden="true" />
        </button>
      </header>

      <div className="grid grid-cols-2 gap-1 border-b border-[#eceef1] bg-[#f7f8fa] p-1.5">
        <ChannelTab
          label="General"
          active={channel === "general"}
          unread={generalUnread}
          onClick={() => onChannelChange("general")}
        />
        <ChannelTab
          label={roomLabel}
          active={channel === "room"}
          unread={roomUnread}
          disabled={!roomEnabled}
          onClick={() => onChannelChange("room")}
        />
      </div>

      {directIds.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto border-b border-[#eceef1] px-2.5 py-2" aria-label="Private chats" role="group">
          <Lock size={12} className="shrink-0 text-[#8a909b]" aria-hidden="true" />
          {directIds.map((userId) => (
            <PersonChip
              key={userId}
              name={nameFor(userId)}
              active={channel === `dm:${userId}`}
              unread={directUnread[userId] ?? 0}
              away={!directChats[userId]?.open}
              onClick={() => onChannelChange(`dm:${userId}`)}
            />
          ))}
        </div>
      )}

      {chatRequests.length > 0 && (
        <ul aria-label="Chat requests" className="flex max-h-48 flex-col gap-2 overflow-y-auto border-b border-[#eceef1] bg-[#f7f8fa] p-2.5">
          {chatRequests.map((request) => (
            <li key={request.fromUserId} className="rounded-xl bg-white p-3 ring-1 ring-[#e6e7ea]">
              <p className="text-[13px] leading-snug text-[#12151c]">
                <span className="font-semibold">{nameFor(request.fromUserId)}</span> wants to chat privately.
              </p>
              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  onClick={() => onAnswerRequest(request.fromUserId, false)}
                  className="flex-1 cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold text-[#5c6371] ring-1 ring-[#e6e7ea] transition hover:bg-[#f4f5f7] hover:text-[#12151c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#12151c] active:scale-[0.98]"
                >
                  Decline
                </button>
                <button
                  type="button"
                  onClick={() => accept(request.fromUserId)}
                  className="flex-1 cursor-pointer rounded-lg bg-[#12151c] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12151c] active:scale-[0.98]"
                >
                  Accept
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div ref={listRef} className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-3" aria-live="polite">
        {messages.length === 0 || (channel === "room" && !currentRoom) ? (
          <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
            <p className="text-xs font-semibold text-[#5c6371]">{emptyCopy.title}</p>
            <p className="mt-1 text-[11px] leading-4 text-[#8a909b]">{emptyCopy.body}</p>
          </div>
        ) : (
          <>
            {directId && (
              <p className="flex items-center justify-center gap-1 text-[11px] text-[#8a909b]">
                <Lock size={11} aria-hidden="true" />
                Only you and {directName} see this chat
              </p>
            )}
            {messages.map((message) => {
              const isSelf = message.userId === selfId;
              return (
                <div key={message.id} className={`flex w-full flex-col ${isSelf ? "items-end" : "items-start"}`}>
                  {!isSelf && !directId && (
                    <span className="mb-0.5 px-1 text-[11px] font-medium text-[#8a909b]">
                      {nameFor(message.userId)}
                    </span>
                  )}
                  <div className={`max-w-[85%] break-words px-3 py-2 text-[13px] leading-snug ${
                    isSelf
                      ? "rounded-2xl rounded-br-md bg-[#12151c] text-white"
                      : "rounded-2xl rounded-bl-md bg-[#f1f3f6] text-[#12151c]"
                  }`}>
                    {message.text}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {directId && directChat && !directChat.open ? (
        <div className="flex items-center justify-between gap-2 border-t border-[#eceef1] bg-[#f7f8fa] px-3.5 py-3 text-xs text-[#5c6371]">
          {outgoingRequests[directId] === "pending" ? (
            <span>Request sent. Waiting for {directName}.</span>
          ) : onlineIds.has(directId) ? (
            <>
              <span>
                {outgoingRequests[directId] === "declined"
                  ? `${directName} said no for now. You can ask again in a minute.`
                  : `This chat closed when ${directName} left.`}
              </span>
              <button
                type="button"
                onClick={() => onRequestChat(directId)}
                className="shrink-0 cursor-pointer rounded-lg bg-[#12151c] px-2.5 py-1.5 font-semibold text-white transition hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12151c] active:scale-[0.98]"
              >
                Ask again
              </button>
            </>
          ) : (
            <span>{directName} left the space, so this chat is closed.</span>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="flex items-center gap-2 border-t border-[#eceef1] bg-white p-2.5">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={placeholder}
            aria-label={directId ? `Private message to ${directName}` : "Chat message"}
            maxLength={500}
            disabled={!canSend}
            className="min-w-0 flex-1 rounded-xl border border-[#e6e7ea] bg-[#f7f8fa] px-3 py-2 text-[13px] text-[#12151c] outline-none transition placeholder:text-[#8a909b] focus:border-[#12151c]/30 focus:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!draft.trim() || !canSend}
            aria-label="Send message"
            className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-xl bg-[#12151c] text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-[#e6e7ea] disabled:text-[#8a909b]"
          >
            <ArrowUp size={16} strokeWidth={2.5} aria-hidden="true" />
          </button>
        </form>
      )}
    </section>
  );
}

function ChannelTab({
  label,
  active,
  unread,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  unread: number;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`relative cursor-pointer truncate rounded-lg px-2 py-1.5 text-xs font-semibold transition ${
        active ? "bg-white text-[#12151c] shadow-sm" : "text-[#5c6371] hover:text-[#12151c]"
      } disabled:cursor-not-allowed disabled:opacity-45`}
      title={label}
    >
      {label}
      {unread > 0 && <span className="ml-1 rounded bg-[#12151c] px-1 text-[10px] text-white">{unread}</span>}
    </button>
  );
}

function PersonChip({
  name,
  active,
  unread,
  away,
  onClick,
}: {
  name: string;
  active: boolean;
  unread: number;
  away: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={away ? `${name} (left the space)` : `Private chat with ${name}`}
      className={`flex max-w-[9.5rem] shrink-0 cursor-pointer items-center gap-1.5 rounded-lg py-1 pl-1 pr-2 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#12151c] active:scale-[0.98] ${
        active ? "bg-[#12151c] text-white" : "bg-[#f1f3f6] text-[#5c6371] hover:text-[#12151c]"
      } ${away ? "opacity-60" : ""}`}
    >
      <span
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-md text-[10px] font-bold ${
          active ? "bg-white/15 text-white" : "bg-white text-[#12151c]"
        }`}
        aria-hidden="true"
      >
        {name.charAt(0).toUpperCase()}
      </span>
      <span className="truncate">{name}</span>
      {unread > 0 && (
        <span className="rounded bg-[#e5484d] px-1 text-[10px] tabular-nums text-white">{unread}</span>
      )}
    </button>
  );
}
