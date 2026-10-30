import { describe, expect, test } from "bun:test";
import { addToRoom, bikeTaken, forgetRemoteProps, propOf, removeFromRoom, setProp, setRemoteProp, type Socket } from "./room-manager";

const socket = () => ({ send() {} }) as unknown as Socket;

describe("props across servers", () => {
  test("a bike ridden on another server is taken here, and its rider's prop shows to people here", () => {
    const space = `space-${crypto.randomUUID()}`;
    addToRoom(space, { socket: socket(), userId: "here", x: 0, y: 0 });
    setRemoteProp(space, "there", { kind: "bike", bike: "teal" });

    expect(bikeTaken(space, "teal", "here")).toBe(true);
    expect(bikeTaken(space, "teal", "there")).toBe(false);
    expect(bikeTaken(space, "orange", "here")).toBe(false);
    expect(propOf(space, "there")).toEqual({ kind: "bike", bike: "teal" });

    setRemoteProp(space, "there", null);
    expect(bikeTaken(space, "teal", "here")).toBe(false);

    setRemoteProp(space, "there", { kind: "can", drink: "cola", sips: 2 });
    forgetRemoteProps(space);
    expect(propOf(space, "there")).toBeNull();
    removeFromRoom(space, "here");
  });

  test("a rider here takes the bike for everyone else", () => {
    const space = `space-${crypto.randomUUID()}`;
    addToRoom(space, { socket: socket(), userId: "a", x: 0, y: 0 });
    addToRoom(space, { socket: socket(), userId: "b", x: 0, y: 0 });
    setProp(space, "a", { kind: "bike", bike: "orange" });
    expect(bikeTaken(space, "orange", "b")).toBe(true);
    expect(bikeTaken(space, "orange", "a")).toBe(false);
    removeFromRoom(space, "a");
    removeFromRoom(space, "b");
  });
});
