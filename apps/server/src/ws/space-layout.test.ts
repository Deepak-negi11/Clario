import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import axios from "axios";
import prisma from "@repo/db";
import { getChatRoomAtPosition, getMapTemplate, MAP_TEMPLATES, type CustomMap } from "@repo/shared";
import { startServer } from "../../index";
import { mapRoomAt, mapSize, mapSpawn } from "./space-layout";

// An open grass plot: no walls or furniture, so any tile is a valid spawn.
function plot(cols: number, rows: number, extra: Partial<CustomMap> = {}): CustomMap {
  return {
    version: 1,
    cols,
    rows,
    floor: Array.from({ length: rows }, () => ".".repeat(cols)),
    walls: Array.from({ length: rows }, () => ".".repeat(cols)),
    items: [],
    rooms: [],
    spawn: { x: 1, y: 1 },
    ...extra,
  };
}

describe("space map helpers", () => {
  const layout = plot(30, 20, {
    rooms: [{ id: "den", name: "Den", bounds: { x: 2, y: 2, width: 4, height: 3 } }],
    spawn: { x: 10, y: 12 },
  });

  test("a custom space finds rooms in its layout", () => {
    const map = { mapTemplate: "custom-office", layout };
    expect(mapRoomAt(map, { x: 2, y: 2 })).toMatchObject({ id: "den", name: "Den" });
    expect(mapRoomAt(map, { x: 5, y: 4 })?.id).toBe("den");
    expect(mapRoomAt(map, { x: 6, y: 4 })).toBeNull();
    expect(mapRoomAt(map, { x: 5, y: 5 })).toBeNull();
  });

  test("spawn and size come from the layout", () => {
    const map = { mapTemplate: "custom-office", layout };
    expect(mapSpawn(map)).toEqual({ x: 10, y: 12 });
    expect(mapSize(map)).toEqual({ width: 30, height: 20 });
  });

  test("a custom space without a saved layout falls back to the template, which has no rooms", () => {
    const map = { mapTemplate: "custom-office", layout: null };
    expect(mapSpawn(map)).toEqual(getMapTemplate("custom-office").spawn);
    expect(mapSize(map)).toEqual(getMapTemplate("custom-office").dimensions);
    expect(mapRoomAt(map, { x: 3, y: 3 })).toBeNull();
  });

  test("other templates behave exactly as before", () => {
    const room = MAP_TEMPLATES["classic-office"].chatRooms[0]!;
    const inside = { x: room.bounds.x, y: room.bounds.y };
    const map = { mapTemplate: "classic-office", layout: null };
    expect(mapRoomAt(map, inside)).toEqual(getChatRoomAtPosition("classic-office", inside));
    expect(mapRoomAt(map, inside)?.id).toBe(room.id);
    expect(mapSpawn(map)).toEqual(MAP_TEMPLATES["classic-office"].spawn);
    expect(mapSize(map)).toEqual(MAP_TEMPLATES["classic-office"].dimensions);
  });
});

type JsonMessage = { type?: string; payload?: Record<string, unknown>; message?: string };

class TestSocket {
  private socket: WebSocket;
  private received: JsonMessage[] = [];
  private waiters: Array<(message: JsonMessage) => void> = [];

  constructor(url: string) {
    this.socket = new WebSocket(url);
    this.socket.onmessage = (event) => {
      const message = JSON.parse(event.data.toString()) as JsonMessage;
      const waiter = this.waiters.shift();
      if (waiter) waiter(message);
      else this.received.push(message);
    };
  }

  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket.onopen = () => resolve();
      this.socket.onerror = (error) => reject(error);
    });
  }

  send(message: unknown) {
    this.socket.send(JSON.stringify(message));
  }

  private next(timeoutMs: number): Promise<JsonMessage> {
    const buffered = this.received.shift();
    if (buffered) return Promise.resolve(buffered);
    return new Promise((resolve, reject) => {
      const done = (message: JsonMessage) => {
        clearTimeout(timer);
        resolve(message);
      };
      const timer = setTimeout(() => {
        const index = this.waiters.indexOf(done);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(new Error("timed out waiting for websocket message"));
      }, timeoutMs);
      this.waiters.push(done);
    });
  }

  // Skips messages of other types (joins, movement) that tests don't care about.
  async waitFor(type: string, timeoutMs = 2000): Promise<JsonMessage> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const message = await this.next(Math.max(1, deadline - Date.now()));
      if (message.type === type) return message;
    }
  }

  close() {
    this.socket.close();
  }
}

