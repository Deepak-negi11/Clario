import type Phaser from "phaser";
import type { Fabric } from "@repo/shared";
import { PixelSprite, darken, leafyPlant, type Upholstery } from "./lounge-art";

// Office furniture for Clario HQ and built maps, drawn pixel by pixel in the same style as the
// lounge set (lounge-art.ts): one art pixel is 2x2 world pixels, 16 art pixels span a tile, every
// piece has a lit top, a shaded front and a one-pixel outline, so it reads as a solid object.
// Texture keys match what clario-hq-builder.ts places (`hq-<kind>...`).

export const UPHOLSTERY: Record<Fabric, Upholstery> = {
  navy: { hi: 0x7189c6, base: 0x4c62a0, shade: 0x3c4f86, deep: 0x2f3f6c, line: 0x1c2542 },
  coral: { hi: 0xf3a593, base: 0xdc7462, shade: 0xc05b4b, deep: 0x9f4639, line: 0x5e2820 },
  teal: { hi: 0x72c6bb, base: 0x3f9f95, shade: 0x308279, deep: 0x24665f, line: 0x143c38 },
  mustard: { hi: 0xf3d077, base: 0xdaa83f, shade: 0xbb882c, deep: 0x976c20, line: 0x5a3f12 },
  sage: { hi: 0xadc39b, base: 0x8ca57b, shade: 0x708a62, deep: 0x5a714f, line: 0x33432d },
  grey: { hi: 0x9ea5b4, base: 0x767d8d, shade: 0x606675, deep: 0x4c515e, line: 0x2a2d35 },
  blue: { hi: 0x9cc0f4, base: 0x5f92e2, shade: 0x4672c6, deep: 0x375ca8, line: 0x24407c },
  purple: { hi: 0xc9adf4, base: 0xa07ae2, shade: 0x7f5ac4, deep: 0x6a48a8, line: 0x45306f },
  pink: { hi: 0xf7b3d0, base: 0xe877aa, shade: 0xc9568e, deep: 0xab4678, line: 0x7a2c55 },
  white: { hi: 0xf5f6f9, base: 0xdcdfe6, shade: 0xc0c5cf, deep: 0xa5abb7, line: 0x5f6672 },
  leather: { hi: 0xcf9466, base: 0xad6f46, shade: 0x915838, deep: 0x74432a, line: 0x3b2114 },
};

// Throw pillows for a fabric sofa; leather is tufted instead.
const PILLOWS: Partial<Record<Fabric, [number, number]>> = {
  sage: [0xf2c14e, 0xeeeae2], grey: [0xf2c14e, 0xeeeae2], navy: [0xeeeae2, 0xf08a3c], teal: [0xf2c14e, 0xeeeae2],
  coral: [0xeeeae2, 0xf2c14e], mustard: [0xeeeae2, 0x3f9f95], blue: [0xeeeae2, 0xf2c14e], white: [0x5f92e2, 0xf2c14e],
};

type Wood = { hi: number; top: number; grain: number; edge: number; dark: number; leg: number; line: number };
const OAK: Wood = { hi: 0xf8e3bb, top: 0xedcb97, grain: 0xdfb781, edge: 0xc9965e, dark: 0xa77744, leg: 0x7a5530, line: 0x4f3420 };
const WALNUT: Wood = { hi: 0xdcab80, top: 0xc99266, grain: 0xb77f54, edge: 0x9a663f, dark: 0x7d4f2f, leg: 0x3f434e, line: 0x2e1d12 };
const CAFE_WOOD: Wood = { hi: 0xdba878, top: 0xc8936a, grain: 0xb88158, edge: 0xa06c46, dark: 0x83553a, leg: 0x5a3b26, line: 0x3a2416 };
const PINE: Wood = { hi: 0xfcecc9, top: 0xf1d8a6, grain: 0xe3c38d, edge: 0xd3ab71, dark: 0xb08550, leg: 0x9a7244, line: 0x6a4a2a };
const METAL = { hi: 0xd3d8df, base: 0x9aa2af, dark: 0x646b78, line: 0x3e434d };
const FOOT = 0x3d2b1f;
const LEAF = { back: 0x3f8a4a, front: 0x5aab55, light: 0x7cc56a, edge: 0x2b5a31 };

const leafy = new Set([LEAF.back, LEAF.front, LEAF.light]);

// Same seeded random everywhere so the furniture looks the same for everyone.
function seeded(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
}

function pillow(s: PixelSprite, color: number, x: number, y: number) {
  s.box(darken(color, 0.72), x, y, 7, 7, 2);
  s.box(color, x + 1, y + 1, 5, 5, 1);
  s.rect(darken(color, 0.88), x + 1, y + 5, 5, 1);
}

// Leather buttons: a dark dimple with the leather pulled in on either side.
function tufts(s: PixelSprite, u: Upholstery, x0: number, w: number, y: number, offset: number) {
  for (let x = x0 + 2 + offset; x < x0 + w - 2; x += 4) {
    s.set(u.deep, x, y);
    s.set(u.shade, x - 1, y);
    s.set(u.shade, x + 1, y);
    s.set(u.hi, x, y - 1);
  }
}

