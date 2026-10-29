// Snake on the office carpet. Collect mugs of coffee to grow; a donut is worth three; an espresso
// gives you a burst of speed. Avoid the walls, the potted plants, chairs and boxes on the floor,
// and every snake's body. Alone you play for points. With two to four snakes (people or the
// computer), the last one moving wins, and a snake that crashes turns into coffee beans.

import {
  PAL, SCREEN_H as H, SCREEN_W as W, createParticles, createPopups, createShake, createSoundLog, px, read, seeded, startPressed, winsLine,
  type ArcadeInput, type Direction, type GameInstance, type GameOptions, type GamePhase, type HudItem,
} from "./arcade-kit";

const CELL = 10;
const COLS = W / CELL;
const ROWS = H / CELL;
const START_RATE = 7; // steps per second
const MAX_RATE = 14;
const BOOST = 1.7;
const SWIPE = 6; // screen pixels a finger moves before it counts as a swipe
const QUEUE = 3;
const TILE = 40; // carpet tiles

const STEP: Record<Direction, { x: number; y: number }> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
const OPPOSITE: Record<Direction, Direction> = { up: "down", down: "up", left: "right", right: "left" };
const DIRECTIONS: Direction[] = ["up", "down", "left", "right"];

const CARPET = { tiles: ["#5c6169", "#5f646c"], seam: "#565a62", flecks: ["#555a62", "#686d75", "#62666e"] };
// By seat: a corn snake, a California king snake, a blue racer and a grass snake.
// outline, scales, pattern, the light along the back, head, and how the pattern repeats.
const SKINS = [
  { outline: "#5e1f0c", body: "#d4602f", pattern: "#9e3518", light: "#f08a5d", head: "#c4552a", bands: false },
  { outline: "#0e0f11", body: "#24262a", pattern: "#efe6cc", light: "#45484f", head: "#1c1d20", bands: true },
  { outline: "#1f324f", body: "#4a6f9e", pattern: "#34507a", light: "#7d9cc4", head: "#41658f", bands: false },
  { outline: "#2e4a1d", body: "#5e8c3a", pattern: "#47702b", light: "#86b05c", head: "#567f35", bands: false },
] as const;
const MUG = { cup: "#f2f0eb", shade: "#d6d2c9", rim: "#9d978c", coffee: "#4a2c1d", crema: "#8a5a3b", steam: "rgba(255, 255, 255, 0.55)" };

const rand = seeded(41);
const FLECKS = Array.from({ length: 480 }, () => ({ x: Math.floor(rand() * W), y: Math.floor(rand() * H), c: Math.floor(rand() * 3) }));

type Cell = { x: number; y: number };
type ItemKind = "mug" | "donut" | "espresso" | "bean";
type Item = { kind: ItemKind; cell: Cell; life: number };
type Snake = {
  body: Cell[];
  heading: Direction;
  queue: Direction[];
  points: number;
  dead: boolean;
  grow: number;
  clock: number;
  boost: number;
  swipeFrom: { x: number; y: number } | null;
};

// Furniture on the carpet: plants (2 x 2 cells), chairs (1 cell) and boxes (2 x 1), kept off the
// lanes the snakes start in.
type Obstacle = { kind: "plant" | "chair" | "box"; x: number; y: number; w: number; h: number };
const OBSTACLES: Obstacle[] = [
  { kind: "plant", x: 9, y: 6, w: 2, h: 2 },
  { kind: "plant", x: 14, y: 8, w: 2, h: 2 },
  { kind: "chair", x: 7, y: 10, w: 1, h: 1 },
  { kind: "chair", x: 16, y: 5, w: 1, h: 1 },
  { kind: "box", x: 11, y: 1, w: 2, h: 1 },
  { kind: "box", x: 11, y: 14, w: 2, h: 1 },
];
const BLOCKED = new Set(OBSTACLES.flatMap((o) => Array.from({ length: o.w * o.h }, (_, i) => (o.y + Math.floor(i / o.w)) * COLS + o.x + (i % o.w))));

