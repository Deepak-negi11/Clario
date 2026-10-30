// Tetris by the modern rules (the Tetris Guideline): a 10 x 20 well with two hidden rows above it,
// the seven pieces dealt from a shuffled bag of seven, Super Rotation System turns with wall kicks,
// hold, a queue of the next pieces, a ghost showing where the piece lands, lock delay that a move or
// turn resets (up to 15 times), and levels that speed the fall up every 10 lines.
// Scoring: 100 / 300 / 500 / 800 x level for 1 to 4 lines, T-spins 400 / 800 / 1200 / 1600 x level,
// a back-to-back Tetris or T-spin x1.5, 50 x combo x level, 1 a row for soft drops, 2 for hard drops.
// Versus: clears send garbage lines to the other player (2 for a Triple, 4 for a Tetris, more for
// T-spins, back-to-back and combos). Lines coming at you are cancelled by your own clears first;
// what's left rises from the bottom, each batch with one gap, when you next lock without clearing.
// No drawing here: tetris-screen.ts paints the state and tetris-3d.ts puts it on the cabinet.

export const COLS = 10;
export const ROWS = 22;
// Rows 0 and 1 are above the top of the well.
export const HIDDEN = 2;
export const NEXT_SHOWN = 3;

export const PIECES = ["I", "O", "T", "S", "Z", "J", "L"] as const;
export type PieceKind = (typeof PIECES)[number];
export type Cell = readonly [x: number, y: number];
export type Rotation = 0 | 1 | 2 | 3;