// A seat seen from the front, people on it facing down the screen: back cushions over a
// backrest, lit seat cushions, and rolled arms that run down to the floor.
function couchFront(u: Upholstery, opts: { w: number; seats: number; arm: number; tufted: boolean; pillows?: [number, number] }) {
  const { w: W, seats, arm, tufted, pillows } = opts;
  const s = new PixelSprite(W, 26);
  const L = 1, R = W - 2;
  const seatL = L + arm, span = R - arm - seatL + 1;
  const edges = Array.from({ length: seats + 1 }, (_, i) => seatL + Math.round((span * i) / seats));

  s.box(u.shade, L + 2, 1, W - 6, 14, 3);
  for (let i = 0; i < seats; i++) {
    const x0 = edges[i]!, w = edges[i + 1]! - x0;
    s.box(u.base, x0, 2, w, 11, 2);
    s.rect(u.hi, x0 + 1, 3, w - 2, 2);
    s.rect(u.shade, x0 + 1, 11, w - 2, 1);
    if (tufted) {
      tufts(s, u, x0, w, 6, 0);
      tufts(s, u, x0, w, 9, 2);
    }
    s.box(u.hi, x0, 13, w, 4, 1);
    s.rect(u.base, x0, 17, w, 2);
    s.rect(u.shade, x0, 19, w, 1);
    if (tufted) tufts(s, u, x0, w, 15, 1);
    if (i > 0) {
      s.rect(u.deep, x0, 3, 1, 9);
      s.rect(u.deep, x0, 13, 1, 7);
    }
  }
  s.rect(u.shade, seatL, 20, span, 2);
  s.rect(u.deep, seatL, 22, span, 1);
  if (pillows && !tufted) {
    pillow(s, pillows[0], seatL + 1, 6);
    if (seats > 1) pillow(s, pillows[1], seatL + span - 8, 6);
  }
  for (const x of [L, R - arm + 1]) {
    s.box(u.base, x, 7, arm, 16, 2);
    s.rect(u.hi, x + 1, 8, arm - 2, 3);
    s.rect(u.shade, x + 1, 11, arm - 2, 1);
    s.shade(u.shade, x, 19, arm, 4);
  }
  s.rect(u.deep, L + arm - 1, 11, 1, 11);
  s.rect(u.deep, R - arm + 1, 11, 1, 11);
  s.rect(FOOT, L + 1, 23, 2, 1);
  s.rect(FOOT, R - 2, 23, 2, 1);
  s.outline(u.line);
  return s;
}

// Rows above this belong to the seat (drawn behind a seated avatar); the rest is the backrest,
// drawn in front of them. clario-hq-builder.ts places the two halves.
const COUCH_BACK_SPLIT = 8;

// The same seat seen from behind, people on it facing up the screen.
function couchBack(u: Upholstery, opts: { w: number; seats: number; arm: number; tufted: boolean }) {
  const { w: W, seats, arm, tufted } = opts;
  const s = new PixelSprite(W, 24);
  const L = 1, R = W - 2;
  const seatL = L + arm, span = R - arm - seatL + 1;
  const edges = Array.from({ length: seats + 1 }, (_, i) => seatL + Math.round((span * i) / seats));

  s.rect(u.shade, seatL, 2, span, 7);
  for (let i = 0; i < seats; i++) {
    const x0 = edges[i]!, w = edges[i + 1]! - x0;
    s.box(u.hi, x0, 3, w, 5, 1);
    s.rect(u.base, x0 + 1, 6, w - 2, 2);
    if (i > 0) s.rect(u.deep, x0, 3, 1, 5);
  }
  for (const x of [L, R - arm + 1]) {
    s.box(u.base, x, 2, arm, 10, 1);
    s.rect(u.hi, x + 1, 2, arm - 2, 3);
  }
  const B = COUCH_BACK_SPLIT;
  s.box(u.base, L, B, W - 2, 13, 2);
  s.shade(u.hi, L, B, W - 2, 3);
  s.shade(u.shade, L, B + 3, W - 2, 1);
  s.shade(u.shade, L, B + 4, arm, 7);
  s.shade(u.shade, R - arm + 1, B + 4, arm, 7);
  for (const x of edges.slice(1, -1)) s.shade(u.shade, x, B + 5, 1, 5);
  if (tufted) for (let i = 0; i < seats; i++) tufts(s, u, edges[i]!, edges[i + 1]! - edges[i]!, B + 7, 1);
  s.shade(u.shade, L, B + 10, W - 2, 2);
  s.shade(u.deep, L, B + 12, W - 2, 1);
  s.rect(FOOT, L + 1, 21, 2, 1);
  s.rect(FOOT, R - 2, 21, 2, 1);
  s.outline(u.line);
  return s;
}

