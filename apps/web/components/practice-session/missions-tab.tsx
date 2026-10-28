"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, ChevronRight } from "lucide-react";
import { MISSIONS } from "@repo/shared";
import { MissionChat } from "../missions/mission-chat";
import { readRuns, readShowXp, totalXp, type MissionRun } from "../../lib/missions/progress";

// The Missions tab of the Practice Session: the Workplace Quest missions (a coworker's message,
// the learner's reply, coach feedback, retry, "Mission completed") inside Maya's panel, so they
// work on the map as well as on /missions. Progress is the same browser storage as /missions.
export function MissionsTab() {
  const [runs, setRuns] = useState<Record<string, MissionRun>>({});
  const [showXp, setShowXp] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const backRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLOListElement | null>(null);
  const lastOpenRef = useRef<string | null>(null);

  // Progress lives in this browser; it loads after the first render.
  useEffect(() => {
    setRuns(readRuns());
    setShowXp(readShowXp());
  }, []);

  // The button that was clicked disappears, so move focus somewhere sensible.
  useEffect(() => {
    if (openId) {
      backRef.current?.focus();
    } else if (lastOpenRef.current) {
      listRef.current?.querySelector<HTMLButtonElement>(`[data-mission="${lastOpenRef.current}"]`)?.focus();
    }
  }, [openId]);

  function open(id: string | null) {
    if (openId) lastOpenRef.current = openId;
    setOpenId(id);
  }

  const index = MISSIONS.findIndex((mission) => mission.id === openId);
  const mission = MISSIONS[index];

  if (mission) {
    const next = MISSIONS[index + 1];
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <button
          ref={backRef}
          type="button"
          onClick={() => open(null)}
          className="flex cursor-pointer items-center gap-1 border-b border-[#eceef1] px-4 py-2 text-left text-[12px] font-semibold text-[#5c6371] transition hover:bg-[#f7f8fa] hover:text-[#12151c] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#12151c]"
        >
          <ArrowLeft size={13} aria-hidden="true" />
          All missions
        </button>
        <div className="min-h-0 flex-1">
          <MissionChat
            key={mission.id}
            mission={mission}
            number={index + 1}
            showXp={showXp}
            embedded
            onRunChange={(run) => setRuns((current) => ({ ...current, [mission.id]: run }))}
            onNext={next ? () => open(next.id) : undefined}
          />
        </div>
      </div>
    );
  }

  const done = MISSIONS.filter((item) => runs[item.id]?.completed).length;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      <p className="text-[12px] leading-5 text-[#3b414c]">
        Reply to coworkers at Larkspur Labs. A coach checks each message for clarity, completeness, tone and next
        action, then you can try again. Pass all four and the coworker answers.
      </p>
      <p className="mt-2 flex items-center gap-3 text-[12px] font-semibold text-[#12151c]">
        <span>
          {done} of {MISSIONS.length} done
        </span>
        {showXp && <span className="tabular-nums text-[#17663d]">{totalXp(runs)} XP</span>}
      </p>

      <ol ref={listRef} className="mt-3 space-y-2">
        {MISSIONS.map((item, itemIndex) => {
          const run = runs[item.id];
          const status = run?.completed ? "Done" : run && run.sends > 0 ? "In progress" : "New";
          return (
            <li key={item.id}>
              <button
                type="button"
                data-mission={item.id}
                onClick={() => open(item.id)}
                className="group flex w-full cursor-pointer items-center gap-3 rounded-xl border border-[#e6e7ea] bg-white px-3 py-2.5 text-left transition hover:border-[#12151c]/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#12151c]"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-[#6b7280]">Mission {itemIndex + 1}</span>
                    <span
                      className={`flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-semibold ${
                        status === "Done"
                          ? "bg-[#e7f6ee] text-[#17663d]"
                          : status === "In progress"
                            ? "bg-[#fdf3e1] text-[#8a5a00]"
                            : "bg-[#f1f3f6] text-[#4a505e]"
                      }`}
                    >
                      {status === "Done" && <CheckCircle2 size={10} aria-hidden="true" />}
                      {status}
                      {status === "Done" && showXp ? ` · +${run!.xp} XP` : ""}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-[13px] font-semibold text-[#12151c]">{item.title}</span>
                  <span className="block truncate text-[11px] text-[#6b7280]">
                    With {item.coworker.name}, {item.coworker.role}
                  </span>
                </span>
                <ChevronRight size={16} className="shrink-0 text-[#9aa0aa] transition group-hover:text-[#12151c]" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
