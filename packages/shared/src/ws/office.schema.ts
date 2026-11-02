import * as z from "zod";
import { COWORKER_IDS } from "../coworkers/coworkers";
import { BOOKING_TITLE_MAX, BookingSchema } from "../office/booking";
import { LockerDraftSchema, LockerItemSchema } from "../office/lockers";
import { ShelfDraftSchema, ShelfItemSchema } from "../office/shelf";
import { BoardIdSchema, LineSchema, NoteSchema, StrokeSchema } from "../office/whiteboard";

// The shared office things: room bookings (office/booking.ts), whiteboards (office/whiteboard.ts),
// lockers (office/lockers.ts) and the kitchen shelf (office/shelf.ts). The server keeps them per
// space, so they're still there after everyone leaves, and checks every change.

const Id = z.string().min(1).max(64);

export const OfficeMessage = z.object({
  type: z.literal("office"),
  payload: z.discriminatedUnion("action", [
    // Bookings, the shelf and your locker, as they are now. Sent when the map opens.
    z.object({ action: z.literal("sync") }),
    z.object({ action: z.literal("book"), roomId: Id, start: z.number().int(), end: z.number().int(), title: z.string().trim().max(BOOKING_TITLE_MAX) }),
    z.object({ action: z.literal("cancel-booking"), id: Id }),
    // A board's strokes, for when you walk up to it.
    z.object({ action: z.literal("board-open"), board: BoardIdSchema }),
    z.object({ action: z.literal("draw"), board: BoardIdSchema, stroke: StrokeSchema }),
    z.object({ action: z.literal("undo"), board: BoardIdSchema }),
    z.object({ action: z.literal("wipe"), board: BoardIdSchema }),
    z.object({ action: z.literal("send"), to: Id, item: LockerDraftSchema }),
    // A document an AI coworker wrote for you, into your own locker.
    z.object({ action: z.literal("coworker-drop"), coworker: z.enum(COWORKER_IDS), item: LockerDraftSchema }),
    z.object({ action: z.literal("collect"), id: Id }),
    z.object({ action: z.literal("leave"), item: ShelfDraftSchema }),
    z.object({ action: z.literal("take"), id: Id }),
  ]),
});

// A board's marker lines and typed notes, each with who added it.
const SavedStrokeSchema = z.union([NoteSchema.extend({ by: Id }), LineSchema.extend({ by: Id })]);

export const OfficeBroadcast = z.object({
  type: z.literal("office"),
  payload: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("bookings"), bookings: z.array(BookingSchema) }),
    z.object({ kind: z.literal("board"), board: BoardIdSchema, strokes: z.array(SavedStrokeSchema) }),
    z.object({ kind: z.literal("stroke"), board: BoardIdSchema, stroke: SavedStrokeSchema }),
    z.object({ kind: z.literal("unstroke"), board: BoardIdSchema, id: z.string() }),
    z.object({ kind: z.literal("wiped"), board: BoardIdSchema, by: z.string() }),
    // Your locker (only ever sent to you).
    z.object({ kind: z.literal("locker"), items: z.array(LockerItemSchema) }),
    // Something new is in `userId`'s locker: that person asks for their locker again.
    z.object({ kind: z.literal("locker-ping"), userId: z.string() }),
    z.object({ kind: z.literal("shelf"), items: z.array(ShelfItemSchema) }),
    // A short line for the person who asked: "Booked", or why it couldn't be done.
    z.object({ kind: z.literal("notice"), ok: z.boolean(), text: z.string() }),
  ]),
});

export type OfficeClientMessage = z.input<typeof OfficeMessage>;
export type OfficeServerMessage = z.infer<typeof OfficeBroadcast>;
export type OfficeServerPayload = OfficeServerMessage["payload"];