// Where each snake starts: head first, and which way it's going.
const STARTS: { cells: Cell[]; heading: Direction }[] = [
  { cells: [6, 5, 4, 3].map((x) => ({ x, y: 3 })), heading: "right" },
  { cells: [17, 18, 19, 20].map((x) => ({ x, y: 12 })), heading: "left" },
  { cells: [6, 5, 4, 3].map((y) => ({ x: 20, y })), heading: "down" },
  { cells: [9, 10, 11, 12].map((y) => ({ x: 3, y })), heading: "up" },
];
const SOLO_START = { cells: [7, 6, 5, 4].map((x) => ({ x, y: 11 })), heading: "right" as Direction };

const key = (cell: Cell) => cell.y * COLS + cell.x;
const inside = (cell: Cell) => cell.x >= 0 && cell.y >= 0 && cell.x < COLS && cell.y < ROWS;

export function createSnake({ reducedMotion, sound, seats }: GameOptions): GameInstance {
  const count = Math.max(1, seats.length);
  const solo = count === 1;
  let phase: GamePhase = "ready";
  const snakes: Snake[] = (solo ? [SOLO_START] : STARTS.slice(0, count)).map((start) => ({
    body: start.cells.map((cell) => ({ ...cell })),
    heading: start.heading,
    queue: [],
    points: 0,
    dead: false,
    grow: 0,
    clock: 0,
    boost: 0,
    swipeFrom: null,
  }));
  let items: Item[] = [];
  let treatClock = 0;
  let message: { text: string; time: number } | null = null;
  const sounds = createSoundLog(sound);
  const sparks = createParticles(!reducedMotion);
  const shake = createShake(!reducedMotion);
  const popups = createPopups(reducedMotion);

  function taken() {
    const cells = new Set(BLOCKED);
    for (const snake of snakes) for (const cell of snake.body) cells.add(key(cell));
    for (const item of items) cells.add(key(item.cell));
    return cells;
  }

  function place(kind: ItemKind, life = Infinity) {
    const used = taken();
    const free: Cell[] = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (!used.has(y * COLS + x)) free.push({ x, y });
    const cell = free[Math.floor(Math.random() * free.length)];
    if (cell) items.push({ kind, cell, life });
  }

  const mugsWanted = solo ? 1 : 2;
  for (let i = 0; i < mugsWanted; i++) place("mug");

  // Turns wait in a short queue so two quick presses (up then left) both count.
  function turn(snake: Snake, direction: Direction) {
    const last = snake.queue[snake.queue.length - 1] ?? snake.heading;
    if (direction === last || direction === OPPOSITE[last] || snake.queue.length >= QUEUE) return;
    snake.queue.push(direction);
  }

  function steer(snake: Snake, input: ArcadeInput | undefined) {
    if (!input) return;
    for (const press of input.presses) if (press !== "action" && press !== "start") turn(snake, press);
    const pointer = input.pointer;
    if (pointer?.down) {
      if (!snake.swipeFrom) snake.swipeFrom = { x: pointer.x, y: pointer.y };
      const dx = pointer.x - snake.swipeFrom.x;
      const dy = pointer.y - snake.swipeFrom.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) >= SWIPE) {
        turn(snake, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
        snake.swipeFrom = { x: pointer.x, y: pointer.y };
      }
    } else {
      snake.swipeFrom = null;
    }
  }

  // Cells that would kill a snake stepping there now (tails that are about to move are free).
  function deadly() {
    const cells = new Set(BLOCKED);
    for (const snake of snakes) {
      if (snake.dead) continue;
      const body = snake.grow > 0 ? snake.body : snake.body.slice(0, -1);
      for (const cell of body) cells.add(key(cell));
    }
    return cells;
  }

  // How much room there is from a cell, up to a limit: the computer avoids dead ends.
  function room(start: Cell, blocked: Set<number>, limit: number) {
    const seen = new Set([key(start)]);
    const queue = [start];
    while (queue.length > 0 && seen.size < limit) {
      const cell = queue.shift()!;
      for (const direction of DIRECTIONS) {
        const next = { x: cell.x + STEP[direction].x, y: cell.y + STEP[direction].y };
        if (!inside(next) || blocked.has(key(next)) || seen.has(key(next))) continue;
        seen.add(key(next));
        queue.push(next);
      }
    }
    return seen.size;
  }

  // The computer heads for the nearest treat by a safe step with room to spare.
  function think(snake: Snake) {
    const head = snake.body[0]!;
    const blocked = deadly();
    const goal = items.reduce<Item | null>((best, item) => {
      const d = Math.abs(item.cell.x - head.x) + Math.abs(item.cell.y - head.y);
      const value = item.kind === "donut" ? d - 4 : item.kind === "espresso" ? d - 2 : d;
      if (!best) return item;
      const bestD = Math.abs(best.cell.x - head.x) + Math.abs(best.cell.y - head.y) - (best.kind === "donut" ? 4 : best.kind === "espresso" ? 2 : 0);
      return value < bestD ? item : best;
    }, null);
    let choice: Direction = snake.heading;
    let bestScore = -Infinity;
    for (const direction of DIRECTIONS) {
      if (direction === OPPOSITE[snake.heading]) continue;
      const next = { x: head.x + STEP[direction].x, y: head.y + STEP[direction].y };
      if (!inside(next) || blocked.has(key(next))) continue;
      const space = room(next, blocked, snake.body.length + 12);
      const distance = goal ? Math.abs(goal.cell.x - next.x) + Math.abs(goal.cell.y - next.y) : 0;
      const value = (space >= snake.body.length + 4 ? 100 : space * 3) - distance + (direction === snake.heading ? 0.5 : 0) + Math.random() * 0.8;
      if (value > bestScore) {
        bestScore = value;
        choice = direction;
      }
    }
    snake.queue = [];
    if (choice !== snake.heading) snake.queue.push(choice);
  }

  function crash(snake: Snake) {
    snake.dead = true;
    shake.kick(3);
    sounds.play(solo ? "lose" : "fall");
    // A crashed snake leaves coffee beans behind for the others.
    if (!solo) snake.body.forEach((cell, index) => {
      if (index % 2 === 0 && inside(cell) && !BLOCKED.has(key(cell))) items.push({ kind: "bean", cell: { ...cell }, life: 20 });
    });
  }

  function eat(snake: Snake, item: Item, at: Cell) {
    items = items.filter((other) => other !== item);
    const center = { x: at.x * CELL + CELL / 2, y: at.y * CELL };
    if (item.kind === "mug") {
      snake.points += 1;
      snake.grow += 1;
      place("mug");
      sounds.play("eat");
      sparks.burst(center.x, center.y + 5, MUG.crema, 6);
    } else if (item.kind === "donut") {
      snake.points += 3;
      snake.grow += 2;
      popups.add("+3", center.x, center.y, "#ffd1e3");
      sounds.play("power");
    } else if (item.kind === "espresso") {
      snake.boost = 3;
      popups.add("!", center.x, center.y, "#ffe08a");
      sounds.play("power");
    } else {
      snake.points += 1;
      snake.grow += 1;
      sounds.play("tick");
    }
  }

  function stepSnake(index: number) {
    const snake = snakes[index]!;
    if (seats[index]?.bot) think(snake);
    snake.heading = snake.queue.shift() ?? snake.heading;
    const head = snake.body[0]!;
    const next = { x: head.x + STEP[snake.heading].x, y: head.y + STEP[snake.heading].y };
    const blocked = deadly();
    const headOn = snakes.find((other) => other !== snake && !other.dead && other.body[0]!.x === next.x && other.body[0]!.y === next.y);
    if (!inside(next) || blocked.has(key(next))) return crash(snake);
    if (headOn) {
      crash(snake);
      crash(headOn);
      return;
    }
    snake.body.unshift(next);
    if (snake.grow > 0) snake.grow--;
    else snake.body.pop();
    const item = items.find((candidate) => candidate.cell.x === next.x && candidate.cell.y === next.y);
    if (item) eat(snake, item, next);
  }

  // Alone: until you crash. Together: until one snake is left, or every person playing is out
  // (the computer's snakes don't play on by themselves).
  function checkEnd() {
    const alive = snakes.filter((snake) => !snake.dead).length;
    const peopleAlive = snakes.some((snake, index) => !snake.dead && !seats[index]?.bot);
    const peoplePlaying = seats.some((seat) => !seat.bot);
    if (solo ? alive === 0 : alive <= 1) {
      phase = solo ? "over" : "won";
      sounds.play(solo ? "lose" : "win");
    } else if (peoplePlaying && !peopleAlive) {
      phase = "over";
      sounds.play("lose");
    }
  }

  const rate = (snake: Snake) => Math.min(MAX_RATE, START_RATE + snake.points * 0.2) * (snake.boost > 0 ? BOOST : 1);
  const survivors = () => snakes.map((snake, index) => (snake.dead ? -1 : index)).filter((index) => index >= 0);

  return {
    update(inputs, dt) {
      sparks.update(dt);
      shake.update(dt);
      popups.update(dt);
      if (message) {
        message.time -= dt;
        if (message.time <= 0) message = null;
      }
      if (phase === "over" || phase === "won") return;

      snakes.forEach((snake, index) => {
        if (!seats[index]?.bot) steer(snake, inputs[index]);
      });

      if (phase === "ready") {
        const wantsStart = startPressed(inputs) || inputs.some((input) => (input?.presses.length ?? 0) > 0) || snakes.some((snake) => snake.queue.length > 0);
        if (!wantsStart) return;
        phase = "playing";
        sounds.play("start");
        for (const snake of snakes) snake.clock = 1; // first step straight away
      }

      // Treats come and go: a donut now and then, an espresso less often.
      treatClock += dt;
      if (treatClock > 9) {
        treatClock = 0;
        place(Math.random() < 0.6 ? "donut" : "espresso", 6);
        message = { text: "Something tasty appeared!", time: 1.2 };
      }
      items = items.filter((item) => (item.life -= dt) > 0);
      while (items.filter((item) => item.kind === "mug").length < mugsWanted) place("mug");

      for (const [index, snake] of snakes.entries()) {
        if (snake.dead) continue;
        snake.boost = Math.max(0, snake.boost - dt);
        snake.clock += dt * rate(snake);
        while (snake.clock >= 1 && !snake.dead && phase === "playing") {
          snake.clock -= 1;
          stepSnake(index);
        }
      }
      checkEnd();
    },

    draw(ctx, time) {
      ctx.save();
      shake.apply(ctx);
      // Carpet tiles laid in a grid, each with a fleck of colour and a faint seam.
      px(ctx, CARPET.tiles[0]!, -4, -4, W + 8, H + 8);
      for (let y = 0; y < H; y += TILE) for (let x = 0; x < W; x += TILE) px(ctx, CARPET.tiles[(x / TILE + y / TILE) % 2]!, x, y, TILE, TILE);
      for (const fleck of FLECKS) px(ctx, CARPET.flecks[fleck.c]!, fleck.x, fleck.y);
      for (let x = TILE; x < W; x += TILE) px(ctx, CARPET.seam, x, 0, 1, H);
      for (let y = TILE; y < H; y += TILE) px(ctx, CARPET.seam, 0, y, W, 1);

      for (const obstacle of OBSTACLES) drawObstacle(ctx, obstacle);
      const t = reducedMotion ? 0 : time;
      for (const item of items) {
        // Treats about to go blink.
        if (item.life < 2 && !reducedMotion && Math.floor(time * 6) % 2 === 0) continue;
        drawItem(ctx, item, t);
      }
      snakes.forEach((snake, index) => drawSnake(ctx, snake, SKINS[solo ? 3 : index]!, t));
      sparks.draw(ctx);
      popups.draw(ctx);
      ctx.restore();
    },

    phase: () => phase,
    score: () => snakes[0]!.points,
    hud: () =>
      solo
        ? [
            { label: "Points", value: String(snakes[0]!.points) },
            { label: "Length", value: String(snakes[0]!.body.length) },
          ]
        : snakes.map((snake, index): HudItem => ({ label: seats[index]!.name, value: String(snake.points), seat: index, out: snake.dead, badge: snake.boost > 0 ? "fast" : undefined })),
    hint: () => message?.text ?? null,
    headline: () => {
      if (solo) return "Game over";
      const left = survivors();
      if (left.length === 1) return winsLine(seats[left[0]!]!.name);
      return phase === "over" ? "Game over" : "It's a draw";
    },
    result: () => {
      if (solo) {
        const points = snakes[0]!.points;
        return `${points} ${points === 1 ? "point" : "points"}, ${snakes[0]!.body.length} long.`;
      }
      return snakes.map((snake, index) => `${seats[index]!.name} ${snake.points}`).join(", ") + ".";
    },

    snapshot: () => ({
      p: phase,
      i: items.map((item) => [item.kind[0], key(item.cell), item.life < 2 ? 1 : 0]),
      s: snakes.map((snake) => ({ b: snake.body.map(key), h: snake.heading, c: snake.points, d: snake.dead ? 1 : 0, f: snake.boost > 0 ? 1 : 0 })),
      m: message?.text ?? null,
      fx: sounds.drain(),
    }),
    restore(snapshot) {
      const data = read.record(snapshot);
      phase = read.phase(data.p, phase);
      const kinds: Record<string, ItemKind> = { m: "mug", d: "donut", e: "espresso", b: "bean" };
      items = read.list(data.i, 80).flatMap((value) => {
        const [kind, cell, ending] = read.list(value, 3);
        const itemKind = typeof kind === "string" ? kinds[kind] : undefined;
        if (!itemKind) return [];
        const index = read.int(cell, 0, 0, COLS * ROWS - 1);
        return [{ kind: itemKind, cell: { x: index % COLS, y: Math.floor(index / COLS) }, life: ending === 1 ? 1 : 10 }];
      });
      read.list(data.s, snakes.length).forEach((value, index) => {
        const item = read.record(value);
        const snake = snakes[index]!;
        const body = read.list(item.b, COLS * ROWS).map((cell) => read.int(cell, 0, 0, COLS * ROWS - 1));
        if (body.length > 0) snake.body = body.map((cell) => ({ x: cell % COLS, y: Math.floor(cell / COLS) }));
        if (DIRECTIONS.includes(item.h as Direction)) snake.heading = item.h as Direction;
        snake.points = read.int(item.c, snake.points, 0, 9999);
        snake.dead = item.d === 1;
        snake.boost = item.f === 1 ? 1 : 0;
      });
      const text = read.text(data.m);
      message = text ? { text, time: 0.2 } : null;
      sounds.replay(data.fx);
    },
  };
}

