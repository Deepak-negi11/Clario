import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { AI_KEY_HEADER, freeAiTries, freeTriesUsedUpNotice, type CoworkerChatResponse } from "@repo/shared";
import { POST } from "./route";

// The game server's free-reply count and the AI, faked behind fetch.
let used: Record<string, number>;
let aiCalls: { url: string; auth: string }[];
let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;

function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input);
  const auth = new Headers(init?.headers).get("authorization") ?? "";
  if (url.endsWith("/api/v1/user/free-ai")) {
    const token = auth.replace("Bearer ", "");
    if (!(token in used)) return Promise.resolve(Response.json({ message: "Unauthorized" }, { status: 403 }));
    if (init?.method === "POST") {
      if (used[token]! >= 3) return Promise.resolve(Response.json(freeAiTries(used[token]!), { status: 409 }));
      used[token]! += 1;
    }
    return Promise.resolve(Response.json(freeAiTries(used[token]!)));
  }
  aiCalls.push({ url, auth });
  return Promise.resolve(Response.json({ choices: [{ message: { content: JSON.stringify({ reply: "Happy to help with that." }) } }] }));
}

function chat(message: string, { token, ownKey }: { token?: string; ownKey?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json", "x-forwarded-for": crypto.randomUUID() };
  if (token) headers.authorization = `Bearer ${token}`;
  if (ownKey) headers[AI_KEY_HEADER] = ownKey;
  const body = {
    coworkerId: "arjun",
    message,
    place: { map: "Office", room: null, rooms: ["Kitchen"], canWalk: false, canGoTo: true },
    ...(ownKey ? { ai: { provider: "openai", model: "gpt-5-mini" } } : {}),
  };
  return POST(new Request("http://localhost/api/coworkers/chat", { method: "POST", headers, body: JSON.stringify(body) }));
}

async function answer(message: string, options?: Parameters<typeof chat>[1]) {
  const response = await chat(message, options);
  expect(response.status).toBe(200);
  return (await response.json()) as CoworkerChatResponse;
}

describe("coworker chat: free AI replies on the site key", () => {
  const siteKey = process.env.NVIDIA_API_KEY;

  beforeEach(() => {
    process.env.NVIDIA_API_KEY = "nvapi-site-key-for-tests";
    used = { alice: 0, bob: 0 };
    aiCalls = [];
    fetchSpy = spyOn(globalThis, "fetch").mockImplementation(fakeFetch as typeof fetch);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    process.env.NVIDIA_API_KEY = siteKey;
  });

  test("a new user gets exactly 3 AI replies, then a prompt for their own key", async () => {
    for (const left of [2, 1, 0]) {
      const reply = await answer("What's going on here?", { token: "alice" });
      expect(reply).toMatchObject({ source: "ai", freeTriesLeft: left });
      expect(reply.needsKey).toBeUndefined();
    }
    const fourth = await answer("And now?", { token: "alice" });
    expect(fourth).toMatchObject({ source: "saved", freeTriesLeft: 0, needsKey: true, notice: freeTriesUsedUpNotice() });
    expect(aiCalls).toHaveLength(3);
    expect(used.alice).toBe(3);
    expect(used.bob).toBe(0);
  });

  test("movement commands answer without the AI and don't use a try", async () => {
    const reply = await answer("go to the kitchen", { token: "alice" });
    expect(reply.source).toBe("command");
    expect(aiCalls).toHaveLength(0);
    expect(used.alice).toBe(0);
  });

  test("a saved line (the AI failed) doesn't use a try", async () => {
    fetchSpy.mockImplementation(((input: RequestInfo | URL, init?: RequestInit) =>
      String(input).includes("nvidia.com") ? Promise.resolve(new Response("busy", { status: 503 })) : fakeFetch(input, init)) as typeof fetch);
    const reply = await answer("Hello", { token: "alice" });
    expect(reply).toMatchObject({ source: "saved", freeTriesLeft: 3 });
    expect(used.alice).toBe(0);
  });

  test("signed out or a bad token: no site AI, a saved line", async () => {
    for (const token of [undefined, "stranger"]) {
      const reply = await answer("Hello", { token });
      expect(reply.source).toBe("saved");
      expect(reply.notice).toContain("Sign in");
    }
    expect(aiCalls).toHaveLength(0);
  });

  test("their own key keeps working after the free replies, and never counts", async () => {
    used.alice = 3;
    const reply = await answer("Hello", { token: "alice", ownKey: "sk-proj-abcdefghijklmnopqrstuvwxyz" });
    expect(reply.source).toBe("ai");
    expect(reply.freeTriesLeft).toBeUndefined();
    expect(aiCalls).toEqual([{ url: "https://api.openai.com/v1/chat/completions", auth: "Bearer sk-proj-abcdefghijklmnopqrstuvwxyz" }]);
    expect(used.alice).toBe(3);
  });
});
