import { describe, expect, test } from "bun:test";
import { ClientMessage, ServerMessage } from "./ws.schema";
import { PLAY_DATA_MAX_CHARS, PlayClientMessage } from "./play.schema";

describe("play messages", () => {
  test("invites, answers, leaves and game data parse as client messages", () => {
    for (const message of [
      { type: "play-invite", payload: { targetUserId: "u2", game: "pong" } },
      { type: "play-answer", payload: { targetUserId: "u1", accept: true } },
      { type: "play-leave", payload: { targetUserId: "u1" } },
      { type: "play-data", payload: { targetUserId: "u1", data: { k: "state", s: { p: "playing" } } } },
    ]) {
      expect(ClientMessage.safeParse(message).success).toBe(true);
      expect(PlayClientMessage.safeParse(message).success).toBe(true);
    }
  });

  test("unknown games and oversized game data are refused", () => {
    expect(ClientMessage.safeParse({ type: "play-invite", payload: { targetUserId: "u2", game: "chess" } }).success).toBe(false);
    const big = { k: "state", s: "x".repeat(PLAY_DATA_MAX_CHARS) };
    expect(ClientMessage.safeParse({ type: "play-data", payload: { targetUserId: "u1", data: big } }).success).toBe(false);
  });

  test("the TV only takes YouTube video ids and sensible start times", () => {
    const play = ClientMessage.safeParse({ type: "tv", payload: { action: "play", videoId: "arj7oStGLkU" } });
    expect(play.success).toBe(true);
    if (play.success && play.data.type === "tv" && play.data.payload.action === "play") expect(play.data.payload.start).toBe(0);
    expect(ClientMessage.safeParse({ type: "tv", payload: { action: "play", videoId: "<script>" } }).success).toBe(false);
    expect(ClientMessage.safeParse({ type: "tv", payload: { action: "play", videoId: "arj7oStGLkU", start: -3 } }).success).toBe(false);
    expect(ClientMessage.safeParse({ type: "tv", payload: { action: "stop" } }).success).toBe(true);
    expect(ClientMessage.safeParse({ type: "tv", payload: { action: "pause" } }).success).toBe(true);
    expect(ClientMessage.safeParse({ type: "tv", payload: { action: "resume" } }).success).toBe(true);
    expect(ClientMessage.safeParse({ type: "tv", payload: { action: "rewind" } }).success).toBe(false);
  });

  test("server broadcasts for play and the TV parse on the client", () => {
    expect(ServerMessage.safeParse({ type: "play-invite", payload: { fromUserId: "u1", game: "snake", at: 1 } }).success).toBe(true);
    expect(ServerMessage.safeParse({ type: "play-invite", payload: { fromUserId: "u1", game: "tetris", at: 1 } }).success).toBe(true);
    expect(ServerMessage.safeParse({ type: "tv", payload: { state: { videoId: "arj7oStGLkU", position: 12.5, byUserId: "u1" }, at: 1 } }).success).toBe(true);
    expect(ServerMessage.safeParse({ type: "tv", payload: { state: null, at: 1 } }).success).toBe(true);
  });
});