// One continuous body: each scale joined to the next, a pattern on every other one (bands all the
// way round for the king snake), a thinner tail, and a head with yellow eyes and a flicking tongue.
function drawSnake(ctx: CanvasRenderingContext2D, snake: Snake, skin: (typeof SKINS)[number], time: number) {
  const { body } = snake;
  if (snake.dead) ctx.globalAlpha = 0.45;
  body.forEach((cell, index) => {
    const x = cell.x * CELL;
    const y = cell.y * CELL;
    const tail = index === body.length - 1 && index > 0;
    const inset = tail ? 2 : 1;
    px(ctx, skin.outline, x + inset, y + inset, CELL - inset * 2, CELL - inset * 2);
    px(ctx, index === 0 ? skin.head : skin.body, x + inset + 1, y + inset + 1, CELL - inset * 2 - 2, CELL - inset * 2 - 2);
    const next = body[index + 1];
    if (next) {
      const dx = next.x - cell.x;
      const dy = next.y - cell.y;
      if (dx !== 0) px(ctx, skin.body, x + (dx > 0 ? CELL - 2 : -2), y + 2, 4, CELL - 4);
      if (dy !== 0) px(ctx, skin.body, x + 2, y + (dy > 0 ? CELL - 2 : -2), CELL - 4, 4);
    }
    if (index > 0 && !tail) {
      if (skin.bands) {
        if (index % 3 === 0) px(ctx, skin.pattern, x + 2, y + 2, CELL - 4, CELL - 4);
      } else if (index % 2 === 0) px(ctx, skin.pattern, x + 4, y + 4, 2, 2);
      px(ctx, skin.light, x + 3, y + 2, 4, 1);
    }
  });
  ctx.globalAlpha = 1;

  const head = body[0]!;
  const x = head.x * CELL;
  const y = head.y * CELL;
  const eyes = { right: [[6, 3], [6, 6]], left: [[3, 3], [3, 6]], up: [[3, 3], [6, 3]], down: [[3, 6], [6, 6]] }[snake.heading];
  for (const [ex, ey] of eyes) px(ctx, snake.dead ? PAL.red : "#e3c547", x + ex!, y + ey!);
  if (snake.boost > 0) {
    // Speed lines behind a snake on espresso.
    px(ctx, "rgba(255,255,255,0.5)", x + 4 - STEP[snake.heading].x * 8, y + 4 - STEP[snake.heading].y * 8, 2, 2);
  }
  if (!snake.dead && time > 0 && Math.floor(time * 1.6) % 3 === 0) {
    const step = STEP[snake.heading];
    px(ctx, PAL.red, x + 4 + step.x * 6, y + 4 + step.y * 6, step.x !== 0 ? 2 : 1, step.y !== 0 ? 2 : 1);
  }
}