describe("custom-office spaces over the WebSocket", () => {
  const PORT = 4031;
  const WS_URL = `ws://localhost:${PORT}/ws`;
  const client = axios.create({ baseURL: `http://localhost:${PORT}`, validateStatus: () => true });
  let server: ReturnType<typeof startServer>;
  const userIds: string[] = [];
  const spaceIds: string[] = [];
  const sockets: TestSocket[] = [];

  async function makeUser() {
    const email = `layout-ws-${crypto.randomUUID()}@test.com`;
    const password = "password123";
    const signup = await client.post("/api/v1/signup", { username: `lws-${crypto.randomUUID().slice(0, 8)}`, password, email, type: "user" });
    const signin = await client.post("/api/v1/signin", { email, password });
    userIds.push(signup.data.userId);
    return { token: signin.data.token as string, auth: { headers: { Authorization: `Bearer ${signin.data.token}` } } };
  }

  async function customSpace(owner: Awaited<ReturnType<typeof makeUser>>, layout: CustomMap) {
    const created = await client.post("/api/v1/space", { name: "Custom", dimensions: "10x10", mapTemplate: "custom-office" }, owner.auth);
    expect(created.status).toBe(200);
    const spaceId = created.data.spaceId as string;
    spaceIds.push(spaceId);
    expect((await client.put(`/api/v1/space/${spaceId}/layout`, { layout }, owner.auth)).status).toBe(200);
    return spaceId;
  }

  async function join(spaceId: string, token: string) {
    const ws = new TestSocket(WS_URL);
    sockets.push(ws);
    await ws.open();
    ws.send({ type: "join", payload: { spaceId, token } });
    return { ws, joined: await ws.waitFor("space-joined") };
  }

  let owner: Awaited<ReturnType<typeof makeUser>>;
  let guest: Awaited<ReturnType<typeof makeUser>>;

  beforeAll(async () => {
    server = startServer(PORT);
    owner = await makeUser();
    guest = await makeUser();
  });

  afterAll(async () => {
    for (const ws of sockets) ws.close();
    await Bun.sleep(100);
    await prisma.chatMessage.deleteMany({ where: { spaceId: { in: spaceIds } } });
    await prisma.space.deleteMany({ where: { id: { in: spaceIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    server.stop(true);
  });

  // Spawn on the right edge of a 30-wide plot, inside the "Nook" room.
  const nookLayout = plot(30, 20, {
    rooms: [{ id: "nook", name: "Nook", bounds: { x: 25, y: 8, width: 5, height: 5 } }],
    spawn: { x: 29, y: 10 },
  });

  test("joining uses the layout's spawn", async () => {
    const spaceId = await customSpace(owner, nookLayout);
    const { joined } = await join(spaceId, owner.token);
    expect(joined.payload?.spawn).toEqual({ x: 29, y: 10 });
  });

  test("moves are bounded by the layout's size, not the template's", async () => {
    const spaceId = await customSpace(owner, nookLayout);
    const { ws } = await join(spaceId, owner.token);
    const { ws: guestWs } = await join(spaceId, guest.token);

    // x = 30 is inside the 48-wide template but off this 30-wide layout.
    ws.send({ type: "move", payload: { x: 30, y: 10 } });
    expect((await ws.waitFor("movement-rejected")).payload).toEqual({ x: 29, y: 10 });

    ws.send({ type: "move", payload: { x: 28, y: 10 } });
    expect((await guestWs.waitFor("movement")).payload).toMatchObject({ x: 28, y: 10 });
  });

  test("room chat and its history use the layout's rooms", async () => {
    const spaceId = await customSpace(owner, nookLayout);
    const { ws } = await join(spaceId, owner.token);
    const { ws: guestWs } = await join(spaceId, guest.token);

    ws.send({ type: "chat", payload: { text: "nook only", scope: "room" } });
    const chat = await guestWs.waitFor("chat");
    expect(chat.payload).toMatchObject({ text: "nook only", scope: "room", roomId: "nook", roomName: "Nook" });

    const history = await client.get(`/api/v1/space/${spaceId}/messages?scope=room&roomId=nook`, guest.auth);
    expect(history.status).toBe(200);
    expect(history.data.messages).toEqual([expect.objectContaining({ text: "nook only", roomId: "nook", roomName: "Nook" })]);
  });

  test("saving tells everyone in the space and the new rooms apply straight away", async () => {
    const spaceId = await customSpace(owner, plot(30, 20, { spawn: { x: 29, y: 10 } }));
    const { ws } = await join(spaceId, owner.token);
    const { ws: guestWs } = await join(spaceId, guest.token);

    guestWs.send({ type: "chat", payload: { text: "anyone?", scope: "room" } });
    expect((await guestWs.waitFor("error")).message).toBe("Enter a room to use room chat");

    expect((await client.put(`/api/v1/space/${spaceId}/layout`, { layout: nookLayout }, owner.auth)).data).toEqual({ ok: true });
    expect((await ws.waitFor("layout-updated")).payload).toEqual({ layout: nookLayout });
    expect((await guestWs.waitFor("layout-updated")).payload).toEqual({ layout: nookLayout });

    guestWs.send({ type: "chat", payload: { text: "in the nook now", scope: "room" } });
    expect((await ws.waitFor("chat")).payload).toMatchObject({ text: "in the nook now", roomId: "nook" });
  });
});
