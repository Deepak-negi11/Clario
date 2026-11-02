import { describe, expect, test } from "bun:test";
import { getMapTemplate } from "@repo/shared";
import { hasProjector, pickPresenter } from "./use-projector";

const share = (userId: string) => ({ userId });

describe("projector presenter", () => {
  test("no one sharing shows nothing", () => {
    expect(pickPresenter([], new Map(), () => 1)).toBeNull();
  });

  test("a second presenter takes over, and it goes back when they stop", () => {
    const order = new Map<string, number>();
    let count = 0;
    const next = () => ++count;
    expect(pickPresenter([share("ana")], order, next)?.userId).toBe("ana");
    // Bob starts sharing while Ana still is: Bob is shown.
    expect(pickPresenter([share("ana"), share("bob")], order, next)?.userId).toBe("bob");
    expect(pickPresenter([share("bob"), share("ana")], order, next)?.userId).toBe("bob");
    // Bob stops (or leaves the room): back to Ana.
    expect(pickPresenter([share("ana")], order, next)?.userId).toBe("ana");
    // Bob shares again: he's the latest again.
    expect(pickPresenter([share("ana"), share("bob")], order, next)?.userId).toBe("bob");
  });

  test("someone who stops and starts again goes to the front", () => {
    const order = new Map<string, number>();
    let count = 0;
    const next = () => ++count;
    pickPresenter([share("ana"), share("bob")], order, next);
    pickPresenter([share("bob")], order, next);
    expect(pickPresenter([share("bob"), share("ana")], order, next)?.userId).toBe("ana");
    expect([...order.keys()].sort()).toEqual(["ana", "bob"]);
  });
});

test("Clario HQ's Meeting Room 2 has the projector, and no other room does", () => {
  const rooms = getMapTemplate("clario-hq").chatRooms;
  expect(rooms.filter((room) => hasProjector(room.bounds)).map((room) => room.id)).toEqual(["hq-meeting-2"]);
});
