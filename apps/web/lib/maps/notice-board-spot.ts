import { ITEM_SPECS, type CustomMapItem } from "@repo/shared";
import type { Tile } from "./path-finder";

// Where the notice board stands on a map: close to where people arrive, so everyone passes it,
// with its back to a wall and a free tile in front to read it from. Works on every template and
// on maps built in the map builder; the 2D map draws it there and the 3D view uses the same tile.

const NEAR = 2; // at least this many tiles from where people arrive, so it never blocks the way in
const FAR = 9;

export type NoticeBoardSpotInput = {
  spawn: Tile;
  cols: number;
  rows: number;
  // A tile someone could stand on (no wall, furniture or chair).
  isFree: (x: number, y: number) => boolean;
  isWall: (x: number, y: number) => boolean;
  // Tiles to keep clear of (people, the AI coworkers).
  avoid?: readonly Tile[];
  // The map's rooms: a spot in the room people arrive in comes first.
  rooms?: readonly { bounds: { x: number; y: number; width: number; height: number } }[];
  // Indoors (on the office floor, not out on the grass or pavement); every tile when left out.
  indoors?: (x: number, y: number) => boolean;
  // Tiles of things people use with E or a click (usableItemTiles): the board stays far enough
  // away that nobody stands next to both, so one E press never opens two things.
  keepClear?: readonly Tile[];
};

// Items people use with E or a click (lockers, the coffee machine, games, the badge reader...).
const USABLE = new Set([
  "lockers", "swap-shelf", "badge-reader", "vending-machine", "counter-coffee", "coffee-bar", "bookshelf",
  "tv-console", "pingpong", "arcade", "foosball", "server-rack", "office-printer", "printer-3d", "bike-rack",
  "whiteboard", "flip-chart",
]);

// Every tile those items cover.
export function usableItemTiles(items: readonly CustomMapItem[]): Tile[] {
  return items.flatMap((item) => {
    if (!USABLE.has(item.kind)) return [];
    const { w, h } = ITEM_SPECS[item.kind];
    return Array.from({ length: w * h }, (_, i) => ({ x: item.x + (i % w), y: item.y + Math.floor(i / w) }));
  });
}

export function chooseNoticeBoardSpot({ spawn, cols, rows, isFree, isWall, avoid = [], rooms = [], indoors, keepClear = [] }: NoticeBoardSpotInput): Tile | null {
  const wallAt = (x: number, y: number) => x < 0 || y < 0 || x >= cols || y >= rows || isWall(x, y);
  const freeAt = (x: number, y: number) => x >= 0 && y >= 0 && x < cols && y < rows && isFree(x, y);
  const crowded = (x: number, y: number) => avoid.some((tile) => Math.max(Math.abs(tile.x - x), Math.abs(tile.y - y)) <= 1);
  // Two tiles or closer: someone could stand next to both.
  const sharesReach = (x: number, y: number) => keepClear.some((tile) => Math.max(Math.abs(tile.x - x), Math.abs(tile.y - y)) <= 2);
  const inside = (bounds: { x: number; y: number; width: number; height: number }, x: number, y: number) =>
    x >= bounds.x && y >= bounds.y && x < bounds.x + bounds.width && y < bounds.y + bounds.height;
  const arrival = rooms.find((room) => inside(room.bounds, spawn.x, spawn.y));

  let best: { tile: Tile; score: number } | null = null;
  for (let y = spawn.y - FAR; y <= spawn.y + FAR; y++) {
    for (let x = spawn.x - FAR; x <= spawn.x + FAR; x++) {
      const distance = Math.max(Math.abs(x - spawn.x), Math.abs(y - spawn.y));
      if (distance < NEAR || !freeAt(x, y) || crowded(x, y)) continue;
      // Readable from the front, and not a doorway (a door has wall on both sides).
      if (!freeAt(x, y + 1) || (wallAt(x - 1, y) && wallAt(x + 1, y))) continue;
      const againstWall = wallAt(x, y - 1);
      // Against a wall reads as a real board; a free-standing one is the fallback. Then, in order
      // of weight: out of reach of lockers or a coffee machine (so one E press opens one thing),
      // indoors (not out on the grass), in the room people arrive in (or in some room when they
      // arrive outside one), and off the row and column they walk in on. Then the nearest to the
      // way in; the row and column break ties the same way every time.
      const inRoom = rooms.some((room) => inside(room.bounds, x, y));
      const roomCost = arrival ? (inside(arrival.bounds, x, y) ? 0 : 50) : rooms.length && !inRoom ? 50 : 0;
      const inLane = Math.abs(x - spawn.x) <= 1 || Math.abs(y - spawn.y) <= 1;
      const cost = (againstWall ? 0 : 100) + (sharesReach(x, y) ? 400 : 0) + (indoors && !indoors(x, y) ? 200 : 0)
        + roomCost + (inLane ? 30 : 0);
      const score = cost + Math.hypot(x - spawn.x, y - spawn.y) + y * 0.001 + x * 0.00001;
      if (!best || score < best.score) best = { tile: { x, y }, score };
    }
  }
  return best?.tile ?? null;
}

// The board a map puts up itself (a "notice-board" item: Clario HQ's, or one from the map
// builder), as the tiles it covers; null when the map has none and one is placed for it.
export function noticeBoardItem(items: readonly CustomMapItem[]) {
  const item = items.find((each) => each.kind === "notice-board");
  return item ? { x: item.x, y: item.y, w: ITEM_SPECS["notice-board"].w, h: ITEM_SPECS["notice-board"].h } : null;
}
