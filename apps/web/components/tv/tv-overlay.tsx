"use client";

import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ExternalLink, Play, Power, Search, UsersRound, X } from "lucide-react";
import {
  parseYouTubeUrl, youTubeEmbedUrl, youTubeWatchUrl,
  type YouTubeSearchResponse, type YouTubeSearchResult, type YouTubeVideo,
} from "@repo/shared";
import { OverlayDialog } from "../games/overlay-dialog";
import { TV_SUGGESTIONS } from "./tv-channels";

// The Lounge TV: search YouTube, paste a link, or pick a suggestion, and it plays in YouTube's own
// embedded player from youtube-nocookie.com. Search goes through our server (app/api/tv-search),
// which holds the YouTube Data API key; without one, search is off and links still play. It's an HTML overlay because a cross-origin iframe can't be
// painted into the Phaser or 3D scene. Nothing here touches the player: its ads, controls and
// branding stay as YouTube serves them.
//
// In a space the TV is shared (`shared`): what one person puts on, everyone in the space sees,
// from the same point in the video. On its own (/arcade) it is just yours.

export type SharedTv = {
  // What's on now: position is seconds into the video when it arrived (receivedAt, Date.now()).
  now: { videoId: string; position: number; byName: string; receivedAt: number } | null;
  play: (video: YouTubeVideo) => void;
  stop: () => void;
};

const pixelFont = "font-[family-name:var(--font-pixel)]";
const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12151c]";

