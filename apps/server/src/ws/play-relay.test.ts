import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import axios from "axios";
import { startServer } from "../../index";

// End to end over a real socket: invites, the relay between two players, and the shared TV.
// Signing up goes to the database in packages/db/.env, hence the long timeouts.

const PORT = 4011;
const http = axios.create({ baseURL: `http://localhost:${PORT}`, validateStatus: () => true });
const WS_URL = `ws://localhost:${PORT}/ws`;
const SLOW = 30_000;

type JsonMessage = { type?: string; payload?: Record<string, unknown> };

let server: ReturnType<typeof startServer>;
beforeAll(() => {
  server = startServer(PORT);
});
afterAll(() => {
  server.stop(true);
});

class TestSocket {
  private socket: WebSocket;
  private received: JsonMessage[] = [];
  private waiters: Array<(message: JsonMessage) => void> = [];

  constructor() {
    this.socket = new WebSocket(WS_URL);
    this.socket.onmessage = (event) => {
      const message = JSON.parse(event.data.toString()) as JsonMessage;
      const waiter = this.waiters.shift();
      if (waiter) waiter(message);
      else this.received.push(message);
    };
  }

  open() {
    return new Promise<void>((resolve, reject) => {
      this.socket.onopen = () => resolve();
      this.socket.onerror = (error) => reject(error);
    });
  }

  send(message: unknown) {
    this.socket.send(JSON.stringify(message));
  }

  next(timeoutMs = 3000): Promise<JsonMessage> {
    const buffered = this.received.shift();
    if (buffered) return Promise.resolve(buffered);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timed out waiting for websocket message")), timeoutMs);
      this.waiters.push((message) => {
        clearTimeout(timer);
        resolve(message);
      });
    });
  }

  close() {
    this.socket.close();
  }
}

async function signUp() {
  const email = `${crypto.randomUUID()}@test.com`;
  const password = "password123";
  await http.post("/api/v1/signup", { username: `play-${crypto.randomUUID()}`, password, email, type: "admin" });
  const signin = await http.post("/api/v1/signin", { email, password });
  return signin.data.token as string;
}

// Three people in one space; each socket has read everything sent before it returns.
async function joinThree() {
  const tokens = await Promise.all([signUp(), signUp(), signUp()]);
  const space = await http.post("/api/v1/space", { name: "Play Space", dimensions: "100x100" }, { headers: { Authorization: `Bearer ${tokens[0]}` } });
  const spaceId = space.data.spaceId as string;
  const sockets: TestSocket[] = [];
  const ids: string[] = [];
  for (const token of tokens) {
    const ws = new TestSocket();
    await ws.open();
    ws.send({ type: "join", payload: { spaceId, token } });
    ids.push((await ws.next()).payload?.userId as string);
    for (const earlier of sockets) await earlier.next(); // user-join
    sockets.push(ws);
  }
  const [a, b, c] = sockets as [TestSocket, TestSocket, TestSocket];
  const [idA, idB, idC] = ids as [string, string, string];
  return { a, b, c, idA, idB, idC };
}

describe("game room play over the socket", () => {
  test("game data only reaches the other player after they accept, and leaving ends it", async () => {
    const { a, b, c, idA, idB } = await joinThree();

    a.send({ type: "play-invite", payload: { targetUserId: idB, game: "pong" } });
    const invite = await b.next();
    expect(invite).toMatchObject({ type: "play-invite", payload: { fromUserId: idA, game: "pong" } });

    // Too early: dropped.
    a.send({ type: "play-data", payload: { targetUserId: idB, data: { k: "state", s: "early" } } });

    b.send({ type: "play-answer", payload: { targetUserId: idA, accept: true } });
    expect(await a.next()).toMatchObject({ type: "play-answer", payload: { fromUserId: idB, accept: true, game: "pong" } });

    // Someone outside the game can't send into it.
    c.send({ type: "play-data", payload: { targetUserId: idB, data: { k: "state", s: "intruder" } } });
    a.send({ type: "play-data", payload: { targetUserId: idB, data: { k: "state", s: "live" } } });
    expect(await b.next()).toMatchObject({ type: "play-data", payload: { fromUserId: idA, data: { k: "state", s: "live" } } });

    a.send({ type: "play-leave", payload: { targetUserId: idB } });
    expect(await b.next()).toMatchObject({ type: "play-leave", payload: { fromUserId: idA } });

    for (const ws of [a, b, c]) ws.close();
  }, SLOW);

  test("a table of three: the host streams to both guests, and a guest leaving tells the host", async () => {
    const { a, b, c, idA, idB, idC } = await joinThree();
    a.send({ type: "play-invite", payload: { targetUserId: idB, game: "sumo" } });
    a.send({ type: "play-invite", payload: { targetUserId: idC, game: "sumo" } });
    expect(await b.next()).toMatchObject({ type: "play-invite", payload: { fromUserId: idA, game: "sumo" } });
    expect(await c.next()).toMatchObject({ type: "play-invite", payload: { fromUserId: idA, game: "sumo" } });
    b.send({ type: "play-answer", payload: { targetUserId: idA, accept: true } });
    expect(await a.next()).toMatchObject({ type: "play-answer", payload: { fromUserId: idB, accept: true, game: "sumo" } });
    c.send({ type: "play-answer", payload: { targetUserId: idA, accept: true } });
    expect(await a.next()).toMatchObject({ type: "play-answer", payload: { fromUserId: idC, accept: true } });

    for (const [ws, id] of [[b, idB], [c, idC]] as const) {
      a.send({ type: "play-data", payload: { targetUserId: id, data: { k: "roster", ids: [idA, idB, idC] } } });
      expect(await ws.next()).toMatchObject({ type: "play-data", payload: { fromUserId: idA, data: { k: "roster" } } });
    }

    c.send({ type: "play-leave", payload: { targetUserId: idA } });
    expect(await a.next()).toMatchObject({ type: "play-leave", payload: { fromUserId: idC } });
    for (const ws of [a, b, c]) ws.close();
  }, SLOW);

  test("leaving the space ends the game for the other player", async () => {
    const { a, b, c, idA, idB } = await joinThree();
    a.send({ type: "play-invite", payload: { targetUserId: idB, game: "snake" } });
    await b.next();
    b.send({ type: "play-answer", payload: { targetUserId: idA, accept: true } });
    await a.next();

    b.close();
    const messages = [await a.next(), await a.next()].map((message) => message.type).sort();
    expect(messages).toEqual(["play-leave", "user-left"]);

    a.close();
    c.close();
  }, SLOW);

  test("the lounge TV plays the same video for everyone in the space", async () => {
    const { a, b, c, idA } = await joinThree();

    a.send({ type: "tv", payload: { action: "play", videoId: "arj7oStGLkU", start: 30 } });
    for (const ws of [a, b, c]) {
      const update = await ws.next();
      expect(update).toMatchObject({ type: "tv", payload: { state: { videoId: "arj7oStGLkU", byUserId: idA } } });
      expect((update.payload?.state as { position: number }).position).toBeGreaterThanOrEqual(30);
    }

    c.send({ type: "tv", payload: { action: "sync" } });
    expect(await c.next()).toMatchObject({ type: "tv", payload: { state: { videoId: "arj7oStGLkU" } } });

    b.send({ type: "tv", payload: { action: "stop" } });
    for (const ws of [a, b, c]) expect(await ws.next()).toMatchObject({ type: "tv", payload: { state: null } });

    for (const ws of [a, b, c]) ws.close();
  }, SLOW);
});
