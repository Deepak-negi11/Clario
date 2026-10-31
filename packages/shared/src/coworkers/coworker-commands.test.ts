import { describe, expect, test } from "bun:test";
import { allowedMove, coworkerCommand, matchRoom, type CoworkerAbilities } from "./coworker-commands";

const ROOMS = ["Lounge", "Kitchen", "Meeting Room", "Meeting Room 2", "Office 1"];
const ALL: CoworkerAbilities = { canWalk: true, canGoTo: true, rooms: ROOMS };
const NONE: CoworkerAbilities = { canWalk: false, canGoTo: false, rooms: ROOMS };

describe("matchRoom", () => {
  test("finds the map's own spelling, any case, 'the' optional", () => {
    expect(matchRoom("the KITCHEN", ROOMS)).toBe("Kitchen");
    expect(matchRoom("meeting room 2", ROOMS)).toBe("Meeting Room 2");
    expect(matchRoom("Rooftop", ROOMS)).toBeNull();
    expect(matchRoom("  ", ROOMS)).toBeNull();
  });
});

describe("allowedMove", () => {
  test("walking, playing and stopping need the 3D view", () => {
    for (const type of ["follow", "play", "stop"] as const) {
      expect(allowedMove({ type }, ALL)).toEqual({ type });
      expect(allowedMove({ type }, NONE)).toBeNull();
    }
  });

  test("go-to needs a scene that can do it and a room on this map", () => {
    expect(allowedMove({ type: "go-to", room: "kitchen" }, ALL)).toEqual({ type: "go-to", room: "Kitchen" });
    expect(allowedMove({ type: "go-to", room: "Kitchen" }, NONE)).toBeNull();
    expect(allowedMove({ type: "go-to", room: "Mars" }, ALL)).toBeNull();
  });

  test("leaving always works", () => {
    expect(allowedMove({ type: "leave" }, NONE)).toEqual({ type: "leave" });
  });
});

describe("coworkerCommand", () => {
  test("go to a room by name; the longest matching name wins", () => {
    expect(coworkerCommand("Can you go to the kitchen?", ALL)).toEqual({ type: "go-to", room: "Kitchen" });
    expect(coworkerCommand("head over to meeting room 2 please", ALL)).toEqual({ type: "go-to", room: "Meeting Room 2" });
    expect(coworkerCommand("walk into the lounge", ALL)).toEqual({ type: "go-to", room: "Lounge" });
  });

  test("no room, or a scene that can't, is not a command", () => {
    expect(coworkerCommand("go to the rooftop", ALL)).toBeNull();
    expect(coworkerCommand("go to the kitchen", NONE)).toBeNull();
    expect(coworkerCommand("I went to the kitchen earlier", ALL)).toBeNull();
  });

  test("goodbyes leave", () => {
    for (const text of ["Bye!", "Okay, see you later", "That's all for now, thanks", "You can go now", "leave"]) {
      expect(coworkerCommand(text, NONE)).toEqual({ type: "leave" });
    }
  });

  test("ordinary chat is not a goodbye", () => {
    for (const text of ["I'm on leave next week", "Can I leave early on Friday?", "What's the leave policy?"]) {
      expect(coworkerCommand(text, ALL)).toBeNull();
    }
  });
});
