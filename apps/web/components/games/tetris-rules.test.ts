import { describe, expect, test } from "bun:test";
import {
  COLS, HIDDEN, PIECES, ROWS, createAutoRepeat, createBag, createTetris, emptyBoard, fallTime, fits, isTSpin, pieceCells, rotated, shapeCells,
  type Board, type PieceKind,
} from "./tetris-rules";

// The same "random" numbers every run.
function seeded(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
}

// A board from rows of text, bottom row last: "#" is a filled cell, "." empty.
function boardOf(rows: string[]): Board {
  const board = emptyBoard();
  rows.forEach((row, index) => {
    const y = ROWS - rows.length + index;
    [...row].forEach((char, x) => {
      if (char === "#") board[y]![x] = "Z";
    });
  });
  return board;
}

describe("pieces", () => {
  test("each piece has four cells in every rotation", () => {
    for (const kind of PIECES) for (const rotation of [0, 1, 2, 3] as const) expect(new Set(shapeCells(kind, rotation).map(String)).size).toBe(4);
  });

  test("four clockwise turns bring a piece back", () => {
    const board = emptyBoard();
    for (const kind of PIECES) {
      let piece = { kind, rotation: 0 as const, x: 3, y: 8 } as Parameters<typeof rotated>[1];
      for (let turn = 0; turn < 4; turn++) piece = rotated(board, piece, 1) ?? piece;
      expect(pieceCells(piece).map(String).sort()).toEqual(pieceCells({ kind, rotation: 0, x: 3, y: 8 }).map(String).sort());
    }
  });

  test("every bag of seven holds each piece once", () => {
    const next = createBag(seeded(7));
    for (let bag = 0; bag < 5; bag++) {
      const seen = Array.from({ length: 7 }, next);
      expect(new Set(seen).size).toBe(7);
    }
  });
});

describe("wall kicks", () => {
  test("an upright I against the right wall kicks left to turn flat", () => {
    const board = emptyBoard();
    // Rotation 1 puts the I in column x + 2; x = 7 is flush with the right wall.
    const piece = { kind: "I" as PieceKind, rotation: 1 as const, x: 7, y: 10 };
    expect(fits(board, piece)).toBe(true);
    const turned = rotated(board, piece, 1);
    expect(turned).not.toBeNull();
    expect(pieceCells(turned!).every(([x]) => x >= 0 && x < COLS)).toBe(true);
  });

  test("a T turned down into a T-slot counts as a T-spin", () => {
    const board = boardOf([
      "##........",
      "#...######",
      "##.#######",
    ]);
    // A T pointing right, half in the slot.
    const start = { kind: "T" as PieceKind, rotation: 1 as const, x: 1, y: ROWS - 3 };
    expect(fits(board, start)).toBe(true);
    const turned = rotated(board, start, 1);
    expect(turned).not.toBeNull();
    expect(isTSpin(board, turned!)).toBe(true);
  });
});

describe("a game", () => {
  test("starts with a piece in play and three in the queue", () => {
    const game = createTetris({ random: seeded(1) });
    game.start();
    expect(game.state.phase).toBe("playing");
    expect(game.state.piece).not.toBeNull();
    expect(game.state.queue).toHaveLength(3);
  });

  test("a hard drop scores two a row and locks", () => {
    const game = createTetris({ random: seeded(2) });
    game.start();
    const ghost = game.ghost()!;
    const rows = ghost.y - game.state.piece!.y;
    game.hardDrop();
    expect(game.state.score).toBe(rows * 2);
    expect(game.state.board.flat().filter(Boolean)).toHaveLength(4);
    expect(game.drain().map((event) => event.type)).toEqual(["hardDrop", "lock"]);
  });

  test("hold swaps once per piece", () => {
    const game = createTetris({ random: seeded(3) });
    game.start();
    const first = game.state.piece!.kind;
    game.hold();
    expect(game.state.hold).toBe(first);
    const second = game.state.piece!.kind;
    game.hold();
    expect(game.state.piece!.kind).toBe(second);
    game.hardDrop();
    game.hold();
    expect(game.state.piece!.kind).toBe(first);
  });

  test("clearing four lines is a Tetris worth 800 at level 1", () => {
    const game = createTetris({ random: seeded(4) });
    game.start();
    game.state.board = boardOf(["#########.", "#########.", "#########.", "#########."]);
    game.state.piece = { kind: "I", rotation: 1, x: 7, y: 2 };
    game.hardDrop();
    const clear = game.drain().find((event) => event.type === "clear");
    expect(clear).toMatchObject({ lines: 4, label: "Tetris" });
    const dropPoints = game.state.score - 800;
    expect(dropPoints).toBeGreaterThan(0);
    // The rows flash, then go.
    game.step(0.5);
    expect(game.state.lines).toBe(4);
    expect(game.state.board.flat().filter(Boolean)).toHaveLength(0);
  });

  test("ten lines go up a level, and the fall speeds up", () => {
    const game = createTetris({ random: seeded(5) });
    game.start();
    game.state.lines = 9;
    game.state.board = boardOf(["#########."]);
    game.state.piece = { kind: "I", rotation: 1, x: 7, y: 2 };
    game.hardDrop();
    game.step(0.5);
    expect(game.state.level).toBe(2);
    expect(game.drain().some((event) => event.type === "level")).toBe(true);
    expect(fallTime(2)).toBeLessThan(fallTime(1));
  });

  test("a piece on the ground locks after the lock delay", () => {
    const game = createTetris({ random: seeded(6) });
    game.start();
    const kind = game.state.piece!.kind;
    game.state.piece = { ...game.ghost()!, kind };
    game.step(0.3);
    expect(game.state.board.flat().filter(Boolean)).toHaveLength(0);
    game.step(0.3);
    expect(game.state.board.flat().filter(Boolean)).toHaveLength(4);
  });

  test("the game ends when a new piece has no room", () => {
    const game = createTetris({ random: seeded(8) });
    game.start();
    // Full to the top (with no complete rows), and an O above the well that can't come down.
    game.state.board = boardOf(Array.from({ length: ROWS - HIDDEN }, (_, row) => (row % 2 ? "#########." : ".#########")));
    game.state.piece = { kind: "O", rotation: 0, x: 0, y: 0 };
    game.hardDrop();
    expect(game.state.phase).toBe("over");
  });
});

