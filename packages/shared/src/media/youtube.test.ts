import { describe, expect, test } from "bun:test";
import { isYouTubeVideoId, parseYouTubeTime, parseYouTubeUrl, youTubeEmbedUrl, youTubeWatchUrl } from "./youtube";

const ID = "arj7oStGLkU";

describe("parseYouTubeUrl", () => {
  test("reads the id from the common link forms", () => {
    const links = [
      `https://www.youtube.com/watch?v=${ID}`,
      `https://youtube.com/watch?v=${ID}&list=PL123&index=2`,
      `https://m.youtube.com/watch?feature=share&v=${ID}`,
      `https://music.youtube.com/watch?v=${ID}`,
      `http://www.youtube.com/watch?v=${ID}`,
      `www.youtube.com/watch?v=${ID}`,
      `youtube.com/watch?v=${ID}`,
      `https://youtu.be/${ID}`,
      `https://youtu.be/${ID}?si=AbCdEf123`,
      `youtu.be/${ID}`,
      `https://www.youtube.com/shorts/${ID}`,
      `https://youtube.com/shorts/${ID}?feature=share`,
      `https://www.youtube.com/embed/${ID}`,
      `https://www.youtube-nocookie.com/embed/${ID}?rel=0`,
      `https://www.youtube.com/live/${ID}`,
      `https://www.youtube.com/v/${ID}`,
      `https://WWW.YouTube.com/watch?v=${ID}`,
      `  https://www.youtube.com/watch?v=${ID}  `,
      ID,
    ];
    for (const link of links) expect(parseYouTubeUrl(link)).toEqual({ id: ID });
  });

  test("keeps the start time from t= or start=", () => {
    expect(parseYouTubeUrl(`https://youtu.be/${ID}?t=90`)).toEqual({ id: ID, start: 90 });
    expect(parseYouTubeUrl(`https://www.youtube.com/watch?v=${ID}&t=1m30s`)).toEqual({ id: ID, start: 90 });
    expect(parseYouTubeUrl(`https://www.youtube.com/embed/${ID}?start=42`)).toEqual({ id: ID, start: 42 });
    expect(parseYouTubeUrl(`https://www.youtube.com/watch?v=${ID}#t=1h2m3s`)).toEqual({ id: ID, start: 3723 });
    expect(parseYouTubeUrl(`https://youtu.be/${ID}?t=0`)).toEqual({ id: ID });
    expect(parseYouTubeUrl(`https://youtu.be/${ID}?t=soon`)).toEqual({ id: ID });
  });

  test("rejects links that are not one YouTube video", () => {
    const bad = [
      "",
      "   ",
      "hello there",
      "https://example.com/watch?v=" + ID,
      "https://youtube.com.evil.example/watch?v=" + ID,
      "https://notyoutube.com/watch?v=" + ID,
      "https://www.youtube.com/watch?v=short",
      "https://www.youtube.com/watch?v=" + ID + "x",
      "https://www.youtube.com/watch",
      "https://www.youtube.com/playlist?list=PL123",
      "https://www.youtube.com/@TED",
      "https://www.youtube.com/channel/UCAuUUnT6oDeKwE6v1NGQxug",
      "https://youtu.be/",
      "https://www.youtube-nocookie.com/watch?v=" + ID,
      "javascript:alert(1)//youtu.be/" + ID,
      "ftp://youtu.be/" + ID,
      `https://youtu.be/${ID} https://youtu.be/${ID}`,
      "https://youtu.be/" + "a".repeat(3000),
    ];
    for (const link of bad) expect(parseYouTubeUrl(link)).toBeNull();
  });
});

describe("parseYouTubeTime", () => {
  test("reads seconds and h/m/s forms", () => {
    expect(parseYouTubeTime("75")).toBe(75);
    expect(parseYouTubeTime("75s")).toBe(75);
    expect(parseYouTubeTime("2m")).toBe(120);
    expect(parseYouTubeTime("1h")).toBe(3600);
    expect(parseYouTubeTime("1H2M3S")).toBe(3723);
  });

  test("ignores empty, zero and malformed values", () => {
    for (const value of [null, undefined, "", " ", "0", "0s", "-5", "1.5", "m", "abc", "1m30"]) {
      expect(parseYouTubeTime(value)).toBeUndefined();
    }
  });
});

describe("embed and watch URLs", () => {
  test("embeds through youtube-nocookie.com with the start time", () => {
    expect(youTubeEmbedUrl({ id: ID })).toBe(`https://www.youtube-nocookie.com/embed/${ID}?rel=0&playsinline=1`);
    expect(youTubeEmbedUrl({ id: ID, start: 90 }, { autoplay: true })).toBe(
      `https://www.youtube-nocookie.com/embed/${ID}?rel=0&playsinline=1&autoplay=1&start=90`,
    );
  });

  test("links back to the watch page", () => {
    expect(youTubeWatchUrl({ id: ID })).toBe(`https://www.youtube.com/watch?v=${ID}`);
    expect(youTubeWatchUrl({ id: ID, start: 90 })).toBe(`https://www.youtube.com/watch?v=${ID}&t=90s`);
  });

  test("only well-formed ids pass", () => {
    expect(isYouTubeVideoId(ID)).toBe(true);
    expect(isYouTubeVideoId("abc")).toBe(false);
    expect(isYouTubeVideoId("abc def ghi")).toBe(false);
  });
});
