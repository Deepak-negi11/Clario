import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import axios from "axios";
import prisma from "@repo/db";
import { FREE_AI_REPLIES } from "@repo/shared";
import { startServer } from "../../index";

describe("Free AI replies", () => {
  const PORT = 4040;
  let server: ReturnType<typeof startServer>;
  const client = axios.create({ baseURL: `http://localhost:${PORT}`, validateStatus: () => true });
  const userIds: string[] = [];

  async function makeUser() {
    const email = `free-ai-test-${crypto.randomUUID()}@test.com`;
    const password = "password123";
    const signup = await client.post("/api/v1/signup", { username: `free-${crypto.randomUUID().slice(0, 8)}`, password, email, type: "user" });
    const signin = await client.post("/api/v1/signin", { email, password });
    userIds.push(signup.data.userId);
    return { headers: { Authorization: `Bearer ${signin.data.token}` } };
  }

  beforeAll(() => {
    server = startServer(PORT);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    server.stop(true);
  });

  test("needs a login token", async () => {
    expect((await client.get("/api/v1/user/free-ai")).status).toBe(403);
    expect((await client.post("/api/v1/user/free-ai")).status).toBe(403);
  });

  test(`a new user has ${FREE_AI_REPLIES}, each use takes one, and it stops at zero`, async () => {
    const limit = FREE_AI_REPLIES;
    const auth = await makeUser();
    expect((await client.get("/api/v1/user/free-ai", auth)).data).toEqual({ used: 0, limit, left: limit });

    for (let left = limit - 1; left >= 0; left--) {
      const used = await client.post("/api/v1/user/free-ai", null, auth);
      expect(used.status).toBe(200);
      expect(used.data.left).toBe(left);
    }
    const over = await client.post("/api/v1/user/free-ai", null, auth);
    expect(over.status).toBe(409);
    expect(over.data).toEqual({ used: limit, limit, left: 0 });
    expect((await client.get("/api/v1/user/free-ai", auth)).data.left).toBe(0);
  });

  test("replies finishing at once never count past the limit", async () => {
    const limit = FREE_AI_REPLIES;
    const extra = 5;
    const auth = await makeUser();
    const results = await Promise.all(Array.from({ length: limit + extra }, () => client.post("/api/v1/user/free-ai", null, auth)));
    expect(results.filter((result) => result.status === 200)).toHaveLength(limit);
    expect(results.filter((result) => result.status === 409)).toHaveLength(extra);
    expect((await client.get("/api/v1/user/free-ai", auth)).data).toEqual({ used: limit, limit, left: 0 });
  });

  test("each user has their own count", async () => {
    const first = await makeUser();
    const second = await makeUser();
    await client.post("/api/v1/user/free-ai", null, first);
    expect((await client.get("/api/v1/user/free-ai", first)).data.left).toBe(FREE_AI_REPLIES - 1);
    expect((await client.get("/api/v1/user/free-ai", second)).data.left).toBe(FREE_AI_REPLIES);
  });
});
