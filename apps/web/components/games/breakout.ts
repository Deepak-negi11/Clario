// Breakout on the office cork board: knock the sticky notes off with a crumpled paper ball bounced
// off your ruler. Four boards that get harder (stacked notes take two hits, index cards three),
// then round again, faster. Hit notes in a row without touching a ruler for a bigger multiplier.
// Some notes drop desk supplies: a stapler (longer ruler), paper balls (two more balls), coffee (a
// slower ball), a paperclip (the ball sticks to your ruler) and, rarely, a spare ball.
// Up to four players share the board and the balls, each with their own ruler.

import {
  PAL, SCREEN_H as H, SCREEN_W as W, clamp, createParticles, createPointerMode, createPopups, createShake, createSoundLog,
  pressed, px, read, seeded, startPressed,
  type ArcadeInput, type GameInstance, type GameOptions, type GamePhase, type HudItem,
} from "./arcade-kit";

const FRAME = 5;
const COLS = 10;
const ROWS = 5;
const NOTE_W = 18;
const NOTE_H = 10;
const GAP_X = 4;
const GAP_Y = 3;
const LEFT = (W - (COLS * NOTE_W + (COLS - 1) * GAP_X)) / 2;
const TOP_ROW = 13;
const RULER_H = 4;
const RULER_Y = H - 14;
const BALL = 3;
const BASE_SPEED = 112;
const MAX_SPEED = 205;
const RULER_SPEED = 215;
const POINTER_SPEED = 520;
const LIVES = 3;
const MAX_BALLS = 6;

const BOARD = {
  cork: "#c19466",
  corkFlecks: ["#a97c4f", "#d5ad7f", "#b3875a"],
  frame: "#7a5331",
  frameHi: "#9a6c42",
  frameDark: "#4f341d",
  noteShadow: "rgba(74, 46, 20, 0.35)",
  ink: "rgba(46, 58, 92, 0.55)",
};

// Sticky notes in the colours they come in: the paper, its curled lower edge, points per hit.
const NOTE_STYLES: Record<string, { fill: string; curl: string; points: number }> = {
  p: { fill: "#f4a6be", curl: "#dc8ca5", points: 50 },
  o: { fill: "#f7b36b", curl: "#de9a52", points: 40 },
  y: { fill: "#f7e37a", curl: "#ddc85e", points: 30 },
  g: { fill: "#b9dd8e", curl: "#9fc373", points: 20 },
  b: { fill: "#93cdeb", curl: "#78b2d0", points: 10 },
};
const CARD = { fill: "#fbfaf6", line: "#a9c4e4", top: "#d9534f", points: 60 };

// Lowercase: a note (one hit). Uppercase: two notes stacked (two hits). C: an index card (three).
const LEVELS = [
  ["pppppppppp", "oooooooooo", "yyyyyyyyyy", "gggggggggg", "bbbbbbbbbb"],
  ["P.P.P.P.P.", ".o.o.o.o.o", "YyYyYyYyYy", ".g.g.g.g.g", "b.b.b.b.b."],
  ["....CC....", "...yYYy...", "..oOOOOo..", ".pPPPPPPp.", "gggggggggg"],
  ["CCCCCCCCCC", "C.pppppp.C", "C.oOOOOo.C", "C.yyyyyy.C", "..gggggg.."],
];

// Each seat's ruler, in its colour: red plastic, steel, blue plastic, green plastic (face, tick
// marks, lower edge). Playing alone you get a wooden one.
const RULERS = [
  { face: "#d9534f", tick: "#7a1f1c", edge: "#a33b37", clear: true }, // red plastic
  { face: "#bcc3cb", tick: "#3a3f45", edge: "#8d949c", clear: false }, // steel
  { face: "#5b9bd5", tick: "#1d3f66", edge: "#3f78ad", clear: true }, // blue plastic
  { face: "#6fbf8a", tick: "#1e5a35", edge: "#4c9b66", clear: true }, // green plastic
] as const;
const WOOD_RULER = { face: "#e2c08a", tick: "#8c6b40", edge: "#b8925c", clear: false };