// An armchair seen from its left side, facing left: the backrest on the right, the far arm
// behind the seat and the near arm in front of it. Mirrored, it faces right.
function armchairSide(u: Upholstery, tufted: boolean) {
  const s = new PixelSprite(18, 24);
  s.box(u.shade, 2, 4, 11, 6, 2);
  s.rect(u.base, 3, 4, 9, 2);
  s.box(u.hi, 2, 9, 11, 5, 1);
  s.rect(u.base, 2, 12, 10, 2);
  s.box(u.base, 11, 1, 6, 19, 2);
  s.rect(u.hi, 12, 1, 4, 2);
  s.rect(u.hi, 11, 3, 1, 14);
  s.rect(u.shade, 15, 3, 1, 15);
  if (tufted) for (const y of [6, 10, 14]) { s.set(u.deep, 13, y); s.set(u.hi, 13, y - 1); }
  s.box(u.base, 1, 13, 14, 7, 2);
  s.rect(u.hi, 2, 13, 12, 2);
  s.rect(u.shade, 2, 18, 12, 1);
  s.rect(FOOT, 2, 20, 2, 2);
  s.rect(FOOT, 13, 20, 2, 2);
  s.outline(u.line);
  return s;
}

function beanbag(u: Upholstery) {
  const s = new PixelSprite(16, 15);
  s.ellipse(u.base, 8, 8.5, 7, 5.2);
  s.ellipse(u.base, 5.5, 6.2, 4.6, 4.2);
  s.ellipse(u.hi, 5, 4.6, 2.6, 1.5);
  s.ellipse(u.shade, 10, 8.6, 3.4, 2.2);
  s.set(u.hi, 3, 7);
  s.shade(u.shade, 0, 11, 16, 2);
  s.shade(u.deep, 0, 13, 16, 1);
  s.outline(u.line);
  return s;
}

// Meeting chair: a padded shell on four metal legs.
function meetChair(u: Upholstery, view: "down" | "up" | "side") {
  const s = new PixelSprite(16, 21);
  const legs = (top: number) => {
    s.rect(METAL.dark, 3, top, 1, 6);
    s.rect(METAL.dark, 12, top, 1, 6);
    s.rect(METAL.base, 5, top, 1, 4);
    s.rect(METAL.base, 10, top, 1, 4);
  };
  if (view === "down") {
    s.box(u.base, 3, 1, 10, 9, 2);
    s.rect(u.hi, 4, 2, 8, 2);
    s.rect(u.shade, 4, 8, 8, 1);
    s.box(u.hi, 2, 9, 12, 4, 1);
    s.rect(u.base, 2, 13, 12, 1);
    s.rect(u.shade, 2, 14, 12, 1);
    legs(15);
  } else if (view === "up") {
    s.box(u.shade, 2, 7, 12, 5, 1);
    s.box(u.base, 3, 1, 10, 12, 2);
    s.rect(u.hi, 4, 1, 8, 2);
    s.box(u.shade, 5, 4, 6, 6, 1);
    s.rect(u.deep, 3, 12, 10, 1);
    legs(13);
  } else {
    s.box(u.hi, 2, 9, 11, 4, 1);
    s.rect(u.base, 2, 12, 11, 1);
    s.rect(u.shade, 2, 13, 11, 1);
    s.box(u.base, 10, 1, 4, 13, 1);
    s.rect(u.hi, 10, 1, 4, 2);
    s.rect(u.shade, 13, 3, 1, 9);
    s.rect(METAL.dark, 3, 14, 1, 6);
    s.rect(METAL.dark, 12, 14, 1, 6);
    s.rect(METAL.base, 4, 14, 1, 4);
    s.rect(METAL.base, 11, 14, 1, 4);
  }
  s.outline(u.line);
  return s;
}

// Wooden cafe chair with a spindle back.
function cafeChair(view: "down" | "up" | "side") {
  const w = PINE;
  const s = new PixelSprite(14, 21);
  if (view === "down") {
    s.box(w.edge, 2, 0, 10, 10, 1);
    s.rect(w.hi, 3, 1, 8, 2);
    for (const x of [4, 6, 8]) s.rect(w.top, x, 3, 1, 6);
    s.rect(w.dark, 3, 3, 1, 6);
    s.rect(w.dark, 10, 3, 1, 6);
    s.box(w.top, 1, 9, 12, 4, 1);
    s.rect(w.hi, 2, 9, 10, 1);
    s.rect(w.edge, 1, 13, 12, 2);
    s.rect(w.leg, 2, 15, 2, 5);
    s.rect(w.leg, 10, 15, 2, 5);
    s.rect(w.dark, 5, 15, 1, 3);
    s.rect(w.dark, 8, 15, 1, 3);
  } else if (view === "up") {
    s.rect(w.top, 1, 8, 12, 3);
    s.box(w.edge, 2, 0, 10, 13, 1);
    s.rect(w.hi, 3, 1, 8, 2);
    for (const x of [4, 6, 8]) s.rect(w.top, x, 3, 1, 8);
    s.rect(w.dark, 3, 3, 1, 9);
    s.rect(w.dark, 10, 3, 1, 9);
    s.rect(w.leg, 2, 13, 2, 7);
    s.rect(w.leg, 10, 13, 2, 7);
  } else {
    s.box(w.top, 1, 9, 11, 3, 1);
    s.rect(w.hi, 1, 9, 10, 1);
    s.rect(w.edge, 1, 12, 11, 2);
    s.box(w.edge, 9, 0, 3, 13, 1);
    s.rect(w.hi, 9, 0, 3, 1);
    s.rect(w.top, 9, 2, 1, 8);
    s.rect(w.leg, 2, 14, 1, 6);
    s.rect(w.leg, 10, 14, 1, 6);
    s.rect(w.dark, 3, 14, 1, 4);
    s.rect(w.dark, 9, 14, 1, 4);
  }
  s.outline(w.line);
  return s;
}

