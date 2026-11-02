import { getChatRoomAtPosition } from "@repo/shared";
import type { ArcadeGameKind } from "../../components/games/arcade-kit";
import { HQ_ITEMS, HQ_WALL_DECOR, ITEM_SPECS, type HqItem } from "./clario-hq";

// The things you can play or watch: the arcade machines, ping-pong and foosball tables and the
// TVs, on Clario HQ or on a map someone built. Each spot has the tiles it covers and what it
// opens. The 2D map (phaser/scenes/play-spots.ts) and the 3D view both read this, so the same
// things work in both.

// A Game Room game, or Tetris on the arcade machine itself (components/games/tetris-overlay.tsx).
export type SpotGame = ArcadeGameKind | "tetris";
// Each TV has its own channel (components/tv/), named by the tile it's on: the 2D spots, the 3D
// screens (office-scene.ts tags them with this id) and the space's server all use it.
export type TvScreenRef = { id: string; name: string };
export const tvScreenId = (x: number, y: number) => `tv:${x},${y}`;
export type PlayAction = { kind: "game"; game?: SpotGame } | { kind: "tv"; screen?: TvScreenRef };

export type PlaySpot = {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  action: PlayAction;
  // A screen on a wall can only be used from in front of it, not through the wall: from this many
  // rows in front (1 when not given).
  frontOnly?: boolean;
  reach?: number;
};

// Rows in front of a big wall screen it can be used from: from the lecterns and front rows too.
const WALL_SCREEN_REACH = 5;

// Arcade machines come in three colours (an item's variant, or else they take turns; see
// clario-hq-builder.ts). Every one of them plays Tetris; the other games are a button away in it,
// and at the game tables.
const CABINET_GAMES: (SpotGame | undefined)[] = ["tetris", "tetris", "tetris"];
const GAME_NAMES: Record<SpotGame, string> = { pong: "Pong", breakout: "Breakout", snake: "Snake", sumo: "Chair Sumo", tetris: "Tetris" };

export function hqPlaySpots(): PlaySpot[] {
  return playSpotsFor(HQ_ITEMS, HQ_WALL_DECOR, (x, y) => getChatRoomAtPosition("clario-hq", { x, y })?.name ?? null);
}

// The spots among a map's items, and the TVs hung on its walls. `roomAt` names a TV after its room.
export function playSpotsFor(
  items: readonly HqItem[],
  wallDecor: typeof HQ_WALL_DECOR = [],
  roomAt: (x: number, y: number) => string | null = () => null,
): PlaySpot[] {
  const tvName = (room: string | null) => (room ? `${room} TV` : "TV");
  const spots: PlaySpot[] = [];
  let cabinet = 0;
  for (const item of items) {
    const { w, h } = ITEM_SPECS[item.kind];
    if (item.kind === "arcade") {
      const game = CABINET_GAMES[(item.variant ?? cabinet) % CABINET_GAMES.length];
      cabinet++;
      spots.push({ x: item.x, y: item.y, w, h, label: game ? `play ${GAME_NAMES[game]}` : "play arcade games", action: { kind: "game", game } });
    } else if (item.kind === "pingpong") {
      spots.push({ x: item.x, y: item.y, w, h, label: "play Pong", action: { kind: "game", game: "pong" } });
    } else if (item.kind === "foosball") {
      // Up to four players, like a real foosball table.
      spots.push({ x: item.x, y: item.y, w, h, label: "play Chair Sumo", action: { kind: "game", game: "sumo" } });
    } else if (item.kind === "tv-console") {
      const screen = { id: tvScreenId(item.x, item.y), name: tvName(roomAt(item.x, item.y)) };
      spots.push({ x: item.x, y: item.y, w, h, label: "watch TV", action: { kind: "tv", screen } });
    }
  }
  // Screens hang on the south face of a wall, which is two rows tall from wallY. The room is the
  // first one in front (there may be a corridor row between).
  for (const decor of wallDecor) {
    if (decor.kind !== "tv") continue;
    const x = Math.floor(decor.x);
    const middle = Math.floor(decor.x + decor.w / 2);
    let room: string | null = null;
    for (let y = decor.wallY + 2; !room && y < decor.wallY + 2 + WALL_SCREEN_REACH; y++) room = roomAt(middle, y);
    const screen = { id: tvScreenId(x, decor.wallY), name: tvName(room) };
    spots.push({ x, y: decor.wallY, w: Math.ceil(decor.x + decor.w) - x, h: 2, label: "watch TV", action: { kind: "tv", screen }, frontOnly: true, reach: WALL_SCREEN_REACH });
  }
  return spots;
}

// The spot you can use standing on (x, y): one right next to you (diagonals count), or a wall
// screen you're in front of, and the one most in front of you when several are.
export function spotInReach(spots: PlaySpot[], x: number, y: number) {
  let best: PlaySpot | null = null;
  let bestScore = Infinity;
  for (const spot of spots) {
    const dx = Math.max(spot.x - x, 0, x - (spot.x + spot.w - 1));
    const dy = Math.max(spot.y - y, 0, y - (spot.y + spot.h - 1));
    if (spot.frontOnly) {
      const rows = y - (spot.y + spot.h);
      if (dx > 1 || rows < 0 || rows >= (spot.reach ?? 1)) continue;
    } else if (Math.max(dx, dy) !== 1) continue;
    const score = Math.abs(spot.x + (spot.w - 1) / 2 - x) + Math.abs(spot.y + (spot.h - 1) / 2 - y);
    if (score < bestScore) {
      best = spot;
      bestScore = score;
    }
  }
  return best;
}

// Where to walk to use a spot: the middle of the row in front of it.
export const spotFront = (spot: PlaySpot) => ({ x: spot.x + Math.floor((spot.w - 1) / 2), y: spot.y + spot.h });
