import { expect, test } from "bun:test";
import { callPeers } from "./proximity";
const roomAt = ({ x, y }: { x: number; y: number }) =>
  y >= 10
    ? null
    : x < 15
      ? { id: "meeting", name: "Conference room" }
      : { id: "focus", name: "Focus room" };
test("five people at the ends of a meeting table all join the same call", () => {
  const people = {
    a: { x: 1, y: 1 },
    b: { x: 12, y: 1 },
    c: { x: 1, y: 8 },
    d: { x: 12, y: 8 },
    e: { x: 6, y: 5 },
  };
  for (const [id, at] of Object.entries(people))
    expect(
      callPeers(
        at,
        Object.fromEntries(
          Object.entries(people).filter(([other]) => id !== other),
        ),
        roomAt,
      ).size,
    ).toBe(4);
});
test("room walls and the hallway do not join a meeting call", () => {
  expect([
    ...callPeers(
      { x: 14, y: 8 },
      { office: { x: 15, y: 8 }, hall: { x: 14, y: 10 }, team: { x: 1, y: 1 } },
      roomAt,
    ),
  ]).toEqual(["team"]);
});
test("open areas and ordinary rooms retain proximity calls", () => {
  expect([
    ...callPeers(
      { x: 20, y: 12 },
      { near: { x: 21, y: 12 }, far: { x: 35, y: 12 }, room: { x: 20, y: 9 } },
      roomAt,
    ),
  ]).toEqual(["near"]);
  expect(
    callPeers({ x: 16, y: 1 }, { far: { x: 25, y: 1 } }, roomAt).size,
  ).toBe(0);
});
