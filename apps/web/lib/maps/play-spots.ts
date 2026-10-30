import type { ArcadeGameKind } from "../../components/games/arcade-kit";
import { HQ_ITEMS, HQ_WALL_DECOR, ITEM_SPECS, type HqItem } from "./clario-hq";

// The things you can play or watch: the arcade machines, ping-pong and foosball tables and the
// TVs, on Clario HQ or on a map someone built. Each spot has the tiles it covers and what it
// opens. The 2D map (phaser/scenes/play-spots.ts) and the 3D view both read this, so the same
// things work in both.

// A Game Room game, or Tetris on the arcade machine itself (components/games/tetris-overlay.tsx).
export type SpotGame = ArcadeGameKind | "tetris";
export type PlayAction = { kind: "game"; game?: SpotGame } | { kind: "tv" };

export type PlaySpot = {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  action: PlayAction;
  // A screen on a wall can only be used from the row in front of it, not through the wall.
  frontOnly?: boolean;
};

// Arcade machines come in three colours (an item's variant, or else they take turns; see
// clario-hq-builder.ts). Every one of them plays Tetris; the other games are a button away in it,
// and at the game tables.
const CABINET_GAMES: (SpotGame | undefined)[] = ["tetris", "tetris", "tetris"];
const GAME_NAMES: Record<SpotGame, string> = { pong: "Pong", breakout: "Breakout", snake: "Snake", sumo: "Chair Sumo", tetris: "Tetris" };

export function hqPlaySpots(): PlaySpot[] {
  return playSpotsFor(HQ_ITEMS, HQ_WALL_DECOR);
}

// The spots among a map's items, and the TVs hung on its walls.
export function playSpotsFor(items: readonly HqItem[], wallDecor: typeof HQ_WALL_DECOR = []): PlaySpot[] {
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
      spots.push({ x: item.x, y: item.y, w, h, label: "watch TV", action: { kind: "tv" } });
    }
  }
  // Screens hang on the south face of a wall, which is two rows tall from wallY.
  for (const decor of wallDecor) {
    if (decor.kind !== "tv") continue;
    const x = Math.floor(decor.x);
    spots.push({ x, y: decor.wallY, w: Math.ceil(decor.x + decor.w) - x, h: 2, label: "watch TV", action: { kind: "tv" }, frontOnly: true });
  }
  return spots;
}

// The spot you can use standing on (x, y): one right next to you (diagonals count), and the one
// most in front of you when several are.
export function spotInReach(spots: PlaySpot[], x: number, y: number) {
  let best: PlaySpot | null = null;
  let bestScore = Infinity;
  for (const spot of spots) {
    const dx = Math.max(spot.x - x, 0, x - (spot.x + spot.w - 1));
    const dy = Math.max(spot.y - y, 0, y - (spot.y + spot.h - 1));
    if (Math.max(dx, dy) !== 1 || (spot.frontOnly && y !== spot.y + spot.h)) continue;
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
