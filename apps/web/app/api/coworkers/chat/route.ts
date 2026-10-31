// POST /api/coworkers/chat: the learner talks to an AI coworker in the office (Arjun, Priya,
// Rahul). It runs on the visitor's own AI key when they set one (x-ai-key header, used for this
// call only and never stored or logged), else on the site's NVIDIA key. A GitHub link in the chat
// gets the public repo read for context. Without a working AI the coworker answers with a saved
// line (movement commands still work), so walking up to them always gets a reply.

import {
  AI_PROVIDER_INFO,
  CoworkerChatRequestSchema,
  coworkerChatResponse,
  coworkerCommand,
  coworkerMission,
  coworkerSystemPromptForChat,
  coworkerUserContent,
  findGithubLink,
  firstName,
  getCoworker,
  githubLabel,
  parseGithubLink,
  readCoworkerReply,
  savedCoworkerReply,
  type Coworker,
  type CoworkerAbilities,
} from "@repo/shared";
import { AiHttpError } from "../../../../lib/ai/ai-call";
import { parseCompanionIntent } from "../../../../lib/companions/intent";
import { aiConnection, askAi, type AiConnection } from "../../../../lib/ai/providers";
import { repoContext } from "../../../../lib/github/repo-context";
import { takeAiCall } from "../../../../lib/mentor/rate-limit";

// NVIDIA's free tier usually answers in 2-5 s but sometimes takes 15 s; code help takes longer.
// Past this, a saved line.
const SITE_TIMEOUT_MS = 20_000;
const OWN_KEY_TIMEOUT_MS = 30_000;

function visitorOf(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

function fromSavedLines(coworker: Coworker, message: string, abilities: CoworkerAbilities, notice: string): Response {
  return Response.json(coworkerChatResponse(coworker, savedCoworkerReply(coworker, message, abilities), "saved", { notice }));
}

// What to tell the learner when their own key fails, so they can fix it in AI settings.
function ownKeyNotice(connection: AiConnection, error: unknown, name: string): string | null {
  if (!connection.own || !(error instanceof AiHttpError)) return null;
  const { label } = AI_PROVIDER_INFO[connection.provider];
  if (error.status === 401 || error.status === 403) return `${label} rejected your key, so ${name} answers with a saved line. Check it in AI settings.`;
  if (error.status === 404) return `${label} doesn't know the model "${connection.model}" for your key. Pick another one in AI settings.`;
  if (error.status === 429) return `Your ${label} key is over its limit or out of credit, so ${name} answers with a saved line.`;
  if (error.status === 400) return `${label} refused the request (HTTP 400). Try another model in AI settings.`;
  return null;
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
  const { coworkerId, message, history, place, ai } = parsed.data;
  const coworker = getCoworker(coworkerId)!;
  const name = firstName(coworkerMission(coworker).coworker.name);
  // What the player's view lets them do right now (walk with you, go to a room).
  const abilities: CoworkerAbilities = place ?? { canWalk: false, canGoTo: false, rooms: [] };
  // "Go to the kitchen" (a room on this map) is answered by fixed rules, so it never depends on the
  // AI picking the right action. A goodbye still gets the AI's words, with the leave action added.
  // Where the scene can't move them, the saved reply says so instead of promising it.
  const command = coworkerCommand(message, abilities);
  if (coworkerCommand(message, { ...abilities, canGoTo: true })?.type === "go-to") {
    return Response.json(coworkerChatResponse(coworker, savedCoworkerReply(coworker, message, abilities), "command"));
  }
  // "Walk with me" or "let's play" outside the 3D view: they can't, so say how instead of
  // promising it. (In the 3D view the panel handles these phrases itself, lib/companions.)
  const companion = abilities.canWalk ? null : parseCompanionIntent(message);
  if (companion === "follow" || companion === "play") {
    const reply = `I'd love to, but we can only ${companion === "play" ? "play a game" : "walk around"} together in the 3D view. Switch to it and ask me again.`;
    return Response.json(coworkerChatResponse(coworker, { reply }, "command"));
  }

  const connection = aiConnection(request, ai);
  if (connection === "missing-key") {
    return Response.json({ error: "Your AI key is missing. Add it again in AI settings." }, { status: 400 });
  }
  if (!connection) {
    return fromSavedLines(coworker, message, abilities, `The AI is off (no NVIDIA_API_KEY), so ${name} answers with saved lines. You can add your own AI key in AI settings.`);
  }
  // Its own count, so chatting with coworkers doesn't use up the mentor's calls.
  if (!takeAiCall(`coworkers:${visitorOf(request)}`)) {
    return fromSavedLines(coworker, message, abilities, `You've chatted a lot in a short time, so ${name} answers with a saved line. Try again in a minute.`);
  }

  const timeoutMs = connection.own ? OWN_KEY_TIMEOUT_MS : Number(process.env.NVIDIA_TIMEOUT_MS) || SITE_TIMEOUT_MS;
  // Stop paying for an answer the panel stopped waiting for.
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)]);
  try {
    const link = findGithubLink(message, history);
    const repo = link ? await repoContext(link, signal) : null;
    const raw = await askAi(connection, {
      system: coworkerSystemPromptForChat(coworker),
      user: coworkerUserContent(history, message, { place, repo: repo ?? undefined }),
      maxTokens: 1500,
      json: true,
      signal,
    });
    const reply = readCoworkerReply(raw, coworker, abilities);
    if (reply) {
      if (command?.type === "leave" && !reply.action) reply.action = command;
      // Name the repo only when this message linked it; follow-ups still get it as context.
      const linked = link && repo && parseGithubLink(message) ? githubLabel(link) : undefined;
      return Response.json(coworkerChatResponse(coworker, reply, "ai", { repo: linked }));
    }
    console.warn(`[coworkers] ${connection.provider} returned an empty or unreadable answer`);
  } catch (error) {
    if (request.signal.aborted) return Response.json({ error: "The panel stopped waiting." }, { status: 499 });
    console.warn(`[coworkers] ${connection.provider} call failed:`, error instanceof Error ? error.message : error);
    const notice = ownKeyNotice(connection, error, name);
    if (notice) return fromSavedLines(coworker, message, abilities, notice);
  }
  return fromSavedLines(coworker, message, abilities, `The AI didn't answer this time, so ${name} answers with a saved line.`);
}
