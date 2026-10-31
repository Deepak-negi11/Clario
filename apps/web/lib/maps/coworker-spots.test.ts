import { describe, expect, test } from "bun:test";
import { chooseCoworkerSpots, roomByName, tileInRoom } from "./coworker-spots";

const room = (name: string, x: number, y: number, width = 6, height = 5) => ({ name, bounds: { x, y, width, height } });
const open = () => true;

describe("roomByName", () => {
  const rooms = [room("Kitchen", 0, 0), room("Meeting Room 1", 10, 0), room("Open Desks", 20, 0)];

  test("finds a room by name in any case, with or without 'the'", () => {
    expect(roomByName(rooms, "kitchen")?.name).toBe("Kitchen");
    expect(roomByName(rooms, "the Open Desks")?.name).toBe("Open Desks");
  });

  test("finds a room from part of its name", () => {
    expect(roomByName(rooms, "meeting")?.name).toBe("Meeting Room 1");
    expect(roomByName(rooms, "the boiler room")).toBeUndefined();
    expect(roomByName(rooms, "  ")).toBeUndefined();
  });
});

describe("tileInRoom", () => {
  test("takes the free tile nearest the middle that you can walk up to", () => {
    const blocked = new Set(["2,2"]);
    const tile = tileInRoom({ x: 0, y: 0, width: 5, height: 5 }, (x, y) => x >= 0 && y >= 0 && x < 5 && y < 5 && !blocked.has(`${x},${y}`));
    expect(tile).not.toBeNull();
    expect(Math.abs(tile!.x - 2) + Math.abs(tile!.y - 2)).toBe(1);
  });

  test("keeps off taken tiles and the tiles next to them", () => {
    const tile = tileInRoom({ x: 0, y: 0, width: 3, height: 1 }, open, new Set(["1,0"]));
    expect(tile).toBeNull();
  });

  test("gives up on a room with no free tile", () => {
    expect(tileInRoom({ x: 0, y: 0, width: 3, height: 3 }, () => false)).toBeNull();
  });
});

describe("chooseCoworkerSpots", () => {
  test("puts each coworker in a room that suits their work", () => {
    const rooms = [room("Kitchen", 0, 0), room("Meeting Room", 10, 0), room("Office 1", 20, 0), room("Work Area", 30, 0)];
    const spots = chooseCoworkerSpots({ rooms, isFree: open, spawn: { x: 50, y: 50 } });
    const roomOf = (tile: { x: number }) => rooms.find((r) => tile.x >= r.bounds.x && tile.x < r.bounds.x + r.bounds.width)!.name;
    expect(roomOf(spots.rahul!)).toBe("Meeting Room");
    expect(roomOf(spots.arjun!)).toBe("Work Area");
    expect(roomOf(spots.priya!)).toBe("Office 1");
  });

  test("shares a room when the map has only one, without crowding", () => {
    const spots = chooseCoworkerSpots({ rooms: [room("Studio", 0, 0, 12, 8)], isFree: open, spawn: { x: 40, y: 40 } });
    const tiles = Object.values(spots);
    expect(tiles).toHaveLength(3);
    for (const a of tiles) for (const b of tiles) if (a !== b) expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBeGreaterThan(1);
  });

  test("stands near where people arrive on a map with no rooms, off the spawn", () => {
    const spawn = { x: 20, y: 20 };
    const spots = chooseCoworkerSpots({ rooms: [], isFree: open, spawn });
    for (const tile of Object.values(spots)) {
      expect(Math.hypot(tile.x - spawn.x, tile.y - spawn.y)).toBeGreaterThanOrEqual(3);
      expect(Math.hypot(tile.x - spawn.x, tile.y - spawn.y)).toBeLessThan(9);
    }
  });

  test("keeps away from tiles to avoid", () => {
    const spots = chooseCoworkerSpots({ rooms: [room("Meeting Room", 0, 0, 3, 3)], isFree: open, spawn: { x: 40, y: 40 }, avoid: [{ x: 1, y: 1 }] });
    expect(spots.rahul && Math.abs(spots.rahul.x - 1) + Math.abs(spots.rahul.y - 1)).toBeGreaterThan(1);
  });
});
