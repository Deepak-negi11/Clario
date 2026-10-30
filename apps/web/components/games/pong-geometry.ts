// The singles table in metres, and what the 3D table (pong-3d.ts) reads from the game each frame.
//
// Axes: x runs along the table with the net at x = 0 (seat 0 plays from x < 0, seat 1 from x > 0);
// y runs across it with the centre line at y = 0 (+y is the near long side, the bottom of the flat
// view); z is height above the floor.

import type { GamePhase } from "./arcade-kit";

export const PONG_TABLE = {
  length: 2.74,
  width: 1.525,
  // The playing surface, above the floor.
  height: 0.76,
  // The net's height above the surface, and how far its posts stand out past each side.
  net: 0.1525,
  netOverhang: 0.1525,
  // A little larger than a real 40 mm ball, so it reads at a glance.
  ballRadius: 0.022,
  // Where each bat meets the ball: this far either side of the net, behind the end lines.
  batX: 1.6,
  // How far either side of a bat's centre (across the table) it can still reach the ball.
  reach: 0.17,
} as const;

// One frame of singles. The 3D table spots a hit when a bat's swing jumps back to 1, a bounce
// when `marks` gains an entry, and a point when the score changes.
export type SinglesView = {
  kind: "pong";
  phase: GamePhase;
  score: readonly [number, number];
  server: 0 | 1;
  // The server has the ball and hasn't served yet (holding it or mid-toss).
  serving: boolean;
  // Hits in the current rally.
  rally: number;
  // A short line for the players ("Deuce", "Out · your point"), or null.
  call: string | null;
  ball: { x: number; y: number; z: number; vx: number; vy: number; vz: number; topspin: number; sidespin: number; visible: boolean };
  // Seat 0's bat at x = -batX, seat 1's at +batX. y and z are the blade's centre; swing runs from 1
  // down to 0 just after the bat hits the ball.
  bats: readonly { y: number; z: number; swing: number }[];
  // Where the ball touched the table lately, oldest first; age in seconds.
  marks: readonly { x: number; y: number; age: number }[];
};

// The flat view's play field (240 x 160 screen pixels) and the table in metres. The mouse and
// fingers arrive in field pixels on both views; the bats follow the field's y.
const FIELD = { cx: 120, cy: 80, perMetreX: 68, perMetreY: 84 } as const;

export function pongFieldPoint(x: number, y: number) {
  return { x: FIELD.cx + x * FIELD.perMetreX, y: FIELD.cy + y * FIELD.perMetreY };
}

export function pongMetres(fieldX: number, fieldY: number) {
  return { x: (fieldX - FIELD.cx) / FIELD.perMetreX, y: (fieldY - FIELD.cy) / FIELD.perMetreY };
}
