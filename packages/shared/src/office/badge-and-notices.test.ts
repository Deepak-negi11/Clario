import { describe, expect, test } from "bun:test";
import { ClientMessage, ServerMessage } from "../ws/ws.schema";
import { ATTENDANCE_LOOKBACK_MS, type AttendanceEntry } from "../ws/badge.schema";
import { NOTICE_BODY_MAX, NOTICE_LIST_MAX, NOTICE_TITLE_MAX, NoticeMessage, cleanBody, cleanLine, type NoticePost } from "../ws/notice.schema";
import { clampSince, clockTime, latestVisits, mergeAttendance, startOfDay, summarizeDay } from "./attendance";
import { countVotes, pollCloseRefusal, pollOpen, sortNotices, unreadNotices, upsertNotice, voteShares } from "./notice-board";

const visit = (id: string, userId: string, inAt: number, outAt: number | null = null): AttendanceEntry => ({ id, userId, name: userId, inAt, outAt });

const post = (id: string, extra: Partial<NoticePost> = {}): NoticePost => ({
  id, kind: "announcement", authorId: "ann", authorName: "Ann", title: "Hi", body: "", pinned: false,
  options: [], votes: [], closesAt: null, createdAt: 1, editedAt: null, ...extra,
});

describe("badge reader messages", () => {
  test("accepts in, out and today, and nothing else", () => {
    for (const payload of [{ action: "in" }, { action: "out" }, { action: "today", since: 1_700_000_000_000 }]) {
      expect(ClientMessage.safeParse({ type: "badge", payload }).success).toBe(true);
    }
    for (const payload of [{ action: "today" }, { action: "today", since: -1 }, { action: "visit" }]) {
      expect(ClientMessage.safeParse({ type: "badge", payload }).success).toBe(false);
    }
    // Nobody can badge someone else in: the server only uses the sender's own id.
    const parsed = ClientMessage.parse({ type: "badge", payload: { action: "in", userId: "someone-else" } });
    expect(parsed.payload).toEqual({ action: "in" });
  });

  test("broadcasts carry only who, when in and when out", () => {
    const entry = { ...visit("v1", "u1", 10), email: "a@b.c" };
    const parsed = ServerMessage.parse({ type: "badge", payload: { event: "in", entry, fresh: true } });
    expect(parsed.type === "badge" && parsed.payload.event === "in" && parsed.payload.entry).toEqual(visit("v1", "u1", 10));
    expect(ServerMessage.safeParse({ type: "badge", payload: { event: "today", since: 0, entries: [visit("v1", "u1", 10, 20)] } }).success).toBe(true);
  });
});

describe("attendance helpers", () => {
  test("a day starts at local midnight, and the server never looks back further than two days", () => {
    const now = new Date(2026, 10, 2, 9, 42).getTime();
    expect(startOfDay(now)).toBe(new Date(2026, 10, 2).getTime());
    expect(clampSince(0, now)).toBe(now - ATTENDANCE_LOOKBACK_MS);
    expect(clampSince(now + 5000, now)).toBe(now);
    expect(clockTime(now)).toBe("9:42");
    expect(clockTime(new Date(2026, 10, 2, 14, 5).getTime())).toBe("14:05");
  });

  test("merging keeps one copy of each visit, in arrival order", () => {
    let entries: AttendanceEntry[] = [];
    entries = mergeAttendance(entries, visit("b", "u2", 20));
    entries = mergeAttendance(entries, visit("a", "u1", 10));
    entries = mergeAttendance(entries, visit("b", "u2", 20, 30));
    expect(entries).toEqual([visit("a", "u1", 10), visit("b", "u2", 20, 30)]);
  });

  test("the latest visit decides whether someone is in", () => {
    const latest = latestVisits([visit("1", "u1", 10, 15), visit("2", "u1", 20), visit("3", "u2", 12, 18)]);
    expect(latest.u1?.outAt).toBeNull();
    expect(latest.u2?.outAt).toBe(18);
  });

  test("the day summary shows first arrival and last departure per person", () => {
    const rows = summarizeDay([visit("1", "u1", 10, 15), visit("2", "u2", 12, 18), visit("3", "u1", 20, 25), visit("4", "u2", 30)]);
    expect(rows).toEqual([
      { userId: "u1", name: "u1", firstIn: 10, lastOut: 25, visits: 2 },
      { userId: "u2", name: "u2", firstIn: 12, lastOut: null, visits: 2 },
    ]);
  });
});

