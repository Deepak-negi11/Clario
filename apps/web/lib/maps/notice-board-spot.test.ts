import { describe, expect, test } from "bun:test";
import { chooseNoticeBoardSpot, noticeBoardItem, usableItemTiles } from "./notice-board-spot";

// A room drawn as text: # wall, . floor, f furniture, S where people arrive.
function room(lines: string[]) {
  const cells = lines.map((line) => line.split(""));
  let spawn = { x: 0, y: 0 };
  cells.forEach((row, y) => row.forEach((cell, x) => { if (cell === "S") spawn = { x, y }; }));
  return {
    spawn,
    cols: cells[0]!.length,
    rows: cells.length,
    isWall: (x: number, y: number) => cells[y]?.[x] === "#",
    isFree: (x: number, y: number) => cells[y]?.[x] === "." || cells[y]?.[x] === "S",
  };
}

describe("notice board spot", () => {
  test("stands against a wall near where people arrive, with room in front", () => {
    const map = room([
      "##########",
      "#........#",
      "#........#",
      "#...S....#",
      "#........#",
      "##########",
    ]);
    const spot = chooseNoticeBoardSpot(map)!;
    expect(map.isWall(spot.x, spot.y - 1)).toBe(true);
    expect(map.isFree(spot.x, spot.y + 1)).toBe(true);
    expect(Math.max(Math.abs(spot.x - map.spawn.x), Math.abs(spot.y - map.spawn.y))).toBeGreaterThanOrEqual(2);
  });

  test("never blocks a doorway, furniture or the people it should avoid", () => {
    const map = room([
      "#####.####",
      "#ff......#",
      "#........#",
      "#....S...#",
      "##########",
    ]);
    const spot = chooseNoticeBoardSpot({ ...map, avoid: [{ x: 3, y: 1 }] })!;
    expect(map.isFree(spot.x, spot.y)).toBe(true);
    expect(spot.y).toBe(1);
    // The tile under the doorway at (5,0) has no wall behind it, and (3,1) and its neighbours are kept clear.
    expect(spot.x).not.toBe(5);
    expect(Math.abs(spot.x - 3)).toBeGreaterThan(1);
    expect(spot).toEqual(chooseNoticeBoardSpot({ ...map, avoid: [{ x: 3, y: 1 }] })!);
  });

  test("prefers the room people arrive in to a nearer wall outside it", () => {
    // People arrive at the lobby's bottom, by its door; the wall just outside the door is nearer.
    const map = room([
      "##########",
      "#........#",
      "#........#",
      "#........#",
      "#........#",
      "#....S...#",
      "#####.####",
      "#........#",
      "#........#",
      "##########",
    ]);
    expect(chooseNoticeBoardSpot(map)!.y).toBe(7);
    const lobby = { bounds: { x: 1, y: 1, width: 8, height: 5 } };
    expect(chooseNoticeBoardSpot({ ...map, rooms: [lobby] })!.y).toBe(1);
  });

  test("stays indoors rather than below the building's outside wall", () => {
    // People arrive in a hallway by the bottom wall; the grass below it has a wall "behind" it too.
    const map = room([
      "##########",
      "#........#",
      "#........#",
      "#........#",
      "#....S...#",
      "##########",
      "..........",
      "..........",
    ]);
    expect(chooseNoticeBoardSpot(map)!.y).toBe(6);
    const spot = chooseNoticeBoardSpot({ ...map, indoors: (_x, y) => y >= 1 && y <= 4 })!;
    expect(spot.y).toBe(1);
  });

  test("stands free in the room when no wall is near", () => {
    const map = room(Array.from({ length: 30 }, (_, y) => (y === 15 ? ".".repeat(14) + "S" + ".".repeat(15) : ".".repeat(30))));
    const spot = chooseNoticeBoardSpot(map);
    expect(spot).not.toBeNull();
  });

  test("gives up when there is no free tile with room in front", () => {
    expect(chooseNoticeBoardSpot(room(["###", "#S#", "###"]))).toBeNull();
  });

  test("uses the map's own board when it puts one up", () => {
    expect(noticeBoardItem([{ kind: "plant", x: 1, y: 1 }, { kind: "notice-board", x: 20, y: 26 }] as never)).toEqual({ x: 20, y: 26, w: 2, h: 1 });
    expect(noticeBoardItem([{ kind: "plant", x: 1, y: 1 }] as never)).toBeNull();
  });

  test("keeps far enough from lockers that one E press can't reach both", () => {
    const map = room([
      "############",
      "#..........#",
      "#..........#",
      "#..........#",
      "#.....S....#",
      "############",
    ]);
    const near = chooseNoticeBoardSpot(map)!;
    // Lockers (2 wide) right where the board would go: it moves 3+ tiles from them.
    const lockers = usableItemTiles([{ kind: "lockers", x: near.x, y: 1 }, { kind: "plant-big", x: 1, y: 1 }] as never);
    expect(lockers).toEqual([{ x: near.x, y: 1 }, { x: near.x + 1, y: 1 }]);
    const spot = chooseNoticeBoardSpot({ ...map, isFree: (x, y) => map.isFree(x, y) && !lockers.some((t) => t.x === x && t.y === y), keepClear: lockers })!;
    expect(Math.min(...lockers.map((t) => Math.max(Math.abs(t.x - spot.x), Math.abs(t.y - spot.y))))).toBeGreaterThanOrEqual(3);
  });

  test("on a built map with no walls, stands inside the building beside the way in, not on the path", () => {
    // The starter map: an open office (no walls) with a two-tile path leading down from its door.
    const cols = 48, rows = 36, left = 12, top = 4, right = 35, bottom = 21, door = 24;
    const floorAt = (x: number, y: number) => (x >= left && x <= right && y >= top && y <= bottom ? "wood"
      : y > bottom && (x === door - 1 || x === door) ? "path" : "grass");
    const spawn = { x: door, y: bottom + 3 };
    const reader = { x: door, y: bottom + 1 };
    const spot = chooseNoticeBoardSpot({
      spawn, cols, rows,
      isFree: (x, y) => !(x === reader.x && y === reader.y),
      isWall: () => false,
      avoid: [spawn],
      rooms: [{ bounds: { x: left + 1, y: top + 1, width: right - left - 1, height: bottom - top - 1 } }],
      indoors: (x, y) => floorAt(x, y) !== "grass",
      keepClear: [reader],
    })!;
    expect(floorAt(spot.x, spot.y)).toBe("wood");
    expect(Math.abs(spot.x - door)).toBeGreaterThan(1);
    expect(Math.max(Math.abs(spot.x - reader.x), Math.abs(spot.y - reader.y))).toBeGreaterThanOrEqual(3);
  });
});
