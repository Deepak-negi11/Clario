import * as z from "zod";
import { COWORKER_IDS, type CoworkerId } from "../coworkers/coworkers";

// Mail and parcel lockers by reception: each person has a locker, and things sent to them wait
// there until they collect them.
// - a teammate in the space can send you a document (a title and some text) or a parcel (a label
//   saying what's inside, and a note)
// - an AI coworker (Arjun, Priya, Rahul) can leave you a document you asked them for. Coworker
//   items only ever go into your own locker, so nobody can send things in a coworker's name.
// - a locker holds 20 things; collect some to make room

export const LOCKER_KINDS = ["document", "parcel"] as const;
export type LockerKind = (typeof LOCKER_KINDS)[number];
export const LOCKER_MAX = 20;
export const LOCKER_TITLE_MAX = 80;
export const LOCKER_BODY_MAX = 4000;

const Id = z.string().min(1).max(64);

export const LockerSenderSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("person"), id: Id, name: z.string().max(40) }),
  z.object({ kind: z.literal("coworker"), id: z.enum(COWORKER_IDS) }),
]);
export type LockerSender = z.infer<typeof LockerSenderSchema>;

// What the sender fills in.
export const LockerDraftSchema = z.object({
  kind: z.enum(LOCKER_KINDS),
  title: z.string().trim().min(1).max(LOCKER_TITLE_MAX),
  body: z.string().max(LOCKER_BODY_MAX).default(""),
});
export type LockerDraft = z.input<typeof LockerDraftSchema>;

export const LockerItemSchema = z.object({
  id: Id,
  kind: z.enum(LOCKER_KINDS),
  title: z.string().max(LOCKER_TITLE_MAX),
  body: z.string().max(LOCKER_BODY_MAX),
  from: LockerSenderSchema,
  to: Id,
  at: z.number().int().nonnegative(),
});
export type LockerItem = z.infer<typeof LockerItemSchema>;

// Why `from` may not put something in `to`'s locker right now, or null.
export function lockerProblem(waiting: number, from: LockerSender, to: string, senderId: string): string | null {
  if (from.kind === "coworker" && to !== senderId) return "Coworkers only leave things in your own locker.";
  if (from.kind === "person" && from.id !== senderId) return "You can only send things as yourself.";
  if (waiting >= LOCKER_MAX) return "That locker is full until they collect a few things.";
  return null;
}

// What new people find waiting the first time they open their locker.
export const WELCOME_PACK: { from: CoworkerId; title: string; body: string } = {
  from: "priya",
  title: "Welcome pack: your first week",
  body: [
    "Hi, and welcome to the team!",
    "",
    "A few things that make the first week easier:",
    "- Book a meeting room from the screen by its door. Booked rooms show who has them and until when.",
    "- The whiteboards keep what's drawn on them, so sketch your ideas and they'll be there tomorrow.",
    "- Anything someone sends you lands here, in your locker. Collect it when you're ready.",
    "- The shelf in the kitchen is for snacks to share and things people have lost. Take what's yours.",
    "",
    "Ask Arjun about the backend, Rahul about the roadmap, and me about anything else.",
    "",
    "Priya",
  ].join("\n"),
};
