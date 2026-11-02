"use client";

import { useState } from "react";
import { Footprints, X } from "lucide-react";
import {
  WORK_LEVEL_INFO, clockTime, getChatRoomAtPosition,
  type AttendanceEntry, type DaySummary, type MapTemplateId, type WorkLevel,
} from "@repo/shared";
import { useDraggablePanel } from "../../hooks/use-draggable-panel";
import { PanelDragHandle, draggableHeader } from "./panel-drag-handle";

export type PanelPerson = {
  id: string;
  name: string;
  isSelf: boolean;
  isNearby: boolean;
  position: { x: number; y: number } | null;
  /** Null until they pick one on the join screen. */
  level: WorkLevel | null;
};

/** Who badged in at the front door today (hooks/use-badge-and-notices.ts). */
export type PeopleAttendance = {
  /** Each person's latest visit; open (outAt null) while they are in. */
  latest: Record<string, AttendanceEntry>;
  /** When people badged in just now, for a short glow on their row. */
  arrivals: Record<string, number>;
  today: DaySummary[];
  selfIn: boolean;
  onBadgeIn: () => void;
  onBadgeOut: () => void;
};

const AVATAR_COLORS = ["#3a6ee8", "#d4675a", "#2c8c84", "#d29c33", "#7a5fd0", "#4caf6d"];

function colorFor(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]!;
}

const shortName = (name: string) => (name.length > 20 ? `${name.slice(0, 20)}...` : name);

