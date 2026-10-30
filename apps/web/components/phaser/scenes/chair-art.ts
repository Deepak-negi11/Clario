import type Phaser from "phaser";
import type { Fabric } from "@repo/shared";
import { PixelSprite, type Upholstery } from "./lounge-art";
import { UPHOLSTERY } from "./office-art";

// Every chair on the maps, drawn pixel by pixel in the furniture style of office-art.ts: one
// art pixel is 2x2 world pixels and a tile is 16 art pixels wide. Light comes from the top
// left, so tops and left edges are lit and right edges and undersides are shaded, and parts that
// meet get a dark seam. Each chair has its own front, back and side view, so one facing away
// still shows a backrest, a seat edge and legs. Keys are what clario-hq-builder.ts places.

type Bake = { key: string; sprite: PixelSprite; mirror?: boolean };

const CHROME = { hi: 0xe8ecf2, base: 0xb3bac6, dark: 0x7a8291, line: 0x3e434d };
const STEEL = { hi: 0x9aa1ae, base: 0x6f7684, dark: 0x4c525e };
const CASTOR = 0x24272e;
const BLACK = { hi: 0x666c7a, base: 0x464b57, shade: 0x353944, deep: 0x272a32, line: 0x14161b };
const MESH = { base: 0x3b404b, dot: 0x555b69, rim: 0x2a2d35 };
const HONEY = { hi: 0xf6d7a2, top: 0xe5b878, edge: 0xc8934f, dark: 0xa06f3b, leg: 0x82582f, line: 0x4a2f19 };
const SEAT_RED: Upholstery = { hi: 0xe0676a, base: 0xbf4046, shade: 0x9a3036, deep: 0x77232a, line: 0x3d0f14 };
const ARM_WOOD = { hi: 0xe2b57c, base: 0xc08a4f, dark: 0x8e6235 };

// Blends a colour toward white by t (0..1).
const lighten = (color: number, t: number) => {
  const channel = (shift: number) => {
    const c = (color >> shift) & 255;
    return Math.round(c + (255 - c) * t);
  };
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
};

// A rounded block of colour with a lit top row and a shaded right column, for padded parts.
function pad(s: PixelSprite, u: Upholstery, x: number, y: number, w: number, h: number, r = 2) {
  s.box(u.base, x, y, w, h, r);
  s.shade(u.hi, x, y, w, 1);
  s.shade(u.hi, x, y + 1, 1, h - 2);
  s.shade(u.shade, x + w - 1, y + 1, 1, h - 1);
  s.shade(u.shade, x, y + h - 1, w, 1);
}

// Four metal legs seen from the front: the near pair long and lit, the far pair short and dark.
function fourLegs(s: PixelSprite, top: number, near: [number, number], far: [number, number], length = 6) {
  for (const x of far) s.rect(STEEL.dark, x, top, 1, Math.max(2, length - 3));
  for (const x of near) {
    s.rect(STEEL.base, x, top, 1, length);
    s.set(STEEL.hi, x, top);
    s.rect(BLACK.deep, x, top + length, 1, 1);
  }
}

// The gas lift and five-star base of an office chair, with castors.
function starBase(s: PixelSprite, cx: number, top: number) {
  s.rect(CHROME.base, cx - 1, top, 2, 2);
  s.set(CHROME.hi, cx - 1, top);
  s.rect(BLACK.base, cx - 5, top + 2, 10, 1);
  s.rect(BLACK.hi, cx - 4, top + 2, 4, 1);
  s.set(BLACK.base, cx - 6, top + 3);
  s.set(BLACK.base, cx + 5, top + 3);
  for (const x of [cx - 7, cx - 3, cx + 2, cx + 6]) s.rect(CASTOR, x, top + 3 + (x === cx - 3 || x === cx + 2 ? 1 : 0), 2, 2);
}

