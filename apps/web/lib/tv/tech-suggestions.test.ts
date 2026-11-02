import { describe, expect, test } from "bun:test";
import type { YouTubeSearchResult } from "@repo/shared";
import { createTechSuggestions, PICKED_PAGES, TECH_TOPICS } from "./tech-suggestions";

const video = (id: string): YouTubeSearchResult => ({ id, title: `Video ${id}`, channel: "Channel", thumbnail: "" });
const HOUR = 60 * 60_000;

describe("TV tech suggestions", () => {
  test("each topic is searched once a day; pages go round the topics", async () => {
    const asked: string[] = [];
    const page = createTechSuggestions(async (query) => {
      asked.push(query);
      return [video(`v${asked.length}abcdefg`.slice(0, 11))];
    });
    const first = await page(0, 0);
    expect(first).toMatchObject({ topic: TECH_TOPICS[0]!.label, source: "youtube" });
    await page(0, 12 * HOUR);
    expect(asked).toEqual([TECH_TOPICS[0]!.query]);
    expect((await page(1, 0)).topic).toBe(TECH_TOPICS[1]!.label);
    expect((await page(TECH_TOPICS.length, 0)).topic).toBe(TECH_TOPICS[0]!.label);
    expect((await page(-1, 0)).topic).toBe(TECH_TOPICS[TECH_TOPICS.length - 1]!.label);
    // A day later it's asked again.
    await page(0, 25 * HOUR);
    expect(asked.filter((query) => query === TECH_TOPICS[0]!.query)).toHaveLength(2);
  });

  test("TVs turned on together ask YouTube once", async () => {
    let calls = 0;
    const page = createTechSuggestions(async () => {
      calls++;
      await Bun.sleep(5);
      return [video("aircAruvnKk")];
    });
    await Promise.all([page(2, 0), page(2, 0), page(2, 0)]);
    expect(calls).toBe(1);
  });

  test("without a key, the hand-picked talks show", async () => {
    const page = createTechSuggestions(null);
    expect(await page(0)).toEqual(PICKED_PAGES[0]!);
    expect((await page(1)).source).toBe("picked");
  });

  test("when YouTube says no, the hand-picked talks show, and it waits before asking again", async () => {
    let calls = 0;
    const page = createTechSuggestions(async () => {
      calls++;
      return null;
    });
    expect((await page(0, 0)).source).toBe("picked");
    expect((await page(1, 60_000)).source).toBe("picked");
    expect(calls).toBe(1);
    await page(1, 11 * 60_000);
    expect(calls).toBe(2);
  });

  test("the hand-picked talks are real YouTube ids with thumbnails", () => {
    for (const { results } of PICKED_PAGES) {
      for (const result of results) {
        expect(result.id).toMatch(/^[A-Za-z0-9_-]{11}$/);
        expect(result.thumbnail).toBe(`https://i.ytimg.com/vi/${result.id}/mqdefault.jpg`);
      }
    }
  });
});
