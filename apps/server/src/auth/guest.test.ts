import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import axios from "axios";
import prisma from "@repo/db";
import { startServer } from "../../index";

describe("Guests", () => {
  const PORT = 4050;
  let server: ReturnType<typeof startServer>;
  const client = axios.create({ baseURL: `http://localhost:${PORT}`, validateStatus: () => true });
  const userIds: string[] = [];
  let spaceId = "";
  let member: { headers: { Authorization: string } };

  beforeAll(async () => {
    server = startServer(PORT);
    const email = `guest-test-${crypto.randomUUID()}@test.com`;
    const signup = await client.post("/api/v1/signup", { username: "Owner", password: "password123", email, type: "user" });
    userIds.push(signup.data.userId);
    const signin = await client.post("/api/v1/signin", { email, password: "password123" });
    member = { headers: { Authorization: `Bearer ${signin.data.token}` } };
    spaceId = (await client.post("/api/v1/space", { name: "Guest test", dimensions: "20x20" }, member)).data.spaceId;
  });

  afterAll(async () => {
    await prisma.space.deleteMany({ where: { id: spaceId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    server.stop(true);
  });

  async function joinAsGuest(username: string) {
    const res = await client.post("/api/v1/guest", { username });
    expect(res.status).toBe(200);
    userIds.push(res.data.userId);
    return { headers: { Authorization: `Bearer ${res.data.token}` } };
  }

  test("a name is all a guest needs", async () => {
    expect((await client.post("/api/v1/guest", { username: "  " })).status).toBe(400);
    expect((await client.post("/api/v1/guest", {})).status).toBe(400);
    const guest = await joinAsGuest("Visitor");
    const profile = await client.get("/api/v1/user/profile", guest);
    expect(profile.data).toMatchObject({ username: "Visitor", guest: true });
    expect((await client.get("/api/v1/user/profile", member)).data.guest).toBe(false);
  });

  test("a guest can open the space they were invited to", async () => {
    const guest = await joinAsGuest("Visitor");
    const space = await client.get(`/api/v1/space/${spaceId}`, guest);
    expect(space.status).toBe(200);
    expect(space.data.name).toBe("Guest test");
  });

  test("a guest can't create spaces, use the free AI or get an agent key", async () => {
    const guest = await joinAsGuest("Visitor");
    const create = await client.post("/api/v1/space", { name: "Mine", dimensions: "20x20" }, guest);
    expect(create.status).toBe(403);
    expect(create.data).toMatchObject({ guest: true, message: "Create a free account to create your own space." });
    expect((await client.get("/api/v1/user/free-ai", guest)).status).toBe(403);
    expect((await client.post("/api/v1/user/free-ai", null, guest)).status).toBe(403);
    expect((await client.post("/api/v1/agent-key", null, guest)).status).toBe(403);
    // Members are unaffected.
    expect((await client.get("/api/v1/user/free-ai", member)).status).toBe(200);
    expect((await client.post("/api/v1/agent-key", null, member)).status).toBe(200);
  });
});
