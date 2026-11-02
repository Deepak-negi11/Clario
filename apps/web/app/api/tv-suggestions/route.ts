// GET /api/tv-suggestions?page=n: tech videos for a TV that's turned on with nothing playing, one
// topic a page ("More" asks for the next). From YouTube when there's a key (each topic searched at
// most once a day), otherwise talks picked by hand (lib/tv/tech-suggestions.ts).

import { readYouTubeSearch } from "@repo/shared";
import { takeSiteCall } from "../../../lib/tv/search-limits";
import { createTechSuggestions, type TopicSearch } from "../../../lib/tv/tech-suggestions";

const SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const TIMEOUT_MS = 6_000;
const RESULTS = 6;

const searchYouTube = (key: string): TopicSearch => async (query) => {
  if (!takeSiteCall()) return null;
  const url = new URL(SEARCH_URL);
  for (const [name, value] of Object.entries({
    part: "snippet",
    type: "video",
    videoEmbeddable: "true",
    safeSearch: "moderate",
    relevanceLanguage: "en",
    maxResults: String(RESULTS),
    q: query,
    key,
  })) url.searchParams.set(name, value);
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    if (!response.ok) {
      // Don't pass Google's error body on: it can repeat request details.
      console.warn(`[tv-suggestions] YouTube answered ${response.status}`);
      return null;
    }
    return readYouTubeSearch(await response.json());
  } catch (error) {
    console.warn("[tv-suggestions] search failed:", error instanceof Error ? error.name : error);
    return null;
  }
};

const key = process.env.YOUTUBE_API_KEY?.trim();
const suggestions = createTechSuggestions(key ? searchYouTube(key) : null);

export async function GET(request: Request) {
  const page = Number(new URL(request.url).searchParams.get("page") ?? 0);
  const body = await suggestions(Number.isFinite(page) ? page : 0);
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
