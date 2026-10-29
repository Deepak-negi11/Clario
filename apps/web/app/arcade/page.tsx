"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Tv, UsersRound } from "lucide-react";
import { ARCADE_GAMES, type ArcadeGameKind } from "../../components/games/arcade-games";
import { ArcadeOverlay } from "../../components/games/arcade-overlay";
import { GamePreview } from "../../components/games/game-preview";
import { TvOverlay, TvTestCard } from "../../components/tv/tv-overlay";

// The Game Room without the map: the same games and TV the office opens, reachable from classic
// mode and handy for testing. Two people can share this device; online play and the shared TV
// need the space (the map), where everyone's connected.

const card =
  "group flex w-full cursor-pointer touch-manipulation flex-col gap-3 rounded-2xl border border-black/[0.06] bg-white p-2.5 text-left shadow-[0_1px_2px_rgba(18,21,28,0.06)] transition hover:-translate-y-px hover:shadow-[0_14px_30px_-18px_rgba(18,21,28,0.45)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12151c] active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0";
const pixelFont = "font-[family-name:var(--font-pixel)]";

export default function ArcadePage() {
  const [open, setOpen] = useState<{ kind: "game"; game: ArcadeGameKind } | { kind: "tv" } | null>(null);
  const close = () => setOpen(null);

  return (
    <main className="min-h-dvh bg-[#f6f6f4] px-4 py-6 text-[#12151c]">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <nav className="flex items-center justify-between text-xs text-[#5c6371]">
          <Link href="/spaces" className="rounded underline-offset-2 hover:text-[#12151c] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#12151c]">
            Back to spaces
          </Link>
          <Link href="/practice" className="rounded underline-offset-2 hover:text-[#12151c] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#12151c]">
            Practice with Maya
          </Link>
        </nav>

        <header className="max-w-[40rem]">
          <h1 className={`${pixelFont} text-4xl leading-tight sm:text-5xl`}>Game Room</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-[#4b5260]">
            Take a break between missions. Play alone against the computer, with up to four people on one device (keys,
            controllers or touch), or online with anyone in your space.
          </p>
        </header>

        <section aria-label="Games" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ARCADE_GAMES.map((game) => (
            <button key={game.kind} type="button" className={card} onClick={() => setOpen({ kind: "game", game: game.kind })}>
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
            </button>
          ))}
        </section>

        <section aria-label="Lounge TV">
          <button type="button" className={`${card} sm:flex-row sm:items-center sm:gap-5`} onClick={() => setOpen({ kind: "tv" })}>
            <span className="w-full shrink-0 sm:w-[20rem]">
              <span className="block rounded-[12px] bg-[#111214] p-[5px]">
                <span className="relative block aspect-video overflow-hidden rounded-[5px]">
                  <TvTestCard label="" />
                </span>
              </span>
              <span aria-hidden="true" className="mx-auto block h-2 w-[90%] rounded-b-md bg-[#6e4a2f] shadow-[inset_0_2px_0_#8c6240]" />
            </span>
            <span className="flex min-w-0 flex-1 items-end justify-between gap-3 px-1.5 pb-1 sm:items-center">
              <span className="min-w-0">
                <span className={`${pixelFont} block text-xl`}>Lounge TV</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-[#4b5260]">
                  Paste a YouTube link and watch. In your space, everyone watches together.
                </span>
              </span>
              <span className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-[#12151c] px-3 text-[13px] font-semibold text-white transition group-hover:bg-black motion-reduce:transition-none">
                <Tv size={15} aria-hidden="true" /> Turn on
              </span>
            </span>
          </button>
        </section>
      </div>

      {open?.kind === "game" && <ArcadeOverlay key={open.game} initialGame={open.game} onDismiss={close} />}
      {open?.kind === "tv" && <TvOverlay onDismiss={close} />}
    </main>
  );
}
