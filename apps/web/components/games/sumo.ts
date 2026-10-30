// Chair Sumo: office chairs on a round rug. Roll about with the arrow keys (or hold a finger where
// you want to go), dash with your action key (or a quick tap) to ram the others, and stay on the
// rug: the last chair on it wins the round, and the first to win three rounds wins. After a while
// the rug starts to shrink, so nobody can hide at the edge. Two to four players, people or the
// computer.

import {
  SCREEN_H as H, SCREEN_W as W, SEATS, createParticles, createPopups, createShake, createSoundLog, drawText, pressed, px, read,
  seeded, startPressed, winsLine,
  type ArcadeInput, type GameInstance, type GameOptions, type GamePhase, type HudItem,
} from "./arcade-kit";

const CX = W / 2;
const CY = H / 2 + 2;
const RUG = 66;
const MIN_RUG = 30;
const SHRINK_AFTER = 25; // seconds into a round
const SHRINK_RATE = 2.2; // pixels a second
const CHAIR = 6; // radius
const ACCEL = 320;
const FRICTION = 2.2;
const MAX_SPEED = 95;
const DASH = 175;
const DASH_COOLDOWN = 1.1;
const DASH_TIME = 0.22;
const ROUNDS_TO_WIN = 3;
const COUNTDOWN = 2.4;

const FLOOR = { planks: ["#b98a5a", "#b38454", "#bf9262", "#b07f50"], seam: "#8e6640", grain: "#a87a4c" };
const RUG_COLORS = { field: "#9c4535", border: "#e8dcc2", ring: "#6e2c22", pattern: "#c9784f", fringe: "#efe5cf" };

const rand = seeded(57);
// Oak planks: rows 8 px tall, each plank a random length and shade.
const PLANKS: { x: number; y: number; w: number; c: number }[] = [];
for (let y = 0; y < H; y += 8) {
  let x = -Math.floor(rand() * 40);
  while (x < W) {
    const w = 34 + Math.floor(rand() * 40);
    PLANKS.push({ x, y, w, c: Math.floor(rand() * FLOOR.planks.length) });
    x += w;
  }
}
const GRAIN = Array.from({ length: 260 }, () => ({ x: Math.floor(rand() * W), y: Math.floor(rand() * H), w: 2 + Math.floor(rand() * 5) }));

// Where the chairs start: around the rug, facing the middle.
const STARTS = [
  { x: CX - 40, y: CY },
  { x: CX + 40, y: CY },
  { x: CX, y: CY - 40 },
  { x: CX, y: CY + 40 },
];

type Chair = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number;
  cooldown: number;
  dashing: number;
  falling: number; // 0 on the rug; counts up to 1 as it tips off the edge
  out: boolean;
  touch: { at: number; x: number; y: number; moved: boolean } | null;
};

// What the 3D room (sumo-3d.ts) draws, read without changing anything. Screen pixels, like the
// rest of this file. `countdown` is the seconds left before a round starts.
export type SumoView = {
  kind: "sumo";
  phase: GamePhase;
  chairs: readonly { x: number; y: number; facing: number; out: boolean; dashing: boolean; falling: number }[];
  rug: number;
  countdown: number;
  wins: readonly number[];
};

// The room's measurements and colours, for the 3D room to match the flat one.
export const SUMO_LAYOUT = { cx: CX, cy: CY, rug: RUG, minRug: MIN_RUG, chair: CHAIR, countdownStep: 0.8, floor: FLOOR, rugColors: RUG_COLORS } as const;

