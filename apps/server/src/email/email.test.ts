import { describe, test, expect, afterEach, mock } from "bun:test";
import jwt from "jsonwebtoken";
import { handleSendEmail, parseEmailInput, MAX_SUBJECT_LENGTH, MAX_BODY_LENGTH } from "./email";
import { sendWithResend } from "./resend";

const realFetch = globalThis.fetch;
const EMAIL_VARS = ["RESEND_API_KEY", "EMAIL_FROM", "SMTP_HOST", "SMTP_USER", "SMTP_PASS"] as const;
const savedEnv = Object.fromEntries(EMAIL_VARS.map((name) => [name, process.env[name]]));

afterEach(() => {
  globalThis.fetch = realFetch;
  for (const name of EMAIL_VARS) {
    if (savedEnv[name] === undefined) delete process.env[name];
    else process.env[name] = savedEnv[name];
  }
});

function mockFetch(status: number, body: unknown) {
  const fn = mock(async (_url: string | URL | Request, _init?: RequestInit) =>
    Response.json(body, { status }),
  );
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

function emailRequest(body: unknown, token?: string) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return new Request("http://localhost/api/v1/space/space-1/email", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function tokenFor(userId: string) {
  return jwt.sign({ userId }, process.env.JWT_SECRET ?? "dev-secret");
}

describe("parseEmailInput", () => {
  test("accepts a valid draft and trims it", () => {
    expect(parseEmailInput({ recipientId: " u1 ", subject: "  Hi  ", body: " Hello \r\nthere " })).toEqual({
      recipientId: "u1",
      subject: "Hi",
      body: "Hello \nthere",
    });
  });

  test("collapses line breaks in the subject", () => {
    const input = parseEmailInput({ recipientId: "u1", subject: "Line one\r\nBcc: x@y.z", body: "b" });
    expect(input).toMatchObject({ subject: "Line one Bcc: x@y.z" });
  });

  test("rejects missing or wrongly typed fields", () => {
    expect(parseEmailInput(null)).toBeString();
    expect(parseEmailInput({ recipientId: "u1", subject: "Hi" })).toBeString();
    expect(parseEmailInput({ recipientId: 1, subject: "Hi", body: "b" })).toBeString();
  });

  test("rejects empty and oversized fields", () => {
    expect(parseEmailInput({ recipientId: " ", subject: "Hi", body: "b" })).toBe("Choose who to send this to");
    expect(parseEmailInput({ recipientId: "u1", subject: "   ", body: "b" })).toBe("Subject can't be empty");
    expect(parseEmailInput({ recipientId: "u1", subject: "Hi", body: "\n " })).toBe("Message can't be empty");
    expect(parseEmailInput({ recipientId: "u1", subject: "s".repeat(MAX_SUBJECT_LENGTH + 1), body: "b" })).toBeString();
    expect(parseEmailInput({ recipientId: "u1", subject: "Hi", body: "b".repeat(MAX_BODY_LENGTH + 1) })).toBeString();
  });
});

describe("sendWithResend", () => {
  const config = { apiKey: "re_test_key", from: "Clario <onboarding@resend.dev>" };
  const email = { to: "ana@example.com", subject: "Hi", text: "Hello", replyTo: "sam@example.com" };

  test("posts the email to Resend and returns its id", async () => {
    const fetchMock = mockFetch(200, { id: "email-123" });
    expect(await sendWithResend(config, email)).toEqual({ ok: true, id: "email-123" });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.resend.com/emails");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer re_test_key");
    expect(JSON.parse(String(init?.body))).toEqual({
      from: config.from,
      to: ["ana@example.com"],
      subject: "Hi",
      text: "Hello",
      reply_to: "sam@example.com",
    });
  });

  test("maps Resend errors to a reason", async () => {
    mockFetch(403, { name: "validation_error", message: "domain not verified" });
    expect(await sendWithResend(config, email)).toMatchObject({ ok: false, reason: "rejected" });

    mockFetch(429, { name: "rate_limit_exceeded" });
    expect(await sendWithResend(config, email)).toMatchObject({ ok: false, reason: "rate-limited" });

    mockFetch(500, { name: "internal_server_error" });
    expect(await sendWithResend(config, email)).toMatchObject({ ok: false, reason: "unavailable" });
  });

  test("treats a network failure as unavailable", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    expect(await sendWithResend(config, email)).toEqual({ ok: false, reason: "unavailable", detail: "fetch failed" });
  });
});

describe("handleSendEmail guards", () => {
  const draft = { recipientId: "u2", subject: "Hi", body: "Hello" };

  test("rejects requests without a valid token", async () => {
    expect((await handleSendEmail(emailRequest(draft))).status).toBe(403);
    expect((await handleSendEmail(emailRequest(draft, "not-a-jwt"))).status).toBe(403);
  });

  test("returns a clear error when email is not configured", async () => {
    for (const name of EMAIL_VARS) delete process.env[name];
    const res = await handleSendEmail(emailRequest(draft, tokenFor("u1")));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ message: "Email is not configured on this server yet." });
  });

  test("validates the body before touching presence or Resend", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.EMAIL_FROM = "Clario <onboarding@resend.dev>";
    const fetchMock = mockFetch(200, { id: "never" });
    const res = await handleSendEmail(emailRequest({ ...draft, subject: "" }, tokenFor("u1")));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
