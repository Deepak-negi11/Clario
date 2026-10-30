"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { ExternalLink, Pause, Play, Power, Search, UsersRound, X } from "lucide-react";
import { parseYouTubeUrl, youTubeWatchUrl } from "@repo/shared";
import { OverlayDialog } from "../games/overlay-dialog";
import { TV_SUGGESTIONS } from "./tv-channels";
import { useTvPlayer } from "./tv-player";
import { TvSearchResults, useTvSearch } from "./tv-search";
import { positionNow, type TvStore } from "./tv-store";

// The Lounge TV, big: search YouTube, paste a link, or pick a suggestion, and it plays in YouTube's
// own embedded player from youtube-nocookie.com. It's an HTML overlay because a cross-origin iframe
// can't be painted into the Phaser scene (the 3D office shows it on its TV instead, with a remote).
// Nothing here touches the player: its ads, controls and branding stay as YouTube serves them.
//
// `shared`: what one person puts on, everyone in the space sees, from the same point in the video.

const pixelFont = "font-[family-name:var(--font-pixel)]";
const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12151c]";

export function useTvStore(store: TvStore) {
  const channel = useSyncExternalStore(store.subscribe, store.channel, () => null);
  const volume = useSyncExternalStore(store.subscribe, store.volume, () => 70);
  const muted = useSyncExternalStore(store.subscribe, store.muted, () => false);
  return { channel, volume, muted };
}

