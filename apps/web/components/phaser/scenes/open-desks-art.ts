import Phaser from "phaser";
import { HQ_THIN_WALLS } from "../../../lib/maps/clario-hq";

// Clario HQ's Open Desks cubicle partitions (thin walls with style "partition"), dark grey-green
// like the reference. A divider starts with a tall post at the lounge end and runs on as a thin
// line; the run along the front has glass panes. Layout is in lib/maps/clario-hq.ts; the brick and
// lavender floors are in lib/maps/floor-patterns.ts.

const TILE = 32;

const PANEL = {
  edge: 0x3d4746, face: 0x5f6f6a, faceHi: 0x72827c, faceLo: 0x52605c,
  cap: 0xc7c8ea, capLo: 0x9d9ecb,
  glass: 0x8fcaec, glassHi: 0xd2effc, glassLo: 0x76afd3,
};

export function drawPartitions(scene: Phaser.Scene, isWall: (x: number, y: number) => boolean) {
  for (const wall of HQ_THIN_WALLS) {
    if (wall.style !== "partition") continue;
    if (wall.x1 === wall.x2) drawDivider(scene, wall.x1, wall.y1, wall.y2);
    else drawFront(scene, wall.y1, wall.x1, wall.x2, isWall);
  }
}

// A tall post at the top end (the back-to-back ends of two cubicles, like the reference), then a
// thin divider down to the front run.
function drawDivider(scene: Phaser.Scene, x: number, y1: number, y2: number) {
  const left = x * TILE + 1;
  const top = y1 * TILE - 14;
  const bottom = (y1 + 1) * TILE - 2;
  const post = scene.add.graphics().setDepth((y1 + 1) * TILE);
  const r = (color: number, rx: number, ry: number, w: number, h: number, alpha = 1) => {
    post.fillStyle(color, alpha);
    post.fillRect(rx, ry, w, h);
  };
  r(0x000000, left + 1, bottom, 30, 4, 0.14);
  r(PANEL.edge, left, top, 30, bottom - top);
  r(PANEL.cap, left + 1, top + 1, 28, 4); r(PANEL.capLo, left + 1, top + 5, 28, 1);
  r(PANEL.edge, left + 14, top + 1, 2, 5);
  r(PANEL.face, left + 1, top + 6, 28, bottom - top - 7);
  r(PANEL.faceHi, left + 2, top + 6, 1, bottom - top - 8); r(PANEL.faceHi, left + 16, top + 6, 1, bottom - top - 8);
  r(PANEL.faceLo, left + 13, top + 6, 2, bottom - top - 7);
  r(PANEL.faceLo, left + 1, bottom - 4, 28, 3);

  const cx = x * TILE + TILE / 2;
  for (let y = y1 + 1; y <= y2; y++) {
    const from = y === y1 + 1 ? bottom : y * TILE;
    // The last row stops under the front run's cap, or just short of the tile's end.
    const to = y < y2 ? (y + 1) * TILE : isFront(x, y) ? y * TILE + 8 : (y + 1) * TILE - 6;
    const strip = scene.add.graphics().setDepth((y + 1) * TILE);
    strip.fillStyle(PANEL.edge, 1); strip.fillRect(cx - 3, from, 6, to - from);
    strip.fillStyle(PANEL.face, 1); strip.fillRect(cx - 2, from, 4, to - from);
    strip.fillStyle(PANEL.cap, 1); strip.fillRect(cx - 2, from, 2, to - from);
  }
}

function isFront(x: number, y: number) {
  return HQ_THIN_WALLS.some((w) => w.style === "partition" && w.y1 === y && w.y2 === y && w.x1 !== w.x2 && x >= w.x1 && x <= w.x2);
}

// The run along the front of the cubicles: a light cap and a dark panel with a glass pane in
// front of each cubicle tile; posts where a divider meets it.
function drawFront(scene: Phaser.Scene, y: number, x1: number, x2: number, isWall: (x: number, y: number) => boolean) {
  const g = scene.add.graphics().setDepth((y + 1) * TILE + 1);
  const r = (color: number, rx: number, ry: number, w: number, h: number, alpha = 1) => {
    g.fillStyle(color, alpha);
    g.fillRect(rx, ry, w, h);
  };
  // Meets the building's wall on the left and runs over the end divider's foot on the right.
  const left = isWall(x1 - 1, y) ? (x1 - 1) * TILE + TILE / 2 + 5 : x1 * TILE;
  const right = isWall(x2 + 1, y) ? (x2 + 1) * TILE + TILE / 2 + 3 : (x2 + 1) * TILE;
  const top = y * TILE + 6;
  const bottom = y * TILE + 31;
  r(0x000000, left, bottom + 1, right - left, 5, 0.12);
  r(PANEL.edge, left, top, right - left, bottom - top + 1);
  r(PANEL.cap, left, top + 1, right - left, 3); r(PANEL.capLo, left, top + 4, right - left, 1);
  r(PANEL.face, left, top + 5, right - left, bottom - top - 5);
  r(PANEL.faceLo, left, bottom - 3, right - left, 3);
  for (let x = x1; x <= x2; x++) {
    // Glass only in front of a cubicle, not where a divider comes down.
    if (isWall(x, y - 1)) continue;
    const gx = x * TILE + 3;
    const gw = Math.min((x + 1) * TILE - 3, right - 2) - gx;
    r(PANEL.edge, gx - 1, top + 7, gw + 2, 17);
    r(PANEL.glass, gx, top + 8, gw, 15);
    r(PANEL.glassHi, gx, top + 8, gw, 2);
    r(PANEL.glassLo, gx, top + 21, gw, 2);
    r(PANEL.glassHi, gx + 4, top + 12, 2, 2); r(PANEL.glassHi, gx + 6, top + 10, 2, 2);
    r(PANEL.edge, gx + Math.floor(gw / 2), top + 8, 1, 15);
  }
}
