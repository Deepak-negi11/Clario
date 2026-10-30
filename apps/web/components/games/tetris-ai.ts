// The computer's Tetris player, for versus. For each new piece it tries every turn and column,
// drops it, and scores the board that would leave (Pierre Dellacherie's features with the El-Tetris
// weights: lower landings, cleared rows, few holes, wells and bumpy edges). Then it plays the move
// the way a person would, a turn or a step at a time, at a pace set by its level; on easy it also
// picks a worse spot now and then.

import type { Level } from "./arcade-kit";
import { COLS, ROWS, dropped, fits, fullRows, pieceCells, spawnPiece, withoutRows, type Board, type Piece, type Rotation, type Tetris } from "./tetris-rules";

const WEIGHTS = { landing: -4.500158825082766, eliminated: 3.4181268101392694, rowTransitions: -3.2178882868487753, colTransitions: -9.348695305445199, holes: -7.899265427351652, wells: -3.3855972247263626 };

// Seconds between moves, and how often it picks a worse spot.
const PACE: Record<Level, { step: number; think: number; slip: number }> = {
  easy: { step: 0.22, think: 0.5, slip: 0.3 },
  medium: { step: 0.09, think: 0.25, slip: 0.06 },
  hard: { step: 0.035, think: 0.08, slip: 0 },
};

export type Placement = { rotation: Rotation; x: number; score: number };

function evaluate(board: Board, piece: Piece) {
  const cells = pieceCells(piece);
  const after = board.map((row) => [...row]);
  for (const [x, y] of cells) after[y]![x] = piece.kind;
  const rows = fullRows(after);
  const eliminatedCells = cells.filter(([, y]) => rows.includes(y)).length;
  const landing = ROWS - (Math.max(...cells.map(([, y]) => y)) + Math.min(...cells.map(([, y]) => y))) / 2;
  const cleared = rows.length ? withoutRows(after, rows) : after;
  const filled = (x: number, y: number) => x < 0 || x >= COLS || y >= ROWS || (y >= 0 && !!cleared[y]![x]);

  let rowTransitions = 0;
  let colTransitions = 0;
  let holes = 0;
  let wells = 0;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x <= COLS; x++) if (filled(x - 1, y) !== filled(x, y)) rowTransitions++;
  for (let x = 0; x < COLS; x++) {
    let roof = false;
    for (let y = 0; y <= ROWS; y++) {
      if (y > 0 && filled(x, y - 1) !== filled(x, y)) colTransitions++;
      if (y < ROWS && filled(x, y)) roof = true;
      else if (y < ROWS && roof) holes++;
    }
    let depth = 0;
    for (let y = 0; y < ROWS; y++) {
      if (!filled(x, y) && filled(x - 1, y) && filled(x + 1, y)) wells += ++depth;
      else depth = 0;
    }
  }
  return (
    WEIGHTS.landing * landing + WEIGHTS.eliminated * rows.length * eliminatedCells + WEIGHTS.rowTransitions * rowTransitions +
    WEIGHTS.colTransitions * colTransitions + WEIGHTS.holes * holes + WEIGHTS.wells * wells
  );
}

// Every place the piece can go, best first. Only spots reachable by turning at the top and sliding over.
export function placements(board: Board, kind: Piece["kind"]): Placement[] {
  const out: Placement[] = [];
  const turns: Rotation[] = kind === "O" ? [0] : [0, 1, 2, 3];
  const start = spawnPiece(kind);
  for (const rotation of turns) {
    const turned = { ...start, rotation };
    if (!fits(board, turned)) continue;
    for (const direction of [-1, 1]) {
      for (let x = start.x + (direction === 1 ? 1 : 0); x >= -3 && x < COLS; x += direction) {
        const slid = { ...turned, x };
        if (!fits(board, slid)) break;
        out.push({ rotation, x, score: evaluate(board, dropped(board, slid)) });
      }
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

export function createBot(level: Level, random: () => number = Math.random) {
  const pace = PACE[level];
  let target: Placement | null = null;
  let thoughtAbout = -1;
  let wait = 0;

  return {
    // Plays `game` for `dt` seconds.
    step(game: Tetris, dt: number) {
      const { state } = game;
      if (state.phase !== "playing" || !state.piece || state.clearing) return;
      // A new piece: think about where it goes.
      if (state.pieces !== thoughtAbout) {
        thoughtAbout = state.pieces;
        const options = placements(state.board, state.piece.kind);
        const slip = options.length > 1 && random() < pace.slip;
        target = (slip ? options[1 + Math.floor(random() * Math.min(3, options.length - 1))] : options[0]) ?? null;
        wait = pace.think * (0.7 + random() * 0.6);
      }
      wait -= dt;
      if (wait > 0 || !target) return;
      wait = pace.step * (0.7 + random() * 0.6);
      const piece = state.piece;
      if (piece.rotation !== target.rotation) {
        game.rotate(((target.rotation - piece.rotation + 4) % 4) === 3 ? -1 : 1);
      } else if (piece.x !== target.x) {
        if (!game.shift(piece.x < target.x ? 1 : -1)) game.hardDrop();
      } else game.hardDrop();
    },
  };
}