// Wood grain: short darker streaks across a top, seeded so it never changes.
function grain(s: PixelSprite, wood: Wood, x0: number, y0: number, w: number, h: number, seed: number) {
  const rand = seeded(seed);
  for (let y = y0 + 2; y < y0 + h - 1; y += 3) {
    let x = x0 + 1 + Math.floor(rand() * 6);
    while (x < x0 + w - 4) {
      const len = 4 + Math.floor(rand() * 10);
      s.rect(wood.grain, x, y, Math.min(len, x0 + w - 2 - x), 1);
      x += len + 3 + Math.floor(rand() * 8);
    }
  }
}

// A table seen from above and in front: a grained top, a thick front edge and two legs.
function tableBody(s: PixelSprite, wood: Wood, W: number, topH: number, seed: number) {
  s.rect(wood.leg, 4, topH + 5, 3, 7);
  s.rect(wood.leg, W - 7, topH + 5, 3, 7);
  s.rect(darken(wood.leg, 0.75), 8, topH + 5, 2, 3);
  s.rect(darken(wood.leg, 0.75), W - 10, topH + 5, 2, 3);
  s.box(wood.edge, 1, 2, W - 2, topH + 4, 2);
  s.box(wood.top, 1, 2, W - 2, topH, 2);
  s.rect(wood.hi, 2, 3, W - 4, 1);
  grain(s, wood, 1, 3, W - 2, topH - 2, seed);
  s.rect(wood.dark, 2, topH + 4, W - 4, 1);
}

function laptop(s: PixelSprite, cx: number, y: number) {
  s.rect(0x2f333c, cx - 4, y, 9, 6);
  s.rect(0x6fb5e0, cx - 3, y + 1, 7, 4);
  s.rect(0xbce4f6, cx - 3, y + 1, 7, 1);
  s.rect(0xb9c0cb, cx - 5, y + 6, 11, 2);
  s.rect(0xdde2e9, cx - 5, y + 6, 11, 1);
}

function notebook(s: PixelSprite, cx: number, y: number, cover: number) {
  s.rect(0xf8f8f4, cx - 3, y, 6, 4);
  s.rect(0xd7dbe2, cx - 2, y + 1, 4, 1);
  s.rect(0xd7dbe2, cx - 2, y + 2, 3, 1);
  s.rect(cover, cx + 3, y, 1, 4);
}

function mug(s: PixelSprite, x: number, y: number, color: number) {
  s.rect(color, x, y + 1, 3, 3);
  s.rect(darken(color, 0.6), x, y, 3, 1);
  s.rect(0x5b3a24, x + 1, y, 1, 1);
  s.set(color, x + 3, y + 2);
}

// Long meeting tables: notebooks on the far side, open laptops on the near side.
function meetingTable(tiles: number) {
  const W = tiles * 16;
  const s = new PixelSprite(W, 38);
  tableBody(s, OAK, W, 24, tiles);
  const seats = tiles;
  for (let i = 0; i < seats; i++) {
    const cx = 8 + i * 16;
    notebook(s, cx, 5, [0x3a6ee8, 0xd9534f, 0x4caf6d][i % 3]!);
    laptop(s, cx, 15);
    if (i % 2 === 0) mug(s, cx + 5, 10, 0xf8f8f4);
  }
  s.rect(0x2f333c, W / 2 - 3, 11, 6, 3);
  s.rect(0x4fb3a5, W / 2 - 1, 12, 2, 1);
  s.outline(OAK.line);
  return s;
}

// Workroom table for eight (three a side and one at each end): papers, a mug and a
// conference phone in the middle.
function workroomTable(wood: Wood) {
  const W = 48;
  const s = new PixelSprite(W, 38);
  tableBody(s, wood, W, 24, wood === OAK ? 3 : 4);
  notebook(s, 12, 6, 0x3a6ee8);
  notebook(s, 36, 17, 0xd9534f);
  s.rect(0xf8f8f4, 30, 6, 5, 4);
  s.rect(0xd7dbe2, 31, 7, 3, 1);
  mug(s, 14, 16, 0xf8f8f4);
  s.ellipse(0x2f333c, 24, 13, 3.5, 2);
  s.rect(0x4fb3a5, 23, 12, 2, 1);
  s.outline(wood.line);
  return s;
}

function coffeeTable() {
  const w = OAK;
  const s = new PixelSprite(46, 18);
  s.rect(w.leg, 9, 10, 2, 6);
  s.rect(w.leg, 35, 10, 2, 6);
  s.ellipse(w.edge, 23, 8.6, 21.5, 5.4);
  s.ellipse(w.top, 23, 7.2, 21.5, 5);
  s.ellipse(w.hi, 15, 5, 8, 1.4);
  s.rect(w.grain, 26, 6, 9, 1);
  s.rect(w.grain, 11, 9, 7, 1);
  s.rect(w.grain, 29, 9, 6, 1);
  s.rect(0x5f86d0, 8, 6, 7, 3);
  s.rect(0x8fb0ec, 8, 6, 7, 1);
  s.rect(0xf2efe6, 15, 7, 1, 2);
  mug(s, 20, 6, 0xf8f8f4);
  s.rect(0xb26a3f, 30, 6, 4, 3);
  s.rect(0x8c4f2d, 30, 8, 4, 1);
  s.ellipse(LEAF.front, 32, 4.5, 2.6, 1.8);
  s.set(LEAF.light, 31, 3);
  s.set(LEAF.back, 34, 5);
  s.outline((near) => (leafy.has(near) ? LEAF.edge : w.line));
  return s;
}

