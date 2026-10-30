"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseYouTubeUrl, type YouTubeSearchResponse, type YouTubeSearchResult, type YouTubeVideo } from "@repo/shared";

// Searching YouTube for the Lounge TV, shared by the big TV overlay and the remote. Search goes
// through our server (app/api/tv-search), which holds the YouTube Data API key; without one,
// search is off and pasted links still play.

export type TvSearch = { query: string; results: YouTubeSearchResult[] | null };

export function useTvSearch() {
  // Whether the server can search (null until it says), the last search, and what went wrong.
  const [searchOn, setSearchOn] = useState<boolean | null>(null);
  const [search, setSearch] = useState<TvSearch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);

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
      requestRef.current?.abort();
    };
  }, []);

  const runSearch = useCallback(async (query: string) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
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
  }, []);

  // What the box does with its text: a link plays straight away; words search (when the server
  // can). Returns true when the box can be cleared.
  const submit = useCallback(
    (text: string, play: (video: YouTubeVideo) => void) => {
      const link = parseYouTubeUrl(text);
      if (link) {
        setError(null);
        play(link);
        return true;
      }
      const query = text.trim();
      if (query && searchOn) {
        void runSearch(query);
        return false;
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
      return false;
    },
    [runSearch, searchOn],
  );

  return { searchOn, search, error, setError, submit, clear: () => setSearch(null) };
}

const TONES = {
  light: {
    row: "border-[#eceef1] bg-white hover:border-[#dfe2e6] hover:bg-[#f7f8f9] aria-pressed:border-[#12151c] aria-pressed:bg-[#f4f5f7]",
    title: "text-[#12151c]",
    channel: "text-[#5c6371]",
    muted: "text-[#4b5260]",
    skeleton: "bg-[#eef0f2]",
    border: "border-[#eceef1]",
    note: "text-[#8a909b]",
    focus: "focus-visible:outline-[#12151c]",
  },
  dark: {
    row: "border-white/10 bg-white/[0.04] hover:bg-white/[0.09] aria-pressed:border-white/60 aria-pressed:bg-white/[0.12]",
    title: "text-[#f1f2f4]",
    channel: "text-white/60",
    muted: "text-white/70",
    skeleton: "bg-white/10",
    border: "border-white/10",
    note: "text-white/45",
    focus: "focus-visible:outline-white",
  },
} as const;

// The results of a search: thumbnail, title and channel; picking one plays it.
export function TvSearchResults({
  search,
  playingId,
  onPick,
  onClear,
  tone = "light",
  maxHeight = "22rem",
}: {
  search: TvSearch;
  playingId: string | null;
  onPick: (result: YouTubeSearchResult) => void;
  onClear: () => void;
  tone?: keyof typeof TONES;
  maxHeight?: string;
}) {
  const style = TONES[tone];
  const focus = `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${style.focus}`;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className={`min-w-0 truncate text-[12px] font-medium ${style.channel}`}>
          Results for <span className={style.title}>&ldquo;{search.query}&rdquo;</span>
        </h3>
        <button type="button" onClick={onClear} className={`shrink-0 cursor-pointer rounded text-[12px] font-semibold ${style.title} hover:underline ${focus}`}>
          Clear
        </button>
      </div>
      {search.results === null ? (
        <ul className="mt-1.5 flex flex-col gap-1.5" aria-busy="true" aria-label="Searching">
          {[0, 1, 2].map((row) => (
            <li key={row} className={`flex items-center gap-2.5 rounded-xl border p-1.5 ${style.border}`}>
              <span className={`aspect-video w-24 shrink-0 animate-pulse rounded-lg motion-reduce:animate-none ${style.skeleton}`} />
              <span className="flex flex-1 flex-col gap-1.5">
                <span className={`h-3 w-11/12 animate-pulse rounded motion-reduce:animate-none ${style.skeleton}`} />
                <span className={`h-2.5 w-1/2 animate-pulse rounded motion-reduce:animate-none ${style.skeleton}`} />
              </span>
            </li>
          ))}
        </ul>
      ) : search.results.length === 0 ? (
        <p className={`mt-1.5 text-[13px] ${style.muted}`}>No videos found. Try other words, or paste a link.</p>
      ) : (
        <ul className="mt-1.5 flex flex-col gap-1.5 overflow-y-auto overscroll-contain pr-0.5" style={{ maxHeight }} aria-label="Search results">
          {search.results.map((result) => (
            <li key={result.id}>
              <button
                type="button"
                aria-pressed={playingId === result.id}
                onClick={() => onPick(result)}
                title={result.title}
                className={`flex w-full cursor-pointer items-center gap-2.5 rounded-xl border p-1.5 text-left transition motion-reduce:transition-none ${style.row} ${focus}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- small thumbnails from i.ytimg.com; next/image would need remotePatterns in next.config */}
                <img src={result.thumbnail} alt="" width={96} height={54} loading="lazy" className={`aspect-video w-24 shrink-0 rounded-lg object-cover ${style.skeleton}`} />
                <span className="min-w-0">
                  <span className={`line-clamp-2 text-[12.5px] font-semibold leading-snug ${style.title}`}>{result.title}</span>
                  <span className={`mt-0.5 block truncate text-[11.5px] ${style.channel}`}>{result.channel}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className={`mt-1.5 text-[11px] ${style.note}`}>Results from YouTube.</p>
      <p className="sr-only" aria-live="polite">
        {search.results === null ? "Searching…" : search.results.length === 0 ? "No videos found." : `${search.results.length} videos found.`}
      </p>
    </div>
  );
}
