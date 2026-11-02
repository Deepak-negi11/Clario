"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  latestVisits, mergeAttendance, sortNotices, startOfDay, summarizeDay, unreadNotices, upsertNotice,
  type AttendanceEntry, type BadgeBroadcast, type BadgeMessage, type NoticeBroadcast, type NoticeMessageInput, type NoticePost,
} from "@repo/shared";

// The front-door badge reader and the notice board, for one space. Both talk to the server over
// the space's socket (use-space-socket.ts): the server keeps the visits and posts, and tells
// everyone in the space when they change. Asked again after every reconnect.

type Send = (message: BadgeMessage | NoticeMessageInput) => boolean;
type Subscribe = (listener: (message: BadgeBroadcast | NoticeBroadcast) => void) => () => void;

// How long someone's row in the People list lights up after they badge in.
export const ARRIVAL_GLOW_MS = 6000;

// Your own badge-in or badge-out, for the reader's toast and light. `fresh` is false when you
// were already in.
export type BadgeEvent = { kind: "in" | "out"; entry: AttendanceEntry; fresh: boolean; at: number };

export type NoticeDraft =
  | { action: "announce"; title: string; body: string; pinned: boolean }
  | { action: "poll"; title: string; body: string; options: string[]; closesAt: number | null; pinned: boolean };
export type NoticeEdit = { postId: string; title: string; body: string; pinned: boolean; closesAt?: number | null };

const seenKey = (spaceId: string) => `notice-board-seen:${spaceId}`;

function readSeen(spaceId: string) {
  try {
    return Number(localStorage.getItem(seenKey(spaceId))) || 0;
  } catch {
    return 0;
  }
}

export function useBadgeAndNotices({
  spaceId,
  status,
  selfId,
  send,
  subscribe,
}: {
  spaceId: string;
  status: string;
  selfId: string | null;
  send: Send;
  subscribe: Subscribe;
}) {
  const [visits, setVisits] = useState<AttendanceEntry[]>([]);
  const [arrivals, setArrivals] = useState<Record<string, number>>({});
  const [lastBadge, setLastBadge] = useState<BadgeEvent | null>(null);
  const [posts, setPosts] = useState<NoticePost[]>([]);
  const [myVotes, setMyVotes] = useState<Record<string, number>>({});
  const [refusal, setRefusal] = useState<{ reason: string; at: number } | null>(null);
  const [boardLoaded, setBoardLoaded] = useState(false);
  const [seenAt, setSeenAt] = useState(() => readSeen(spaceId));
  const selfIdRef = useRef(selfId);
  selfIdRef.current = selfId;

  useEffect(() => subscribe((message) => {
    if (message.type === "badge") {
      const event = message.payload;
      if (event.event === "today") {
        setVisits(event.entries.reduce(mergeAttendance, [] as AttendanceEntry[]));
        return;
      }
      const { entry } = event;
      setVisits((current) => mergeAttendance(current, entry));
      if (entry.userId === selfIdRef.current) {
        setLastBadge({ kind: event.event, entry, fresh: event.event === "out" || event.fresh, at: Date.now() });
      }
      if (event.event === "in" && event.fresh) {
        setArrivals((current) => ({ ...current, [entry.userId]: Date.now() }));
      }
      return;
    }
    const event = message.payload;
    switch (event.event) {
      case "list":
        setPosts(sortNotices(event.posts));
        setMyVotes(event.myVotes);
        setBoardLoaded(true);
        break;
      case "saved":
        setPosts((current) => upsertNotice(current, event.post));
        break;
      case "removed":
        setPosts((current) => current.filter((post) => post.id !== event.postId));
        setMyVotes((current) => {
          if (!(event.postId in current)) return current;
          const next = { ...current };
          delete next[event.postId];
          return next;
        });
        break;
      case "voted":
        setMyVotes((current) => ({ ...current, [event.postId]: event.option }));
        break;
      case "refused":
        setRefusal({ reason: event.reason, at: Date.now() });
        break;
    }
  }), [subscribe]);

  // On joining, and again after every reconnect: today's visits (since your midnight) and the board.
  useEffect(() => {
    if (status !== "joined") return;
    send({ type: "badge", payload: { action: "today", since: startOfDay(Date.now()) } });
    send({ type: "notice", payload: { action: "list" } });
  }, [status, send]);

  // Arrival glows fade on their own.
  useEffect(() => {
    const times = Object.values(arrivals);
    if (!times.length) return;
    const wait = Math.max(0, Math.min(...times) + ARRIVAL_GLOW_MS - Date.now());
    const timer = window.setTimeout(() => {
      const now = Date.now();
      setArrivals((current) => Object.fromEntries(Object.entries(current).filter(([, at]) => now - at < ARRIVAL_GLOW_MS)));
    }, wait + 50);
    return () => window.clearTimeout(timer);
  }, [arrivals]);

  const latest = useMemo(() => latestVisits(visits), [visits]);
  const today = useMemo(() => summarizeDay(visits), [visits]);
  const selfIn = !!selfId && latest[selfId]?.outAt === null;
  const unread = useMemo(() => unreadNotices(posts, seenAt, selfId), [posts, seenAt, selfId]);

  // "walk": walking past the reader, which does nothing when you are already in.
  const badgeIn = useCallback((how: "walk" | "key" = "key") => {
    if (how === "walk" && selfIn) return false;
    return send({ type: "badge", payload: { action: "in" } });
  }, [selfIn, send]);
  const badgeOut = useCallback(() => send({ type: "badge", payload: { action: "out" } }), [send]);

  const post = useCallback((draft: NoticeDraft) => send({ type: "notice", payload: draft }), [send]);
  const edit = useCallback((change: NoticeEdit) => send({ type: "notice", payload: { action: "edit", ...change } }), [send]);
  const remove = useCallback((postId: string) => send({ type: "notice", payload: { action: "delete", postId } }), [send]);
  const vote = useCallback((postId: string, option: number) => send({ type: "notice", payload: { action: "vote", postId, option } }), [send]);

  // Opening the board marks everything on it as read.
  const markSeen = useCallback(() => {
    const newest = posts.reduce((max, item) => Math.max(max, item.createdAt), 0);
    setSeenAt((current) => {
      const next = Math.max(current, newest);
      if (next === current) return current;
      try {
        localStorage.setItem(seenKey(spaceId), String(next));
      } catch {
        // Storage can be unavailable (private mode); it stays read for this visit.
      }
      return next;
    });
  }, [posts, spaceId]);
  const clearRefusal = useCallback(() => setRefusal(null), []);

  return {
    visits,
    latest,
    today,
    arrivals,
    selfIn,
    lastBadge,
    badgeIn,
    badgeOut,
    posts,
    myVotes,
    boardLoaded,
    unread,
    refusal,
    clearRefusal,
    markSeen,
    post,
    edit,
    remove,
    vote,
  };
}

export type BadgeAndNotices = ReturnType<typeof useBadgeAndNotices>;