// Small side table with a drawer and something on top: a table lamp, a desk lamp or books.
function sideTable(variant: number) {
  const w = OAK;
  const s = new PixelSprite(14, 21);
  s.rect(w.leg, 2, 15, 2, 4);
  s.rect(w.leg, 10, 15, 2, 4);
  s.box(w.edge, 1, 8, 12, 8, 1);
  s.box(w.top, 1, 8, 12, 4, 1);
  s.rect(w.hi, 2, 9, 6, 1);
  s.rect(w.dark, 2, 15, 10, 1);
  s.rect(w.dark, 6, 13, 2, 1);
  if (variant === 0) {
    s.rect(0xb7bcc6, 5, 9, 4, 1);
    s.rect(0x8a8f99, 6, 5, 2, 4);
    s.rect(0xfbf0d6, 5, 0, 4, 1);
    s.rect(0xf6e7c8, 4, 1, 6, 2);
    s.rect(0xf0dcb2, 3, 3, 8, 2);
  } else if (variant === 1) {
    s.ellipse(0x3a6ee8, 4.5, 9.5, 2.5, 1);
    s.rect(0x2f5ec4, 4, 6, 1, 3);
    s.rect(0x2f5ec4, 5, 4, 1, 2);
    s.rect(0x2f5ec4, 6, 3, 2, 1);
    s.rect(0x3a6ee8, 7, 2, 4, 3);
    s.rect(0x6f98f0, 7, 2, 4, 1);
    s.rect(0xfff1c4, 8, 5, 2, 1);
  } else {
    s.rect(0x4caf6d, 3, 7, 8, 2);
    s.rect(0x7cc98f, 3, 7, 8, 1);
    s.rect(0xf2efe6, 10, 8, 1, 1);
    s.rect(0x3a6ee8, 4, 5, 7, 2);
    s.rect(0x6f98f0, 4, 5, 7, 1);
  }
  s.outline((near) => (near === 0xfbf0d6 || near === 0xf6e7c8 || near === 0xf0dcb2 ? 0xa9926a : darken(near, 0.5)));
  return s;
}

// Round cafe table on a pedestal: bare, with two mugs, or with a kettle and a cup.
function roundTable(variant: number) {
  const w = CAFE_WOOD;
  const s = new PixelSprite(16, 21);
  s.rect(w.leg, 7, 10, 2, 7);
  s.ellipse(w.leg, 8, 17.6, 4.5, 1.3);
  s.ellipse(w.edge, 8, 8.4, 7, 4.6);
  s.ellipse(w.top, 8, 7.6, 7, 4);
  s.ellipse(w.hi, 5.8, 5.8, 3, 1.1);
  s.rect(w.grain, 8, 8, 4, 1);
  if (variant === 1) {
    mug(s, 3, 5, 0x3d6fd6);
    mug(s, 8, 6, 0xe0559a);
  } else if (variant === 2) {
    s.ellipse(0xc5cbd5, 7, 6, 3, 2.6);
    s.rect(0xe8ecf1, 6, 4, 2, 1);
    s.rect(0x8a919e, 6, 3, 2, 1);
    s.rect(0xc5cbd5, 10, 5, 2, 1);
    s.set(0x9aa2af, 7, 8);
    s.rect(0xf8f8f4, 10, 8, 3, 2);
    s.rect(0xd7dbe2, 10, 8, 3, 1);
  }
  s.outline((near) => (near === 0xc5cbd5 || near === 0xe8ecf1 ? 0x5f6672 : w.line));
  return s;
}

// The coffee station: a round table with a coffee machine, a mug and a sugar jar.
function coffeeBar() {
  const w = CAFE_WOOD;
  const s = new PixelSprite(32, 24);
  s.rect(w.leg, 15, 14, 2, 6);
  s.ellipse(w.leg, 16, 20.6, 6, 1.4);
  s.ellipse(w.edge, 16, 12.2, 14.5, 5);
  s.ellipse(w.top, 16, 11.4, 14.5, 4.4);
  s.ellipse(w.hi, 10, 9.6, 5, 1.2);
  s.box(0x3b3f4a, 8, 1, 10, 12, 1);
  s.rect(0x4d525e, 9, 2, 8, 2);
  s.rect(0x2a2e38, 9, 5, 8, 1);
  s.rect(0x1f2229, 10, 6, 6, 5);
  s.rect(0x8a919e, 12, 6, 2, 1);
  s.rect(0xf0a23a, 11, 9, 4, 3);
  s.rect(0xffc56b, 11, 9, 4, 1);
  s.rect(0x5b3a24, 12, 9, 2, 1);
  s.set(0x6fd08c, 15, 3);
  mug(s, 21, 9, 0xf8f8f4);
  s.rect(0xe9e4d8, 25, 8, 3, 4);
  s.rect(0xc9c2b2, 25, 8, 3, 1);
  s.outline((near) => (near === 0x3b3f4a || near === 0x4d525e ? 0x15181d : w.line));
  return s;
}

