// Shared pieces for the Game Room's games (pong.ts, breakout.ts, snake.ts, sumo.ts): the input a
// game reads, the interface it implements, the players' seats, and a few pixel helpers. Every game
// draws on a 240 x 160 canvas that CSS scales up with crisp pixels. Each game paints the real thing
// (a tournament table, a cork board, office carpet, a rug) in the colours those things have.

import type { BreakoutView } from "./breakout";
import type { PongView } from "./pong";
import type { SnakeView } from "./snake";
import type { SumoView } from "./sumo";

export const SCREEN_W = 240;
export const SCREEN_H = 160;

export type ArcadeGameKind = "pong" | "breakout" | "snake" | "sumo";

export type Direction = "up" | "down" | "left" | "right";

// "action" is a player's own button (serve, launch, dash); "start" is Space/Enter or a tap, which
// starts a round for everyone.
export type Press = Direction | "action" | "start";

export type ArcadeInput = {
  held: Record<Direction, boolean>;
  presses: Press[];
  // The mouse over the screen, or a finger on it, in screen pixels. `moves` goes up on every
  // pointer move so a game can tell the player switched from the keys to the pointer.
  pointer: { x: number; y: number; down: boolean; moves: number } | null;
};

export type GamePhase = "ready" | "playing" | "over" | "won";

export const SOUNDS = [
  "start", "hit", "wall", "score", "lose", "brick", "eat", "win", "power", "dash", "bump", "fall", "tick",
  // Table tennis: bat, table, net, floor, a smash, and a few people clapping.
  "bat", "table", "net", "floor", "smash", "clap",
] as const;
export type Sound = (typeof SOUNDS)[number];

// How well the computer plays, in games that offer a choice.
export const LEVELS = ["easy", "medium", "hard"] as const;
export type Level = (typeof LEVELS)[number];

// Up to four players. Each seat has a colour that follows the player through every game: the
// rubber on their bat, their ruler, their snake, their chair.
export const SEATS = [
  { name: "Red", color: "#c1272d", light: "#e45c5f", dark: "#8e1b1f" },
  { name: "Black", color: "#2b2d31", light: "#55585f", dark: "#151619" },
  { name: "Blue", color: "#1f5fa8", light: "#4f8ad0", dark: "#163f70" },
  { name: "Green", color: "#2e8b57", light: "#5fb383", dark: "#1d5c39" },
] as const;

export type Seat = { name: string; bot: boolean };

export type GameOptions = {
  reducedMotion: boolean;
  sound: (sound: Sound) => void;
  // One entry per player (1 to 4): what to call them and whether the computer plays that seat.
  seats: Seat[];
  level?: Level;
};

// One chip on the score line. `seat` colours it, `out` greys it, `badge` adds a small tag ("serve").
export type HudItem = { label: string; value: string; seat?: number; out?: boolean; badge?: string };

export type GameInstance = {
  // inputs[i] drives seat i (seats the computer plays ignore theirs).
  update(inputs: ArcadeInput[], dt: number): void;
  draw(ctx: CanvasRenderingContext2D, time: number): void;
  phase(): GamePhase;
  // Seat 0's score, kept as a personal best in solo games.
  score(): number;
  hud(): HudItem[];
  // A short line shown over the screen mid-game ("Level 2", "Out!", "Tap to launch"), or null.
  hint(): string | null;
  // The end card once the phase is "over" or "won": a title and one line.
  headline(): string;
  result(): string;
  // Online play: the host runs the game and sends snapshots; guests only draw them.
  snapshot(): unknown;
  restore(snapshot: unknown): void;
  // The state a 3D stage draws, for games that have one. Reading it changes nothing.
  view?(): GameView;
};

export type GameView = PongView | BreakoutView | SnakeView | SumoView;

