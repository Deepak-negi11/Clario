"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PlayLink, PlayPeer } from "./play-link";
import { COLS, PIECES, ROWS, type BlockKind, type PieceKind, type Rotation, type TetrisPhase, type TetrisState } from "./tetris-rules";

// Tetris versus online, with someone else in the space. Each player runs their own game; both are
// dealt the same pieces from one seed. Over the space's socket (a play table, apps/server/src/ws/play.ts)
// they send each other what's on their screen, the garbage they send, and when they top out.
//
//   t-go     host -> guest: start now, with this seed (both start at once)
//   t-s      either way, about 10 a second: your board, piece, hold, next and score, for the rival screen
//   t-atk    garbage lines for the other player's well
//   t-over   I topped out: the other player wins
//   t-again  guest -> host: play again (the host starts it, with a new seed)

export type TetrisSnapshot = {
  b: string; // the board, ROWS x COLS, one character a cell: "." or a block kind
  p: [PieceKind, Rotation, number, number] | null; // the falling piece: kind, rotation, x, y
  h: PieceKind | null;
  ch: boolean; // can hold
  q: string; // the next pieces
  sc: number;
  lv: number;
  ln: number;
  in: number; // garbage waiting
  se: number; // garbage sent
  t: number; // seconds played
  ph: TetrisPhase;
  cl: number[] | null; // rows flashing before they clear
  co: string | null; // the last clear's callout
};

export type TetrisWire =
  | { k: "t-go"; seed: number }
  | { k: "t-s"; s: TetrisSnapshot }
  | { k: "t-atk"; n: number }
  | { k: "t-over" }
  | { k: "t-again" };

const KINDS = new Set<string>([...PIECES, "G"]);
const PHASES: TetrisPhase[] = ["ready", "playing", "paused", "over", "won"];
const isPiece = (value: unknown): value is PieceKind => typeof value === "string" && (PIECES as readonly string[]).includes(value);
const int = (value: unknown, min: number, max: number, fallback = min) =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : fallback;

export function snapshotTetris(state: TetrisState): TetrisSnapshot {
  const piece = state.piece;
  return {
    b: state.board.map((row) => row.map((cell) => cell ?? ".").join("")).join(""),
    p: piece ? [piece.kind, piece.rotation, piece.x, piece.y] : null,
    h: state.hold,
    ch: state.canHold,
    q: state.queue.join(""),
    sc: state.score,
    lv: state.level,
    ln: state.lines,
    in: state.incoming,
    se: state.sent,
    t: Math.round(state.time * 10) / 10,
    ph: state.phase,
    cl: state.clearing ? state.clearing.rows : null,
    co: state.callout?.text ?? null,
  };
}

// Copies a snapshot from the other player onto the rival's game, checking everything: it came over
// the network. Returns false (and changes nothing) when it isn't a well-formed snapshot.
export function applyTetrisSnapshot(state: TetrisState, value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const s = value as Partial<Record<keyof TetrisSnapshot, unknown>>;
  const cells = s.b;
  if (typeof cells !== "string" || cells.length !== ROWS * COLS || [...cells].some((cell) => cell !== "." && !KINDS.has(cell))) return false;
  const board = Array.from({ length: ROWS }, (_, y) =>
    Array.from({ length: COLS }, (_, x) => {
      const cell = cells[y * COLS + x]!;
      return cell === "." ? null : (cell as BlockKind);
    }),
  );
  let piece: TetrisState["piece"] = null;
  if (Array.isArray(s.p) && s.p.length === 4 && isPiece(s.p[0])) {
    piece = { kind: s.p[0], rotation: int(s.p[1], 0, 3) as Rotation, x: int(s.p[2], -3, COLS + 2), y: int(s.p[3], -3, ROWS + 2) };
  }
  const phase = PHASES.find((name) => name === s.ph) ?? state.phase;
  const queue = typeof s.q === "string" ? [...s.q.slice(0, 6)].filter(isPiece) : [];
  const clearing = Array.isArray(s.cl) ? s.cl.slice(0, 4).map((row) => int(row, 0, ROWS - 1)) : null;
  const calloutText = typeof s.co === "string" ? s.co.slice(0, 60) : null;

  state.board = board;
  state.piece = piece;
  state.hold = isPiece(s.h) ? s.h : null;
  state.canHold = s.ch !== false;
  state.queue = queue;
  state.score = int(s.sc, 0, 99_999_999);
  state.level = int(s.lv, 1, 99, 1);
  state.lines = int(s.ln, 0, 99_999);
  state.incoming = int(s.in, 0, 99);
  state.sent = int(s.se, 0, 99_999);
  state.time = typeof s.t === "number" && Number.isFinite(s.t) ? Math.max(0, Math.min(86_400, s.t)) : state.time;
  state.phase = phase;
  // Keep the flash's own clock running here, and a callout's age, so they look the same as there.
  state.clearing = clearing ? { rows: clearing, time: state.clearing?.time ?? 0 } : null;
  state.callout = calloutText ? { text: calloutText, age: state.callout?.text === calloutText ? state.callout.age : 0 } : null;
  return true;
}

