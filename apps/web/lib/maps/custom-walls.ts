import { floorAt, isWallAt, type CustomFloor, type CustomMap } from "@repo/shared";

// Slim walls on maps built in the map builder, worked out once for the 2D map
// (custom-map-builder.ts) and the 3D view (custom-scene.ts) so both draw the same walls.

// How thick a wall is, as a share of a tile (about a third).
export const WALL_THICKNESS = 10 / 32;

// The floor in one quarter of a tile; dx and dy (each -1 or 1) say which. A wall tile shows no
// floor of its own: each quarter beside its slim wall carries on the floor next to it (the room,
// the corridor, or grass outside the building), looking first across the wall, then diagonally.
export function quarterFloor(map: CustomMap, x: number, y: number, dx: number, dy: number): CustomFloor | null {
  if (!isWallAt(map, x, y)) return floorAt(map, x, y);
  const across = isWallAt(map, x - 1, y) || isWallAt(map, x + 1, y);
  const along = isWallAt(map, x, y - 1) || isWallAt(map, x, y + 1);
  const diagonal = [x + dx, y + dy] as const, side = [x + dx, y] as const, end = [x, y + dy] as const;
  const order = across && !along ? [end, diagonal, side] : along && !across ? [side, diagonal, end] : [diagonal, side, end];
  for (const [nx, ny] of order) if (!isWallAt(map, nx, ny)) return floorAt(map, nx, ny);
  return floorAt(map, x, y);
}

// A piece of slim wall within its tile, from 0 to 1 across (x) and down (y).
export type WallBar = { x0: number; y0: number; x1: number; y1: number };

// The slim wall on a wall tile: an east-west bar and a north-south bar, each running to the side
// of the tile where the next wall is. A straight run's end (beside a door) reaches the tile's edge,
// so the doorway is exactly the open tiles; a corner or a T stops at the middle. A wall tile on its
// own is a post.
export function wallBars(map: CustomMap, x: number, y: number): WallBar[] {
  const n = isWallAt(map, x, y - 1), s = isWallAt(map, x, y + 1);
  const w = isWallAt(map, x - 1, y), e = isWallAt(map, x + 1, y);
  const lo = (1 - WALL_THICKNESS) / 2, hi = lo + WALL_THICKNESS;
  const bars: WallBar[] = [];
  if (w || e) bars.push({ x0: w || !(n || s) ? 0 : lo, x1: e || !(n || s) ? 1 : hi, y0: lo, y1: hi });
  if (n || s) bars.push({ x0: lo, x1: hi, y0: n || !(w || e) ? 0 : lo, y1: s || !(w || e) ? 1 : hi });
  if (!bars.length) bars.push({ x0: lo, x1: hi, y0: lo, y1: hi });
  return bars;
}
