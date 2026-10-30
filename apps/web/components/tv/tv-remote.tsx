"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Expand, Minus, Pause, Play, Plus, Power, Search, Square, Volume2, VolumeX, X } from "lucide-react";
import { parseYouTubeUrl } from "@repo/shared";
import { TV_SUGGESTIONS } from "./tv-channels";
import { useTvStore } from "./tv-overlay";
import { TvSearchResults, useTvSearch } from "./tv-search";
import type { TvStore } from "./tv-store";

// The Lounge TV's remote, for the 3D office where the video plays on the TV itself. It docks in a
// corner and doesn't cover the room, so you watch the TV while you use it: search YouTube (or paste
// a link), the four preset channels, play/pause, stop, and volume for you alone. What you put on or
// pause, everyone in the space sees. Escape closes it; the TV keeps playing.

const pixelFont = "font-[family-name:var(--font-pixel)]";
const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
// Rubber buttons: a soft top highlight and a little shadow under them, pressed in when tapped.
const rubber = `grid cursor-pointer place-items-center rounded-full bg-[#2c2f35] text-[#e9eaec] shadow-[inset_0_1px_0_rgba(255,255,255,0.09),0_2px_3px_rgba(0,0,0,0.45)] transition hover:bg-[#363940] active:translate-y-px active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)] disabled:cursor-default disabled:opacity-40 disabled:hover:bg-[#2c2f35] disabled:active:translate-y-0 motion-reduce:transition-none ${focusRing}`;