// Meeting chair: an upholstered shell on four slim legs.
function meetChair(u: Upholstery, view: "down" | "up" | "side") {
  const s = new PixelSprite(16, 22);
  if (view === "down") {
    pad(s, u, 3, 0, 10, 10, 3);
    s.rect(u.shade, 5, 3, 6, 5);
    s.rect(u.base, 5, 3, 6, 1);
    s.rect(u.hi, 5, 4, 1, 3);
    s.rect(u.deep, 4, 9, 8, 1);
    pad(s, u, 1, 9, 14, 6, 2);
    s.rect(u.hi, 2, 10, 12, 2);
    s.rect(lighten(u.hi, 0.35), 3, 10, 4, 1);
    s.rect(u.shade, 2, 13, 12, 1);
    s.rect(u.deep, 2, 14, 12, 1);
    fourLegs(s, 15, [2, 13], [4, 11]);
  } else if (view === "up") {
    pad(s, u, 1, 8, 14, 6, 2);
    s.rect(u.shade, 1, 12, 14, 2);
    pad(s, u, 3, 0, 10, 14, 3);
    s.rect(u.shade, 4, 12, 8, 1);
    s.rect(u.deep, 6, 3, 4, 1);
    s.rect(u.hi, 6, 4, 4, 1);
    s.rect(u.shade, 7, 6, 2, 5);
    s.rect(u.deep, 3, 13, 10, 1);
    fourLegs(s, 14, [2, 13], [4, 11], 7);
  } else {
    pad(s, u, 1, 9, 12, 5, 2);
    s.rect(u.hi, 2, 10, 9, 1);
    s.rect(u.deep, 2, 13, 10, 1);
    pad(s, u, 10, 0, 4, 12, 2);
    s.rect(u.hi, 10, 1, 1, 9);
    s.rect(u.deep, 10, 10, 2, 1);
    s.rect(STEEL.dark, 4, 14, 1, 4);
    s.rect(STEEL.dark, 10, 14, 1, 4);
    fourLegs(s, 14, [2, 12], [4, 10]);
  }
  s.outline(u.line);
  return s;
}

// High-backed leather conference chair: a padded back with stitched bands, armrests and a
// five-star base on castors.
function execChair(u: Upholstery, view: "down" | "up" | "side") {
  const s = new PixelSprite(16, 26);
  const armPad = { hi: BLACK.hi, base: BLACK.base, shade: BLACK.shade, deep: BLACK.deep, line: BLACK.line };
  if (view === "down") {
    pad(s, u, 3, 0, 10, 14, 3);
    for (const y of [4, 8]) {
      s.rect(u.deep, 4, y, 8, 1);
      s.rect(u.hi, 4, y + 1, 8, 1);
    }
    s.rect(u.deep, 4, 12, 8, 1);
    pad(s, armPad, 0, 10, 3, 4, 1);
    pad(s, armPad, 13, 10, 3, 4, 1);
    s.rect(CHROME.base, 1, 14, 1, 2);
    s.rect(CHROME.base, 14, 14, 1, 2);
    pad(s, u, 2, 12, 12, 6, 2);
    s.rect(u.hi, 3, 13, 10, 2);
    s.rect(u.deep, 7, 13, 2, 2);
    s.rect(u.shade, 3, 16, 10, 1);
    s.rect(u.deep, 3, 17, 10, 1);
    starBase(s, 8, 18);
  } else if (view === "up") {
    pad(s, armPad, 0, 10, 3, 4, 1);
    pad(s, armPad, 13, 10, 3, 4, 1);
    pad(s, u, 3, 0, 10, 17, 3);
    s.box(u.shade, 5, 3, 6, 11, 2);
    s.rect(u.base, 5, 3, 6, 1);
    s.rect(u.deep, 7, 4, 2, 9);
    s.rect(u.deep, 3, 16, 10, 1);
    starBase(s, 8, 17);
  } else {
    pad(s, u, 2, 12, 11, 5, 2);
    s.rect(u.hi, 3, 13, 8, 1);
    s.rect(u.deep, 3, 16, 9, 1);
    pad(s, u, 10, 0, 5, 16, 2);
    s.rect(u.deep, 11, 5, 3, 1);
    s.rect(u.deep, 11, 9, 3, 1);
    pad(s, armPad, 3, 10, 8, 2, 1);
    s.rect(CHROME.base, 9, 12, 1, 2);
    s.rect(CHROME.base, 7, 17, 2, 2);
    s.rect(BLACK.base, 2, 19, 12, 1);
    for (const x of [1, 7, 13]) s.rect(CASTOR, x, 20, 2, 2);
  }
  s.outline(u.line);
  return s;
}

