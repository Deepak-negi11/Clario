// Table tennis singles, played in metres (pong-geometry.ts). The 3D table (pong-3d.ts) draws it from
// `view()`; `draw()` paints the same game flat, from above, when there's no 3D.
//
// The rules live in pong-rules.ts. The ball flies under gravity and spin, bounces off the table and
// the floor, and catches the net. Every shot is aimed:
// - where the ball meets the bat sets the angle across the table (the edge sends it wide)
// - how fast the bat is moving adds pace and sidespin (the ball curves, and kicks sideways off the
//   table)
// - how high the ball is sets the shot: a low ball has to be lifted, a high one gets smashed
// Fast, flat shots can catch the net and wide ones can miss the table, so anyone can miss,
// the computer included.
//
// The serve: tap to toss the ball up, and it's struck on the way down. It bounces once on your half
// and once on the other. Moving your bat as you serve sends it that way.

import {
  SCREEN_H as H, SCREEN_W as W, clamp, createParticles, createPointerMode, createShake, createSoundLog, drawNumber, pressed, px, read,
  startPressed, winsLine,
  type ArcadeInput, type GameInstance, type GameOptions, type GamePhase, type HudItem, type Level,
} from "./arcade-kit";
import { BAT_THICK, COLORS, drawBall, drawBat, drawFloor, drawTableTop } from "./pong-art";
import { PONG_TABLE as T, pongFieldPoint, pongMetres, type SinglesView } from "./pong-geometry";
import {
  bounce, canReturn, other, reachFloor, returned, scoreCall, serveRally, serverAt, solveArc, touchNet, winnerOf,
  type Call, type PointReason, type Rally, type Side,
} from "./pong-rules";

const G = 9.81;
const TOP = T.height;
const HALF_L = T.length / 2;
const HALF_W = T.width / 2;
const NET_SPAN = HALF_W + T.netOverhang;
const R = T.ballRadius;
const BAT_RANGE = 0.95;
const BOUNCE_TABLE = 0.86;
const BOUNCE_FLOOR = 0.55;
// Spin: topspin pulls the ball down harder (it dips) and skids it on; sidespin curves it.
const MAGNUS = 2.2;
const CURVE = 1.1;
// The game runs slower than life so rallies are playable, and speeds up as a rally goes on.
const PACE_START = 0.5;
const PACE_MAX = 0.68;
const PACE_PER_HIT = 0.012;
const STEP = 0.0025;
const TOP_SPEED = 14;
const KEY_SPEED = 2.1;
const KEY_ACCEL = 16;
const POINTER_SPEED = 5;
const REST_Z = TOP + 0.14;
// A ball this high above the table when it's hit gets smashed.
const SMASH_HEIGHT = 0.36;
const DEAD_TIME = 1.1;
const AUTO_SERVE = 5;
const BOT_SERVE_AFTER = 0.8;
const TOSS_FROM = 0.06;
const LET_CHANCE = 0.04;

// How the computer plays at each level: how fast its bat moves (m/s), how long it takes to react
// (s), how far off it reads where the ball will be (m), how hard it goes for the angles, how hard
// it swings (0 just blocks, 1 swings flat out), how shaky its shots are, and how often a shot
// just goes wrong.
const LEVEL_PLAY: Record<Level, { speed: number; react: number; misread: number; aim: number; power: number; wobble: number; slip: number }> = {
  easy: { speed: 0.8, react: 0.3, misread: 0.13, aim: 0.3, power: 0.1, wobble: 1.5, slip: 0.09 },
  medium: { speed: 1.3, react: 0.18, misread: 0.06, aim: 0.55, power: 0.45, wobble: 1, slip: 0.04 },
  hard: { speed: 1.8, react: 0.11, misread: 0.035, aim: 0.8, power: 0.75, wobble: 0.7, slip: 0.02 },
};
// A person's shots go wrong now and then too, more often the riskier the shot.
const PERSON_SLIP = 0.015;

type Ball = { x: number; y: number; z: number; vx: number; vy: number; vz: number; top: number; side: number };

