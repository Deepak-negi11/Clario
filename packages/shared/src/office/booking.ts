import * as z from "zod";

// Booking meeting rooms from the screen by their door. A day is cut into half-hour slots; you book
// one or more of them in a row, for a short title. Rules (checked here on both sides, and enforced
// by the server):
// - only meeting-type rooms can be booked (see isBookableRoom)
// - a booking starts on a slot boundary, lasts 1 to 4 slots (up to 2 hours), and starts no
//   earlier than the slot running now and no more than 12 hours ahead
// - bookings in one room never overlap
// - each person holds at most 3 bookings that haven't ended yet in a space

export const SLOT_MS = 30 * 60_000;
export const BOOKING_MAX_SLOTS = 4;
export const BOOKING_AHEAD_MS = 12 * 60 * 60_000;
export const BOOKINGS_PER_PERSON = 3;
export const BOOKING_TITLE_MAX = 60;

// Rooms whose name says they're for meeting or heads-down work.
const BOOKABLE_ROOM = /\b(meeting|conference|focus|board|huddle|workroom|call|phone|interview)\b/i;

export function isBookableRoom(name: string) {
  return BOOKABLE_ROOM.test(name);
}

const Id = z.string().min(1).max(64);

export const BookingSchema = z.object({
  id: Id,
  roomId: Id,
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  userId: Id,
  // Display name of the person who booked it, as it was when they booked.
  name: z.string().max(40),
  title: z.string().max(BOOKING_TITLE_MAX),
});
export type Booking = z.infer<typeof BookingSchema>;

export type BookingRequest = { roomId: string; start: number; end: number; userId: string };

// The start of the half-hour slot `ms` falls in.
export const slotOf = (ms: number) => Math.floor(ms / SLOT_MS) * SLOT_MS;

export const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) => a.start < b.end && b.start < a.end;

// Every slot start a booking covers.
export function slotsOf({ start, end }: { start: number; end: number }) {
  const slots: number[] = [];
  for (let at = start; at < end; at += SLOT_MS) slots.push(at);
  return slots;
}

// Why a booking can't be made, in words for the person trying, or null when it can.
export function bookingProblem(bookings: readonly Booking[], request: BookingRequest, now: number): string | null {
  const { roomId, start, end, userId } = request;
  if (start % SLOT_MS !== 0 || end % SLOT_MS !== 0 || end <= start) return "Pick a half-hour slot.";
  if ((end - start) / SLOT_MS > BOOKING_MAX_SLOTS) return "Rooms can be booked for up to 2 hours at a time.";
  if (start < slotOf(now)) return "That time has already gone.";
  if (start > now + BOOKING_AHEAD_MS) return "You can book up to 12 hours ahead.";
  const clash = bookings.find((booking) => booking.roomId === roomId && overlaps(booking, request));
  if (clash) return `${clash.name || "Someone"} has the room then.`;
  const mine = bookings.filter((booking) => booking.userId === userId && booking.end > now);
  if (mine.length >= BOOKINGS_PER_PERSON) return `You already hold ${BOOKINGS_PER_PERSON} bookings. Cancel one to book another.`;
  return null;
}

export type RoomStatus = {
  // The booking running now, if any.
  current: Booking | null;
  // The next one after now.
  next: Booking | null;
  // The first slot from now that's free, and how long it stays free (up to the 2-hour limit).
  free: { start: number; end: number } | null;
};

// What the door screen shows for a room.
export function roomStatus(bookings: readonly Booking[], roomId: string, now: number): RoomStatus {
  const here = bookings.filter((booking) => booking.roomId === roomId && booking.end > now).sort((a, b) => a.start - b.start);
  const current = here.find((booking) => booking.start <= now) ?? null;
  const next = here.find((booking) => booking.start > now) ?? null;
  let free: RoomStatus["free"] = null;
  for (let start = slotOf(now); start <= now + BOOKING_AHEAD_MS; start += SLOT_MS) {
    if (here.some((booking) => overlaps(booking, { start, end: start + SLOT_MS }))) continue;
    let end = start + SLOT_MS;
    while (end - start < BOOKING_MAX_SLOTS * SLOT_MS && !here.some((booking) => overlaps(booking, { start: end, end: end + SLOT_MS }))) end += SLOT_MS;
    free = { start, end };
    break;
  }
  return { current, next, free };
}

// The slots a door screen lists from now: each one free, or whose it is.
export function upcomingSlots(bookings: readonly Booking[], roomId: string, now: number, count: number) {
  const first = slotOf(now);
  return Array.from({ length: count }, (_, index) => {
    const start = first + index * SLOT_MS;
    const booking = bookings.find((each) => each.roomId === roomId && overlaps(each, { start, end: start + SLOT_MS })) ?? null;
    return { start, end: start + SLOT_MS, booking };
  });
}

// Bookings that have ended, which the server can forget.
export const stillRelevant = (bookings: readonly Booking[], now: number) => bookings.filter((booking) => booking.end > now);