describe("notice board messages", () => {
  test("titles become one clean line and bodies keep their line breaks", () => {
    expect(cleanLine("  Team\n lunch ‮on Friday ")).toBe("Team lunch on Friday");
    expect(cleanBody("Line one\r\n\r\n\r\n\r\nLine two\u0007  \n")).toBe("Line one\n\nLine two");
    const parsed = NoticeMessage.parse({ type: "notice", payload: { action: "announce", title: " <b>Hello</b> ", body: "x" } });
    // HTML stays as text: the page never renders it as markup.
    expect(parsed.payload).toEqual({ action: "announce", title: "<b>Hello</b>", body: "x", pinned: false });
  });

  test("limits lengths, and refuses empty titles", () => {
    const announce = (title: string, body = "") => ClientMessage.safeParse({ type: "notice", payload: { action: "announce", title, body } }).success;
    expect(announce("a".repeat(NOTICE_TITLE_MAX))).toBe(true);
    expect(announce("a".repeat(NOTICE_TITLE_MAX + 1))).toBe(false);
    expect(announce("   \n ")).toBe(false);
    expect(announce("ok", "b".repeat(NOTICE_BODY_MAX))).toBe(true);
    expect(announce("ok", "b".repeat(NOTICE_BODY_MAX + 1))).toBe(false);
  });

  test("polls need 2 to 5 different options", () => {
    const poll = (options: string[]) => ClientMessage.safeParse({ type: "notice", payload: { action: "poll", title: "Lunch?", options } }).success;
    expect(poll(["Pizza", "Dosa"])).toBe(true);
    expect(poll(["A", "B", "C", "D", "E"])).toBe(true);
    expect(poll(["Pizza"])).toBe(false);
    expect(poll(["A", "B", "C", "D", "E", "F"])).toBe(false);
    expect(poll(["Pizza", " pizza "])).toBe(false);
    expect(poll(["Pizza", ""])).toBe(false);
  });

  test("votes name an option slot, never a person", () => {
    const vote = (option: unknown) => ClientMessage.safeParse({ type: "notice", payload: { action: "vote", postId: "p1", option } }).success;
    expect(vote(0)).toBe(true);
    expect(vote(4)).toBe(true);
    expect(vote(5)).toBe(false);
    expect(vote(-1)).toBe(false);
    expect(vote(1.5)).toBe(false);
  });

  test("the board the server sends is bounded", () => {
    const posts = Array.from({ length: NOTICE_LIST_MAX + 1 }, (_, i) => post(`p${i}`));
    expect(ServerMessage.safeParse({ type: "notice", payload: { event: "list", posts: posts.slice(1), myVotes: {} } }).success).toBe(true);
    expect(ServerMessage.safeParse({ type: "notice", payload: { event: "list", posts, myVotes: {} } }).success).toBe(false);
  });
});

describe("vote counting", () => {
  test("counts each vote once and ignores options the poll doesn't have", () => {
    expect(countVotes(3, [0, 2, 2, 5, -1, 1.5])).toEqual([1, 0, 2]);
    expect(countVotes(2, [])).toEqual([0, 0]);
  });

  test("shares are whole percentages, all zero before anyone votes", () => {
    expect(voteShares([1, 0, 2])).toEqual([33, 0, 67]);
    expect(voteShares([0, 0])).toEqual([0, 0]);
  });

  test("a poll is open until its closing time", () => {
    expect(pollOpen({ kind: "poll", closesAt: null }, 100)).toBe(true);
    expect(pollOpen({ kind: "poll", closesAt: 101 }, 100)).toBe(true);
    expect(pollOpen({ kind: "poll", closesAt: 100 }, 100)).toBe(false);
    expect(pollOpen({ kind: "announcement", closesAt: null }, 100)).toBe(false);
  });

  test("closing times must be a minute to 30 days ahead", () => {
    const now = 1_000_000;
    expect(pollCloseRefusal(null, now)).toBeNull();
    expect(pollCloseRefusal(now + 30_000, now)).not.toBeNull();
    expect(pollCloseRefusal(now + 3_600_000, now)).toBeNull();
    expect(pollCloseRefusal(now + 31 * 24 * 3_600_000, now)).not.toBeNull();
  });
});

describe("board order and unread posts", () => {
  test("pinned posts come first, then the newest", () => {
    const order = sortNotices([post("old", { createdAt: 1 }), post("new", { createdAt: 3 }), post("pin", { createdAt: 2, pinned: true })]);
    expect(order.map((p) => p.id)).toEqual(["pin", "new", "old"]);
  });

  test("an edit replaces the post instead of adding it twice", () => {
    const board = upsertNotice([post("a", { createdAt: 1 }), post("b", { createdAt: 2 })], post("a", { createdAt: 1, title: "Edited" }));
    expect(board.map((p) => [p.id, p.title])).toEqual([["b", "Hi"], ["a", "Edited"]]);
  });

  test("only other people's new posts are unread", () => {
    const board = [post("1", { createdAt: 5 }), post("2", { createdAt: 15 }), post("3", { createdAt: 20, authorId: "me" })];
    expect(unreadNotices(board, 10, "me")).toBe(1);
    expect(unreadNotices(board, 0, "me")).toBe(2);
  });
});