// Office task chair: a black mesh back, a padded seat, loop armrests and a five-star base.
function taskChair(view: "down" | "up" | "side") {
  const s = new PixelSprite(16, 24);
  const mesh = (x: number, y: number, w: number, h: number) => {
    s.box(MESH.rim, x, y, w, h, 2);
    s.rect(MESH.base, x + 1, y + 1, w - 2, h - 2);
    for (let yy = y + 1; yy < y + h - 1; yy++) for (let xx = x + 1 + (yy % 2); xx < x + w - 1; xx += 2) s.set(MESH.dot, xx, yy);
    s.rect(BLACK.hi, x + 1, y, w - 2, 1);
  };
  if (view === "down") {
    mesh(3, 0, 10, 11);
    s.rect(MESH.rim, 4, 10, 8, 1);
    s.rect(BLACK.base, 0, 9, 2, 5);
    s.rect(BLACK.base, 14, 9, 2, 5);
    s.rect(BLACK.hi, 0, 9, 2, 1);
    s.rect(BLACK.hi, 14, 9, 2, 1);
    pad(s, BLACK, 2, 10, 12, 6, 2);
    s.rect(BLACK.hi, 3, 11, 10, 2);
    s.rect(BLACK.deep, 3, 15, 10, 1);
    starBase(s, 8, 16);
  } else if (view === "up") {
    s.rect(BLACK.base, 0, 9, 2, 5);
    s.rect(BLACK.base, 14, 9, 2, 5);
    s.rect(BLACK.hi, 0, 9, 2, 1);
    s.rect(BLACK.hi, 14, 9, 2, 1);
    pad(s, BLACK, 2, 9, 12, 5, 2);
    mesh(3, 0, 10, 14);
    s.rect(BLACK.base, 6, 13, 4, 2);
    s.rect(BLACK.deep, 3, 13, 10, 1);
    starBase(s, 8, 15);
  } else {
    pad(s, BLACK, 2, 10, 11, 5, 2);
    s.rect(BLACK.hi, 3, 11, 8, 1);
    mesh(10, 0, 5, 13);
    s.rect(BLACK.base, 3, 8, 7, 2);
    s.rect(BLACK.hi, 3, 8, 7, 1);
    s.rect(BLACK.base, 8, 10, 1, 1);
    s.rect(CHROME.base, 7, 15, 2, 2);
    s.rect(BLACK.base, 2, 17, 12, 1);
    for (const x of [1, 7, 13]) s.rect(CASTOR, x, 18, 2, 2);
  }
  s.outline(BLACK.line);
  return s;
}

// Auditorium seat: a tall curved red backrest and cushion between oak armrests (one with a cup
// holder) on steel stands joined by a crossbar. Seats in a row stand side by side, so their
// armrests meet like a real row of seating. Seen from behind ("up", the audience facing the
// stage) the backrest is nearest you and the cushion shows above it.
function theatreSeat(view: "down" | "up") {
  const u = SEAT_RED;
  const s = new PixelSprite(16, 20);
  // Steel stands under the armrests, a crossbar under the seat, and feet.
  const stands = (top: number) => {
    for (const x of [0, 14]) {
      s.rect(STEEL.dark, x, top, 2, 18 - top);
      s.rect(STEEL.base, x, top, 1, 18 - top);
      s.rect(STEEL.dark, x, 18, 2, 1);
    }
    s.rect(STEEL.dark, 2, 15, 12, 2);
    s.rect(STEEL.hi, 2, 15, 12, 1);
  };
  // Oak armrests seen from above: long strips running front to back, a cup holder on the right.
  const arms = (top: number, length: number) => {
    for (const x of [0, 14]) {
      s.box(ARM_WOOD.base, x, top, 2, length, 1);
      s.rect(ARM_WOOD.hi, x, top, 2, 1);
      s.rect(ARM_WOOD.dark, x + 1, top + 1, 1, length - 1);
    }
    s.rect(STEEL.dark, 14, top + 1, 2, 2);
    s.set(CASTOR, 15, top + 2);
  };
  if (view === "up") {
    stands(9);
    // The cushion, seen past the top of the backrest.
    pad(s, u, 3, 1, 10, 5, 2);
    s.rect(u.hi, 4, 1, 8, 1);
    arms(2, 7);
    // The backrest's back: a padded shell, lit along its curved top and down the left, with
    // darker seams at the sides where it wraps round.
    s.box(u.deep, 2, 4, 12, 12, 3);
    s.box(u.base, 2, 4, 12, 3, 2);
    s.rect(u.hi, 4, 4, 8, 1);
    s.rect(u.hi, 3, 5, 1, 1);
    s.box(u.shade, 3, 7, 10, 8, 2);
    s.rect(u.base, 4, 7, 3, 7);
    s.rect(lighten(u.base, 0.12), 5, 8, 1, 5);
    s.rect(u.deep, 3, 7, 1, 8);
    s.rect(u.deep, 12, 7, 1, 8);
    s.rect(u.line, 4, 15, 8, 1);
  } else {
    stands(11);
    // The backrest's padded front: two upholstered panels under a lit, curved top.
    pad(s, u, 2, 0, 12, 10, 3);
    s.rect(lighten(u.hi, 0.25), 4, 0, 8, 1);
    s.rect(u.shade, 7, 2, 2, 7);
    s.rect(u.deep, 8, 2, 1, 7);
    s.rect(u.deep, 3, 9, 10, 1);
    arms(6, 6);
    // The cushion: its top, a lit front roll and a dark underside.
    pad(s, u, 2, 9, 12, 5, 2);
    s.rect(u.hi, 3, 10, 10, 1);
    s.rect(lighten(u.hi, 0.2), 4, 11, 7, 1);
    s.rect(u.deep, 3, 13, 10, 1);
  }
  s.outline(u.line);
  return s;
}

