import { describe, test, expect } from "bun:test";
import {
  setUserOnline,
  setUserPosition,
  getUserPosition,
  getRoomUsers,
  removeUser,
  isUserOnline,
} from "./presence";

function freshSpace() {
  return `test-space-${crypto.randomUUID()}`;
}

describe("presence", () => {
  test("a user is marked online after joining a space", async () => {
    const spaceId = freshSpace();
    const userId = `u-${crypto.randomUUID()}`;

    await setUserOnline(spaceId, userId, { x: 0, y: 0 });

    expect(await isUserOnline(spaceId, userId)).toBe(true);

    await removeUser(spaceId, userId);
  });

  test("a user's position is stored and can be read back", async () => {
    const spaceId = freshSpace();
    const userId = `u-${crypto.randomUUID()}`;

    await setUserOnline(spaceId, userId, { x: 5, y: 7 });
    await setUserPosition(spaceId, userId, { x: 10, y: 12 });

    const pos = await getUserPosition(spaceId, userId);
    expect(pos).toEqual({ x: 10, y: 12 });

    await removeUser(spaceId, userId);
  });

  test("getRoomUsers returns everyone in a space with positions", async () => {
    const spaceId = freshSpace();
    const a = `a-${crypto.randomUUID()}`;
    const b = `b-${crypto.randomUUID()}`;

    await setUserOnline(spaceId, a, { x: 1, y: 1 });
    await setUserOnline(spaceId, b, { x: 2, y: 3 });

    const users = await getRoomUsers(spaceId);
    expect(users.length).toBe(2);

    const ids = users.map((u) => u.userId).sort();
    expect(ids).toEqual([a, b].sort());

    await removeUser(spaceId, a);
    await removeUser(spaceId, b);
  });

  test("removeUser takes the user out of the room", async () => {
    const spaceId = freshSpace();
    const userId = `u-${crypto.randomUUID()}`;

    await setUserOnline(spaceId, userId, { x: 0, y: 0 });
    await removeUser(spaceId, userId);

    expect(await isUserOnline(spaceId, userId)).toBe(false);
    const users = await getRoomUsers(spaceId);
    expect(users.find((u) => u.userId === userId)).toBeUndefined();
  });

  test("getUserPosition returns null for an unknown user", async () => {
    const spaceId = freshSpace();
    const pos = await getUserPosition(spaceId, "ghost");
    expect(pos).toBeNull();
  });

  test("getRoomUsers returns empty for an empty space", async () => {
    const users = await getRoomUsers(freshSpace());
    expect(users).toEqual([]);
  });
});
