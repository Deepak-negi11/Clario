"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Booking, LockerItem, OfficeClientMessage, OfficeServerMessage, SavedStroke, ShelfItem } from "@repo/shared";

// The shared office things on the map: room bookings, whiteboards, your locker and the kitchen shelf.
// The space page hands over its socket (use-space-socket.ts: sendWorkplace / subscribeWorkplace);
// this keeps what the server says in state and asks again whenever the connection comes back.

export type WorkplacePerson = { id: string; name: string };

export type WorkplaceLink = {
  selfId: string | null;
  connected: boolean;
  // Everyone else in the space right now (for sending and leaving things).
  people: WorkplacePerson[];
  send: (payload: OfficeClientMessage["payload"]) => boolean;
  subscribe: (listener: (message: OfficeServerMessage) => void) => () => void;
};

export type WorkplaceNotice = { ok: boolean; text: string; at: number };
// Something new for you, for the toast: a locker delivery, or a thing left for you on the shelf.
export type WorkplaceArrival = { id: string; text: string; kind: "locker" | "shelf"; at: number };

export function useWorkplace(link: WorkplaceLink | undefined) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  // null until the server has answered.
  const [shelf, setShelf] = useState<ShelfItem[] | null>(null);
  const [locker, setLocker] = useState<LockerItem[] | null>(null);
  const [boards, setBoards] = useState<Record<string, SavedStroke[]>>({});
  const [notice, setNotice] = useState<WorkplaceNotice | null>(null);
  const [arrivals, setArrivals] = useState<WorkplaceArrival[]>([]);
  const seenRef = useRef<{ locker: Set<string> | null; shelf: Set<string> | null }>({ locker: null, shelf: null });
  const selfId = link?.selfId ?? null;
  const send = link?.send;
  const subscribe = link?.subscribe;
  const connected = link?.connected ?? false;

  const arrive = useCallback((items: WorkplaceArrival[]) => {
    if (items.length) setArrivals((current) => [...current, ...items].slice(-4));
  }, []);

  useEffect(() => {
    if (!subscribe) return;
    return subscribe(({ payload }) => {
      switch (payload.kind) {
        case "bookings":
          return setBookings(payload.bookings);
        case "shelf": {
          const seen = seenRef.current.shelf;
          // Things left for you since the shelf was last seen (not what was already there).
          if (seen && selfId) {
            arrive(
              payload.items
                .filter((item) => !seen.has(item.id) && item.for?.id === selfId)
                .map((item) => ({ id: item.id, kind: "shelf", text: `${item.by.name} left something for you on the kitchen shelf.`, at: Date.now() })),
            );
          }
          seenRef.current.shelf = new Set(payload.items.map((item) => item.id));
          return setShelf(payload.items);
        }
        case "locker": {
          const seen = seenRef.current.locker;
          if (seen) {
            arrive(
              payload.items
                .filter((item) => !seen.has(item.id))
                .map((item) => ({
                  id: item.id,
                  kind: "locker",
                  text: `${item.kind === "parcel" ? "A parcel" : "A document"} is waiting in your locker.`,
                  at: Date.now(),
                })),
            );
          }
          seenRef.current.locker = new Set(payload.items.map((item) => item.id));
          return setLocker(payload.items);
        }
        case "locker-ping":
          // Something new is in a locker: if it's yours, ask for it.
          if (payload.userId === selfId) send?.({ action: "sync" });
          return;
        case "board":
          return setBoards((current) => ({ ...current, [payload.board]: payload.strokes }));
        case "stroke":
          return setBoards((current) => {
            const strokes = current[payload.board];
            if (!strokes) return current;
            return { ...current, [payload.board]: [...strokes.filter((each) => each.id !== payload.stroke.id), payload.stroke] };
          });
        case "unstroke":
          return setBoards((current) => {
            const strokes = current[payload.board];
            return strokes ? { ...current, [payload.board]: strokes.filter((each) => each.id !== payload.id) } : current;
          });
        case "wiped":
          return setBoards((current) => (current[payload.board] ? { ...current, [payload.board]: [] } : current));
        case "notice":
          return setNotice({ ok: payload.ok, text: payload.text, at: Date.now() });
      }
    });
  }, [subscribe, selfId, send, arrive]);

  // Everything again whenever the connection is (re)made.
  useEffect(() => {
    if (connected) send?.({ action: "sync" });
  }, [connected, send]);

  const dismissArrival = useCallback((id: string) => setArrivals((current) => current.filter((each) => each.id !== id)), []);
  const clearNotice = useCallback(() => setNotice(null), []);

  return { bookings, shelf, locker, boards, notice, arrivals, dismissArrival, clearNotice, send, selfId };
}

export type Workplace = ReturnType<typeof useWorkplace>;

// A clock for screens that show "until 3:30" and "free now": ticks every 20 seconds while open.
export function useNow(active = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 20_000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}