// What the ball touched in one step of flight.
type Touch = { kind: "table"; side: Side } | { kind: "net"; clipped: boolean } | { kind: "floor" } | { kind: "plane"; seat: Side } | null;

// Moves the ball one step of `h` game seconds and reports what it touched. Shared by the game and
// the computer's guess at where the ball will go.
function advance(b: Ball, h: number): Touch {
  const pull = G + b.top * MAGNUS;
  const curve = b.side * CURVE;
  const fromX = b.x;
  const fromZ = b.z;
  b.x += b.vx * h;
  b.y += b.vy * h + 0.5 * curve * h * h;
  b.vy += curve * h;
  b.z += b.vz * h - 0.5 * pull * h * h;
  b.vz -= pull * h;

  // The net: over the tape it goes (slowed, popping up); lower down it drops back.
  if (fromX < 0 !== b.x < 0 && Math.abs(b.y) <= NET_SPAN) {
    const height = b.z - TOP;
    if (height > -R && height < T.net + R) {
      if (height > T.net - R * 0.25) {
        b.vx *= 0.65;
        b.vz = Math.abs(b.vz) * 0.3 + 0.25;
        return { kind: "net", clipped: true };
      }
      b.x = fromX < 0 ? -0.004 : 0.004;
      b.vx = -b.vx * 0.12;
      b.vy *= 0.3;
      b.vz = Math.min(b.vz, 0) * 0.3;
      return { kind: "net", clipped: false };
    }
  }
  if (b.vz < 0 && b.z - TOP <= R && fromZ - TOP >= R - 0.001 && Math.abs(b.x) <= HALF_L + R / 2 && Math.abs(b.y) <= HALF_W + R / 2) {
    b.z = TOP + R;
    b.vz = -b.vz * BOUNCE_TABLE * (1 - 0.06 * b.top);
    b.vx += Math.sign(b.vx) * b.top * 0.35;
    b.vy += b.side * 0.22;
    b.top *= 0.45;
    b.side *= 0.6;
    return { kind: "table", side: b.x < 0 ? 0 : 1 };
  }
  if (b.vz < 0 && b.z <= R) {
    b.z = R;
    b.vz = -b.vz * BOUNCE_FLOOR;
    b.vx *= 0.75;
    b.vy *= 0.75;
    b.top = b.side = 0;
    return { kind: "floor" };
  }
  if (Math.abs(fromX) < T.batX && Math.abs(b.x) >= T.batX && Math.sign(b.vx) === Math.sign(b.x)) return { kind: "plane", seat: b.x < 0 ? 0 : 1 };
  return null;
}

// A rough bell curve, for shot wobble.
const wobble = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

const POINT_WORDS: Record<PointReason, string | null> = { fault: "Fault", net: "Net", out: "Out", missed: null };

// The flat view: the table in field pixels, and how many pixels a metre of height lifts the ball.
const TABLE_CORNER = pongFieldPoint(-HALF_L, -HALF_W);
const TABLE_FAR = pongFieldPoint(HALF_L, HALF_W);
const TX = Math.round(TABLE_CORNER.x);
const TY = Math.round(TABLE_CORNER.y);
const TW = Math.round(TABLE_FAR.x) - TX;
const TH = Math.round(TABLE_FAR.y) - TY;
const BAT_PIXELS = Math.round(pongFieldPoint(0, T.reach).y - pongFieldPoint(0, -T.reach).y);
const LIFT = 40;

