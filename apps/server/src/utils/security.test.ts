import { expect, test } from "bun:test";
import { allowedOrigin, jwtSecret, requestBudget } from "./security";
import { startServer } from "../../index";

test("production requires a private signing secret through every startup path", () => {
  for (const secret of [undefined, "dev-secret", "change-me", "short"]) {
    expect(() => jwtSecret({ NODE_ENV: "production", JWT_SECRET: secret })).toThrow("JWT_SECRET");
  }
  expect(jwtSecret({ NODE_ENV: "production", JWT_SECRET: "a".repeat(40) })).toBe("a".repeat(40));
  expect(jwtSecret({ NODE_ENV: "development" })).toBe("dev-secret");
});

test("production browser origins must match the operator's explicit allowlist", () => {
  const env = { NODE_ENV: "production", CORS_ORIGIN: "https://office.example,https://team.example" };
  expect(allowedOrigin("https://office.example", env)).toBe(true);
  for (const origin of [null, "null", "http://localhost:3005", "https://office.example.evil.test", "https://evil.test"]) expect(allowedOrigin(origin, env)).toBe(false);
  expect(allowedOrigin("http://localhost:4155", { NODE_ENV: "development" })).toBe(true);
});

test("request budgets expire, isolate callers and bound the number of tracked keys", () => {
  const take = requestBudget(2, 1000, 2);
  expect(take("a", 0)).toBe(0); expect(take("a", 100)).toBe(0); expect(take("a", 200)).toBe(1);
  expect(take("b", 200)).toBe(0); expect(take("c", 200)).toBe(1);
  expect(take("a", 1001)).toBe(0); expect(take("c", 1201)).toBe(0);
});

test("HTTP authentication throttles attempts using the peer IP, not spoofed headers", async () => {
  const server = startServer(0), url = `http://localhost:${server.port}`;
  try {
    for (let i = 0; i < 60; i++) {
      const response = await fetch(`${url}/api/v1/signin`, { method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": `192.0.2.${i}` }, body: "{}" });
      expect(response.status).toBe(400);
    }
    const response = await fetch(`${url}/api/v1/signin`, { method: "POST", body: "{}" });
    expect(response.status).toBe(429); expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
    const cors = await fetch(`${url}/api/v1/signin`, { method: "OPTIONS", headers: { Origin: "https://evil.test" } });
    expect(cors.headers.get("access-control-allow-origin")).toBeNull();
    expect(cors.headers.get("x-content-type-options")).toBe("nosniff");
    const socket = await fetch(`${url}/ws`, { headers: { Origin: "https://evil.test" } });
    expect(socket.status).toBe(403);
  } finally { server.stop(true); }
});
