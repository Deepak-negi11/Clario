"use client";

import { useEffect, useRef } from "react";
import { SCREEN_H, SCREEN_W } from "./arcade-kit";
import type { ArcadeGameSpec } from "./arcade-games";

// A still of a game's opening screen, drawn by the game itself, for the arcade menu.
export function GamePreview({ spec, className = "" }: { spec: ArcadeGameSpec; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const seats = Array.from({ length: spec.soloSeats }, (_, index) => ({ name: index === 0 ? "You" : "Computer", bot: index > 0 }));
    spec.create({ reducedMotion: true, sound: () => {}, seats }).draw(ctx, 0);
  }, [spec]);

  return (
    <canvas
      ref={ref}
      width={SCREEN_W}
      height={SCREEN_H}
      aria-hidden="true"
      className={`block aspect-[3/2] w-full [image-rendering:pixelated] ${className}`}
    />
  );
}
