// POST /api/missions/send: the learner sends their reply in a mission (PS7_BUILD_BRIEF.md
// sections 7-9). Two layers: the coach grades the message first, and only a message that
// passes (7+ in every category) reaches the coworker, who answers in character.
// Without a working AI the rules engine grades and the coworker's answer is the seeded one,
// so a mission can always be finished.

import {
  COACH_JSON_SCHEMA,
  MissionSendRequestSchema,
  coachUserContent,
  coworkerSystemPrompt,
  getMission,
  isPassing,
  readCoachFeedback,
  scoreWithRules,
  toPlainText,
  COACH_SYSTEM_PROMPT,
  type MissionFeedback,
  type MissionSendResponse,
} from "@repo/shared";
import { askGemini, geminiSettings } from "../../../../lib/missions/gemini";
import { takeAiCall } from "../../../../lib/mentor/rate-limit";

const DEFAULT_TIMEOUT_MS = 12_000;

function visitorOf(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "The request was not valid JSON." }, { status: 400 });
  }
  const parsed = MissionSendRequestSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }
  const { missionId, draft } = parsed.data;
  const mission = getMission(missionId);
  if (!mission) return Response.json({ error: "That mission doesn't exist." }, { status: 404 });

  const ai = geminiSettings();
  const visitor = visitorOf(request);
  const timeoutMs = Number(process.env.AI_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;

  // Layer 1: the coach grades the message.
  let feedback: MissionFeedback | null = null;
  if (ai && takeAiCall(visitor)) {
    try {
      const raw = await askGemini(ai, {
        system: COACH_SYSTEM_PROMPT,
        turns: [{ role: "user", text: coachUserContent(mission, draft) }],
        jsonSchema: COACH_JSON_SCHEMA,
        signal: AbortSignal.timeout(timeoutMs),
      });
      feedback = readCoachFeedback(JSON.parse(raw), draft);
    } catch (error) {
      console.warn("[missions] coach failed:", error instanceof Error ? error.message : error);
    }
  }
  const source = feedback ? "ai" : "rules";
  feedback ??= scoreWithRules(mission, draft);
  const passed = isPassing(feedback);

  // Layer 2: only a passing message reaches the coworker.
  let reply: string | null = null;
  let replySource: MissionSendResponse["replySource"] = null;
  if (passed) {
    reply = mission.goodReply;
    replySource = "seeded";
    if (ai && takeAiCall(visitor)) {
      try {
        const text = toPlainText(
          await askGemini(ai, {
            system: coworkerSystemPrompt(mission),
            turns: [{ role: "user", text: draft }],
            signal: AbortSignal.timeout(timeoutMs),
          }),
        ).trim();
        if (text) {
          reply = text.slice(0, 600);
          replySource = "ai";
        }
      } catch (error) {
        console.warn("[missions] coworker failed:", error instanceof Error ? error.message : error);
      }
    }
  }

  const body: MissionSendResponse = { feedback, source, passed, reply, replySource };
  return Response.json(body);
}
