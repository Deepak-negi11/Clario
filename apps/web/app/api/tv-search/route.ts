// GET /api/tv-search?q=...: search YouTube for the Lounge TV. The YouTube Data API key stays on the
// server (YOUTUBE_API_KEY). Only embeddable videos come back, with SafeSearch on (moderate), so
// whatever is picked can play in the TV's embedded player. Without a key, search is off and the TV
// still plays pasted links. GET with no q just says whether search is on.

import { cleanSearchQuery, readYouTubeSearch, searchCacheKey, type YouTubeSearchResponse } from "@repo/shared";
import { cachedSearch, rememberSearch, takeSearch } from "../../../lib/tv/search-limits";

const SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const TIMEOUT_MS = 6_000;
const RESULTS = 8;

function visitorOf(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

const reply = (body: YouTubeSearchResponse, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  const key = process.env.YOUTUBE_API_KEY?.trim();
  if (!key) return reply({ enabled: false });

  const query = cleanSearchQuery(new URL(request.url).searchParams.get("q") ?? "");
  if (!query) return reply({ enabled: true, results: [] });

  const cacheKey = searchCacheKey(query);
  const cached = cachedSearch(cacheKey);
  if (cached) return reply({ enabled: true, results: cached });

  const allowed = takeSearch(visitorOf(request));
  if (allowed === "visitor") return reply({ enabled: true, error: "That's a lot of searches. Try again in a minute, or paste a link." }, 429);
  if (allowed === "site") return reply({ enabled: true, error: "Search is done for today. Paste a YouTube link instead." }, 429);

  const url = new URL(SEARCH_URL);
  for (const [name, value] of Object.entries({
    part: "snippet",
    type: "video",
    videoEmbeddable: "true",
    safeSearch: "moderate",
    maxResults: String(RESULTS),
    q: query,
    key,
  })) url.searchParams.set(name, value);

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    if (!response.ok) {
      // Don't pass Google's error body on: it can repeat request details.
      console.warn(`[tv-search] YouTube answered ${response.status}`);
      const message = response.status === 403 ? "YouTube search isn't available right now. Paste a link instead." : "YouTube didn't answer. Try again, or paste a link.";
      return reply({ enabled: true, error: message }, 502);
    }
    const results = readYouTubeSearch(await response.json());
    rememberSearch(cacheKey, results);
    return reply({ enabled: true, results });
  } catch (error) {
    console.warn("[tv-search] search failed:", error instanceof Error ? error.name : error);
    return reply({ enabled: true, error: "YouTube didn't answer. Try again, or paste a link." }, 502);
  }
}
