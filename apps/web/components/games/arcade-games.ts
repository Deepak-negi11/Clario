import { SCREEN_H, SCREEN_W, type ArcadeGameKind, type GameInstance, type GameOptions, type GameStageFactory } from "./arcade-kit";
import { createBreakout } from "./breakout";
import { createPong } from "./pong";
import { createSnake } from "./snake";
import { createSumo } from "./sumo";

export type { ArcadeGameKind } from "./arcade-kit";

export type ArcadeGameSpec = {
  kind: ArcadeGameKind;
  title: string;
  // For the game tabs, where space is short.
  short: string;
  blurb: string;
  create: (options: GameOptions) => GameInstance;
  // The 3D table, loaded only when the game opens (three.js is large). Games without one stay flat.
  stage?: () => Promise<GameStageFactory>;
  // How many play at once (you included), and whether the computer can take the other seats.
  players: { min: number; max: number };
  computer: boolean;
  // Seats when you play alone (with the computer filling the rest).
  soloSeats: number;
  // What playing together is like.
  together: string;
  // What starts a round, for keyboards and for touch screens.
  start: { keys: string; touch: string };
  // Your keys and button when playing alone, e.g. "↑ ↓" and "serve".
  move: string[];
  action: string | null;
  touch: string;
  multiTouch: string;
  // Show on-screen arrows on touch screens when alone (Snake needs exact turns).
  dpad: boolean;
  // On one touch screen, which player a finger at (x, y) belongs to.
  zone?: (x: number, y: number, count: number) => number;
  // The numbers of players for which you can pick how well the computer plays.
  levels?: number[];
  // Each player's keys on one keyboard when the game only uses some of a set (Ping-pong: "W S").
  seatKeys?: string[];
};

// Two players: left half, right half. Three or four: the screen's quarters.
export function defaultZone(x: number, y: number, count: number) {
  if (count <= 2) return x < SCREEN_W / 2 ? 0 : 1;
  const quarter = (x < SCREEN_W / 2 ? 0 : 1) + (y < SCREEN_H / 2 ? 0 : 2);
  return Math.min(count - 1, quarter);
}

export const ARCADE_GAMES: ArcadeGameSpec[] = [
  {
    kind: "pong",
    title: "Ping-pong",
    short: "Ping-pong",
    blurb: "Real rules: 11 points, win by 2, two serves each. Hit off the edge for angles, swing for spin.",
    create: createPong,
    stage: () => import("./pong-3d").then((module) => module.createPongStage),
    players: { min: 2, max: 4 },
    computer: true,
    soloSeats: 2,
    together: "1 on 1, or round the table for 3 or 4",
    start: { keys: "Press Space to toss the ball and serve", touch: "Tap the table to serve" },
    move: ["←", "→"],
    action: "serve",
    touch: "Drag left and right to move your bat, tap to serve.",
    multiTouch: "One finger each on your own half of the table: drag to move, tap to serve.",
    dpad: false,
    levels: [2],
    seatKeys: ["A D", "← →", "J L", "Num 4 6"],
    // Round the table: a finger belongs to the side it's nearest.
    zone: (x, y, count) => {
      if (count <= 2) return x < SCREEN_W / 2 ? 0 : 1;
      const distances = [x, SCREEN_W - x, y * 1.5, (SCREEN_H - y) * 1.5].slice(0, count);
      return distances.indexOf(Math.min(...distances));
    },
  },
  {
    kind: "breakout",
    title: "Breakout",
    short: "Breakout",
    blurb: "Four cork boards, desk-supply power-ups and combo points.",
    create: createBreakout,
    stage: () => import("./breakout-3d").then((module) => module.createBreakoutStage),
    players: { min: 1, max: 4 },
    computer: false,
    soloSeats: 1,
    together: "Up to 4 rulers clearing one board together",
    start: { keys: "Press Space to launch", touch: "Tap to launch the ball" },
    move: ["←", "→"],
    action: "launch",
    touch: "Drag left and right to move the ruler, tap to launch.",
    multiTouch: "One finger each, in your part of the board.",
    dpad: false,
    zone: (x, _y, count) => Math.min(count - 1, Math.floor((x / SCREEN_W) * count)),
  },
  {
    kind: "snake",
    title: "Snake",
    short: "Snake",
    blurb: "Coffee, donuts and espresso. Mind the plants and chairs.",
    create: createSnake,
    stage: () => import("./snake-3d").then((module) => module.createSnakeStage),
    players: { min: 1, max: 4 },
    computer: true,
    soloSeats: 1,
    together: "Up to 4 snakes: the last one moving wins",
    start: { keys: "Press an arrow key to start", touch: "Swipe or press an arrow to start" },
    move: ["↑", "↓", "←", "→"],
    action: null,
    touch: "Swipe on the floor or use the arrows to turn.",
    multiTouch: "One finger each: swipe in your part of the floor.",
    dpad: true,
  },
  {
    kind: "sumo",
    title: "Chair Sumo",
    short: "Sumo",
    blurb: "Ram the other office chairs off the rug. Best of five rounds.",
    create: createSumo,
    stage: () => import("./sumo-3d").then((module) => module.createSumoStage),
    players: { min: 2, max: 4 },
    computer: true,
    soloSeats: 4,
    together: "2 to 4 chairs: last one on the rug wins the round",
    start: { keys: "Press Space to start", touch: "Tap to start" },
    move: ["↑", "↓", "←", "→"],
    action: "dash",
    touch: "Hold a finger where you want to roll, tap quickly to dash.",
    multiTouch: "One finger each, in your corner of the room.",
    dpad: false,
  },
];

export function getArcadeGame(kind: ArcadeGameKind): ArcadeGameSpec {
  return ARCADE_GAMES.find((game) => game.kind === kind) ?? ARCADE_GAMES[0]!;
}

export function isArcadeGameKind(value: unknown): value is ArcadeGameKind {
  return ARCADE_GAMES.some((game) => game.kind === value);
}

// Four people on one keyboard: each has four keys to move and one button.
export const KEY_SETS = [
  { keys: "W A S D", button: "E", codes: { KeyW: "up", KeyA: "left", KeyS: "down", KeyD: "right" }, buttons: ["KeyE"] },
  { keys: "Arrows", button: "/", codes: { ArrowUp: "up", ArrowLeft: "left", ArrowDown: "down", ArrowRight: "right" }, buttons: ["Slash", "ShiftRight"] },
  { keys: "I J K L", button: "O", codes: { KeyI: "up", KeyJ: "left", KeyK: "down", KeyL: "right" }, buttons: ["KeyO"] },
  { keys: "Numpad 8 4 5 6", button: "Num 0", codes: { Numpad8: "up", Numpad4: "left", Numpad5: "down", Numpad6: "right" }, buttons: ["Numpad0"] },
] as const;
