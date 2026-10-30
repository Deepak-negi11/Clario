"use client";

import { useState } from "react";
import Link from "next/link";
import { MotionConfig, motion, type Variants } from "motion/react";
import { ArrowRight, UsersRound } from "lucide-react";
import { ARCADE_GAMES, type ArcadeGameKind } from "../../components/games/arcade-games";
import { ArcadeOverlay } from "../../components/games/arcade-overlay";
import { GamePreview } from "../../components/games/game-preview";
import { TetrisOverlay } from "../../components/games/tetris-overlay";

// The Game Room without the map: the same games the office opens, reachable from classic mode and
// handy for testing. Two people can share this device; online play needs the space (the map), where
// everyone's connected. The Lounge TV lives in the office itself.

const card =
  "group flex w-full cursor-pointer touch-manipulation flex-col gap-3 rounded-2xl border border-black/[0.06] bg-white p-2.5 text-left shadow-[0_1px_2px_rgba(18,21,28,0.06)] transition-shadow hover:shadow-[0_14px_30px_-18px_rgba(18,21,28,0.45)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12151c] motion-reduce:transition-none";
const pixelFont = "font-[family-name:var(--font-pixel)]";

// The cards come in one after another, lift a little under the pointer and press in when tapped.
const list: Variants = { shown: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } } };
const item: Variants = {
  hidden: { opacity: 0, y: 14 },
  shown: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 260, damping: 26 } },
};
const lift = { y: -3, transition: { type: "spring", stiffness: 400, damping: 22 } } as const;
const press = { scale: 0.985, y: 0 } as const;

// A few falling pieces for the Tetris card: [column, row, colour] of each block.
const TETRIS_BLOCKS: [number, number, string][] = [
  [0, 3, "#3866f0"], [0, 4, "#3866f0"], [1, 4, "#3866f0"], [2, 4, "#3866f0"],
  [3, 3, "#f5d020"], [4, 3, "#f5d020"], [3, 4, "#f5d020"], [4, 4, "#f5d020"],
  [5, 4, "#21c8e8"], [6, 4, "#21c8e8"], [7, 4, "#21c8e8"], [8, 4, "#21c8e8"],
  [6, 0, "#a845e0"], [5, 1, "#a845e0"], [6, 1, "#a845e0"], [7, 1, "#a845e0"],
];

export default function ArcadePage() {
  const [open, setOpen] = useState<ArcadeGameKind | "tetris" | null>(null);
  const close = () => setOpen(null);

  return (
    <MotionConfig reducedMotion="user">
      <main className="min-h-dvh bg-[#f6f6f4] px-4 py-6 text-[#12151c]">
        <motion.div className="mx-auto flex w-full max-w-5xl flex-col gap-6" initial="hidden" animate="shown" variants={list}>
          <nav className="flex items-center justify-between text-xs text-[#5c6371]">
            <Link href="/spaces" className="rounded underline-offset-2 hover:text-[#12151c] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#12151c]">
              Back to spaces
            </Link>
            <Link href="/practice" className="rounded underline-offset-2 hover:text-[#12151c] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#12151c]">
              Practice with Maya
            </Link>
          </nav>

          <motion.header className="max-w-[40rem]" variants={item}>
            <h1 className={`${pixelFont} text-4xl leading-tight sm:text-5xl`}>Game Room</h1>
            <p className="mt-2 text-[15px] leading-relaxed text-[#4b5260]">
              Take a break between missions. Play alone against the computer, with up to four people on one device (keys,
              controllers or touch), or online with anyone in your space.
            </p>
          </motion.header>

          <motion.button
            type="button"
            className="group flex w-full cursor-pointer touch-manipulation items-center gap-4 rounded-2xl bg-[#0d0b18] p-3 text-left text-white shadow-[0_14px_30px_-18px_rgba(18,21,28,0.6)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12151c] sm:p-4"
            variants={item}
            whileHover={lift}
            whileTap={press}
            onClick={() => setOpen("tetris")}
          >
            <span aria-hidden="true" className="relative grid h-20 w-36 shrink-0 grid-cols-9 grid-rows-5 gap-px overflow-hidden rounded-xl bg-[#07050d] p-1.5 ring-1 ring-white/10">
              {TETRIS_BLOCKS.map(([x, y, color]) => (
                <span key={`${x}-${y}`} className="rounded-[2px]" style={{ gridColumn: x + 1, gridRow: y + 1, background: color, boxShadow: "inset 2px 2px 0 rgba(255,255,255,0.35), inset -2px -2px 0 rgba(0,0,0,0.3)" }} />
              ))}
            </span>
            <span className="min-w-0 flex-1">
              <span className={`${pixelFont} block text-xl text-[#ffe066]`}>Tetris</span>
              <span className="mt-0.5 block text-[13px] leading-snug text-[#c9cde0]">
                On a real 3D arcade cabinet, the one in the office&apos;s Game Room. Hold, next pieces, T-spins and levels.
              </span>
            </span>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#ffe066] text-[#1a1430] transition group-hover:bg-[#fff0a0] motion-reduce:transition-none">
              <ArrowRight size={16} aria-hidden="true" />
              <span className="sr-only">Play</span>
            </span>
          </motion.button>

          <motion.section aria-label="Games" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" variants={list}>
            {ARCADE_GAMES.map((game) => (
              <motion.button
                key={game.kind}
                type="button"
                className={card}
                variants={item}
                whileHover={lift}
                whileTap={press}
                onClick={() => setOpen(game.kind)}
              >
                <span className="overflow-hidden rounded-xl ring-1 ring-black/10">
                  <GamePreview spec={game} />
                </span>
                <span className="flex items-end justify-between gap-3 px-1.5 pb-1">
                  <span className="min-w-0">
                    <span className={`${pixelFont} block text-xl`}>{game.title}</span>
                    <span className="mt-0.5 block text-[13px] leading-snug text-[#4b5260]">{game.blurb}</span>
                    <span className="mt-1.5 flex items-center gap-1 text-[12px] text-[#5c6371]">
                      <UsersRound size={13} aria-hidden="true" className="shrink-0" /> {game.together}
                    </span>
                  </span>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#12151c] text-white transition group-hover:bg-black motion-reduce:transition-none">
                    <ArrowRight size={16} aria-hidden="true" />
                    <span className="sr-only">Play</span>
                  </span>
                </span>
              </motion.button>
            ))}
          </motion.section>
        </motion.div>

        {open === "tetris" && <TetrisOverlay onDismiss={close} onMoreGames={() => setOpen("pong")} />}
        {open && open !== "tetris" && <ArcadeOverlay key={open} initialGame={open} onDismiss={close} />}
      </main>
    </MotionConfig>
  );
}
