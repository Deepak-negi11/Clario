"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  customRoomAt, DM_TEXT_MAX_CHARS, getChatRoomAtPosition, ServerMessage,
  type AvatarLook, type CustomMap, type MapTemplateId, type PlayClientMessage, type PlayerProp, type PlayServerMessage,
} from "@repo/shared";
import { getAuthToken } from "../lib/auth-token";
import { getSpaceMessages, type ChatScope } from "../lib/space-api";
import { captureEvent } from "../lib/analytics";
import { createPrivateChatKeys } from "../lib/private-chat-keys";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
const WS_URL = API_BASE.replace(/^http/, "ws") + "/ws";

export type Position = { x: number; y: number };
export type Others = Record<string, Position>;
// "reconnecting": the connection dropped after joining (a server restart, a network blip) and
// is being retried; the map stays on screen meanwhile.
type Status = "connecting" | "joined" | "reconnecting" | "error";

// Waits 0.5 s, 1 s, 2 s, 4 s, then 8 s between tries: about a minute before giving up.
const MAX_RECONNECTS = 10;
const reconnectDelay = (attempt: number) => Math.min(8000, 500 * 2 ** attempt);
// A server that accepts the connection but never answers the join (it hung, or an older version
// crashed mid-join) would keep the loading screen up forever: drop the connection and retry.
const JOIN_TIMEOUT_MS = 10_000;

// Sets (or, with null, clears) one person's prop, keeping the same object when nothing changes.
function withProp(props: Record<string, PlayerProp>, userId: string, prop: PlayerProp | null) {
  if (!prop) {
    if (!(userId in props)) return props;
    const next = { ...props };
    delete next[userId];
    return next;
  }
  return { ...props, [userId]: prop };
}

// Closes private chats (all, or one person's), keeping the messages. Same object when none was open.
function closeDirectChats(chats: Record<string, DirectChat>, closedBy: DirectChat["closedBy"], userId?: string) {
  let next = chats;
  for (const [id, chat] of Object.entries(chats)) {
    if (!chat.open || (userId && id !== userId)) continue;
    if (next === chats) next = { ...chats };
    next[id] = { messages: chat.messages, open: false, closedBy };
  }
  return next;
}

export type ChatEntry = {
  id: string;
  userId: string;
  text: string;
  at: number;
  scope: ChatScope;
  roomId?: string;
  roomName?: string;
};
export type Reaction = { id: string; userId: string; emoji: string; at: number };
export type AgentActivityEntry = {
  text: string;
  state: "cooking" | "done";
  at: number;
  /** Where the agent is working; absent when the hook doesn't share it. */
  project?: string;
  branch?: string;
  commit?: string;
};
export type AgentActivities = Record<string, AgentActivityEntry>;
/** `failed`: a message from them that couldn't be decrypted, or one of yours that wasn't sent. */
export type DirectEntry = { id: string; userId: string; text: string; at: number; failed?: boolean };
/**
 * A private chat with one person, end-to-end encrypted (lib/private-chat-keys.ts). Closed when they
 * leave or your connection drops; asking again reopens it with new keys. `safetyCode` is there once
 * the key is ready, for the two of you to compare.
 */
export type DirectChat = {
  messages: DirectEntry[];
  open: boolean;
  safetyCode?: string;
  closedBy?: "left" | "reconnect";
};
export type ChatRequest = { fromUserId: string; at: number };
export type OutgoingRequest = "pending" | "declined";