function drawItem(ctx: CanvasRenderingContext2D, item: Item, time: number) {
  const x = item.cell.x * CELL;
  const y = item.cell.y * CELL;
  ctx.globalAlpha = 0.35;
  px(ctx, "#2a2d32", x + 3, y + 4, 6, 6);
  ctx.globalAlpha = 1;
  if (item.kind === "mug") {
    // A white mug of coffee with steam drifting off it.
    px(ctx, MUG.rim, x + 2, y + 2, 6, 7);
    px(ctx, MUG.cup, x + 2, y + 3, 6, 6);
    px(ctx, MUG.shade, x + 6, y + 3, 2, 6);
    px(ctx, MUG.coffee, x + 3, y + 3, 4, 2);
    px(ctx, MUG.crema, x + 4, y + 3);
    px(ctx, MUG.rim, x + 8, y + 4, 2, 3);
    px(ctx, MUG.cup, x + 8, y + 5);
    const drift = time > 0 ? Math.floor(time * 3) % 2 : 0;
    px(ctx, MUG.steam, x + 3 + drift, y);
    px(ctx, MUG.steam, x + 5 - drift, y + 1);
  } else if (item.kind === "donut") {
    // A pink-frosted donut with sprinkles.
    px(ctx, "#c98a4b", x + 1, y + 1, 8, 8);
    px(ctx, "#f2a0c0", x + 2, y + 2, 6, 6);
    px(ctx, "#5c6169", x + 4, y + 4, 2, 2);
    px(ctx, "#ffffff", x + 3, y + 2);
    px(ctx, "#3fc5d6", x + 6, y + 3);
    px(ctx, "#f2c14e", x + 3, y + 6);
    px(ctx, "#4caf6d", x + 6, y + 6);
  } else if (item.kind === "espresso") {
    // A small espresso cup on its saucer.
    px(ctx, "#e7e3da", x + 1, y + 5, 8, 3);
    px(ctx, "#f2f0eb", x + 3, y + 2, 4, 4);
    px(ctx, "#3b2214", x + 4, y + 2, 2, 1);
    px(ctx, "#d6d2c9", x + 7, y + 3, 1, 2);
  } else {
    // A coffee bean.
    px(ctx, "#5a3420", x + 3, y + 3, 4, 4);
    px(ctx, "#2e190e", x + 5, y + 3, 1, 4);
  }
}

