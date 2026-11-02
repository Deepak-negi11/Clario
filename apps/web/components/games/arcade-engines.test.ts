import { describe, expect, test } from "bun:test";
import { emptyInput, type GameOptions } from "./arcade-kit";
import { createBreakout } from "./breakout";
import { createSnake, SNAKE_LAYOUT } from "./snake";
import { createSumo } from "./sumo";

const options = (count = 1): GameOptions => ({ reducedMotion: true, sound: () => {},
  seats: Array.from({ length: count }, (_, i) => ({ name: i ? `Player ${i + 1}` : "You", bot: false })) });

describe("arcade engines", () => {
  for (const [name, create, count] of [["Breakout", createBreakout, 1], ["Snake", createSnake, 1], ["Chair Sumo", createSumo, 4]] as const) {
    test(`${name} starts, progresses and transmits a readable game to a guest`, () => {
      const host = create(options(count)), guest = create(options(count));
      const inputs = Array.from({ length: count }, emptyInput);
      expect(host.phase()).toBe("ready");
      inputs[0]!.presses.push("start"); host.update(inputs, 1 / 60);
      inputs[0]!.presses = [];
      for (let frame = 0; frame < 240; frame++) host.update(inputs, 1 / 60);
      expect(host.phase()).not.toBe("ready");
      guest.restore(JSON.parse(JSON.stringify(host.snapshot())));
      expect(guest.phase()).toBe(host.phase());
      expect(guest.score()).toBe(host.score());
      expect(guest.hud()).toEqual(host.hud());
      expect(JSON.stringify(guest.view?.())).not.toMatch(/NaN|Infinity/);
    });
    test(`${name} safely reads malformed network snapshots`, () => {
      const game = create(options(count));
      for (const value of [null, [], "bad", { p: "playing", b: [[NaN, Infinity, 9999]], c: [null], s: [null], w: [Infinity] }]) {
        expect(() => { game.restore(value); game.hud(); game.hint(); game.headline(); game.result(); game.view?.(); }).not.toThrow();
      }
    });
  }
  test("Snake finishes a full solo floor without endlessly trying to place coffee", () => {
    const game = createSnake(options());
    const body = Array.from({ length: SNAKE_LAYOUT.cols * SNAKE_LAYOUT.rows }, (_, i) => i);
    game.restore({ p: "playing", i: [], s: [{ b: body, h: "right", c: body.length, d: 0 }] });
    game.update([emptyInput()], 0);
    expect(game.phase()).toBe("won");
    expect(game.headline()).toBe("Office cleared!");
  });
  test("Breakout clamps a remote held ball to a seat that exists", () => {
    const game = createBreakout(options(2));
    game.restore({ p: "playing", b: [[100, 100, 3]] });
    expect(() => game.hint()).not.toThrow();
    expect(game.hint()).toContain("Player 2");
  });
});
