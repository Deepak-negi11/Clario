// The flat (from above) pixel art shared by both kinds of Ping-pong: the floor, the table, the bats
// and the ball, in the colours of a tournament table.

import { SCREEN_H as H, SCREEN_W as W, SEATS, px, seeded } from "./arcade-kit";

export const COLORS = {
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

export const BALL = 3;
export const BAT_LONG = 22;
export const BAT_THICK = 4;

export function drawFloor(ctx: CanvasRenderingContext2D) {
  px(ctx, COLORS.floor, -4, -4, W + 8, H + 8);
  for (const fleck of FLOOR_FLECKS) px(ctx, COLORS.floorFleck[fleck.c]!, fleck.x, fleck.y);
}

// The table top: shadow on the floor, the edge, the matte blue with white lines.
export function drawTableTop(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
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
export function drawBat(ctx: CanvasRenderingContext2D, x: number, y: number, vertical: boolean, seat: number, handleSide: -1 | 1, long = BAT_LONG) {
  const rubber = SEATS[seat]!;
  const w = vertical ? BAT_THICK : long;
  const h = vertical ? long : BAT_THICK;
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

export function drawBall(ctx: CanvasRenderingContext2D, x: number, y: number, height: number) {
  ctx.fillStyle = COLORS.ballShadow;
  ctx.fillRect(Math.round(x + 1), Math.round(y + 1), BALL, BALL);
  const size = height > 4 ? 4 : BALL;
  const by = y - height;
  px(ctx, COLORS.ball, x - (size - BALL) / 2, by - (size - BALL) / 2, size, size);
  px(ctx, COLORS.ballHi, x - (size - BALL) / 2, by - (size - BALL) / 2);
}