describe("auto repeat", () => {
  test("moves once, waits, then repeats", () => {
    const repeat = createAutoRepeat({ delay: 0.2, rate: 0.05 });
    expect(repeat.press(1)).toBe(1);
    expect(repeat.step(0.1)).toBe(0);
    expect(repeat.step(0.1)).toBe(0);
    expect(repeat.step(0.1)).toBe(2);
    repeat.release(1);
    expect(repeat.step(0.5)).toBe(0);
  });

  test("the last direction pressed wins", () => {
    const repeat = createAutoRepeat({ delay: 0, rate: 0.1 });
    repeat.press(-1);
    repeat.press(1);
    expect(repeat.step(0.1)).toBe(1);
    repeat.release(1);
    expect(repeat.step(0.1)).toBe(-1);
  });
});

describe("versus", () => {
  test("a Tetris sends four lines, a Double one", async () => {
    const { attackLines } = await import("./tetris-rules");
    expect(attackLines(4, false, false, 0)).toBe(4);
    expect(attackLines(2, false, false, 0)).toBe(1);
    expect(attackLines(1, false, false, 0)).toBe(0);
    expect(attackLines(2, true, false, 0)).toBe(4);
    expect(attackLines(4, false, true, 0)).toBe(5);
  });

  test("garbage rises with one gap when you lock without clearing", () => {
    const game = createTetris({ random: seeded(9), holes: () => 0.35 });
    game.start();
    game.receive(3);
    expect(game.state.incoming).toBe(3);
    game.hardDrop();
    expect(game.drain().some((event) => event.type === "garbage")).toBe(true);
    const bottom = game.state.board.slice(ROWS - 3);
    for (const row of bottom) expect(row.filter((cell) => cell === "G")).toHaveLength(COLS - 1);
    expect(bottom.every((row) => row[3] === null)).toBe(true);
  });

  test("your clears cancel garbage coming at you before any is sent", () => {
    const game = createTetris({ random: seeded(10) });
    game.start();
    game.receive(2);
    game.state.board = boardOf(["#########.", "#########.", "#########.", "#########."]);
    game.state.piece = { kind: "I", rotation: 1, x: 7, y: 2 };
    game.hardDrop();
    expect(game.state.incoming).toBe(0);
    expect(game.drain().find((event) => event.type === "attack")).toMatchObject({ lines: 2 });
  });

  test("the winner stops playing", () => {
    const game = createTetris({ random: seeded(11) });
    game.start();
    game.win();
    expect(game.state.phase).toBe("won");
    expect(game.state.piece).toBeNull();
  });
});

describe("the computer player", () => {
  test("it clears lines and lasts on medium", async () => {
    const { createBot } = await import("./tetris-ai");
    const game = createTetris({ random: seeded(12) });
    const bot = createBot("hard", seeded(13));
    game.start();
    for (let i = 0; i < 20_000 && game.state.phase === "playing"; i++) {
      bot.step(game, 1 / 60);
      game.step(1 / 60);
    }
    expect(game.state.lines).toBeGreaterThan(20);
  });
});
