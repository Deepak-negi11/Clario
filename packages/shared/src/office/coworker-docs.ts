import * as z from "zod";
import { AiChoiceSchema } from "../ai/ai-providers";
import { toPlainText } from "../mentor/plain-text";
import { COWORKER_IDS, coworkerMission, type Coworker, type CoworkerId } from "../coworkers/coworkers";
import { LOCKER_BODY_MAX, LOCKER_TITLE_MAX } from "./lockers";

// Asking an AI coworker for a document ("the notes from the team sync", "your deploy checklist").
// They write it (POST /api/coworkers/document) and it lands in your locker. Without a working AI they
// leave one of their saved documents instead, picked by what you asked for.

export const COWORKER_ASK_MAX = 300;

export const CoworkerDocRequestSchema = z.object({
  coworkerId: z.enum(COWORKER_IDS, { error: "That coworker doesn't exist." }),
  ask: z.string().trim().min(3, "Say what you need.").max(COWORKER_ASK_MAX),
  ai: AiChoiceSchema.optional(),
});
export type CoworkerDocRequest = z.input<typeof CoworkerDocRequestSchema>;

export type CoworkerDoc = { title: string; body: string };
export type CoworkerDocResponse = CoworkerDoc & { source: "ai" | "saved"; notice?: string };

export function coworkerDocPrompt(coworker: Coworker): string {
  const { name, role, personality, formality } = coworkerMission(coworker).coworker;
  return [
    `You are ${name}, ${role} at Larkspur Labs, a fictional software company. Personality: ${personality}. Formality: ${formality}.`,
    `Right now: ${coworker.desk}`,
    "A teammate asked you for a short work document. Write it the way you would leave it in their locker: a real, useful document, not a chat reply.",
    "Rules: plain text only (no markdown symbols like # or **), short lines, at most about 250 words. Use simple dashes for lists.",
    "Invent believable specifics for this fictional company where needed, but never real people's personal details.",
    "Don't put a date or a version number in the title; say \"this morning\" or \"Friday\" in the text instead.",
    'Answer with JSON only: {"title": "a short document title", "body": "the document text"}.',
  ].join("\n");
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

// The coworker's answer, if it is a usable document.
export function readCoworkerDoc(raw: string): CoworkerDoc | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(raw.slice(start, end + 1)) as { title?: unknown; body?: unknown };
    if (typeof value.title !== "string" || typeof value.body !== "string") return null;
    const title = clip(toPlainText(value.title).replace(/\s+/g, " ").trim(), LOCKER_TITLE_MAX);
    const body = clip(value.body.replace(/\r/g, "").replace(/^#+\s*/gm, "").replace(/\*\*/g, "").trim(), LOCKER_BODY_MAX);
    return title && body.length >= 20 ? { title, body } : null;
  } catch {
    return null;
  }
}

// What each coworker leaves when there's no AI: their usual documents, matched by words in the ask.
const SAVED_DOCS: Record<CoworkerId, { words: string[]; title: string; body: string }[]> = {
  arjun: [
    {
      words: ["log", "staging", "bug", "login", "error", "500"],
      title: "Staging login bug: what the logs say",
      body: [
        "What I've found so far in the staging logs after this morning's deploy:",
        "",
        "- Logins fail with a 500 about one time in five, only on staging.",
        "- Every failure is a timeout getting a database connection from the pool.",
        "- It started with the deploy that raised the worker count from 4 to 8.",
        "",
        "My guess: more workers, same pool size, so they queue for connections.",
        "Next step: raise the pool size on staging and watch the error rate for an hour.",
        "",
        "If you're seeing something different, send me the exact error and the time.",
        "",
        "Arjun",
      ].join("\n"),
    },
    {
      words: ["deploy", "release", "checklist", "ship"],
      title: "Deploy checklist",
      body: [
        "Before you deploy:",
        "- Tests green on main, and the migration (if any) reviewed",
        "- Release notes drafted, with anything users will notice",
        "- Someone on the team knows you're deploying, and when",
        "",
        "After you deploy:",
        "- Watch the error rate and response times for 15 minutes",
        "- Click through login and the main flow yourself",
        "- Post in the team channel that it's out, with a link to the notes",
        "",
        "Arjun",
      ].join("\n"),
    },
  ],
  priya: [
    {
      words: ["release", "friday", "plan", "launch"],
      title: "Friday release plan",
      body: [
        "Plan for Friday's release:",
        "",
        "- Wednesday: code freeze at 5 pm. Only fixes for release blockers after that.",
        "- Thursday: QA pass on staging, morning. Go/no-go check at 3 pm.",
        "- Friday: release at 11 am, with Arjun on call until 6 pm.",
        "",
        "Blockers right now: the staging login bug (Arjun is on it).",
        "If you think something should hold the release, tell me by Thursday noon, with what breaks and for whom.",
        "",
        "Priya",
      ].join("\n"),
    },
    {
      words: ["priority", "priorities", "sprint", "ticket", "tickets", "triage"],
      title: "This sprint's priorities",
      body: [
        "In order:",
        "1. Fix the staging login bug before Friday.",
        "2. Finish the onboarding emails so they go out with the release.",
        "3. Triage new tickets daily: label, size, and assign by end of day.",
        "",
        "Anything else waits for next sprint unless a customer is blocked. When you're unsure, ask me early rather than late.",
        "",
        "Priya",
      ].join("\n"),
    },
  ],
  rahul: [
    {
      words: ["sync", "notes", "meeting", "standup"],
      title: "Team sync notes",
      body: [
        "Notes from this morning's sync:",
        "",
        "Decided:",
        "- The release stays on Friday.",
        "- Onboarding emails go out with it.",
        "",
        "Open questions:",
        "- Do we need a feature flag for the new settings page? (Rahul to check with support)",
        "",
        "Actions:",
        "- Arjun: staging login bug, update by Thursday",
        "- Priya: go/no-go check Thursday 3 pm",
        "- Rahul: release notes draft by Wednesday",
        "",
        "Rahul",
      ].join("\n"),
    },
    {
      words: ["roadmap", "plan", "quarter", "goal", "goals"],
      title: "Roadmap one-pager",
      body: [
        "Where we're heading this quarter:",
        "",
        "- Make onboarding take under five minutes for a new team.",
        "- Cut login and loading errors in half.",
        "- Ship team spaces with shared rooms and booking.",
        "",
        "How we'll know: time to first message for new teams, error rate, and weekly active teams.",
        "Feedback welcome, especially if something here doesn't match what customers ask for.",
        "",
        "Rahul",
      ].join("\n"),
    },
  ],
};

export function savedCoworkerDoc(coworkerId: CoworkerId, ask: string): CoworkerDoc {
  const docs = SAVED_DOCS[coworkerId];
  const words = ask.toLowerCase().split(/[^a-z0-9]+/);
  const best = docs.find((doc) => doc.words.some((word) => words.includes(word))) ?? docs[0]!;
  return { title: best.title, body: best.body };
}