export type DropKind = "wide" | "multi" | "slow" | "catch" | "life";
const DROP_KINDS: DropKind[] = ["wide", "multi", "slow", "catch", "wide", "multi", "slow", "catch", "life"];
const DROP_LABEL: Record<DropKind, string> = {
  wide: "Stapler: longer ruler",
  multi: "Paper balls: two more balls",
  slow: "Coffee break: slower ball",
  catch: "Paperclip: catch the ball",
  life: "Spare paper ball",
};

const rand = seeded(23);
const CORK = Array.from({ length: 520 }, () => ({ x: Math.floor(rand() * W), y: Math.floor(rand() * H), c: Math.floor(rand() * 3) }));
const SCRIBBLES = Array.from({ length: COLS * ROWS }, () => [4 + Math.floor(rand() * 9), 2 + Math.floor(rand() * 8)]);

type Note = { x: number; y: number; kind: string; hits: number };
type Ball = { x: number; y: number; vx: number; vy: number; held: number | null; offset: number; heldFor: number };
type Drop = { kind: DropKind; x: number; y: number; vy: number };
type Fall = { x: number; y: number; vy: number; life: number; fill: string; w: number };

function noteHits(kind: string) {
  return kind === "C" ? 3 : kind === kind.toUpperCase() ? 2 : 1;
}

// What the 3D board (breakout-3d.ts) draws, read without changing anything. Screen pixels, like
// the rest of this file: notes and balls by their top-left corner, rulers by their left end.
export type BreakoutView = {
  kind: "breakout";
  phase: GamePhase;
  // One ruler: playing alone you get the wooden one.
  solo: boolean;
  notes: readonly { x: number; y: number; kind: string; hits: number }[];
  rulers: readonly { x: number; width: number; catching: boolean }[];
  balls: readonly { x: number; y: number; held: number | null }[];
  drops: readonly { kind: DropKind; x: number; y: number }[];
  lives: number;
  level: number;
};

// The board's measurements and colours, for the 3D board to match the flat one.
export const BREAKOUT_LAYOUT = {
  frame: FRAME,
  noteW: NOTE_W,
  noteH: NOTE_H,
  rulerY: RULER_Y,
  rulerH: RULER_H,
  ball: BALL,
  board: BOARD,
  noteStyles: NOTE_STYLES,
  card: CARD,
  rulers: RULERS,
  woodRuler: WOOD_RULER,
} as const;

