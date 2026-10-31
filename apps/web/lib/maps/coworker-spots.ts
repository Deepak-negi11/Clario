import type { CoworkerId } from "@repo/shared";
import type { Tile } from "./path-finder";

// Where the AI coworkers stand on a map that doesn't place them itself (every map but Clario
// HQ), and where one goes when asked to walk to a room. Each picks a room by their work: Rahul a
// meeting room, Priya an office or meeting room, Arjun the desks or a work area.

export type SpotRoom = { name: string; bounds: { x: number; y: number; width: number; height: number } };

const ROLE_ROOMS: Record<CoworkerId, RegExp[]> = {
  rahul: [/meeting|conference|board|summit|suite/i, /office/i],
  priya: [/office|meeting|conference|suite/i],
  arjun: [/desk|work|server|hack|lab|studio|engineer/i],
};
// The most particular first, so Rahul gets the meeting room before Priya settles for it.
const PICK_ORDER: CoworkerId[] = ["rahul", "arjun", "priya"];

const key = (tile: Tile) => `${tile.x},${tile.y}`;
const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

// A free tile in the bounds, as near their middle as can be, that someone can walk up to (a free
// tile beside it) and that isn't in `taken` or next to it.
export function tileInRoom(bounds: SpotRoom["bounds"], isFree: (x: number, y: number) => boolean, taken: ReadonlySet<string> = new Set()): Tile | null {
  const cx = bounds.x + (bounds.width - 1) / 2;
  const cy = bounds.y + (bounds.height - 1) / 2;
  const tiles: Tile[] = [];
  for (let y = bounds.y; y < bounds.y + bounds.height; y++) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x++) tiles.push({ x, y });
  }
  tiles.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy) || a.y - b.y || a.x - b.x);
  const crowded = (tile: Tile) => [[0, 0], ...NEIGHBOURS].some(([dx, dy]) => taken.has(key({ x: tile.x + dx, y: tile.y + dy })));
  return tiles.find((tile) => isFree(tile.x, tile.y) && !crowded(tile) && NEIGHBOURS.some(([dx, dy]) => isFree(tile.x + dx, tile.y + dy))) ?? null;
}

// The room with this name: the same name in any case, or else one whose name contains it ("the
// kitchen" finds "Kitchen", "meeting" finds "Meeting Room").
export function roomByName<T extends SpotRoom>(rooms: readonly T[], name: string): T | undefined {
  const wanted = name.trim().toLowerCase().replace(/^the\s+/, "");
  if (!wanted) return undefined;
  return rooms.find((room) => room.name.toLowerCase() === wanted)
    ?? rooms.find((room) => room.name.toLowerCase().includes(wanted) || wanted.includes(room.name.toLowerCase()));
}

// A spot for each coworker: in a room that suits their work (a different room each where the map
// has enough), else any room, else a few steps from where people arrive. `avoid` are tiles they
// keep off and away from (where people arrive, Maya).
export function chooseCoworkerSpots({ rooms, isFree, spawn, avoid = [] }: {
  rooms: readonly SpotRoom[];
  isFree: (x: number, y: number) => boolean;
  spawn: Tile;
  avoid?: readonly Tile[];
}): Partial<Record<CoworkerId, Tile>> {
  const taken = new Set([spawn, ...avoid].map(key));
  const usedRooms = new Set<SpotRoom>();
  const spots: Partial<Record<CoworkerId, Tile>> = {};
  const claim = (id: CoworkerId, tile: Tile, room?: SpotRoom) => {
    spots[id] = tile;
    taken.add(key(tile));
    if (room) usedRooms.add(room);
  };
  for (const id of PICK_ORDER) {
    const suited = ROLE_ROOMS[id].flatMap((pattern) => rooms.filter((room) => pattern.test(room.name)));
    const choices = [...suited.filter((room) => !usedRooms.has(room)), ...rooms.filter((room) => !usedRooms.has(room)), ...suited, ...rooms];
    for (const room of choices) {
      const tile = tileInRoom(room.bounds, isFree, taken);
      if (tile) {
        claim(id, tile, room);
        break;
      }
    }
    if (spots[id]) continue;
    // No room (or no space in one): near where people arrive.
    const near = tileInRoom({ x: spawn.x - 6, y: spawn.y - 6, width: 13, height: 13 }, (x, y) => isFree(x, y) && Math.hypot(x - spawn.x, y - spawn.y) >= 3, taken);
    if (near) claim(id, near);
  }
  return spots;
}
