import * as z from "zod";
import { AiChoiceSchema } from "../ai/ai-providers";
import type { CoworkerAction } from "./coworker-commands";
import { COWORKER_IDS, type Coworker, type CoworkerPlace, type CoworkerReply } from "./coworkers";

// POST /api/coworkers/chat: the learner talks to an AI coworker in the office (coworkers.ts).
// The server keeps no conversation state; the browser sends the recent turns, where the learner
// is on the map, and (optionally) which AI to use with their own key (ai-providers.ts).

// Only the most recent turns go to the AI; older ones are dropped, not rejected.
export const COWORKER_HISTORY_LIMIT = 8;
// Long enough for a pasted error message or a short piece of code.
export const MAX_COWORKER_MESSAGE = 2000;

export const CoworkerMessageSchema = z.object({
  role: z.enum(["user", "coworker"]),
  text: z.string().trim().min(1).max(4000),
});

const PlaceName = z.string().trim().min(1).max(60);

export const CoworkerPlaceSchema = z.object({
  map: z.string().trim().max(60).default(""),
  room: PlaceName.nullable().default(null),
  rooms: z.array(PlaceName).max(40).default([]),
  peopleOnline: z.number().int().min(0).max(10_000).optional(),
  canWalk: z.boolean().default(false),
  canGoTo: z.boolean().default(false),
}) satisfies z.ZodType<CoworkerPlace, unknown>;

export const CoworkerChatRequestSchema = z.object({
  coworkerId: z.enum(COWORKER_IDS, { error: "That coworker doesn't exist." }),
  message: z.string().trim()
    .min(1, "Type or say something first.")
    .max(MAX_COWORKER_MESSAGE, `Keep your message under ${MAX_COWORKER_MESSAGE} characters.`),
  history: z.array(CoworkerMessageSchema).max(40).default([])
    .transform((turns) => turns.slice(-COWORKER_HISTORY_LIMIT)),
  place: CoworkerPlaceSchema.optional(),
  ai: AiChoiceSchema.optional(),
});

export type CoworkerMessage = z.infer<typeof CoworkerMessageSchema>;
export type CoworkerChatRequest = z.infer<typeof CoworkerChatRequestSchema>;

export type CoworkerChatResponse = {
  reply: string;              // spoken
  details?: string;           // shown under the reply, not spoken: steps, code
  // "command": a plain request ("go to the kitchen") answered by fixed rules, without the AI.
  source: "ai" | "saved" | "command";
  // Why the answer is a saved line (no key, AI down, rate limit, key rejected). Absent for AI answers.
  notice?: string;
  // What the panel does with the reply: always one of these typed actions, never text from the AI.
  action?: CoworkerAction;
  repo?: string;              // "owner/repo" when a GitHub repo was read for this answer
  // On the site's AI key: the free AI replies left after this one (FREE_AI_REPLIES).
  freeTriesLeft?: number;
  // The free replies are used up: the panel asks for their own key.
  needsKey?: true;
};

/** The response for a reply; an offer can only ever open this coworker's own mission. */
export function coworkerChatResponse(
  coworker: Coworker,
  { reply, details, action }: CoworkerReply,
  source: CoworkerChatResponse["source"],
  extra: { notice?: string; repo?: string; freeTriesLeft?: number; needsKey?: boolean } = {},
): CoworkerChatResponse {
  const safeAction = action?.type === "open-mission" ? { type: "open-mission" as const, missionId: coworker.missionId } : action;
  return {
    reply,
    ...(details ? { details } : {}),
    source,
    ...(extra.notice ? { notice: extra.notice } : {}),
    ...(safeAction ? { action: safeAction } : {}),
    ...(extra.repo ? { repo: extra.repo } : {}),
    ...(extra.freeTriesLeft !== undefined ? { freeTriesLeft: extra.freeTriesLeft } : {}),
    ...(extra.needsKey ? { needsKey: true as const } : {}),
  };
}
