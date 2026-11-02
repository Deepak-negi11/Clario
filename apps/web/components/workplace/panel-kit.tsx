"use client";

import { useEffect, useId, type ReactNode, type RefObject } from "react";
import { X, type LucideIcon } from "lucide-react";
import { OverlayDialog } from "../games/overlay-dialog";
import { useMapOverlay } from "../../hooks/use-map-overlay";
import type { SceneBridge } from "../phaser/scene-bridge";
import type { WorkplaceNotice } from "./use-workplace";

// The look the office's panels share (the printer and server rack use the same): a white sheet,
// ink text, one blue accent, soft 12px controls inside a 24px shell.

export const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3a6ee8]";
export const primary = `inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#3a6ee8] px-4 text-[13px] font-semibold text-white transition hover:bg-[#2f5ed0] active:scale-[0.98] disabled:cursor-default disabled:bg-[#b9c6e8] disabled:active:scale-100 motion-reduce:transition-none ${focus}`;
export const secondary = `inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-[#d5d8de] bg-white px-3 text-[13px] font-semibold text-[#12151c] transition hover:bg-[#f4f5f7] active:scale-[0.98] disabled:cursor-default disabled:opacity-45 disabled:active:scale-100 motion-reduce:transition-none ${focus}`;
export const field = `mt-1 block w-full rounded-xl border border-[#d5d8de] bg-white px-3 text-sm font-normal text-[#12151c] placeholder:text-[#7b8190] ${focus}`;
export const label = "block text-xs font-semibold text-[#12151c]";
export const muted = "text-[#5c6371]";
export const segment = `inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[12.5px] font-semibold text-[#5c6371] transition hover:text-[#12151c] aria-pressed:bg-white aria-pressed:text-[#12151c] aria-pressed:shadow-[0_1px_2px_rgba(18,21,28,0.14)] aria-selected:bg-white aria-selected:text-[#12151c] aria-selected:shadow-[0_1px_2px_rgba(18,21,28,0.14)] disabled:cursor-default disabled:opacity-40 motion-reduce:transition-none ${focus}`;

const clock = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const day = new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });

export const timeOf = (ms: number) => clock.format(ms);
// "2:30 pm" today, "Tue 2:30 pm" otherwise.
export function whenOf(ms: number, now = Date.now()) {
  return new Date(ms).toDateString() === new Date(now).toDateString() ? clock.format(ms) : day.format(ms);
}

export function WorkplaceDialog({
  bridgeRef,
  name,
  title,
  subtitle,
  icon: Icon,
  tint = "#e8effd",
  ink = "#3a6ee8",
  width = "w-[min(44rem,calc(100vw-1rem))]",
  onClose,
  children,
}: {
  bridgeRef: RefObject<SceneBridge>;
  // Which overlay this is (the map's keys and context chip stay off while any is open).
  name: string;
  title: string;
  subtitle?: ReactNode;
  icon: LucideIcon;
  tint?: string;
  ink?: string;
  width?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  useMapOverlay(bridgeRef, name);
  return (
    <OverlayDialog labelledBy={titleId} onDismiss={onClose} className={width}>
      <section className="flex max-h-[calc(100dvh-1rem)] flex-col overflow-hidden rounded-3xl bg-white text-[#12151c] shadow-[0_24px_60px_-24px_rgba(18,21,28,0.5)] ring-1 ring-black/5">
        <header className="flex items-center gap-3 border-b border-black/5 p-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl" style={{ background: tint, color: ink }}>
            <Icon size={20} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="truncate text-base font-semibold">
              {title}
            </h2>
            {subtitle && <p className={`mt-0.5 truncate text-xs ${muted}`}>{subtitle}</p>}
          </div>
          <button type="button" aria-label={`Close ${title}`} onClick={onClose} className={`grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-xl text-[#5c6371] hover:bg-black/5 hover:text-[#12151c] ${focus}`}>
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </section>
    </OverlayDialog>
  );
}

// The server's answer to the last thing you did here ("Booked", "Someone already took that"),
// shown for a few seconds. Only answers that came after `since` (when this panel opened) show.
export function NoticeLine({ notice, since, onDone }: { notice: WorkplaceNotice | null; since: number; onDone: () => void }) {
  const fresh = notice && notice.at >= since ? notice : null;
  useEffect(() => {
    if (!fresh) return;
    const timer = window.setTimeout(onDone, 5000);
    return () => window.clearTimeout(timer);
  }, [fresh, onDone]);
  return (
    <p role={fresh && !fresh.ok ? "alert" : "status"} className={`min-h-5 text-[13px] ${fresh?.ok === false ? "text-[#a23c39]" : "text-[#1d6b3f]"}`}>
      {fresh?.text ?? ""}
    </p>
  );
}
