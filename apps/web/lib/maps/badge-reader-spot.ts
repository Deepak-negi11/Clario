import type { CustomMapItem } from "@repo/shared";
import type { Tile } from "./path-finder";

// The front-door badge reader on a map (components/badge-reader; drawn and used by
// phaser/scenes/badge-reader-object.ts). Any map can have readers as items; a map with none gets
// one beside where people arrive (readerSpotNear).

export function badgeReadersFor(items: readonly CustomMapItem[]): Tile[] {
  return items.filter((item) => item.kind === "badge-reader").map(({ x, y }) => ({ x, y }));
}

// How far (in tiles, diagonals count) you are from a reader; 0 on it, 1 beside it.
export function tilesFrom(reader: Tile, x: number, y: number) {
  return Math.max(Math.abs(reader.x - x), Math.abs(reader.y - y));
}

const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
// The eight tiles round a tile, in order, each sharing a side with the next.
const RING = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]] as const;

// Whether standing something on a tile leaves the free tiles round it joined up: every free tile
// beside it can still reach the others by going round it, so it never cuts a way through.
function keepsWayThrough(tile: Tile, isFree: (x: number, y: number) => boolean) {
  const free = RING.map(([dx, dy]) => isFree(tile.x + dx, tile.y + dy));
  const sides = RING.flatMap(([dx, dy], i) => (dx === 0 || dy === 0) && free[i] ? [i] : []);
  if (sides.length < 2) return sides.length === 1;
  // Walk round the ring from the first free side, through free tiles only, both ways.
  const reached = new Set([sides[0]!]);
  for (const step of [1, -1]) {
    for (let i = (sides[0]! + step + 8) % 8; free[i] && !reached.has(i); i = (i + step + 8) % 8) reached.add(i);
  }
  return sides.every((i) => reached.has(i));
}

// A tile for a badge reader beside where people arrive: right next to the spawn (or a step further
// out), against a wall or furniture where there is one, and never where it would cut a way
// through. Null if there is no room.
export function readerSpotNear(spawn: Tile, isFree: (x: number, y: number) => boolean): Tile | null {
  const candidates: Tile[] = [];
  for (const ring of [1, 2]) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) === ring) candidates.push({ x: spawn.x + dx, y: spawn.y + dy });
      }
    }
  }
  const freeSides = (tile: Tile) => NEIGHBOURS.filter(([dx, dy]) => isFree(tile.x + dx, tile.y + dy)).length;
  const usable = candidates.filter((tile) => isFree(tile.x, tile.y) && freeSides(tile) >= 2 && keepsWayThrough(tile, isFree));
  const byWall = usable.find((tile) => freeSides(tile) < 4);
  return byWall ?? usable[0] ?? null;
}

// Which tiles are outside the building on a map whose walls are all we know (the templates): a
// tile is inside when walls close it in on at least three of its four sides (straight out to the
// map's edge), so a doorway and the tiles just inside it still count as inside.
export function outsideByWalls(cols: number, rows: number, isWall: (x: number, y: number) => boolean) {
  const outside = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (isWall(x, y)) continue;
      let closed = 0;
      for (const [dx, dy] of NEIGHBOURS) {
        for (let tx = x + dx, ty = y + dy; tx >= 0 && ty >= 0 && tx < cols && ty < rows; tx += dx, ty += dy) {
          if (isWall(tx, ty)) {
            closed++;
            break;
          }
        }
      }
      outside[y * cols + x] = closed < 3 ? 1 : 0;
    }
  }
  return (x: number, y: number) => x < 0 || y < 0 || x >= cols || y >= rows || outside[y * cols + x] === 1;
}

// The building's way in nearest where people arrive: the first inside tile, walking out from the
// spawn, that has a free outside tile beside it. Null when the map has no inside (no walls).
export function entranceNear(spawn: Tile, { cols, rows, isFree, isOutside }: {
  cols: number;
  rows: number;
  isFree: (x: number, y: number) => boolean;
  isOutside: (x: number, y: number) => boolean;
}): Tile | null {
  const seen = new Set([`${spawn.x},${spawn.y}`]);
  const queue: Tile[] = [spawn];
  for (let i = 0; i < queue.length; i++) {
    const tile = queue[i]!;
    if (!isOutside(tile.x, tile.y) && NEIGHBOURS.some(([dx, dy]) => isFree(tile.x + dx, tile.y + dy) && isOutside(tile.x + dx, tile.y + dy))) return tile;
    for (const [dx, dy] of NEIGHBOURS) {
      const next = { x: tile.x + dx, y: tile.y + dy };
      const key = `${next.x},${next.y}`;
      if (next.x < 0 || next.y < 0 || next.x >= cols || next.y >= rows || seen.has(key) || !isFree(next.x, next.y)) continue;
      seen.add(key);
      queue.push(next);
    }
  }
  return null;
}

// Where a map with no badge reader of its own gets one: just inside its way in, beside the door,
// against the wall, so everyone coming in passes it. Beside the spawn when the map has no way in.
export function readerSpot(spawn: Tile, map: { cols: number; rows: number; isFree: (x: number, y: number) => boolean; isOutside: (x: number, y: number) => boolean }) {
  const door = entranceNear(spawn, map);
  const inside = (x: number, y: number) => map.isFree(x, y) && !map.isOutside(x, y) && (x !== spawn.x || y !== spawn.y);
  return (door && readerSpotNear(door, inside)) ?? readerSpotNear(spawn, map.isFree);
}
