"use client";

import { useEffect, useId, useState, type RefObject } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  Coffee,
  Coins,
  Flag,
  Navigation2,
  Sparkles,
  Timer,
  Trophy,
  X,
  Zap,
} from "lucide-react";
import {
  ERRANDS,
  ERRAND_BADGES,
  getChatRoom,
  levelFor,
  runSeconds,
  type Errand,
  type ErrandProgress,
  type ErrandRun,
} from "@repo/shared";
import { useMapOverlay } from "../../hooks/use-map-overlay";
import type { SceneBridge } from "../phaser/scene-bridge";
import type { ErrandCelebration } from "../../hooks/use-errands";
import { useDraggablePanel } from "../../hooks/use-draggable-panel";
import { PanelDragHandle, draggableHeader } from "./panel-drag-handle";

const focus =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
const glass =
  "bg-[#1b1d2a]/30 text-white shadow-[0_8px_24px_-14px_rgba(0,0,0,0.5)] ring-1 ring-white/30 backdrop-blur-[6px] [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]";
const primary = `inline-flex min-h-8 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-[#3a6ee8] px-3 text-xs font-semibold text-white transition hover:bg-[#2f5ed0] disabled:cursor-default disabled:opacity-40 motion-reduce:transition-none ${focus}`;
const quiet = `inline-flex min-h-8 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 text-xs text-white/85 transition hover:bg-black/20 hover:text-white motion-reduce:transition-none ${focus}`;
const closeButton = `${quiet} h-8 w-8 shrink-0 px-0`;
const eyebrow =
  "text-[10px] font-semibold uppercase tracking-[0.14em] text-white/80";
const roomName = (id: string) => getChatRoom("clario-hq", id)?.name ?? id;
const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
const QuestIcon = ({ errand }: { errand: Errand }) => {
  const Icon = errand.steps.some((step) => step.action === "read")
    ? BookOpen
    : errand.steps.some((step) => step.action === "sip")
      ? Coffee
      : Flag;
  return <Icon size={17} aria-hidden="true" />;
};