// A game drawn in 3D (pong-3d.ts) instead of on the pixel canvas. It makes its own canvas, which
// the cabinet puts over the pixel one. `pick` turns a point on that canvas into screen pixels on
// the play field, so the mouse and fingers steer just as they do on the flat game.
export type GameStage = {
  canvas: HTMLCanvasElement;
  // Where the opening card sits over this stage: low (the default) or in the middle.
  card?: "middle" | "low";
  // Settles once the stage's models have loaded (it draws simpler stand-ins until then). The cabinet
  // and the menu still wait for it, so nobody sees the swap.
  ready?: Promise<void>;
  render(view: GameView, dt: number, time: number): void;
  pick(clientX: number, clientY: number): { x: number; y: number } | null;
  resize(width: number, height: number): void;
  dispose(): void;
};
// `onLost` fires if the browser takes the GPU back (the cabinet goes back to the flat view).
export type GameStageFactory = (options: { reducedMotion: boolean; onLost?: () => void }) => GameStage;

export function emptyInput(): ArcadeInput {
  return { held: { up: false, down: false, left: false, right: false }, presses: [], pointer: null };
}

export const pressed = (input: ArcadeInput | undefined, press: Press) => input?.presses.includes(press) ?? false;
export const startPressed = (inputs: ArcadeInput[]) => inputs.some((input) => pressed(input, "start") || pressed(input, "action"));

// "You win!", "Asha wins!".
export const winsLine = (name: string) => (name === "You" ? "You win!" : `${name} wins!`);

// Neutrals shared by the games.
export const PAL = {
  ink: "#1d1f23",
  paper: "#f3f0e8",
  paperCrease: "#cbc6ba",
  shadow: "rgba(0, 0, 0, 0.28)",
  red: "#c0392b",
  white: "#f6f5f1",
} as const;

export function px(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w = 1, h = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// The same pseudo-random numbers every time, for textures (cork, carpet, wood) that must not flicker.
export function seeded(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
}

// 3 x 5 pixel glyphs for numbers and short labels painted on the play field.
const GLYPHS: Record<string, string> = {
  "0": "111101101101111", "1": "010110010010111", "2": "111001111100111", "3": "111001111001111", "4": "101101111001001",
  "5": "111100111001111", "6": "111100111101111", "7": "111001001001001", "8": "111101111101111", "9": "111101111001111",
  "+": "000010111010000", x: "000101010101000", "!": "010010010000010", " ": "000000000000000",
};

export function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  options: { scale?: number; color: string; align?: "left" | "center" | "right" },
) {
  const scale = options.scale ?? 1;
  const chars = [...text].filter((char) => GLYPHS[char]);
  const width = (chars.length * 4 - 1) * scale;
  const left = options.align === "center" ? x - width / 2 : options.align === "right" ? x - width : x;
  chars.forEach((char, index) => {
    const bits = GLYPHS[char]!;
    for (let bit = 0; bit < 15; bit++) {
      if (bits[bit] !== "1") continue;
      px(ctx, options.color, left + (index * 4 + (bit % 3)) * scale, y + Math.floor(bit / 3) * scale, scale, scale);
    }
  });
}

export function drawNumber(
  ctx: CanvasRenderingContext2D,
  value: number,
  x: number,
  y: number,
  options: { scale?: number; color: string; align?: "left" | "center" | "right" },
) {
  drawText(ctx, String(Math.max(0, Math.floor(value))), x, y, options);
}

// Little bits that fly off a hit. Off when the player prefers reduced motion.
export function createParticles(enabled: boolean) {
  let sparks: { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number }[] = [];
  return {
    burst(x: number, y: number, color: string, count = 6, speed = 45, size = 1) {
      if (!enabled) return;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const v = speed * (0.4 + Math.random() * 0.6);
        const max = 0.25 + Math.random() * 0.3;
        sparks.push({ x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v, life: max, max, color, size });
      }
    },
    update(dt: number) {
      for (const spark of sparks) {
        spark.x += spark.vx * dt;
        spark.y += spark.vy * dt;
        spark.vy += 90 * dt;
        spark.life -= dt;
      }
      sparks = sparks.filter((spark) => spark.life > 0);
    },
    draw(ctx: CanvasRenderingContext2D) {
      for (const spark of sparks) {
        ctx.globalAlpha = Math.max(0, spark.life / spark.max);
        px(ctx, spark.color, spark.x, spark.y, spark.size, spark.size);
      }
      ctx.globalAlpha = 1;
    },
  };
}

