import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import axios from "axios";
import { startServer } from "../../index";

const PORT = 4010;
const HTTP_URL = `http://localhost:${PORT}`;
const WS_URL = `ws://localhost:${PORT}/ws`;

type JsonMessage = {
  type?: string;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
};

let server: ReturnType<typeof startServer>;

beforeAll(() => {
  server = startServer(PORT);
});

afterAll(() => {
  server.stop(true);
});

const http = axios.create({
  baseURL: HTTP_URL,
  validateStatus: () => true,
});

class TestSocket {
  private socket: WebSocket;
  private received: JsonMessage[] = [];
  private waiters: Array<(message: JsonMessage) => void> = [];

  constructor(url: string) {
    this.socket = new WebSocket(url);
    this.socket.onmessage = (event) => {
      const message = JSON.parse(event.data.toString()) as JsonMessage;
      const waiter = this.waiters.shift();

      if (waiter) {
        waiter(message);
        return;
      }

      this.received.push(message);
    };
  }

  waitForOpen(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket.onopen = () => resolve();
      this.socket.onerror = (error) => reject(error);
    });
  }

  send(message: unknown) {
    this.socket.send(JSON.stringify(message));
  }

  nextMessage(timeoutMs = 2000): Promise<JsonMessage> {
    const buffered = this.received.shift();
    if (buffered) return Promise.resolve(buffered);

    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout>;

      const resolveNext = (message: JsonMessage) => {
        clearTimeout(timer);
        resolve(message);
      };

      timer = setTimeout(() => {
        const index = this.waiters.indexOf(resolveNext);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(new Error("timed out waiting for websocket message"));
      }, timeoutMs);

      this.waiters.push(resolveNext);
    });
  }

  close() {
    this.socket.close();
  }
}

async function setupUserAndSpace(mapTemplate?: "classic-office" | "coworking-campus") {
  const email = `${crypto.randomUUID()}@test.com`;
  const password = "password123";

  await http.post("/api/v1/signup", {
    username: `ws-${crypto.randomUUID()}`,
    password,
    email,
    type: "admin",
  });

  const signin = await http.post("/api/v1/signin", { email, password });
  const token = signin.data.token as string;

  const space = await http.post(
    "/api/v1/space",
    { name: "WS Space", dimensions: "100x100", ...(mapTemplate ? { mapTemplate } : {}) },
    { headers: { Authorization: `Bearer ${token}` } },
  );

  return {
    token,
    spaceId: space.data.spaceId as string,
  };
}

