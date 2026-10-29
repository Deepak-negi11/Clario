import { isYouTubeVideoId } from "./youtube";

// Searching YouTube for the Lounge TV. The web server calls the YouTube Data API (search.list) with
// its own key and hands the TV a short list of embeddable videos; this file reads that answer and
// the search text, so both can be tested without the network.

export type YouTubeSearchResult = { id: string; title: string; channel: string; thumbnail: string };

export type YouTubeSearchResponse =
  | { enabled: false }
  | { enabled: true; results: YouTubeSearchResult[] }
  | { enabled: true; error: string };

export const SEARCH_QUERY_MAX = 100;

// Trim, squash spaces, cap the length. Empty means there's nothing to search for.
export function cleanSearchQuery(input: string): string {
  return input.replace(/\s+/g, " ").trim().slice(0, SEARCH_QUERY_MAX);
}

// The same search typed differently ("Lofi  Beats", "lofi beats") is one cache entry.
export function searchCacheKey(query: string): string {
  return cleanSearchQuery(query).toLowerCase();
}

// The API returns titles with HTML entities ("Tom &amp; Jerry", "Don&#39;t").
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, code: string) => {
    const lower = code.toLowerCase();
    if (lower === "amp") return "&";
    if (lower === "lt") return "<";
    if (lower === "gt") return ">";
    if (lower === "quot") return '"';
    if (lower === "apos") return "'";
    const value = lower.startsWith("#x") ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1), 10);
    return Number.isFinite(value) && value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : match;
  });
}

// Videos from a search.list answer. Anything that isn't a well-formed video is left out, and the
// thumbnail is always YouTube's own image for that id (never a URL taken from the answer).
export function readYouTubeSearch(json: unknown): YouTubeSearchResult[] {
  const items = json && typeof json === "object" && Array.isArray((json as { items?: unknown }).items) ? (json as { items: unknown[] }).items : [];
  const results: YouTubeSearchResult[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const { id, snippet } = item as { id?: { videoId?: unknown }; snippet?: { title?: unknown; channelTitle?: unknown } };
    const videoId = id?.videoId;
    if (typeof videoId !== "string" || !isYouTubeVideoId(videoId) || results.some((result) => result.id === videoId)) continue;
    const title = typeof snippet?.title === "string" ? decodeEntities(snippet.title).slice(0, 200) : "";
    const channel = typeof snippet?.channelTitle === "string" ? decodeEntities(snippet.channelTitle).slice(0, 100) : "";
    if (!title) continue;
    results.push({ id: videoId, title, channel, thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` });
  }
  return results;
}