export function readTetrisWire(value: unknown): TetrisWire | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  switch (data.k) {
    case "t-go":
      return typeof data.seed === "number" && Number.isInteger(data.seed) && data.seed >= 0 && data.seed < 2 ** 31 ? { k: "t-go", seed: data.seed } : null;
    case "t-s":
      return data.s && typeof data.s === "object" ? { k: "t-s", s: data.s as TetrisSnapshot } : null;
    case "t-atk":
      return { k: "t-atk", n: int(data.n, 1, 10, 1) };
    case "t-over":
      return { k: "t-over" };
    case "t-again":
      return { k: "t-again" };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------------------------
// The table: who you're playing, and the invite or the wait before that.

export type TetrisOnlineHandlers = {
  start: (seed: number) => void; // a round starts (host and guest alike)
  attack: (lines: number) => void; // garbage for your well
  rivalOver: () => void; // the other player topped out: you win
  rivalSnapshot: (snapshot: unknown) => void;
  rematch: () => void; // host: the guest asked to play again
  left: (name: string) => void; // the other player left
};

export type TetrisOnline = {
  role: "host" | "guest" | null;
  partner: PlayPeer | null;
  invited: PlayPeer | null;
  notice: string | null;
  people: PlayPeer[];
  invite: (person: PlayPeer) => void;
  leave: () => void;
  send: (data: TetrisWire) => void;
};

export function useTetrisOnline({
  link,
  joined,
  active,
  handlers,
}: {
  link?: PlayLink;
  joined?: { hostId: string; hostName: string };
  // Online is the chosen mode: invites and play only happen then.
  active: boolean;
  handlers: TetrisOnlineHandlers;
}): TetrisOnline {
  const [partner, setPartner] = useState<PlayPeer | null>(joined ? { id: joined.hostId, name: joined.hostName } : null);
  const [role, setRole] = useState<"host" | "guest" | null>(joined ? "guest" : null);
  const [invited, setInvited] = useState<PlayPeer | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const now = useRef({ partner, invited, role });
  now.current = { partner, invited, role };
  const send = link?.send;
  const subscribe = link?.subscribe;

  const sendTo = useCallback(
    (data: TetrisWire) => {
      const other = now.current.partner;
      if (send && other) send({ type: "play-data", payload: { targetUserId: other.id, data } });
    },
    [send],
  );

  useEffect(() => {
    if (!subscribe) return;
    return subscribe((message) => {
      const { partner: other, invited: asked } = now.current;
      if (message.type === "play-answer" && asked && message.payload.fromUserId === asked.id) {
        setInvited(null);
        if (message.payload.accept) {
          setPartner(asked);
          setRole("host");
          setNotice(null);
        } else setNotice(`${asked.name} said not now.`);
      } else if (message.type === "play-leave") {
        const from = message.payload.fromUserId;
        if (other && from === other.id) {
          setPartner(null);
          setRole(null);
          setNotice(`${other.name} left the game.`);
          handlersRef.current.left(other.name);
        } else if (asked && from === asked.id) {
          setInvited(null);
          setNotice(`${asked.name} isn't available.`);
        }
      } else if (message.type === "play-data" && other && message.payload.fromUserId === other.id) {
        const data = readTetrisWire(message.payload.data);
        if (!data) return;
        const on = handlersRef.current;
        if (data.k === "t-go") on.start(data.seed);
        else if (data.k === "t-s") on.rivalSnapshot(data.s);
        else if (data.k === "t-atk") on.attack(data.n);
        else if (data.k === "t-over") on.rivalOver();
        else if (data.k === "t-again" && now.current.role === "host") on.rematch();
      }
    });
  }, [subscribe]);

  const leave = useCallback(() => {
    const { partner: other, invited: asked } = now.current;
    for (const person of [other, asked]) if (person && send) send({ type: "play-leave", payload: { targetUserId: person.id } });
    setPartner(null);
    setInvited(null);
    setRole(null);
  }, [send]);

  // Leaving the online mode, or closing Tetris, ends the table. The message waits a tick so React's
  // development remount (unmount, then mount again straight away) doesn't send it.
  const leaveRef = useRef(leave);
  leaveRef.current = leave;
  useEffect(() => {
    if (!active) leaveRef.current();
  }, [active]);
  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    return () => {
      timer.current = window.setTimeout(() => leaveRef.current(), 0);
    };
  }, []);

  const invite = useCallback(
    (person: PlayPeer) => {
      if (!send) return;
      const { invited: asked } = now.current;
      if (asked) send({ type: "play-leave", payload: { targetUserId: asked.id } });
      send({ type: "play-invite", payload: { targetUserId: person.id, game: "tetris" } });
      setInvited(person);
      setNotice(null);
    },
    [send],
  );

  return { role, partner, invited, notice, people: link?.people ?? [], invite, leave, send: sendTo };
}
