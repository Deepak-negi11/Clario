import { describe, expect, test } from "bun:test";
import { getChatRoomAtPosition, getMapTemplate } from "./map-templates";

describe("map chat rooms", () => {
  test("finds the classic-office Summit Room", () => {
    expect(getChatRoomAtPosition("classic-office", { x: 15, y: 14 })?.id).toBe("summit-room");
  });

  test("returns no room in the classic-office spawn hallway", () => {
    expect(getChatRoomAtPosition("classic-office", { x: 19, y: 27 })).toBeNull();
  });

  test("finds the campus Sequoia Suite", () => {
    expect(getChatRoomAtPosition("coworking-campus", { x: 8, y: 12 })?.id).toBe("sequoia-suite");
  });

  test("does not include the tile immediately outside a room", () => {
    expect(getChatRoomAtPosition("classic-office", { x: 20, y: 14 })?.id).not.toBe("summit-room");
  });
});

describe("clario-hq", () => {
  test("spawns in Reception", () => {
    expect(getChatRoomAtPosition("clario-hq", { x: 23, y: 29 })?.id).toBe("hq-reception");
  });

  test("Maya's tile is in Focus Room 2", () => {
    expect(getChatRoomAtPosition("clario-hq", { x: 24, y: 7 })?.id).toBe("hq-focus-2");
  });

  test("the Tech Wing rooms are where the map draws them", () => {
    expect(getChatRoomAtPosition("clario-hq", { x: 49, y: 6 })?.id).toBe("hq-server");
    expect(getChatRoomAtPosition("clario-hq", { x: 55, y: 9 })?.id).toBe("hq-maker");
    expect(getChatRoomAtPosition("clario-hq", { x: 51, y: 20 })?.id).toBe("hq-demo");
    expect(getChatRoomAtPosition("clario-hq", { x: 51, y: 29 })?.id).toBe("hq-hack");
  });

  test("the East Wing rooms are where the map draws them", () => {
    expect(getChatRoomAtPosition("clario-hq", { x: 65, y: 7 })?.id).toBe("hq-meeting-blue");
    expect(getChatRoomAtPosition("clario-hq", { x: 77, y: 7 })?.id).toBe("hq-meeting-white");
    expect(getChatRoomAtPosition("clario-hq", { x: 65, y: 19 })?.id).toBe("hq-east-lounge");
    expect(getChatRoomAtPosition("clario-hq", { x: 79, y: 17 })?.id).toBe("hq-coffee");
    expect(getChatRoomAtPosition("clario-hq", { x: 64, y: 27 })?.id).toBe("hq-cubicles");
    expect(getMapTemplate("clario-hq").dimensions.width).toBe(88);
  });

  test("the commons between Open Desks and the Lounge is not a room", () => {
    for (const x of [20, 24, 27]) expect(getChatRoomAtPosition("clario-hq", { x, y: 18 })).toBeNull();
    expect(getChatRoomAtPosition("clario-hq", { x: 19, y: 18 })?.id).toBe("hq-desks");
    expect(getChatRoomAtPosition("clario-hq", { x: 28, y: 18 })?.id).toBe("hq-lounge");
  });

  test("has no overlapping rooms", () => {
    const rooms = getMapTemplate("clario-hq").chatRooms;
    for (const a of rooms) {
      for (const b of rooms) {
        if (a === b) continue;
        const overlap = a.bounds.x < b.bounds.x + b.bounds.width && b.bounds.x < a.bounds.x + a.bounds.width
          && a.bounds.y < b.bounds.y + b.bounds.height && b.bounds.y < a.bounds.y + a.bounds.height;
        expect(overlap ? `${a.id} overlaps ${b.id}` : "ok").toBe("ok");
      }
    }
  });
});
