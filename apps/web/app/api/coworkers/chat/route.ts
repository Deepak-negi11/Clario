// POST /api/coworkers/chat: the learner talks to an AI coworker in the office (Arjun, Priya,
// Rahul). The NVIDIA key stays on the server. Without a working AI the coworker answers with a
// saved line, so walking up to them always gets a reply.

import {
  CoworkerChatRequestSchema,
  coworkerChatResponse,
  coworkerMission,
  coworkerSystemPromptForChat,
  coworkerUserContent,
  firstName,
  getCoworker,
  readCoworkerReply,
  savedCoworkerReply,
  type Coworker,
} from "@repo/shared";
import { askNvidia, nvidiaSettings } from "../../../../lib/email-assist/nvidia";
import { takeAiCall } from "../../../../lib/mentor/rate-limit";

// NVIDIA's free tier usually answers in 2-5 s but sometimes takes 15 s; past this, a saved line.
const DEFAULT_TIMEOUT_MS = 12_000;

function visitorOf(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

function fromSavedLines(coworker: Coworker, message: string, notice: string): Response {
  return Response.json(coworkerChatResponse(coworker, savedCoworkerReply(coworker, message), "saved", notice));
}

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "The request was not valid JSON." }, { status: 400 });
  }

  const parsed = CoworkerChatRequestSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }
  const { coworkerId, message, history } = parsed.data;
  const coworker = getCoworker(coworkerId)!;
  const name = firstName(coworkerMission(coworker).coworker.name);

  const settings = nvidiaSettings();
  if (!settings) {
    return fromSavedLines(coworker, message, `The AI is off (no NVIDIA_API_KEY), so ${name} answers with saved lines.`);
  }
  // Its own count, so chatting with coworkers doesn't use up the mentor's calls.
  if (!takeAiCall(`coworkers:${visitorOf(request)}`)) {
    return fromSavedLines(coworker, message, `You've chatted a lot in a short time, so ${name} answers with a saved line. Try again in a minute.`);
  }

  const timeoutMs = Number(process.env.NVIDIA_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  try {
    const raw = await askNvidia(settings, {
      system: coworkerSystemPromptForChat(coworker),
      user: coworkerUserContent(history, message),
      maxTokens: 220,
      // Stop paying for an answer the panel stopped waiting for.
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)]),
    });
    const reply = readCoworkerReply(raw, coworker);
    if (reply) return Response.json(coworkerChatResponse(coworker, reply, "ai"));
    console.warn("[coworkers] the AI returned an empty or unreadable answer");
  } catch (error) {
    if (request.signal.aborted) return Response.json({ error: "The panel stopped waiting." }, { status: 499 });
    console.warn("[coworkers] AI call failed:", error instanceof Error ? error.message : error);
  }
  return fromSavedLines(coworker, message, `The AI didn't answer this time, so ${name} answers with a saved line.`);
}
