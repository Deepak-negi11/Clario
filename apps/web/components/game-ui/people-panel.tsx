"use client";

import { Footprints, X } from "lucide-react";
import { WORK_LEVEL_INFO, getChatRoomAtPosition, type MapTemplateId, type WorkLevel } from "@repo/shared";

export type PanelPerson = {
  id: string;
  name: string;
  isSelf: boolean;
  isNearby: boolean;
  position: { x: number; y: number } | null;
  /** Null until they pick one on the join screen. */
  level: WorkLevel | null;
};

const AVATAR_COLORS = ["#3a6ee8", "#d4675a", "#2c8c84", "#d29c33", "#7a5fd0", "#4caf6d"];

function colorFor(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]!;
}

export function PeoplePanel({
  people,
  mapTemplate,
  onWalkTo,
  onClose,
}: {
  people: PanelPerson[];
  mapTemplate: MapTemplateId;
  onWalkTo: (position: { x: number; y: number }) => void;
  onClose: () => void;
}) {
  return (
    <section
      aria-label="People"
      className="pointer-events-auto absolute left-[76px] top-3 z-[65] flex max-h-[calc(100dvh-1.5rem)] w-[min(18rem,calc(100vw-6rem))] flex-col overflow-hidden rounded-2xl border border-black/5 bg-white/95 text-[#12151c] shadow-[0_18px_44px_-18px_rgba(18,21,28,0.45)] backdrop-blur-md"
    >
      <header className="flex items-center justify-between border-b border-[#eceef1] px-4 py-3">
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

      <ul className="min-h-0 overflow-y-auto overscroll-contain p-2">
        {people.map((person) => {
          const room = person.position ? getChatRoomAtPosition(mapTemplate, person.position) : null;
          const where = person.isSelf ? "You" : person.isNearby ? "Nearby" : room?.name ?? "Hallway";
          return (
            <li key={person.id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-[#f4f5f7]">
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
                <span className={`block truncate text-[11px] ${person.isNearby ? "text-[#1f9d55]" : "text-[#8a909b]"}`}>{where}</span>
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
      <p className="border-t border-[#eceef1] px-4 py-2.5 text-[11px] leading-4 text-[#8a909b]">
        Walk up to someone to talk. Video starts when you are close.
      </p>
    </section>
  );
}