function drawObstacle(ctx: CanvasRenderingContext2D, obstacle: Obstacle) {
  const x = obstacle.x * CELL;
  const y = obstacle.y * CELL;
  ctx.globalAlpha = 0.35;
  px(ctx, "#2a2d32", x + 3, y + 3, obstacle.w * CELL, obstacle.h * CELL);
  ctx.globalAlpha = 1;
  if (obstacle.kind === "plant") {
    // A terracotta pot seen from above, full of leaves.
    px(ctx, "#9a5034", x + 3, y + 3, 14, 14);
    px(ctx, "#c8714b", x + 4, y + 4, 12, 12);
    px(ctx, "#2c6e47", x + 5, y + 5, 10, 10);
    for (const [lx, ly] of [[2, 6], [6, 1], [12, 3], [14, 9], [8, 14], [1, 12], [9, 7]] as const) {
      px(ctx, "#42a061", x + lx, y + ly, 4, 3);
      px(ctx, "#7fcb8f", x + lx + 1, y + ly, 2, 1);
    }
  } else if (obstacle.kind === "chair") {
    // An office chair: five castors and the seat.
    for (const [cx, cy] of [[1, 1], [7, 1], [0, 6], [8, 6], [4, 8]] as const) px(ctx, "#1d1f23", x + cx, y + cy, 2, 2);
    px(ctx, "#3a3d44", x + 2, y + 2, 6, 6);
    px(ctx, "#4d515a", x + 3, y + 2, 4, 1);
  } else {
    // A cardboard box with packing tape down the middle.
    px(ctx, "#a07d4c", x, y, obstacle.w * CELL, obstacle.h * CELL);
    px(ctx, "#c8a06b", x + 1, y + 1, obstacle.w * CELL - 2, obstacle.h * CELL - 2);
    px(ctx, "#e3cfa6", x + 1, y + 4, obstacle.w * CELL - 2, 2);
  }
}
