import { describe, expect, test } from "bun:test";
import { badgeReadersFor, entranceNear, outsideByWalls, readerSpot, readerSpotNear, tilesFrom } from "./badge-reader-spot";

describe("badgeReadersFor", () => {
  test("finds the badge readers among a map's items", () => {
    expect(badgeReadersFor([
      { kind: "sofa", x: 1, y: 1 },
      { kind: "badge-reader", x: 5, y: 6 },
    ])).toEqual([{ x: 5, y: 6 }]);
  });
});

describe("tilesFrom", () => {
  test("counts diagonals as one step", () => {
    expect(tilesFrom({ x: 4, y: 4 }, 4, 4)).toBe(0);
    expect(tilesFrom({ x: 4, y: 4 }, 5, 5)).toBe(1);
    expect(tilesFrom({ x: 4, y: 4 }, 4, 6)).toBe(2);
  });
});

describe("readerSpotNear", () => {
  const room = (x: number, y: number) => x >= 0 && y >= 0 && x < 10 && y < 10;

  test("stands right beside the spawn, off it", () => {
    const tile = readerSpotNear({ x: 5, y: 5 }, room)!;
    expect(tilesFrom({ x: 5, y: 5 }, tile.x, tile.y)).toBe(1);
  });

  test("prefers a tile against a wall", () => {
    expect(readerSpotNear({ x: 5, y: 1 }, room)!.y).toBe(0);
  });

  test("never closes the only way past", () => {
    // A one-tile corridor running along x at y = 5: a reader in it would block it.
    const corridor = (x: number, y: number) => y === 5 && x >= 0 && x < 10;
    expect(readerSpotNear({ x: 5, y: 5 }, corridor)).toBeNull();
  });
});

describe("readerSpot", () => {
  // A 10 x 10 room (walls round x 2-11, y 2-11) on a 14 x 16 map, with a two-tile door in its
  // bottom wall at x 6-7, and people arriving in the middle of the room.
  const isWall = (x: number, y: number) => (x === 2 || x === 11 || y === 2 || y === 11) && x >= 2 && x <= 11 && y >= 2 && y <= 11 && !(y === 11 && (x === 6 || x === 7));
  const map = { cols: 14, rows: 16, isFree: (x: number, y: number) => x >= 0 && y >= 0 && x < 14 && y < 16 && !isWall(x, y) };

  test("finds the way in nearest the spawn", () => {
    const isOutside = outsideByWalls(14, 16, isWall);
    expect(isOutside(6, 6)).toBe(false);
    expect(isOutside(6, 13)).toBe(true);
    const door = entranceNear({ x: 6, y: 6 }, { ...map, isOutside });
    expect(door && door.y).toBe(11);
  });

  test("stands the reader just inside the door, not beside the spawn", () => {
    const isOutside = outsideByWalls(14, 16, isWall);
    const tile = readerSpot({ x: 6, y: 6 }, { ...map, isOutside })!;
    expect(tile.y).toBeGreaterThanOrEqual(9);
    expect(isOutside(tile.x, tile.y)).toBe(false);
    expect(isWall(tile.x, tile.y)).toBe(false);
  });

  test("falls back to beside the spawn on a map with no walls", () => {
    const open = { cols: 10, rows: 10, isFree: (x: number, y: number) => x >= 0 && y >= 0 && x < 10 && y < 10 };
    const tile = readerSpot({ x: 5, y: 5 }, { ...open, isOutside: outsideByWalls(10, 10, () => false) })!;
    expect(tilesFrom({ x: 5, y: 5 }, tile.x, tile.y)).toBe(1);
  });
});
