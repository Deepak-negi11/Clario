import { describe, expect, test } from "bun:test";
import { hqPlaySpots, playSpotsFor, spotInReach, tvScreenId } from "./play-spots";

const tvs = () => hqPlaySpots().filter((spot) => spot.action.kind === "tv");
const screenAt = (x: number, y: number) => {
  const spot = spotInReach(hqPlaySpots(), x, y);
  return spot?.action.kind === "tv" ? spot.action.screen?.name : null;
};

describe("TV spots", () => {
  test("each of Clario HQ's TVs has its own screen, named after its room", () => {
    const screens = tvs().map((spot) => (spot.action.kind === "tv" ? spot.action.screen : null));
    expect(screens).toEqual([
      { id: "tv:31,15", name: "Lounge TV" },
      { id: "tv:40,24", name: "Game Room TV" },
      { id: "tv:50,12", name: "Demo Stage TV" },
    ]);
  });

  test("the Demo Stage screen works from the lecterns and the front seats, not from further back", () => {
    expect(screenAt(52, 14)).toBe("Demo Stage TV"); // right under it
    expect(screenAt(52, 17)).toBe("Demo Stage TV"); // at the lecterns
    expect(screenAt(55, 18)).toBe("Demo Stage TV"); // front row, at the side
    expect(screenAt(52, 19)).toBeNull(); // too far back
    expect(screenAt(52, 11)).toBeNull(); // behind the wall
    expect(screenAt(57, 15)).toBeNull(); // off to the side
  });

  test("a TV console on a built map gets its own screen too", () => {
    const [spot] = playSpotsFor([{ kind: "tv-console", x: 4, y: 7 }]);
    expect(spot?.action).toEqual({ kind: "tv", screen: { id: tvScreenId(4, 7), name: "TV" } });
  });
});
