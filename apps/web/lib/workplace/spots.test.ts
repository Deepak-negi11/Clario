import { describe, expect, test } from "bun:test";
import type { ChatRoomZone, CustomMapItem } from "@repo/shared";
import { doorways, itemSpots, roomSpots, spotAt, wallBoardSpots } from "./spots";

// A meeting room at x 2-5, y 2-4 with walls all round except a door at (4, 5), and a kitchen.
const meeting: ChatRoomZone = { id: "meet", name: "Meeting Room 1", bounds: { x: 2, y: 2, width: 4, height: 3 } };
const kitchen: ChatRoomZone = { id: "kitchen", name: "Kitchen", bounds: { x: 10, y: 2, width: 4, height: 3 } };
const walls = new Set<string>();
for (let x = 1; x <= 6; x++) for (const y of [1, 5]) if (!(x === 4 && y === 5)) walls.add(`${x},${y}`);
for (let y = 1; y <= 5; y++) for (const x of [1, 6]) walls.add(`${x},${y}`);

const items: CustomMapItem[] = [
  { kind: "whiteboard", x: 3, y: 2 },
  { kind: "lockers", x: 20, y: 10 },
  { kind: "swap-shelf", x: 11, y: 2 },
  { kind: "sofa", x: 30, y: 30, dir: "down" },
];

const spots = { items: itemSpots(items, [meeting, kitchen]), rooms: roomSpots([meeting, kitchen], walls) };

describe("door screens", () => {
  test("only meeting-type rooms get one", () => {
    expect(spots.rooms.map((each) => each.room.id)).toEqual(["meet"]);
  });

  test("the doorway is the gap in the wall", () => {
    expect(doorways(meeting, walls)).toEqual([{ x: 4, y: 5 }]);
    // With no walls known, the whole ring around the room counts (corners left out).
    expect(doorways(meeting, null)).toHaveLength(2 * 4 + 2 * 3);
  });

  test("standing in the doorway or just outside it", () => {
    expect(spotAt(4, 5, spots)).toEqual({ kind: "room", room: { id: "meet", name: "Meeting Room 1" } });
    expect(spotAt(4, 6, spots)?.kind).toBe("room");
    // Inside the room, or along the corridor away from the door, there's no door screen.
    expect(spotAt(4, 4, spots)?.kind).not.toBe("room");
    expect(spotAt(2, 6, spots)).toBeNull();
  });
});

describe("furniture", () => {
  test("a whiteboard is named after the room it's in, with its own board", () => {
    expect(spotAt(3, 3, spots)).toEqual({ kind: "whiteboard", board: "3,2", label: "Meeting Room 1" });
  });

  test("next to the lockers and the shelf, corners included", () => {
    expect(spotAt(22, 11, spots)).toEqual({ kind: "lockers" });
    expect(spotAt(19, 9, spots)).toEqual({ kind: "lockers" });
    expect(spotAt(23, 10, spots)).toBeNull();
    expect(spotAt(12, 3, spots)).toEqual({ kind: "shelf" });
  });

  test("other furniture is left to the map", () => {
    expect(spotAt(31, 31, spots)).toBeNull();
  });
});

describe("whiteboards on the wall", () => {
  test("used from the floor right under them, named after the room", () => {
    const room: ChatRoomZone = { id: "m2", name: "Meeting Room 2", bounds: { x: 29, y: 4, width: 8, height: 8 } };
    const wall = { items: wallBoardSpots([{ x: 29.6, w: 1.8, wallY: 2 }], [room]), rooms: [] };
    expect(spotAt(30, 4, wall)).toEqual({ kind: "whiteboard", board: "29,2", label: "Meeting Room 2" });
    expect(spotAt(32, 4, wall)?.kind).toBe("whiteboard");
    expect(spotAt(30, 5, wall)).toBeNull();
  });
});
