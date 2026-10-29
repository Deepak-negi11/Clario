import { describe, expect, test } from "bun:test";
import { findPath, type PathGrid, type Tile } from "./path-finder";

// Draws a grid from rows of text: '#' is blocked, anything else is open.
function grid(rows: string[]): PathGrid {
  return {
    cols: rows[0]!.length,
    rows: rows.length,
    isBlocked: (x, y) => rows[y]![x] === "#",
  };
}

// Plain breadth-first search: the shortest number of steps, or -1 if unreachable.
function bfsSteps(from: Tile, to: Tile, { cols, rows, isBlocked }: PathGrid) {
  const dist = new Map<string, number>([[`${from.x},${from.y}`, 0]]);
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const { x, y } = queue[i]!;
    if (x === to.x && y === to.y) return dist.get(`${x},${y}`)!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, ny = y + dy, key = `${nx},${ny}`;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || isBlocked(nx, ny) || dist.has(key)) continue;
      dist.set(key, dist.get(`${x},${y}`)! + 1);
      queue.push({ x: nx, y: ny });
    }
  }
  return -1;
}

// Every step moves one tile, onto an open tile.
function expectWalkable(path: Tile[], from: Tile, map: PathGrid) {
  let at = from;
  for (const step of path) {
    expect(Math.abs(step.x - at.x) + Math.abs(step.y - at.y)).toBe(1);
    expect(map.isBlocked(step.x, step.y)).toBe(false);
    at = step;
  }
}

function turns(path: Tile[], from: Tile) {
  let count = 0;
  let prev: [number, number] | null = null;
  let at = from;
  for (const step of path) {
    const dir: [number, number] = [step.x - at.x, step.y - at.y];
    if (prev && (prev[0] !== dir[0] || prev[1] !== dir[1])) count++;
    prev = dir;
    at = step;
  }
  return count;
}

describe("findPath", () => {
  test("crosses an open room in a straight run with one turn", () => {
    const map = grid(Array(12).fill(".".repeat(20)));
    const from = { x: 1, y: 1 };
    const path = findPath(from, { x: 15, y: 9 }, map);
    expect(path.length).toBe(22);
    expect(path.at(-1)).toEqual({ x: 15, y: 9 });
    expect(turns(path, from)).toBe(1);
  });

  test("goes through the door, as short as breadth-first search", () => {
    const map = grid([
      "..........",
      "..........",
      "#######.##",
      "..........",
      "..........",
    ]);
    const from = { x: 1, y: 0 };
    const to = { x: 1, y: 4 };
    const path = findPath(from, to, map);
    expectWalkable(path, from, map);
    expect(path.length).toBe(bfsSteps(from, to, map));
    expect(path.some((t) => t.x === 7 && t.y === 2)).toBe(true);
  });

  test("clicking a wall stops on your side of it, not round the far side", () => {
    // A two-row wall with a door far to the right: its bottom row is nearer the far side.
    const map = grid([
      "...............",
      "...............",
      "#############..",
      "#############..",
      "...............",
    ]);
    const from = { x: 2, y: 0 };
    const path = findPath(from, { x: 4, y: 3 }, map);
    expect(path.at(-1)!.y).toBe(1);
    expect(path.at(-1)!.x).toBe(4);
  });

  test("clicking a closed room walks to the nearest spot outside it", () => {
    const map = grid([
      ".........",
      "...###...",
      "...#.#...",
      "...###...",
      ".........",
    ]);
    const from = { x: 0, y: 2 };
    const path = findPath(from, { x: 4, y: 2 }, map);
    expectWalkable(path, from, map);
    expect(path.at(-1)).toEqual({ x: 2, y: 2 });
  });

  test("returns nothing when you are already as close as you can get", () => {
    const map = grid(["..#..", "..#..", "..#.."]);
    expect(findPath({ x: 1, y: 1 }, { x: 2, y: 1 }, map)).toEqual([]);
    expect(findPath({ x: 1, y: 1 }, { x: 1, y: 1 }, map)).toEqual([]);
  });

  test("matches breadth-first search on random mazes", () => {
    let seed = 42;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let round = 0; round < 60; round++) {
      const rows = Array.from({ length: 14 }, () => Array.from({ length: 22 }, () => (rand() < 0.3 ? "#" : ".")).join(""));
      const map = grid(rows);
      const open: Tile[] = [];
      rows.forEach((row, y) => [...row].forEach((c, x) => c === "." && open.push({ x, y })));
      const from = open[Math.floor(rand() * open.length)]!;
      const to = open[Math.floor(rand() * open.length)]!;
      const steps = bfsSteps(from, to, map);
      const path = findPath(from, to, map);
      expectWalkable(path, from, map);
      if (steps >= 0) {
        expect(path.length).toBe(steps);
        if (steps > 0) expect(path.at(-1)).toEqual(to);
      } else {
        // Unreachable: it still stops somewhere you can walk to, never on the goal.
        expect(path.some((t) => t.x === to.x && t.y === to.y)).toBe(false);
      }
    }
  });
});
