// Server only. Keeps YouTube search inside its free quota: the YouTube Data API gives 10,000 units
// a day and every search costs 100, so about 100 searches. Repeat searches come from a cache, each
// visitor gets a few searches a minute, and the whole site stops calling YouTube after DAILY_CALLS
// in a day (UTC). In memory: resets when the server restarts and isn't shared between servers,
// which is fine for the hackathon (same as lib/mentor/rate-limit.ts).

import type { YouTubeSearchResult } from "@repo/shared";

const PER_MINUTE = 6;
const PER_DAY = 40;
const DAILY_CALLS = 90;
const CACHE_FOR = 6 * 60 * 60_000;
const CACHE_SIZE = 300;
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

const visitors = new Map<string, number[]>();
const cache = new Map<string, { at: number; results: YouTubeSearchResult[] }>();
let budget = { day: "", used: 0 };

export function cachedSearch(key: string, now = Date.now()) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (now - hit.at > CACHE_FOR) {
    cache.delete(key);
    return null;
  }
  return hit.results;
}

export function rememberSearch(key: string, results: YouTubeSearchResult[], now = Date.now()) {
  cache.delete(key);
  cache.set(key, { at: now, results });
  // Maps keep insertion order: drop the oldest once there are too many.
  while (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
}

// One call to YouTube for this visitor, if they and the site still have some left today.
export function takeSearch(visitor: string, now = Date.now()): "ok" | "visitor" | "site" {
  const recent = (visitors.get(visitor) ?? []).filter((at) => now - at < DAY);
  if (recent.filter((at) => now - at < MINUTE).length >= PER_MINUTE || recent.length >= PER_DAY) {
    visitors.set(visitor, recent);
    return "visitor";
  }
  const day = new Date(now).toISOString().slice(0, 10);
  if (budget.day !== day) budget = { day, used: 0 };
  if (budget.used >= DAILY_CALLS) return "site";
  budget.used++;
  recent.push(now);
  visitors.set(visitor, recent);
  return "ok";
}
