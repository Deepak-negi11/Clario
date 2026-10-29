import * as z from "zod";
import { COWORKER_IDS, type Coworker, type CoworkerReply } from "./coworkers";

// POST /api/coworkers/chat: the learner talks to an AI coworker in the office (coworkers.ts).
// The server keeps no conversation state; the browser sends the recent turns.

// Only the most recent turns go to the AI; older ones are dropped, not rejected.
export const COWORKER_HISTORY_LIMIT = 8;
export const MAX_COWORKER_MESSAGE = 600;

export const CoworkerMessageSchema = z.object({
  role: z.enum(["user", "coworker"]),
  text: z.string().trim().min(1).max(1500),
});

export const CoworkerChatRequestSchema = z.object({
  coworkerId: z.enum(COWORKER_IDS, { error: "That coworker doesn't exist." }),
  message: z.string().trim()
    .min(1, "Type or say something first.")
    .max(MAX_COWORKER_MESSAGE, `Keep your message under ${MAX_COWORKER_MESSAGE} characters.`),
  history: z.array(CoworkerMessageSchema).max(40).default([])
    .transform((turns) => turns.slice(-COWORKER_HISTORY_LIMIT)),
});

export type CoworkerMessage = z.infer<typeof CoworkerMessageSchema>;
export type CoworkerChatRequest = z.infer<typeof CoworkerChatRequestSchema>;

// What the talk panel can do with a reply. Always one of these typed actions, never text from the AI.
export type CoworkerAction = { type: "open-mission"; missionId: string };

export type CoworkerChatResponse = {
  reply: string;
  source: "ai" | "saved";
  // Why the answer is a saved line (no key, AI down, rate limit). Absent for AI answers.
  notice?: string;
  action?: CoworkerAction;
};

/** The response for a reply; an offer can only ever open this coworker's own mission. */
export function coworkerChatResponse(
  coworker: Coworker,
  { reply, offerMission }: CoworkerReply,
  source: CoworkerChatResponse["source"],
  notice?: string,
): CoworkerChatResponse {
  return {
    reply,
    source,
    ...(notice ? { notice } : {}),
    ...(offerMission ? { action: { type: "open-mission", missionId: coworker.missionId } } : {}),
  };
}
