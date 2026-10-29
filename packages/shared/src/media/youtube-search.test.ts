import { describe, expect, test } from "bun:test";
import { cleanSearchQuery, decodeEntities, readYouTubeSearch, searchCacheKey } from "./youtube-search";

describe("youtube search", () => {
  test("reads videos from a search.list answer", () => {
    const answer = {
      kind: "youtube#searchListResponse",
      items: [
        { id: { kind: "youtube#video", videoId: "arj7oStGLkU" }, snippet: { title: "Inside the Mind of a Master Procrastinator | Tim Urban | TED", channelTitle: "TED" } },
        { id: { kind: "youtube#video", videoId: "iG9CE55wbtY" }, snippet: { title: "Don&#39;t &amp; do &quot;this&quot;", channelTitle: "Tom &amp; Co" } },
      ],
    };
    expect(readYouTubeSearch(answer)).toEqual([
      { id: "arj7oStGLkU", title: "Inside the Mind of a Master Procrastinator | Tim Urban | TED", channel: "TED", thumbnail: "https://i.ytimg.com/vi/arj7oStGLkU/mqdefault.jpg" },
      { id: "iG9CE55wbtY", title: 'Don\'t & do "this"', channel: "Tom & Co", thumbnail: "https://i.ytimg.com/vi/iG9CE55wbtY/mqdefault.jpg" },
    ]);
  });

  test("leaves out channels, bad ids, duplicates and untitled items, and ignores junk", () => {
    const answer = {
      items: [
        { id: { kind: "youtube#channel", channelId: "UCAuUUnT6oDeKwE6v1NGQxug" }, snippet: { title: "TED" } },
        { id: { videoId: "too-short" }, snippet: { title: "Bad id" } },
        { id: { videoId: "arj7oStGLkU" }, snippet: { title: "First" } },
        { id: { videoId: "arj7oStGLkU" }, snippet: { title: "Again" } },
        { id: { videoId: "aqz-KE-bpKQ" }, snippet: {} },
        null,
        "text",
      ],
    };
    expect(readYouTubeSearch(answer).map((result) => result.title)).toEqual(["First"]);
    for (const junk of [null, undefined, "x", 3, {}, { items: "nope" }]) expect(readYouTubeSearch(junk)).toEqual([]);
  });

  test("the thumbnail never comes from the answer", () => {
    const answer = { items: [{ id: { videoId: "arj7oStGLkU" }, snippet: { title: "A", thumbnails: { medium: { url: "https://evil.example/x.jpg" } } } }] };
    expect(readYouTubeSearch(answer)[0]!.thumbnail).toBe("https://i.ytimg.com/vi/arj7oStGLkU/mqdefault.jpg");
  });

  test("search text is tidied, capped, and cached case-insensitively", () => {
    expect(cleanSearchQuery("   lofi\n\n  beats  ")).toBe("lofi beats");
    expect(cleanSearchQuery("x".repeat(500))).toHaveLength(100);
    expect(cleanSearchQuery("   ")).toBe("");
    expect(searchCacheKey("Lofi  Beats")).toBe(searchCacheKey("lofi beats"));
  });

  test("entities decode, odd ones are left alone", () => {
    expect(decodeEntities("a &lt;b&gt; &#x27;c&#x27; &apos;d&apos; &#128512;")).toBe("a <b> 'c' 'd' 😀");
    expect(decodeEntities("&bogus; &#0;")).toBe("&bogus; &#0;");
  });
});
