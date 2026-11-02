"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { Server, X } from "lucide-react";
import { useMapOverlay } from "../../hooks/use-map-overlay";
import {
  RACK_TASKS,
  RACK_UNITS,
  startFeed,
  stepFeed,
  type RackJob,
  type RackLed,
} from "../../lib/maps/server-rack";
import {
  UNIT_FEED,
  rackReport,
  type UnitHealth,
} from "../../lib/maps/rack-report";
import type { SceneBridge } from "../phaser/scene-bridge";
import {
  ConnectProject,
  ProjectFeed,
  ProjectLabel,
  SiteRow,
  useRackProject,
} from "./rack-project";

// Opened at a server rack (E, its prompt card, or a click in 2D and 3D): the rack unit by unit,
// and what it is doing: the space's linked GitHub project (rack-project.tsx), or else a simulated
// feed of the routine jobs such a rack runs.

const focus =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
const glass =
  "bg-[#1b1d2a]/30 text-white shadow-[0_8px_24px_-14px_rgba(0,0,0,0.5)] ring-1 ring-white/30 backdrop-blur-[6px] [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]";
const eyebrow =
  "text-[10px] font-semibold uppercase tracking-[0.14em] text-white/80";
const LED: Record<RackLed, { color: string; ms: number }> = {
  link: { color: "#4ade80", ms: 380 },
  ok: { color: "#4ade80", ms: 0 },
  disk: { color: "#f2c14e", ms: 620 },
  power: { color: "#7fb0ff", ms: 0 },
};
// With a project linked, every light of a unit shows that unit's health.
const HEALTH: Record<UnitHealth, { color: string; ms: number; label: string }> =
  {
    ok: { color: "#4ade80", ms: 0, label: "OK" },
    busy: { color: "#4fa3ff", ms: 320, label: "Busy" },
    warn: { color: "#f2c14e", ms: 900, label: "Needs a look" },
    fail: { color: "#f05a4a", ms: 480, label: "Problem" },
    idle: { color: "#5a606e", ms: 0, label: "Not in use" },
  };
