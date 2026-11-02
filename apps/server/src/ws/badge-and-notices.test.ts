import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import axios from "axios";
import { startServer } from "../../index";
import { setLeaveGrace } from "./badge-handler";

// The front-door badge reader and the notice board, end to end: two people in one space, through
// the real server, database and Redis.

type Message = { type?: string; payload?: any; [key: string]: unknown };

let server: ReturnType<typeof startServer>;
let http: ReturnType<typeof axios.create>;
let wsUrl = "";

beforeAll(() => {
  server = startServer(0);
  http = axios.create({ baseURL: `http://localhost:${server.port}`, validateStatus: () => true });
  wsUrl = `ws://localhost:${server.port}/ws`;
  setLeaveGrace(150);
});

afterAll(() => {
  server.stop(true);
});

// Keeps every message, so a test can wait for the one it cares about whatever came before it.
class Client {
  private socket: WebSocket;
  private inbox: Message[] = [];
  private waiters: Array<() => void> = [];
  userId = "";

  constructor() {
    this.socket = new WebSocket(wsUrl);
    this.socket.onmessage = (event) => {
      this.inbox.push(JSON.parse(event.data.toString()));
      for (const wake of this.waiters.splice(0)) wake();
    };
  }

  open() {
    return new Promise<void>((resolve, reject) => {
      this.socket.onopen = () => resolve();
      this.socket.onerror = reject;
    });
  }

  send(message: unknown) {
    this.socket.send(JSON.stringify(message));
  }

  async next(match: (message: Message) => boolean, timeoutMs = 3000): Promise<Message> {
    const until = Date.now() + timeoutMs;
    for (;;) {
      const index = this.inbox.findIndex(match);
      if (index >= 0) return this.inbox.splice(index, 1)[0]!;
      const left = until - Date.now();
      if (left <= 0) throw new Error("timed out waiting for a message");
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, left);
        this.waiters.push(() => { clearTimeout(timer); resolve(); });
      });
    }
  }

  // Whether a matching message arrives within a short wait.
  async gets(match: (message: Message) => boolean, waitMs = 300) {
    return this.next(match, waitMs).then(() => true, () => false);
  }

  close() {
    this.socket.close();
  }
}

const badge = (event: string) => (message: Message) => message.type === "badge" && message.payload?.event === event;
const notice = (event: string) => (message: Message) => message.type === "notice" && message.payload?.event === event;

async function signUp() {
  const email = `${crypto.randomUUID()}@test.com`;
  const password = "password123";
  await http.post("/api/v1/signup", { username: `office-${crypto.randomUUID().slice(0, 8)}`, password, email, type: "user" });
  const signin = await http.post("/api/v1/signin", { email, password });
  return signin.data.token as string;
}

async function newSpace(token: string) {
  const space = await http.post("/api/v1/space", { name: "Office", dimensions: "100x100" }, { headers: { Authorization: `Bearer ${token}` } });
  return space.data.spaceId as string;
}

async function enter(token: string, spaceId: string) {
  const client = new Client();
  await client.open();
  client.send({ type: "join", payload: { spaceId, token } });
  const joined = await client.next((message) => message.type === "space-joined");
  client.userId = joined.payload.userId;
  return client;
}

async function twoPeople() {
  const [ownerToken, guestToken] = await Promise.all([signUp(), signUp()]);
  const spaceId = await newSpace(ownerToken);
  const ann = await enter(ownerToken, spaceId);
  const ben = await enter(guestToken, spaceId);
  return { spaceId, ann, ben, annToken: ownerToken, benToken: guestToken };
}

describe("badge reader", () => {
  test("badging in reaches everyone in the space, once per visit, and shows in today's list", async () => {
    const { ann, ben } = await twoPeople();
    ann.send({ type: "badge", payload: { action: "in" } });
    const mine = await ann.next(badge("in"));
    const theirs = await ben.next(badge("in"));
    expect(mine.payload.fresh).toBe(true);
    expect(theirs.payload.entry).toEqual(mine.payload.entry);
    expect(Object.keys(theirs.payload.entry).sort()).toEqual(["id", "inAt", "name", "outAt", "userId"]);
    expect(theirs.payload.entry.userId).toBe(ann.userId);
    expect(theirs.payload.entry.outAt).toBeNull();

    // A second tap while in: only Ann hears it, and it's the same visit.
    ann.send({ type: "badge", payload: { action: "in" } });
    const again = await ann.next(badge("in"));
    expect(again.payload).toMatchObject({ fresh: false, entry: { id: mine.payload.entry.id } });
    expect(await ben.gets(badge("in"))).toBe(false);

    ben.send({ type: "badge", payload: { action: "today", since: Date.now() - 60_000 } });
    const today = await ben.next(badge("today"));
    expect(today.payload.entries.map((entry: { id: string }) => entry.id)).toEqual([mine.payload.entry.id]);

    ann.send({ type: "badge", payload: { action: "out" } });
    const out = await ben.next(badge("out"));
    expect(out.payload.entry.id).toBe(mine.payload.entry.id);
    expect(out.payload.entry.outAt).toBeGreaterThanOrEqual(out.payload.entry.inAt);
    ann.close();
    ben.close();
  });

  test("closing the tab badges you out; a visit survives in the database", async () => {
    const { ann, ben, spaceId, benToken } = await twoPeople();
    ann.send({ type: "badge", payload: { action: "in" } });
    const visit = (await ben.next(badge("in"))).payload.entry;
    ann.close();
    const out = await ben.next(badge("out"));
    expect(out.payload.entry.id).toBe(visit.id);

    // Someone who comes in later still sees the visit, read back from the database.
    ben.close();
    const later = await enter(benToken, spaceId);
    later.send({ type: "badge", payload: { action: "today", since: Date.now() - 60_000 } });
    const today = await later.next(badge("today"));
    expect(today.payload.entries).toContainEqual(out.payload.entry);
    later.close();
  });

  test("people in another space don't hear about it", async () => {
    const { ann, ben } = await twoPeople();
    const outsiderToken = await signUp();
    const outsider = await enter(outsiderToken, await newSpace(outsiderToken));
    ann.send({ type: "badge", payload: { action: "in" } });
    await ben.next(badge("in"));
    expect(await outsider.gets(badge("in"))).toBe(false);
    outsider.send({ type: "badge", payload: { action: "today", since: Date.now() - 60_000 } });
    expect((await outsider.next(badge("today"))).payload.entries).toEqual([]);
    for (const client of [ann, ben, outsider]) client.close();
  });
});