export function ErrandsPanel({
  progress,
  run,
  onStart,
  onCancel,
  onClose,
}: {
  progress: ErrandProgress;
  run: ErrandRun | null;
  onStart: (errandId: string) => void;
  onCancel: () => void;
  onClose: () => void;
}) {
  const titleId = useId(),
    [completed, setCompleted] = useState(false);
  const { level, into, needed } = levelFor(progress.xp);
  const active = run
    ? ERRANDS.find((errand) => errand.id === run.errandId)
    : null;
  const recommendation = ERRANDS.find((errand) => !progress.done[errand.id]);
  const doneCount = ERRANDS.filter((errand) => progress.done[errand.id]).length;
  const shown = ERRANDS.filter((errand) =>
    completed ? progress.done[errand.id] : !progress.done[errand.id],
  );
  const drag = useDraggablePanel("errands");
  return (
    <section
      ref={drag.ref}
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") onClose();
      }}
      className={`pointer-events-auto absolute left-[76px] top-3 z-[65] flex max-h-[calc(100dvh-1.5rem)] w-[min(22rem,calc(100vw-6rem))] flex-col overflow-hidden rounded-2xl ${glass}`}
    >
      <header
        {...drag.headerProps}
        className={`${draggableHeader} flex items-center gap-2 border-b border-white/25 px-3.5 py-2.5`}
      >
        <PanelDragHandle label="Move quests panel" {...drag.handleProps} />
        <div className="flex-1">
          <p className={eyebrow}>Make yourself at home</p>
          <h2 id={titleId} className="mt-0.5 text-sm font-semibold">
            Office quests
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close quests"
          className={closeButton}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </header>
      <div className="min-h-0 overflow-y-auto overscroll-contain">
        <div className="px-3.5 py-3">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold">Level {level}</span>
            <span className="flex items-center gap-3 text-white/90">
              <span className="flex items-center gap-1">
                <Zap size={13} className="text-white" aria-hidden="true" />
                {progress.xp} XP
              </span>
              <span className="flex items-center gap-1">
                <Coins
                  size={13}
                  className="text-[#e9c98f]"
                  aria-hidden="true"
                />
                {progress.coins}
              </span>
            </span>
          </div>
          <div
            role="progressbar"
            aria-label={`XP towards level ${level + 1}`}
            aria-valuemin={0}
            aria-valuemax={needed}
            aria-valuenow={into}
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/25"
          >
            <div
              className="h-full rounded-full bg-[#3a6ee8] transition-[width] motion-reduce:transition-none"
              style={{ width: `${(into / needed) * 100}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-white/85">
            {needed - into} XP to your next level · {doneCount} of{" "}
            {ERRANDS.length} quests complete
          </p>
        </div>
        {active && run && (
          <div className="mx-3 mb-2.5 rounded-xl border border-white/35 bg-black/20 p-2.5">
            <p className={eyebrow}>
              In progress · Step{" "}
              {Math.min(run.step + 1, active.steps.length + 1)} of{" "}
              {active.steps.length + 1}
            </p>
            <p className="mt-1 text-[13px] font-semibold">{active.title}</p>
            <p className="mt-0.5 text-xs leading-[18px] text-white/90">
              {active.steps[run.step]?.label ??
                `Choose your message to ${active.message.to}`}
            </p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <button type="button" onClick={onClose} className={primary}>
                Continue quest <ArrowRight size={13} aria-hidden="true" />
              </button>
              <button type="button" onClick={onCancel} className={quiet}>
                End quest
              </button>
            </div>
          </div>
        )}
        <div
          className="mx-3 flex gap-1 rounded-xl bg-black/20 p-1"
          role="group"
          aria-label="Quest list"
        >
          <button
            type="button"
            aria-pressed={!completed}
            onClick={() => setCompleted(false)}
            className={`${quiet} flex-1 ${!completed ? "bg-white/20 text-white" : ""}`}
          >
            Discover · {ERRANDS.length - doneCount}
          </button>
          <button
            type="button"
            aria-pressed={completed}
            onClick={() => setCompleted(true)}
            className={`${quiet} flex-1 ${completed ? "bg-white/20 text-white" : ""}`}
          >
            Completed · {doneCount}
          </button>
        </div>
        <ul
          className="space-y-1.5 p-3"
          aria-label={completed ? "Completed quests" : "Available quests"}
        >
          {shown.map((errand) => {
            const done = progress.done[errand.id],
              isActive = active?.id === errand.id;
            const recommended =
              !completed && !active && recommendation?.id === errand.id;
            return (
              <li
                key={errand.id}
                className={`rounded-xl border p-2.5 ${recommended ? "border-white/45 bg-black/25" : "border-white/20 bg-black/15"}`}
              >
                {recommended && (
                  <p className={`${eyebrow} mb-1.5 flex items-center gap-1.5`}>
                    <Sparkles size={11} aria-hidden="true" />A good place to
                    start
                  </p>
                )}
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-black/20 text-white">
                    <QuestIcon errand={errand} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="flex items-center gap-1.5 text-[13px] font-semibold">
                      {errand.title}
                      {done && (
                        <Check
                          size={13}
                          className="text-white"
                          aria-label="Completed"
                        />
                      )}
                    </h3>
                    <p
                      className="mt-0.5 line-clamp-2 text-xs leading-[17px] text-white/90"
                      title={errand.blurb}
                    >
                      {errand.blurb}
                    </p>
                  </div>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-white/85">
                  <span>{errand.message.skill}</span>
                  <span>{errand.steps.length + 1} steps</span>
                  <span className="flex items-center gap-1">
                    <Timer size={11} aria-hidden="true" />
                    {clock(errand.parSeconds)} bonus target
                  </span>
                  <span>
                    {done
                      ? `Best ${clock(done.bestSeconds)} · ${done.runs} ${done.runs === 1 ? "run" : "runs"} · half reward on replay`
                      : "Up to 80 XP"}
                  </span>
                </div>
                {/* The route opens under its link; the Start button stays beside it. */}
                <div className="mt-1 flex items-start justify-between gap-2">
                  <details className="min-w-0 flex-1">
                    <summary
                      className={`flex min-h-8 cursor-pointer list-none items-center gap-1 text-[11px] text-white/90 ${focus}`}
                    >
                      <ChevronDown size={12} aria-hidden="true" />
                      See the route
                    </summary>
                    <ol className="mt-0.5 space-y-1 border-l border-white/30 pl-3 text-[11px] leading-4 text-white/85">
                      {errand.steps.map((step, i) => (
                        <li key={i}>
                          {i + 1}. {step.label}
                        </li>
                      ))}
                      <li>
                        {errand.steps.length + 1}. Choose a useful message to{" "}
                        {errand.message.to}
                      </li>
                    </ol>
                  </details>
                  <button
                    type="button"
                    onClick={() => onStart(errand.id)}
                    disabled={!!active}
                    className={primary}
                  >
                    {isActive ? "In progress" : done ? "Replay" : "Start"}
                    {!isActive && <ArrowRight size={12} aria-hidden="true" />}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        {shown.length === 0 && (
          <div className="px-5 py-6 text-center">
            <Trophy
              size={23}
              className="mx-auto text-white"
              aria-hidden="true"
            />
            <p className="mt-2 text-sm font-semibold">
              {completed
                ? "Your first win is waiting"
                : "Every quest, complete"}
            </p>
            <p className="mt-1 text-xs leading-5 text-white/85">
              {completed
                ? "Try a short quest in Discover. You earn XP at your own pace."
                : "Visit Completed to practise a favourite again."}
            </p>
          </div>
        )}
        <details className="border-t border-white/25 px-3.5 py-2.5">
          <summary
            className={`flex cursor-pointer list-none items-center justify-between text-xs text-white/85 ${focus}`}
          >
            <span className="flex items-center gap-2">
              <Trophy size={13} aria-hidden="true" />
              Badges · {progress.badges.length}/{ERRAND_BADGES.length}
            </span>
            <ChevronDown size={13} aria-hidden="true" />
          </summary>
          <ul className="mt-3 grid grid-cols-2 gap-2">
            {ERRAND_BADGES.map((badge) => {
              const earned = progress.badges.includes(badge.id);
              return (
                <li
                  key={badge.id}
                  className={`rounded-xl border p-2.5 ${earned ? "border-white/45 bg-black/25" : "border-white/20 bg-black/10"}`}
                >
                  <p
                    className={`text-xs font-semibold ${earned ? "text-white" : "text-white/80"}`}
                  >
                    {badge.title}
                    <span className="sr-only">
                      {earned ? " (earned)" : " (not yet)"}
                    </span>
                  </p>
                  <p className="mt-1 text-[10px] leading-4 text-white/85">
                    {badge.description}
                  </p>
                </li>
              );
            })}
          </ul>
        </details>
        <p className="border-t border-white/25 px-3.5 py-2.5 text-[10px] leading-4 text-white/85">
          Progress is saved in this browser. There is no time limit; the target
          only adds a bonus.
        </p>
      </div>
    </section>
  );
}

export function ErrandHud({
  errand,
  run,
  now,
  self,
  raised,
  onCancel,
  onNavigate,
}: {
  errand: Errand;
  run: ErrandRun;
  now: number;
  self: { x: number; y: number };
  raised: boolean;
  onCancel: () => void;
  onNavigate?: () => void;
}) {
  const seconds = runSeconds(run, now),
    step = errand.steps[run.step];
  const bounds = step ? getChatRoom("clario-hq", step.room)?.bounds : undefined;
  const inRoom =
    !!bounds &&
    self.x >= bounds.x &&
    self.x < bounds.x + bounds.width &&
    self.y >= bounds.y &&
    self.y < bounds.y + bounds.height;
  const steps = errand.steps.length + 1;
  const actionHint =
    step?.action === "read"
      ? "Use a Library shelf, choose a book and turn a page with E."
      : step?.action === "sip"
        ? "Collect a vending-machine drink, then use E to sip here."
        : null;
  return (
    <section
      aria-label={`Quest: ${errand.title}`}
      className={`pointer-events-auto absolute left-[76px] z-[36] w-[min(20rem,calc(100vw-6rem))] overflow-hidden rounded-2xl ${glass} ${raised ? "bottom-28" : "bottom-24"}`}
    >
      <div className="flex items-center justify-between gap-2 px-3.5 pt-3">
        <span className={eyebrow}>Current quest</span>
        <span className="flex items-center gap-1 text-[11px] tabular-nums text-white/85">
          <Timer size={11} aria-hidden="true" />
          {clock(seconds)}
        </span>
      </div>
      <h2 className="px-3.5 pt-1 text-sm font-semibold">{errand.title}</h2>
      <div
        className="mx-3.5 mt-2.5 flex gap-1"
        role="progressbar"
        aria-label="Quest steps"
        aria-valuemin={0}
        aria-valuemax={steps}
        aria-valuenow={run.step}
      >
        {Array.from({ length: steps }, (_, i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full ${i < run.step ? "bg-[#3a6ee8]" : i === run.step ? "bg-white/70" : "bg-black/25"}`}
          />
        ))}
      </div>
      <div className="px-3.5 py-3">
        <p className="text-[10px] text-white/85">
          STEP {Math.min(run.step + 1, steps)} OF {steps}
          {step && ` · ${roomName(step.room)}`}
        </p>
        <p className="mt-1 text-[13px] font-medium leading-5">
          {step?.label ?? `Choose your message to ${errand.message.to}`}
        </p>
        {actionHint && (
          <p className="mt-1 text-[11px] leading-4 text-white/85">
            {actionHint}
          </p>
        )}
        {!actionHint && (
          <p className="mt-1 text-[11px] leading-4 text-white/85">
            {seconds <= errand.parSeconds
              ? `Under ${clock(errand.parSeconds)} earns a bonus. Take your time if you need to.`
              : "Keep going — the base reward is still yours."}
          </p>
        )}
      </div>
      <footer className="flex items-center justify-between gap-2 border-t border-white/25 px-3 py-2">
        {step && onNavigate ? (
          <button type="button" onClick={onNavigate} className={primary}>
            <Navigation2 size={12} aria-hidden="true" />
            {inRoom && step.action ? "Find the interaction" : "Walk there"}
          </button>
        ) : (
          <span className="text-[11px] text-white/85">
            Follow the map marker
          </span>
        )}
        <button type="button" onClick={onCancel} className={quiet}>
          End quest
        </button>
      </footer>
      <p className="sr-only" aria-live="polite">
        {step ? `Next: ${step.label}` : "Choose the best message to finish."}
      </p>
    </section>
  );
}