// Tall bookshelf, in wood or in grey metal, three shelves of books with a plant and a box.
function bookshelf(metal: boolean) {
  const f = metal
    ? { hi: 0xeef1f5, frame: 0xd6dbe3, side: 0xb9c0ca, back: 0x8c95a3, shelf: 0xc5ccd6, line: 0x59616f }
    : { hi: 0xbf8c56, frame: 0xa77744, side: 0x8a5f35, back: 0x5c3d22, shelf: 0xc9965e, line: 0x3e2716 };
  const s = new PixelSprite(32, 46);
  const rand = seeded(metal ? 21 : 9);
  s.box(f.frame, 1, 1, 30, 43, 1);
  s.rect(f.side, 29, 2, 2, 41);
  s.rect(f.hi, 2, 1, 27, 1);
  const colors = [0xd9534f, 0x3a6ee8, 0xf2c14e, 0x4caf6d, 0xeee8da, 0x7a5fd0, 0xe58f6a, 0x3fb3c4, 0x3e4553];
  for (const [top, bottom] of [[3, 13], [16, 26], [29, 39]] as const) {
    s.rect(f.back, 3, top, 26, bottom - top + 1);
    s.rect(darken(f.back, 0.8), 3, top, 26, 1);
    let x = 3;
    while (x < 28) {
      const roll = rand();
      if (roll < 0.1 && x < 22) {
        s.rect(0xf1eee8, x + 1, bottom - 3, 4, 4);
        s.rect(0xd3cec4, x + 4, bottom - 3, 1, 4);
        s.ellipse(LEAF.front, x + 3, bottom - 5, 2.6, 2);
        s.set(LEAF.light, x + 2, bottom - 6);
        x += 7;
        continue;
      }
      if (roll < 0.18 && x < 23) {
        s.rect(0xd6c39a, x, bottom - 4, 5, 5);
        s.rect(0xe6d6ae, x, bottom - 4, 5, 1);
        x += 6;
        continue;
      }
      const bw = rand() < 0.4 ? 3 : 2;
      const bh = 6 + Math.floor(rand() * 4);
      const color = colors[Math.floor(rand() * colors.length)]!;
      const width = Math.min(bw, 29 - x);
      s.rect(color, x, bottom - bh + 1, width, bh);
      s.rect(darken(color, 0.72), x + width - 1, bottom - bh + 1, 1, bh);
      s.rect(0xf8f4ea, x, bottom - bh + 3, width - 1, 1);
      x += width;
    }
    s.rect(f.shelf, 2, bottom + 1, 27, 2);
    s.rect(darken(f.shelf, 0.82), 2, bottom + 2, 27, 1);
  }
  s.rect(f.side, 2, 42, 27, 2);
  s.outline(f.line);
  return s;
}

// Mobile whiteboard on castors: a diagram, notes and stickies, with a pen tray.
function whiteboard() {
  const s = new PixelSprite(32, 44);
  for (const x of [3, 27]) {
    s.rect(METAL.base, x, 4, 2, 36);
    s.rect(METAL.dark, x + 1, 4, 1, 36);
  }
  s.rect(METAL.base, 5, 33, 22, 1);
  s.rect(METAL.base, 1, 38, 7, 2);
  s.rect(METAL.base, 24, 38, 7, 2);
  for (const x of [1, 6, 24, 29]) s.rect(0x2f333c, x, 40, 2, 2);
  s.box(0xb9c0cb, 1, 1, 30, 24, 1);
  s.rect(0xfbfcfd, 2, 2, 28, 21);
  s.rect(0xeef1f5, 2, 20, 28, 3);
  const ink = 0x5b84d6;
  s.rect(ink, 4, 4, 8, 1); s.rect(ink, 4, 8, 8, 1); s.rect(ink, 4, 4, 1, 5); s.rect(ink, 11, 4, 1, 5);
  s.rect(ink, 13, 5, 6, 1); s.rect(ink, 13, 7, 4, 1);
  s.rect(ink, 13, 11, 1, 1); s.rect(ink, 14, 10, 1, 1); s.rect(ink, 15, 9, 3, 1); s.rect(ink, 17, 10, 1, 1);
  s.rect(0x58b368, 4, 12, 3, 3);
  s.rect(ink, 8, 13, 9, 1); s.rect(ink, 8, 15, 6, 1);
  s.rect(ink, 4, 18, 11, 1); s.rect(ink, 17, 18, 5, 1);
  s.rect(0xf6c945, 22, 3, 5, 5); s.rect(0xfadf86, 22, 3, 5, 1);
  s.rect(0xf29b38, 25, 6, 4, 4); s.rect(0xf7bd75, 25, 6, 4, 1);
  s.rect(0xd9534f, 21, 13, 6, 1); s.rect(0xd9534f, 21, 15, 4, 1);
  s.rect(0x9aa2af, 3, 25, 26, 2);
  s.rect(0xd9534f, 6, 25, 3, 1); s.rect(0x3a6ee8, 10, 25, 3, 1); s.rect(0x2a2e38, 20, 24, 4, 2);
  s.outline(METAL.line);
  return s;
}

