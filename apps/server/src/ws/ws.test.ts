import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import axios from "axios";
import { createDmKeyPair, decryptDm, deriveDmKey, encryptDm } from "@repo/shared";
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

    test("accepts steps sent back to back, each from the one before", async () => {
      const { token: tokenA, spaceId } = await setupUserAndSpace();
      const { token: tokenB } = await setupUserAndSpace();

      const wsA = new TestSocket(WS_URL);
      await wsA.waitForOpen();
      wsA.send({ type: "join", payload: { spaceId, token: tokenA } });
      const spawn = (await wsA.nextMessage()).payload?.spawn as { x: number; y: number };

      const wsB = new TestSocket(WS_URL);
      await wsB.waitForOpen();
      wsB.send({ type: "join", payload: { spaceId, token: tokenB } });
      await wsB.nextMessage();
      await wsA.nextMessage();

      // A walk along a path sends its steps faster than the server answers them.
      for (let step = 1; step <= 4; step++) wsB.send({ type: "move", payload: { x: spawn.x + step, y: spawn.y } });

      const seen: number[] = [];
      for (let step = 1; step <= 4; step++) {
        const movement = await wsA.nextMessage();
        expect(movement.type).toBe("movement");
        seen.push(movement.payload?.x as number);
      }
      expect(seen).toEqual([1, 2, 3, 4].map((step) => spawn.x + step));
      await expect(wsB.nextMessage(300)).rejects.toThrow("timed out");

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

  describe("props", () => {
    test("shares a bike ride, keeps each bike to one rider and tells late joiners", async () => {
      const { token: tokenA, spaceId } = await setupUserAndSpace();
      const { token: tokenB } = await setupUserAndSpace();
      const { token: tokenC } = await setupUserAndSpace();

      const wsA = new TestSocket(WS_URL);
      await wsA.waitForOpen();
      wsA.send({ type: "join", payload: { spaceId, token: tokenA } });
      const userA = (await wsA.nextMessage()).payload?.userId;

      const wsB = new TestSocket(WS_URL);
      await wsB.waitForOpen();
      wsB.send({ type: "join", payload: { spaceId, token: tokenB } });
      const userB = (await wsB.nextMessage()).payload?.userId;
      await wsA.nextMessage();

      wsA.send({ type: "prop", payload: { prop: { kind: "bike", bike: "orange" } } });
      const ride = await wsB.nextMessage();
      expect(ride).toEqual({ type: "prop", payload: { userId: userA, prop: { kind: "bike", bike: "orange" } } });

      // The orange bike is taken: B gets their own prop (none) back, and A hears nothing.
      wsB.send({ type: "prop", payload: { prop: { kind: "bike", bike: "orange" } } });
      expect(await wsB.nextMessage()).toEqual({ type: "prop", payload: { userId: userB, prop: null } });
      await expect(wsA.nextMessage(300)).rejects.toThrow("timed out");

      wsB.send({ type: "prop", payload: { prop: { kind: "can", drink: "lime", sips: 1 } } });
      expect((await wsA.nextMessage()).payload?.prop).toEqual({ kind: "can", drink: "lime", sips: 1 });

      const wsC = new TestSocket(WS_URL);
      await wsC.waitForOpen();
      wsC.send({ type: "join", payload: { spaceId, token: tokenC } });
      const users = (await wsC.nextMessage()).payload?.users as { id: string; prop?: unknown }[];
      expect(users.find((user) => user.id === userA)?.prop).toEqual({ kind: "bike", bike: "orange" });
      expect(users.find((user) => user.id === userB)?.prop).toEqual({ kind: "can", drink: "lime", sips: 1 });

      wsA.close();
      wsB.close();
      wsC.close();
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

  describe("direct chat", () => {
    async function joinThree() {
      const { token: tokenA, spaceId } = await setupUserAndSpace();
      const { token: tokenB } = await setupUserAndSpace();
      const { token: tokenC } = await setupUserAndSpace();

      const sockets: TestSocket[] = [];
      const ids: string[] = [];
      for (const token of [tokenA, tokenB, tokenC]) {
        const ws = new TestSocket(WS_URL);
        await ws.waitForOpen();
        ws.send({ type: "join", payload: { spaceId, token } });
        const joined = await ws.nextMessage();
        ids.push(joined.payload?.userId as string);
        // Everyone already inside hears this join.
        for (const earlier of sockets) await earlier.nextMessage();
        sockets.push(ws);
      }
      const [wsA, wsB, wsC] = sockets as [TestSocket, TestSocket, TestSocket];
      const [userIdA, userIdB] = ids as [string, string, string];
      return { wsA, wsB, wsC, userIdA, userIdB };
    }

    test("a private message needs an accepted request, reaches only that person, and is only ciphertext", async () => {
      const { wsA, wsB, wsC, userIdA, userIdB } = await joinThree();
      const keysA = await createDmKeyPair();
      const keysB = await createDmKeyPair();

      const tooEarly = await encryptDm(await deriveDmKey(keysA, userIdA, keysB.publicKey, userIdB), "too early", {
        fromUserId: userIdA, toUserId: userIdB, seq: 0,
      });
      wsA.send({ type: "dm", payload: { targetUserId: userIdB, seq: 0, ...tooEarly } });
      const early = await wsA.nextMessage();
      expect(early.type).toBe("error");

      wsA.send({ type: "dm-request", payload: { targetUserId: userIdB, publicKey: keysA.publicKey } });
      const request = await wsB.nextMessage();
      expect(request.type).toBe("dm-request");
      expect(request.payload?.fromUserId).toBe(userIdA);
      expect(request.payload?.publicKey).toBe(keysA.publicKey);

      wsB.send({ type: "dm-response", payload: { targetUserId: userIdA, accept: true, publicKey: keysB.publicKey } });
      const response = await wsA.nextMessage();
      expect(response.type).toBe("dm-response");
      expect(response.payload?.fromUserId).toBe(userIdB);
      expect(response.payload?.accept).toBe(true);
      expect(response.payload?.publicKey).toBe(keysB.publicKey);

      const keyA = await deriveDmKey(keysA, userIdA, keysB.publicKey, userIdB);
      const keyB = await deriveDmKey(keysB, userIdB, keysA.publicKey, userIdA);
      const context = { fromUserId: userIdA, toUserId: userIdB, seq: 1 };
      const sealed = await encryptDm(keyA, "hi there", context);
      // A plain `text` sent along is dropped by the schema, never relayed.
      wsA.send({ type: "dm", payload: { targetUserId: userIdB, seq: 1, ...sealed, text: "hi there" } });
      const dm = await wsB.nextMessage();
      expect(dm.type).toBe("dm");
      expect(dm.payload?.fromUserId).toBe(userIdA);
      expect(Object.keys(dm.payload ?? {}).sort()).toEqual(["at", "ciphertext", "fromUserId", "iv", "seq"]);
      expect(JSON.stringify(dm)).not.toContain("hi there");
      expect(await decryptDm(keyB, { iv: dm.payload?.iv as string, ciphertext: dm.payload?.ciphertext as string }, context))
        .toBe("hi there");

      // The third person in the space got none of the request, the answer or the message.
      await expect(wsC.nextMessage(300)).rejects.toThrow();

      wsA.close();
      wsB.close();
      wsC.close();
    });

    test("asking again during an open chat passes the new key on and pauses messages until accepted", async () => {
      const { wsA, wsB, wsC, userIdA, userIdB } = await joinThree();
      const first = await createDmKeyPair();
      const second = await createDmKeyPair();
      const keysB = await createDmKeyPair();

      wsA.send({ type: "dm-request", payload: { targetUserId: userIdB, publicKey: first.publicKey } });
      await wsB.nextMessage();
      wsB.send({ type: "dm-response", payload: { targetUserId: userIdA, accept: true, publicKey: keysB.publicKey } });
      await wsA.nextMessage();

      // A reloaded and lost its keys, so it asks again with new ones.
      wsA.send({ type: "dm-request", payload: { targetUserId: userIdB, publicKey: second.publicKey } });
      const again = await wsB.nextMessage();
      expect(again.type).toBe("dm-request");
      expect(again.payload?.publicKey).toBe(second.publicKey);

      const sealed = await encryptDm(await deriveDmKey(keysB, userIdB, first.publicKey, userIdA), "old key", {
        fromUserId: userIdB, toUserId: userIdA, seq: 5,
      });
      wsB.send({ type: "dm", payload: { targetUserId: userIdA, seq: 5, ...sealed } });
      expect((await wsB.nextMessage()).type).toBe("error");
      await expect(wsC.nextMessage(300)).rejects.toThrow();

      wsA.close();
      wsB.close();
      wsC.close();
    });

    test("a declined request tells the asker and blocks messages", async () => {
      const { wsA, wsB, wsC, userIdA, userIdB } = await joinThree();
      const keysA = await createDmKeyPair();

      wsA.send({ type: "dm-request", payload: { targetUserId: userIdB, publicKey: keysA.publicKey } });
      await wsB.nextMessage();
      wsB.send({ type: "dm-response", payload: { targetUserId: userIdA, accept: false } });
      const response = await wsA.nextMessage();
      expect(response.type).toBe("dm-response");
      expect(response.payload?.accept).toBe(false);
      expect(response.payload?.publicKey).toBeUndefined();

      const sealed = { iv: "AAAAAAAAAAAAAAAA", ciphertext: "A".repeat(24) };
      wsA.send({ type: "dm", payload: { targetUserId: userIdB, seq: 0, ...sealed } });
      expect((await wsA.nextMessage()).type).toBe("error");
      await expect(wsB.nextMessage(300)).rejects.toThrow();

      wsA.close();
      wsB.close();
      wsC.close();
    });
  });
});
