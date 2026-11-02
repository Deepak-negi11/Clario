// POST /api/coworkers/document: an AI coworker (Arjun, Priya, Rahul) writes a short document the
// learner asked for, which the locker panel then puts in their locker. Like the chat route it runs
// on the visitor's own AI key when they set one (x-ai-key header, used for this call only), else on
// the site's key, and shares the coworkers' rate limit. Without a working AI the coworker leaves one
// of their saved documents, so asking always gets you something.

import {
  CoworkerDocRequestSchema, coworkerDocPrompt, firstName, coworkerMission, getCoworker, readCoworkerDoc, savedCoworkerDoc,
  type CoworkerDoc, type CoworkerDocResponse,
} from "@repo/shared";
import { aiConnection, askAi } from "../../../../lib/ai/providers";
import { takeAiCall } from "../../../../lib/mentor/rate-limit";

const SITE_TIMEOUT_MS = 20_000;
const OWN_KEY_TIMEOUT_MS = 30_000;

function visitorOf(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

const reply = (doc: CoworkerDoc, source: CoworkerDocResponse["source"], notice?: string) =>
  Response.json({ ...doc, source, ...(notice ? { notice } : {}) } satisfies CoworkerDocResponse);

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "The request was not valid JSON." }, { status: 400 });
  }
  const parsed = CoworkerDocRequestSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  const { coworkerId, ask, ai } = parsed.data;
  const coworker = getCoworker(coworkerId)!;
  const name = firstName(coworkerMission(coworker).coworker.name);
  const saved = (notice: string) => reply(savedCoworkerDoc(coworkerId, ask), "saved", notice);

  const connection = aiConnection(request, ai);
  if (connection === "missing-key") return Response.json({ error: "Your AI key is missing. Add it again in AI settings." }, { status: 400 });
  if (!connection) return saved(`The AI is off, so ${name} left one of their usual documents.`);
  if (!takeAiCall(`coworkers:${visitorOf(request)}`)) return saved(`You've asked a lot in a short time, so ${name} left one of their usual documents.`);

  const timeoutMs = connection.own ? OWN_KEY_TIMEOUT_MS : Number(process.env.NVIDIA_TIMEOUT_MS) || SITE_TIMEOUT_MS;
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)]);
  try {
    const raw = await askAi(connection, { system: coworkerDocPrompt(coworker), user: `<request>${ask}</request>`, maxTokens: 900, json: true, signal });
    const doc = readCoworkerDoc(raw);
    if (doc) return reply(doc, "ai");
    console.warn(`[coworkers] ${connection.provider} returned an unreadable document`);
  } catch (error) {
    if (request.signal.aborted) return Response.json({ error: "The panel stopped waiting." }, { status: 499 });
    console.warn(`[coworkers] ${connection.provider} document call failed:`, error instanceof Error ? error.message : error);
  }
  return saved(`The AI didn't answer this time, so ${name} left one of their usual documents.`);
}
