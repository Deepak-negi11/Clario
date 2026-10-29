import { describe, expect, test } from "bun:test";
import { findPath, type PathGrid, type Tile } from "../maps/path-finder";
import type { PlaySpot } from "../maps/play-spots";
import { chooseFollowTile, nearestGame, stepsFrom } from "./follow";

// Draws a grid from rows of text: '#' is blocked, anything else is open.
function grid(rows: string[]): PathGrid {
  return { cols: rows[0]!.length, rows: rows.length, isBlocked: (x, y) => rows[y]![x] === "#" };
}

// Every step of the walk there moves one tile, onto an open tile, and it gets there.
function expectWalkable(from: Tile, to: Tile, map: PathGrid) {
  let at = from;
  for (const step of findPath(from, to, map)) {
    expect(Math.abs(step.x - at.x) + Math.abs(step.y - at.y)).toBe(1);
    expect(map.isBlocked(step.x, step.y)).toBe(false);
    at = step;
  }
  expect(at).toEqual(to);
}

describe("stepsFrom", () => {
  test("counts steps round walls, and -1 where it can't get to", () => {
    const map = grid([
      "...#.",
      ".#.#.",
      "...#.",
    ]);
    const steps = stepsFrom({ x: 0, y: 0 }, map);
    expect(steps[2 * 5 + 2]).toBe(4); // (2,2): round the middle block
    expect(steps[0 * 5 + 4]).toBe(-1); // (4,0): behind the wall
  });
});

describe("chooseFollowTile", () => {
  test("picks a free tile next to you, the one fewest steps away", () => {
    const map = grid([
      ".......",
      ".......",
      ".......",
    ]);
    expect(chooseFollowTile({ leader: { x: 3, y: 1 }, from: { x: 0, y: 1 }, grid: map })).toEqual({ x: 2, y: 1 });
  });

  test("stays put when already beside you", () => {
    const map = grid([
      ".....",
      ".....",
      ".....",
    ]);
    expect(chooseFollowTile({ leader: { x: 2, y: 1 }, from: { x: 3, y: 2 }, grid: map })).toEqual({ x: 3, y: 2 });
  });

  test("never a blocked tile or one someone else has taken", () => {
    const map = grid([
      "#####",
      "#...#",
      "#####",
    ]);
    const tile = chooseFollowTile({ leader: { x: 2, y: 1 }, from: { x: 1, y: 1 }, grid: map, taken: new Set(["1,1"]) });
    expect(tile).toEqual({ x: 3, y: 1 });
  });

  test("walks round a wall to your side of it, never through it", () => {
    // You are at (4,1), right against a wall that is open only at the bottom row. The follower
    // is two tiles away on the other side; the nearest tile beside you by walking is (4,2).
    const map = grid([
      "...#...",
      "...#...",
      "...#...",
      ".......",
    ]);
    const from = { x: 2, y: 1 };
    const tile = chooseFollowTile({ leader: { x: 4, y: 1 }, from, grid: map });
    expect(tile).toEqual({ x: 4, y: 2 });
    expectWalkable(from, tile!, map);
  });

  test("null when nothing next to you can be reached", () => {
    const map = grid([
      "..#...",
      "..#...",
      "..#...",
    ]);
    expect(chooseFollowTile({ leader: { x: 4, y: 1 }, from: { x: 0, y: 1 }, grid: map })).toBeNull();
  });

  test("the lowest `rank` comes first, even a step further away", () => {
    const map = grid([
      ".....",
      ".....",
      ".....",
    ]);
    // Row 2 is best, row 0 next; the follower comes from the west, on row 1.
    const rank = ({ y }: Tile) => (y === 2 ? 0 : y === 0 ? 1 : 2);
    expect(chooseFollowTile({ leader: { x: 2, y: 1 }, from: { x: 0, y: 1 }, grid: map, rank })).toEqual({ x: 1, y: 2 });
    expect(chooseFollowTile({ leader: { x: 2, y: 1 }, from: { x: 0, y: 1 }, grid: map, rank, taken: new Set(["1,2", "2,2", "3,2"]) })).toEqual({ x: 1, y: 0 });
  });
});

describe("nearestGame", () => {
  // A one-tile game or TV at (x, y); you use it from the tile below it.
  const spot = (x: number, y: number, kind: "game" | "tv" = "game"): PlaySpot => ({
    x, y, w: 1, h: 1, label: kind, action: kind === "game" ? { kind: "game", game: "pong" } : { kind: "tv" },
  });

  test("the nearest by walking, not as the crow flies through a wall", () => {
    const map = grid([
      ".#........", // a game at (1,0), used from (1,1): 2 tiles away, but 19 steps round the wall
      "..........",
      "#########.",
      "..........", // you, at (0,3)
      "........#.", // a game at (8,4), used from (8,5): 10 steps
      "..........",
    ]);
    const far = spot(1, 0);
    const near = spot(8, 4);
    expect(nearestGame({ x: 0, y: 3 }, [far, near], map)).toBe(near);
  });

  test("TVs aren't games, and a game you can't reach is skipped", () => {
    const map = grid([
      "....#.",
      "....#.",
    ]);
    const tv = spot(1, 0, "tv");
    const cutOff = spot(5, 0);
    const game = spot(2, 0);
    expect(nearestGame({ x: 0, y: 1 }, [tv, cutOff, game], map)).toBe(game);
    expect(nearestGame({ x: 0, y: 1 }, [tv, cutOff], map)).toBeNull();
  });
});
