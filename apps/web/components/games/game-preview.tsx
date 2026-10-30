"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { SCREEN_H, SCREEN_W, type GameInstance } from "./arcade-kit";
import type { ArcadeGameSpec } from "./arcade-games";
import { VIEW_KEY } from "./arcade-cabinet";

// A still of a game's opening screen, drawn by the game itself, for the arcade menu. Games with a
// 3D table also get a still of that, taken once the page is idle, in a throwaway WebGL context
// that's released straight after. The pixel still shows until then, or if WebGL isn't there.
export function GamePreview({ spec, className = "" }: { spec: ArcadeGameSpec; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [still3d, setStill3d] = useState<string | null>(null);

  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    const seats = Array.from({ length: spec.soloSeats }, (_, index) => ({ name: index === 0 ? "You" : "Computer", bot: index > 0 }));
    const game: GameInstance = spec.create({ reducedMotion: true, sound: () => {}, seats });
    if (ctx) game.draw(ctx, 0);

    const load = spec.stage;
    const view = game.view?.();
    if (!load || !view || readView() === "flat") return;
    let cancelled = false;
    const take = () => {
      load()
        .then(async (create) => {
          if (cancelled) return;
          const stage = create({ reducedMotion: true });
          try {
            await stage.ready?.catch(() => {});
            if (cancelled) return;
            stage.resize(SCREEN_W * 2, SCREEN_H * 2);
            stage.render(view, 0, 0);
            setStill3d(stage.canvas.toDataURL("image/jpeg", 0.86));
          } finally {
            stage.dispose();
          }
        })
        .catch(() => {
          // No WebGL: the pixel still stays.
        });
    };
    // Safari has no requestIdleCallback.
    const idle = typeof window.requestIdleCallback === "function";
    const handle = idle ? window.requestIdleCallback(take, { timeout: 1500 }) : window.setTimeout(take, 300);
    return () => {
      cancelled = true;
      if (idle) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
  }, [spec]);

  return (
    <span className={`relative block aspect-[3/2] w-full ${className}`}>
      <canvas ref={ref} width={SCREEN_W} height={SCREEN_H} aria-hidden="true" className="block h-full w-full [image-rendering:pixelated]" />
      {still3d && (
        <motion.img
          src={still3d}
          width={SCREEN_W * 2}
          height={SCREEN_H * 2}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
        />
      )}
    </span>
  );
}

function readView() {
  try {
    return localStorage.getItem(VIEW_KEY);
  } catch {
    return null;
  }
}
