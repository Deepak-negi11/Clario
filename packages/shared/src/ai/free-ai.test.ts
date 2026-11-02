import { describe, expect, test } from "bun:test";
import { FREE_AI_REPLIES, freeAiTries } from "./free-ai";

describe("freeAiTries", () => {
  test("counts down from the limit and never goes below zero", () => {
    expect(FREE_AI_REPLIES).toBe(3);
    expect(freeAiTries(0)).toEqual({ used: 0, limit: 3, left: 3 });
    expect(freeAiTries(2)).toEqual({ used: 2, limit: 3, left: 1 });
    expect(freeAiTries(3)).toEqual({ used: 3, limit: 3, left: 0 });
    expect(freeAiTries(7)).toEqual({ used: 7, limit: 3, left: 0 });
  });

  test("odd stored values read as safe counts", () => {
    expect(freeAiTries(-2)).toEqual({ used: 0, limit: 3, left: 3 });
    expect(freeAiTries(1.6)).toEqual({ used: 1, limit: 3, left: 2 });
  });
});