export function createSingles({ reducedMotion, sound, seats, level = "medium" }: GameOptions): GameInstance {
  const names = [seats[0]?.name ?? "You", seats[1]?.name ?? "Computer"] as const;
  const bots = [seats[0]?.bot ?? false, seats[1]?.bot ?? true];
  const play = LEVEL_PLAY[level];
  const first: Side = 0;

  let phase: GamePhase = "ready";
  const score: [number, number] = [0, 0];
  let server: Side = first;
  // hold: the server has the ball; toss: it's in the air; live: in play; dead: the point's over
  // and the ball is falling to the floor.
  let stage: "hold" | "toss" | "live" | "dead" = "hold";
  let clock = 0;
  let replay = false; // a let: the same server serves again
  const ball: Ball = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, top: 0, side: 0 };
  let rally: Rally = serveRally(server);
  let hits = 0;
  let longest = 0;
  let toss: ReturnType<typeof planServe> | null = null;
  const bats = [0, 1].map(() => ({ y: 0, z: REST_Z, vy: 0, swing: 0 }));
  const plans = [0, 1].map(() => ({ target: 0, wait: 0, chasing: false }));
  let marks: { x: number; y: number; age: number }[] = [];
  let message: { text: string; time: number } | null = null;
  let call: string | null = null;
  let trail: { x: number; y: number }[] = [];
  // Guests draw the host's snapshots; between them the ball carries on along its path.
  let remoteAt = 0;
  const sounds = createSoundLog(sound);
  const sparks = createParticles(!reducedMotion);
  const shake = createShake(!reducedMotion);
  const pointerModes = [createPointerMode(), createPointerMode()];

  const say = (text: string, time = 1.2) => {
    message = { text, time };
  };
  const pace = () => Math.min(PACE_MAX, PACE_START + hits * PACE_PER_HIT);
  const sideOf = (seat: number) => (seat === 0 ? -1 : 1);
  const possessive = (seat: number) => (names[seat] === "You" ? "Your" : `${names[seat]}'s`);

  function holdBall() {
    const bat = bats[server]!;
    ball.x = sideOf(server) * (T.batX - 0.1);
    ball.y = bat.y;
    ball.z = TOP + TOSS_FROM;
    ball.vx = ball.vy = ball.vz = ball.top = ball.side = 0;
  }

  // The serve's arc in x and z: bounce `inset` metres inside your own end line, clear the net and
  // land deep on the other half. The ball is struck when it falls back to `contact` above the table.
  function planServe(seat: Side, deep: boolean) {
    const dir = seat === 0 ? 1 : -1;
    const x0 = -dir * (T.batX - 0.1);
    const depth = deep ? 0.95 + Math.random() * 0.25 : 0.75 + Math.random() * 0.2;
    const clearance = Math.random() < LET_CHANCE ? -R * 0.5 : 0.04 + Math.random() * 0.06;
    let best: { vx: number; vz: number; contact: number; time: number } | null = null;
    for (const inset of [0.32, 0.4, 0.48, 0.56, 0.26]) {
      const bounceX = -dir * (HALF_L - inset);
      const arc = solveArc(bounceX, R, 0, T.net + R + clearance, dir * depth, R, G, 9);
      if (!arc) continue;
      // Coming down onto the table, before the bounce took away a little of its speed.
      const down = -arc.vz / BOUNCE_TABLE;
      const t1 = Math.abs(bounceX - x0) / Math.abs(arc.vx);
      const contact = R - down * t1 - 0.5 * G * t1 * t1;
      const plan = { vx: arc.vx, vz: down + G * t1, contact, time: t1 + arc.time };
      if (contact >= 0.07 && contact <= 0.34) return plan;
      if (!best || Math.abs(contact - 0.2) < Math.abs(best.contact - 0.2)) best = plan;
    }
    return best ?? { vx: dir * 4.4, vz: -1.1, contact: 0.24, time: 0.62 };
  }

  function startToss() {
    toss = planServe(server, bots[server] ? Math.random() < 0.5 + play.aim * 0.4 : Math.random() < 0.6);
    stage = "toss";
    holdBall();
    // Up from the hand to a little above where it'll be struck.
    ball.vz = Math.sqrt(2 * G * Math.max(0.12, toss.contact + 0.07 - TOSS_FROM));
  }

  function strikeServe() {
    const plan = toss!;
    const bat = bats[server]!;
    const aim = bots[server]
      ? (Math.random() * 2 - 1) * (0.25 + play.aim * 0.4)
      : -bat.y * 0.5 + bat.vy * 0.25 + (Math.random() - 0.5) * 0.3;
    const target = clamp(aim, -0.62, 0.62);
    ball.z = TOP + plan.contact;
    ball.vx = plan.vx;
    ball.vz = plan.vz;
    ball.vy = (target - ball.y) / plan.time;
    ball.top = ball.side = 0;
    stage = "live";
    rally = serveRally(server);
    hits = 0;
    toss = null;
    call = null;
    bat.swing = 1;
    sounds.play("bat");
    planReturn(other(server));
  }

  // A return. `offset` is where on the bat the ball hit, -1 to 1 across the table.
  function hit(seat: Side) {
    const bat = bats[seat]!;
    const dir = seat === 0 ? 1 : -1;
    const offset = clamp((ball.y - bat.y) / T.reach, -1, 1);
    const height = ball.z - TOP;
    // The bat's sideways speed at the hit. The computer swings through the ball (it reaches its
    // spot and stops, so the swing is made up here), harder at higher levels.
    const drag = bots[seat] ? (Math.random() * 2 - 1) * play.power * KEY_SPEED : bat.vy;
    const speed = clamp(bots[seat] ? play.power * (0.5 + Math.random() * 0.5) : Math.abs(drag) / KEY_SPEED, 0, 1);
    const smash = height > SMASH_HEIGHT;
    const stretch = Math.abs(offset) > 0.78;
    const shaky = (bots[seat] ? play.wobble : 1) * (1 + speed * 0.6);

    // Where it lands: the edge of the bat angles it, a moving bat drags it along.
    let depth = clamp((smash ? 1.0 : 0.85) + speed * 0.15 + wobble() * 0.12 * shaky, 0.4, 1.6);
    let across = offset * 0.65 + clamp(drag * 0.12, -0.22, 0.22) + wobble() * 0.05 * shaky;
    // How far over the net: lift a low ball, flatten a fast swing, hammer a high one.
    let clearance = smash ? 0.02 : 0.1 + 0.22 * clamp(1 - height / 0.35, 0, 1);
    if (stretch) clearance += 0.14;
    clearance -= speed * 0.08 + Math.min(0.05, hits * 0.003);
    clearance = Math.max(-0.12, clearance + wobble() * (0.025 + 0.04 * speed + (smash ? 0.03 : 0)) * shaky);

    // Wide angles, fast swings, smashes and long rallies all make a shot riskier: it may go into
    // the net, long, or wide.
    const risk = 0.2 * offset * offset + 0.3 * speed + (smash ? 0.15 : 0) + Math.min(0.15, hits * 0.01);
    const slip = (bots[seat] ? play.slip : PERSON_SLIP) + risk * (bots[seat] ? play.wobble : 1) * 0.12;
    if (Math.random() < slip) {
      const miss = Math.random();
      if (miss < 0.4) clearance = -0.04 - Math.random() * 0.05;
      else if (miss < 0.75) depth = HALF_L + 0.05 + Math.random() * 0.2;
      else across = (Math.sign(offset) || 1) * (HALF_W + 0.06 + Math.random() * 0.15);
    }

    const top = smash ? 1 : stretch ? -0.6 : 0.3 + speed * 0.6;
    const side = clamp(drag * 0.6, -1.2, 1.2);
    const pull = G + top * MAGNUS;
    const arc = solveArc(ball.x, height, 0, T.net + R + clearance, dir * depth, R, pull, TOP_SPEED)
      ?? solveArc(ball.x, height, 0, T.net + 0.3, dir * 0.9, R, pull, TOP_SPEED)!;
    const curve = side * CURVE;
    ball.vx = arc.vx;
    ball.vz = arc.vz;
    ball.vy = (across - ball.y) / arc.time - 0.5 * curve * arc.time;
    ball.top = top;
    ball.side = side;

    rally = returned(seat);
    hits++;
    bat.swing = 1;
    sounds.play(smash ? "smash" : "bat");
    const at = pongFieldPoint(ball.x, ball.y);
    sparks.burst(at.x, at.y - Math.max(0, height) * LIFT, COLORS.ballHi, smash ? 6 : 3);
    if (smash) say("Smash", 0.7);
    else if (hits >= 10 && hits % 10 === 0) say(`Rally ${hits}`, 1);
    planReturn(other(seat));
  }

  // The computer guesses where the ball will reach its bat (misreading it a little), picks a spot
  // on the bat to angle it away from you, and sets off after a moment.
  function planReturn(seat: Side) {
    if (!bots[seat]) return;
    const guess = predict(seat);
    const misread = (Math.random() * 2 - 1) * play.misread * (1 + Math.abs(ball.vx) / 8 + Math.abs(ball.side) * 0.5);
    const away = -Math.sign(bats[other(seat)]!.y || Math.random() - 0.5);
    const sign = Math.random() < 0.7 ? away : Math.sign(Math.random() - 0.5);
    const offset = sign * play.aim * (0.4 + Math.random() * 0.6);
    plans[seat] = {
      target: clamp((guess ?? 0) - offset * T.reach + misread, -BAT_RANGE, BAT_RANGE),
      wait: play.react + Math.random() * 0.06,
      chasing: true,
    };
  }

  // Where the ball will cross `seat`'s bat, flying the same physics on a copy (ignoring the rules).
  function predict(seat: Side) {
    const copy = { ...ball };
    for (let i = 0; i < 1200; i++) {
      const touch = advance(copy, 0.004);
      if (touch?.kind === "plane" && touch.seat === seat) return copy.y;
      if (touch?.kind === "floor") return copy.y;
    }
    return null;
  }

  function moveBat(seat: Side, input: ArcadeInput | undefined, dt: number) {
    const bat = bats[seat]!;
    const before = bat.y;
    if (bots[seat]) {
      const plan = plans[seat]!;
      const coming = stage === "live" && plan.chasing && Math.sign(ball.vx) === sideOf(seat);
      if (!coming) plan.chasing = false;
      if (coming && plan.wait > 0) plan.wait -= dt;
      else {
        const goal = coming ? plan.target : 0;
        const top = coming ? play.speed : play.speed * 0.5;
        bat.vy += clamp(clamp((goal - bat.y) * 9, -top, top) - bat.vy, -KEY_ACCEL * dt, KEY_ACCEL * dt);
        bat.y += bat.vy * dt;
      }
    } else {
      // ← → move the bat across the table as the 3D view shows it from behind the near end (+y is
      // to the right there); ↑ ↓ do the same in the flat view, where +y is down.
      const held = input?.held;
      const keys = held ? clamp(Number(held.down) - Number(held.up) + Number(held.right) - Number(held.left), -1, 1) : 0;
      const pointer = pointerModes[seat]!(input, keys !== 0);
      if (pointer) {
        const goal = pongMetres(pointer.x, pointer.y).y;
        bat.y += clamp(goal - bat.y, -POINTER_SPEED * dt, POINTER_SPEED * dt);
      } else {
        bat.vy += clamp(keys * KEY_SPEED - bat.vy, -KEY_ACCEL * dt, KEY_ACCEL * dt);
        bat.y += bat.vy * dt;
      }
    }
    bat.y = clamp(bat.y, -BAT_RANGE, BAT_RANGE);
    bat.vy = dt > 0 ? (bat.y - before) / dt : 0;

    // The bat rises and falls to meet the ball as it comes, and rests just above the table.
    const coming = stage === "live" && Math.sign(ball.vx) === sideOf(seat) && Math.abs(ball.x) > 0.4;
    const serving = seat === server && (stage === "hold" || stage === "toss");
    const goalZ = coming ? clamp(ball.z, TOP - 0.05, TOP + 0.7) : serving ? TOP + (toss?.contact ?? 0.18) : REST_Z;
    bat.z += (goalZ - bat.z) * Math.min(1, dt * (coming ? 14 : 6));
    bat.swing = Math.max(0, bat.swing - dt / 0.25);
  }

  function settle(next: Call) {
    if (next.kind === "play") {
      rally = next.rally;
      return;
    }
    stage = "dead";
    clock = 0;
    if (next.kind === "let") {
      replay = true;
      say("Let: serve again", DEAD_TIME);
      return;
    }
    replay = false;
    const { winner, reason } = next;
    score[winner]++;
    longest = Math.max(longest, hits);
    shake.kick(1);
    const words = POINT_WORDS[reason];
    const whose = names[winner] === "You" ? "your point" : `${names[winner]}'s point`;
    say(words ? `${words} · ${whose}` : whose[0]!.toUpperCase() + whose.slice(1), DEAD_TIME);
    if (hits >= 5) sounds.play("clap");
  }

  // After the ball has dropped: the next serve, or the end of the game.
  function nextPoint() {
    const winner = winnerOf(score);
    if (winner !== null) {
      const youLost = bots[winner] && !bots[other(winner)];
      phase = youLost ? "over" : "won";
      sounds.play(youLost ? "lose" : "win");
      return;
    }
    if (!replay) server = serverAt(score, first);
    replay = false;
    call = scoreCall(score, names);
    stage = "hold";
    clock = 0;
    rally = serveRally(server);
    hits = 0;
    holdBall();
  }

  function fly(dt: number) {
    const total = dt * pace();
    const steps = Math.max(1, Math.ceil(total / STEP));
    for (let i = 0; i < steps; i++) {
      if (stage === "toss") {
        ball.y = bats[server]!.y;
        advance(ball, total / steps);
        if (ball.vz < 0 && ball.z - TOP <= toss!.contact) strikeServe();
        continue;
      }
      const touch = advance(ball, total / steps);
      if (!touch) continue;
      if (stage !== "live") {
        // The point's over, but the ball still clatters off the table and the floor.
        if ((touch.kind === "table" || touch.kind === "floor") && Math.abs(ball.vz) > 0.8) sounds.play(touch.kind);
        continue;
      }
      if (touch.kind === "net") {
        rally = touchNet(rally);
        sounds.play("net");
      } else if (touch.kind === "table") {
        marks = [...marks.slice(-3), { x: ball.x, y: ball.y, age: 0 }];
        sounds.play("table");
        settle(bounce(rally, touch.side));
      } else if (touch.kind === "floor") {
        sounds.play("floor");
        settle(reachFloor(rally));
      } else if (touch.seat !== rally.hitter) {
        const bat = bats[touch.seat]!;
        const reach = Math.abs(ball.y - bat.y);
        const height = ball.z - TOP;
        if (canReturn(rally, touch.seat) && reach <= T.reach && height > -0.1 && height < 1) hit(touch.seat);
        else {
          // Past the bat: a good ball they missed, or one that was going out. The ball flies on.
          if (reach < T.reach * 1.8) bat.swing = 0.6; // a lunge that misses
          settle(reachFloor(rally));
        }
      }
      if (stage === "live" && (Math.abs(ball.x) > 5 || Math.abs(ball.y) > 4)) settle(reachFloor(rally));
    }
    if (stage === "dead" && ball.z <= R + 0.001 && Math.abs(ball.vz) < 0.3) ball.vz = 0;
  }

  holdBall();

  // The ball as the players should see it now: for guests, carried on from the last snapshot.
  function shownBall(): Ball {
    if (!remoteAt || stage !== "live") return ball;
    const lead = Math.min(0.06, (performance.now() - remoteAt) / 1000) * pace();
    const pull = G + ball.top * MAGNUS;
    return { ...ball, x: ball.x + ball.vx * lead, y: ball.y + ball.vy * lead, z: Math.max(R, ball.z + ball.vz * lead - 0.5 * pull * lead * lead) };
  }

  return {
    update(inputs, dt) {
      sparks.update(dt);
      shake.update(dt);
      if (message) {
        message.time -= dt;
        if (message.time <= 0) message = null;
      }
      for (const mark of marks) mark.age += dt;
      marks = marks.filter((mark) => mark.age < 1.4);
      if (phase === "over" || phase === "won") return;

      moveBat(0, inputs[0], dt);
      moveBat(1, inputs[1], dt);

      if (phase === "ready") {
        holdBall();
        if (!startPressed(inputs)) return;
        phase = "playing";
        sounds.play("start");
        if (!bots[server]) startToss();
        return;
      }

      if (stage === "hold") {
        holdBall();
        clock += dt;
        const wants = bots[server]
          ? clock > BOT_SERVE_AFTER
          : pressed(inputs[server], "action") || pressed(inputs[server], "start") || clock > AUTO_SERVE;
        if (wants) startToss();
        return;
      }
      fly(dt);
      if (stage === "dead") {
        clock += dt;
        if (clock > DEAD_TIME) nextPoint();
      }
    },

    draw(ctx, time) {
      ctx.save();
      shake.apply(ctx);
      drawFloor(ctx);
      drawTableTop(ctx, TX, TY, TW, TH);
      px(ctx, COLORS.centre, TX + 1, TY + TH / 2, TW - 2, 1);
      drawNumber(ctx, score[0], W / 2 - 14, TY + 8, { scale: 4, color: COLORS.score, align: "right" });
      drawNumber(ctx, score[1], W / 2 + 14, TY + 8, { scale: 4, color: COLORS.score, align: "left" });
      if (hits >= 4 && stage === "live") drawNumber(ctx, hits, W / 2, TY + TH - 12, { scale: 1, color: COLORS.score, align: "center" });

      // Where the ball landed, fading.
      for (const mark of marks) {
        const at = pongFieldPoint(mark.x, mark.y);
        ctx.globalAlpha = Math.max(0, 0.7 - mark.age / 2);
        px(ctx, COLORS.line, at.x - 1, at.y, 3, 1);
        px(ctx, COLORS.line, at.x, at.y - 1, 1, 3);
      }
      ctx.globalAlpha = 1;

      // The net: its shadow, the white tape along the top, and a post clamped on each side.
      px(ctx, COLORS.netShadow, W / 2 + 1, TY + 1, 2, TH - 2);
      px(ctx, COLORS.netTape, W / 2 - 1, TY - 3, 2, TH + 6);
      px(ctx, COLORS.post, W / 2 - 2, TY - 6, 4, 4);
      px(ctx, COLORS.postMetal, W / 2 - 1, TY - 5, 2, 1);
      px(ctx, COLORS.post, W / 2 - 2, TY + TH + 2, 4, 4);
      px(ctx, COLORS.postMetal, W / 2 - 1, TY + TH + 3, 2, 1);

      bats.forEach((bat, seat) => {
        const at = pongFieldPoint(sideOf(seat) * T.batX, bat.y);
        const lunge = Math.round(bat.swing * 3) * -sideOf(seat);
        // At the far ends of its reach the bat would hang off the screen: keep it in view.
        const top = clamp(at.y - BAT_PIXELS / 2, 1, H - BAT_PIXELS - 1);
        drawBat(ctx, at.x - BAT_THICK / 2 + lunge, top, true, seat, sideOf(seat) as -1 | 1, BAT_PIXELS);
      });

      const shown = shownBall();
      const at = pongFieldPoint(shown.x, shown.y);
      const lift = Math.max(0, shown.z - TOP - R) * LIFT;
      if (!reducedMotion && stage === "live") {
        trail = [...trail.slice(-3), { x: at.x, y: at.y - lift }];
        trail.forEach((point, index) => {
          ctx.globalAlpha = 0.12 * (index + 1);
          px(ctx, COLORS.ballHi, point.x - 0.5, point.y - 0.5, 2, 2);
        });
        ctx.globalAlpha = 1;
      } else trail = [];
      const ended = phase === "over" || phase === "won";
      // The ball blinks in the server's hand.
      const blink = stage === "hold" && phase === "playing" && !reducedMotion && Math.floor(time * 4) % 2 === 1;
      if (!ended && !blink) drawBall(ctx, at.x - 1.5, at.y - 1.5, lift);
      sparks.draw(ctx);
      ctx.restore();
    },

    phase: () => phase,
    score: () => score[0],
    hud: () =>
      [0, 1].map((seat): HudItem => ({
        label: names[seat]!,
        value: String(score[seat]),
        seat,
        badge: (stage === "hold" || stage === "toss") && server === seat && phase === "playing" ? "serve" : undefined,
      })),
    hint: () => {
      if (message) return message.text;
      if (phase !== "playing" || stage !== "hold") return null;
      const serve = bots[server] ? null : `${possessive(server)} serve: press Space or tap`;
      return [call, serve].filter(Boolean).join(" · ") || null;
    },
    headline: () => {
      const winner = score[0] > score[1] ? 0 : 1;
      return bots[winner] && !bots[other(winner)] ? "Game over" : winsLine(names[winner]!);
    },
    result: () => {
      const winner = score[0] > score[1] ? 0 : 1;
      const rallyLine = longest >= 3 ? ` Longest rally: ${longest} hits.` : "";
      return `${names[winner]} won ${score[winner]} to ${score[other(winner)]}.${rallyLine}`;
    },

    view: (): SinglesView => {
      const shown = shownBall();
      return {
        kind: "pong",
        phase,
        score: [score[0], score[1]],
        server,
        serving: stage === "hold" || stage === "toss",
        rally: hits,
        call: message?.text ?? call,
        ball: {
          x: shown.x, y: shown.y, z: shown.z, vx: shown.vx, vy: shown.vy, vz: shown.vz, topspin: shown.top, sidespin: shown.side,
          visible: phase !== "over" && phase !== "won",
        },
        bats: bats.map((bat) => ({ y: bat.y, z: bat.z, swing: bat.swing })),
        marks,
      };
    },

    snapshot: () => {
      const mm = (n: number) => Math.round(n * 1000) / 1000;
      return {
        p: phase,
        s: score,
        v: server,
        g: stage,
        b: [ball.x, ball.y, ball.z, ball.vx, ball.vy, ball.vz, ball.top, ball.side].map(mm),
        r: [rally.hitter, rally.serve ? 1 : 0, rally.ownBounce ? 1 : 0, rally.farBounces, rally.net ? 1 : 0],
        h: hits,
        l: longest,
        k: bats.flatMap((bat) => [mm(bat.y), mm(bat.z), Math.round(bat.swing * 100) / 100]),
        m: marks.flatMap((mark) => [mm(mark.x), mm(mark.y), Math.round(mark.age * 100) / 100]),
        t: message?.text ?? null,
        c: call,
        fx: sounds.drain(),
      };
    },
    restore(snapshot) {
      const data = read.record(snapshot);
      phase = read.phase(data.p, phase);
      const s = read.list(data.s, 2);
      score[0] = read.int(s[0], score[0], 0, 99);
      score[1] = read.int(s[1], score[1], 0, 99);
      server = read.int(data.v, 0, 0, 1) as Side;
      stage = data.g === "hold" || data.g === "toss" || data.g === "live" || data.g === "dead" ? data.g : stage;
      const b = read.list(data.b, 8);
      ball.x = read.num(b[0], ball.x, -6, 6);
      ball.y = read.num(b[1], ball.y, -5, 5);
      ball.z = read.num(b[2], ball.z, 0, 4);
      ball.vx = read.num(b[3], 0, -TOP_SPEED * 1.5, TOP_SPEED * 1.5);
      ball.vy = read.num(b[4], 0, -TOP_SPEED, TOP_SPEED);
      ball.vz = read.num(b[5], 0, -TOP_SPEED, TOP_SPEED);
      ball.top = read.num(b[6], 0, -2, 2);
      ball.side = read.num(b[7], 0, -2, 2);
      const r = read.list(data.r, 5);
      rally = {
        hitter: read.int(r[0], 0, 0, 1) as Side,
        serve: r[1] === 1,
        ownBounce: r[2] === 1,
        farBounces: read.int(r[3], 0, 0, 2),
        net: r[4] === 1,
      };
      hits = read.int(data.h, 0, 0, 999);
      longest = read.int(data.l, 0, 0, 999);
      const k = read.list(data.k, 6);
      bats.forEach((bat, seat) => {
        bat.y = read.num(k[seat * 3], bat.y, -BAT_RANGE, BAT_RANGE);
        bat.z = read.num(k[seat * 3 + 1], bat.z, 0, 2);
        bat.swing = read.num(k[seat * 3 + 2], 0, 0, 1);
      });
      const m = read.list(data.m, 12);
      marks = [];
      for (let i = 0; i + 2 < m.length; i += 3) marks.push({ x: read.num(m[i], 0, -2, 2), y: read.num(m[i + 1], 0, -1, 1), age: read.num(m[i + 2], 0, 0, 5) });
      const text = read.text(data.t);
      message = text ? { text, time: 0.2 } : null;
      call = read.text(data.c);
      remoteAt = performance.now();
      sounds.replay(data.fx);
    },
  };
}
