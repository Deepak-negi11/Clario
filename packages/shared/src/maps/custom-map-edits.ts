import { itemFootprint, itemSpec, type Dir, type Fabric, type ItemKind } from "./catalog";
import {
  CUSTOM_MAP_LIMITS, FLOOR_CODES, customBlockedTiles, customRoomAt, isWallAt, roomsClash,
  type CustomFloor, type CustomMap, type CustomMapItem,
} from "./custom-map";

// The edits the map builder makes. Each takes a map and returns a new one, or a reason the edit
// can't be made, so the builder can show why and the saved map always passes the schema.

export type EditResult = { map: CustomMap } | { error: string };

const setChar = (rows: string[], x: number, y: number, char: string) =>
  rows.map((row, index) => (index === y ? row.slice(0, x) + char + row.slice(x + 1) : row));

const inside = (map: CustomMap, x: number, y: number) => x >= 0 && y >= 0 && x < map.cols && y < map.rows;

// The item covering a tile, if any (its index in map.items).
export function itemIndexAt(map: CustomMap, x: number, y: number) {
  for (let i = map.items.length - 1; i >= 0; i--) {
    if (itemFootprint(map.items[i]!).some((cell) => cell.x === x && cell.y === y)) return i;
  }
  return -1;
}

// Why an item can't go here, or null if it can.
export function placementProblem(map: CustomMap, item: { kind: ItemKind; x: number; y: number }) {
  const spec = itemSpec(item.kind);
  if (map.items.length >= CUSTOM_MAP_LIMITS.maxItems) return `This map already has ${CUSTOM_MAP_LIMITS.maxItems} things on it`;
  for (const { x, y } of itemFootprint(item)) {
    if (!inside(map, x, y)) return "That goes off the edge of the map";
    if (isWallAt(map, x, y)) return "There's a wall in the way";
    const other = itemIndexAt(map, x, y);
    if (other >= 0) return `${itemSpec(map.items[other]!.kind).label} is in the way`;
    if (!spec.seat && map.spawn.x === x && map.spawn.y === y) return "That's where people arrive; move the spawn point first";
  }
  return null;
}

export function placeItem(map: CustomMap, kind: ItemKind, x: number, y: number, dir?: Dir, fabric?: Fabric): EditResult {
  const problem = placementProblem(map, { kind, x, y });
  if (problem) return { error: problem };
  const spec = itemSpec(kind);
  const item: CustomMapItem = { kind, x, y };
  if (dir && dir !== "down" && spec.faces?.includes(dir)) item.dir = dir;
  if (fabric && spec.fabric) item.fabric = fabric;
  return { map: { ...map, items: [...map.items, item] } };
}

// Removes what's on a tile: furniture first, then a wall.
export function eraseAt(map: CustomMap, x: number, y: number): EditResult {
  const index = itemIndexAt(map, x, y);
  if (index >= 0) return { map: { ...map, items: map.items.filter((_, i) => i !== index) } };
  if (isWallAt(map, x, y)) return { map: { ...map, walls: setChar(map.walls, x, y, ".") } };
  return { error: "Nothing to remove here" };
}

export function setWall(map: CustomMap, x: number, y: number, on: boolean): EditResult {
  if (!inside(map, x, y)) return { error: "That's off the map" };
  if (isWallAt(map, x, y) === on) return { map };
  if (on) {
    if (itemIndexAt(map, x, y) >= 0) return { error: "Move the furniture before building a wall here" };
    if (map.spawn.x === x && map.spawn.y === y) return { error: "That's where people arrive; move the spawn point first" };
  }
  return { map: { ...map, walls: setChar(map.walls, x, y, on ? "#" : ".") } };
}

// Paints a floor; null paints grass (outside).
export function paintFloor(map: CustomMap, x: number, y: number, floor: CustomFloor | null): EditResult {
  if (!inside(map, x, y)) return { error: "That's off the map" };
  return { map: { ...map, floor: setChar(map.floor, x, y, floor ? FLOOR_CODES[floor] : ".") } };
}

export function setSpawn(map: CustomMap, x: number, y: number): EditResult {
  if (!inside(map, x, y)) return { error: "That's off the map" };
  if (customBlockedTiles(map).has(`${x},${y}`)) return { error: "People can't stand there" };
  return { map: { ...map, spawn: { x, y } } };
}

// A room is a named rectangle: inside it, people share the room's chat and see its name. It can
// sit inside a bigger room (a meeting room in the office) but not half over one.
export function addRoom(map: CustomMap, name: string, from: { x: number; y: number }, to: { x: number; y: number }): EditResult {
  const trimmed = name.trim().slice(0, 30);
  if (!trimmed) return { error: "Give the room a name" };
  if (map.rooms.length >= CUSTOM_MAP_LIMITS.maxRooms) return { error: `A map can have up to ${CUSTOM_MAP_LIMITS.maxRooms} rooms` };
  const x = Math.max(0, Math.min(from.x, to.x)), y = Math.max(0, Math.min(from.y, to.y));
  const width = Math.min(map.cols - 1, Math.max(from.x, to.x)) - x + 1;
  const height = Math.min(map.rows - 1, Math.max(from.y, to.y)) - y + 1;
  const bounds = { x, y, width, height };
  const clash = map.rooms.find((room) => roomsClash(room.bounds, bounds));
  if (clash) return { error: `That overlaps ${clash.name}` };
  const base = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "room";
  let id = base;
  for (let n = 2; map.rooms.some((room) => room.id === id); n++) id = `${base}-${n}`;
  return { map: { ...map, rooms: [...map.rooms, { id, name: trimmed, bounds }] } };
}

export function renameRoom(map: CustomMap, id: string, name: string): EditResult {
  const trimmed = name.trim().slice(0, 30);
  if (!trimmed) return { error: "Give the room a name" };
  return { map: { ...map, rooms: map.rooms.map((room) => (room.id === id ? { ...room, name: trimmed } : room)) } };
}

export function removeRoom(map: CustomMap, id: string): EditResult {
  return { map: { ...map, rooms: map.rooms.filter((room) => room.id !== id) } };
}

export function roomAt(map: CustomMap, x: number, y: number) {
  return customRoomAt(map, { x, y });
}
