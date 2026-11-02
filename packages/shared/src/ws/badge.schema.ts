import * as z from "zod";

// The badge reader at the front door. Badging in starts a visit; badging out, or leaving the space,
// ends it. The server keeps each visit (who, when they came in, when they left, nothing else) per
// space, and only people in that space see them.

// The furthest back a "today" list may start: a day plus the widest gap between time zones.
export const ATTENDANCE_LOOKBACK_MS = 2 * 24 * 60 * 60 * 1000;
// Most visits one "today" list carries.
export const ATTENDANCE_LIST_MAX = 300;

export const AttendanceEntrySchema = z.object({
  id: z.string().max(64),
  userId: z.string().max(64),
  // The name the space already shows for them.
  name: z.string().max(64),
  inAt: z.number(),
  // Null while they are still in.
  outAt: z.number().nullable(),
});
export type AttendanceEntry = z.infer<typeof AttendanceEntrySchema>;

// in: badge in (if you are in already, nothing changes). out: badge out. today: send me the
// visits that started since `since`, the start of your day (ms).
export const BadgeMessage = z.object({
  type: z.literal("badge"),
  payload: z.discriminatedUnion("action", [
    z.object({ action: z.literal("in") }),
    z.object({ action: z.literal("out") }),
    z.object({ action: z.literal("today"), since: z.number().int().nonnegative() }),
  ]),
});

// Someone came in or left (everyone in the space hears it, you included). `fresh` is false when
// you badged in while already in: only you hear that one. today: the answer to your "today".
export const BadgeBroadcast = z.object({
  type: z.literal("badge"),
  payload: z.discriminatedUnion("event", [
    z.object({ event: z.literal("in"), entry: AttendanceEntrySchema, fresh: z.boolean() }),
    z.object({ event: z.literal("out"), entry: AttendanceEntrySchema }),
    z.object({ event: z.literal("today"), since: z.number(), entries: z.array(AttendanceEntrySchema).max(ATTENDANCE_LIST_MAX) }),
  ]),
});

export type BadgeMessage = z.infer<typeof BadgeMessage>;
export type BadgeBroadcast = z.infer<typeof BadgeBroadcast>;
