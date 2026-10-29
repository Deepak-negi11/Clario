// Ping-pong on the Game Room table, seen from above.
//
// Two players play a real game of singles: first to 11, win by 2, serve swaps every two points (every
// point at 10-all). The ball arcs over the net and bounces once on the far side; hit it wide before
// it lands and it's out. Moving your bat as you hit puts spin on the ball, which curves it.
//
// Three or four players play "round the table": a square table with a player on each side and
// three balls each. Let the ball past you and you lose one; the last player left wins. Sides
// without a player are railed off.

import {
  SCREEN_H as H, SCREEN_W as W, SEATS, clamp, createParticles, createPointerMode, createPopups, createShake, createSoundLog,
  drawNumber, pressed, px, read, seeded, startPressed, winsLine,
  type ArcadeInput, type GameInstance, type GameOptions, type GamePhase, type HudItem,
} from "./arcade-kit";

const COLORS = {
  floor: "#676b72",
  floorFleck: ["#61656c", "#6e7279"],
  top: "#1c4a86",
  topDither: "#1f4f8d",
  apron: "#143b6c",
  apronDark: "#0e2c52",
  line: "#f2f2ee",
  centre: "#c9d4e2",
  score: "#2a5b9c",
  netTape: "#f4f4f0",
  netShadow: "#0f2c55",
  post: "#2b2d31",
  postMetal: "#a3a9b0",
  ball: "#f2862b",
  ballHi: "#ffc07a",
  ballShadow: "rgba(9, 28, 56, 0.5)",
  wood: "#d8ac72",
  handle: "#b5814b",
  handleDark: "#8a5e33",
  rail: "#e7e4dc",
  railShade: "#b9b5ab",
} as const;

const rand = seeded(7);
const FLOOR_FLECKS = Array.from({ length: 220 }, () => ({ x: Math.floor(rand() * W), y: Math.floor(rand() * H), c: rand() > 0.5 ? 1 : 0 }));
const DITHER = Array.from({ length: 160 }, () => ({ u: rand(), v: rand() }));

const BALL = 3;
const BAT_LONG = 22;
const BAT_THICK = 4;

export function createPong(options: GameOptions): GameInstance {
  return options.seats.length >= 3 ? createRoundTable(options) : createSingles(options);
}

function drawFloor(ctx: CanvasRenderingContext2D) {
  px(ctx, COLORS.floor, -4, -4, W + 8, H + 8);
  for (const fleck of FLOOR_FLECKS) px(ctx, COLORS.floorFleck[fleck.c]!, fleck.x, fleck.y);
}

// The table top: shadow on the floor, the edge, the matte blue with white lines.
function drawTableTop(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.globalAlpha = 0.35;
  px(ctx, "#2a2d32", x + 4, y + 4, w, h + 3);
  ctx.globalAlpha = 1;
  px(ctx, COLORS.apron, x, y + h, w, 3);
  px(ctx, COLORS.apronDark, x, y + h + 2, w, 1);
  px(ctx, COLORS.top, x, y, w, h);
  for (const dot of DITHER) px(ctx, COLORS.topDither, x + 1 + Math.floor(dot.u * (w - 2)), y + 1 + Math.floor(dot.v * (h - 2)));
  px(ctx, COLORS.line, x, y, w, 1);
  px(ctx, COLORS.line, x, y + h - 1, w, 1);
  px(ctx, COLORS.line, x, y, 1, h);
  px(ctx, COLORS.line, x + w - 1, y, 1, h);
}