export function createSumo({ reducedMotion, sound, seats }: GameOptions): GameInstance {
  const count = Math.max(2, seats.length);
  const names = Array.from({ length: count }, (_, index) => seats[index]?.name ?? `Computer ${index}`);
  const bots = Array.from({ length: count }, (_, index) => seats[index]?.bot ?? true);
  let phase: GamePhase = "ready";
  const wins = names.map(() => 0);
  let chairs: Chair[] = [];
  let rug = RUG;
  let roundTime = 0;
  let countdown = 0;
  let between = 0; // pause after a round is decided
  let message: { text: string; time: number } | null = null;
  let clock = 0;
  const sounds = createSoundLog(sound);
  const sparks = createParticles(!reducedMotion);
  const shake = createShake(!reducedMotion);
  const popups = createPopups(reducedMotion);

  const say = (text: string, time = 1.6) => {
    message = { text, time };
  };

  function newRound() {
    chairs = STARTS.slice(0, count).map((start) => ({
      ...start,
      vx: 0,
      vy: 0,
      facing: Math.atan2(CY - start.y, CX - start.x),
      cooldown: 0.5,
      dashing: 0,
      falling: 0,
      out: false,
      touch: null,
    }));
    rug = RUG;
    roundTime = 0;
    countdown = COUNTDOWN;
    between = 0;
  }

  function dash(chair: Chair) {
    if (chair.cooldown > 0 || chair.out) return;
    chair.vx += Math.cos(chair.facing) * DASH;
    chair.vy += Math.sin(chair.facing) * DASH;
    chair.cooldown = DASH_COOLDOWN;
    chair.dashing = DASH_TIME;
    sounds.play("dash");
  }

  // People: keys push the chair; a finger or held mouse pulls it towards the pointer, and a quick
  // tap dashes.
  function steerPerson(chair: Chair, input: ArcadeInput | undefined, dt: number) {
    let ax = 0;
    let ay = 0;
    if (input) {
      ax = Number(input.held.right) - Number(input.held.left);
      ay = Number(input.held.down) - Number(input.held.up);
      if (pressed(input, "action")) dash(chair);
      const pointer = input.pointer;
      if (pointer?.down) {
        if (!chair.touch) chair.touch = { at: clock, x: pointer.x, y: pointer.y, moved: false };
        if (Math.hypot(pointer.x - chair.touch.x, pointer.y - chair.touch.y) > 5) chair.touch.moved = true;
        const dx = pointer.x - chair.x;
        const dy = pointer.y - chair.y;
        if (Math.hypot(dx, dy) > 4) {
          ax = dx;
          ay = dy;
        }
      } else if (chair.touch) {
        if (!chair.touch.moved && clock - chair.touch.at < 0.3) dash(chair);
        chair.touch = null;
      }
    }
    push(chair, ax, ay, dt);
  }

  // The computer goes for whoever's nearest (aiming where they're heading), backs off the edge,
  // and dashes when it's lined up and close.
  function steerBot(chair: Chair, index: number, dt: number) {
    const fromCenter = Math.hypot(chair.x - CX, chair.y - CY);
    let target: Chair | null = null;
    let best = Infinity;
    chairs.forEach((other, otherIndex) => {
      if (otherIndex === index || other.out) return;
      const d = Math.hypot(other.x - chair.x, other.y - chair.y);
      if (d < best) {
        best = d;
        target = other;
      }
    });
    let ax = CX - chair.x;
    let ay = CY - chair.y;
    if (target && fromCenter < rug * 0.72) {
      const t = target as Chair;
      ax = t.x + t.vx * 0.25 - chair.x;
      ay = t.y + t.vy * 0.25 - chair.y;
      // Line up from the middle side so the push sends them outward.
      ax += (t.x - CX) * 0.15;
      ay += (t.y - CY) * 0.15;
      const facing = Math.atan2(t.y - chair.y, t.x - chair.x);
      const lined = Math.cos(facing - chair.facing) > 0.9;
      if (best < 26 && lined && Math.random() < 0.08) dash(chair);
    }
    push(chair, ax, ay, dt, 0.85);
  }

  function push(chair: Chair, ax: number, ay: number, dt: number, strength = 1) {
    const length = Math.hypot(ax, ay);
    if (length > 0.01) {
      chair.vx += (ax / length) * ACCEL * strength * dt;
      chair.vy += (ay / length) * ACCEL * strength * dt;
      chair.facing = Math.atan2(ay, ax);
    }
  }

  function physics(dt: number) {
    for (const chair of chairs) {
      if (chair.out) continue;
      chair.cooldown = Math.max(0, chair.cooldown - dt);
      chair.dashing = Math.max(0, chair.dashing - dt);
      const damping = Math.exp(-FRICTION * dt);
      chair.vx *= damping;
      chair.vy *= damping;
      const speed = Math.hypot(chair.vx, chair.vy);
      const limit = chair.dashing > 0 ? DASH + MAX_SPEED : MAX_SPEED;
      if (speed > limit) {
        chair.vx *= limit / speed;
        chair.vy *= limit / speed;
      }
      chair.x += chair.vx * dt;
      chair.y += chair.vy * dt;
    }
    // Chairs bump off each other; a dashing chair hits harder.
    for (let i = 0; i < chairs.length; i++) {
      for (let j = i + 1; j < chairs.length; j++) {
        const a = chairs[i]!;
        const b = chairs[j]!;
        if (a.out || b.out) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy) || 0.01;
        if (distance >= CHAIR * 2) continue;
        const nx = dx / distance;
        const ny = dy / distance;
        const overlap = CHAIR * 2 - distance;
        a.x -= (nx * overlap) / 2;
        a.y -= (ny * overlap) / 2;
        b.x += (nx * overlap) / 2;
        b.y += (ny * overlap) / 2;
        const closing = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (closing <= 0) continue;
        const ma = a.dashing > 0 ? 1.8 : 1;
        const mb = b.dashing > 0 ? 1.8 : 1;
        const impulse = (2.15 * closing) / (1 / ma + 1 / mb);
        a.vx -= (impulse / ma) * nx;
        a.vy -= (impulse / ma) * ny;
        b.vx += (impulse / mb) * nx;
        b.vy += (impulse / mb) * ny;
        sounds.play("bump");
        if (closing > 80) shake.kick(1);
        sparks.burst(a.x + nx * CHAIR, a.y + ny * CHAIR, "#d8d2c4", 4, 30);
      }
    }
    // Off the rug: the chair tips over the edge.
    chairs.forEach((chair, index) => {
      if (chair.out) {
        chair.falling = Math.min(1, chair.falling + dt * 2);
        return;
      }
      if (Math.hypot(chair.x - CX, chair.y - CY) > rug + 2) {
        chair.out = true;
        sounds.play("fall");
        popups.add("x", chair.x, chair.y - 10, SEATS[index]!.light);
      }
    });
  }

  function decide() {
    const left = chairs.map((chair, index) => (chair.out ? -1 : index)).filter((index) => index >= 0);
    const peopleLeft = left.some((index) => !bots[index]);
    const peoplePlaying = bots.some((bot) => !bot);
    if (left.length > 1 && (peopleLeft || !peoplePlaying)) return;
    if (left.length > 1) {
      // Every person is off the rug: the round goes to the computer chair nearest the middle.
      left.sort((a, b) => Math.hypot(chairs[a]!.x - CX, chairs[a]!.y - CY) - Math.hypot(chairs[b]!.x - CX, chairs[b]!.y - CY));
    }
    const winner = left[0];
    between = 2;
    if (winner === undefined) {
      say("Nobody stayed on. Again!");
      return;
    }
    wins[winner]!++;
    if (wins[winner]! >= ROUNDS_TO_WIN) {
      const peopleOnly = bots.every((bot) => !bot);
      phase = bots[winner] && !peopleOnly ? "over" : "won";
      sounds.play(phase === "won" ? "win" : "lose");
      return;
    }
    sounds.play("score");
    say(`${names[winner] === "You" ? "You win" : `${names[winner]} wins`} the round!`);
  }

  newRound();

  return {
    update(inputs, dt) {
      clock += dt;
      sparks.update(dt);
      shake.update(dt);
      popups.update(dt);
      if (message) {
        message.time -= dt;
        if (message.time <= 0) message = null;
      }
      if (phase === "over" || phase === "won") return;
      if (phase === "ready") {
        if (!startPressed(inputs)) return;
        phase = "playing";
        sounds.play("start");
        newRound();
      }

      if (countdown > 0) {
        const before = Math.ceil(countdown / 0.8);
        countdown -= dt;
        if (Math.ceil(countdown / 0.8) !== before) sounds.play(countdown > 0 ? "tick" : "start");
        for (const chair of chairs) chair.touch = null;
        return;
      }

      if (between > 0) {
        between -= dt;
        physics(dt);
        if (between <= 0) newRound();
        return;
      }

      roundTime += dt;
      if (roundTime > SHRINK_AFTER && rug > MIN_RUG) {
        if (rug === RUG) say("The rug is shrinking!");
        rug = Math.max(MIN_RUG, rug - SHRINK_RATE * dt);
      }
      chairs.forEach((chair, index) => {
        if (chair.out) return;
        if (bots[index]) steerBot(chair, index, dt);
        else steerPerson(chair, inputs[index], dt);
      });
      physics(dt);
      decide();
    },

    draw(ctx) {
      ctx.save();
      shake.apply(ctx);
      // Oak floorboards.
      for (const plank of PLANKS) {
        px(ctx, FLOOR.planks[plank.c]!, plank.x, plank.y, plank.w, 8);
        px(ctx, FLOOR.seam, plank.x, plank.y, 1, 8);
        px(ctx, FLOOR.seam, plank.x, plank.y + 7, plank.w, 1);
      }
      for (const grain of GRAIN) px(ctx, FLOOR.grain, grain.x, grain.y, grain.w, 1);

      drawRug(ctx, rug);

      // Chairs that fell off lie tipped on the floor, faded.
      chairs.forEach((chair, index) => {
        if (chair.out) drawChair(ctx, chair, index, 0.35 + (1 - chair.falling) * 0.4);
      });
      chairs.forEach((chair, index) => {
        if (!chair.out) drawChair(ctx, chair, index, 1);
      });

      if (phase === "playing" && countdown > 0) {
        const n = Math.ceil(countdown / 0.8);
        drawText(ctx, String(n), CX + 1, CY - 9, { scale: 4, color: "rgba(0,0,0,0.35)", align: "center" });
        drawText(ctx, String(n), CX, CY - 10, { scale: 4, color: "#fffdf6", align: "center" });
      }
      // Round wins as little cushions in each corner.
      names.forEach((_, index) => {
        const right = index % 2 === 1;
        const bottom = index >= 2;
        for (let win = 0; win < ROUNDS_TO_WIN; win++) {
          const x = right ? W - 8 - win * 6 : 4 + win * 6;
          const y = bottom ? H - 8 : 4;
          px(ctx, win < wins[index]! ? SEATS[index]!.color : "rgba(0,0,0,0.25)", x, y, 4, 4);
        }
      });
      sparks.draw(ctx);
      popups.draw(ctx);
      ctx.restore();
    },

    phase: () => phase,
    score: () => wins[0]!,
    hud: () => names.map((name, index): HudItem => ({ label: name, value: String(wins[index]), seat: index, out: chairs[index]?.out ?? false })),
    hint: () => message?.text ?? (phase === "playing" && countdown <= 0 && between <= 0 && clock < 6 ? "Dash: your action key or a quick tap" : null),
    headline: () => {
      const winner = wins.findIndex((count) => count >= ROUNDS_TO_WIN);
      if (winner < 0) return "Game over";
      return bots[winner] && bots.some((bot) => !bot) ? "Game over" : winsLine(names[winner]!);
    },
    result: () => names.map((name, index) => `${name} ${wins[index]}`).join(", ") + " rounds.",
    view: (): SumoView => ({
      kind: "sumo",
      phase,
      chairs: chairs.map((chair) => ({ x: chair.x, y: chair.y, facing: chair.facing, out: chair.out, dashing: chair.dashing > 0, falling: chair.falling })),
      rug,
      countdown: phase === "playing" ? countdown : 0,
      wins,
    }),

    snapshot: () => ({
      p: phase,
      w: wins,
      c: chairs.map((chair) => [Math.round(chair.x * 10) / 10, Math.round(chair.y * 10) / 10, Math.round(chair.facing * 100) / 100, chair.out ? 1 : 0, chair.dashing > 0 ? 1 : 0, Math.round(chair.falling * 10) / 10]),
      r: Math.round(rug * 10) / 10,
      k: Math.round(countdown * 100) / 100,
      m: message?.text ?? null,
      fx: sounds.drain(),
    }),
    restore(snapshot) {
      const data = read.record(snapshot);
      phase = read.phase(data.p, phase);
      read.list(data.w, count).forEach((value, index) => (wins[index] = read.int(value, wins[index], 0, ROUNDS_TO_WIN)));
      const list = read.list(data.c, count);
      if (list.length === count) {
        chairs = list.map((value, index) => {
          const [x, y, facing, out, dashing, falling] = read.list(value, 6);
          const chair = chairs[index] ?? { vx: 0, vy: 0, cooldown: 0, touch: null };
          return {
            ...chair,
            x: read.num(x, CX, -20, W + 20),
            y: read.num(y, CY, -20, H + 20),
            vx: 0,
            vy: 0,
            facing: read.num(facing, 0, -10, 10),
            out: out === 1,
            dashing: dashing === 1 ? DASH_TIME : 0,
            falling: read.num(falling, 0, 0, 1),
            cooldown: 0,
            touch: null,
          } as Chair;
        });
      }
      rug = read.num(data.r, RUG, MIN_RUG, RUG);
      countdown = read.num(data.k, 0, 0, COUNTDOWN);
      const text = read.text(data.m);
      message = text ? { text, time: 0.2 } : null;
      sounds.replay(data.fx);
    },
  };
}