// `customMap`: the layout of a map built in the map builder, whose rooms decide room chat.
export function useSpaceSocket(spaceId: string, mapTemplate: MapTemplateId, customMap: CustomMap | null = null) {
  const socketRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const [error, setError] = useState<string | null>(null);
  // Bumped to open a fresh connection after one drops.
  const [connection, setConnection] = useState(0);
  const retryRef = useRef<{ attempts: number; timer?: number }>({ attempts: 0 });
  const [selfId, setSelfId] = useState<string | null>(null);
  const [self, setSelf] = useState<Position>({ x: 0, y: 0 });
  const [others, setOthers] = useState<Others>({});
  const [generalMessages, setGeneralMessages] = useState<ChatEntry[]>([]);
  const [roomMessages, setRoomMessages] = useState<Record<string, ChatEntry[]>>({});
  const [reactions, setReactions] = useState<Reaction[]>([]);
  // Avatar changes made while in the space (looks on entry come from the profile API).
  const [looks, setLooks] = useState<Record<string, AvatarLook>>({});
  const [agentActivities, setAgentActivities] = useState<AgentActivities>({});
  const [chatRequests, setChatRequests] = useState<ChatRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<Record<string, OutgoingRequest>>({});
  const [directChats, setDirectChats] = useState<Record<string, DirectChat>>({});
  // The private chats' keys, for this page only.
  const [privateKeys] = useState(createPrivateChatKeys);
  // When the server last said this user's tasks changed; the page reloads them when it moves.
  const [tasksChangedAt, setTasksChangedAt] = useState(0);
  // A built map the owner just saved; the page swaps it in so everyone sees the new office.
  const [layoutUpdate, setLayoutUpdate] = useState<CustomMap | null>(null);
  // The bike each person is riding or the drink in their hand, yours included (prop.schema.ts).
  const [props, setProps] = useState<Record<string, PlayerProp>>({});
  const selfIdRef = useRef<string | null>(null);
  const signalHandlerRef = useRef<((fromUserId: string, signal: unknown) => void) | null>(null);
  // Game Room play and the Lounge TV (components/games/arcade-on-map.tsx) listen here.
  const playListenersRef = useRef(new Set<(message: PlayServerMessage) => void>());
  const loadedRoomsRef = useRef<Set<string>>(new Set());

  const currentRoom = useMemo(
    () => (customMap ? customRoomAt(customMap, self) : getChatRoomAtPosition(mapTemplate, self)),
    [customMap, mapTemplate, self],
  );

  const mergeHistory = useCallback((history: ChatEntry[], current: ChatEntry[]) => {
    const seen = new Set(current.map((message) => message.id));
    return [...history.filter((message) => !seen.has(message.id)), ...current];
  }, []);

  // Both people agreed: open (or reopen) the conversation and drop any requests between them.
  // The safety code comes once the key is ready.
  const openDirectChat = useCallback((userId: string, safetyCode?: string) => {
    setDirectChats((current) => ({
      ...current,
      [userId]: { messages: current[userId]?.messages ?? [], open: true, safetyCode },
    }));
    setChatRequests((current) => current.filter((request) => request.fromUserId !== userId));
    setOutgoingRequests((current) => {
      if (!(userId in current)) return current;
      const next = { ...current };
      delete next[userId];
      return next;
    });
  }, []);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      setStatus("error");
      setError("You are not signed in.");
      return;
    }

    const ws = new WebSocket(WS_URL);
    socketRef.current = ws;
    const retry = retryRef.current;
    let joined = false;
    let rejected = false; // the server refused the join itself (bad token, no such space): don't retry
    const joinTimer = window.setTimeout(() => {
      if (!joined && !rejected) ws.close();
    }, JOIN_TIMEOUT_MS);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "join", payload: { spaceId, token } }));
    };

    ws.onmessage = (event) => {
      let rawMessage: unknown;
      try {
        rawMessage = JSON.parse(event.data);
      } catch {
        setStatus("error");
        setError("Server sent an invalid message");
        return;
      }

      const parsed = ServerMessage.safeParse(rawMessage);
      if (!parsed.success) return;
      const message = parsed.data;

      switch (message.type) {
        case "space-joined": {
          setSelfId(message.payload.userId);
          selfIdRef.current = message.payload.userId;
          setSelf(message.payload.spawn);
          setOthers(Object.fromEntries(
            message.payload.users.map((user) => [user.id, { x: user.x, y: user.y }]),
          ));
          // A new connection starts you empty-handed (a bike you rode goes back to the rack).
          setProps(Object.fromEntries(message.payload.users.flatMap((user) => (user.prop ? [[user.id, user.prop]] : []))));
          setAgentActivities(message.payload.agentActivities ?? {});
          // A new connection starts private chats over: the server forgot them, and so do we, keys too.
          privateKeys.forgetAll();
          setChatRequests([]);
          setOutgoingRequests({});
          setDirectChats((current) => closeDirectChats(current, "reconnect"));
          joined = true;
          retry.attempts = 0;
          setError(null);
          setStatus("joined");
          captureEvent("space_entered");

          getSpaceMessages(token, spaceId, "general")
            .then((response) => {
              setGeneralMessages((current) => mergeHistory(response.messages, current));
            })
            .catch(() => {});
          break;
        }
        case "user-join":
        case "movement": {
          const { userId, x, y } = message.payload;
          setOthers((current) => ({ ...current, [userId]: { x, y } }));
          // Someone (re)joining arrives empty-handed, even if an older tab of theirs had a bike.
          if (message.type === "user-join") setProps((current) => withProp(current, userId, null));
          break;
        }
        case "movement-rejected":
          setSelf(message.payload);
          break;
        case "user-left": {
          const leftId = message.payload.userId;
          setOthers((current) => {
            const next = { ...current };
            delete next[leftId];
            return next;
          });
          setAgentActivities((current) => {
            if (!(leftId in current)) return current;
            const next = { ...current };
            delete next[leftId];
            return next;
          });
          setProps((current) => withProp(current, leftId, null));
          // The server forgets their private chats too; keep the messages but close the chat.
          privateKeys.forget(leftId);
          setChatRequests((current) => current.filter((request) => request.fromUserId !== leftId));
          setOutgoingRequests((current) => {
            if (!(leftId in current)) return current;
            const next = { ...current };
            delete next[leftId];
            return next;
          });
          setDirectChats((current) => closeDirectChats(current, "left", leftId));
          break;
        }
        case "prop":
          setProps((current) => withProp(current, message.payload.userId, message.payload.prop));
          break;
        case "error":
          setError(message.message);
          if (!joined) {
            rejected = true;
            setStatus("error");
          }
          break;
        case "chat": {
          const entry: ChatEntry = {
            id: `${message.payload.userId}-${message.payload.at}`,
            ...message.payload,
          };
          if (entry.scope === "room" && entry.roomId) {
            setRoomMessages((current) => ({
              ...current,
              [entry.roomId!]: [...(current[entry.roomId!] ?? []), entry],
            }));
          } else {
            setGeneralMessages((current) => [...current, entry]);
          }
          break;
        }
        case "look": {
          const { userId, look } = message.payload;
          setLooks((current) => ({ ...current, [userId]: look }));
          break;
        }
        case "reaction": {
          const { userId, emoji, at } = message.payload;
          setReactions((current) => [
            ...current.filter((reaction) => Date.now() - reaction.at < 6000),
            { id: `${userId}-${at}`, userId, emoji, at },
          ]);
          break;
        }
        case "agent-activity": {
          const { userId, text, state, at, project, branch, commit } = message.payload;
          setAgentActivities((current) => {
            if (state === "done") {
              if (!(userId in current)) return current;
              const next = { ...current };
              delete next[userId];
              return next;
            }
            return { ...current, [userId]: { text, state, at, project, branch, commit } };
          });
          break;
        }
        case "webrtc-signal":
          signalHandlerRef.current?.(message.payload.fromUserId, message.payload.signal);
          break;
        case "dm-request": {
          // Asking during an open chat starts it over (they lost their keys), so that chat closes.
          const { fromUserId, at, publicKey } = message.payload;
          privateKeys.offered(fromUserId, publicKey);
          setChatRequests((current) => (
            current.some((request) => request.fromUserId === fromUserId)
              ? current
              : [...current, { fromUserId, at }]
          ));
          setDirectChats((current) => closeDirectChats(current, undefined, fromUserId));
          break;
        }
        case "dm-response": {
          const answer = message.payload;
          const me = selfIdRef.current;
          if (!answer.accept || !me) {
            privateKeys.forget(answer.fromUserId);
            setOutgoingRequests((current) => ({ ...current, [answer.fromUserId]: "declined" }));
            break;
          }
          void privateKeys.accepted(answer.fromUserId, me, answer.publicKey).then((safetyCode) => {
            if (socketRef.current !== ws) return;
            if (safetyCode) {
              openDirectChat(answer.fromUserId, safetyCode);
              return;
            }
            // No key pair left to finish with (or theirs was broken): let them be asked again.
            setOutgoingRequests((current) => {
              const next = { ...current };
              delete next[answer.fromUserId];
              return next;
            });
          });
          break;
        }
        case "dm": {
          // Only ciphertext comes through the server; it's opened here with this chat's key.
          const { fromUserId, at, ...sealed } = message.payload;
          const me = selfIdRef.current;
          if (!me) break;
          void privateKeys.decrypt(fromUserId, me, sealed).then((text) => {
            if (socketRef.current !== ws) return;
            const entry: DirectEntry = text === null
              ? { id: `${fromUserId}-${at}-${sealed.seq}`, userId: fromUserId, text: "", at, failed: true }
              : { id: `${fromUserId}-${at}-${sealed.seq}`, userId: fromUserId, text, at };
            setDirectChats((current) => {
              const chat = current[fromUserId];
              // Something unreadable from someone you have no chat with is dropped.
              if (text === null && !chat) return current;
              return {
                ...current,
                [fromUserId]: { ...chat, messages: [...(chat?.messages ?? []), entry], open: chat?.open ?? true },
              };
            });
          });
          break;
        }
        case "tasks-changed":
          setTasksChangedAt(message.payload.at);
          break;
        case "layout-updated":
          setLayoutUpdate(message.payload.layout);
          break;
        case "play-invite":
        case "play-answer":
        case "play-leave":
        case "play-data":
        case "tv":
          for (const listener of playListenersRef.current) listener(message);
          break;
      }
    };

    // An error is always followed by a close, which decides whether to try again.
    ws.onerror = () => {};
    ws.onclose = () => {
      if (socketRef.current !== ws) return; // closed on purpose (leaving, or a newer connection)
      socketRef.current = null;
      if (rejected) return;
      if (retry.attempts >= MAX_RECONNECTS) {
        setStatus("error");
        setError("Can't reach the server. Check your connection and try again.");
        return;
      }
      // Before the first join this stays "connecting" (loading screen); after it, the map stays up.
      setStatus((current) => (current === "connecting" ? "connecting" : "reconnecting"));
      retry.timer = window.setTimeout(() => setConnection((count) => count + 1), reconnectDelay(retry.attempts));
      retry.attempts += 1;
    };

    return () => {
      window.clearTimeout(retry.timer);
      window.clearTimeout(joinTimer);
      if (socketRef.current === ws) socketRef.current = null;
      ws.close();
    };
  }, [spaceId, mergeHistory, openDirectChat, connection, privateKeys]);

  // Only when leaving the space: a reconnect must keep the video hook's signal handler.
  useEffect(() => () => {
    signalHandlerRef.current = null;
  }, []);

  useEffect(() => {
    if (status !== "joined" || !currentRoom || loadedRoomsRef.current.has(currentRoom.id)) return;
    const token = getAuthToken();
    if (!token) return;

    loadedRoomsRef.current.add(currentRoom.id);
    getSpaceMessages(token, spaceId, "room", currentRoom.id)
      .then((response) => {
        setRoomMessages((current) => ({
          ...current,
          [currentRoom.id]: mergeHistory(response.messages, current[currentRoom.id] ?? []),
        }));
      })
      .catch(() => {
        loadedRoomsRef.current.delete(currentRoom.id);
      });
  }, [status, currentRoom, spaceId, mergeHistory]);

  const move = useCallback((next: Position) => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    setSelf(next);
    ws.send(JSON.stringify({ type: "move", payload: next }));
  }, []);

  const sendChat = useCallback((text: string, scope: ChatScope) => {
    const trimmed = text.trim();
    const ws = socketRef.current;
    if (!trimmed || !ws || ws.readyState !== WebSocket.OPEN) return;
    if (scope === "room" && !currentRoom) return;

    ws.send(JSON.stringify({ type: "chat", payload: { text: trimmed, scope } }));
    captureEvent("message_sent");

    const at = Date.now();
    const entry: ChatEntry = {
      id: `me-${at}`,
      userId: selfId ?? "me",
      text: trimmed,
      at,
      scope,
      roomId: scope === "room" ? currentRoom?.id : undefined,
      roomName: scope === "room" ? currentRoom?.name : undefined,
    };
    if (scope === "room" && currentRoom) {
      setRoomMessages((current) => ({
        ...current,
        [currentRoom.id]: [...(current[currentRoom.id] ?? []), entry],
      }));
    } else {
      setGeneralMessages((current) => [...current, entry]);
    }
  }, [selfId, currentRoom]);

  const sendReaction = useCallback((emoji: string) => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "reaction", payload: { emoji } }));
    const at = Date.now();
    setReactions((current) => [
      ...current.filter((reaction) => at - reaction.at < 6000),
      { id: `me-${at}`, userId: selfId ?? "me", emoji, at },
    ]);
  }, [selfId]);

  // Call after the look is saved: applies it here and tells everyone else to redraw you.
  const sendLook = useCallback((look: AvatarLook) => {
    if (selfId) setLooks((current) => ({ ...current, [selfId]: look }));
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "look", payload: look }));
  }, [selfId]);

  const sendSignal = useCallback((targetUserId: string, signal: unknown) => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "webrtc-signal", payload: { targetUserId, signal } }));
  }, []);

  // The request carries your public key for this chat; only the person asked receives it.
  const requestChat = useCallback((userId: string) => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    setOutgoingRequests((current) => ({ ...current, [userId]: "pending" }));
    privateKeys.requestKey(userId).then(
      (publicKey) => {
        if (socketRef.current !== ws || ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({ type: "dm-request", payload: { targetUserId: userId, publicKey } }));
      },
      () => {
        console.warn("Private chat needs WebCrypto, which only works on https pages and localhost.");
        setOutgoingRequests((current) => {
          const next = { ...current };
          delete next[userId];
          return next;
        });
      },
    );
  }, [privateKeys]);

  // A yes opens the chat at once and sends your public key as soon as the key is ready.
  const answerChatRequest = useCallback((userId: string, accept: boolean) => {
    const ws = socketRef.current;
    const me = selfIdRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !me) return;
    if (!accept) {
      privateKeys.declined(userId);
      ws.send(JSON.stringify({ type: "dm-response", payload: { targetUserId: userId, accept: false } }));
      setChatRequests((current) => current.filter((request) => request.fromUserId !== userId));
      return;
    }
    openDirectChat(userId);
    void privateKeys.accept(userId, me, (publicKey) => {
      if (socketRef.current !== ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: "dm-response", payload: { targetUserId: userId, accept: true, publicKey } }));
    }).then((safetyCode) => {
      if (socketRef.current !== ws) return;
      setDirectChats((current) => {
        const chat = current[userId];
        if (!chat?.open) return current;
        // No key could be made from their request: the chat can't be private, so it stays closed.
        return { ...current, [userId]: safetyCode ? { ...chat, safetyCode } : { messages: chat.messages, open: false } };
      });
    });
  }, [openDirectChat, privateKeys]);

  // Shown at once; the ciphertext goes out when it's ready, in the order you typed.
  const sendDirect = useCallback((userId: string, text: string) => {
    const trimmed = text.trim().slice(0, DM_TEXT_MAX_CHARS);
    const ws = socketRef.current;
    const me = selfIdRef.current;
    if (!trimmed || !ws || ws.readyState !== WebSocket.OPEN || !me) return;
    const at = Date.now();
    const id = `me-${at}-${Math.random().toString(36).slice(2, 7)}`;
    void privateKeys.encrypt(userId, me, trimmed).then((sealed) => {
      if (sealed && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "dm", payload: { targetUserId: userId, ...sealed } }));
        return;
      }
      setDirectChats((current) => {
        const chat = current[userId];
        if (!chat) return current;
        const messages = chat.messages.map((message) => (message.id === id ? { ...message, failed: true } : message));
        return { ...current, [userId]: { ...chat, messages } };
      });
    });
    const entry: DirectEntry = { id, userId: me, text: trimmed, at };
    setDirectChats((current) => {
      const chat = current[userId];
      if (!chat) return current;
      return { ...current, [userId]: { ...chat, messages: [...chat.messages, entry] } };
    });
  }, [privateKeys]);

  const registerSignalHandler = useCallback(
    (handler: (fromUserId: string, signal: unknown) => void) => {
      signalHandlerRef.current = handler;
    },
    [],
  );

  // Game Room play and the Lounge TV: send, and listen for what the server relays back.
  const sendPlay = useCallback((message: PlayClientMessage) => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(message));
  }, []);

  // Your bike or drink changed: shown at once, and the server tells everyone else. If someone
  // else already rides that bike, the server sends back what you really have.
  // False when it couldn't be sent (reconnecting), so the map can keep things as they were.
  const sendProp = useCallback((prop: PlayerProp | null) => {
    const ws = socketRef.current;
    const me = selfIdRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !me) return false;
    setProps((current) => withProp(current, me, prop));
    ws.send(JSON.stringify({ type: "prop", payload: { prop } }));
    return true;
  }, []);

  const subscribePlay = useCallback((listener: (message: PlayServerMessage) => void) => {
    const listeners = playListenersRef.current;
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return {
    status,
    error,
    selfId,
    self,
    others,
    move,
    generalMessages,
    roomMessages: currentRoom ? roomMessages[currentRoom.id] ?? [] : [],
    currentRoom,
    sendChat,
    reactions,
    sendReaction,
    looks,
    sendLook,
    agentActivities,
    sendSignal,
    registerSignalHandler,
    sendPlay,
    subscribePlay,
    props,
    sendProp,
    chatRequests,
    outgoingRequests,
    directChats,
    requestChat,
    answerChatRequest,
    sendDirect,
    tasksChangedAt,
    layoutUpdate,
  };
}