// Flip chart on an easel: a bar chart on the front sheet.
function flipChart() {
  const s = new PixelSprite(16, 38);
  s.rect(0x4a4f5c, 7, 22, 2, 12);
  s.rect(METAL.dark, 3, 18, 1, 18);
  s.rect(METAL.dark, 12, 18, 1, 18);
  s.rect(METAL.dark, 2, 34, 2, 2);
  s.rect(METAL.dark, 12, 34, 2, 2);
  s.rect(METAL.base, 2, 21, 12, 1);
  s.box(0x3b3f4a, 1, 2, 14, 19, 1);
  s.rect(0xfdfdfb, 2, 3, 12, 17);
  s.rect(0xeceef2, 2, 18, 12, 2);
  s.rect(0x3b3f4a, 5, 1, 6, 2);
  s.rect(0x4fb3a5, 4, 5, 6, 1);
  s.rect(0x9aa2af, 4, 7, 4, 1);
  s.rect(0x4fb3a5, 4, 13, 2, 4);
  s.rect(0x4fb3a5, 7, 11, 2, 6);
  s.rect(0x3fc5d6, 10, 9, 2, 8);
  s.rect(0x8c94a1, 3, 17, 10, 1);
  s.outline(METAL.line);
  return s;
}

// Metal filing cabinet with three drawers, blue or grey.
function filingCabinet(grey: boolean) {
  const c = grey
    ? { hi: 0xe4e8ee, top: 0xccd2db, face: 0xb3bac6, dark: 0x8b93a2, line: 0x4f5664 }
    : { hi: 0x8dbaf3, top: 0x629be6, face: 0x4a80d2, dark: 0x3463ad, line: 0x1d3a70 };
  const s = new PixelSprite(16, 28);
  s.box(c.face, 1, 2, 14, 23, 1);
  s.rect(c.top, 1, 2, 14, 3);
  s.rect(c.hi, 2, 2, 12, 1);
  s.rect(c.dark, 13, 5, 2, 20);
  for (const y of [5, 12, 19]) {
    s.rect(c.dark, 2, y, 11, 1);
    s.rect(0xf3f5f8, 5, y + 2, 5, 2);
    s.rect(0xd9dee6, 5, y + 3, 5, 1);
    s.rect(c.hi, 6, y + 5, 3, 1);
  }
  s.rect(0x2f333c, 2, 25, 2, 1);
  s.rect(0x2f333c, 12, 25, 2, 1);
  s.outline(c.line);
  return s;
}

// White cubicle desk: a drawer pedestal on the right, an open laptop and a notepad. Variant 0
// suits a chair below it (the screen faces you), variant 1 a chair above it (the lid faces you).
function whiteDesk(variant: number) {
  const s = new PixelSprite(32, 30);
  s.rect(0x8a919e, 2, 20, 2, 8);
  s.rect(0x6c7282, 3, 20, 1, 8);
  s.box(0xdfe3ea, 21, 18, 9, 10, 1);
  s.rect(0xc8ced8, 21, 22, 9, 1);
  s.rect(0xc8ced8, 21, 25, 9, 1);
  s.rect(0x8a919e, 24, 20, 3, 1);
  s.rect(0x8a919e, 24, 23, 3, 1);
  s.box(0x9aa2af, 0, 9, 32, 11, 1);
  s.box(0xf6f7fa, 0, 9, 32, 8, 1);
  s.rect(0xffffff, 1, 10, 30, 1);
  s.rect(0x6f7686, 1, 18, 30, 1);
  if (variant === 1) {
    s.rect(0xb9c0cb, 5, 5, 11, 2);
    s.rect(0xc5cbd5, 6, 6, 9, 7);
    s.rect(0xdde2e9, 6, 6, 9, 1);
    s.rect(0xf3f5f8, 10, 9, 1, 2);
  } else laptop(s, 10, 6);
  s.rect(0xfdf6c9, 19, 12, 5, 4);
  s.rect(0xe8d98a, 20, 13, 3, 1);
  mug(s, 26, 11, 0x3a6ee8);
  s.outline(0x4f5664);
  return s;
}

// A small potted tree with a twisted trunk and a cloud of leaves, for desks and corners.
function pottedTree() {
  const s = new PixelSprite(22, 44);
  s.box(0x4a5160, 6, 35, 10, 8, 2);
  s.rect(0x5e6676, 5, 34, 12, 2);
  s.rect(0x3a404c, 13, 37, 2, 5);
  s.rect(0x3b2a20, 7, 34, 8, 1);
  s.rect(0xc9826a, 10, 22, 2, 12);
  s.rect(0xa96650, 11, 25, 1, 9);
  s.rect(0xc9826a, 9, 28, 1, 3);
  s.rect(0xc9826a, 8, 21, 2, 2);
  s.rect(0xc9826a, 12, 20, 2, 2);
  const clumps: [number, number, number, number][] = [[6, 15, 5, 4], [16, 14, 5, 4.2], [11, 8, 6.5, 5.5], [11, 17, 5.5, 4], [5, 9, 4, 3.5], [17, 8, 4, 3.5]];
  for (const [x, y, rx, ry] of clumps) s.ellipse(LEAF.back, x, y, rx + 0.8, ry + 0.8);
  for (const [x, y, rx, ry] of clumps) s.ellipse(LEAF.front, x - 0.4, y - 0.5, rx, ry);
  for (const [x, y, rx, ry] of clumps) s.ellipse(LEAF.light, x - 1.4, y - 1.6, rx * 0.45, ry * 0.4);
  for (const [x, y] of [[14, 5], [4, 13], [13, 14], [9, 3], [18, 12], [7, 18]] as const) s.set(LEAF.light, x, y);
  for (const [x, y] of [[3, 10], [15, 17], [9, 12], [18, 6], [12, 11]] as const) s.set(LEAF.back, x, y);
  s.outline((near) => (leafy.has(near) ? LEAF.edge : 0x23262e));
  return s;
}

