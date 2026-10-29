"use client";

import { useEffect, useId } from "react";
import { Check, Coins, Navigation2, Sparkles, Timer, Trophy, X, Zap } from "lucide-react";
import {
  ERRANDS, ERRAND_BADGES, getChatRoom, levelFor, runSeconds,
  type Errand, type ErrandProgress, type ErrandRun,
} from "@repo/shared";
import type { ErrandCelebration } from "../../hooks/use-errands";
import { useDraggablePanel } from "../../hooks/use-draggable-panel";
import { PanelDragHandle, draggableHeader } from "./panel-drag-handle";

// Errands UI: the list in the side panel, the card you follow while running, the message you
// choose at the end, and the reward card. The accent is the blue the Game Room uses (#3686FF).

const fieldLabel = "font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[#5c6371]";
const primaryButton =
  "flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-[#12151c] px-3 text-[12px] font-semibold text-white transition hover:bg-black active:scale-[0.98] disabled:cursor-default disabled:bg-[#e6e7ea] disabled:text-[#6b7180] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12151c] motion-reduce:transition-none";
const closeButton =
  "grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-lg text-[#8a909b] transition hover:bg-[#f4f5f7] hover:text-[#12151c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#12151c]";

const roomName = (id: string) => getChatRoom("clario-hq", id)?.name ?? id;
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
const route = (errand: Errand) => errand.steps.map((step) => roomName(step.room)).join(" → ");

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
  const titleId = useId();
  const { level, into, needed } = levelFor(progress.xp);
  const active = run ? ERRANDS.find((errand) => errand.id === run.errandId) : null;
  const drag = useDraggablePanel("errands");

  return (
    <section
      ref={drag.ref}
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        // Keep keys out of the Phaser scene, which listens for arrow keys on window.
        event.stopPropagation();
        if (event.key === "Escape") onClose();
      }}
      className="pointer-events-auto absolute left-[76px] top-3 z-[65] flex max-h-[calc(100dvh-1.5rem)] w-[min(23rem,calc(100vw-6rem))] flex-col overflow-hidden rounded-2xl border border-black/5 bg-white/95 text-[#12151c] shadow-[0_18px_44px_-18px_rgba(18,21,28,0.45)] backdrop-blur-md"
    >
      <header {...drag.headerProps} className={`${draggableHeader} flex items-center justify-between border-b border-[#eceef1] px-4 py-3`}>
        <PanelDragHandle label="Move quests panel" {...drag.handleProps} />
        <h2 id={titleId} className="text-sm font-semibold">Quests</h2>
        <button type="button" onClick={onClose} aria-label="Close quests" className={closeButton}>
          <X size={16} aria-hidden="true" />
        </button>
      </header>

      <div className="min-h-0 overflow-y-auto overscroll-contain">
        <div className="border-b border-[#eceef1] px-4 pb-4 pt-3">
          <div className="flex items-center justify-between text-[13px]">
            <span className="font-semibold">Level {level}</span>
            <span className="flex items-center gap-3 tabular-nums text-[#4b5260]">
              <span className="flex items-center gap-1"><Zap size={13} className="text-[#3686FF]" aria-hidden="true" />{progress.xp} XP</span>
              <span className="flex items-center gap-1"><Coins size={13} className="text-[#d99a1e]" aria-hidden="true" />{progress.coins} coins</span>
            </span>
          </div>
          <div
            role="progressbar"
            aria-label={`XP towards level ${level + 1}`}
            aria-valuemin={0}
            aria-valuemax={needed}
            aria-valuenow={into}
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#eef0f3]"
          >
            <div className="h-full rounded-full bg-[#3686FF] transition-[width] motion-reduce:transition-none" style={{ width: `${(into / needed) * 100}%` }} />
          </div>
          <p className="mt-1.5 text-[11px] text-[#5c6371]">{needed - into} XP to level {level + 1}. Run to the rooms, then pick the best message.</p>
        </div>

        {active && (
          <div className="flex items-center justify-between gap-3 border-b border-[#eceef1] bg-[#3686FF]/[0.06] px-4 py-2.5">
            <p className="min-w-0 text-[12px]"><span className="font-semibold">On it:</span> {active.title}</p>
            <button type="button" onClick={onCancel} className="shrink-0 cursor-pointer rounded-lg px-2 py-1 text-[12px] font-semibold text-[#5c6371] transition hover:bg-white hover:text-[#12151c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#12151c]">
              Give up
            </button>
          </div>
        )}

        <ul>
          {ERRANDS.map((errand) => {
            const done = progress.done[errand.id];
            const isActive = active?.id === errand.id;
            return (
              <li key={errand.id} className="border-b border-[#eceef1] px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-[13px] font-semibold">
                      {errand.title}
                      {done && <Check size={14} className="text-[#17673a]" aria-label="done" />}
                    </p>
                    <p className="mt-0.5 text-[12px] leading-[18px] text-[#5c6371]">{errand.blurb}</p>
                    <p className={`${fieldLabel} mt-1.5`}>{route(errand)} · {errand.message.skill}</p>
                    <p className="mt-1 text-[11px] text-[#5c6371]">
                      {done
                        ? `Best ${clock(done.bestSeconds)} · done ${done.runs}× · replays earn half`
                        : `Up to 80 XP · under ${clock(errand.parSeconds)} for a speed bonus`}
                    </p>
                  </div>
                  <button type="button" onClick={() => onStart(errand.id)} disabled={isActive} className={primaryButton}>
                    {isActive ? "On it" : done ? "Again" : "Start"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="px-4 py-4">
          <h3 className={fieldLabel}>Badges</h3>
          <ul className="mt-2 grid grid-cols-2 gap-2">
            {ERRAND_BADGES.map((badge) => {
              const earned = progress.badges.includes(badge.id);
              return (
                <li
                  key={badge.id}
                  className={`rounded-xl border px-3 py-2.5 ${earned ? "border-[#3686FF]/30 bg-[#3686FF]/[0.06]" : "border-[#eceef1] bg-[#f7f8fa]"}`}
                >
                  <p className={`flex items-center gap-1.5 text-[12px] font-semibold ${earned ? "" : "text-[#5c6371]"}`}>
                    <Trophy size={13} className={earned ? "text-[#3686FF]" : "text-[#a3a8b2]"} aria-hidden="true" />
                    {badge.title}
                    <span className="sr-only">{earned ? "(earned)" : "(not yet)"}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] leading-4 text-[#5c6371]">{badge.description}</p>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[11px] text-[#6b7180]">Your quest progress is saved in this browser.</p>
        </div>
      </div>
    </section>
  );
}

// The card you follow while running: the timer, the rooms to reach and an arrow to the next one.
export function ErrandHud({
  errand,
  run,
  now,
  self,
  raised,
  onCancel,
}: {
  errand: Errand;
  run: ErrandRun;
  now: number;
  self: { x: number; y: number };
  // Sits lower in the 3D view, under its toolbar.
  raised: boolean;
  onCancel: () => void;
}) {
  const seconds = runSeconds(run, now);
  const step = errand.steps[run.step];
  const bounds = step ? getChatRoom("clario-hq", step.room)?.bounds : undefined;
  const dx = bounds ? bounds.x + bounds.width / 2 - (self.x + 0.5) : 0;
  const dy = bounds ? bounds.y + bounds.height / 2 - (self.y + 0.5) : 0;
  const tiles = Math.round(Math.hypot(dx, dy));
  // 0 degrees points right on the map; the icon itself points up.
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
  const late = seconds > errand.parSeconds;

  return (
    <section
      aria-label={`Quest: ${errand.title}`}
      className={`pointer-events-auto absolute right-3 z-[70] w-[min(19rem,calc(100vw-5.5rem))] rounded-2xl bg-[#12151c]/90 p-3.5 text-white shadow-xl ring-1 ring-white/10 backdrop-blur-md ${raised ? "top-[68px]" : "top-3"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#8cbcff]">Quest</span>
        <span className={`flex items-center gap-1 font-mono text-[13px] tabular-nums ${late ? "text-[#f2c14e]" : "text-white"}`}>
          <Timer size={13} aria-hidden="true" />
          {clock(seconds)}
          <span className="text-white/45">/ {clock(errand.parSeconds)}</span>
        </span>
      </div>
      <p className="mt-1 text-[15px] font-semibold">{errand.title}</p>
      <ol className="mt-2.5 space-y-1.5">
        {errand.steps.map((item, index) => (
          <li key={item.room + index} className="flex items-center gap-2 text-[12px] leading-4">
            {index < run.step ? (
              <Check size={13} className="shrink-0 text-[#4ade80]" aria-label="done" />
            ) : (
              <span className={`mx-[3px] h-[7px] w-[7px] shrink-0 rounded-full ${index === run.step ? "bg-[#3686FF] motion-safe:animate-pulse" : "bg-white/25"}`} aria-hidden="true" />
            )}
            <span className={index < run.step ? "text-white/45 line-through" : index === run.step ? "text-white" : "text-white/60"}>{item.label}</span>
          </li>
        ))}
        <li className="flex items-center gap-2 text-[12px] leading-4 text-white/60">
          <span className="mx-[3px] h-[7px] w-[7px] shrink-0 rounded-full bg-white/25" aria-hidden="true" />
          Say it right to {errand.message.to}
        </li>
      </ol>
      {step && (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-white/[0.08] px-3 py-2">
          <span className="flex min-w-0 items-center gap-2 text-[12px]">
            <Navigation2 size={15} className="shrink-0 text-[#8cbcff] transition-transform motion-reduce:transition-none" style={{ transform: `rotate(${angle}deg)` }} aria-hidden="true" />
            <span className="truncate">{roomName(step.room)}</span>
          </span>
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-white/60">{tiles} tiles</span>
        </div>
      )}
      <p className="sr-only" aria-live="polite">{step ? `Next: ${step.label}` : ""}</p>
      <button
        type="button"
        onClick={onCancel}
        className="mt-2 cursor-pointer text-[11px] text-white/55 underline-offset-2 transition hover:text-white hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
      >
        Give up
      </button>
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
}: {
  errand: Errand;
  run: ErrandRun;
  lastPick: number | null;
  onPick: (index: number) => void;
  onCancel: () => void;
}) {
  const headingId = useId();
  const picked = lastPick === null ? null : errand.message.options[lastPick];

  // Number keys pick an option too.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")) return;
      const index = Number(event.key) - 1;
      if (Number.isInteger(index) && index >= 0 && index < errand.message.options.length && !run.wrongPicks.includes(index)) onPick(index);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [errand, run.wrongPicks, onPick]);

  return (
    <section
      aria-labelledby={headingId}
      className="pointer-events-auto absolute bottom-24 left-1/2 z-[72] w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl bg-white p-4 text-[#12151c] shadow-[0_24px_60px_-20px_rgba(18,21,28,0.55)] ring-1 ring-black/5"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#3686FF]">Say it right · {errand.message.skill}</span>
        <button type="button" onClick={onCancel} aria-label="Give up this quest" className={closeButton}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <h2 id={headingId} className="mt-1 text-[14px] font-semibold leading-5">{errand.message.prompt}</h2>
      <p className="mt-0.5 text-[12px] text-[#5c6371]">To {errand.message.to}</p>
      <div role="group" aria-label="Messages to choose from" className="mt-3 space-y-2">
        {errand.message.options.map((option, index) => {
          const tried = run.wrongPicks.includes(index);
          return (
            <button
              key={option.text}
              type="button"
              onClick={() => onPick(index)}
              disabled={tried}
              className={`flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left text-[13px] leading-5 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3686FF] motion-reduce:transition-none ${
                tried
                  ? "cursor-default border-[#f2c14e]/50 bg-[#fff8e6] text-[#6b5a2a] line-through decoration-[#d9a63a]/60"
                  : "cursor-pointer border-[#e6e7ea] bg-[#f7f8fa] hover:border-[#3686FF] hover:bg-white active:scale-[0.99]"
              }`}
            >
              <span className="mt-px grid h-5 w-5 shrink-0 place-items-center rounded-md bg-white font-mono text-[11px] font-bold text-[#4b5260] ring-1 ring-[#e6e7ea]" aria-hidden="true">
                {index + 1}
              </span>
              <span>&ldquo;{option.text}&rdquo;</span>
            </button>
          );
        })}
      </div>
      {picked && !picked.best && (
        <p role="status" className="mt-3 rounded-xl bg-[#fff8e6] px-3 py-2 text-[12px] leading-5 text-[#6b5a2a]">
          <strong>Not quite.</strong> {picked.why} Try another one.
        </p>
      )}
    </section>
  );
}

export function ErrandCelebrationCard({ celebration, onClose }: { celebration: ErrandCelebration; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 9000);
    return () => clearTimeout(timer);
  }, [celebration.at, onClose]);
  const badges = celebration.newBadges.flatMap((id) => ERRAND_BADGES.filter((badge) => badge.id === id));
  const { reward } = celebration;

  return (
    <section
      role="status"
      aria-live="polite"
      className="pointer-events-auto absolute left-1/2 top-16 z-[72] w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-2xl bg-white text-[#12151c] shadow-[0_24px_60px_-20px_rgba(18,21,28,0.55)] ring-1 ring-black/5"
    >
      <div className="flex items-start justify-between gap-2 bg-[#3686FF] px-4 py-3 text-white">
        <div>
          <p className="flex items-center gap-2 text-[14px] font-semibold">
            <Sparkles size={16} className="motion-safe:animate-pulse" aria-hidden="true" />
            {celebration.title ? `${celebration.title}: done!` : "Badge unlocked!"}
          </p>
          {celebration.seconds !== null && reward && (
            <p className="mt-0.5 text-[12px] text-white/85">
              {clock(celebration.seconds)}
              {reward.fast ? " · under target time" : ""}
              {reward.firstTry ? " · right first time" : ""}
            </p>
          )}
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-lg text-white/80 transition hover:bg-white/15 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="px-4 py-3">
        {reward && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 rounded-full bg-[#3686FF]/10 px-2.5 py-1 text-[12px] font-semibold tabular-nums text-[#1f5fd6]">
              <Zap size={13} aria-hidden="true" />+{reward.xp} XP
            </span>
            <span className="flex items-center gap-1 rounded-full bg-[#f2c14e]/20 px-2.5 py-1 text-[12px] font-semibold tabular-nums text-[#8a5a00]">
              <Coins size={13} aria-hidden="true" />+{reward.coins} coins
            </span>
            {reward.repeat && <span className="text-[11px] text-[#5c6371]">Replay, so half reward</span>}
          </div>
        )}
        {celebration.levelUp && <p className="mt-2 text-[13px] font-semibold text-[#1f5fd6]">Level up!</p>}
        {celebration.why && (
          <p className="mt-2 text-[12px] leading-5 text-[#5c6371]">
            <strong className="text-[#12151c]">Why it works:</strong> {celebration.why}
          </p>
        )}
        {badges.map((badge) => (
          <p key={badge.id} className="mt-2 flex items-start gap-2 rounded-xl bg-[#3686FF]/[0.07] px-3 py-2 text-[12px] leading-5">
            <Trophy size={14} className="mt-0.5 shrink-0 text-[#3686FF]" aria-hidden="true" />
            <span><strong>{badge.title}</strong> · {badge.description}</span>
          </p>
        ))}
      </div>
    </section>
  );
}
