"use client";

import { useEffect, useRef, useState } from "react";
import { HQ_WALL_DECOR } from "../lib/maps/clario-hq";

// The meeting-room projector (components/space-3d/projector-3d.ts in 3D, components/game-ui/
// projector-view.tsx in 2D): whoever in the room is sharing their screen is shown on it. Everyone in
// a meeting room is already connected to everyone else there (callPeers in lib/proximity.ts), so
// each person receives the others' shared screens; this only picks one. If several people share,
// the one who started last is shown, and when they stop it goes back to the one before.

type Bounds = { x: number; y: number; width: number; height: number };
type Room = { id: string; name: string; bounds: Bounds };

export type ProjectorShow = {
  userId: string;
  name: string;
  stream: MediaStream;
  isSelf: boolean;
  room: Room;
};

const inside = (point: { x: number; y: number }, bounds: Bounds) =>
  point.x >= bounds.x && point.x < bounds.x + bounds.width && point.y >= bounds.y && point.y < bounds.y + bounds.height;

// True when the room has a projector: one on a wall that faces into it (Clario HQ).
export function hasProjector(bounds: Bounds) {
  return HQ_WALL_DECOR.some((decor) => decor.kind === "projector" && inside({ x: decor.x + decor.w / 2, y: decor.wallY + 2 }, bounds));
}

// Who's on the projector, from who is sharing now. `order` remembers when each one started
// (higher is later); it's updated here: people who stopped are dropped, new ones go last.
export function pickPresenter<T extends { userId: string }>(sharing: T[], order: Map<string, number>, next: () => number): T | null {
  const ids = new Set(sharing.map((share) => share.userId));
  for (const id of [...order.keys()]) if (!ids.has(id)) order.delete(id);
  for (const share of sharing) if (!order.has(share.userId)) order.set(share.userId, next());
  let latest: T | null = null;
  for (const share of sharing) if (!latest || order.get(share.userId)! > order.get(latest.userId)!) latest = share;
  return latest;
}

// Remote screen tracks turn "muted" when the other person stops sharing.
const sending = (stream: MediaStream) => stream.getVideoTracks().some((track) => track.readyState === "live" && track.enabled && !track.muted);

export function useProjector({
  selfId,
  room,
  localScreen,
  remoteScreens,
  peers,
  names,
}: {
  selfId: string | null;
  // The room you're in (only Clario HQ's rooms have a projector).
  room: Room | null;
  localScreen: MediaStream | null;
  remoteScreens: Record<string, MediaStream>;
  // The people you're connected to: in a meeting room, everyone in it.
  peers: Set<string>;
  names: Record<string, string>;
}): ProjectorShow | null {
  const projectorRoom = room && hasProjector(room.bounds) ? room : null;
  const shares: { userId: string; stream: MediaStream }[] = [];
  if (projectorRoom) {
    if (selfId && localScreen) shares.push({ userId: selfId, stream: localScreen });
    for (const id of [...peers].sort()) {
      const stream = remoteScreens[id];
      if (stream) shares.push({ userId: id, stream });
    }
  }

  // Look again whenever a shared screen starts or stops sending.
  const [, setChanged] = useState(0);
  const sharesRef = useRef(shares);
  sharesRef.current = shares;
  const tracksKey = shares.map((share) => `${share.userId}:${share.stream.getVideoTracks().map((track) => track.id).join(",")}`).join("|");
  useEffect(() => {
    const streams = sharesRef.current.map((share) => share.stream);
    const tracks = streams.flatMap((stream) => stream.getVideoTracks());
    const changed = () => setChanged((count) => count + 1);
    for (const track of tracks) for (const type of ["mute", "unmute", "ended"]) track.addEventListener(type, changed);
    for (const stream of streams) for (const type of ["addtrack", "removetrack"]) stream.addEventListener(type, changed);
    return () => {
      for (const track of tracks) for (const type of ["mute", "unmute", "ended"]) track.removeEventListener(type, changed);
      for (const stream of streams) for (const type of ["addtrack", "removetrack"]) stream.removeEventListener(type, changed);
    };
  }, [tracksKey]);

  const order = useRef(new Map<string, number>());
  const count = useRef(0);
  const presenter = pickPresenter(
    shares.filter((share) => sending(share.stream)),
    order.current,
    () => ++count.current,
  );
  if (!presenter || !projectorRoom) return null;
  const isSelf = presenter.userId === selfId;
  return {
    userId: presenter.userId,
    name: isSelf ? "You" : names[presenter.userId] ?? "Someone",
    stream: presenter.stream,
    isSelf,
    room: projectorRoom,
  };
}
