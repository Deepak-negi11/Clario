import * as z from "zod";
import type { ChatRoomZone } from "./map-templates";
import { DIRS, FABRICS, FLOOR_KINDS, ITEM_KINDS, itemFootprint, itemSpec, type Dir, type FloorKind, type ItemKind } from "./catalog";

// A map someone built in the map builder. It is stored on the space, so everyone in the space
// sees the same office, and the server checks it with the schema below before saving it.
// Units are tiles; x grows to the right, y grows down.

export const CUSTOM_MAP_TEMPLATE = "custom-office";
export const CUSTOM_MAP_LIMITS = { minCols: 20, maxCols: 80, minRows: 16, maxRows: 60, maxItems: 1500, maxRooms: 40 } as const;

// Floors are stored one letter per tile, row by row. "." is grass (outside); "p" is a paved path.
export type CustomFloor = FloorKind | "path";
export const FLOOR_CODES: Record<CustomFloor, string> = {
  wood: "w", carpet: "c", tile: "t", herringbone: "h", terrazzo: "z", sage: "s", arcade: "a", sand: "n",
  office: "o", raised: "r", concrete: "k", teal: "e", zigzag: "g", porcelain: "l", brick: "b", lavender: "v", path: "p",
  maple: "m", crosstile: "x", damask: "d",
};
const FLOOR_BY_CODE = new Map(Object.entries(FLOOR_CODES).map(([kind, code]) => [code, kind as CustomFloor]));
export const CUSTOM_FLOORS = [...FLOOR_KINDS, "path"] as const satisfies readonly CustomFloor[];
const GRASS = ".";
const WALL = "#";

const tileRows = (allowed: string) => z.array(z.string().regex(new RegExp(`^[${allowed.replace(/[.#]/g, "\\$&")}]*$`)));

export const customMapItemSchema = z.object({
  kind: z.enum(ITEM_KINDS as [ItemKind, ...ItemKind[]]),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  dir: z.enum(DIRS).optional(),
  fabric: z.enum(FABRICS).optional(),
  // Which of a piece's looks to draw, where it has several (a side table's lamp or books).
  variant: z.number().int().min(0).max(7).optional(),
});
export type CustomMapItem = z.infer<typeof customMapItemSchema>;

const roomSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  name: z.string().trim().min(1).max(30),
  bounds: z.object({ x: z.number().int().min(0), y: z.number().int().min(0), width: z.number().int().min(1), height: z.number().int().min(1) }),
});

export const customMapSchema = z.object({
  version: z.literal(1),
  cols: z.number().int().min(CUSTOM_MAP_LIMITS.minCols).max(CUSTOM_MAP_LIMITS.maxCols),
  rows: z.number().int().min(CUSTOM_MAP_LIMITS.minRows).max(CUSTOM_MAP_LIMITS.maxRows),
  floor: tileRows(GRASS + Object.values(FLOOR_CODES).join("")),
  walls: tileRows(GRASS + WALL),
  items: z.array(customMapItemSchema).max(CUSTOM_MAP_LIMITS.maxItems),
  rooms: z.array(roomSchema).max(CUSTOM_MAP_LIMITS.maxRooms),
  spawn: z.object({ x: z.number().int().min(0), y: z.number().int().min(0) }),
}).superRefine((map, ctx) => {
  const problem = (message: string) => ctx.addIssue({ code: "custom", message });
  if (map.floor.length !== map.rows || map.floor.some((row) => row.length !== map.cols)) problem("floor must have one row of cols letters per row");
  if (map.walls.length !== map.rows || map.walls.some((row) => row.length !== map.cols)) problem("walls must have one row of cols letters per row");
  if (ctx.issues.length) return;

  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < map.cols && y < map.rows;
  const taken = new Map<string, number>();
  map.items.forEach((item, index) => {
    const spec = itemSpec(item.kind);
    if (item.dir && item.dir !== "down" && !spec.faces?.includes(item.dir)) problem(`item ${index} (${item.kind}) can't face ${item.dir}`);
    if (item.fabric && !spec.fabric) problem(`item ${index} (${item.kind}) has no fabric`);
    for (const { x, y } of itemFootprint(item)) {
      if (!inside(x, y)) { problem(`item ${index} (${item.kind}) is off the map`); return; }
      if (map.walls[y]![x] === WALL) problem(`item ${index} (${item.kind}) stands on a wall`);
      const other = taken.get(`${x},${y}`);
      if (other !== undefined) problem(`item ${index} (${item.kind}) overlaps item ${other}`);
      taken.set(`${x},${y}`, index);
    }
  });

  const ids = new Set<string>();
  map.rooms.forEach((room, index) => {
    const { x, y, width, height } = room.bounds;
    if (!inside(x, y) || !inside(x + width - 1, y + height - 1)) problem(`room ${room.name} is off the map`);
    if (ids.has(room.id)) problem(`room id ${room.id} is used twice`);
    ids.add(room.id);
    map.rooms.slice(index + 1).forEach((other) => {
      if (roomsClash(room.bounds, other.bounds)) problem(`rooms ${room.name} and ${other.name} overlap`);
    });
  });

  const { x, y } = map.spawn;
  if (!inside(x, y)) problem("spawn is off the map");
  else if (customBlockedTiles(map).has(`${x},${y}`)) problem("spawn is on a wall or furniture");
});

