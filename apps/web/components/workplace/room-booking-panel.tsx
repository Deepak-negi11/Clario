"use client";

import { useMemo, useState, type RefObject } from "react";
import { CalendarClock, DoorOpen } from "lucide-react";
import { BOOKING_MAX_SLOTS, BOOKING_TITLE_MAX, SLOT_MS, overlaps, roomStatus, slotOf, upcomingSlots, type Booking } from "@repo/shared";
import type { SceneBridge } from "../phaser/scene-bridge";
import { NoticeLine, WorkplaceDialog, field, focus, label, muted, primary, segment, timeOf } from "./panel-kit";
import { useNow, type Workplace } from "./use-workplace";

// The screen by a meeting room's door: whether it's free, who has it and until when, and a tap to
// book the next free slot (or another one from the list below, for up to 2 hours).

const SHOWN_SLOTS = 10;
const LENGTHS = [1, 2, 3, 4].slice(0, BOOKING_MAX_SLOTS);
const lengthLabel = (slots: number) => (slots === 1 ? "30 min" : `${slots / 2} h`);

export function RoomBookingPanel({
  bridgeRef,
  room,
  workplace,
  openedAt,
  onClose,
}: {
  bridgeRef: RefObject<SceneBridge>;
  room: { id: string; name: string };
  workplace: Workplace;
  openedAt: number;
  onClose: () => void;
}) {
  const { bookings, selfId, send, notice, clearNotice } = workplace;
  const now = useNow();
  const status = roomStatus(bookings, room.id, now);
  const slots = upcomingSlots(bookings, room.id, now, SHOWN_SLOTS);
  const [chosen, setChosen] = useState<number | null>(null);
  const [length, setLength] = useState(2);
  const [title, setTitle] = useState("");

  // The chosen start, or the next free slot, while it's still free and not in the past.
  const start = chosen !== null && chosen >= slotOf(now) && !busyAt(bookings, room.id, chosen) ? chosen : (status.free?.start ?? null);
  // How many slots in a row are free from there (up to the 2-hour limit).
  const run = useMemo(() => {
    if (start === null) return 0;
    let count = 0;
    while (count < BOOKING_MAX_SLOTS && !busyAt(bookings, room.id, start + count * SLOT_MS)) count++;
    return count;
  }, [bookings, room.id, start]);
  const slotsBooked = Math.min(length, run);
  const end = start === null ? null : start + slotsBooked * SLOT_MS;
  const mine = bookings.filter((booking) => booking.roomId === room.id && booking.userId === selfId && booking.end > now);

  const book = () => {
    if (start === null || end === null || !send) return;
    if (send({ action: "book", roomId: room.id, start, end, title: title.trim() })) {
      setChosen(null);
      setTitle("");
    }
  };

  const busy = status.current;
  return (
    <WorkplaceDialog bridgeRef={bridgeRef} name="room-booking" title={room.name} subtitle="Room screen" icon={DoorOpen} onClose={onClose}>
      <div className="grid gap-5 p-4 sm:grid-cols-[1.1fr_1fr]">
        <div className="flex flex-col gap-4">
          <div
            role="status"
            className={`rounded-2xl p-4 ${busy ? "bg-[#fbe9e7] text-[#8f2f2b]" : "bg-[#e6f4ea] text-[#1d6b3f]"}`}
          >
            <p className="text-2xl font-semibold tracking-tight">{busy ? "In use" : "Free"}</p>
            <p className="mt-1 text-[13px] leading-5">
              {busy
                ? `${busy.userId === selfId ? "You have it" : `${busy.name} has it`}${busy.title ? ` for ${busy.title}` : ""}, until ${timeOf(busy.end)}.`
                : status.next
                  ? `Free until ${timeOf(status.next.start)}.`
                  : "Free for the rest of the day."}
            </p>
            {status.next && busy && (
              <p className="mt-0.5 text-[13px] opacity-80">
                Next: {status.next.userId === selfId ? "you" : status.next.name} at {timeOf(status.next.start)}.
              </p>
            )}
          </div>

          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              book();
            }}
          >
            <div>
              <p className={label}>How long</p>
              <div role="group" aria-label="How long" className="mt-1 inline-flex gap-1 rounded-xl bg-[#f1f2f4] p-1">
                {LENGTHS.map((slots) => (
                  <button key={slots} type="button" aria-pressed={length === slots} disabled={slots > run} onClick={() => setLength(slots)} className={segment}>
                    {lengthLabel(slots)}
                  </button>
                ))}
              </div>
            </div>
            <label className={label}>
              What it&apos;s for <span className={`font-normal ${muted}`}>(optional)</span>
              <input value={title} maxLength={BOOKING_TITLE_MAX} onChange={(event) => setTitle(event.target.value)} placeholder="Design review…" autoComplete="off" name="booking-title" className={`${field} h-10`} />
            </label>
            <button type="submit" className={primary} disabled={start === null || end === null || slotsBooked === 0}>
              <CalendarClock size={16} aria-hidden="true" />
              {start === null || end === null ? "No free slots today" : `Book ${timeOf(start)} to ${timeOf(end)}`}
            </button>
            <NoticeLine notice={notice} since={openedAt} onDone={clearNotice} />
          </form>
        </div>

        <div>
          <h3 className="text-xs font-semibold text-[#12151c]">Today</h3>
          <ol className="mt-2 flex flex-col gap-1" aria-label={`${room.name} schedule`}>
            {slots.map((slot) => {
              const booking = slot.booking;
              const yours = booking?.userId === selfId;
              const picked = !booking && start !== null && end !== null && slot.start >= start && slot.start < end;
              return (
                <li key={slot.start}>
                  {booking ? (
                    <div className={`flex min-h-10 items-center gap-3 rounded-xl px-3 text-[13px] ${yours ? "bg-[#e8effd]" : "bg-[#f4f5f7]"}`}>
                      <span className="w-16 shrink-0 tabular-nums text-[#5c6371]">{timeOf(slot.start)}</span>
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-semibold">{yours ? "You" : booking.name}</span>
                        {booking.title && <span className={muted}> · {booking.title}</span>}
                      </span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      aria-pressed={picked}
                      onClick={() => setChosen(slot.start)}
                      className={`flex min-h-10 w-full cursor-pointer items-center gap-3 rounded-xl border px-3 text-left text-[13px] transition motion-reduce:transition-none ${picked ? "border-[#3a6ee8] bg-[#f3f6fe]" : "border-transparent hover:bg-[#f4f5f7]"} ${focus}`}
                    >
                      <span className="w-16 shrink-0 tabular-nums text-[#5c6371]">{timeOf(slot.start)}</span>
                      <span className={picked ? "font-semibold text-[#2f5ed0]" : muted}>{picked ? "Selected" : "Free"}</span>
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
          {mine.length > 0 && (
            <>
              <h3 className="mt-4 text-xs font-semibold text-[#12151c]">Your bookings here</h3>
              <ul className="mt-2 flex flex-col gap-1">
                {mine.map((booking) => (
                  <li key={booking.id} className="flex min-h-10 items-center gap-3 rounded-xl bg-[#e8effd] px-3 text-[13px]">
                    <span className="min-w-0 flex-1 truncate tabular-nums">
                      {timeOf(booking.start)} to {timeOf(booking.end)}
                      {booking.title && <span className={muted}> · {booking.title}</span>}
                    </span>
                    <button type="button" onClick={() => send?.({ action: "cancel-booking", id: booking.id })} className={`rounded-lg px-2 py-1 text-xs font-semibold text-[#2f5ed0] hover:bg-white ${focus}`}>
                      Cancel
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </WorkplaceDialog>
  );
}

function busyAt(bookings: readonly Booking[], roomId: string, start: number) {
  return bookings.some((booking) => booking.roomId === roomId && overlaps(booking, { start, end: start + SLOT_MS }));
}