// A bat from above: wooden rim round the rubber in the seat's colour, a shine, and the handle
// pointing away from the table. `vertical` bats sit on the left and right ends.
function drawBat(ctx: CanvasRenderingContext2D, x: number, y: number, vertical: boolean, seat: number, handleSide: -1 | 1) {
  const rubber = SEATS[seat]!;
  const w = vertical ? BAT_THICK : BAT_LONG;
  const h = vertical ? BAT_LONG : BAT_THICK;
  if (vertical) {
    const hx = handleSide < 0 ? x - 5 : x + w + 1;
    px(ctx, COLORS.handle, hx, y + h / 2 - 2, 4, 5);
    px(ctx, COLORS.handleDark, hx, y + h / 2 + 2, 4, 1);
  } else {
    const hy = handleSide < 0 ? y - 5 : y + h + 1;
    px(ctx, COLORS.handle, x + w / 2 - 2, hy, 5, 4);
    px(ctx, COLORS.handleDark, x + w / 2 + 2, hy, 1, 4);
  }
  px(ctx, COLORS.wood, x - 1, y, w + 2, h);
  px(ctx, COLORS.wood, x, y - 1, w, h + 2);
  px(ctx, rubber.color, x, y, w, h);
  if (vertical) px(ctx, rubber.light, x, y + 1, 1, h - 2);
  else px(ctx, rubber.light, x + 1, y, w - 2, 1);
}

function drawBall(ctx: CanvasRenderingContext2D, x: number, y: number, height: number) {
  ctx.fillStyle = COLORS.ballShadow;
  ctx.fillRect(Math.round(x + 1), Math.round(y + 1), BALL, BALL);
  const size = height > 4 ? 4 : BALL;
  const by = y - height;
  px(ctx, COLORS.ball, x - (size - BALL) / 2, by - (size - BALL) / 2, size, size);
  px(ctx, COLORS.ballHi, x - (size - BALL) / 2, by - (size - BALL) / 2);
}

// ---------------------------------------------------------------------------------------------
// Singles

const TX = 12;
const TY = 12;
const TW = W - 24;
const TH = 128;
const LEFT_X = TX - 2;
const RIGHT_X = TX + TW - 2;
const BAT_MIN = TY - 10;
const BAT_MAX = TY + TH + 10 - BAT_LONG;
const START_SPEED = 115;
const MAX_SPEED = 240;
const SPEED_UP = 1.05;
const PLAYER_SPEED = 175;
const POINTER_SPEED = 430;
const MAX_ANGLE = Math.PI / 6; // 30 degrees off straight
const MAX_SPIN = 70;
const AUTO_SERVE = 4;
const POINTS_TO_WIN = 11;

