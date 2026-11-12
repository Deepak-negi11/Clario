import { describe, expect, test } from "bun:test";
import { reconnectDelay } from "./reconnect";

describe("reconnectDelay", () => {
  test("doubles each try up to 8 s, spread from half to one and a half times", () => {
    expect([0, 1, 2, 3, 4, 9].map((attempt) => reconnectDelay(attempt, () => 0.5))).toEqual([1000, 2000, 4000, 8000, 8000, 8000]);
    expect(reconnectDelay(0, () => 0)).toBe(500);
    expect(reconnectDelay(0, () => 0.999)).toBe(1499);
    expect(reconnectDelay(5, () => 0.999)).toBe(11992);
  });

  test("clients dropped together come back spread over a second, not all at once", () => {
    const delays = Array.from({ length: 200 }, () => reconnectDelay(0));
    expect(Math.min(...delays)).toBeGreaterThanOrEqual(500);
    expect(Math.max(...delays)).toBeLessThanOrEqual(1500);
    expect(Math.max(...delays) - Math.min(...delays)).toBeGreaterThan(700);
  });
});
