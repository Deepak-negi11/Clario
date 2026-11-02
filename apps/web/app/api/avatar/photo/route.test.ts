import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { POST } from "./route";

const IMAGE = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
let nvidiaBodies: { model: string; messages: { content: unknown }[] }[];
let answer: string;
let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;

function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input);
  if (url.endsWith("/api/v1/user/profile")) {
    const signedIn = new Headers(init?.headers).get("authorization") === "Bearer good-token";
    return Promise.resolve(signedIn ? Response.json({ userId: "u-photo" }) : Response.json({ message: "Unauthorized" }, { status: 403 }));
  }
  nvidiaBodies.push(JSON.parse(String(init?.body)));
  return Promise.resolve(Response.json({ choices: [{ message: { content: answer } }] }));
}

function send(body: unknown, token?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return POST(new Request("http://localhost/api/avatar/photo", { method: "POST", headers, body: JSON.stringify(body) }));
}

describe("avatar photo read by AI", () => {
  const siteKey = process.env.NVIDIA_API_KEY;

  beforeEach(() => {
    process.env.NVIDIA_API_KEY = "nvapi-site-key-for-tests";
    nvidiaBodies = [];
    answer = '{"face": true, "hair": "long", "glasses": true, "beard": false}';
    fetchSpy = spyOn(globalThis, "fetch").mockImplementation(fakeFetch as typeof fetch);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    process.env.NVIDIA_API_KEY = siteKey;
  });

  test("a signed-in player gets the hairstyle, glasses and beard", async () => {
    const response = await send({ image: IMAGE }, "good-token");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ hair: "long", glasses: true, beard: false });
    expect(nvidiaBodies).toHaveLength(1);
    expect(nvidiaBodies[0]!.model).toBe("nvidia/nemotron-3.5-super-vl-120b-a12b");
    expect(JSON.stringify(nvidiaBodies[0]!.messages)).toContain(IMAGE);
  });

  test("signed out: no AI call", async () => {
    expect((await send({ image: IMAGE })).status).toBe(401);
    expect((await send({ image: IMAGE }, "bad-token")).status).toBe(401);
    expect(nvidiaBodies).toHaveLength(0);
  });

  test("only small JPEGs are sent on", async () => {
    expect((await send({ image: "https://example.com/me.jpg" }, "good-token")).status).toBe(400);
    expect((await send({ image: "data:image/png;base64,iVBORw0KGgo=" }, "good-token")).status).toBe(400);
    expect(nvidiaBodies).toHaveLength(0);
  });

  test("no clear face: 422, so the picker keeps what the browser read", async () => {
    answer = '{"face": false}';
    expect((await send({ image: IMAGE }, "good-token")).status).toBe(422);
  });
});