type Bake = { key: string; sprite: PixelSprite; mirror?: boolean; fromRow?: number; toRow?: number };

// Every piece, with the key it is placed by. A couch seen from behind is baked twice: its seat
// (`-seat`, behind a seated avatar) and its backrest (in front of them).
function pieces(): Bake[] {
  const out: Bake[] = [];
  const backView = (key: string, sprite: PixelSprite) => {
    out.push({ key, sprite, fromRow: COUCH_BACK_SPLIT });
    out.push({ key: `${key}-seat`, sprite, toRow: COUCH_BACK_SPLIT });
  };
  for (const [fabric, u] of Object.entries(UPHOLSTERY) as [Fabric, Upholstery][]) {
    const tufted = fabric === "leather";
    const sofa = { w: 48, seats: 3, arm: 6, tufted };
    out.push({ key: `hq-sofa-${fabric}-down`, sprite: couchFront(u, { ...sofa, pillows: PILLOWS[fabric] }) });
    backView(`hq-sofa-${fabric}-up`, couchBack(u, sofa));
    const chair = { w: 20, seats: 1, arm: 5, tufted };
    out.push({ key: `hq-armchair-${fabric}-down`, sprite: couchFront(u, chair) });
    backView(`hq-armchair-${fabric}-up`, couchBack(u, chair));
    const side = armchairSide(u, tufted);
    out.push({ key: `hq-armchair-${fabric}-left`, sprite: side });
    out.push({ key: `hq-armchair-${fabric}-right`, sprite: side, mirror: true });
    out.push({ key: `hq-beanbag-${fabric}`, sprite: beanbag(u) });
    out.push({ key: `hq-meet-chair-${fabric}-down`, sprite: meetChair(u, "down") });
    out.push({ key: `hq-meet-chair-${fabric}-up`, sprite: meetChair(u, "up") });
    const meetSide = meetChair(u, "side");
    out.push({ key: `hq-meet-chair-${fabric}-left`, sprite: meetSide });
    out.push({ key: `hq-meet-chair-${fabric}-right`, sprite: meetSide, mirror: true });
  }
  out.push({ key: "hq-cafe-chair-down", sprite: cafeChair("down") });
  out.push({ key: "hq-cafe-chair-up", sprite: cafeChair("up") });
  const cafeSide = cafeChair("side");
  out.push({ key: "hq-cafe-chair-left", sprite: cafeSide });
  out.push({ key: "hq-cafe-chair-right", sprite: cafeSide, mirror: true });

  out.push({ key: "hq-meeting-table", sprite: meetingTable(6) });
  out.push({ key: "hq-meeting-table-sm", sprite: meetingTable(4) });
  out.push({ key: "hq-meeting-table-md-0", sprite: workroomTable(OAK) });
  out.push({ key: "hq-meeting-table-md-1", sprite: workroomTable(WALNUT) });
  out.push({ key: "hq-coffee-table", sprite: coffeeTable() });
  for (let v = 0; v < 3; v++) out.push({ key: `hq-side-table-${v}`, sprite: sideTable(v) });
  for (let v = 0; v < 3; v++) out.push({ key: `hq-round-table-${v}`, sprite: roundTable(v) });
  out.push({ key: "hq-coffee-bar", sprite: coffeeBar() });
  out.push({ key: "hq-bookshelf-0", sprite: bookshelf(false) });
  out.push({ key: "hq-bookshelf-1", sprite: bookshelf(true) });
  out.push({ key: "hq-whiteboard", sprite: whiteboard() });
  out.push({ key: "hq-flip-chart", sprite: flipChart() });
  out.push({ key: "hq-filing-cabinet-0", sprite: filingCabinet(false) });
  out.push({ key: "hq-filing-cabinet-1", sprite: filingCabinet(true) });
  out.push({ key: "hq-desk-white-0", sprite: whiteDesk(0) });
  out.push({ key: "hq-desk-white-1", sprite: whiteDesk(1) });
  out.push({ key: "hq-plant-big", sprite: leafyPlant(24, 34, 0.95) });
  out.push({ key: "hq-plant-small", sprite: leafyPlant(18, 22, 0.7) });
  out.push({ key: "hq-plant-tree", sprite: pottedTree() });
  return out;
}

export function makeOfficeTextures(scene: Phaser.Scene) {
  for (const { key, sprite, ...opts } of pieces()) sprite.bake(scene, key, opts);
}