// Score pop-ups ("+50", "x3") that drift up and fade. Shown without the drift with reduced motion.
export function createPopups(reducedMotion: boolean) {
  let items: { text: string; x: number; y: number; life: number; color: string }[] = [];
  return {
    add(text: string, x: number, y: number, color: string) {
      items.push({ text, x, y, life: 0.9, color });
      if (items.length > 12) items = items.slice(-12);
    },
    update(dt: number) {
      for (const item of items) {
        item.life -= dt;
        if (!reducedMotion) item.y -= 14 * dt;
      }
      items = items.filter((item) => item.life > 0);
    },
    draw(ctx: CanvasRenderingContext2D) {
      for (const item of items) {
        ctx.globalAlpha = Math.min(1, item.life * 2);
        drawText(ctx, item.text, item.x + 1, item.y + 1, { color: "rgba(0,0,0,0.45)", align: "center" });
        drawText(ctx, item.text, item.x, item.y, { color: item.color, align: "center" });
      }
      ctx.globalAlpha = 1;
    },
  };
}

// A short shake of the whole screen when a point is lost. Off with reduced motion.
export function createShake(enabled: boolean) {
  let time = 0;
  let strength = 0;
  return {
    kick(amount = 2) {
      if (!enabled) return;
      time = 0.22;
      strength = amount;
    },
    update(dt: number) {
      time = Math.max(0, time - dt);
    },
    apply(ctx: CanvasRenderingContext2D) {
      if (time <= 0) return;
      const amount = strength * (time / 0.22);
      ctx.translate(Math.round((Math.random() * 2 - 1) * amount), Math.round((Math.random() * 2 - 1) * amount));
    },
  };
}

// Picks up a switch to pointer control (the mouse moved over the screen or a finger dragged) and
// back to the keys (an arrow key is held). One per player.
export function createPointerMode() {
  let usePointer = false;
  let lastMoves = 0;
  return (input: ArcadeInput | undefined, keysHeld: boolean) => {
    const pointer = input?.pointer;
    if (pointer && pointer.moves !== lastMoves) {
      lastMoves = pointer.moves;
      usePointer = true;
    }
    if (keysHeld) usePointer = false;
    return usePointer && pointer ? pointer : null;
  };
}

// Sounds the host played since its last snapshot, so guests hear them too.
export function createSoundLog(play: (sound: Sound) => void) {
  let log: Sound[] = [];
  return {
    play(sound: Sound) {
      play(sound);
      if (log.length < 12) log.push(sound);
    },
    drain() {
      const out = log;
      log = [];
      return out;
    },
    replay(sounds: unknown) {
      if (!Array.isArray(sounds)) return;
      for (const sound of sounds.slice(0, 8)) if ((SOUNDS as readonly unknown[]).includes(sound)) play(sound as Sound);
    },
  };
}

// Readers for snapshots that came over the network: anything malformed falls back to a default.
export const read = {
  num(value: unknown, fallback = 0, min = -1e6, max = 1e6) {
    return typeof value === "number" && Number.isFinite(value) ? clamp(value, min, max) : fallback;
  },
  int(value: unknown, fallback = 0, min = 0, max = 1e6) {
    return Math.round(read.num(value, fallback, min, max));
  },
  phase(value: unknown, fallback: GamePhase): GamePhase {
    return value === "ready" || value === "playing" || value === "over" || value === "won" ? value : fallback;
  },
  list(value: unknown, max: number): unknown[] {
    return Array.isArray(value) ? value.slice(0, max) : [];
  },
  record(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  },
  text(value: unknown, max = 40): string | null {
    return typeof value === "string" ? value.slice(0, max) : null;
  },
};