const time = (at: number) =>
  new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function Status({ job }: { job: RackJob }) {
  const [label, tone] =
    job.status === "running"
      ? [job.retried ? "Retrying" : "Running", "bg-[#3a6ee8]"]
      : job.status === "failed"
        ? ["Failed", "bg-[#c0573f]"]
        : [job.retried ? "Done on retry" : "Done", "bg-[#2f8f5b]"];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-semibold ${tone}`}
    >
      {job.status === "running" && (
        <span
          className="h-1.5 w-1.5 rounded-full bg-white motion-safe:animate-pulse"
          aria-hidden="true"
        />
      )}
      {label}
    </span>
  );
}

export function ServerRackPanel({
  bridgeRef,
  spaceId,
}: {
  bridgeRef: RefObject<SceneBridge>;
  // Without it (no space), only the simulated feed shows.
  spaceId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [unit, setUnit] = useState(RACK_UNITS[0]!.id);
  // The unit clicked: the feed shows only its rows.
  const [picked, setPicked] = useState<string | null>(null);
  const [jobs, setJobs] = useState<RackJob[]>([]);
  const [now, setNow] = useState(0);
  const { project, problem, save } = useRackProject(spaceId, open);
  const activity = project?.activity ?? null;
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const bridge = bridgeRef.current;
    const show = () => {
      triggerRef.current = document.activeElement as HTMLElement | null;
      setJobs(startFeed(Date.now()));
      setNow(Date.now());
      setOpen(true);
    };
    bridge.openServerRack = show;
    return () => {
      if (bridge.openServerRack === show) bridge.openServerRack = undefined;
    };
  }, [bridgeRef]);
  useMapOverlay(bridgeRef, "server-rack", open);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    // Escape closes it even when focus has left the panel.
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const timer = window.setInterval(() => {
      setNow(Date.now());
      setJobs((list) => stepFeed(list, Date.now()));
    }, 1000);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("keydown", onKey);
      triggerRef.current?.focus();
    };
  }, [open]);
  if (!open) return null;
  const active = RACK_UNITS.find((each) => each.id === unit)!;
  const report = rackReport(project, now);
  const live = report?.[active.id];
  const pickedUnit =
    report && picked
      ? RACK_UNITS.find((each) => each.id === picked)
      : undefined;
  return (
    <div
      // Anchored at the top, so the rack stays put when the feed below it grows or shrinks.
      className="absolute inset-0 z-[100] grid items-start justify-items-center p-3 pt-[max(0.75rem,6dvh)]"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          setOpen(false);
        }
        if (event.key === "Tab") {
          const fields = [
            ...event.currentTarget.querySelectorAll<HTMLElement>(
              "button:not(:disabled),input,a[href]",
            ),
          ];
          const first = fields[0],
            last = fields.at(-1);
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`flex max-h-[calc(100dvh-max(0.75rem,6dvh)-0.75rem)] w-[min(40rem,100%)] flex-col overflow-hidden rounded-2xl ${glass}`}
      >
        <header className="flex items-center gap-2.5 border-b border-white/20 p-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#3a6ee8]">
            <Server size={17} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-[13px] font-semibold">
              Server rack
            </h2>
            <p className="truncate text-[11px] text-white/90">
              A typical small office rack, top to bottom
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close server rack"
            onClick={() => setOpen(false)}
            className={`grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg text-white/85 transition hover:bg-black/20 hover:text-white motion-reduce:transition-none ${focus}`}
          >
            <X size={16} />
          </button>
        </header>
        <div className="grid min-h-0 gap-3 overflow-y-auto p-3 sm:grid-cols-[15rem_1fr]">
          <div>
            <ul
              aria-label="Rack units"
              className="grid gap-px rounded-lg bg-black/40 p-1.5 ring-1 ring-white/20"
            >
              {RACK_UNITS.map((each) => (
                <li key={each.id}>
                  <button
                    type="button"
                    aria-pressed={
                      report ? each.id === picked : each.id === unit
                    }
                    onPointerEnter={(event) => {
                      if (event.pointerType === "mouse") setUnit(each.id);
                    }}
                    onFocus={() => setUnit(each.id)}
                    onClick={() => {
                      setUnit(each.id);
                      setPicked((was) => (was === each.id ? null : each.id));
                    }}
                    className={`flex w-full cursor-pointer items-center gap-1.5 rounded-[3px] border-x-[3px] border-[#5a606e] px-1.5 text-left text-[10px] [text-shadow:none] ${each.size === 2 ? "h-11" : "h-[22px]"} ${each.id === (report ? (picked ?? unit) : unit) ? "bg-[#454b5a] ring-1 ring-white/70" : each.id === "blank" ? "bg-[#1d2028]" : "bg-[#2e323d]"} ${focus}`}
                  >
                    <span className="flex w-10 shrink-0 flex-wrap gap-[3px]">
                      {each.leds.map((led, i) => {
                        const health = report?.[each.id]?.health;
                        const color = health
                          ? HEALTH[health].color
                          : LED[led].color;
                        // A healthy unit keeps its usual blinking; others blink at their own pace.
                        const ms =
                          health && health !== "ok"
                            ? HEALTH[health].ms
                            : LED[led].ms;
                        return (
                          <span
                            key={i}
                            className="rack-led h-1 w-1 rounded-full"
                            style={{
                              background: color,
                              boxShadow:
                                health === "idle" ? "none" : `0 0 4px ${color}`,
                              animationDuration: ms
                                ? `${ms + i * 170}ms`
                                : undefined,
                              animationName: ms ? "rack-blink" : "none",
                            }}
                            aria-hidden="true"
                          />
                        );
                      })}
                    </span>
                    {report?.[each.id] && (
                      <span className="sr-only">
                        , {HEALTH[report[each.id]!.health].label}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-white/90">
                      {each.name}
                    </span>
                    <span className="text-[9px] text-white/50">
                      {each.size}U
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <p
              aria-live="polite"
              className="mt-2 min-h-[4.5rem] text-[11px] leading-4 text-white/90"
            >
              <span className="font-semibold text-white">{active.name}</span>
              <span className="block text-[10px] text-white/75">
                {active.spec}
              </span>
              {active.what}
            </p>
            {live && (
              <div
                aria-live="polite"
                className="mt-1.5 rounded-lg bg-black/25 px-2 py-1.5 text-[11px] leading-4"
              >
                <p className="flex items-center gap-1.5 text-[10px] font-semibold">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: HEALTH[live.health].color }}
                    aria-hidden="true"
                  />
                  In your project · {HEALTH[live.health].label}
                </p>
                {live.lines.map((line) => (
                  <p key={line} className="mt-0.5 text-white/90">
                    {line}
                  </p>
                ))}
                <p className="mt-1 text-[10px] text-white/70">
                  Click a part to show only its rows in the feed.
                </p>
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <h3 className={`${eyebrow} shrink-0`}>What it’s doing now</h3>
              {activity ? (
                <ProjectLabel activity={activity} now={now} />
              ) : (
                <span className="text-[9px] text-white/70">
                  Simulated · sped up
                </span>
              )}
            </div>
            {activity ? (
              <ProjectFeed
                activity={activity}
                site={project?.site ?? null}
                now={now}
                unit={
                  pickedUnit && UNIT_FEED[pickedUnit.id]
                    ? {
                        name: pickedUnit.name,
                        kinds: UNIT_FEED[pickedUnit.id]!,
                      }
                    : null
                }
                onClearUnit={() => setPicked(null)}
              />
            ) : (
              <>
                {/* A website without a repo: its health check, over the simulated jobs. */}
                {project?.site && (
                  <ol className="mb-1 grid grid-cols-1 gap-1">
                    <SiteRow site={project.site} now={now} />
                  </ol>
                )}
                <ol aria-label="Recent jobs" className="grid gap-1">
                  {jobs.map((job) => {
                    const task = RACK_TASKS[job.task];
                    return (
                      <li
                        key={job.id}
                        className="flex items-start gap-2 rounded-lg bg-black/20 px-2 py-1.5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[11px] font-semibold">
                            {task.name}
                          </p>
                          <p className="truncate text-[10px] text-white/85">
                            {job.status === "failed"
                              ? `${task.failed}, retrying`
                              : job.status === "done"
                                ? task.done
                                : task.running}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-0.5">
                          <Status job={job} />
                          <time
                            dateTime={new Date(job.at).toISOString()}
                            className="text-[9px] tabular-nums text-white/70"
                          >
                            {time(job.at)}
                          </time>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </>
            )}
            {project && <ConnectProject project={project} save={save} />}
            {!project && problem && (
              <p className="mt-2 text-[10px] text-white/80">{problem}</p>
            )}
          </div>
        </div>
      </section>
      <style>{`@keyframes rack-blink { 0%, 100% { opacity: 1; } 45% { opacity: 0.25; } } .rack-led { animation-iteration-count: infinite; animation-timing-function: steps(2, jump-none); } @media (prefers-reduced-motion: reduce) { .rack-led { animation: none !important; } }`}</style>
    </div>
  );
}
