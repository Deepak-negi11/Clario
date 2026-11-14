import { describe, expect, test } from "bun:test";
import { FREE_AI_REPLIES, freeAiTries } from "./free-ai";

describe("freeAiTries", () => {
  test("each user gets 20 free replies", () => {
    expect(FREE_AI_REPLIES).toBe(20);
  });

  test("counts down from the limit and never goes below zero", () => {
    const limit = FREE_AI_REPLIES;
    expect(freeAiTries(0)).toEqual({ used: 0, limit, left: limit });
    expect(freeAiTries(limit - 1)).toEqual({ used: limit - 1, limit, left: 1 });
    expect(freeAiTries(limit)).toEqual({ used: limit, limit, left: 0 });
    expect(freeAiTries(limit + 4)).toEqual({ used: limit + 4, limit, left: 0 });
  });

  test("odd stored values read as safe counts", () => {
    expect(freeAiTries(-2)).toEqual({ used: 0, limit: FREE_AI_REPLIES, left: FREE_AI_REPLIES });
    expect(freeAiTries(1.6)).toEqual({ used: 1, limit: FREE_AI_REPLIES, left: FREE_AI_REPLIES - 1 });
  });
});