// At the last room: choose the message to send. A weaker choice explains why and lets you try again.
export function ErrandChoice({
  errand,
  run,
  lastPick,
  onPick,
  onCancel,
  bridgeRef,
}: {
  errand: Errand;
  run: ErrandRun;
  lastPick: number | null;
  onPick: (index: number) => void;
  onCancel: () => void;
  bridgeRef?: RefObject<SceneBridge>;
}) {
  useMapOverlay(bridgeRef, "quest-choice");
  const headingId = useId();
  const picked = lastPick === null ? null : errand.message.options[lastPick];

  // Number keys pick an option too.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        event.repeat ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")
      )
        return;
      const index = Number(event.key) - 1;
      if (
        Number.isInteger(index) &&
        index >= 0 &&
        index < errand.message.options.length &&
        !run.wrongPicks.includes(index)
      )
        onPick(index);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [errand, run.wrongPicks, onPick]);

  return (
    <section
      aria-labelledby={headingId}
      className={`pointer-events-auto absolute bottom-24 left-1/2 z-[72] max-h-[calc(100dvh-9rem)] w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 overflow-y-auto rounded-2xl p-3 ${glass}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/80">
          Choose your reply · {errand.message.skill}
        </span>
        <button
          type="button"
          onClick={onCancel}
          aria-label="End this quest"
          className={closeButton}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <h2
        id={headingId}
        className="mt-0.5 text-[13px] font-semibold leading-[18px]"
      >
        {errand.message.prompt}
      </h2>
      <p className="mt-0.5 text-[11px] text-white/85">To {errand.message.to}</p>
      <div
        role="group"
        aria-label="Messages to choose from"
        className="mt-2 space-y-1.5"
      >
        {errand.message.options.map((option, index) => {
          const tried = run.wrongPicks.includes(index);
          return (
            <button
              key={option.text}
              type="button"
              onClick={() => onPick(index)}
              disabled={tried}
              className={`flex w-full items-start gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[12px] leading-[18px] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transition-none ${
                tried
                  ? "cursor-default border-[#e9c98f]/40 bg-black/25 text-white/70 line-through decoration-white/40"
                  : "cursor-pointer border-white/25 bg-black/20 hover:border-white/60 hover:bg-black/30 active:scale-[0.99]"
              }`}
            >
              <span
                className="mt-px grid h-[18px] w-[18px] shrink-0 place-items-center rounded-md bg-white/20 text-[10px] font-bold text-white"
                aria-hidden="true"
              >
                {index + 1}
              </span>
              <span>&ldquo;{option.text}&rdquo;</span>
            </button>
          );
        })}
      </div>
      {picked && !picked.best && (
        <p
          role="status"
          className="mt-2 rounded-lg border border-[#e9c98f]/40 bg-black/25 px-2.5 py-1.5 text-[12px] leading-[18px] text-[#fbe9c4]"
        >
          <strong>A useful adjustment.</strong> {picked.why} Try another
          message.
        </p>
      )}
    </section>
  );
}

export function ErrandCelebrationCard({
  celebration,
  onClose,
}: {
  celebration: ErrandCelebration;
  onClose: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onClose, 12000);
    return () => clearTimeout(timer);
  }, [celebration.at, onClose]);
  const badges = celebration.newBadges.flatMap((id) =>
    ERRAND_BADGES.filter((badge) => badge.id === id),
  );
  const { reward } = celebration;

  return (
    <section
      role="status"
      aria-live="polite"
      className={`pointer-events-auto absolute left-1/2 top-16 z-[72] w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-2xl ${glass}`}
    >
      <div className="flex items-start justify-between gap-2 border-b border-white/25 bg-black/15 px-3.5 py-2.5 text-white">
        <div>
          <p className="flex items-center gap-2 text-[14px] font-semibold">
            <Sparkles
              size={16}
              className="motion-safe:animate-pulse"
              aria-hidden="true"
            />
            {celebration.title
              ? `${celebration.title}: done!`
              : "Badge unlocked!"}
          </p>
          {celebration.seconds !== null && reward && (
            <p className="mt-0.5 text-[12px] text-white/85">
              {clock(celebration.seconds)}
              {reward.fast ? " · under target time" : ""}
              {reward.firstTry ? " · right first time" : ""}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-lg text-white/80 transition hover:bg-white/15 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="px-3.5 py-2.5">
        {reward && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 rounded-full bg-[#3a6ee8] px-2.5 py-1 text-[12px] font-semibold tabular-nums text-white">
              <Zap size={13} aria-hidden="true" />+{reward.xp} XP
            </span>
            <span className="flex items-center gap-1 rounded-full bg-black/25 px-2.5 py-1 text-[12px] font-semibold tabular-nums text-[#fbe9c4]">
              <Coins size={13} aria-hidden="true" />+{reward.coins} coins
            </span>
            {reward.repeat && (
              <span className="text-[11px] text-white/85">
                Replay, so half reward
              </span>
            )}
          </div>
        )}
        {celebration.levelUp && (
          <p className="mt-2 text-[13px] font-semibold text-white">Level up!</p>
        )}
        {celebration.why && (
          <p className="mt-2 text-[12px] leading-5 text-white/90">
            <strong className="text-white">Why it works:</strong>{" "}
            {celebration.why}
          </p>
        )}
        {badges.map((badge) => (
          <p
            key={badge.id}
            className="mt-2 flex items-start gap-2 rounded-xl bg-black/20 px-3 py-2 text-[12px] leading-5"
          >
            <Trophy
              size={14}
              className="mt-0.5 shrink-0 text-white"
              aria-hidden="true"
            />
            <span>
              <strong>{badge.title}</strong> · {badge.description}
            </span>
          </p>
        ))}
      </div>
    </section>
  );
}
