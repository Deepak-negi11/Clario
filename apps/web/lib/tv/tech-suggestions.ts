// Server only. What a TV shows when it's turned on with nothing playing: tech videos, a topic a
// page (app/api/tv-suggestions). With a YouTube key each topic is one search, kept for a day, so
// suggestions cost a handful of the ~100 searches a day the free quota allows. Without a key, or
// when YouTube can't be reached or the day's searches are used up, the TV shows talks picked by hand.

import type { YouTubeSearchResult } from "@repo/shared";

export type TechTopic = { label: string; query: string };
export type SuggestionsPage = { topic: string; source: "youtube" | "picked"; results: YouTubeSearchResult[] };

export const TECH_TOPICS: TechTopic[] = [
  { label: "AI explained", query: "AI explained" },
  { label: "Web development", query: "web development tutorial" },
  { label: "System design", query: "system design explained" },
  { label: "Tech news", query: "tech news this week" },
  { label: "Coding interviews", query: "coding interview tips" },
];

const KEEP_FOR = 24 * 60 * 60_000;
// After YouTube says no (quota, an error), don't ask again for this long.
const BACK_OFF = 10 * 60_000;

const picked = (id: string, title: string, channel: string): YouTubeSearchResult => ({
  id,
  title,
  channel,
  thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
});

// Real and embeddable: each id was checked against YouTube's oEmbed endpoint on 2026-11-03, and the
// titles and channels are what it returned.
export const PICKED_PAGES: SuggestionsPage[] = [
  {
    topic: "AI explained",
    source: "picked",
    results: [
      picked("aircAruvnKk", "But what is a neural network? | Deep learning chapter 1", "3Blue1Brown"),
      picked("wjZofJX0v4M", "Transformers, the tech behind LLMs | Deep Learning Chapter 5", "3Blue1Brown"),
      picked("zjkBMFhNj_g", "[1hr Talk] Intro to Large Language Models", "Andrej Karpathy"),
      picked("kCc8FmEb1nY", "Let's build GPT: from scratch, in code, spelled out.", "Andrej Karpathy"),
      picked("i_LwzRVP7bg", "Machine Learning for Everybody – Full Course", "freeCodeCamp.org"),
      picked("bBC-nXj3Ng4", "But how does bitcoin actually work?", "3Blue1Brown"),
    ],
  },
  {
    topic: "Web development",
    source: "picked",
    results: [
      picked("DHjqpvDnNGE", "JavaScript in 100 Seconds", "Fireship"),
      picked("zQnBQ4tB3ZA", "TypeScript in 100 Seconds", "Fireship"),
      picked("Tn6-PIqc4UM", "React in 100 Seconds", "Fireship"),
      picked("hwP7WQkmECE", "Git Explained in 100 Seconds", "Fireship"),
      picked("Gjnup-PuquQ", "Docker in 100 Seconds", "Fireship"),
      picked("PziYflu8cB8", "Kubernetes Explained in 100 Seconds", "Fireship"),
    ],
  },
  {
    topic: "Tech talks",
    source: "picked",
    results: [
      picked("i7twT3x5yv8", "System Design Interview: A Step-By-Step Guide", "ByteByteGo"),
      picked("SxdOUGdseq4", '"Simple Made Easy" - Rich Hickey (2011)', "Strange Loop Conference"),
      picked("lKXe3HUG2l4", '"The Mess We\'re In" by Joe Armstrong', "Strange Loop Conference"),
      picked("6avJHaC3C2U", "The Art of Code - Dylan Beattie", "NDC Conferences"),
      picked("o8NPllzkFhE", "The Mind Behind Linux | Linus Torvalds | TED", "TED"),
    ],
  },
];

// Asks YouTube for one topic: the results, or null when it couldn't (no key, quota, an error).
export type TopicSearch = (query: string) => Promise<YouTubeSearchResult[] | null>;

export function createTechSuggestions(search: TopicSearch | null) {
  const kept = new Map<string, { at: number; results: YouTubeSearchResult[] }>();
  const asking = new Map<string, Promise<YouTubeSearchResult[] | null>>();
  let failedAt = -Infinity;

  const fallback = (page: number): SuggestionsPage => PICKED_PAGES[page % PICKED_PAGES.length]!;

  // Page n (from 0, it wraps around): one topic's videos.
  return async function page(n: number, now = Date.now()): Promise<SuggestionsPage> {
    const index = ((Math.floor(n) % TECH_TOPICS.length) + TECH_TOPICS.length) % TECH_TOPICS.length;
    const topic = TECH_TOPICS[index]!;
    const hit = kept.get(topic.label);
    if (hit && now - hit.at < KEEP_FOR) return { topic: topic.label, source: "youtube", results: hit.results };
    if (!search || now - failedAt < BACK_OFF) return fallback(index);

    // Many TVs turned on at once ask YouTube once.
    let pending = asking.get(topic.label);
    if (!pending) {
      pending = search(topic.query).finally(() => asking.delete(topic.label));
      asking.set(topic.label, pending);
    }
    const results = await pending.catch(() => null);
    if (!results || results.length === 0) {
      failedAt = now;
      return fallback(index);
    }
    kept.set(topic.label, { at: now, results });
    return { topic: topic.label, source: "youtube", results };
  };
}
