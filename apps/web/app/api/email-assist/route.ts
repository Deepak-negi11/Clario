// POST /api/email-assist: writing help in the in-game email composer. "suggest" drafts a message
// from the subject; "check" flags wording that is too casual for a work email. The NVIDIA key stays
// on the server and only signed-in players can use it. On any failure the composer just shows no
// AI help; its word list (findInformalWords) still flags the common casual words.

import { EmailAssistRequestSchema, readEmailAssist } from "@repo/shared";
import { EMAIL_ASSIST_SYSTEM_PROMPT, emailAssistUserContent } from "../../../lib/email-assist/prompt";
import { askNvidia, nvidiaSettings } from "../../../lib/email-assist/nvidia";
import { signedInUserId } from "../../../lib/email-assist/signed-in-user";
import { takeAiCall } from "../../../lib/mentor/rate-limit";

const DEFAULT_TIMEOUT_MS = 8_000;

function fail(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return fail(400, "The request was not valid JSON.");
  }
  const parsed = EmailAssistRequestSchema.safeParse(json);
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "Invalid request.");

  const settings = nvidiaSettings();
  if (!settings) return fail(503, "Writing suggestions are off: no NVIDIA_API_KEY is set.");

  let userId: string | null;
  try {
    userId = await signedInUserId(request);
  } catch (error) {
    console.warn("[email-assist] could not check the sign-in:", error instanceof Error ? error.message : error);
    return fail(502, "Could not check your sign-in.");
  }
  if (!userId) return fail(401, "Sign in to get writing suggestions.");
  // Its own count, so writing emails doesn't use up the mentor's calls.
  if (!takeAiCall(`email-assist:${userId}`)) return fail(429, "Too many suggestions in a short time. Try again in a minute.");

  const timeoutMs = Number(process.env.NVIDIA_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  try {
    const raw = await askNvidia(settings, {
      system: EMAIL_ASSIST_SYSTEM_PROMPT,
      user: emailAssistUserContent(parsed.data),
      maxTokens: parsed.data.mode === "suggest" ? 400 : 300,
      // Stop paying for an answer the composer stopped waiting for.
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)]),
    });
    const result = readEmailAssist(raw, parsed.data);
    if (result) return Response.json(result);
    console.warn("[email-assist] the AI returned an empty or unreadable answer");
  } catch (error) {
    if (request.signal.aborted) return fail(499, "The composer stopped waiting.");
    console.warn("[email-assist] AI call failed:", error instanceof Error ? error.message : error);
  }
  return fail(502, "No suggestion this time.");
}
