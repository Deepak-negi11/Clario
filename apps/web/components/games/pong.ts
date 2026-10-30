// Ping-pong on the Game Room table.
//
// Two players play a real game of singles (pong-singles.ts): first to 11, win by 2, serve swaps
// every two points (every point from 10-all), with the ball's flight, bounce and spin worked out in
// metres.
//
// Three or four players play "round the table" (below), seen from above: a square table with a
// player on each side and three balls each. Let the ball past you and you lose one; the last player
// left wins. Sides without a player are railed off.

import {
  SCREEN_H as H, SCREEN_W as W, SEATS, clamp, createParticles, createPointerMode, createPopups, createShake, createSoundLog,
  px, read, startPressed, winsLine,
  type ArcadeInput, type GameInstance, type GameOptions, type GamePhase, type HudItem,
} from "./arcade-kit";
import { BALL, BAT_LONG, BAT_THICK, COLORS, drawBall, drawBat, drawFloor, drawTableTop } from "./pong-art";
import type { SinglesView } from "./pong-geometry";
import { createSingles } from "./pong-singles";

export function createPong(options: GameOptions): GameInstance {
  return options.seats.length >= 3 ? createRoundTable(options) : createSingles(options);
}

export { PONG_TABLE, pongFieldPoint, pongMetres, type SinglesView } from "./pong-geometry";

// What the 3D table (pong-3d.ts) draws: the game's state, read without changing it. Singles is in
// metres (pong-geometry.ts). Round the table is in screen pixels like everything else here; `ball`
// is its top-left corner, `bats` each bat's start along its side.
export type PongView =
  | SinglesView
  | {
      kind: "pong-table";
      phase: GamePhase;
      lives: readonly number[];
      bats: readonly number[];
      ball: { x: number; y: number; vx: number; vy: number };
      launchIn: number;
      lastHitter: number;
    };

// ---------------------------------------------------------------------------------------------
// Round the table (3 or 4 players)

const S = 132; // the square table
const SX = (W - S) / 2;
const SY = (H - S) / 2 - 1;
const LIVES = 3;
const R_START = 100;
const R_MAX = 205;
const CORNER = 10; // posts in the corners keep the ball from sticking there
const PLAYER_SPEED = 175;
const POINTER_SPEED = 430;

// Sides in seat order: left, right, top, bottom. `along` runs from the side's start to its end.
const SIDES = [
  { vertical: true, line: SX, out: -1 },
  { vertical: true, line: SX + S, out: 1 },
  { vertical: false, line: SY, out: -1 },
  { vertical: false, line: SY + S, out: 1 },
] as const;