describe("notice board", () => {
  test("posts reach everyone; only the author may edit or delete", async () => {
    const { ann, ben } = await twoPeople();
    ann.send({ type: "notice", payload: { action: "announce", title: "  Pizza\nFriday ", body: "<img src=x onerror=alert(1)>", pinned: true } });
    const saved = (await ben.next(notice("saved"))).payload.post;
    expect(saved).toMatchObject({ kind: "announcement", title: "Pizza Friday", body: "<img src=x onerror=alert(1)>", pinned: true, authorId: ann.userId });
    await ann.next(notice("saved"));

    ben.send({ type: "notice", payload: { action: "edit", postId: saved.id, title: "Mine now", body: "", pinned: false } });
    expect((await ben.next(notice("refused"))).payload.reason).toContain("Only the person");
    ben.send({ type: "notice", payload: { action: "delete", postId: saved.id } });
    expect((await ben.next(notice("refused"))).payload.reason).toContain("Only the person");

    ann.send({ type: "notice", payload: { action: "edit", postId: saved.id, title: "Pizza Thursday", body: "", pinned: false } });
    const edited = (await ben.next(notice("saved"))).payload.post;
    expect(edited).toMatchObject({ id: saved.id, title: "Pizza Thursday", pinned: false });
    expect(edited.editedAt).toBeNumber();

    ann.send({ type: "notice", payload: { action: "delete", postId: saved.id } });
    expect((await ben.next(notice("removed"))).payload.postId).toBe(saved.id);
    ann.close();
    ben.close();
  });

  test("one vote per person, live counts, and only you learn your own choice", async () => {
    const { ann, ben, spaceId, benToken } = await twoPeople();
    ann.send({ type: "notice", payload: { action: "poll", title: "Lunch?", options: ["Dosa", "Pizza", "Salad"] } });
    const poll = (await ben.next(notice("saved"))).payload.post;
    await ann.next(notice("saved"));
    expect(poll.votes).toEqual([0, 0, 0]);

    ben.send({ type: "notice", payload: { action: "vote", postId: poll.id, option: 1 } });
    expect((await ben.next(notice("voted"))).payload).toMatchObject({ postId: poll.id, option: 1 });
    expect((await ann.next(notice("saved"))).payload.post.votes).toEqual([0, 1, 0]);
    expect(await ann.gets(notice("voted"))).toBe(false);

    // Voting again moves the vote; it doesn't add one.
    ben.send({ type: "notice", payload: { action: "vote", postId: poll.id, option: 2 } });
    expect((await ann.next(notice("saved"))).payload.post.votes).toEqual([0, 0, 1]);
    ann.send({ type: "notice", payload: { action: "vote", postId: poll.id, option: 2 } });
    expect((await ben.next((m) => notice("saved")(m) && m.payload.post.votes[2] === 2)).payload.post.votes).toEqual([0, 0, 2]);

    ben.send({ type: "notice", payload: { action: "vote", postId: poll.id, option: 4 } });
    expect((await ben.next(notice("refused"))).payload.reason).toContain("isn't in the poll");

    // Read back from the database after leaving: the board, and Ben's own vote.
    ben.close();
    const back = await enter(benToken, spaceId);
    back.send({ type: "notice", payload: { action: "list" } });
    const board = (await back.next(notice("list"))).payload;
    expect(board.posts.find((post: { id: string }) => post.id === poll.id).votes).toEqual([0, 0, 2]);
    expect(board.myVotes).toEqual({ [poll.id]: 2 });
    ann.close();
    back.close();
  });

  test("polls can't close in the past, and posting is rate-limited", async () => {
    const { ann, ben } = await twoPeople();
    ann.send({ type: "notice", payload: { action: "poll", title: "Late?", options: ["Yes", "No"], closesAt: Date.now() - 1000 } });
    expect((await ann.next(notice("refused"))).payload.reason).toContain("closing time");
    // That refusal counted as one of Ann's five posts this minute.
    for (let i = 0; i < 4; i++) {
      ann.send({ type: "notice", payload: { action: "announce", title: `Note ${i}`, body: "" } });
      await ann.next(notice("saved"));
    }
    ann.send({ type: "notice", payload: { action: "announce", title: "One too many", body: "" } });
    expect((await ann.next(notice("refused"))).payload.reason).toContain("posting a lot");
    ann.close();
    ben.close();
  });
});