// Each piece in its spawn state, in its own box (x right, y down).
const SHAPES: Record<PieceKind, { size: number; cells: Cell[] }> = {
  I: { size: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
  O: { size: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  T: { size: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
  S: { size: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  Z: { size: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
  J: { size: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
  L: { size: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]] },
};

// The cells of a piece turned `rotation` quarter turns clockwise, in its box.
export function shapeCells(kind: PieceKind, rotation: Rotation): Cell[] {
  const { size, cells } = SHAPES[kind];
  if (kind === "O") return cells;
  return cells.map(([x, y]) => {
    let cx = x;
    let cy = y;
    for (let turn = 0; turn < rotation; turn++) [cx, cy] = [size - 1 - cy, cx];
    return [cx, cy] as const;
  });
}

// Super Rotation System kicks, tried in order until one fits. The usual tables have y pointing up;
// these are already flipped for y pointing down. Keyed by "from to".
const kicks = (list: [number, number][]) => list.map(([x, y]) => [x, -y] as const);
const KICKS_JLSTZ: Record<string, Cell[]> = {
  "01": kicks([[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]]),
  "10": kicks([[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]]),
  "12": kicks([[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]]),
  "21": kicks([[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]]),
  "23": kicks([[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]]),
  "32": kicks([[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]]),
  "30": kicks([[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]]),
  "03": kicks([[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]]),
};
const KICKS_I: Record<string, Cell[]> = {
  "01": kicks([[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]]),
  "10": kicks([[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]]),
  "12": kicks([[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]]),
  "21": kicks([[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]]),
  "23": kicks([[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]]),
  "32": kicks([[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]]),
  "30": kicks([[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]]),
  "03": kicks([[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]]),
};

export const LOCK_DELAY = 0.5;
export const MAX_LOCK_RESETS = 15;
export const SOFT_DROP_FACTOR = 20;
// How long cleared rows flash before they go.
export const CLEAR_TIME = 0.32;
export const LINES_PER_LEVEL = 10;

// Seconds for the piece to fall one row at a level (the Guideline curve; it stops getting faster at 15).
export function fallTime(level: number) {
  const capped = Math.min(Math.max(1, level), 15);
  return Math.pow(0.8 - (capped - 1) * 0.007, capped - 1);
}

const LINE_POINTS = [0, 100, 300, 500, 800];
const T_SPIN_POINTS = [400, 800, 1200, 1600];
const CLEAR_NAMES = ["", "Single", "Double", "Triple", "Tetris"];

// "G" is a garbage block sent by the other player.
export type BlockKind = PieceKind | "G";
export type Board = (BlockKind | null)[][];
export type Piece = { kind: PieceKind; rotation: Rotation; x: number; y: number };
export type TetrisPhase = "ready" | "playing" | "paused" | "over" | "won";

export type TetrisEvent =
  | { type: "move" }
  | { type: "rotate" }
  | { type: "land" }
  | { type: "lock" }
  | { type: "hardDrop"; rows: number }
  | { type: "hold" }
  | { type: "clear"; lines: number; tSpin: boolean; label: string; rows: number[] }
  | { type: "level"; level: number }
  // Garbage sent to the other player, after cancelling what was coming at you.
  | { type: "attack"; lines: number }
  // Garbage rising into your well.
  | { type: "garbage"; lines: number }
  | { type: "over" };

export type TetrisState = {
  phase: TetrisPhase;
  board: Board;
  piece: Piece | null;
  hold: PieceKind | null;
  // False once you've held this piece: you can't swap back until the next one.
  canHold: boolean;
  queue: PieceKind[];
  score: number;
  level: number;
  lines: number;
  combo: number;
  backToBack: boolean;
  // Rows that were just filled, flashing before they're taken out.
  clearing: { rows: number[]; time: number } | null;
  // The last clear's name for the screen ("Tetris", "T-Spin Double", "Back-to-back"), and how long ago.
  callout: { text: string; age: number } | null;
  // Seconds played, for the screen's clock.
  time: number;
  // Versus: garbage lines waiting to rise, and lines sent in all.
  incoming: number;
  sent: number;
  // Goes up with every piece that comes into play (for the computer player).
  pieces: number;
};

export function emptyBoard(): Board {
  return Array.from({ length: ROWS }, () => Array<BlockKind | null>(COLS).fill(null));
}

export function pieceCells(piece: Piece): Cell[] {
  return shapeCells(piece.kind, piece.rotation).map(([x, y]) => [piece.x + x, piece.y + y] as const);
}

export function fits(board: Board, piece: Piece) {
  return pieceCells(piece).every(([x, y]) => x >= 0 && x < COLS && y >= 0 && y < ROWS && !board[y]![x]);
}

// Where the piece would land if dropped straight down.
export function dropped(board: Board, piece: Piece): Piece {
  let landed = piece;
  while (fits(board, { ...landed, y: landed.y + 1 })) landed = { ...landed, y: landed.y + 1 };
  return landed;
}

// Pieces come out of a bag of all seven, shuffled; a new bag when it's empty.
export function createBag(random: () => number) {
  let bag: PieceKind[] = [];
  return () => {
    if (bag.length === 0) {
      bag = [...PIECES];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [bag[i], bag[j]] = [bag[j]!, bag[i]!];
      }
    }
    return bag.pop()!;
  };
}

export function spawnPiece(kind: PieceKind): Piece {
  return { kind, rotation: 0, x: kind === "O" ? 4 : 3, y: 0 };
}

// The turn and the kick that fits, or null when none does.
export function rotated(board: Board, piece: Piece, direction: 1 | -1): Piece | null {
  if (piece.kind === "O") return null;
  const to = ((piece.rotation + direction + 4) % 4) as Rotation;
  const table = piece.kind === "I" ? KICKS_I : KICKS_JLSTZ;
  for (const [dx, dy] of table[`${piece.rotation}${to}`]!) {
    const next = { ...piece, rotation: to, x: piece.x + dx, y: piece.y + dy };
    if (fits(board, next)) return next;
  }
  return null;
}

// A T that turned into place with three of the four corners around its middle filled (walls count).
export function isTSpin(board: Board, piece: Piece) {
  if (piece.kind !== "T") return false;
  const corners = [[0, 0], [2, 0], [0, 2], [2, 2]].filter(([dx, dy]) => {
    const x = piece.x + dx!;
    const y = piece.y + dy!;
    return x < 0 || x >= COLS || y >= ROWS || (y >= 0 && !!board[y]![x]);
  });
  return corners.length >= 3;
}

export function fullRows(board: Board) {
  return board.flatMap((row, y) => (row.every(Boolean) ? [y] : []));
}

export function withoutRows(board: Board, rows: number[]): Board {
  const kept = board.filter((_, y) => !rows.includes(y));
  return [...Array.from({ length: rows.length }, () => Array<BlockKind | null>(COLS).fill(null)), ...kept];
}

// The board pushed up by `lines` rows of garbage with a gap at `hole`. Null if blocks went over the top.
export function withGarbage(board: Board, lines: number, hole: number): Board | null {
  if (board.slice(0, lines).some((row) => row.some(Boolean))) return null;
  const rows = Array.from({ length: lines }, () => Array.from({ length: COLS }, (_, x) => (x === hole ? null : ("G" as const))));
  return [...board.slice(lines), ...rows];
}

// Lines a clear sends in versus (the Guideline's table).
const COMBO_ATTACK = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5];
export function attackLines(lines: number, tSpin: boolean, backToBack: boolean, combo: number) {
  if (lines === 0) return 0;
  const base = tSpin ? lines * 2 : [0, 0, 1, 2, 4][lines]!;
  return base + (backToBack ? 1 : 0) + COMBO_ATTACK[Math.min(Math.max(combo, 0), COMBO_ATTACK.length - 1)]!;
}
// At most this much garbage rises at once; the rest waits for the next piece.
export const GARBAGE_PER_LOCK = 8;

// Points for a clear, before back-to-back and combo.
export function clearPoints(lines: number, tSpin: boolean, level: number) {
  return (tSpin ? T_SPIN_POINTS[lines]! : LINE_POINTS[lines]!) * level;
}

export function clearName(lines: number, tSpin: boolean) {
  if (tSpin) return lines === 0 ? "T-Spin" : `T-Spin ${CLEAR_NAMES[lines]}`;
  return CLEAR_NAMES[lines]!;
}

// `random` deals the pieces (give two players the same seed for the same pieces); `holes` places
// the gaps in garbage.
export type TetrisOptions = { random?: () => number; holes?: () => number; startLevel?: number };

export function createTetris({ random = Math.random, holes = Math.random, startLevel = 1 }: TetrisOptions = {}) {
  let next = createBag(random);
  let events: TetrisEvent[] = [];
  let fall = 0;
  let lockTimer = 0;
  let lockResets = 0;
  let lowest = 0;
  // A T-spin only counts if the last thing the piece did was turn.
  let lastWasTurn = false;
  let softDropping = false;

  const state: TetrisState = fresh();

  function fresh(): TetrisState {
    return {
      phase: "ready", board: emptyBoard(), piece: null, hold: null, canHold: true, queue: [], score: 0,
      level: startLevel, lines: 0, combo: -1, backToBack: false, clearing: null, callout: null, time: 0, incoming: 0, sent: 0, pieces: 0,
    };
  }

  const emit = (event: TetrisEvent) => events.push(event);
  const onGround = (piece: Piece) => !fits(state.board, { ...piece, y: piece.y + 1 });

  function topUp() {
    while (state.queue.length < NEXT_SHOWN) state.queue.push(next());
  }

  // A new piece at the top, dropped a row straight away if there's room (as the Guideline does).
  function enter(kind: PieceKind) {
    let piece = spawnPiece(kind);
    if (!fits(state.board, piece)) return gameOver();
    if (fits(state.board, { ...piece, y: piece.y + 1 })) piece = { ...piece, y: piece.y + 1 };
    state.piece = piece;
    state.pieces++;
    fall = 0;
    lockTimer = 0;
    lockResets = 0;
    lowest = piece.y;
    lastWasTurn = false;
  }

  function spawnNext() {
    topUp();
    const kind = state.queue.shift()!;
    topUp();
    enter(kind);
  }

  function gameOver() {
    state.piece = null;
    state.phase = "over";
    emit({ type: "over" });
  }

  // After a move or turn: on the ground, it buys more time before locking (up to a limit).
  function moved(piece: Piece) {
    state.piece = piece;
    if (piece.y > lowest) {
      lowest = piece.y;
      lockResets = 0;
    }
    if (lockResets < MAX_LOCK_RESETS) {
      lockTimer = 0;
      if (onGround(piece)) lockResets++;
    }
  }

  function lock() {
    const piece = state.piece;
    if (!piece) return;
    const tSpin = lastWasTurn && isTSpin(state.board, piece);
    const cells = pieceCells(piece);
    for (const [x, y] of cells) state.board[y]![x] = piece.kind;
    state.piece = null;
    state.canHold = true;
    emit({ type: "lock" });
    // Locked entirely above the well: that's the end.
    if (cells.every(([, y]) => y < HIDDEN)) return gameOver();

    const rows = fullRows(state.board);
    const lines = rows.length;
    if (lines === 0 && !tSpin) {
      state.combo = -1;
      if (!riseGarbage()) return;
      return spawnNext();
    }
    let points = clearPoints(lines, tSpin, state.level);
    const difficult = lines === 4 || (tSpin && lines > 0);
    const backToBack = difficult && state.backToBack;
    if (backToBack) points = Math.floor(points * 1.5);
    if (lines > 0) {
      state.backToBack = difficult;
      state.combo++;
      if (state.combo > 0) points += 50 * state.combo * state.level;
      // Versus: cancel what's coming, send the rest.
      let attack = attackLines(lines, tSpin, backToBack, state.combo);
      const cancelled = Math.min(attack, state.incoming);
      state.incoming -= cancelled;
      attack -= cancelled;
      if (attack > 0) {
        state.sent += attack;
        emit({ type: "attack", lines: attack });
      }
    }
    state.score += points;
    const label = [backToBack ? "Back-to-back" : "", clearName(lines, tSpin), state.combo > 0 ? `${state.combo} combo` : ""].filter(Boolean).join(" ");
    state.callout = { text: label, age: 0 };
    emit({ type: "clear", lines, tSpin, label, rows });
    if (lines === 0) {
      if (!riseGarbage()) return;
      return spawnNext();
    }
    state.clearing = { rows, time: 0 };
  }

  // Pending garbage rises into the well; false if it pushed blocks over the top.
  function riseGarbage() {
    if (state.incoming <= 0) return true;
    const lines = Math.min(state.incoming, GARBAGE_PER_LOCK);
    state.incoming -= lines;
    const board = withGarbage(state.board, lines, Math.floor(holes() * COLS));
    emit({ type: "garbage", lines });
    if (!board) {
      gameOver();
      return false;
    }
    state.board = board;
    return true;
  }

  function finishClear() {
    const rows = state.clearing!.rows;
    state.clearing = null;
    state.board = withoutRows(state.board, rows);
    const before = state.level;
    state.lines += rows.length;
    state.level = Math.max(before, startLevel + Math.floor(state.lines / LINES_PER_LEVEL));
    if (state.level > before) emit({ type: "level", level: state.level });
    spawnNext();
  }

  const playable = () => state.phase === "playing" && !!state.piece && !state.clearing;

  return {
    state,

    // Sounds and effects since the last call.
    drain(): TetrisEvent[] {
      const out = events;
      events = [];
      return out;
    },

    start() {
      Object.assign(state, fresh());
      next = createBag(random);
      events = [];
      state.phase = "playing";
      spawnNext();
    },

    // Versus: garbage sent by the other player.
    receive(lines: number) {
      if (state.phase === "playing" || state.phase === "paused") state.incoming = Math.min(state.incoming + lines, 20);
    },

    // Versus: everyone else topped out.
    win() {
      if (state.phase !== "playing" && state.phase !== "paused") return;
      state.phase = "won";
      state.piece = null;
    },

    pause(paused: boolean) {
      if (paused && state.phase === "playing") state.phase = "paused";
      else if (!paused && state.phase === "paused") state.phase = "playing";
    },

    setSoftDrop(on: boolean) {
      softDropping = on;
    },

    shift(dx: -1 | 1) {
      if (!playable()) return false;
      const piece = { ...state.piece!, x: state.piece!.x + dx };
      if (!fits(state.board, piece)) return false;
      lastWasTurn = false;
      moved(piece);
      emit({ type: "move" });
      return true;
    },

    rotate(direction: 1 | -1) {
      if (!playable()) return false;
      const piece = rotated(state.board, state.piece!, direction);
      if (!piece) return false;
      lastWasTurn = true;
      moved(piece);
      emit({ type: "rotate" });
      return true;
    },

    hardDrop() {
      if (!playable()) return;
      const piece = state.piece!;
      const landed = dropped(state.board, piece);
      const rows = landed.y - piece.y;
      if (rows > 0) lastWasTurn = false;
      state.piece = landed;
      state.score += rows * 2;
      emit({ type: "hardDrop", rows });
      lock();
    },

    hold() {
      if (!playable() || !state.canHold) return;
      const kind = state.piece!.kind;
      const out = state.hold;
      state.hold = kind;
      state.canHold = false;
      emit({ type: "hold" });
      if (out) enter(out);
      else spawnNext();
    },

    step(dt: number) {
      if (state.callout) {
        state.callout.age += dt;
        if (state.callout.age > 2) state.callout = null;
      }
      if (state.phase !== "playing") return;
      state.time += dt;
      if (state.clearing) {
        state.clearing.time += dt;
        if (state.clearing.time >= CLEAR_TIME) finishClear();
        return;
      }
      const piece = state.piece;
      if (!piece) return;
      if (onGround(piece)) {
        lockTimer += dt;
        fall = 0;
        if (lockTimer >= LOCK_DELAY) lock();
        return;
      }
      const perRow = fallTime(state.level) / (softDropping ? SOFT_DROP_FACTOR : 1);
      fall += dt;
      while (fall >= perRow && state.piece && !onGround(state.piece)) {
        fall -= perRow;
        state.piece = { ...state.piece, y: state.piece.y + 1 };
        lastWasTurn = false;
        if (softDropping) state.score += 1;
        if (state.piece.y > lowest) {
          lowest = state.piece.y;
          lockResets = 0;
        }
        if (onGround(state.piece)) emit({ type: "land" });
      }
    },

    ghost(): Piece | null {
      return state.piece ? dropped(state.board, state.piece) : null;
    },
  };
}

export type Tetris = ReturnType<typeof createTetris>;

// Holding left or right: one step at once, then after a short wait it repeats quickly (DAS and ARR).
// The last direction pressed wins while both are held.
export function createAutoRepeat({ delay = 0.17, rate = 0.04 } = {}) {
  const held: (-1 | 1)[] = [];
  let timer = 0;
  let repeating = false;
  return {
    press(direction: -1 | 1) {
      if (held.includes(direction)) return 0;
      held.push(direction);
      timer = 0;
      repeating = false;
      return direction;
    },
    release(direction: -1 | 1) {
      const index = held.indexOf(direction);
      if (index >= 0) held.splice(index, 1);
      timer = 0;
      repeating = false;
    },
    clear() {
      held.length = 0;
    },
    // The direction held now: -1, 0 or 1.
    direction() {
      return held[held.length - 1] ?? 0;
    },
    // How many steps to take this frame, in the held direction (negative is left).
    step(dt: number) {
      const direction = held[held.length - 1];
      if (!direction) return 0;
      timer += dt;
      if (!repeating) {
        if (timer < delay) return 0;
        repeating = true;
        timer -= delay;
      }
      const steps = Math.floor(timer / rate);
      timer -= steps * rate;
      return steps * direction;
    },
  };
}
