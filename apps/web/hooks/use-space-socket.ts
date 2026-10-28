"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getChatRoomAtPosition, ServerMessage, type AvatarLook, type MapTemplateId } from "@repo/shared";
import { getAuthToken } from "../lib/auth-token";
import { getSpaceMessages, type ChatScope } from "../lib/space-api";
import { captureEvent } from "../lib/analytics";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
const WS_URL = API_BASE.replace(/^http/, "ws") + "/ws";

export type Position = { x: number; y: number };
export type Others = Record<string, Position>;
type Status = "connecting" | "joined" | "error";
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
export type DirectEntry = { id: string; userId: string; text: string; at: number };
/** A private chat with one person. Closed when they leave; asking again reopens it. */
export type DirectChat = { messages: DirectEntry[]; open: boolean };
export type ChatRequest = { fromUserId: string; at: number };
export type OutgoingRequest = "pending" | "declined";

export function useSpaceSocket(spaceId: string, mapTemplate: MapTemplateId) {
  const socketRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const [error, setError] = useState<string | null>(null);
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
  // When the server last said this user's tasks changed; the page reloads them when it moves.
  const [tasksChangedAt, setTasksChangedAt] = useState(0);
  const signalHandlerRef = useRef<((fromUserId: string, signal: unknown) => void) | null>(null);
  const loadedRoomsRef = useRef<Set<string>>(new Set());

  const currentRoom = useMemo(
    () => getChatRoomAtPosition(mapTemplate, self),
    [mapTemplate, self],
  );

  const mergeHistory = useCallback((history: ChatEntry[], current: ChatEntry[]) => {
    const seen = new Set(current.map((message) => message.id));
    return [...history.filter((message) => !seen.has(message.id)), ...current];
  }, []);

  // Both people agreed: open (or reopen) the conversation and drop any requests between them.
  const openDirectChat = useCallback((userId: string) => {
    setDirectChats((current) => ({
      ...current,
      [userId]: { messages: current[userId]?.messages ?? [], open: true },
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
          setSelf(message.payload.spawn);
          setOthers(Object.fromEntries(
            message.payload.users.map((user) => [user.id, { x: user.x, y: user.y }]),
          ));
          setAgentActivities(message.payload.agentActivities ?? {});
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
          // The server forgets their private chats too; keep the messages but close the chat.
          setChatRequests((current) => current.filter((request) => request.fromUserId !== leftId));
          setOutgoingRequests((current) => {
            if (!(leftId in current)) return current;
            const next = { ...current };
            delete next[leftId];
            return next;
          });
          setDirectChats((current) => {
            const chat = current[leftId];
            if (!chat?.open) return current;
            return { ...current, [leftId]: { ...chat, open: false } };
          });
          break;
        }
        case "error":
          setError(message.message);
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
          const { fromUserId, at } = message.payload;
          setChatRequests((current) => (
            current.some((request) => request.fromUserId === fromUserId)
              ? current
              : [...current, { fromUserId, at }]
          ));
          break;
        }
        case "dm-response": {
          const { fromUserId, accept } = message.payload;
          if (accept) openDirectChat(fromUserId);
          else setOutgoingRequests((current) => ({ ...current, [fromUserId]: "declined" }));
          break;
        }
        case "dm": {
          const { fromUserId, text, at } = message.payload;
          const entry: DirectEntry = { id: `${fromUserId}-${at}`, userId: fromUserId, text, at };
          setDirectChats((current) => ({
            ...current,
            [fromUserId]: { messages: [...(current[fromUserId]?.messages ?? []), entry], open: true },
          }));
          break;
        }
        case "tasks-changed":
          setTasksChangedAt(message.payload.at);
          break;
      }
    };

    ws.onerror = () => {
      setStatus("error");
      setError("Connection error");
    };
    ws.onclose = () => {
      if (socketRef.current === ws) {
        setStatus("error");
        setError((current) => current ?? "Connection closed");
      }
    };

    return () => {
      signalHandlerRef.current = null;
      if (socketRef.current === ws) socketRef.current = null;
      ws.close();
    };
  }, [spaceId, mergeHistory, openDirectChat]);

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

  const requestChat = useCallback((userId: string) => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "dm-request", payload: { targetUserId: userId } }));
    setOutgoingRequests((current) => ({ ...current, [userId]: "pending" }));
  }, []);

  const answerChatRequest = useCallback((userId: string, accept: boolean) => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "dm-response", payload: { targetUserId: userId, accept } }));
    if (accept) openDirectChat(userId);
    else setChatRequests((current) => current.filter((request) => request.fromUserId !== userId));
  }, [openDirectChat]);

  const sendDirect = useCallback((userId: string, text: string) => {
    const trimmed = text.trim();
    const ws = socketRef.current;
    if (!trimmed || !ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "dm", payload: { targetUserId: userId, text: trimmed } }));
    const at = Date.now();
    const entry: DirectEntry = { id: `me-${at}`, userId: selfId ?? "me", text: trimmed, at };
    setDirectChats((current) => {
      const chat = current[userId];
      if (!chat) return current;
      return { ...current, [userId]: { ...chat, messages: [...chat.messages, entry] } };
    });
  }, [selfId]);

  const registerSignalHandler = useCallback(
    (handler: (fromUserId: string, signal: unknown) => void) => {
      signalHandlerRef.current = handler;
    },
    [],
  );

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
    chatRequests,
    outgoingRequests,
    directChats,
    requestChat,
    answerChatRequest,
    sendDirect,
    tasksChangedAt,
  };
}