export function PeoplePanel({
  people,
  mapTemplate,
  attendance,
  onWalkTo,
  onClose,
}: {
  people: PanelPerson[];
  mapTemplate: MapTemplateId;
  attendance?: PeopleAttendance;
  onWalkTo: (position: { x: number; y: number }) => void;
  onClose: () => void;
}) {
  const drag = useDraggablePanel("people");
  const [view, setView] = useState<"here" | "today">("here");
  const showToday = !!attendance && view === "today";

  return (
    <section
      ref={drag.ref}
      aria-label="People"
      className="pointer-events-auto absolute left-[76px] top-3 z-[65] flex max-h-[calc(100dvh-1.5rem)] w-[min(18rem,calc(100vw-6rem))] flex-col overflow-hidden rounded-2xl border border-black/5 bg-white/95 text-[#12151c] shadow-[0_18px_44px_-18px_rgba(18,21,28,0.45)] backdrop-blur-md"
    >
      <header {...drag.headerProps} className={`${draggableHeader} flex items-center justify-between border-b border-[#eceef1] px-4 py-3`}>
        <PanelDragHandle label="Move people panel" {...drag.handleProps} />
        <h2 className="text-sm font-semibold">
          People <span className="font-medium text-[#8a909b] tabular-nums">· {people.length}</span>
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close people"
          className="grid h-7 w-7 cursor-pointer place-items-center rounded-lg text-[#8a909b] transition hover:bg-[#f4f5f7] hover:text-[#12151c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#12151c]"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </header>

      {attendance && (
        <div role="tablist" aria-label="People view" className="mx-3 mt-2.5 grid grid-cols-2 gap-1 rounded-xl bg-[#f1f2f5] p-1">
          {(["here", "today"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={view === tab}
              onClick={() => setView(tab)}
              className={`cursor-pointer rounded-lg py-1.5 text-[12px] font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#12151c] ${
                view === tab ? "bg-white text-[#12151c] shadow-[0_1px_3px_rgba(18,21,28,0.12)]" : "text-[#6b7280] hover:text-[#12151c]"
              }`}
            >
              {tab === "here" ? "Here now" : `Today · ${attendance.today.length}`}
            </button>
          ))}
        </div>
      )}

      {showToday ? (
        <TodayView attendance={attendance} />
      ) : (
        <ul className="min-h-0 overflow-y-auto overscroll-contain p-2">
          {people.map((person) => {
            const room = person.position ? getChatRoomAtPosition(mapTemplate, person.position) : null;
            const where = person.isSelf ? "You" : person.isNearby ? "Nearby" : room?.name ?? "Hallway";
            const visit = attendance?.latest[person.id];
            const inOffice = visit?.outAt === null;
            const arriving = inOffice && attendance?.arrivals[person.id] !== undefined;
            return (
              <li
                key={person.id}
                className={`flex items-center gap-3 rounded-xl px-2 py-2 transition-colors duration-1000 motion-reduce:transition-none ${
                  arriving ? "bg-[#e7f8ee] ring-1 ring-inset ring-[#34d399]/60" : "hover:bg-[#f4f5f7]"
                }`}
              >
                <span
                  className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-semibold text-white"
                  style={{ backgroundColor: colorFor(person.id) }}
                  aria-hidden="true"
                >
                  {person.name.trim().charAt(0).toUpperCase() || "?"}
                  <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-[#22c55e]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-[13px] font-semibold">{person.name}</span>
                    {person.level && (
                      <span className="shrink-0 rounded-md bg-[#eef0f3] px-1.5 py-px text-[10px] font-semibold text-[#4b5260]">
                        {WORK_LEVEL_INFO[person.level].label}
                      </span>
                    )}
                  </span>
                  <span className="flex min-w-0 items-center gap-1.5 text-[11px]">
                    <span className={`truncate ${person.isNearby ? "text-[#1f9d55]" : "text-[#8a909b]"}`}>{where}</span>
                    {inOffice && visit && (
                      <span
                        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#e7f8ee] px-1.5 py-px font-semibold text-[#137a43]"
                        title={`Badged in at ${clockTime(visit.inAt)}`}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e] shadow-[0_0_6px_rgba(34,197,94,0.8)]" aria-hidden="true" />
                        In office <span className="font-mono tabular-nums">{clockTime(visit.inAt)}</span>
                      </span>
                    )}
                  </span>
                </span>
                {!person.isSelf && person.position && (
                  <button
                    type="button"
                    onClick={() => onWalkTo(person.position!)}
                    aria-label={`Walk to ${person.name}`}
                    title={`Walk to ${person.name}`}
                    className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg text-[#5c6371] transition hover:bg-[#12151c] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#12151c]"
                  >
                    <Footprints size={15} aria-hidden="true" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="border-t border-[#eceef1] px-4 py-2.5 text-[11px] leading-4 text-[#8a909b]">
        {showToday
          ? "Only people in this space see this list, and only the times in and out."
          : "Walk up to someone to talk. Video starts when you are close."}
      </p>
    </section>
  );
}

// Who came in today and when, from the front-door badge reader, with your own badge button.
function TodayView({ attendance }: { attendance: PeopleAttendance }) {
  const { today, selfIn, onBadgeIn, onBadgeOut } = attendance;
  return (
    <div className="flex min-h-0 flex-col">
      <div className="mx-3 mt-2.5 flex items-center justify-between gap-2 rounded-xl border border-[#eceef1] px-3 py-2">
        <span className="flex min-w-0 items-center gap-2 text-[12px] font-medium text-[#4b5260]">
          <span
            aria-hidden="true"
            className={`h-2 w-2 shrink-0 rounded-full ${selfIn ? "bg-[#22c55e] shadow-[0_0_6px_rgba(34,197,94,0.8)]" : "bg-[#c4c8cf]"}`}
          />
          <span className="truncate">{selfIn ? "You're badged in" : "Not badged in yet"}</span>
        </span>
        <button
          type="button"
          onClick={selfIn ? onBadgeOut : onBadgeIn}
          className="shrink-0 cursor-pointer rounded-lg bg-[#12151c] px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-[#2a2f3a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12151c] active:scale-95"
        >
          {selfIn ? "Badge out" : "Badge in"}
        </button>
      </div>
      {today.length === 0 ? (
        <p className="px-4 py-6 text-center text-[12px] leading-5 text-[#8a909b]">
          Nobody has badged in today. The reader is by the front door.
        </p>
      ) : (
        <ol className="min-h-0 overflow-y-auto overscroll-contain p-2" aria-label="Badged in today">
          {today.map((row) => (
            <li key={row.userId} className="flex items-center gap-3 rounded-xl px-2 py-1.5">
              <span
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-semibold text-white"
                style={{ backgroundColor: colorFor(row.userId) }}
                aria-hidden="true"
              >
                {row.name.trim().charAt(0).toUpperCase() || "?"}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{shortName(row.name)}</span>
              <span className="shrink-0 text-right font-mono text-[11px] tabular-nums text-[#4b5260]">
                {clockTime(row.firstIn)}
                <span className="text-[#b0b5be]"> – </span>
                {row.lastOut === null ? <span className="font-sans font-semibold text-[#137a43]">in</span> : clockTime(row.lastOut)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
