import { afterAll, afterEach, beforeAll, describe, expect, setSystemTime, test } from "bun:test";
import axios from "axios";
import { startServer } from "../../index";
import { PRESENCE_LEASE_MS, isUserOnline, removeUser, setUserOnline } from "./presence";
import { renewPresence } from "./ws-handler";

// Presence in Redis is a lease (presence.ts), end to end through the real server, database and
// Redis: people whose server went away without running onClose (a crash or a `bun --watch`
// restart), and a reconnect whose join overlaps the old connection's close.

type Message = { type?: string; payload?: any; [key: string]: unknown };

let server: ReturnType<typeof startServer>;
let http: ReturnType<typeof axios.create>;
let wsUrl = "";
// Ann and Ben, signed up once (hashing passwords is the slow part); each test has its own space.
let annToken = "";
let benToken = "";

beforeAll(async () => {
  server = startServer(0);
  http = axios.create({ baseURL: `http://localhost:${server.port}`, validateStatus: () => true });
  wsUrl = `ws://localhost:${server.port}/ws`;
  [annToken, benToken] = await Promise.all([signUp(), signUp()]);
}, 30_000);

afterAll(() => {
  server.stop(true);
});

// Some tests move the clock; this puts it back.
afterEach(() => {
  setSystemTime();
});

// Keeps every message. Waits are timed with performance.now(), which a moved clock doesn't touch.
class Client {
  private socket: WebSocket;
  inbox: Message[] = [];
  userId = "";
  joined: Message = {};

  constructor() {
    this.socket = new WebSocket(wsUrl);
    this.socket.onmessage = (event) => {
      this.inbox.push(JSON.parse(event.data.toString()));
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
    const until = performance.now() + timeoutMs;
    for (;;) {
      const index = this.inbox.findIndex(match);
      if (index >= 0) return this.inbox.splice(index, 1)[0]!;
      if (performance.now() > until) throw new Error("timed out waiting for a message");
      await Bun.sleep(5);
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

const left = (userId: string) => (message: Message) => message.type === "user-left" && message.payload?.userId === userId;
const arrived = (userId: string) => (message: Message) => message.type === "user-join" && message.payload?.userId === userId;
const listed = (client: Client) => (client.joined.payload?.users as { id: string }[]).map((user) => user.id);

async function signUp() {
  const email = `${crypto.randomUUID()}@test.com`;
  const password = "password123";
  await http.post("/api/v1/signup", { username: `lease-${crypto.randomUUID().slice(0, 8)}`, password, email, type: "user" });
  const signin = await http.post("/api/v1/signin", { email, password });
  return signin.data.token as string;
}

async function newSpace() {
  const space = await http.post("/api/v1/space", { name: "Lease", dimensions: "100x100" }, { headers: { Authorization: `Bearer ${annToken}` } });
  return space.data.spaceId as string;
}

async function enter(token: string, spaceId: string) {
  const client = new Client();
  await client.open();
  client.send({ type: "join", payload: { spaceId, token } });
  client.joined = await client.next((message) => message.type === "space-joined");
  client.userId = client.joined.payload.userId;
  return client;
}

// Online in Redis since `agoMs` ago, on a server that has gone away since: nobody renews their
// lease and no onClose will run for them.
async function leftBehind(spaceId: string, agoMs = 0) {
  const userId = `gone-${crypto.randomUUID()}`;
  setSystemTime(new Date(Date.now() - agoMs));
  try {
    await setUserOnline(spaceId, userId, { x: 2, y: 2 });
  } finally {
    setSystemTime();
  }
  return userId;
}

describe("people whose server went away", () => {
  test("aren't listed for people who join once their lease ran out", async () => {
    const spaceId = await newSpace();
    const justNow = await leftBehind(spaceId);
    const longAgo = await leftBehind(spaceId, PRESENCE_LEASE_MS + 1_000);

    const ann = await enter(annToken, spaceId);

    expect(listed(ann)).toContain(justNow);
    expect(listed(ann)).not.toContain(longAgo);
    expect(await isUserOnline(spaceId, longAgo)).toBe(false);
    ann.close();
  });

  test("are taken out once their lease runs out, and whoever was shown them is told they left", async () => {
    const spaceId = await newSpace();
    const gone = await leftBehind(spaceId);
    const ann = await enter(annToken, spaceId);
    expect(listed(ann)).toContain(gone);

    // Their lease runs out; Ann's is renewed, as she is connected here.
    setSystemTime(new Date(Date.now() + PRESENCE_LEASE_MS + 1_000));
    await renewPresence();
    expect(await isUserOnline(spaceId, ann.userId)).toBe(true);
    setSystemTime();

    expect(await ann.gets(left(gone))).toBe(true);
    const ben = await enter(benToken, spaceId);
    expect(listed(ben)).toEqual([ann.userId]);
    // Told once, however many renewals follow.
    await renewPresence();
    expect(await ann.gets(left(gone), 150)).toBe(false);
    ann.close();
    ben.close();
  });
});

describe("people still connected", () => {
  test("closing the tab takes them out at once", async () => {
    const spaceId = await newSpace();
    const ann = await enter(annToken, spaceId);
    const ben = await enter(benToken, spaceId);
    expect(listed(ben)).toEqual([ann.userId]);

    ben.close();

    expect(await ann.gets(left(ben.userId), 2000)).toBe(true);
    expect(await isUserOnline(spaceId, ben.userId)).toBe(false);
    ann.close();
  });

  test("whose lease went missing get it back, and others are told they are here", async () => {
    const spaceId = await newSpace();
    const ann = await enter(annToken, spaceId);
    const ben = await enter(benToken, spaceId);
    // Say their old connection on another server closed after this one joined.
    await removeUser(spaceId, ben.userId);

    await renewPresence();

    expect(await isUserOnline(spaceId, ben.userId)).toBe(true);
    expect(await ann.gets(arrived(ben.userId))).toBe(true);
    ann.close();
    ben.close();
  });

  test("a reconnect whose join overlaps the old connection's close stays in the space", async () => {
    const spaceId = await newSpace();
    const ben = await enter(benToken, spaceId);
    let ann = await enter(annToken, spaceId);

    // The old connection closes at different moments of the new one's join. When the two weren't
    // run one at a time, about one try in five left Ann connected but missing from presence, or
    // with Ben told she left after he was told she joined.
    for (let tries = 0; tries < 20; tries++) {
      const again = new Client();
      await again.open();
      again.send({ type: "join", payload: { spaceId, token: annToken } });
      await Bun.sleep(tries % 10);
      ann.close();
      await again.next((message) => message.type === "space-joined");
      // Time for the old connection's close to finish.
      await Bun.sleep(30);

      expect(await isUserOnline(spaceId, ann.userId)).toBe(true);
      const lastWord = ben.inbox.filter((message) => left(ann.userId)(message) || arrived(ann.userId)(message)).at(-1);
      expect(lastWord?.type).toBe("user-join");
      again.userId = ann.userId;
      ann = again;
    }
    ann.close();
    ben.close();
  }, 20_000);
});