export function TvRemote({ store, shared, onClose, onWatchBig }: { store: TvStore; shared: boolean; onClose: () => void; onWatchBig: () => void }) {
  const titleId = useId();
  const inputId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const { channel, volume, muted } = useTvStore(store);
  const { searchOn, search, error, setError, submit, clear } = useTvSearch();
  const playing = TV_SUGGESTIONS.find((item) => item.id === channel?.videoId);
  const linkInDraft = parseYouTubeUrl(draft);

  // Ready to type on a computer; a phone's keyboard would cover the room.
  useEffect(() => {
    if (!window.matchMedia("(pointer: coarse)").matches) inputRef.current?.focus({ preventScroll: true });
  }, []);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submit(draft, store.play)) setDraft("");
  };

  // Keys typed here stay here (the map and the 3D view listen on the window); Escape closes.
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    event.stopPropagation();
    if (event.key === "Escape") onClose();
  };

  const level = muted ? 0 : volume;

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
      onKeyUp={(event) => event.stopPropagation()}
      className="pointer-events-auto fixed bottom-3 left-3 right-3 z-[90] flex max-h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-[30px] bg-gradient-to-b from-[#27292e] to-[#16171a] p-3.5 text-[#e9eaec] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_24px_50px_-18px_rgba(0,0,0,0.75)] ring-1 ring-black/60 [color-scheme:dark] starting:translate-y-3 starting:opacity-0 transition-[opacity,translate] duration-200 sm:left-auto sm:w-[18.5rem] motion-reduce:transition-none"
    >
      {/* The infrared window along the top edge. */}
      <span aria-hidden="true" className="mx-auto mb-3 block h-1.5 w-14 rounded-full bg-[#0b0b0d] shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)]" />

      <header className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={store.stop}
          disabled={!channel}
          aria-label="Turn the TV off"
          title="Turn off"
          className={`grid h-9 w-9 cursor-pointer place-items-center rounded-full bg-[#c4302b] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_2px_3px_rgba(0,0,0,0.5)] transition hover:bg-[#d63a34] active:translate-y-px disabled:cursor-default disabled:opacity-50 motion-reduce:transition-none ${focusRing}`}
        >
          <Power size={16} aria-hidden="true" />
        </button>
        <h2 id={titleId} className={`${pixelFont} text-[15px] tracking-wide text-white/90`}>
          Lounge TV
        </h2>
        <button type="button" onClick={onClose} aria-label="Put the remote down" title="Close (Esc)" className={`${rubber} h-8 w-8`}>
          <X size={15} aria-hidden="true" />
        </button>
      </header>

      {/* What's on, like the info line on a set-top box. */}
      <div className="mt-3 rounded-xl bg-[#0d0e10] px-3 py-2 shadow-[inset_0_1px_2px_rgba(0,0,0,0.7)]" aria-live="polite">
        <p className="truncate text-[12.5px] font-semibold">
          {channel ? (channel.paused ? "Paused" : "On now") : "TV is off"}
          {channel && (channel.title ?? playing?.title) ? `: ${channel.title ?? playing?.title}` : ""}
        </p>
        <p className="truncate text-[11px] text-white/55">
          {channel ? `Put on by ${channel.byName}${shared ? ", for everyone here" : ""}` : shared ? "What you put on, everyone here sees." : "Pick something to watch."}
        </p>
      </div>

      <div className="mt-3 flex min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain">
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-1.5">
          <label htmlFor={inputId} className="sr-only">
            {searchOn ? "Search YouTube or paste a link" : "YouTube link"}
          </label>
          <div className="flex items-center gap-1.5 rounded-full bg-[#0d0e10] py-1 pl-3 pr-1 shadow-[inset_0_1px_2px_rgba(0,0,0,0.7)] focus-within:ring-2 focus-within:ring-white/70">
            <Search size={14} aria-hidden="true" className="shrink-0 text-white/50" />
            <input
              ref={inputRef}
              id={inputId}
              name="youtube-search"
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
              placeholder={searchOn ? "Search YouTube or paste a link…" : "Paste a YouTube link…"}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              className="h-8 min-w-0 flex-1 bg-transparent text-[13px] text-white placeholder:text-white/45 focus:outline-none"
            />
            <button type="submit" aria-label={searchOn && !linkInDraft ? "Search" : "Play"} className={`${rubber} h-7 w-7 shrink-0`}>
              {searchOn && !linkInDraft ? <Search size={13} aria-hidden="true" /> : <Play size={13} aria-hidden="true" />}
            </button>
          </div>
          {error && (
            <p id={errorId} role="alert" className="px-1 text-[12px] leading-snug text-[#ff9d99]">
              {error}
            </p>
          )}
        </form>

        {search && (
          <TvSearchResults
            tone="dark"
            maxHeight="13rem"
            search={search}
            playingId={channel?.videoId ?? null}
            onPick={(result) => store.play({ id: result.id, title: result.title })}
            onClear={clear}
          />
        )}

        {/* Transport: stop, play/pause (the big one), mute. */}
        <div className="flex items-center justify-center gap-4 py-1">
          <button type="button" onClick={store.stop} disabled={!channel} aria-label="Stop" title="Stop" className={`${rubber} h-11 w-11`}>
            <Square size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => (channel?.paused ? store.resume() : store.pause())}
            disabled={!channel}
            aria-label={channel?.paused ? "Play" : "Pause"}
            title={channel?.paused ? "Play" : "Pause"}
            className={`${rubber} h-14 w-14 bg-[#34373e]`}
          >
            {channel?.paused || !channel ? <Play size={22} aria-hidden="true" className="translate-x-px" /> : <Pause size={22} aria-hidden="true" />}
          </button>
          <button type="button" onClick={() => store.setMuted(!muted)} aria-pressed={muted} aria-label="Mute" title={muted ? "Unmute" : "Mute"} className={`${rubber} h-11 w-11`}>
            {muted ? <VolumeX size={16} aria-hidden="true" /> : <Volume2 size={16} aria-hidden="true" />}
          </button>
        </div>

        {/* The volume rocker, with the level the way a TV shows it. Volume is yours alone. */}
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => store.setVolume(volume - 10)} aria-label="Volume down" className={`${rubber} h-8 w-8 shrink-0`}>
            <Minus size={14} aria-hidden="true" />
          </button>
          <div className="flex flex-1 items-end justify-between gap-[3px]" role="meter" aria-label="Volume" aria-valuemin={0} aria-valuemax={100} aria-valuenow={level}>
            {Array.from({ length: 10 }, (_, index) => (
              <span
                key={index}
                className={`w-full rounded-sm ${index < Math.round(level / 10) ? "bg-[#7fd18b]" : "bg-white/10"}`}
                style={{ height: `${6 + index * 1.4}px` }}
              />
            ))}
          </div>
          <button type="button" onClick={() => store.setVolume(volume + 10)} aria-label="Volume up" className={`${rubber} h-8 w-8 shrink-0`}>
            <Plus size={14} aria-hidden="true" />
          </button>
        </div>

        {/* Number keys for the preset channels. */}
        <ul className="grid grid-cols-2 gap-2" aria-label="Channels">
          {TV_SUGGESTIONS.map((item, index) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => store.play({ id: item.id, title: item.title })}
                aria-pressed={channel?.videoId === item.id}
                className={`flex w-full cursor-pointer items-center gap-2 rounded-2xl bg-[#2c2f35] px-2.5 py-2 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_2px_3px_rgba(0,0,0,0.45)] transition hover:bg-[#363940] active:translate-y-px aria-pressed:bg-[#3d4048] aria-pressed:ring-1 aria-pressed:ring-white/50 motion-reduce:transition-none ${focusRing}`}
              >
                <span className={`${pixelFont} text-[17px] leading-none text-white`}>{index + 1}</span>
                <span className="min-w-0 truncate text-[11px] leading-tight text-white/70">{item.title}</span>
              </button>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={onWatchBig}
          className={`mx-auto inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold text-white/80 transition hover:bg-white/10 hover:text-white motion-reduce:transition-none ${focusRing}`}
        >
          <Expand size={13} aria-hidden="true" /> Watch big
        </button>
      </div>
    </section>
  );
}