describe("WebSocket", () => {
  test("connects to the websocket endpoint", async () => {
    const ws = new TestSocket(WS_URL);
    await ws.waitForOpen();
    ws.close();
  });

  describe("join", () => {
    test("returns the spawn point and current room users", async () => {
      const { token, spaceId } = await setupUserAndSpace();

      const ws = new TestSocket(WS_URL);
      await ws.waitForOpen();
      ws.send({ type: "join", payload: { spaceId, token } });

      const message = await ws.nextMessage();
      expect(message.type).toBe("space-joined");
      expect(message.payload?.userId).toBeString();
      expect(typeof message.payload?.spawn).toBe("object");
      expect(Array.isArray(message.payload?.users)).toBe(true);

      ws.close();
    });

    test("uses the selected template spawn point", async () => {
      const { token, spaceId } = await setupUserAndSpace("coworking-campus");

      const ws = new TestSocket(WS_URL);
      await ws.waitForOpen();
      ws.send({ type: "join", payload: { spaceId, token } });

      const message = await ws.nextMessage();
      expect(message.type).toBe("space-joined");
      expect(message.payload?.spawn).toEqual({ x: 25, y: 33 });

      ws.close();
    });

    test("rejects an invalid token", async () => {
      const { spaceId } = await setupUserAndSpace();

      const ws = new TestSocket(WS_URL);
      await ws.waitForOpen();
      ws.send({
        type: "join",
        payload: { spaceId, token: "not-a-real-token" },
      });

      const message = await ws.nextMessage();
      expect(message.type).toBe("error");

      ws.close();
    });

    test("notifies existing users when another user joins", async () => {
      const { token: tokenA, spaceId } = await setupUserAndSpace();
      const { token: tokenB } = await setupUserAndSpace();

      const wsA = new TestSocket(WS_URL);
      await wsA.waitForOpen();
      wsA.send({ type: "join", payload: { spaceId, token: tokenA } });
      await wsA.nextMessage();

      const wsB = new TestSocket(WS_URL);
      await wsB.waitForOpen();
      wsB.send({ type: "join", payload: { spaceId, token: tokenB } });
      await wsB.nextMessage();

      const broadcast = await wsA.nextMessage();
      expect(broadcast.type).toBe("user-join");
      expect(broadcast.payload?.userId).toBeString();
      expect(broadcast.payload?.x).toBeNumber();
      expect(broadcast.payload?.y).toBeNumber();

      wsA.close();
      wsB.close();
    });
  });

  describe("movement", () => {
    test("broadcasts a valid one-tile move to other users", async () => {
      const { token: tokenA, spaceId } = await setupUserAndSpace();
      const { token: tokenB } = await setupUserAndSpace();

      const wsA = new TestSocket(WS_URL);
      await wsA.waitForOpen();
      wsA.send({ type: "join", payload: { spaceId, token: tokenA } });
      const joinedA = await wsA.nextMessage();
      const spawn = joinedA.payload?.spawn as { x: number; y: number };

      const wsB = new TestSocket(WS_URL);
      await wsB.waitForOpen();
      wsB.send({ type: "join", payload: { spaceId, token: tokenB } });
      await wsB.nextMessage();
      await wsA.nextMessage();

      wsB.send({ type: "move", payload: { x: spawn.x + 1, y: spawn.y } });

      const movement = await wsA.nextMessage();
      expect(movement.type).toBe("movement");
      expect(movement.payload?.userId).toBeString();
      expect(movement.payload?.x).toBeNumber();
      expect(movement.payload?.y).toBeNumber();

      wsA.close();
      wsB.close();
    });

    test("rejects a teleport-sized move and returns the current position", async () => {
      const { token, spaceId } = await setupUserAndSpace();

      const ws = new TestSocket(WS_URL);
      await ws.waitForOpen();
      ws.send({ type: "join", payload: { spaceId, token } });
      const joined = await ws.nextMessage();
      const spawn = joined.payload?.spawn as { x: number; y: number };

      ws.send({ type: "move", payload: { x: spawn.x + 50, y: spawn.y + 50 } });

      const message = await ws.nextMessage();
      expect(message.type).toBe("movement-rejected");
      expect(message.payload?.x).toBe(spawn.x);
      expect(message.payload?.y).toBe(spawn.y);

      ws.close();
    });
  });

  describe("leave", () => {
    test("notifies other users when a user disconnects", async () => {
      const { token: tokenA, spaceId } = await setupUserAndSpace();
      const { token: tokenB } = await setupUserAndSpace();

      const wsA = new TestSocket(WS_URL);
      await wsA.waitForOpen();
      wsA.send({ type: "join", payload: { spaceId, token: tokenA } });
      await wsA.nextMessage();

      const wsB = new TestSocket(WS_URL);
      await wsB.waitForOpen();
      wsB.send({ type: "join", payload: { spaceId, token: tokenB } });
      await wsB.nextMessage();
      await wsA.nextMessage();

      wsB.close();

      const message = await wsA.nextMessage();
      expect(message.type).toBe("user-left");
      expect(message.payload?.userId).toBeString();

      wsA.close();
    });
  });

  describe("chat", () => {
    test("broadcasts a chat message to other users", async () => {
      const { token: tokenA, spaceId } = await setupUserAndSpace();
      const { token: tokenB } = await setupUserAndSpace();

      const wsA = new TestSocket(WS_URL);
      await wsA.waitForOpen();
      wsA.send({ type: "join", payload: { spaceId, token: tokenA } });
      await wsA.nextMessage();

      const wsB = new TestSocket(WS_URL);
      await wsB.waitForOpen();
      wsB.send({ type: "join", payload: { spaceId, token: tokenB } });
      await wsB.nextMessage();
      await wsA.nextMessage();

      wsB.send({ type: "chat", payload: { text: "hello team" } });

      const chat = await wsA.nextMessage();
      expect(chat.type).toBe("chat");
      expect(chat.payload?.text).toBe("hello team");
      expect(chat.payload?.userId).toBeString();
      expect(chat.payload?.at).toBeNumber();

      wsA.close();
      wsB.close();
    });

    test("persists chat so history can be fetched later", async () => {
      const { token: tokenA, spaceId } = await setupUserAndSpace();
      const { token: tokenB } = await setupUserAndSpace();

      const wsA = new TestSocket(WS_URL);
      await wsA.waitForOpen();
      wsA.send({ type: "join", payload: { spaceId, token: tokenA } });
      await wsA.nextMessage();

      const wsB = new TestSocket(WS_URL);
      await wsB.waitForOpen();
      wsB.send({ type: "join", payload: { spaceId, token: tokenB } });
      await wsB.nextMessage();
      await wsA.nextMessage();

      wsB.send({ type: "chat", payload: { text: "persist me" } });
      await wsA.nextMessage();

      const history = await http.get(`/api/v1/space/${spaceId}/messages`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      expect(history.status).toBe(200);
      const texts = (history.data.messages as Array<{ text: string }>).map((m) => m.text);
      expect(texts).toContain("persist me");

      wsA.close();
      wsB.close();
    });
  });

  describe("reactions", () => {
    test("broadcasts an emoji reaction to other users", async () => {
      const { token: tokenA, spaceId } = await setupUserAndSpace();
      const { token: tokenB } = await setupUserAndSpace();

      const wsA = new TestSocket(WS_URL);
      await wsA.waitForOpen();
      wsA.send({ type: "join", payload: { spaceId, token: tokenA } });
      await wsA.nextMessage();

      const wsB = new TestSocket(WS_URL);
      await wsB.waitForOpen();
      wsB.send({ type: "join", payload: { spaceId, token: tokenB } });
      await wsB.nextMessage();
      await wsA.nextMessage();

      wsB.send({ type: "reaction", payload: { emoji: "👍" } });

      const reaction = await wsA.nextMessage();
      expect(reaction.type).toBe("reaction");
      expect(reaction.payload?.emoji).toBe("👍");
      expect(reaction.payload?.userId).toBeString();

      wsA.close();
      wsB.close();
    });
  });

  describe("webrtc signaling", () => {
    test("relays a signal only to the targeted user", async () => {
      const { token: tokenA, spaceId } = await setupUserAndSpace();
      const { token: tokenB } = await setupUserAndSpace();

      const wsA = new TestSocket(WS_URL);
      await wsA.waitForOpen();
      wsA.send({ type: "join", payload: { spaceId, token: tokenA } });
      const joinedA = await wsA.nextMessage();
      const userIdA = joinedA.payload?.userId as string;

      const wsB = new TestSocket(WS_URL);
      await wsB.waitForOpen();
      wsB.send({ type: "join", payload: { spaceId, token: tokenB } });
      const joinedB = await wsB.nextMessage();
      const userIdB = joinedB.payload?.userId as string;
      await wsA.nextMessage();


      wsA.send({
        type: "webrtc-signal",
        payload: { targetUserId: userIdB, signal: { kind: "offer", sdp: "fake-sdp" } },
      });

      const signal = await wsB.nextMessage();
      expect(signal.type).toBe("webrtc-signal");
      expect(signal.payload?.fromUserId).toBe(userIdA);
      expect((signal.payload?.signal as { kind?: string })?.kind).toBe("offer");

      wsA.close();
      wsB.close();
    });
  });
});
