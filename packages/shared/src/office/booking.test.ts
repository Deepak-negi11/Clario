import { describe, expect, test } from "bun:test";
import { BOOKING_AHEAD_MS, SLOT_MS, bookingProblem, isBookableRoom, roomStatus, slotOf, slotsOf, upcomingSlots, type Booking } from "./booking";

// 10:00 on some day, plus a little, so "now" sits inside the 10:00 slot.
const TEN = Date.UTC(2026, 10, 3, 10, 0);
const now = TEN + 7 * 60_000;

const booking = (over: Partial<Booking>): Booking => ({
  id: "b1", roomId: "meet", start: TEN, end: TEN + SLOT_MS, userId: "asha", name: "Asha", title: "Sync", ...over,
});

describe("which rooms can be booked", () => {
  test("meeting-type rooms", () => {
    for (const name of ["Meeting Room 1", "Conference Room", "Focus Room 2", "Huddle", "Boardroom room", "Phone booth"]) {
      expect(isBookableRoom(name)).toBe(name !== "Boardroom room");
    }
    for (const name of ["Kitchen", "Lounge", "Open Desks", "Game Room", "Reception"]) expect(isBookableRoom(name)).toBe(false);
  });
});

describe("making a booking", () => {
  const ask = (start: number, end: number, userId = "ben") => ({ roomId: "meet", start, end, userId });

  test("the slot running now and later ones are fine", () => {
    expect(bookingProblem([], ask(TEN, TEN + SLOT_MS), now)).toBeNull();
    expect(bookingProblem([], ask(TEN + 2 * SLOT_MS, TEN + 6 * SLOT_MS), now)).toBeNull();
  });

  test("on slot boundaries only, up to 2 hours", () => {
    expect(bookingProblem([], ask(TEN + 60_000, TEN + SLOT_MS), now)).toBe("Pick a half-hour slot.");
    expect(bookingProblem([], ask(TEN, TEN), now)).toBe("Pick a half-hour slot.");
    expect(bookingProblem([], ask(TEN, TEN + 5 * SLOT_MS), now)).toMatch(/up to 2 hours/);
  });

  test("not in the past, and not too far ahead", () => {
    expect(bookingProblem([], ask(TEN - SLOT_MS, TEN), now)).toBe("That time has already gone.");
    const far = slotOf(now + BOOKING_AHEAD_MS) + SLOT_MS;
    expect(bookingProblem([], ask(far, far + SLOT_MS), now)).toMatch(/12 hours/);
  });

  test("never over someone else's booking", () => {
    const held = [booking({ start: TEN + SLOT_MS, end: TEN + 3 * SLOT_MS })];
    expect(bookingProblem(held, ask(TEN, TEN + 2 * SLOT_MS), now)).toBe("Asha has the room then.");
    expect(bookingProblem(held, ask(TEN, TEN + SLOT_MS), now)).toBeNull();
    expect(bookingProblem(held, ask(TEN + 3 * SLOT_MS, TEN + 4 * SLOT_MS), now)).toBeNull();
    // Another room is a different matter.
    expect(bookingProblem(held, { ...ask(TEN, TEN + 2 * SLOT_MS), roomId: "focus" }, now)).toBeNull();
  });

  test("three bookings each at most", () => {
    const mine = [0, 1, 2].map((index) => booking({ id: `m${index}`, roomId: `r${index}`, userId: "ben", start: TEN + index * SLOT_MS, end: TEN + (index + 1) * SLOT_MS }));
    expect(bookingProblem(mine, ask(TEN + 5 * SLOT_MS, TEN + 6 * SLOT_MS), now)).toMatch(/already hold 3/);
    // Ones that have ended don't count.
    const old = mine.map((each) => ({ ...each, start: each.start - 10 * SLOT_MS, end: each.end - 10 * SLOT_MS }));
    expect(bookingProblem(old, ask(TEN + 5 * SLOT_MS, TEN + 6 * SLOT_MS), now)).toBeNull();
  });
});

describe("the door screen", () => {
  test("a free room offers the slot running now, as long as it stays free", () => {
    expect(roomStatus([], "meet", now)).toEqual({ current: null, next: null, free: { start: TEN, end: TEN + 4 * SLOT_MS } });
  });

  test("a busy room says who has it, and the first free slot after", () => {
    const held = [booking({ end: TEN + 2 * SLOT_MS }), booking({ id: "b2", start: TEN + 3 * SLOT_MS, end: TEN + 4 * SLOT_MS, name: "Ben" })];
    const status = roomStatus(held, "meet", now);
    expect(status.current?.name).toBe("Asha");
    expect(status.next?.name).toBe("Ben");
    // Free for one slot between them.
    expect(status.free).toEqual({ start: TEN + 2 * SLOT_MS, end: TEN + 3 * SLOT_MS });
  });

  test("lists each slot as free or whose it is", () => {
    const slots = upcomingSlots([booking({ start: TEN + SLOT_MS, end: TEN + 2 * SLOT_MS })], "meet", now, 3);
    expect(slots.map((slot) => slot.booking?.name ?? null)).toEqual([null, "Asha", null]);
    expect(slots[0]!.start).toBe(TEN);
  });

  test("slots a booking covers", () => {
    expect(slotsOf({ start: TEN, end: TEN + 3 * SLOT_MS })).toEqual([TEN, TEN + SLOT_MS, TEN + 2 * SLOT_MS]);
  });
});