// A round wool rug: a terracotta field, a darker ring, a cream border with a fringe, and a
// medallion in the middle.
function drawRug(ctx: CanvasRenderingContext2D, radius: number) {
  ctx.globalAlpha = 0.3;
  circle(ctx, CX + 2, CY + 3, radius + 2, "#3a2a1c");
  ctx.globalAlpha = 1;
  circle(ctx, CX, CY, radius + 1, RUG_COLORS.fringe);
  circle(ctx, CX, CY, radius, RUG_COLORS.border);
  circle(ctx, CX, CY, radius - 4, RUG_COLORS.field);
  if (radius > 24) ring(ctx, CX, CY, radius - 9, RUG_COLORS.ring);
  if (radius > 34) {
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      px(ctx, RUG_COLORS.pattern, CX + Math.cos(angle) * (radius - 18) - 1, CY + Math.sin(angle) * (radius - 18) - 1, 3, 3);
    }
  }
  circle(ctx, CX, CY, 12, RUG_COLORS.border);
  circle(ctx, CX, CY, 9, RUG_COLORS.ring);
  circle(ctx, CX, CY, 5, RUG_COLORS.pattern);
}

// A chair seen from above: five castors on a star base, the seat in its colour with a shine, and
// the backrest behind (opposite the way it's facing). A dashing chair leaves a puff behind it.
function drawChair(ctx: CanvasRenderingContext2D, chair: Chair, seat: number, alpha: number) {
  const colors = SEATS[seat]!;
  const scale = 1 - chair.falling * 0.35;
  ctx.globalAlpha = alpha * 0.35;
  circle(ctx, chair.x + 2, chair.y + 2, CHAIR * scale, "#2a1f15");
  ctx.globalAlpha = alpha;
  for (let leg = 0; leg < 5; leg++) {
    const angle = chair.facing + (leg / 5) * Math.PI * 2 + 0.3;
    px(ctx, "#2b2d31", chair.x + Math.cos(angle) * (CHAIR + 1) * scale - 1, chair.y + Math.sin(angle) * (CHAIR + 1) * scale - 1, 2, 2);
  }
  circle(ctx, chair.x, chair.y, (CHAIR - 1) * scale, colors.dark);
  circle(ctx, chair.x, chair.y, (CHAIR - 2) * scale, colors.color);
  px(ctx, colors.light, chair.x - 2 * scale, chair.y - 2 * scale, 2, 1);
  for (let i = -3; i <= 3; i++) {
    const angle = chair.facing + Math.PI + i * 0.28;
    px(ctx, colors.dark, chair.x + Math.cos(angle) * (CHAIR - 0.5) * scale - 1, chair.y + Math.sin(angle) * (CHAIR - 0.5) * scale - 1, 2, 2);
  }
  if (chair.dashing > 0 && !chair.out) {
    ctx.globalAlpha = alpha * 0.6;
    px(ctx, "#fffdf6", chair.x - Math.cos(chair.facing) * (CHAIR + 4) - 1, chair.y - Math.sin(chair.facing) * (CHAIR + 4) - 1, 3, 3);
  }
  ctx.globalAlpha = 1;
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string) {
  ctx.fillStyle = color;
  const r = Math.max(0, radius);
  for (let dy = -Math.floor(r); dy <= Math.floor(r); dy++) {
    const half = Math.floor(Math.sqrt(r * r - dy * dy));
    ctx.fillRect(Math.round(x - half), Math.round(y + dy), half * 2 + 1, 1);
  }
}

function ring(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string) {
  ctx.fillStyle = color;
  for (let i = 0; i < 160; i++) {
    const angle = (i / 160) * Math.PI * 2;
    ctx.fillRect(Math.round(x + Math.cos(angle) * radius), Math.round(y + Math.sin(angle) * radius), 1, 1);
  }
}
