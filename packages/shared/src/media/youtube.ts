// YouTube links for the Lounge TV: read a video id (and start time) out of whatever link the
// player pastes, and build the privacy-enhanced embed URL. No YouTube Data API, so no key.

export type YouTubeVideo = { id: string; start?: number };

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const MAX_INPUT = 2048;

// Hosts that serve watch pages or embeds. Anything else is rejected, even with a ?v= on it.
const WATCH_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"]);
const EMBED_HOSTS = new Set(["youtube-nocookie.com", "www.youtube-nocookie.com"]);
const SHORT_HOSTS = new Set(["youtu.be", "www.youtu.be"]);

// Path forms that carry the id as the next segment: /shorts/<id>, /embed/<id>, /live/<id>, /v/<id>.
const ID_PATHS = new Set(["shorts", "embed", "live", "v", "e"]);

export function isYouTubeVideoId(value: string): boolean {
  return VIDEO_ID.test(value);
}

// "90", "90s", "1m30s", "1h2m3s" -> seconds. Anything else is ignored.
export function parseYouTubeTime(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const text = value.trim().toLowerCase();
  if (/^\d+$/.test(text)) return positive(Number(text));
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(text);
  if (!match || !text) return undefined;
  const [, hours = "0", minutes = "0", seconds = "0"] = match;
  return positive(Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds));
}

function positive(seconds: number) {
  return Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : undefined;
}

function toUrl(input: string): URL | null {
  const text = input.trim();
  if (!text || text.length > MAX_INPUT || /\s/.test(text)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

function idFromUrl(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split("/").filter(Boolean);

  if (SHORT_HOSTS.has(host)) return segments[0] ?? null;

  if (EMBED_HOSTS.has(host)) return segments[0] === "embed" ? (segments[1] ?? null) : null;

  if (!WATCH_HOSTS.has(host)) return null;
  if (segments[0] === "watch") return url.searchParams.get("v");
  if (segments[0] && ID_PATHS.has(segments[0])) return segments[1] ?? null;
  // Some old share links put the id in ?v= on the home page.
  if (segments.length === 0) return url.searchParams.get("v");
  return null;
}

// A video id and start time from a pasted link or a bare 11-character id, or null when the text
// isn't a link to one YouTube video.
export function parseYouTubeUrl(input: string): YouTubeVideo | null {
  const text = input.trim();
  if (isYouTubeVideoId(text)) return { id: text };

  const url = toUrl(text);
  if (!url) return null;
  const id = idFromUrl(url);
  if (!id || !isYouTubeVideoId(id)) return null;

  // Time can be in the query (?t=, ?start=) or, on some share links, in the hash (#t=).
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const start = parseYouTubeTime(url.searchParams.get("t") ?? url.searchParams.get("start") ?? hash.get("t"));
  return start ? { id, start } : { id };
}

// The privacy-enhanced embed (youtube-nocookie.com). rel=0 keeps suggestions to the same channel.
export function youTubeEmbedUrl(video: YouTubeVideo, options: { autoplay?: boolean } = {}): string {
  const params = new URLSearchParams({ rel: "0", playsinline: "1" });
  if (options.autoplay) params.set("autoplay", "1");
  if (video.start) params.set("start", String(video.start));
  return `https://www.youtube-nocookie.com/embed/${video.id}?${params}`;
}

export function youTubeWatchUrl(video: YouTubeVideo): string {
  const params = new URLSearchParams({ v: video.id });
  if (video.start) params.set("t", `${video.start}s`);
  return `https://www.youtube.com/watch?${params}`;
}