function createSingles({ reducedMotion, sound, seats }: GameOptions): GameInstance {
  const names = [seats[0]?.name ?? "You", seats[1]?.name ?? "Computer"];
  const bots = [seats[0]?.bot ?? false, seats[1]?.bot ?? true];
  let phase: GamePhase = "ready";
  const score = [0, 0];
  const batY = [(H - BAT_LONG) / 2, (H - BAT_LONG) / 2];
  const batVel = [0, 0];
  const ball = { x: 0, y: 0, vx: 0, vy: 0, spin: 0 };
  // The current shot: where it was hit, where it lands, and the far end it's heading for.
  let flight: { x0: number; xb: number; xt: number } | null = null;
  let bounced = false;
  let server = 0;
  let serving = true;
  let serveClock = 0;
  let lastHitter = 0;
  let rally = 0;
  let botPlan = { offset: 0, error: 0 };
  let message: { text: string; time: number } | null = null;
  const sounds = createSoundLog(sound);
  const sparks = createParticles(!reducedMotion);
  const shake = createShake(!reducedMotion);
  const pointerModes = [createPointerMode(), createPointerMode()];

  const say = (text: string, time = 1.2) => {
    message = { text, time };
  };

  const batX = (seat: number) => (seat === 0 ? LEFT_X : RIGHT_X);

  function holdBallForServe() {
    ball.x = server === 0 ? LEFT_X + BAT_THICK + 2 : RIGHT_X - BALL - 2;
    ball.y = batY[server]! + BAT_LONG / 2 - BALL / 2;
    ball.vx = ball.vy = ball.spin = 0;
    flight = null;
  }

  function startFlight(dir: number) {
    const xt = dir > 0 ? RIGHT_X : LEFT_X + BAT_THICK;
    flight = { x0: ball.x, xb: ball.x + (xt - ball.x) * 0.72, xt };
    bounced = false;
  }

  function serve() {
    serving = false;
    serveClock = 0;
    rally = 0;
    lastHitter = server;
    const dir = server === 0 ? 1 : -1;
    const angle = (Math.random() * 2 - 1) * 0.18;
    ball.vx = dir * Math.cos(angle) * START_SPEED;
    ball.vy = Math.sin(angle) * START_SPEED;
    ball.spin = clamp(batVel[server]! * 0.35, -MAX_SPIN / 2, MAX_SPIN / 2);
    startFlight(dir);
    sounds.play("hit");
    planBot();
  }

  // Who serves: two serves each, one each from 10-all.
  function nextServer() {
    const total = score[0]! + score[1]!;
    return score[0]! >= POINTS_TO_WIN - 1 && score[1]! >= POINTS_TO_WIN - 1 ? total % 2 : Math.floor(total / 2) % 2;
  }

  function point(winner: number, why: "out" | "miss") {
    score[winner]!++;
    shake.kick(winner === 0 ? 1 : 2);
    const loserIsYou = bots[winner] && !bots[1 - winner]!;
    const [a, b] = [score[0]!, score[1]!];
    const lead = Math.abs(a - b);
    if (Math.max(a, b) >= POINTS_TO_WIN && lead >= 2) {
      phase = loserIsYou ? "over" : "won";
      sounds.play(loserIsYou ? "lose" : "win");
      return;
    }
    sounds.play(loserIsYou ? "lose" : "score");
    const whose = names[winner] === "You" ? "Your point" : `${names[winner]}'s point`;
    say(a >= 10 && b >= 10 ? (a === b ? "Deuce" : `Advantage ${names[a > b ? 0 : 1]}`) : why === "out" ? `Out! ${whose}` : whose);
    server = nextServer();
    serving = true;
    serveClock = 0;
    holdBallForServe();
  }

  function hit(seat: number) {
    const dir = seat === 0 ? 1 : -1;
    const offset = clamp((ball.y + BALL / 2 - (batY[seat]! + BAT_LONG / 2)) / (BAT_LONG / 2 + BALL / 2), -1, 1);
    const angle = offset * MAX_ANGLE;
    const speed = Math.min(MAX_SPEED, Math.hypot(ball.vx, ball.vy) * SPEED_UP);
    ball.vx = dir * Math.cos(angle) * speed;
    ball.vy = Math.sin(angle) * speed;
    ball.spin = clamp(batVel[seat]! * 0.45, -MAX_SPIN, MAX_SPIN);
    ball.x = seat === 0 ? LEFT_X + BAT_THICK : RIGHT_X - BALL;
    lastHitter = seat;
    rally++;
    startFlight(dir);
    sounds.play("hit");
    sparks.burst(ball.x + BALL / 2, ball.y + BALL / 2, COLORS.ballHi, 4);
    if (rally > 0 && rally % 10 === 0) say(`Rally ${rally}!`, 1);
    planBot();
  }

  // The computer picks where on its bat to take the next ball (that sets the angle) and how far
  // off it'll be. Longer, faster rallies make it shakier.
  function planBot() {
    const speed = Math.hypot(ball.vx, ball.vy);
    botPlan = {
      offset: (Math.random() * 2 - 1) * 0.55,
      error: (Math.random() * 2 - 1) * Math.min(20, 3 + rally * 1.6 + (speed - START_SPEED) * 0.06),
    };
  }

  // Where the ball will be (ignoring spin) when it reaches x.
  function predictY(x: number) {
    if (ball.vx === 0) return ball.y;
    const t = (x - ball.x) / ball.vx;
    return ball.y + ball.vy * t + 0.5 * ball.spin * t * t * 0.6;
  }

  function moveBat(seat: number, input: ArcadeInput | undefined, dt: number) {
    const before = batY[seat]!;
    if (bots[seat]) {
      const coming = !serving && (seat === 0 ? ball.vx < 0 : ball.vx > 0);
      const target = coming ? predictY(batX(seat)) + BALL / 2 - BAT_LONG / 2 - botPlan.offset * (BAT_LONG / 2) + botPlan.error : (H - BAT_LONG) / 2;
      const speed = Math.min(165, 105 + rally * 3);
      batY[seat] = before + clamp(target - before, -speed * dt, speed * dt);
    } else {
      const keys = input ? Number(input.held.down) - Number(input.held.up) : 0;
      const pointer = pointerModes[seat]!(input, keys !== 0);
      if (pointer) batY[seat] = before + clamp(pointer.y - BAT_LONG / 2 - before, -POINTER_SPEED * dt, POINTER_SPEED * dt);
      else batY[seat] = before + keys * PLAYER_SPEED * dt;
    }
    batY[seat] = clamp(batY[seat]!, BAT_MIN, BAT_MAX);
    batVel[seat] = dt > 0 ? (batY[seat]! - before) / dt : 0;
  }

  function stepBall(dt: number) {
    const steps = Math.max(1, Math.ceil((Math.max(Math.abs(ball.vx), Math.abs(ball.vy)) * dt) / 2));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      ball.vy += ball.spin * h;
      ball.spin *= Math.exp(-1.1 * h);
      ball.x += ball.vx * h;
      ball.y += ball.vy * h;
      if (flight && !bounced && (ball.vx > 0 ? ball.x >= flight.xb : ball.x <= flight.xb)) {
        bounced = true;
        sounds.play("tick");
        sparks.burst(ball.x + 1, ball.y + 1, COLORS.line, 3, 12);
      }
      // Wide of the table before it landed: out, the point goes to the other player.
      if (!bounced && (ball.y + BALL < TY - 1 || ball.y > TY + TH + 1)) return point(1 - lastHitter, "out");
      const overlaps = (seat: number) => ball.y + BALL >= batY[seat]! && ball.y <= batY[seat]! + BAT_LONG;
      if (bounced && ball.vx < 0 && ball.x <= LEFT_X + BAT_THICK && ball.x + BALL >= LEFT_X && overlaps(0)) hit(0);
      else if (bounced && ball.vx > 0 && ball.x + BALL >= RIGHT_X && ball.x <= RIGHT_X + BAT_THICK && overlaps(1)) hit(1);
      if (ball.x + BALL < -2) return point(1, "miss");
      if (ball.x > W + 2) return point(0, "miss");
    }
  }

  function height() {
    if (!flight || serving) return 0;
    const first = Math.abs(flight.xb - flight.x0) || 1;
    const second = Math.abs(flight.xt - flight.xb) || 1;
    const d = Math.abs(ball.x - flight.x0);
    if (d <= first) return 7 * Math.sin((Math.PI * d) / first);
    const d2 = d - first;
    return d2 <= second ? 4 * Math.sin((Math.PI * d2) / second) : 0;
  }

  holdBallForServe();

  return {
    update(inputs, dt) {
      sparks.update(dt);
      shake.update(dt);
      if (message) {
        message.time -= dt;
        if (message.time <= 0) message = null;
      }
      if (phase === "over" || phase === "won") return;

      moveBat(0, inputs[0], dt);
      moveBat(1, inputs[1], dt);

      if (phase === "ready") {
        holdBallForServe();
        if (!startPressed(inputs)) return;
        phase = "playing";
        sounds.play("start");
        serve();
        return;
      }

      if (serving) {
        holdBallForServe();
        serveClock += dt;
        const wantsServe = bots[server] ? serveClock > 0.9 : pressed(inputs[server], "action") || pressed(inputs[server], "start") || serveClock > AUTO_SERVE;
        if (wantsServe) serve();
        return;
      }
      stepBall(dt);
    },

    draw(ctx, time) {
      ctx.save();
      shake.apply(ctx);
      drawFloor(ctx);
      drawTableTop(ctx, TX, TY, TW, TH);
      px(ctx, COLORS.centre, TX + 1, TY + TH / 2, TW - 2, 1);
      drawNumber(ctx, score[0]!, W / 2 - 14, TY + 8, { scale: 4, color: COLORS.score, align: "right" });
      drawNumber(ctx, score[1]!, W / 2 + 14, TY + 8, { scale: 4, color: COLORS.score, align: "left" });
      if (rally >= 4 && !serving) drawNumber(ctx, rally, W / 2, TY + TH - 12, { scale: 1, color: COLORS.score, align: "center" });

      // The net: its shadow, the white tape along the top, and a post clamped on each side.
      px(ctx, COLORS.netShadow, W / 2 + 1, TY + 1, 2, TH - 2);
      px(ctx, COLORS.netTape, W / 2 - 1, TY - 3, 2, TH + 6);
      px(ctx, COLORS.post, W / 2 - 2, TY - 6, 4, 4);
      px(ctx, COLORS.postMetal, W / 2 - 1, TY - 5, 2, 1);
      px(ctx, COLORS.post, W / 2 - 2, TY + TH + 2, 4, 4);
      px(ctx, COLORS.postMetal, W / 2 - 1, TY + TH + 3, 2, 1);

      drawBat(ctx, LEFT_X, batY[0]!, true, 0, -1);
      drawBat(ctx, RIGHT_X, batY[1]!, true, 1, 1);

      const ended = phase === "over" || phase === "won";
      // The ball blinks in the server's hand.
      if (!ended && (!serving || phase === "ready" || reducedMotion || Math.floor(time * 4) % 2 === 0)) drawBall(ctx, ball.x, ball.y, height());
      sparks.draw(ctx);
      ctx.restore();
    },

    phase: () => phase,
    score: () => score[0]!,
    hud: () =>
      [0, 1].map((seat): HudItem => ({ label: names[seat]!, value: String(score[seat]), seat, badge: serving && server === seat && phase === "playing" ? "serve" : undefined })),
    hint: () => {
      if (message) return message.text;
      if (phase === "playing" && serving && !bots[server]) return `${names[server] === "You" ? "Your" : `${names[server]}'s`} serve: press Space or tap`;
      return null;
    },
    headline: () => {
      const winner = score[0]! > score[1]! ? 0 : 1;
      return bots[winner] && !bots[1 - winner] ? "Game over" : winsLine(names[winner]!);
    },
    result: () => {
      const winner = score[0]! > score[1]! ? 0 : 1;
      return `${names[winner]} won ${score[winner]} to ${score[1 - winner]}.`;
    },

    snapshot: () => ({
      p: phase,
      s: score,
      y: batY.map(Math.round),
      b: [ball.x, ball.y, ball.vx, ball.vy, ball.spin].map((n) => Math.round(n * 10) / 10),
      f: flight ? [flight.x0, flight.xb, flight.xt].map(Math.round) : null,
      o: bounced ? 1 : 0,
      v: server,
      w: serving ? 1 : 0,
      r: rally,
      m: message?.text ?? null,
      fx: sounds.drain(),
    }),
    restore(snapshot) {
      const data = read.record(snapshot);
      phase = read.phase(data.p, phase);
      const s = read.list(data.s, 2);
      const y = read.list(data.y, 2);
      for (const seat of [0, 1]) {
        score[seat] = read.int(s[seat], score[seat], 0, 99);
        batY[seat] = read.num(y[seat], batY[seat], 0, H);
      }
      const b = read.list(data.b, 5);
      ball.x = read.num(b[0], ball.x, -20, W + 20);
      ball.y = read.num(b[1], ball.y, -20, H + 20);
      ball.vx = read.num(b[2], 0, -MAX_SPEED, MAX_SPEED);
      ball.vy = read.num(b[3], 0, -MAX_SPEED, MAX_SPEED);
      ball.spin = read.num(b[4], 0, -MAX_SPIN, MAX_SPIN);
      const f = read.list(data.f, 3);
      flight = f.length === 3 ? { x0: read.num(f[0], 0, 0, W), xb: read.num(f[1], 0, 0, W), xt: read.num(f[2], 0, 0, W) } : null;
      bounced = data.o === 1;
      server = read.int(data.v, 0, 0, 1);
      serving = data.w === 1;
      rally = read.int(data.r, 0, 0, 999);
      const text = read.text(data.m);
      message = text ? { text, time: 0.2 } : null;
      sounds.replay(data.fx);
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Round the table (3 or 4 players)

const S = 132; // the square table
const SX = (W - S) / 2;
const SY = (H - S) / 2 - 1;
const LIVES = 3;
const R_START = 100;
const R_MAX = 205;
const CORNER = 10; // posts in the corners keep the ball from sticking there

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
