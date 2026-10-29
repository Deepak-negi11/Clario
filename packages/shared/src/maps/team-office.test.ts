import { describe, expect, test } from "bun:test";
import { customBlockedTiles, customSeats, parseCustomMap } from "./custom-map";
import { generateTeamOffice, teamOfficePlan, TEAM_SIZE_PRESETS } from "./team-office";

const SIZES = [1, 3, 5, 8, 12, 18, 25, 26, 33, 40, 50, 64, 80];

// Tiles you can walk to from the spawn (seats are walkable, like on the map).
function reachable(map: ReturnType<typeof generateTeamOffice>) {
  const blocked = customBlockedTiles(map);
  const seen = new Set<string>([`${map.spawn.x},${map.spawn.y}`]);
  const queue = [map.spawn];
  while (queue.length) {
    const { x, y } = queue.shift()!;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
      const key = `${nx},${ny}`;
      if (nx < 0 || ny < 0 || nx >= map.cols || ny >= map.rows || seen.has(key) || blocked.has(key)) continue;
      seen.add(key);
      queue.push({ x: nx, y: ny });
    }
  }
  return seen;
}

describe("team office", () => {
  test("every size is a valid saved map", () => {
    for (const size of SIZES) {
      const map = generateTeamOffice(size);
      expect(parseCustomMap(map) ? "ok" : `size ${size} is not a valid map`).toBe("ok");
    }
  });

  test("has a desk chair for everyone", () => {
    for (const size of SIZES) {
      const map = generateTeamOffice(size);
      const deskChairs = map.items.filter((item) => item.kind === "task-chair").length;
      expect(deskChairs).toBeGreaterThanOrEqual(size);
      expect(teamOfficePlan(size).desks).toBeLessThanOrEqual(deskChairs);
    }
  });

  test("every seat can be reached from the front door", () => {
    for (const size of SIZES) {
      const map = generateTeamOffice(size);
      const walkable = reachable(map);
      const stranded = [...customSeats(map).keys()].filter((tile) => !walkable.has(tile));
      expect(stranded.length ? `size ${size}: seats ${stranded.join(" ")} can't be reached` : "ok").toBe("ok");
    }
  });

  test("a bigger team gets a bigger office with more rooms", () => {
    let last = generateTeamOffice(1);
    for (const { size } of TEAM_SIZE_PRESETS) {
      const map = generateTeamOffice(size);
      expect(map.cols * map.rows).toBeGreaterThanOrEqual(last.cols * last.rows);
      expect(map.rooms.length).toBeGreaterThanOrEqual(last.rooms.length);
      last = map;
    }
    expect(generateTeamOffice(80).cols * generateTeamOffice(80).rows).toBeGreaterThan(2 * generateTeamOffice(5).cols * generateTeamOffice(5).rows);
  });

  test("the same team size always gives the same office", () => {
    expect(JSON.stringify(generateTeamOffice(25))).toBe(JSON.stringify(generateTeamOffice(25)));
  });

  test("out-of-range sizes are clamped", () => {
    expect(generateTeamOffice(0).cols).toBe(generateTeamOffice(1).cols);
    expect(generateTeamOffice(500).cols).toBe(generateTeamOffice(80).cols);
    expect(generateTeamOffice(Number.NaN).cols).toBe(generateTeamOffice(1).cols);
  });
});
