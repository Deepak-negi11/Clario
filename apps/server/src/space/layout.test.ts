import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import axios from "axios";
import prisma from "@repo/db";
import { createStarterMap, type CustomMap } from "@repo/shared";
import { startServer } from "../../index";
import { MAX_LAYOUT_BODY_BYTES } from "./layout";

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

describe("Space layout routes", () => {
  const PORT = 4030;
  const BASE_URL = `http://localhost:${PORT}`;
  const client = axios.create({ baseURL: BASE_URL, validateStatus: () => true });
  let server: ReturnType<typeof startServer>;
  const userIds: string[] = [];
  const spaceIds: string[] = [];

  async function makeUser() {
    const email = `layout-${crypto.randomUUID()}@test.com`;
    const password = "password123";
    const signup = await client.post("/api/v1/signup", { username: `layout-${crypto.randomUUID().slice(0, 8)}`, password, email, type: "user" });
    const signin = await client.post("/api/v1/signin", { email, password });
    userIds.push(signup.data.userId);
    return { userId: signup.data.userId as string, auth: { headers: { Authorization: `Bearer ${signin.data.token}` } } };
  }

  async function makeSpace(user: Awaited<ReturnType<typeof makeUser>>, mapTemplate: string) {
    const created = await client.post("/api/v1/space", { name: "Layout test", dimensions: "10x10", mapTemplate }, user.auth);
    expect(created.status).toBe(200);
    spaceIds.push(created.data.spaceId);
    return created.data.spaceId as string;
  }

  let owner: Awaited<ReturnType<typeof makeUser>>;
  let other: Awaited<ReturnType<typeof makeUser>>;
  let customId = "";
  let classicId = "";
  const layoutPath = (spaceId: string) => `/api/v1/space/${spaceId}/layout`;

  beforeAll(async () => {
    server = startServer(PORT);
    owner = await makeUser();
    other = await makeUser();
    customId = await makeSpace(owner, "custom-office");
    classicId = await makeSpace(owner, "classic-office");
  });

  afterAll(async () => {
    await prisma.space.deleteMany({ where: { id: { in: spaceIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    server.stop(true);
  });

  test("a new custom-office space starts on the starter plot, sized to it", async () => {
    const mine = await client.get(layoutPath(customId), owner.auth);
    expect(mine.status).toBe(200);
    expect(mine.data).toEqual({ layout: createStarterMap(), canEdit: true });

    const theirs = await client.get(layoutPath(customId), other.auth);
    expect(theirs.data).toEqual({ layout: createStarterMap(), canEdit: false });

    expect((await client.get(`/api/v1/space/${customId}`, owner.auth)).data.dimensions).toBe("48x36");
  });

  test("template spaces have no layout and can't take one", async () => {
    expect((await client.get(layoutPath(classicId), owner.auth)).data).toEqual({ layout: null, canEdit: false });
    const put = await client.put(layoutPath(classicId), { layout: plot(30, 20) }, owner.auth);
    expect(put.status).toBe(400);
    expect(await prisma.space.findUnique({ where: { id: classicId }, select: { layout: true } })).toEqual({ layout: null });
  });

  test("needs a token, and unknown spaces are 404", async () => {
    expect((await client.get(layoutPath(customId))).status).toBe(403);
    expect((await client.put(layoutPath(customId), { layout: plot(30, 20) })).status).toBe(403);
    expect((await client.get(layoutPath("no-such-space"), owner.auth)).status).toBe(404);
    expect((await client.put(layoutPath("no-such-space"), { layout: plot(30, 20) }, owner.auth)).status).toBe(404);
  });

  test("only the owner can save", async () => {
    const put = await client.put(layoutPath(customId), { layout: plot(30, 20) }, other.auth);
    expect(put.status).toBe(403);
    expect((await client.get(layoutPath(customId), owner.auth)).data.layout).toEqual(createStarterMap());
  });

  test("the owner saves a valid layout, and the space takes its size", async () => {
    const layout = plot(30, 20, {
      floor: Array.from({ length: 20 }, (_, y) => (y < 5 ? "w".repeat(30) : ".".repeat(30))),
      items: [{ kind: "desk-l", x: 5, y: 2 }],
      rooms: [{ id: "den", name: "Den", bounds: { x: 0, y: 0, width: 10, height: 5 } }],
      spawn: { x: 15, y: 15 },
    });
    const put = await client.put(layoutPath(customId), { layout }, owner.auth);
    expect(put.status).toBe(200);
    expect(put.data).toEqual({ ok: true });

    expect((await client.get(layoutPath(customId), other.auth)).data).toEqual({ layout, canEdit: false });
    expect((await client.get(`/api/v1/space/${customId}`, owner.auth)).data.dimensions).toBe("30x20");
  });

  test("unknown keys are dropped before saving", async () => {
    const layout = plot(30, 20);
    const put = await client.put(layoutPath(customId), { layout: { ...layout, script: "<b>hi</b>" } }, owner.auth);
    expect(put.status).toBe(200);
    expect((await client.get(layoutPath(customId), owner.auth)).data.layout).toEqual(layout);
  });

  test("an invalid layout is a 400 that says what is wrong", async () => {
    const before = (await client.get(layoutPath(customId), owner.auth)).data.layout;

    const offMap = await client.put(layoutPath(customId), { layout: plot(30, 20, { spawn: { x: 40, y: 1 } }) }, owner.auth);
    expect(offMap.status).toBe(400);
    expect(offMap.data.message).toContain("spawn is off the map");
    expect(offMap.data.issues).toEqual(["spawn is off the map"]);

    const tooSmall = await client.put(layoutPath(customId), { layout: plot(30, 20, { cols: 5 }) }, owner.auth);
    expect(tooSmall.status).toBe(400);
    expect(tooSmall.data.issues[0]).toStartWith("cols:");

    expect((await client.put(layoutPath(customId), {}, owner.auth)).status).toBe(400);
    const badJson = await client.put(layoutPath(customId), "{nope", { headers: { ...owner.auth.headers, "Content-Type": "application/json" } });
    expect(badJson.status).toBe(400);

    expect((await client.get(layoutPath(customId), owner.auth)).data.layout).toEqual(before);
  });

  test("bodies over the cap are refused, with or without a Content-Length", async () => {
    const big = { layout: { ...plot(30, 20), padding: "x".repeat(MAX_LAYOUT_BODY_BYTES) } };
    expect((await client.put(layoutPath(customId), big, owner.auth)).status).toBe(413);

    const chunk = new TextEncoder().encode("x".repeat(16 * 1024));
    const chunks = Math.ceil(MAX_LAYOUT_BODY_BYTES / chunk.byteLength) + 2;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < chunks; i++) controller.enqueue(chunk);
        controller.close();
      },
    });
    // keepalive: false because Bun's fetch would reuse this socket while the rest of the
    // chunked body is still on it, and the next request in this file would read as garbage.
    const streamed = await fetch(`${BASE_URL}${layoutPath(customId)}`, {
      method: "PUT",
      headers: { ...owner.auth.headers, "Content-Type": "application/json" },
      body: stream,
      keepalive: false,
    });
    expect(streamed.status).toBe(413);
  });

  test("CORS preflight allows PUT", async () => {
    const preflight = await fetch(`${BASE_URL}${layoutPath(customId)}`, { method: "OPTIONS", headers: { Origin: "http://localhost:4155" } });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-methods")).toContain("PUT");
  });
});