export type CustomMap = z.infer<typeof customMapSchema>;

export function parseCustomMap(raw: unknown): CustomMap | null {
  const parsed = customMapSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function floorAt(map: CustomMap, x: number, y: number): CustomFloor | null {
  return FLOOR_BY_CODE.get(map.floor[y]?.[x] ?? GRASS) ?? null;
}

export function isWallAt(map: CustomMap, x: number, y: number) {
  return map.walls[y]?.[x] === WALL;
}

// Every tile you can't walk onto: walls, and furniture that isn't a seat.
export function customBlockedTiles(map: Pick<CustomMap, "walls" | "items">) {
  const blocked = new Set<string>();
  map.walls.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === WALL) blocked.add(`${x},${y}`); });
  for (const item of map.items) {
    if (itemSpec(item.kind).seat) continue;
    for (const { x, y } of itemFootprint(item)) blocked.add(`${x},${y}`);
  }
  return blocked;
}

// Seat tiles and which way someone sitting there faces.
export function customSeats(map: Pick<CustomMap, "items">) {
  const seats = new Map<string, Dir>();
  for (const item of map.items) {
    if (!itemSpec(item.kind).seat) continue;
    for (const { x, y } of itemFootprint(item)) seats.set(`${x},${y}`, item.dir ?? "down");
  }
  return seats;
}

type Bounds = { x: number; y: number; width: number; height: number };

const contains = (outer: Bounds, inner: Bounds) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;

// Rooms may nest (a meeting room inside the office), but not partly overlap or be the same
// rectangle twice, so every tile belongs to exactly one innermost room.
export function roomsClash(a: Bounds, b: Bounds) {
  const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  if (!overlap) return false;
  const same = a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
  return same || !(contains(a, b) || contains(b, a));
}

// The room you're in: the smallest one around you, so a meeting room inside the office wins.
export function customRoomAt(map: Pick<CustomMap, "rooms">, position: { x: number; y: number }): ChatRoomZone | null {
  let best: ChatRoomZone | null = null;
  for (const room of map.rooms) {
    const { x, y, width, height } = room.bounds;
    if (position.x < x || position.y < y || position.x >= x + width || position.y >= y + height) continue;
    if (!best || width * height < best.bounds.width * best.bounds.height) best = room;
  }
  return best;
}

// A new space starts on a grass plot with an empty walled office, a door, a path out front and
// one room, so there's somewhere to stand and something to build from.
export function createStarterMap(cols = 48, rows = 36): CustomMap {
  const floor = Array.from({ length: rows }, () => Array<string>(cols).fill(GRASS));
  const walls = Array.from({ length: rows }, () => Array<string>(cols).fill(GRASS));
  const left = Math.floor(cols / 2) - 12, top = 4, right = left + 23, bottom = top + 17;
  const door = Math.floor(cols / 2);
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
    const edge = x === left || x === right || y === top || y === bottom;
    if (edge && !(y === bottom && (x === door - 1 || x === door))) walls[y]![x] = WALL;
    else floor[y]![x] = FLOOR_CODES.wood;
  }
  for (let y = bottom; y < rows; y++) { floor[y]![door - 1] = FLOOR_CODES.path; floor[y]![door] = FLOOR_CODES.path; }
  return {
    version: 1,
    cols,
    rows,
    floor: floor.map((row) => row.join("")),
    walls: walls.map((row) => row.join("")),
    items: [],
    rooms: [{ id: "office", name: "Office", bounds: { x: left + 1, y: top + 1, width: right - left - 1, height: bottom - top - 1 } }],
    spawn: { x: door, y: bottom + 3 },
  };
}