export function TvOverlay({
  onDismiss,
  initialVideo,
  shared,
  banner,
}: {
  onDismiss: () => void;
  initialVideo?: YouTubeVideo;
  shared?: SharedTv;
  banner?: ReactNode;
}) {
  const titleId = useId();
  const inputId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const [ownVideo, setOwnVideo] = useState<YouTubeVideo | null>(initialVideo ?? null);
  const [error, setError] = useState<string | null>(null);
  // Search: whether the server can search (null until it says), and the last search's results.
  const [searchOn, setSearchOn] = useState<boolean | null>(null);
  const [search, setSearch] = useState<{ query: string; results: YouTubeSearchResult[] | null } | null>(null);
  const searchRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/tv-search", { signal: controller.signal, cache: "no-store" })
      .then((response) => response.json() as Promise<YouTubeSearchResponse>)
      .then((body) => setSearchOn(body.enabled))
      .catch(() => {
        if (!controller.signal.aborted) setSearchOn(false);
      });
    return () => {
      controller.abort();
      searchRef.current?.abort();
    };
  }, []);

  const runSearch = async (query: string) => {
    searchRef.current?.abort();
    const controller = new AbortController();
    searchRef.current = controller;
    setSearch({ query, results: null });
    setError(null);
    try {
      const response = await fetch(`/api/tv-search?q=${encodeURIComponent(query)}`, { signal: controller.signal, cache: "no-store" });
      const body = (await response.json()) as YouTubeSearchResponse;
      if (!body.enabled) {
        setSearchOn(false);
        setSearch(null);
        setError("Search is off here. Paste a YouTube link instead.");
      } else if ("error" in body) {
        setSearch(null);
        setError(body.error);
      } else {
        setSearch({ query, results: body.results });
      }
    } catch {
      if (controller.signal.aborted) return;
      setSearch(null);
      setError("Couldn't search just now. Try again, or paste a link.");
    }
  };

  // On a shared TV, join at the point everyone else is at. Worked out once per change so the
  // player isn't reloaded on every render.
  const sharedId = shared?.now?.videoId;
  const sharedPosition = shared?.now?.position ?? 0;
  const sharedAt = shared?.now?.receivedAt ?? 0;
  const sharedVideo = useMemo<YouTubeVideo | null>(
    () => (sharedId ? { id: sharedId, start: Math.floor(sharedPosition + (Date.now() - sharedAt) / 1000) } : null),
    [sharedId, sharedPosition, sharedAt],
  );
  const video = shared ? sharedVideo : ownVideo;
  const suggestion = video ? TV_SUGGESTIONS.find((item) => item.id === video.id) : undefined;

  const play = (next: YouTubeVideo) => {
    setError(null);
    if (shared) shared.play(next);
    else setOwnVideo(next);
  };
  const turnOff = () => {
    if (shared) shared.stop();
    else setOwnVideo(null);
  };

  // Ready to paste on a computer; on a phone, focusing the box would cover the TV with the keyboard.
  useEffect(() => {
    if (!window.matchMedia("(pointer: coarse)").matches) inputRef.current?.focus({ preventScroll: true });
  }, []);

  // A link plays straight away; anything else is a search (when the server can search).
  const linkInDraft = parseYouTubeUrl(draft);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (linkInDraft) {
      play(linkInDraft);
      setDraft("");
      return;
    }
    const query = draft.trim();
    if (query && searchOn) {
      void runSearch(query);
      return;
    }
    setError(
      !query
        ? searchOn
          ? "Type what you want to watch, or paste a link."
          : "Paste a YouTube link first."
        : searchOn === false
          ? "Search is off here (the server has no YouTube key). Paste a link like youtube.com/watch?v=… instead."
          : "That isn't a link to a YouTube video. Try one like youtube.com/watch?v=… or youtu.be/…",
    );
    inputRef.current?.focus();
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
                {video ? (
                  <iframe
                    key={`${video.id}-${video.start ?? 0}`}
                    src={youTubeEmbedUrl(video, { autoplay: true })}
                    title={suggestion ? `${suggestion.title} (YouTube)` : "YouTube video"}
                    className="absolute inset-0 h-full w-full border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    referrerPolicy="strict-origin-when-cross-origin"
                  />
                ) : (
                  <TvTestCard note={searchOn ? "Search, paste a link or pick a video." : undefined} />
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
                  {shared.now ? (
                    <>
                      Everyone in this space is watching this together. Put on by{" "}
                      <strong className="font-semibold text-[#12151c]">{shared.now.byName}</strong>.
                    </>
                  ) : (
                    "Everyone in this space sees what you put on this TV."
                  )}
                </span>
              </p>
            )}

            <form onSubmit={submit} noValidate className="flex flex-col gap-2">
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

            {search && (
              <div>
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="min-w-0 truncate text-[12px] font-medium text-[#5c6371]">
                    Results for <span className="text-[#12151c]">&ldquo;{search.query}&rdquo;</span>
                  </h3>
                  <button type="button" onClick={() => setSearch(null)} className={`shrink-0 cursor-pointer rounded text-[12px] font-semibold text-[#12151c] hover:underline ${focusRing}`}>
                    Clear
                  </button>
                </div>
                {search.results === null ? (
                  <ul className="mt-1.5 flex flex-col gap-1.5" aria-busy="true" aria-label="Searching">
                    {[0, 1, 2].map((row) => (
                      <li key={row} className="flex items-center gap-2.5 rounded-xl border border-[#eceef1] p-1.5">
                        <span className="aspect-video w-24 shrink-0 animate-pulse rounded-lg bg-[#eef0f2] motion-reduce:animate-none" />
                        <span className="flex flex-1 flex-col gap-1.5">
                          <span className="h-3 w-11/12 animate-pulse rounded bg-[#eef0f2] motion-reduce:animate-none" />
                          <span className="h-2.5 w-1/2 animate-pulse rounded bg-[#eef0f2] motion-reduce:animate-none" />
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : search.results.length === 0 ? (
                  <p className="mt-1.5 text-[13px] text-[#4b5260]">No videos found. Try other words, or paste a link.</p>
                ) : (
                  <ul className="mt-1.5 flex max-h-[22rem] flex-col gap-1.5 overflow-y-auto overscroll-contain pr-0.5" aria-label="Search results">
                    {search.results.map((result) => (
                      <li key={result.id}>
                        <button
                          type="button"
                          aria-pressed={video?.id === result.id}
                          onClick={() => play({ id: result.id })}
                          title={result.title}
                          className={`flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-[#eceef1] bg-white p-1.5 text-left transition hover:border-[#dfe2e6] hover:bg-[#f7f8f9] aria-pressed:border-[#12151c] aria-pressed:bg-[#f4f5f7] motion-reduce:transition-none ${focusRing}`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element -- small thumbnails from i.ytimg.com; next/image would need remotePatterns in next.config */}
                          <img src={result.thumbnail} alt="" width={96} height={54} loading="lazy" className="aspect-video w-24 shrink-0 rounded-lg bg-[#eef0f2] object-cover" />
                          <span className="min-w-0">
                            <span className="line-clamp-2 text-[12.5px] font-semibold leading-snug">{result.title}</span>
                            <span className="mt-0.5 block truncate text-[11.5px] text-[#5c6371]">{result.channel}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-1.5 text-[11px] text-[#8a909b]">Results from YouTube.</p>
                <p className="sr-only" aria-live="polite">
                  {search.results === null ? "Searching…" : search.results.length === 0 ? "No videos found." : `${search.results.length} videos found.`}
                </p>
              </div>
            )}

            <div className={search ? "hidden" : undefined}>
              <h3 className="text-[12px] font-medium text-[#5c6371]">Or pick one</h3>
              <ul className="mt-1.5 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
                {TV_SUGGESTIONS.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      aria-pressed={video?.id === item.id}
                      onClick={() => play({ id: item.id })}
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

            <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 text-[12px] text-[#5c6371]">
              <p className="mr-auto">Plays in YouTube&apos;s own player.</p>
              {video && (
                <>
                  <a
                    href={youTubeWatchUrl(video)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-1 rounded text-[#12151c] underline-offset-2 hover:underline ${focusRing}`}
                  >
                    Open on YouTube <ExternalLink size={12} aria-hidden="true" />
                  </a>
                  <button type="button" onClick={turnOff} className={`inline-flex cursor-pointer items-center gap-1 rounded text-[#12151c] hover:underline ${focusRing}`}>
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
