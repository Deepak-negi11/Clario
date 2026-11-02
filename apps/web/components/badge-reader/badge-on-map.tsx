"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { clockTime } from "@repo/shared";
import type { SceneBridge } from "../phaser/scene-bridge";
import type { BadgeAndNotices, BadgeEvent } from "../../hooks/use-badge-and-notices";

// The front-door badge reader: the scene calls bridge.badgeIn when you walk past it or press E
// there. When the server confirms, the reader beeps, its light flashes green, and a short toast
// says when you came in. Leaving the space (closing the tab) badges you out on the server.

const TOAST_MS = 2600;

let audio: AudioContext | null = null;

// Two short square-wave blips, like a door reader: rising for in, falling for out, one for "already in".
function beep(kind: "in" | "out" | "again") {
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
    const tones = kind === "in" ? [1320, 1760] : kind === "out" ? [1320, 990] : [1320];
    tones.forEach((frequency, i) => {
      const ctx = audio!;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime + i * 0.11;
      oscillator.type = "square";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.05, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.09);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.1);
    });
  } catch {
    // No audio on this device: the light and the toast still show it.
  }
}

function toastText(event: BadgeEvent) {
  if (event.kind === "out") return { label: "Badged out", time: clockTime(event.entry.outAt ?? event.at) };
  return event.fresh
    ? { label: "Badged in", time: clockTime(event.entry.inAt) }
    : { label: "In since", time: clockTime(event.entry.inAt) };
}

export function BadgeOnMap({ bridgeRef, office }: { bridgeRef: RefObject<SceneBridge>; office: BadgeAndNotices }) {
  const [toast, setToast] = useState<BadgeEvent | null>(null);
  const badgeInRef = useRef(office.badgeIn);
  badgeInRef.current = office.badgeIn;
  const badgeOutRef = useRef(office.badgeOut);
  badgeOutRef.current = office.badgeOut;
  // How the last badge-in was asked for: walking past while already in stays quiet.
  const howRef = useRef<"walk" | "key">("key");
  const flashAtRef = useRef(0);

  useEffect(() => {
    const bridge = bridgeRef.current;
    bridge.badgeIn = (how) => {
      howRef.current = how;
      badgeInRef.current(how);
    };
    bridge.badgeOut = () => {
      howRef.current = "key";
      badgeOutRef.current();
    };
    return () => {
      bridge.badgeIn = undefined;
      bridge.badgeOut = undefined;
      bridge.badgeLight = undefined;
    };
  }, [bridgeRef]);

  // The reader's LED, read by the scene every frame.
  useEffect(() => {
    bridgeRef.current.badgeLight = { in: office.selfIn, flashAt: flashAtRef.current };
  }, [bridgeRef, office.selfIn]);

  const { lastBadge } = office;
  useEffect(() => {
    if (!lastBadge) return;
    const quiet = lastBadge.kind === "in" && !lastBadge.fresh && howRef.current === "walk";
    howRef.current = "key";
    if (quiet) return;
    beep(lastBadge.kind === "out" ? "out" : lastBadge.fresh ? "in" : "again");
    flashAtRef.current = Date.now();
    bridgeRef.current.badgeLight = { in: lastBadge.kind === "in", flashAt: flashAtRef.current };
    setToast(lastBadge);
    const timer = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [lastBadge, bridgeRef]);

  if (!toast) return null;
  const { label, time } = toastText(toast);
  const isIn = toast.kind === "in";

  return (
    <div
      role="status"
      className="pointer-events-none absolute left-1/2 top-[4.25rem] z-[80] flex -translate-x-1/2 items-center gap-2.5 rounded-full bg-[#12151c]/90 py-1.5 pl-2.5 pr-3.5 text-white shadow-[0_12px_30px_-12px_rgba(0,0,0,0.6)] backdrop-blur-sm motion-safe:animate-[badge-pop_220ms_ease-out]"
    >
      <span
        aria-hidden="true"
        className={`h-2.5 w-2.5 rounded-full ${isIn ? "bg-[#34d399] shadow-[0_0_10px_2px_rgba(52,211,153,0.75)]" : "bg-[#f59e0b] shadow-[0_0_8px_1px_rgba(245,158,11,0.6)]"}`}
      />
      <span className="text-[13px] font-semibold">{label}</span>
      <span className="font-mono text-[13px] tabular-nums text-white/75">{time}</span>
      <style>{"@keyframes badge-pop{from{opacity:0;transform:translate(-50%,-6px) scale(.96)}to{opacity:1;transform:translate(-50%,0) scale(1)}}"}</style>
    </div>
  );
}
