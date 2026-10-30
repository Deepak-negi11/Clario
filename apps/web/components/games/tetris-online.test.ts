import { describe, expect, test } from "bun:test";
import { seeded } from "./arcade-kit";
import { applyTetrisSnapshot, readTetrisWire, snapshotTetris } from "./tetris-online";
import { createTetris, type TetrisEvent } from "./tetris-rules";

const play = (game: ReturnType<typeof createTetris>, moves: (() => void)[]) => {
  for (const move of moves) {
    move();
    for (let i = 0; i < 40; i++) game.step(1 / 60);
  }
};

describe("online tetris", () => {
  test("a snapshot copied onto the rival's game shows the same screen", () => {
    const mine = createTetris({ random: seeded(7) });
    const rival = createTetris({ random: seeded(7) });
    mine.start();
    rival.start();
    play(mine, [() => mine.shift(-1), () => mine.hardDrop(), () => mine.rotate(1), () => mine.hardDrop(), () => mine.hold()]);
    const snapshot = JSON.parse(JSON.stringify(snapshotTetris(mine.state)));
    expect(applyTetrisSnapshot(rival.state, snapshot)).toBe(true);
    for (const key of ["board", "piece", "hold", "queue", "score", "level", "lines", "phase", "canHold"] as const) {
      expect(rival.state[key]).toEqual(mine.state[key]);
    }
    expect(rival.ghost()).toEqual(mine.ghost());
    expect(JSON.stringify(snapshot).length).toBeLessThan(600);
  });

  test("the same seed deals both players the same pieces", () => {
    const a = createTetris({ random: seeded(1234) });
    const b = createTetris({ random: seeded(1234) });
    a.start();
    b.start();
    expect(a.state.queue).toEqual(b.state.queue);
    expect(a.state.piece?.kind).toBe(b.state.piece?.kind);
  });

  test("garbage from the other player rises into your well", () => {
    const game = createTetris({ random: seeded(3) });
    game.start();
    const wire = readTetrisWire(JSON.parse(JSON.stringify({ k: "t-atk", n: 2 })));
    expect(wire).toEqual({ k: "t-atk", n: 2 });
    game.receive(wire!.k === "t-atk" ? wire!.n : 0);
    expect(game.state.incoming).toBe(2);
    game.hardDrop();
    const events: TetrisEvent[] = game.drain();
    expect(events.some((event) => event.type === "garbage")).toBe(true);
    expect(game.state.board.slice(-2).every((row) => row.filter((cell) => cell === "G").length === 9)).toBe(true);
  });

  test("bad messages and snapshots change nothing", () => {
    const game = createTetris({ random: seeded(5) });
    game.start();
    const before = JSON.stringify(game.state);
    for (const junk of [null, 3, "x", {}, { b: "short" }, { b: "Q".repeat(220) }, { b: ".".repeat(219) + "<" }]) {
      expect(applyTetrisSnapshot(game.state, junk)).toBe(false);
    }
    expect(JSON.stringify(game.state)).toBe(before);
    for (const junk of [null, {}, { k: "t-go" }, { k: "t-go", seed: -1 }, { k: "t-go", seed: 2.5 }, { k: "nope" }]) {
      expect(readTetrisWire(junk)).toBeNull();
    }
    expect(readTetrisWire({ k: "t-atk", n: 500 })).toEqual({ k: "t-atk", n: 10 });
  });

  test("a snapshot with odd numbers is clamped, not trusted", () => {
    const game = createTetris({ random: seeded(9) });
    game.start();
    const snapshot = { ...snapshotTetris(game.state), sc: 1e99, lv: -4, p: ["T", 9, 999, -50], q: "TTTTTTTTTTZZ" };
    expect(applyTetrisSnapshot(game.state, snapshot)).toBe(true);
    expect(game.state.score).toBe(99_999_999);
    expect(game.state.level).toBe(1);
    expect(game.state.piece).toEqual({ kind: "T", rotation: 3, x: 12, y: -3 });
    expect(game.state.queue).toHaveLength(6);
  });
});
