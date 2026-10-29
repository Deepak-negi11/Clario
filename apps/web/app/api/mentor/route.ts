// POST /api/mentor: the learner asks Maya a question (PS7_BUILD_BRIEF.md section 16).
// The AI key stays on the server. Without a working AI, Maya answers from saved tips,
// so the Practice Session always replies.

import {
  MentorRequestSchema,
  readCoachedReply,
  savedTipReply,
  type MentorResponse,
} from "@repo/shared";
import { getMentorProvider } from "../../../lib/mentor/providers";
import { takeAiCall } from "../../../lib/mentor/rate-limit";

const DEFAULT_TIMEOUT_MS = 10_000;

function visitorOf(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

function fromSavedTips(message: string, notice: string): Response {
  const body: MentorResponse = { reply: savedTipReply(message), source: "saved-tips", notice };
  return Response.json(body);
}

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "The request was not valid JSON." }, { status: 400 });
  }

  const parsed = MentorRequestSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }
  const { message, history, inputMode } = parsed.data;

  const provider = getMentorProvider();
  if ("missing" in provider) {
    return fromSavedTips(message, `The AI mentor is off (${provider.missing}), so Maya answers from saved tips.`);
  }
  if (!takeAiCall(visitorOf(request))) {
    return fromSavedTips(message, "You've asked a lot in a short time, so this answer comes from saved tips. Try the AI again in a minute.");
  }

  const timeoutMs = Number(process.env.AI_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  try {
    const raw = await provider.ask(history, message, inputMode, AbortSignal.timeout(timeoutMs));
    const { reply, language } = readCoachedReply(raw, message, inputMode);
    if (reply) {
      const body: MentorResponse = { reply, source: provider.source, language };
      return Response.json(body);
    }
    console.warn("[mentor] the AI returned an empty or unreadable answer");
  } catch (error) {
    console.warn("[mentor] AI call failed:", error instanceof Error ? error.message : error);
  }
  return fromSavedTips(message, "The AI mentor didn't answer this time, so this is a saved tip.");
}