export function createBreakout({ reducedMotion, sound, seats }: GameOptions): GameInstance {
  const count = Math.max(1, seats.length);
  const baseWidth = [34, 30, 26, 24][count - 1]!;
  let phase: GamePhase = "ready";
  let score = 0;
  let lives = LIVES;
  let level = 0;
  let chain = 0;
  let slowFor = 0;
  let message: { text: string; time: number } | null = null;
  const rulerX = seats.map((_, index) => ((index + 0.5) * W) / count - baseWidth / 2);
  const wideFor = seats.map(() => 0);
  const catchFor = seats.map(() => 0);
  let balls: Ball[] = [];
  let drops: Drop[] = [];
  let falls: Fall[] = [];
  let holder = 0;
  let notes: Note[] = [];
  const sounds = createSoundLog(sound);
  const sparks = createParticles(!reducedMotion);
  const shake = createShake(!reducedMotion);
  const popups = createPopups(reducedMotion);
  const pointerModes = seats.map(() => createPointerMode());

  const say = (text: string, time = 1.4) => {
    message = { text, time };
  };
  const width = (seat: number) => (wideFor[seat]! > 0 ? Math.round(baseWidth * 1.5) : baseWidth);
  const multiplier = () => Math.min(5, 1 + Math.floor(chain / 4));
  const speed = () => Math.min(MAX_SPEED, (BASE_SPEED + level * 9) * (slowFor > 0 ? 0.7 : 1));

  function buildLevel() {
    const layout = LEVELS[level % LEVELS.length]!;
    notes = [];
    layout.forEach((row, r) => {
      [...row].forEach((kind, c) => {
        if (kind === ".") return;
        notes.push({ x: LEFT + c * (NOTE_W + GAP_X), y: TOP_ROW + r * (NOTE_H + GAP_Y), kind, hits: noteHits(kind) });
      });
    });
  }

  function newBallOnRuler() {
    holder = holder % count;
    balls = [{ x: 0, y: 0, vx: 0, vy: 0, held: holder, offset: 0, heldFor: 0 }];
    drops = [];
  }

  function setSpeed(ball: Ball, value: number) {
    const current = Math.hypot(ball.vx, ball.vy) || 1;
    ball.vx = (ball.vx / current) * value;
    ball.vy = (ball.vy / current) * value;
  }

  function release(ball: Ball) {
    const seat = ball.held ?? 0;
    const offset = ball.offset / (width(seat) / 2);
    const angle = clamp(offset, -0.8, 0.8) * (Math.PI / 3) || (Math.random() * 2 - 1) * 0.35;
    ball.held = null;
    ball.vx = Math.sin(angle) * speed();
    ball.vy = -Math.cos(angle) * speed();
    sounds.play("start");
  }

  function hitNote(ball: Ball, prevX: number, prevY: number) {
    const note = notes.find((n) => n.hits > 0 && ball.x + BALL > n.x && ball.x < n.x + NOTE_W && ball.y + BALL > n.y && ball.y < n.y + NOTE_H);
    if (!note) return;
    note.hits--;
    chain++;
    const style = note.kind === "C" ? CARD : NOTE_STYLES[note.kind.toLowerCase()]!;
    const points = (note.kind === note.kind.toLowerCase() || note.kind === "C" ? style.points : Math.round(style.points * 1.5)) * multiplier();
    score += points;
    popups.add(`+${points}`, note.x + NOTE_W / 2, note.y, "#fffdf6");
    if (chain % 4 === 0 && multiplier() > 1) popups.add(`x${multiplier()}`, note.x + NOTE_W / 2, note.y - 8, "#ffe08a");
    // Came in from above or below if it was already level with the note across; otherwise from the side.
    if (prevX + BALL > note.x && prevX < note.x + NOTE_W) {
      ball.vy = -ball.vy;
      ball.y = prevY;
    } else {
      ball.vx = -ball.vx;
      ball.x = prevX;
    }
    if (note.hits > 0) {
      sounds.play("wall");
      sparks.burst(note.x + NOTE_W / 2, note.y + NOTE_H, style.fill, 3, 20);
      return;
    }
    sounds.play("brick");
    if (!reducedMotion) falls.push({ x: note.x, y: note.y, vy: 10, life: 0.9, fill: style.fill, w: NOTE_W });
    if (drops.length < 2 && Math.random() < 0.14) {
      drops.push({ kind: DROP_KINDS[Math.floor(Math.random() * DROP_KINDS.length)]!, x: note.x + NOTE_W / 2 - 4, y: note.y + 2, vy: 38 });
    }
    if (notes.every((n) => n.hits <= 0)) {
      level++;
      sounds.play("win");
      say(`Board ${level + 1}!`, 1.8);
      buildLevel();
      newBallOnRuler();
    }
  }

  function catchDrop(drop: Drop, seat: number) {
    sounds.play("power");
    say(DROP_LABEL[drop.kind]);
    if (drop.kind === "wide") wideFor[seat] = 12;
    if (drop.kind === "catch") catchFor[seat] = 10;
    if (drop.kind === "slow") {
      slowFor = 8;
      for (const ball of balls) if (ball.held === null) setSpeed(ball, speed());
    }
    if (drop.kind === "life") lives = Math.min(5, lives + 1);
    if (drop.kind === "multi") {
      const source = balls.find((ball) => ball.held === null) ?? balls[0];
      if (!source) return;
      for (const turn of [-0.5, 0.5]) {
        if (balls.length >= MAX_BALLS) break;
        const angle = Math.atan2(source.vx, -source.vy || -1) + turn;
        balls.push({ x: source.x, y: source.y, vx: Math.sin(angle) * speed(), vy: -Math.abs(Math.cos(angle) * speed()), held: null, offset: 0, heldFor: 0 });
      }
    }
  }

  function stepBall(ball: Ball, dt: number) {
    const steps = Math.max(1, Math.ceil((Math.max(Math.abs(ball.vx), Math.abs(ball.vy)) * dt) / 1.5));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const prevX = ball.x;
      const prevY = ball.y;
      ball.x += ball.vx * h;
      ball.y += ball.vy * h;
      if (ball.x < FRAME) {
        ball.x = FRAME;
        ball.vx = Math.abs(ball.vx);
        sounds.play("wall");
      } else if (ball.x + BALL > W - FRAME) {
        ball.x = W - FRAME - BALL;
        ball.vx = -Math.abs(ball.vx);
        sounds.play("wall");
      }
      if (ball.y < FRAME) {
        ball.y = FRAME;
        ball.vy = Math.abs(ball.vy);
        sounds.play("wall");
      }
      if (ball.vy > 0 && ball.y + BALL >= RULER_Y && prevY + BALL <= RULER_Y + 1) {
        const seat = rulerX.findIndex((x, index) => ball.x + BALL >= x && ball.x <= x + width(index));
        if (seat >= 0) {
          chain = 0;
          ball.y = RULER_Y - BALL;
          if (catchFor[seat]! > 0) {
            ball.held = seat;
            ball.offset = ball.x + BALL / 2 - (rulerX[seat]! + width(seat) / 2);
            ball.heldFor = 0;
            sounds.play("tick");
            return;
          }
          const offset = clamp((ball.x + BALL / 2 - (rulerX[seat]! + width(seat) / 2)) / (width(seat) / 2 + BALL / 2), -1, 1);
          const angle = offset * (Math.PI / 3);
          ball.vx = Math.sin(angle) * speed();
          ball.vy = -Math.cos(angle) * speed();
          sounds.play("hit");
        }
      }
      hitNote(ball, prevX, prevY);
      if (ball.y > H) return;
    }
  }

  function moveRuler(seat: number, input: ArcadeInput | undefined, dt: number) {
    const keys = input ? Number(input.held.right) - Number(input.held.left) : 0;
    const pointer = pointerModes[seat]!(input, keys !== 0);
    if (pointer) rulerX[seat]! += clamp(pointer.x - width(seat) / 2 - rulerX[seat]!, -POINTER_SPEED * dt, POINTER_SPEED * dt);
    else rulerX[seat]! += keys * RULER_SPEED * dt;
    rulerX[seat] = clamp(rulerX[seat]!, FRAME, W - FRAME - width(seat));
  }

  buildLevel();
  newBallOnRuler();

  return {
    update(inputs, dt) {
      sparks.update(dt);
      shake.update(dt);
      popups.update(dt);
      if (message) {
        message.time -= dt;
        if (message.time <= 0) message = null;
      }
      falls = falls.filter((fall) => {
        fall.vy += 160 * dt;
        fall.y += fall.vy * dt;
        fall.life -= dt;
        fall.w = Math.max(2, NOTE_W * Math.abs(Math.cos(fall.life * 9)));
        return fall.life > 0;
      });
      if (phase === "over" || phase === "won") return;

      for (let seat = 0; seat < count; seat++) {
        moveRuler(seat, inputs[seat], dt);
        wideFor[seat] = Math.max(0, wideFor[seat]! - dt);
        catchFor[seat] = Math.max(0, catchFor[seat]! - dt);
      }
      if (slowFor > 0) {
        slowFor -= dt;
        if (slowFor <= 0) for (const ball of balls) if (ball.held === null) setSpeed(ball, speed());
      }

      if (phase === "ready") {
        if (!startPressed(inputs)) {
          for (const ball of balls) if (ball.held !== null) Object.assign(ball, { x: rulerX[ball.held]! + width(ball.held) / 2 - BALL / 2, y: RULER_Y - BALL - 1 });
          return;
        }
        phase = "playing";
      }

      for (const ball of balls) {
        if (ball.held === null) continue;
        const seat = ball.held;
        ball.x = clamp(rulerX[seat]! + width(seat) / 2 + ball.offset - BALL / 2, FRAME, W - FRAME - BALL);
        ball.y = RULER_Y - BALL - 1;
        ball.heldFor += dt;
        const wants = pressed(inputs[seat], "action") || pressed(inputs[seat], "start") || pressed(inputs[seat], "up");
        if (wants || (catchFor[seat]! > 0 && ball.heldFor > 2)) release(ball);
      }
      for (const ball of balls) if (ball.held === null) stepBall(ball, dt);
      balls = balls.filter((ball) => ball.y <= H);

      drops = drops.filter((drop) => {
        drop.y += drop.vy * dt;
        if (drop.y + 6 >= RULER_Y && drop.y <= RULER_Y + RULER_H) {
          const seat = rulerX.findIndex((x, index) => drop.x + 7 >= x && drop.x <= x + width(index));
          if (seat >= 0) {
            catchDrop(drop, seat);
            return false;
          }
        }
        return drop.y < H;
      });

      if (balls.length === 0) {
        lives--;
        chain = 0;
        shake.kick(2);
        sounds.play("lose");
        if (lives <= 0) {
          phase = "over";
          return;
        }
        holder++;
        newBallOnRuler();
      }
    },

    draw(ctx, time) {
      ctx.save();
      shake.apply(ctx);
      px(ctx, BOARD.cork, -4, -4, W + 8, H + 8);
      for (const fleck of CORK) px(ctx, BOARD.corkFlecks[fleck.c]!, fleck.x, fleck.y);
      px(ctx, BOARD.frame, -4, -4, W + 8, FRAME + 4);
      px(ctx, BOARD.frame, -4, -4, FRAME + 4, H + 8);
      px(ctx, BOARD.frame, W - FRAME, -4, FRAME + 4, H + 8);
      px(ctx, BOARD.frameHi, 0, 0, W, 1);
      px(ctx, BOARD.frameHi, 0, 0, 1, H);
      px(ctx, BOARD.frameDark, FRAME, FRAME - 1, W - FRAME * 2, 1);
      px(ctx, BOARD.frameDark, FRAME - 1, FRAME, 1, H);
      px(ctx, BOARD.frameDark, W - FRAME, FRAME, 1, H);

      notes.forEach((note, index) => {
        if (note.hits <= 0) return;
        const [first, second] = SCRIBBLES[index % SCRIBBLES.length]!;
        px(ctx, BOARD.noteShadow, note.x + 1, note.y + 1, NOTE_W, NOTE_H);
        if (note.kind === "C") {
          // An index card: ruled lines, a red line along the top, and a pin per hit left.
          px(ctx, CARD.fill, note.x - 1, note.y, NOTE_W + 2, NOTE_H);
          px(ctx, CARD.top, note.x - 1, note.y + 2, NOTE_W + 2, 1);
          for (let y = note.y + 4; y < note.y + NOTE_H - 1; y += 2) px(ctx, CARD.line, note.x - 1, y, NOTE_W + 2, 1);
          for (let pin = 0; pin < note.hits; pin++) px(ctx, PAL.red, note.x + 3 + pin * 5, note.y, 2, 2);
          return;
        }
        const style = NOTE_STYLES[note.kind.toLowerCase()]!;
        if (note.hits > 1) {
          // A second note peeking out behind.
          px(ctx, style.curl, note.x + 2, note.y - 2, NOTE_W, NOTE_H);
        }
        px(ctx, style.fill, note.x, note.y, NOTE_W, NOTE_H);
        px(ctx, style.curl, note.x, note.y + NOTE_H - 2, NOTE_W, 2);
        px(ctx, BOARD.ink, note.x + 3, note.y + 3, first!, 1);
        px(ctx, BOARD.ink, note.x + 3, note.y + 5, second!, 1);
      });

      for (const fall of falls) {
        ctx.globalAlpha = Math.max(0, Math.min(1, fall.life * 1.5));
        px(ctx, fall.fill, fall.x + (NOTE_W - fall.w) / 2, fall.y, fall.w, NOTE_H - 2);
      }
      ctx.globalAlpha = 1;

      for (const drop of drops) drawDrop(ctx, drop, time);

      rulerX.forEach((x, seat) => drawRuler(ctx, x, width(seat), count === 1 ? WOOD_RULER : RULERS[seat]!, catchFor[seat]! > 0));

      for (const ball of balls) {
        px(ctx, BOARD.noteShadow, ball.x + 1, ball.y + 2, BALL, BALL);
        px(ctx, PAL.paper, ball.x, ball.y, BALL, BALL);
        px(ctx, PAL.paperCrease, ball.x + 1, ball.y + 1);
        px(ctx, PAL.paperCrease, ball.x + 2, ball.y);
      }

      // Spare paper balls along the bottom left.
      for (let i = 0; i < lives - 1; i++) {
        px(ctx, PAL.paper, FRAME + 4 + i * 6, H - 6, BALL, BALL);
        px(ctx, PAL.paperCrease, FRAME + 5 + i * 6, H - 5);
      }
      // A blinking arrow over a ball waiting on a ruler.
      for (const ball of balls) {
        if (ball.held === null || phase === "ready" || !(reducedMotion || Math.floor(time * 3) % 2 === 0)) continue;
        px(ctx, PAL.ink, ball.x + 1, ball.y - 7, 1, 4);
        px(ctx, PAL.ink, ball.x, ball.y - 6, 3, 1);
      }
      sparks.draw(ctx);
      popups.draw(ctx);
      ctx.restore();
    },

    phase: () => phase,
    score: () => score,
    hud: (): HudItem[] => [
      { label: "Score", value: String(score), badge: multiplier() > 1 ? `x${multiplier()}` : undefined },
      { label: "Balls", value: String(Math.max(0, lives)) },
      { label: "Board", value: String(level + 1) },
    ],
    hint: () => {
      if (message) return message.text;
      const waiting = balls.find((ball) => ball.held !== null && catchFor[ball.held]! <= 0);
      if (phase === "playing" && waiting) return count > 1 ? `${seats[waiting.held!]!.name}: launch the ball` : "Space or tap to launch the next ball";
      return null;
    },
    headline: () => "Game over",
    view: (): BreakoutView => ({
      kind: "breakout",
      phase,
      solo: count === 1,
      notes,
      rulers: rulerX.map((x, seat) => ({ x, width: width(seat), catching: catchFor[seat]! > 0 })),
      balls,
      drops,
      lives,
      level,
    }),
    result: () => `Board ${level + 1}, ${score.toLocaleString("en-US")} points.`,

    snapshot: () => ({
      p: phase,
      s: score,
      l: lives,
      v: level,
      c: chain,
      x: rulerX.map(Math.round),
      wd: wideFor.map((t) => (t > 0 ? 1 : 0)),
      ct: catchFor.map((t) => (t > 0 ? 1 : 0)),
      sl: slowFor > 0 ? 1 : 0,
      b: balls.map((ball) => [Math.round(ball.x), Math.round(ball.y), ball.held ?? -1]),
      d: drops.map((drop) => [drop.kind, Math.round(drop.x), Math.round(drop.y)]),
      n: notes.map((note) => `${note.kind}${note.hits}`).join(","),
      m: message?.text ?? null,
      fx: sounds.drain(),
    }),
    restore(snapshot) {
      const data = read.record(snapshot);
      phase = read.phase(data.p, phase);
      score = read.int(data.s, score, 0, 10_000_000);
      lives = read.int(data.l, lives, 0, 9);
      const nextLevel = read.int(data.v, level, 0, 999);
      chain = read.int(data.c, 0, 0, 9999);
      read.list(data.x, count).forEach((x, seat) => (rulerX[seat] = read.num(x, rulerX[seat], 0, W)));
      read.list(data.wd, count).forEach((flag, seat) => (wideFor[seat] = flag === 1 ? 1 : 0));
      read.list(data.ct, count).forEach((flag, seat) => (catchFor[seat] = flag === 1 ? 1 : 0));
      slowFor = data.sl === 1 ? 1 : 0;
      balls = read.list(data.b, MAX_BALLS).map((value) => {
        const [x, y, held] = read.list(value, 3);
        const seat = read.int(held, -1, -1, 3);
        return { x: read.num(x, 0, -10, W + 10), y: read.num(y, 0, -10, H + 10), vx: 0, vy: 0, held: seat >= 0 ? seat : null, offset: 0, heldFor: 0 };
      });
      drops = read.list(data.d, 4).flatMap((value) => {
        const [kind, x, y] = read.list(value, 3);
        return DROP_KINDS.includes(kind as DropKind) ? [{ kind: kind as DropKind, x: read.num(x, 0, 0, W), y: read.num(y, 0, 0, H), vy: 0 }] : [];
      });
      if (typeof data.n === "string") {
        if (nextLevel !== level || notes.length === 0) {
          level = nextLevel;
          buildLevel();
        }
        const cells = data.n.split(",");
        notes.forEach((note, index) => {
          const cell = cells[index];
          note.hits = cell ? read.int(Number(cell.slice(1)), 0, 0, 3) : 0;
        });
      }
      const text = read.text(data.m);
      message = text ? { text, time: 0.2 } : null;
      sounds.replay(data.fx);
    },
  };
}

