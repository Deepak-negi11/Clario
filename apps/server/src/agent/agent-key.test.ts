import { describe, expect, test } from "bun:test";
import jwt from "jsonwebtoken";
import { getUserIdFromToken, requireAgentAuth, requireAuth } from "../middleware/auth";
import { handleCreateAgentKey } from "./agent-key";

const SECRET = process.env.JWT_SECRET ?? "dev-secret";
const loginToken = (userId: string) => jwt.sign({ userId }, SECRET, { expiresIn: "7d" });
const withBearer = (token?: string) =>
  new Request("http://localhost/api/v1/agent-key", { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {} });

async function createKey(userId: string) {
  const res = handleCreateAgentKey(withBearer(loginToken(userId)));
  expect(res.status).toBe(200);
  return (await res.json()) as { key: string; expiresAt: string; validDays: number };
}

describe("agent keys", () => {
  test("a signed-in user gets a key that lasts 180 days", async () => {
    const { key, expiresAt, validDays } = await createKey("u-key");
    expect(validDays).toBe(180);
    const days = (Date.parse(expiresAt) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(179.9);
    expect(days).toBeLessThan(180.1);
    expect(requireAgentAuth(withBearer(key))).toEqual({ userId: "u-key" });
  });

  test("an agent key is refused everywhere else: endpoints, the socket, making more keys", async () => {
    const { key } = await createKey("u-key");
    expect((requireAuth(withBearer(key)) as Response).status).toBe(403);
    expect(getUserIdFromToken(key)).toBeNull(); // what the WebSocket join uses
    expect(handleCreateAgentKey(withBearer(key)).status).toBe(403);
  });

  test("login tokens still work for agent activity and everything else", () => {
    const token = loginToken("u-login");
    expect(requireAuth(withBearer(token))).toEqual({ userId: "u-login" });
    expect(requireAgentAuth(withBearer(token))).toEqual({ userId: "u-login" });
  });

  test("expired, tampered, other-scope and missing keys are refused", () => {
    const expired = jwt.sign({ userId: "u", scope: "agent" }, SECRET, { expiresIn: -10 });
    const forged = jwt.sign({ userId: "u", scope: "agent" }, "not-the-secret", { expiresIn: "180d" });
    const otherScope = jwt.sign({ userId: "u", scope: "admin" }, SECRET, { expiresIn: "180d" });
    for (const token of [expired, forged, otherScope, "garbage", undefined]) {
      expect((requireAgentAuth(withBearer(token)) as Response).status).toBe(403);
    }
    expect(handleCreateAgentKey(withBearer()).status).toBe(403);
  });
});