// Wooden cafe chair: a curved top rail over three spindles, a dished seat and splayed legs.
function cafeChair(view: "down" | "up" | "side") {
  const w = HONEY;
  const s = new PixelSprite(14, 22);
  const legs = (top: number) => {
    s.rect(w.leg, 4, top, 1, 4);
    s.rect(w.leg, 9, top, 1, 4);
    s.rect(w.edge, 2, top, 2, 6);
    s.rect(w.edge, 10, top, 2, 6);
    s.set(w.hi, 2, top);
    s.set(w.hi, 10, top);
    s.rect(w.dark, 1, top + 6, 2, 1);
    s.rect(w.dark, 11, top + 6, 2, 1);
    s.rect(w.leg, 4, top + 4, 6, 1);
  };
  const back = (top: number, h: number) => {
    s.box(w.edge, 2, top, 10, 3, 1);
    s.rect(w.hi, 3, top, 8, 1);
    s.rect(w.top, 3, top + 1, 8, 1);
    for (const x of [2, 11]) {
      s.rect(w.edge, x, top + 2, 1, h - 2);
      s.set(w.hi, x, top + 2);
    }
    for (const x of [4, 6, 8]) {
      s.rect(w.top, x, top + 3, 2, h - 4);
      s.rect(w.hi, x, top + 3, 1, h - 4);
    }
  };
  if (view === "down") {
    back(0, 10);
    s.box(w.edge, 1, 9, 12, 5, 2);
    s.rect(w.top, 2, 9, 10, 2);
    s.rect(w.hi, 3, 9, 6, 1);
    s.rect(w.dark, 2, 13, 10, 1);
    legs(14);
  } else if (view === "up") {
    s.box(w.edge, 1, 8, 12, 4, 2);
    s.rect(w.top, 1, 8, 12, 1);
    back(0, 12);
    s.rect(w.dark, 2, 11, 10, 1);
    legs(12);
  } else {
    s.box(w.edge, 1, 10, 11, 3, 1);
    s.rect(w.top, 2, 10, 9, 1);
    s.rect(w.hi, 2, 10, 5, 1);
    s.rect(w.dark, 2, 12, 9, 1);
    s.box(w.edge, 9, 0, 3, 3, 1);
    s.rect(w.hi, 9, 0, 3, 1);
    s.rect(w.edge, 10, 2, 2, 9);
    s.rect(w.hi, 10, 2, 1, 9);
    s.rect(w.edge, 2, 13, 2, 7);
    s.rect(w.hi, 2, 13, 1, 7);
    s.rect(w.edge, 9, 13, 2, 7);
    s.rect(w.leg, 4, 17, 5, 1);
  }
  s.outline(w.line);
  return s;
}

export function chairPieces(): Bake[] {
  const out: Bake[] = [];
  for (const [fabric, u] of Object.entries(UPHOLSTERY) as [Fabric, Upholstery][]) {
    const meetSide = meetChair(u, "side");
    out.push({ key: `hq-meet-chair-${fabric}-down`, sprite: meetChair(u, "down") });
    out.push({ key: `hq-meet-chair-${fabric}-up`, sprite: meetChair(u, "up") });
    out.push({ key: `hq-meet-chair-${fabric}-left`, sprite: meetSide });
    out.push({ key: `hq-meet-chair-${fabric}-right`, sprite: meetSide, mirror: true });
    const execSide = execChair(u, "side");
    out.push({ key: `hq-exec-chair-${fabric}-down`, sprite: execChair(u, "down") });
    out.push({ key: `hq-exec-chair-${fabric}-up`, sprite: execChair(u, "up") });
    out.push({ key: `hq-exec-chair-${fabric}-left`, sprite: execSide });
    out.push({ key: `hq-exec-chair-${fabric}-right`, sprite: execSide, mirror: true });
  }
  const taskSide = taskChair("side");
  out.push({ key: "hq-task-chair-down", sprite: taskChair("down") });
  out.push({ key: "hq-task-chair-up", sprite: taskChair("up") });
  out.push({ key: "hq-task-chair-left", sprite: taskSide });
  out.push({ key: "hq-task-chair-right", sprite: taskSide, mirror: true });
  out.push({ key: "hq-theatre-seat-down", sprite: theatreSeat("down") });
  out.push({ key: "hq-theatre-seat-up", sprite: theatreSeat("up") });
  const cafeSide = cafeChair("side");
  out.push({ key: "hq-cafe-chair-down", sprite: cafeChair("down") });
  out.push({ key: "hq-cafe-chair-up", sprite: cafeChair("up") });
  out.push({ key: "hq-cafe-chair-left", sprite: cafeSide });
  out.push({ key: "hq-cafe-chair-right", sprite: cafeSide, mirror: true });
  return out;
}

export function makeChairTextures(scene: Phaser.Scene) {
  for (const { key, sprite, mirror } of chairPieces()) sprite.bake(scene, key, { mirror });
}