// A ruler seen from above: tick marks every 2 pixels, longer ones every 10. Clear plastic ones let
// a little cork show through; a paperclip on it means it catches the ball.
function drawRuler(ctx: CanvasRenderingContext2D, x: number, width: number, style: { face: string; tick: string; edge: string; clear: boolean }, catches: boolean) {
  px(ctx, BOARD.noteShadow, x + 1, RULER_Y + 1, width, RULER_H);
  ctx.globalAlpha = style.clear ? 0.88 : 1;
  px(ctx, style.face, x, RULER_Y, width, RULER_H);
  ctx.globalAlpha = 1;
  px(ctx, style.edge, x, RULER_Y + RULER_H - 1, width, 1);
  for (let i = 1; i < width - 1; i += 2) px(ctx, style.tick, x + i, RULER_Y, 1, (i - 1) % 10 === 0 ? 2 : 1);
  if (catches) {
    px(ctx, "#c9ced6", x + width / 2 - 3, RULER_Y - 1, 6, 1);
    px(ctx, "#c9ced6", x + width / 2 - 3, RULER_Y + 1, 6, 1);
    px(ctx, "#8d949c", x + width / 2 + 2, RULER_Y - 1, 1, 3);
  }
}

// The desk supplies that fall off the board, about 8 x 6 pixels each, swaying as they fall.
function drawDrop(ctx: CanvasRenderingContext2D, drop: Drop, time: number) {
  const x = drop.x + Math.round(Math.sin(time * 5 + drop.x) * 1);
  const y = drop.y;
  px(ctx, BOARD.noteShadow, x + 1, y + 1, 8, 6);
  switch (drop.kind) {
    case "wide": // a black stapler with its silver top plate
      px(ctx, "#2b2d31", x, y + 2, 8, 4);
      px(ctx, "#9aa3b2", x + 1, y + 1, 6, 2);
      px(ctx, "#2b2d31", x + 6, y, 2, 2);
      break;
    case "multi": // three crumpled paper balls
      for (const [bx, by] of [[0, 3], [3, 0], [5, 3]] as const) {
        px(ctx, PAL.paper, x + bx, y + by, 3, 3);
        px(ctx, PAL.paperCrease, x + bx + 1, y + by + 1);
      }
      break;
    case "slow": // a white mug of coffee
      px(ctx, "#f2f0eb", x + 1, y + 1, 5, 5);
      px(ctx, "#4a2c1d", x + 2, y + 1, 3, 1);
      px(ctx, "#d6d2c9", x + 6, y + 2, 2, 2);
      break;
    case "catch": // a silver paperclip
      px(ctx, "#c9ced6", x, y + 1, 8, 1);
      px(ctx, "#c9ced6", x, y + 4, 8, 1);
      px(ctx, "#c9ced6", x, y + 1, 1, 4);
      px(ctx, "#c9ced6", x + 7, y + 1, 1, 4);
      px(ctx, "#8d949c", x + 2, y + 2, 5, 1);
      break;
    case "life": // a spare paper ball with a red ring round it
      px(ctx, PAL.red, x + 1, y, 6, 6);
      px(ctx, PAL.paper, x + 2, y + 1, 4, 4);
      px(ctx, PAL.paperCrease, x + 3, y + 2);
      break;
  }
}
