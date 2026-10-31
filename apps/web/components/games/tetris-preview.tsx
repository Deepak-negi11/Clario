"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import type { CabinetControls } from "./tetris-3d";

// A still of the Tetris cabinet for the arcade menu, three-quarters on, like the other games' 3D
// stills (game-preview.tsx) and the same 3:2 shape: taken once the page is idle, in a throwaway
// WebGL context that's released straight after. It sits over whatever the menu draws in its place,
// which stays until the still is ready, or for good if WebGL isn't there.
const STILL = { width: 480, height: 320 } as const;

const handsOff: CabinetControls = { stick: { x: 0, down: false }, pressed: { cw: false, ccw: false, hold: false, drop: false, start: false } };

export function TetrisPreview({ className = "" }: { className?: string }) {
  const [still, setStill] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const take = () => {
      Promise.all([import("./tetris-3d"), import("./tetris-screen"), import("./tetris-rules"), document.fonts.ready])
        .then(([{ createTetrisCabinet }, { createScreenPainter }, { createTetris }]) => {
          if (cancelled) return;
          // The title screen on the tube; the second screen is only used in versus.
          const screens: [HTMLCanvasElement, HTMLCanvasElement] = [document.createElement("canvas"), document.createElement("canvas")];
          const game = createTetris();
          createScreenPainter(screens[0])(game, { best: 0, touch: false, reducedMotion: true, blocks3d: true }, 0);
          const cabinet = createTetrisCabinet({ screens, reducedMotion: true });
          try {
            cabinet.resize(STILL.width, STILL.height);
            cabinet.render(0, 0, { playing: false, versus: false, narrow: false, showcase: true, players: [{ game, controls: handsOff }] });
            setStill(cabinet.canvas.toDataURL("image/jpeg", 0.86));
          } finally {
            cabinet.dispose();
          }
        })
        .catch(() => {
          // No WebGL: what's underneath stays.
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
  }, []);

  if (!still) return null;
  return (
    <motion.img
      src={still}
      width={STILL.width}
      height={STILL.height}
      alt=""
      aria-hidden="true"
      className={`absolute inset-0 h-full w-full object-cover ${className}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
    />
  );
}
