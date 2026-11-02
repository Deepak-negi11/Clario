import { ITEM_SPECS, boardIdOf, isBookableRoom, type ChatRoomZone, type CustomMapItem } from "@repo/shared";

// Where on the map the shared office things are used, worked out from the map's rooms and furniture
// (so it's the same on every map, the 2D view and the 3D one):
// - a meeting room's door screen: standing in its doorway, or on the tile just outside it
// - a whiteboard, the lockers or the kitchen shelf: standing next to it (sides or corners)

export type WorkplaceSpot =
  | { kind: "room"; room: { id: string; name: string } }
  | { kind: "whiteboard"; board: string; label: string }
  | { kind: "lockers" }
  | { kind: "shelf" };

type Rect = { x: number; y: number; w: number; h: number };
type ItemSpot = { spot: WorkplaceSpot; rect: Rect };

const inside = (rect: Rect, x: number, y: number) => x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
// How many tiles `x, y` is from `rect`, counting diagonals as one (0 when on it).
const distance = (rect: Rect, x: number, y: number) =>
  Math.max(Math.max(rect.x - x, 0, x - (rect.x + rect.w - 1)), Math.max(rect.y - y, 0, y - (rect.y + rect.h - 1)));

const roomRect = (room: ChatRoomZone): Rect => ({ x: room.bounds.x, y: room.bounds.y, w: room.bounds.width, h: room.bounds.height });

export function itemSpots(items: readonly CustomMapItem[], rooms: readonly ChatRoomZone[]): ItemSpot[] {
  return items.flatMap((item): ItemSpot[] => {
    const rect = { x: item.x, y: item.y, w: ITEM_SPECS[item.kind].w, h: ITEM_SPECS[item.kind].h };
    if (item.kind === "whiteboard") {
      const room = rooms.find((each) => inside(roomRect(each), item.x, item.y));
      return [{ rect, spot: { kind: "whiteboard", board: boardIdOf(item), label: room?.name ?? "The hall" } }];
    }
    if (item.kind === "lockers") return [{ rect, spot: { kind: "lockers" } }];
    if (item.kind === "swap-shelf") return [{ rect, spot: { kind: "shelf" } }];
    return [];
  });
}

// Whiteboards painted on a wall (Clario HQ's wall decor): used from the floor just below. A wall
// is two tiles tall, from `wallY` down.
export function wallBoardSpots(boards: readonly { x: number; w: number; wallY: number }[], rooms: readonly ChatRoomZone[]): ItemSpot[] {
  return boards.map(({ x, w, wallY }) => {
    const left = Math.floor(x);
    const rect = { x: left, y: wallY, w: Math.ceil(x + w) - left, h: 2 };
    const room = rooms.find((each) => inside(roomRect(each), left, wallY + 2));
    return { rect, spot: { kind: "whiteboard", board: `${left},${wallY}`, label: room?.name ?? "The hall" } };
  });
}

// The doorway tiles of a room: tiles on the ring just around it that aren't wall. With no wall
// information (or a room with no walls at all), the whole ring counts.
export function doorways(room: ChatRoomZone, walls: ReadonlySet<string> | null) {
  const rect = roomRect(room);
  const ring: { x: number; y: number }[] = [];
  for (let x = rect.x - 1; x <= rect.x + rect.w; x++) {
    for (let y = rect.y - 1; y <= rect.y + rect.h; y++) {
      if (distance(rect, x, y) === 1 && (x === rect.x - 1 || x === rect.x + rect.w) !== (y === rect.y - 1 || y === rect.y + rect.h)) ring.push({ x, y });
    }
  }
  const open = walls ? ring.filter((tile) => !walls.has(`${tile.x},${tile.y}`)) : ring;
  return open.length ? open : ring;
}

export function roomSpots(rooms: readonly ChatRoomZone[], walls: ReadonlySet<string> | null) {
  return rooms
    .filter((room) => isBookableRoom(room.name))
    .map((room) => ({ room: { id: room.id, name: room.name }, rect: roomRect(room), doors: doorways(room, walls) }));
}

// The spot the player at `x, y` can use, if any. A room's door screen wins over furniture.
export function spotAt(
  x: number,
  y: number,
  spots: { items: readonly ItemSpot[]; rooms: ReturnType<typeof roomSpots> },
): WorkplaceSpot | null {
  for (const { room, rect, doors } of spots.rooms) {
    if (inside(rect, x, y)) continue;
    // In the doorway, or one step outside it (not further into a corner).
    const near = doors.some((door) => door.x === x && door.y === y) || doors.some((door) => Math.abs(door.x - x) + Math.abs(door.y - y) === 1 && distance(rect, x, y) === 2);
    if (near) return { kind: "room", room };
  }
  const reachable = spots.items.filter(({ rect }) => distance(rect, x, y) === 1);
  return reachable[0]?.spot ?? null;
}
