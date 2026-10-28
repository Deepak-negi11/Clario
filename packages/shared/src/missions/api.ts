import * as z from "zod";
import type { MissionFeedback } from "./rubric";

// POST /api/missions/send. The server keeps no conversation state: the browser sends the
// mission id and the draft, and counts tries itself (completion is decided by the rules in
// rubric.ts from the returned scores).

export const MAX_DRAFT_LENGTH = 2000;

export const MissionSendRequestSchema = z.object({
  missionId: z.string().min(1).max(64),
  draft: z.string().trim().min(1, "Write a message first.").max(MAX_DRAFT_LENGTH, "Keep the message under 2000 characters."),
});

export type MissionSendRequest = z.infer<typeof MissionSendRequestSchema>;

export type MissionSendResponse = {
  feedback: MissionFeedback;
  source: "ai" | "rules";           // who graded: the AI coach, or the rules engine as backup
  passed: boolean;
  reply: string | null;             // the coworker's answer; only sent when the message passed
  replySource: "ai" | "seeded" | null;
};
