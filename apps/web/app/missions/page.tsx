"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { MISSIONS, PASS_SCORE } from "@repo/shared";
import { readRuns, readShowXp, saveShowXp, totalXp, type MissionRun } from "../../lib/missions/progress";

// Workplace Quest: the list of missions with progress (PS7_BUILD_BRIEF.md sections 6 and 11).
// Works without the map, with the keyboard and a screen reader.
export default function MissionsPage() {
  const [runs, setRuns] = useState<Record<string, MissionRun>>({});
  const [showXp, setShowXp] = useState(true);

  // Progress lives in this browser; it loads after the first render.
  useEffect(() => {
    setRuns(readRuns());
    setShowXp(readShowXp());
  }, []);

  const done = MISSIONS.filter((mission) => runs[mission.id]?.completed).length;

  return (
    <main className="min-h-dvh bg-[#1b1d2a] px-4 py-8 text-white">
      <div className="mx-auto max-w-3xl">
        <nav className="flex items-center justify-between text-xs text-white/70">
          <Link href="/spaces" className="rounded underline-offset-2 hover:text-white hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
            Back to spaces
          </Link>
          <Link href="/practice" className="rounded underline-offset-2 hover:text-white hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
            Practise with Maya
          </Link>
        </nav>

        <header className="mt-6">
          <h1 className="text-2xl font-semibold tracking-tight">Workplace Quest</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/70">
            Reply to coworkers at Larkspur Labs, a made-up company. A coach checks each message for clarity,
            completeness, tone and next action. Score {PASS_SCORE} or more in all four and your coworker answers.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <span className="font-semibold">
              {done} of {MISSIONS.length} done
            </span>
            {showXp && <span className="font-semibold tabular-nums text-[#7ee2a8]">{totalXp(runs)} XP</span>}
            <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-white/70">
              <input
                type="checkbox"
                checked={showXp}
                onChange={(event) => {
                  setShowXp(event.target.checked);
                  saveShowXp(event.target.checked);
                }}
                className="h-3.5 w-3.5 accent-white"
              />
              Show XP
            </label>
          </div>
        </header>

        <ol className="mt-6 grid gap-3 sm:grid-cols-2">
          {MISSIONS.map((mission, index) => {
            const run = runs[mission.id];
            const status = run?.completed ? "Done" : run && run.sends > 0 ? "In progress" : "New";
            return (
              <li key={mission.id}>
                <Link
                  href={`/missions/${mission.id}`}
                  className="flex h-full flex-col rounded-2xl bg-white p-4 text-[#12151c] shadow-[0_18px_44px_-24px_rgba(0,0,0,0.6)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transition-none"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#6b7280]">Mission {index + 1}</span>
                    <span
                      className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        status === "Done" ? "bg-[#e7f6ee] text-[#17663d]" : status === "In progress" ? "bg-[#fdf3e1] text-[#8a5a00]" : "bg-[#f1f3f6] text-[#4a505e]"
                      }`}
                    >
                      {status === "Done" && <CheckCircle2 size={12} aria-hidden="true" />}
                      {status}
                      {status === "Done" && showXp ? ` · +${run!.xp} XP` : ""}
                    </span>
                  </div>
                  <h2 className="mt-2 text-base font-semibold">{mission.title}</h2>
                  <p className="mt-0.5 text-xs text-[#6b7280]">
                    With {mission.coworker.name}, {mission.coworker.role}
                  </p>
                  <p className="mt-2 flex-1 text-[13px] leading-5 text-[#3b414c]">{mission.goal}</p>
                  <span className="mt-3 text-sm font-semibold text-[#3a6ee8]">{status === "Done" ? "Practise again" : status === "New" ? "Start" : "Continue"}</span>
                </Link>
              </li>
            );
          })}
        </ol>
      </div>
    </main>
  );
}
