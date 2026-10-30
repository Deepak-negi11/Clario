import { describe, expect, test } from "bun:test";
import {
  allowPlayMessage, answerPlay, arePlaying, forgetPlay, forgetSpacePlay, INVITE_TTL_MS, invitePlay, leavePlay,
  PLAY_MESSAGES_PER_SECOND, pauseTv, setTv, TABLE_SEATS, TV_CHANGE_EVERY_MS, tvState,
} from "./play";

const space = () => `space-${crypto.randomUUID()}`;
const user = () => `user-${crypto.randomUUID()}`;

describe("game room tables", () => {
  test("game traffic only flows after someone accepts, and only within the table", () => {
    const s = space();
    expect(invitePlay(s, "host", "b", "pong").ok).toBe(true);
    expect(arePlaying(s, "host", "b")).toBe(false);
    expect(answerPlay(s, "b", "host", true)).toMatchObject({ game: "pong", players: ["host", "b"] });
    expect(arePlaying(s, "host", "b")).toBe(true);
    expect(arePlaying(s, "b", "host")).toBe(true);
    expect(arePlaying(s, "host", "c")).toBe(false);
  });

  test("a table seats four: the host and three guests", () => {
    const s = space();
    for (const guest of ["b", "c", "d"]) {
      invitePlay(s, "host", guest, "sumo");
      answerPlay(s, guest, "host", true);
    }
    expect(arePlaying(s, "b", "d")).toBe(true);
    expect(invitePlay(s, "host", "e", "sumo").ok).toBe(false);
    expect(TABLE_SEATS).toBe(4);
  });

  test("an invite still out when the table fills can't take a seat", () => {
    const s = space();
    for (const guest of ["b", "c", "d", "e"]) invitePlay(s, "host", guest, "snake");
    for (const guest of ["b", "c", "d"]) answerPlay(s, guest, "host", true);
    expect(answerPlay(s, "e", "host", true)).toBe(false);
  });

  test("only the invited person can answer, once, and a no seats nobody", () => {
    const s = space();
    invitePlay(s, "host", "b", "snake");
    expect(answerPlay(s, "c", "host", true)).toBe(false);
    expect(answerPlay(s, "b", "host", false)).toBe(null);
    expect(answerPlay(s, "b", "host", true)).toBe(false);
    expect(arePlaying(s, "host", "b")).toBe(false);
  });

  test("old invites expire", () => {
    const s = space();
    invitePlay(s, "host", "b", "pong", 0);
    expect(answerPlay(s, "b", "host", true, INVITE_TTL_MS + 1)).toBe(false);
  });

  test("the game is fixed once someone has sat down", () => {
    const s = space();
    invitePlay(s, "host", "b", "pong");
    invitePlay(s, "host", "c", "snake");
    expect(answerPlay(s, "b", "host", true)).toMatchObject({ game: "snake" });
    invitePlay(s, "host", "d", "breakout");
    expect(answerPlay(s, "d", "host", true)).toMatchObject({ game: "snake" });
  });

  test("joining another table leaves the old one, and its host is told", () => {
    const s = space();
    invitePlay(s, "a", "b", "pong");
    answerPlay(s, "b", "a", true);
    invitePlay(s, "c", "b", "snake");
    const joined = answerPlay(s, "b", "c", true);
    expect(joined && joined.notify).toEqual(["a"]);
    expect(arePlaying(s, "a", "b")).toBe(false);
    expect(arePlaying(s, "c", "b")).toBe(true);
  });

  test("leaving: a guest goes, a host lets someone go, and leaving the space tells everyone", () => {
    const s = space();
    invitePlay(s, "host", "b", "sumo");
    answerPlay(s, "b", "host", true);
    invitePlay(s, "host", "c", "sumo");
    answerPlay(s, "c", "host", true);
    expect(leavePlay(s, "b", "host")).toBe(true);
    expect(arePlaying(s, "host", "b")).toBe(false);
    expect(arePlaying(s, "host", "c")).toBe(true);
    expect(leavePlay(s, "host", "c")).toBe(true);
    expect(arePlaying(s, "host", "c")).toBe(false);
    expect(leavePlay(s, "host", "c")).toBe(false);

    invitePlay(s, "host", "b", "sumo");
    answerPlay(s, "b", "host", true);
    invitePlay(s, "host", "d", "sumo");
    expect(forgetPlay(s, "host").sort()).toEqual(["b", "d"]);
    expect(arePlaying(s, "host", "b")).toBe(false);
  });

  test("game traffic is capped per second for each pair", () => {
    const a = user();
    for (let i = 0; i < PLAY_MESSAGES_PER_SECOND; i++) expect(allowPlayMessage(a, "b", 1_000)).toBe(true);
    expect(allowPlayMessage(a, "b", 1_500)).toBe(false);
    // The host streaming to a second guest has its own budget.
    expect(allowPlayMessage(a, "c", 1_500)).toBe(true);
    expect(allowPlayMessage(a, "b", 2_000)).toBe(true);
  });
});

describe("lounge tv", () => {
  test("everyone gets the same video at the same point", () => {
    const s = space();
    const u = user();
    expect(tvState(s)).toBeNull();
    expect(setTv(s, u, { videoId: "arj7oStGLkU", start: 30 }, 10_000)).toBe(true);
    expect(tvState(s, 25_000)).toEqual({ videoId: "arj7oStGLkU", position: 45, byUserId: u, paused: false });
  });

  test("pausing holds the picture for everyone, and resuming carries on from there", () => {
    const s = space();
    const owner = user();
    const other = user();
    setTv(s, owner, { videoId: "arj7oStGLkU", start: 10 }, 0);
    expect(pauseTv(s, other, true, 5_000)).toBe(true);
    expect(tvState(s, 60_000)).toMatchObject({ position: 15, paused: true });
    expect(pauseTv(s, other, true, 61_000)).toBe(false); // already paused
    expect(pauseTv(s, other, false, 62_000)).toBe(true);
    expect(tvState(s, 72_000)).toMatchObject({ position: 25, paused: false, byUserId: owner });
    expect(pauseTv(space(), other, true, 80_000)).toBe(false); // nothing on
  });

  test("one person can't flip channels faster than the limit; off clears it", () => {
    const s = space();
    const u = user();
    setTv(s, u, { videoId: "arj7oStGLkU", start: 0 }, 0);
    expect(setTv(s, u, null, TV_CHANGE_EVERY_MS - 1)).toBe(false);
    expect(tvState(s, TV_CHANGE_EVERY_MS)).not.toBeNull();
    expect(setTv(s, u, null, TV_CHANGE_EVERY_MS)).toBe(true);
    expect(tvState(s, TV_CHANGE_EVERY_MS)).toBeNull();
  });

  test("the TV goes off when the space empties", () => {
    const s = space();
    setTv(s, user(), { videoId: "arj7oStGLkU", start: 0 }, 0);
    forgetSpacePlay(s);
    expect(tvState(s)).toBeNull();
  });
});
