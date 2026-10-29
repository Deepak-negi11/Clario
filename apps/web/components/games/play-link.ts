// Online play between people in the same space. The space page builds a PlayLink from its
// WebSocket (hooks/use-space-socket.ts) and hands it to ArcadeOnMap; the server relays play-*
// messages between the players at one table (a host and up to three guests) and keeps the
// Lounge TV's state for everyone.

import type { PlayClientMessage, PlayServerMessage } from "@repo/shared";
import { SCREEN_H, SCREEN_W, type ArcadeInput, type Direction, type Press, type Seat } from "./arcade-kit";

export type PlayPeer = { id: string; name: string };

export type PlayLink = {
  selfId: string | null;
  // Everyone else in the space right now.
  people: PlayPeer[];
  send: (message: PlayClientMessage) => void;
  subscribe: (listener: (message: PlayServerMessage) => void) => () => void;
};

// What the players at a table send each other (the `data` of a play-data message). The host runs
// the game and sends state; guests send their keys and pointer; anyone can ask for a rematch; the
// host says who sits where.
export type MatchData =
  | { k: "state"; s: unknown }
  | { k: "input"; h: number; p: [number, number, number] | null; pr: Press[] }
  | { k: "restart" }
  | { k: "roster"; ids: string[] };

// A match as the cabinet sees it, from this player's side. Incoming data is raw: check it with
// readMatchData.
export type Match = {
  role: "host" | "guest";
  // Everyone at the table by seat, with "You" at this player's seat. The host is seat 0.
  seats: Seat[];
  mySeat: number;
  // The other players: for the host its guests and their seats, for a guest just the host.
  peers: { id: string; seat: number }[];
  send: (data: MatchData, toUserId: string) => void;
  subscribe: (listener: (data: unknown, fromUserId: string) => void) => () => void;
};

const DIRECTIONS: Direction[] = ["up", "down", "left", "right"];
const PRESSES: readonly Press[] = [...DIRECTIONS, "action", "start"];

// Held keys as bits, so an input message stays tiny.
export function packHeld(held: ArcadeInput["held"]) {
  return DIRECTIONS.reduce((bits, direction, index) => (held[direction] ? bits | (1 << index) : bits), 0);
}

export function readMatchData(value: unknown): MatchData | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (data.k === "state") return { k: "state", s: data.s };
  if (data.k === "restart") return { k: "restart" };
  if (data.k === "roster") {
    const ids = Array.isArray(data.ids) ? data.ids.filter((id): id is string => typeof id === "string" && id.length <= 64).slice(0, 4) : [];
    return ids.length > 0 ? { k: "roster", ids } : null;
  }
  if (data.k !== "input") return null;
  const h = typeof data.h === "number" ? data.h & 15 : 0;
  const p = Array.isArray(data.p) && data.p.length === 3 && data.p.every((n) => typeof n === "number" && Number.isFinite(n))
    ? ([Math.max(0, Math.min(SCREEN_W, data.p[0])), Math.max(0, Math.min(SCREEN_H, data.p[1])), data.p[2] ? 1 : 0] as [number, number, number])
    : null;
  const pr = Array.isArray(data.pr) ? data.pr.filter((press): press is Press => PRESSES.includes(press as Press)).slice(0, 8) : [];
  return { k: "input", h, p, pr };
}

// Turns a guest's latest input message into the host's input for that guest's seat.
export function applyRemoteInput(input: ArcadeInput, data: Extract<MatchData, { k: "input" }>) {
  DIRECTIONS.forEach((direction, index) => {
    input.held[direction] = (data.h & (1 << index)) !== 0;
  });
  input.presses.push(...data.pr);
  if (!data.p) {
    input.pointer = null;
    return;
  }
  const [x, y, down] = data.p;
  const previous = input.pointer;
  const moved = previous?.x !== x || previous?.y !== y;
  input.pointer = { x, y, down: down === 1, moves: (previous?.moves ?? 0) + (moved ? 1 : 0) };
}

// Game traffic over the space's socket, for one table.
export function tableChannel(link: Pick<PlayLink, "send" | "subscribe">, peerIds: string[]) {
  return {
    send: (data: MatchData, toUserId: string) => link.send({ type: "play-data", payload: { targetUserId: toUserId, data } }),
    subscribe: (listener: (data: unknown, fromUserId: string) => void) =>
      link.subscribe((message) => {
        if (message.type === "play-data" && peerIds.includes(message.payload.fromUserId)) listener(message.payload.data, message.payload.fromUserId);
      }),
  };
}
