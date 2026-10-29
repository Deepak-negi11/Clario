import { describe, expect, test } from "bun:test";
import { PropBroadcast, PropMessage, SIPS_PER_CAN } from "./prop.schema";
import { ClientMessage, ServerMessage } from "./ws.schema";

describe("player props", () => {
  test("accepts a bike, a can and nothing", () => {
    for (const prop of [{ kind: "bike", bike: "teal" }, { kind: "can", drink: "lime", sips: 0 }, null]) {
      expect(PropMessage.safeParse({ type: "prop", payload: { prop } }).success).toBe(true);
    }
  });

  test("refuses bikes and drinks that don't exist, and more sips than a can holds", () => {
    for (const prop of [
      { kind: "bike", bike: "red" },
      { kind: "can", drink: "beer", sips: 0 },
      { kind: "can", drink: "cola", sips: SIPS_PER_CAN + 1 },
      { kind: "can", drink: "cola", sips: 1.5 },
      { kind: "skateboard" },
    ]) {
      expect(PropMessage.safeParse({ type: "prop", payload: { prop } }).success).toBe(false);
    }
  });

  test("is part of the client and server messages", () => {
    expect(ClientMessage.safeParse({ type: "prop", payload: { prop: { kind: "bike", bike: "orange" } } }).success).toBe(true);
    const broadcast = { type: "prop", payload: { userId: "u1", prop: null } };
    expect(PropBroadcast.safeParse(broadcast).success).toBe(true);
    expect(ServerMessage.safeParse(broadcast).success).toBe(true);
  });

  test("tells people who join what everyone already has", () => {
    const joined = {
      type: "space-joined",
      payload: { userId: "me", spawn: { x: 1, y: 1 }, users: [{ id: "u1", x: 2, y: 2, prop: { kind: "can", drink: "berry", sips: 2 } }] },
    };
    expect(ServerMessage.safeParse(joined).success).toBe(true);
  });
});