export function TvOverlay({ store, shared = false, onDismiss, banner }: { store: TvStore; shared?: boolean; onDismiss: () => void; banner?: ReactNode }) {
  const titleId = useId();
  const inputId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");
  const { channel, volume, muted } = useTvStore(store);
  const { searchOn, search, error, setError, submit, clear } = useTvSearch();
  useTvPlayer(screenRef, channel, muted ? 0 : volume);
  const suggestion = channel ? TV_SUGGESTIONS.find((item) => item.id === channel.videoId) : undefined;

  // Ready to type on a computer; on a phone, focusing the box would cover the TV with the keyboard.
  useEffect(() => {
    if (!window.matchMedia("(pointer: coarse)").matches) inputRef.current?.focus({ preventScroll: true });
  }, []);

  const linkInDraft = parseYouTubeUrl(draft);
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submit(draft, store.play)) setDraft("");
    else if (!searchOn || !draft.trim()) inputRef.current?.focus();
  };

  return (
    <OverlayDialog labelledBy={titleId} onDismiss={onDismiss} className="w-[min(64rem,calc(100vw-1rem))]">
      <div className="rounded-2xl border border-black/5 bg-white p-3 text-[#12151c] shadow-[0_24px_60px_-24px_rgba(18,21,28,0.45)] sm:p-4">
        {banner}
        <header className="mb-3 flex items-center justify-between gap-3">
          <h2 id={titleId} className={`${pixelFont} text-lg`}>
            Lounge TV
          </h2>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Close the TV"
            className={`grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-xl text-[#5c6371] transition hover:bg-[#f4f5f7] hover:text-[#12151c] motion-reduce:transition-none ${focusRing}`}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <div className="min-w-0">
            {/* The set: a thin black bezel with a little sheen along the top edge. */}
            <div
              className="mx-auto rounded-[14px] bg-[#111214] p-[7px] shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_18px_30px_-18px_rgba(18,21,28,0.7)]"
              style={{ maxWidth: "max(16rem, calc((100dvh - 10rem) * 16 / 9))" }}
            >
              <div className="relative aspect-video overflow-hidden rounded-[6px] bg-black">
                <div ref={screenRef} className="absolute inset-0" />
                {!channel && <TvTestCard note={searchOn ? "Search, paste a link or pick a video." : undefined} />}
                {channel?.paused && (
                  <span className="pointer-events-none absolute left-3 top-3 rounded-md bg-black/70 px-2 py-0.5 text-[12px] font-semibold text-white">{shared ? "Paused for everyone" : "Paused"}</span>
                )}
              </div>
            </div>
            {/* The walnut console the set stands on in the Lounge. */}
            <div aria-hidden="true" className="mx-auto h-2.5 w-[90%] rounded-b-md bg-[#6e4a2f] shadow-[inset_0_2px_0_#8c6240]" />
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            {shared && (
              <p className="flex items-start gap-2 rounded-xl bg-[#f4f5f7] px-3 py-2 text-[12.5px] leading-snug text-[#4b5260]">
                <UsersRound size={15} aria-hidden="true" className="mt-px shrink-0 text-[#12151c]" />
                <span>
                  {channel ? (
                    <>
                      Everyone in this space is watching this together. Put on by{" "}
                      <strong className="font-semibold text-[#12151c]">{channel.byName}</strong>.
                    </>
                  ) : (
                    "Everyone in this space sees what you put on this TV."
                  )}
                </span>
              </p>
            )}

            <form onSubmit={onSubmit} noValidate className="flex flex-col gap-2">
              <label htmlFor={inputId} className="text-[13px] font-semibold">
                {searchOn ? "Search YouTube or paste a link" : "YouTube link"}
              </label>
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  id={inputId}
                  name="youtube-link"
                  type="text"
                  inputMode={searchOn ? "search" : "url"}
                  enterKeyHint={searchOn && !linkInDraft ? "search" : "go"}
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  value={draft}
                  onChange={(event) => {
                    setDraft(event.target.value);
                    if (error) setError(null);
                  }}
                  placeholder={searchOn ? "Search, or paste a link…" : "youtube.com/watch?v=…"}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? errorId : undefined}
                  className="h-10 min-w-0 flex-1 rounded-xl border border-[#dfe2e6] bg-white px-3 text-[14px] text-[#12151c] placeholder:text-[#8a909b] focus:border-[#12151c] focus:outline-none aria-invalid:border-[#c0392b]"
                />
                <button
                  type="submit"
                  className={`inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-[#12151c] px-4 text-[13px] font-semibold text-white transition hover:bg-black active:scale-[0.98] motion-reduce:transition-none ${focusRing}`}
                >
                  {searchOn && draft.trim() && !linkInDraft ? (
                    <>
                      <Search size={15} aria-hidden="true" /> Search
                    </>
                  ) : (
                    <>
                      <Play size={15} aria-hidden="true" /> Play
                    </>
                  )}
                </button>
              </div>
              {error && (
                <p id={errorId} role="alert" className="text-[12.5px] leading-snug text-[#b3261e]">
                  {error}
                </p>
              )}
            </form>

            {search ? (
              <TvSearchResults search={search} playingId={channel?.videoId ?? null} onPick={(result) => store.play({ id: result.id, title: result.title })} onClear={clear} />
            ) : (
              <div>
                <h3 className="text-[12px] font-medium text-[#5c6371]">Or pick one</h3>
                <ul className="mt-1.5 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
                  {TV_SUGGESTIONS.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        aria-pressed={channel?.videoId === item.id}
                        onClick={() => store.play({ id: item.id, title: item.title })}
                        className={`flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-[#eceef1] bg-white px-3 py-2 text-left transition hover:border-[#dfe2e6] hover:bg-[#f7f8f9] aria-pressed:border-[#12151c] aria-pressed:bg-[#f4f5f7] motion-reduce:transition-none ${focusRing}`}
                      >
                        <Play size={14} aria-hidden="true" className="shrink-0 text-[#c4302b]" />
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-semibold">{item.title}</span>
                          <span className="block truncate text-[11.5px] text-[#5c6371]">{item.by}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 text-[12px] text-[#5c6371]">
              <p className="mr-auto min-w-0 truncate">{channel?.title ?? suggestion?.title ?? "Plays in YouTube's own player."}</p>
              {channel && (
                <>
                  <button
                    type="button"
                    onClick={() => (channel.paused ? store.resume() : store.pause())}
                    className={`inline-flex cursor-pointer items-center gap-1 rounded text-[#12151c] hover:underline ${focusRing}`}
                  >
                    {channel.paused ? <Play size={12} aria-hidden="true" /> : <Pause size={12} aria-hidden="true" />} {channel.paused ? "Play" : "Pause"}
                  </button>
                  <a
                    href={youTubeWatchUrl({ id: channel.videoId, start: Math.floor(positionNow(channel)) })}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-1 rounded text-[#12151c] underline-offset-2 hover:underline ${focusRing}`}
                  >
                    Open on YouTube <ExternalLink size={12} aria-hidden="true" />
                  </a>
                  <button type="button" onClick={store.stop} className={`inline-flex cursor-pointer items-center gap-1 rounded text-[#12151c] hover:underline ${focusRing}`}>
                    <Power size={12} aria-hidden="true" /> Turn off
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </OverlayDialog>
  );
}

// SMPTE colour bars, the test card a real set shows with no signal: seven 75% bars, the reversed
// strip under them, and the bottom row (-I, white, +Q, black).
const BARS = ["#c0c0c0", "#c0c000", "#00c0c0", "#00c000", "#c000c0", "#c00000", "#0000c0"];
const STRIP = ["#0000c0", "#131313", "#c000c0", "#131313", "#00c0c0", "#131313", "#c0c0c0"];

export function TvTestCard({ label = "No signal", note = "Paste a YouTube link or pick a video." }: { label?: string; note?: string }) {
  return (
    <div className="absolute inset-0">
      <div className="grid h-[67%] grid-cols-7">
        {BARS.map((color) => (
          <div key={color} style={{ background: color }} />
        ))}
      </div>
      <div className="grid h-[8%] grid-cols-7">
        {STRIP.map((color, index) => (
          <div key={index} style={{ background: color }} />
        ))}
      </div>
      <div className="grid h-[25%] grid-cols-[5fr_5fr_5fr_13fr]">
        <div className="bg-[#00214c]" />
        <div className="bg-white" />
        <div className="bg-[#32006a]" />
        <div className="bg-[#131313]" />
      </div>
      {label && (
        <div className="absolute inset-0 grid place-items-center p-3">
          <div className="rounded-lg bg-[#111214]/85 px-4 py-2 text-center">
            <p className={`${pixelFont} text-xl text-white sm:text-2xl`}>{label}</p>
            {note && <p className="mt-0.5 text-[12px] text-white/80">{note}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