function createRoundTable({ reducedMotion, sound, seats }: GameOptions): GameInstance {
  const count = seats.length;
  let phase: GamePhase = "ready";
  const lives = seats.map(() => LIVES);
  const pos = seats.map(() => S / 2 - BAT_LONG / 2); // bat start along its side, from the side's start
  const ball = { x: SX + S / 2, y: SY + S / 2, vx: 0, vy: 0, spin: 0 };
  let launchIn = 1;
  let lastHitter = -1;
  let plans = seats.map(() => ({ error: 0 }));
  const popups = createPopups(reducedMotion);
  const sounds = createSoundLog(sound);
  const sparks = createParticles(!reducedMotion);
  const shake = createShake(!reducedMotion);
  const pointerModes = seats.map(() => createPointerMode());

  const active = (seat: number) => seat < count && lives[seat]! > 0;
  const alive = () => seats.map((_, seat) => seat).filter(active);

  function reset() {
    ball.x = SX + S / 2 - BALL / 2;
    ball.y = SY + S / 2 - BALL / 2;
    ball.vx = ball.vy = ball.spin = 0;
    launchIn = 1;
  }

  function launch() {
    const targets = alive();
    const target = targets[Math.floor(Math.random() * targets.length)] ?? 0;
    const side = SIDES[target]!;
    const base = side.vertical ? (side.out < 0 ? Math.PI : 0) : side.out < 0 ? -Math.PI / 2 : Math.PI / 2;
    const angle = base + (Math.random() * 2 - 1) * 0.4;
    ball.vx = Math.cos(angle) * R_START;
    ball.vy = Math.sin(angle) * R_START;
    lastHitter = -1;
    plans = seats.map(() => ({ error: (Math.random() * 2 - 1) * 8 }));
    sounds.play("hit");
  }

  // The ball's position along a side, and the bat's centre there.
  const along = (seat: number) => (SIDES[seat]!.vertical ? ball.y - SY : ball.x - SX) + BALL / 2;

  function moveBat(seat: number, input: ArcadeInput | undefined, dt: number) {
    const side = SIDES[seat]!;
    const before = pos[seat]!;
    if (seats[seat]!.bot) {
      const coming = side.vertical ? Math.sign(ball.vx) === side.out : Math.sign(ball.vy) === side.out;
      let target = S / 2;
      if (coming) {
        const t = side.vertical ? (side.line - ball.x) / (ball.vx || 1) : (side.line - ball.y) / (ball.vy || 1);
        const hitAt = side.vertical ? ball.y + ball.vy * t : ball.x + ball.vx * t;
        target = hitAt - (side.vertical ? SY : SX) + plans[seat]!.error;
      }
      pos[seat] = before + clamp(target - BAT_LONG / 2 - before, -120 * dt, 120 * dt);
    } else {
      const keys = input ? (side.vertical ? Number(input.held.down) - Number(input.held.up) : Number(input.held.right) - Number(input.held.left)) : 0;
      const pointer = pointerModes[seat]!(input, keys !== 0);
      if (pointer) {
        const target = (side.vertical ? pointer.y - SY : pointer.x - SX) - BAT_LONG / 2;
        pos[seat] = before + clamp(target - before, -POINTER_SPEED * dt, POINTER_SPEED * dt);
      } else pos[seat] = before + keys * PLAYER_SPEED * dt;
    }
    pos[seat] = clamp(pos[seat]!, CORNER - 2, S - CORNER + 2 - BAT_LONG);
  }

  function bounceOffBat(seat: number) {
    const side = SIDES[seat]!;
    const offset = clamp((along(seat) - (pos[seat]! + BAT_LONG / 2)) / (BAT_LONG / 2 + BALL / 2), -1, 1);
    const speed = Math.min(R_MAX, Math.hypot(ball.vx, ball.vy) * 1.06);
    const angle = offset * (Math.PI / 4.5);
    const inward = -side.out;
    if (side.vertical) {
      ball.vx = inward * Math.cos(angle) * speed;
      ball.vy = Math.sin(angle) * speed;
      ball.x = side.out < 0 ? side.line + BAT_THICK / 2 : side.line - BAT_THICK / 2 - BALL;
    } else {
      ball.vy = inward * Math.cos(angle) * speed;
      ball.vx = Math.sin(angle) * speed;
      ball.y = side.out < 0 ? side.line + BAT_THICK / 2 : side.line - BAT_THICK / 2 - BALL;
    }
    lastHitter = seat;
    plans = seats.map(() => ({ error: (Math.random() * 2 - 1) * Math.min(18, 6 + speed * 0.04) }));
    sounds.play("hit");
    sparks.burst(ball.x + 1, ball.y + 1, COLORS.ballHi, 4);
  }

  function loseLife(seat: number) {
    lives[seat]!--;
    shake.kick(2);
    const side = SIDES[seat]!;
    const x = side.vertical ? (side.out < 0 ? SX + 8 : SX + S - 8) : SX + S / 2;
    const y = side.vertical ? SY + S / 2 : side.out < 0 ? SY + 10 : SY + S - 14;
    if (lives[seat]! <= 0) {
      sounds.play("fall");
      popups.add("x", x, y, SEATS[seat]!.light);
    } else {
      sounds.play("lose");
      popups.add(String(lives[seat]), x, y, SEATS[seat]!.light);
    }
    const left = alive();
    const humansLeft = left.some((index) => !seats[index]!.bot);
    if (left.length <= 1 || !humansLeft) {
      phase = left.length === 1 && !seats[left[0]!]!.bot ? "won" : "over";
      sounds.play(phase === "won" ? "win" : "lose");
      return;
    }
    reset();
  }

  function stepBall(dt: number) {
    const steps = Math.max(1, Math.ceil((Math.max(Math.abs(ball.vx), Math.abs(ball.vy)) * dt) / 2));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      ball.x += ball.vx * h;
      ball.y += ball.vy * h;
      for (let seat = 0; seat < 4; seat++) {
        const side = SIDES[seat]!;
        const position = side.vertical ? ball.x : ball.y;
        const moving = side.vertical ? ball.vx : ball.vy;
        const face = side.out < 0 ? side.line + BAT_THICK / 2 : side.line - BAT_THICK / 2 - BALL;
        const atFace = side.out < 0 ? position <= face : position >= face;
        if (!atFace || Math.sign(moving) !== side.out) continue;
        const a = along(seat);
        if (!active(seat) || a < CORNER || a > S - CORNER) {
          // A rail or a corner post: bounce straight back.
          if (side.vertical) ball.vx = -ball.vx;
          else ball.vy = -ball.vy;
          if (side.vertical) ball.x = face;
          else ball.y = face;
          sounds.play("wall");
          continue;
        }
        if (a >= pos[seat]! - BALL / 2 && a <= pos[seat]! + BAT_LONG + BALL / 2) {
          bounceOffBat(seat);
          continue;
        }
        // Past the bat: wait until it's clear of the table, then the seat loses a ball.
        const gone = side.out < 0 ? position < side.line - 8 : position > side.line + 8;
        if (gone) return loseLife(seat);
      }
    }
  }

  return {
    update(inputs, dt) {
      sparks.update(dt);
      shake.update(dt);
      popups.update(dt);
      if (phase === "over" || phase === "won") return;
      for (let seat = 0; seat < count; seat++) if (active(seat)) moveBat(seat, inputs[seat], dt);
      if (phase === "ready") {
        if (!startPressed(inputs)) return;
        phase = "playing";
        sounds.play("start");
      }
      if (launchIn > 0) {
        launchIn -= dt;
        if (launchIn <= 0) launch();
        return;
      }
      stepBall(dt);
    },

    draw(ctx, time) {
      ctx.save();
      shake.apply(ctx);
      drawFloor(ctx);
      drawTableTop(ctx, SX, SY, S, S);
      px(ctx, COLORS.centre, SX + 1, SY + S / 2, S - 2, 1);
      px(ctx, COLORS.centre, SX + S / 2, SY + 1, 1, S - 2);
      // Corner posts, and rails along the sides nobody (or nobody any more) is playing.
      for (const [cx, cy] of [[SX - 2, SY - 2], [SX + S - CORNER + 2, SY - 2], [SX - 2, SY + S - CORNER + 2], [SX + S - CORNER + 2, SY + S - CORNER + 2]] as const) {
        px(ctx, COLORS.post, cx, cy, CORNER, CORNER);
        px(ctx, COLORS.postMetal, cx + 2, cy + 2, CORNER - 4, 1);
      }
      for (let seat = 0; seat < 4; seat++) {
        const side = SIDES[seat]!;
        if (active(seat)) {
          const x = side.vertical ? side.line - BAT_THICK / 2 : SX + pos[seat]!;
          const y = side.vertical ? SY + pos[seat]! : side.line - BAT_THICK / 2;
          drawBat(ctx, x, y, side.vertical, seat, side.out as -1 | 1);
        } else if (side.vertical) {
          px(ctx, COLORS.railShade, side.line - 2 + (side.out > 0 ? 1 : 0), SY + CORNER - 2, 3, S - CORNER * 2 + 4);
          px(ctx, COLORS.rail, side.line - 2, SY + CORNER - 2, 2, S - CORNER * 2 + 4);
        } else {
          px(ctx, COLORS.railShade, SX + CORNER - 2, side.line - 2 + (side.out > 0 ? 1 : 0), S - CORNER * 2 + 4, 3);
          px(ctx, COLORS.rail, SX + CORNER - 2, side.line - 2, S - CORNER * 2 + 4, 2);
        }
      }
      // Each player's balls left, by their side.
      for (let seat = 0; seat < count; seat++) {
        const side = SIDES[seat]!;
        for (let life = 0; life < lives[seat]!; life++) {
          const x = side.vertical ? (side.out < 0 ? SX - 12 : SX + S + 8) : SX + S / 2 - 8 + life * 6;
          const y = side.vertical ? SY + S / 2 - 8 + life * 6 : side.out < 0 ? SY - 10 : SY + S + 6;
          // Spare balls are white so they don't look like the one in play.
          px(ctx, "#f6f5f1", x, y, 3, 3);
          px(ctx, "#c9c6bd", x + 2, y + 2);
        }
      }
      const ended = phase === "over" || phase === "won";
      if (!ended && (launchIn <= 0 || reducedMotion || Math.floor(time * 4) % 2 === 0)) drawBall(ctx, ball.x, ball.y, 0);
      if (lastHitter >= 0 && !ended) px(ctx, SEATS[lastHitter]!.light, ball.x + 1, ball.y + 1);
      sparks.draw(ctx);
      popups.draw(ctx);
      ctx.restore();
    },

    phase: () => phase,
    score: () => lives[0]!,
    hud: () => seats.map((seat, index): HudItem => ({ label: seat.name, value: String(lives[index]), seat: index, out: lives[index]! <= 0 })),
    hint: () => null,
    headline: () => {
      const left = alive();
      if (phase === "won") return winsLine(seats[left[0]!]!.name);
      return left.length === 1 ? winsLine(seats[left[0]!]!.name) : "Game over";
    },
    result: () => {
      const left = alive();
      if (left.length === 1) {
        const balls = lives[left[0]!]!;
        return `${seats[left[0]!]!.name} won with ${balls} ${balls === 1 ? "ball" : "balls"} left.`;
      }
      const people = seats.filter((seat) => !seat.bot);
      const still = `${left.length} computer players were still in.`;
      return people.length === 1 ? `${people[0]!.name === "You" ? "You were" : `${people[0]!.name} was`} knocked out. ${still}` : `Everyone playing was knocked out. ${still}`;
    },
    view: () => ({ kind: "pong-table", phase, lives, bats: pos, ball, launchIn, lastHitter }),

    snapshot: () => ({
      p: phase,
      l: lives,
      q: pos.map(Math.round),
      b: [ball.x, ball.y, ball.vx, ball.vy].map((n) => Math.round(n * 10) / 10),
      w: Math.round(launchIn * 10) / 10,
      h: lastHitter,
      fx: sounds.drain(),
    }),
    restore(snapshot) {
      const data = read.record(snapshot);
      phase = read.phase(data.p, phase);
      read.list(data.l, count).forEach((value, seat) => (lives[seat] = read.int(value, lives[seat], 0, LIVES)));
      read.list(data.q, count).forEach((value, seat) => (pos[seat] = read.num(value, pos[seat], 0, S)));
      const b = read.list(data.b, 4);
      ball.x = read.num(b[0], ball.x, -20, W + 20);
      ball.y = read.num(b[1], ball.y, -20, H + 20);
      ball.vx = read.num(b[2], 0, -R_MAX, R_MAX);
      ball.vy = read.num(b[3], 0, -R_MAX, R_MAX);
      launchIn = read.num(data.w, 0, 0, 2);
      lastHitter = read.int(data.h, -1, -1, 3);
      sounds.replay(data.fx);
    },
  };
}

// The table's measurements, for the 3D table to line its pieces up with the game's.
export const PONG_LAYOUT = {
  ball: BALL,
  batLong: BAT_LONG,
  batThick: BAT_THICK,
  round: { x: SX, y: SY, size: S, corner: CORNER, lives: LIVES, sides: SIDES },
} as const;
