import { afterEach, describe, test, expect, setSystemTime } from "bun:test";
import {
  PRESENCE_LEASE_MS,
  setUserOnline,
  setUserPosition,
  getUserPosition,
  getRoomUsers,
  removeUser,
  renewLeases,
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

describe("presence leases", () => {
  afterEach(() => {
    setSystemTime();
  });

  // Moves the clock to just past the lease of anyone last renewed `fromMs`.
  const leaseRunsOut = (fromMs: number) => setSystemTime(new Date(fromMs + PRESENCE_LEASE_MS + 1));

  test("someone whose lease isn't renewed drops out", async () => {
    const spaceId = freshSpace();
    const userId = `u-${crypto.randomUUID()}`;
    const start = Date.now();
    await setUserOnline(spaceId, userId, { x: 1, y: 1 });

    setSystemTime(new Date(start + PRESENCE_LEASE_MS - 1_000));
    expect(await isUserOnline(spaceId, userId)).toBe(true);

    leaseRunsOut(start);
    expect(await isUserOnline(spaceId, userId)).toBe(false);
    expect(await getRoomUsers(spaceId)).toEqual([]);
  });

  test("renewLeases keeps the people given and ends run-out leases, once", async () => {
    const spaceId = freshSpace();
    const [stays, gone] = [`stays-${crypto.randomUUID()}`, `gone-${crypto.randomUUID()}`];
    const start = Date.now();
    await setUserOnline(spaceId, stays, { x: 1, y: 1 });
    await setUserOnline(spaceId, gone, { x: 2, y: 2 });

    leaseRunsOut(start);
    expect(await renewLeases(spaceId, [stays])).toEqual({ lapsed: [stays], expired: [gone] });
    expect((await getRoomUsers(spaceId)).map((user) => user.userId)).toEqual([stays]);
    expect(await renewLeases(spaceId, [stays])).toEqual({ lapsed: [], expired: [] });

    await removeUser(spaceId, stays);
  });

  test("renewLeases says who had no lease, and gives them one", async () => {
    const spaceId = freshSpace();
    const userId = `u-${crypto.randomUUID()}`;
    await setUserPosition(spaceId, userId, { x: 3, y: 4 });

    expect(await renewLeases(spaceId, [userId])).toEqual({ lapsed: [userId], expired: [] });
    expect(await getRoomUsers(spaceId)).toEqual([{ userId, x: 3, y: 4 }]);

    await removeUser(spaceId, userId);
  });
});
