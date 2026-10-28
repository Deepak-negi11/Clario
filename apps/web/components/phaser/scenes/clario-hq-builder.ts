import Phaser from "phaser";
import {
  HQ_FLOORS, HQ_ITEMS, HQ_PATH, HQ_RUGS, HQ_TALL_WALLS, HQ_THIN_WALLS, HQ_TREES, HQ_WALL_DECOR,
  ITEM_SPECS, hqWallCells,
  type Dir, type Fabric, type FloorKind, type HqItem, type RugStyle, type WallStyle,
} from "../../../lib/maps/clario-hq";

// Draws the Clario HQ map: tall walls with windows, patterned floors, rugs and
// furniture, all painted in code. Layout comes from lib/maps/clario-hq.ts.

const TILE = 32;
const P = 2; // one art pixel = 2x2 world pixels, same as the avatars

export type HqSceneApi = {
  block: (x: number, y: number) => void;
  wall: (x: number, y: number) => void;
  seat: (x: number, y: number, dir: Dir, lift?: number) => void;
  shadow: (cx: number, bottomY: number, width: number) => void;
};

export const HQ_FLOOR_COLORS: Record<FloorKind, number> = {
  wood: 0xd8a86f, carpet: 0x8e9bb5, tile: 0xece9e2, herringbone: 0xb27d4f,
  terrazzo: 0xe2dfd8, sage: 0xa7bb9c, arcade: 0x1f418a, sand: 0xe2d2b4, office: 0xc4cad5,
  raised: 0x9aa3ae, concrete: 0xb9b7b2, teal: 0x5fa8a0,
};

const C = {
  ink: 0x2a2e38, white: 0xf8f6f1, off: 0xe7e2d8, grey: 0xd3d7de, greyMid: 0xa9afbb, greyDark: 0x6c7282, metal: 0x9aa3b2,
  woodHi: 0xf2d6a8, woodTop: 0xe3bc87, wood: 0xcf9f66, woodEdge: 0xad7b46, woodDark: 0x86603a, woodDeep: 0x664628,
  screen: 0x6fb5e0, screenHi: 0xbce4f6, screenDark: 0x3f7fae,
  leafDark: 0x2c6e47, leaf: 0x42a061, leafHi: 0x7fcb8f, pot: 0xf1eee8, potShade: 0xd3cec4, terra: 0xc8714b, terraDark: 0x9a5034,
  accent: 0x3a6ee8, red: 0xd9534f, yellow: 0xf2c14e, green: 0x4caf6d, purple: 0x7a5fd0, pink: 0xe58fb0, cyan: 0x3fc5d6,
};

const FABRICS: Record<Fabric, { dark: number; mid: number; light: number }> = {
  navy: { dark: 0x27355f, mid: 0x3a4f8a, light: 0x5d74b3 },
  coral: { dark: 0xa8473c, mid: 0xd4675a, light: 0xee9584 },
  teal: { dark: 0x1d6862, mid: 0x2c8c84, light: 0x56b2a8 },
  mustard: { dark: 0xa8761c, mid: 0xd29c33, light: 0xeec463 },
  sage: { dark: 0x56724f, mid: 0x76946d, light: 0x9fba95 },
  grey: { dark: 0x4d5260, mid: 0x6c7282, light: 0x9198a8 },
};

type Px = (color: number, x: number, y: number, w?: number, h?: number) => void;

// Same seeded random everywhere so the map looks identical for everyone.
function seeded(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
}

export function makeHqTextures(scene: Phaser.Scene) {
  if (scene.textures.exists("hq-desk-l")) return;
  makeFloors(scene);
  makeFurniture(scene);
}

function makeFloors(scene: Phaser.Scene) {
  const g = scene.add.graphics();
  const rand = seeded(11);
  const fill = (color: number, x: number, y: number, w: number, h: number, alpha = 1) => {
    g.fillStyle(color, alpha);
    g.fillRect(x, y, w, h);
  };

  // Honey wood planks, 8px tall with staggered joints.
  g.clear();
  const planks = [0xd9a86f, 0xd2a066, 0xdcaf78, 0xd5a46b];
  for (let i = 0; i < 8; i++) {
    fill(planks[i % 4]!, 0, i * 8, 64, 8);
    fill(0xe3b886, 0, i * 8, 64, 1, 0.6);
    fill(0xb8844b, 0, i * 8 + 7, 64, 1);
    const joint = (i * 23) % 32;
    fill(0xb8844b, joint, i * 8, 1, 7);
    fill(0xb8844b, joint + 32, i * 8, 1, 7);
    for (let k = 0; k < 3; k++) fill(0xc89559, Math.floor(rand() * 60), i * 8 + 2 + Math.floor(rand() * 4), 4 + Math.floor(rand() * 6), 1, 0.7);
  }
  g.generateTexture("hq-floor-wood", 64, 64);

  // Office carpet tiles with a soft fleck.
  g.clear();
  fill(0x8e9bb5, 0, 0, 64, 64);
  for (let i = 0; i < 260; i++) fill(rand() < 0.5 ? 0x8693ad : 0x97a4bd, Math.floor(rand() * 64), Math.floor(rand() * 64), 1, 1);
  fill(0x8290aa, 0, 31, 64, 1, 0.8); fill(0x8290aa, 31, 0, 1, 64, 0.8);
  fill(0x8290aa, 0, 63, 64, 1, 0.8); fill(0x8290aa, 63, 0, 1, 64, 0.8);
  g.generateTexture("hq-floor-carpet", 64, 64);

  // Kitchen tiles.
  g.clear();
  for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) fill((x + y) % 2 ? 0xe5e1d8 : 0xf3f1ec, x * 16, y * 16, 16, 16);
  for (let i = 0; i < 4; i++) { fill(0xd3cdc1, i * 16, 0, 1, 64); fill(0xd3cdc1, 0, i * 16, 64, 1); }
  g.generateTexture("hq-floor-tile", 64, 64);

  // Parquet: 16px blocks of planks, alternating direction.
  g.clear();
  const parquet = [0xb98451, 0xab7647, 0xc48e5a, 0xb07c4c];
  for (let bx = 0; bx < 4; bx++) for (let by = 0; by < 4; by++) {
    const vertical = (bx + by) % 2 === 0;
    for (let s = 0; s < 4; s++) {
      const color = parquet[(bx * 3 + by + s) % 4]!;
      if (vertical) fill(color, bx * 16 + s * 4, by * 16, 4, 16); else fill(color, bx * 16, by * 16 + s * 4, 16, 4);
      if (vertical) fill(0x8f6037, bx * 16 + s * 4 + 3, by * 16, 1, 16, 0.6); else fill(0x8f6037, bx * 16, by * 16 + s * 4 + 3, 16, 1, 0.6);
    }
    fill(0x80552f, bx * 16, by * 16, 16, 1, 0.5); fill(0x80552f, bx * 16, by * 16, 1, 16, 0.5);
  }
  g.generateTexture("hq-floor-herringbone", 64, 64);

  // Terrazzo with stone chips.
  g.clear();
  fill(0xe2dfd8, 0, 0, 64, 64);
  const chips = [0xc9c4bb, 0xb7b0a5, 0xf3f0ea, 0xd8a48f, 0x9fb4c7, 0xc9c4bb];
  for (let i = 0; i < 70; i++) {
    const size = rand() < 0.25 ? 2 : 1;
    fill(chips[Math.floor(rand() * chips.length)]!, Math.floor(rand() * 63), Math.floor(rand() * 63), size, size);
  }
  fill(0xd2cdc4, 0, 31, 64, 1); fill(0xd2cdc4, 31, 0, 1, 64); fill(0xd2cdc4, 0, 63, 64, 1); fill(0xd2cdc4, 63, 0, 1, 64);
  g.generateTexture("hq-floor-terrazzo", 64, 64);

  // Sage library carpet with a small diamond weave.
  g.clear();
  fill(0xa7bb9c, 0, 0, 64, 64);
  for (let x = 0; x < 64; x += 8) for (let y = 0; y < 64; y += 8) {
    fill(0x9bb090, x + 3, y + 1, 2, 1); fill(0x9bb090, x + 2, y + 2, 1, 2); fill(0x9bb090, x + 5, y + 2, 1, 2); fill(0x9bb090, x + 3, y + 4, 2, 1);
  }
  g.generateTexture("hq-floor-sage", 64, 64);

  // Game Room: deep blue carpet tiles, a darker shade of the room's #3686FF.
  g.clear();
  for (let tx = 0; tx < 2; tx++) for (let ty = 0; ty < 2; ty++) {
    const x0 = tx * 32, y0 = ty * 32, turned = (tx + ty) % 2 === 1;
    fill(turned ? 0x22478f : 0x1f418a, x0, y0, 32, 32);
    for (let s = 2; s < 32; s += 4) {
      if (turned) fill(0x1c3b7d, x0 + s, y0 + 1, 1, 30); else fill(0x1c3b7d, x0 + 1, y0 + s, 30, 1);
    }
    fill(0x18346f, x0, y0 + 31, 32, 1); fill(0x18346f, x0 + 31, y0, 1, 32);
  }
  g.generateTexture("hq-floor-arcade", 64, 64);

  // Focus rooms: a soft sand carpet, calmer than the wood corridor outside.
  g.clear();
  fill(0xe2d2b4, 0, 0, 64, 64);
  for (let i = 0; i < 220; i++) fill(rand() < 0.5 ? 0xdac9a9 : 0xe9dbc0, Math.floor(rand() * 64), Math.floor(rand() * 64), 1, 1);
  fill(0xd6c5a5, 0, 63, 64, 1, 0.7); fill(0xd6c5a5, 63, 0, 1, 64, 0.7);
  g.generateTexture("hq-floor-sand", 64, 64);

  // Open Desks: light grey carpet tiles, laid with the stripes turning a quarter each tile.
  g.clear();
  for (let tx = 0; tx < 2; tx++) for (let ty = 0; ty < 2; ty++) {
    const x0 = tx * 32, y0 = ty * 32;
    fill((tx + ty) % 2 ? 0xc0c7d2 : 0xc7cdd8, x0, y0, 32, 32);
    for (let s = 2; s < 32; s += 4) {
      if ((tx + ty) % 2) fill(0xb9c0cc, x0 + s, y0 + 1, 1, 30, 0.8); else fill(0xbec5d0, x0 + 1, y0 + s, 30, 1, 0.8);
    }
    fill(0xb2b9c6, x0, y0 + 31, 32, 1); fill(0xb2b9c6, x0 + 31, y0, 1, 32);
  }
  g.generateTexture("hq-floor-office", 64, 64);

  // Server Room: raised access-floor panels, some of them perforated for cooling.
  g.clear();
  for (let tx = 0; tx < 2; tx++) for (let ty = 0; ty < 2; ty++) {
    const x0 = tx * 32, y0 = ty * 32;
    fill(0x9aa3ae, x0, y0, 32, 32); fill(0xa9b1bb, x0 + 1, y0 + 1, 30, 1);
    if ((tx + ty) % 2 === 0) for (let hx = 4; hx < 30; hx += 4) for (let hy = 4; hy < 30; hy += 4) fill(0x7d8692, x0 + hx, y0 + hy, 1, 1);
    fill(0x6f7884, x0, y0 + 31, 32, 1); fill(0x6f7884, x0 + 31, y0, 1, 32);
  }
  g.generateTexture("hq-floor-raised", 64, 64);

  // Maker Lab: polished concrete with faint patches and saw-cut joints.
  g.clear();
  fill(0xb9b7b2, 0, 0, 64, 64);
  for (let i = 0; i < 40; i++) fill(rand() < 0.5 ? 0xb1afaa : 0xc2c0bb, Math.floor(rand() * 60), Math.floor(rand() * 60), 3 + Math.floor(rand() * 4), 2);
  fill(0xa29f99, 0, 63, 64, 1); fill(0xa29f99, 63, 0, 1, 64);
  g.generateTexture("hq-floor-concrete", 64, 64);

  // Hack Space: teal carpet tiles.
  g.clear();
  for (let tx = 0; tx < 2; tx++) for (let ty = 0; ty < 2; ty++) {
    const x0 = tx * 32, y0 = ty * 32, turned = (tx + ty) % 2 === 1;
    fill(turned ? 0x62aba3 : 0x5ca39b, x0, y0, 32, 32);
    for (let st = 2; st < 32; st += 4) {
      if (turned) fill(0x56998f, x0 + st, y0 + 1, 1, 30); else fill(0x56998f, x0 + 1, y0 + st, 30, 1);
    }
    fill(0x4b8b83, x0, y0 + 31, 32, 1); fill(0x4b8b83, x0 + 31, y0, 1, 32);
  }
  g.generateTexture("hq-floor-teal", 64, 64);

  // Stone pavers for the front path.
  g.clear();
  fill(0xcfc9bd, 0, 0, 32, 32);
  fill(0xbab3a5, 0, 15, 32, 1); fill(0xbab3a5, 0, 31, 32, 1); fill(0xbab3a5, 15, 0, 1, 15); fill(0xbab3a5, 7, 16, 1, 15); fill(0xbab3a5, 23, 16, 1, 15);
  fill(0xdcd7cc, 1, 1, 13, 1); fill(0xdcd7cc, 17, 1, 13, 1);
  g.generateTexture("hq-path", 32, 32);

  g.destroy();
}

function makeFurniture(scene: Phaser.Scene) {
  const make = (key: string, w: number, h: number, paint: (px: Px) => void, mirror = false) => {
    const g = scene.add.graphics();
    const px: Px = (color, x, y, pw = 1, ph = 1) => {
      g.fillStyle(color, 1);
      g.fillRect((mirror ? w - x - pw : x) * P, y * P, pw * P, ph * P);
    };
    paint(px);
    g.generateTexture(key, w * P, h * P);
    g.destroy();
  };
  // Rounded rectangle: corner pixels left out.
  const round = (px: Px, color: number, x: number, y: number, w: number, h: number) => {
    px(color, x + 1, y, w - 2, 1);
    px(color, x, y + 1, w, h - 2);
    px(color, x + 1, y + h - 1, w - 2, 1);
  };
  // Filled pixel ellipse.
  const blob = (px: Px, color: number, cx: number, cy: number, rx: number, ry = rx) => {
    for (let dy = -Math.floor(ry); dy <= Math.floor(ry); dy++) {
      const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry))));
      if (half > 0) px(color, Math.round(cx - half), Math.round(cy + dy), half * 2, 1);
    }
  };
  const leaves = (px: Px, spots: [number, number, number][]) => {
    for (const [x, y, r] of spots) blob(px, C.ink, x, y, r + 1);
    for (const [x, y, r] of spots) blob(px, C.leafDark, x, y, r);
    for (const [x, y, r] of spots) blob(px, C.leaf, x - 0.5, y - 0.5, r - 1);
    for (const [x, y, r] of spots) if (r >= 3) blob(px, C.leafHi, x - 1, y - 1.5, Math.max(1, r - 3));
  };

  // Desk with a monitor on the left half; the right one is mirrored.
  const desk = (px: Px) => {
    px(C.ink, 2, 23, 2, 7); px(C.ink, 28, 23, 2, 7); px(C.greyDark, 2, 23, 1, 7); px(C.greyDark, 28, 23, 1, 7);
    px(C.ink, 0, 11, 32, 13);
    px(C.woodTop, 1, 12, 30, 7); px(C.woodHi, 1, 12, 30, 1); px(C.wood, 1, 19, 30, 1);
    px(C.woodEdge, 1, 20, 30, 3); px(C.woodDark, 1, 22, 30, 1);
    px(C.ink, 1, 0, 14, 11); px(C.screenDark, 2, 1, 12, 8); px(C.screen, 2, 1, 12, 6); px(C.screenHi, 2, 1, 12, 2);
    px(0xe4f3fa, 3, 4, 5, 1); px(0xe4f3fa, 3, 6, 7, 1); px(C.accent, 10, 4, 3, 3);
    px(C.ink, 7, 11, 2, 2); px(C.greyDark, 5, 13, 6, 1);
    px(0xdfe3ea, 3, 15, 10, 2); px(0xb9bfca, 4, 16, 8, 1); px(C.white, 14, 16, 2, 1);
    px(C.white, 18, 13, 5, 4); px(C.grey, 19, 14, 3, 1); px(C.grey, 19, 15, 2, 1);
    px(C.ink, 24, 14, 3, 3); px(C.red, 24, 14, 2, 2);
    px(C.ink, 27, 12, 4, 5); px(C.terra, 27, 13, 4, 3);
    blob(px, C.leafDark, 29, 10, 2.5, 2); blob(px, C.leaf, 28.5, 9.5, 1.5, 1);
  };
  make("hq-desk-l", 32, 30, desk);
  make("hq-desk-r", 32, 30, desk, true);

  for (const [name, fabric] of Object.entries(FABRICS)) {
    const f = fabric;
    // Meeting chair, front and back.
    make(`hq-meet-chair-${name}-down`, 16, 20, (px) => {
      round(px, C.ink, 3, 1, 10, 9); round(px, f.mid, 4, 2, 8, 7); px(f.light, 5, 2, 6, 1);
      round(px, C.ink, 2, 9, 12, 6); px(f.light, 3, 10, 10, 3); px(f.mid, 3, 13, 10, 1);
      px(C.ink, 3, 15, 1, 5); px(C.ink, 12, 15, 1, 5); px(C.greyDark, 5, 15, 1, 4); px(C.greyDark, 10, 15, 1, 4);
    });
    make(`hq-meet-chair-${name}-up`, 16, 20, (px) => {
      round(px, C.ink, 2, 8, 12, 6); px(f.mid, 3, 9, 10, 4);
      round(px, C.ink, 3, 1, 10, 13); round(px, f.dark, 4, 2, 8, 11); px(f.mid, 4, 2, 8, 1); px(f.mid, 7, 5, 2, 5);
      px(C.ink, 3, 14, 1, 6); px(C.ink, 12, 14, 1, 6);
    });

    // Three-seat sofa: facing you, and seen from behind.
    make(`hq-sofa-${name}-down`, 48, 26, (px) => {
      round(px, C.ink, 3, 0, 42, 13); px(f.mid, 4, 1, 40, 11); px(f.light, 4, 1, 40, 2);
      px(f.dark, 16, 3, 1, 9); px(f.dark, 32, 3, 1, 9);
      px(C.ink, 4, 11, 40, 12); px(f.light, 5, 12, 38, 5); px(f.mid, 5, 17, 38, 4); px(f.dark, 5, 21, 38, 1);
      px(f.mid, 16, 12, 1, 5); px(f.mid, 32, 12, 1, 5);
      round(px, C.ink, 0, 7, 7, 17); px(f.mid, 1, 8, 5, 15); px(f.light, 1, 8, 5, 2); px(f.dark, 1, 22, 5, 1);
      round(px, C.ink, 41, 7, 7, 17); px(f.mid, 42, 8, 5, 15); px(f.light, 42, 8, 5, 2); px(f.dark, 42, 22, 5, 1);
      px(C.woodDeep, 2, 24, 2, 2); px(C.woodDeep, 44, 24, 2, 2);
    });
    make(`hq-sofa-${name}-up`, 48, 26, (px) => {
      round(px, C.ink, 0, 3, 7, 17); px(f.mid, 1, 4, 5, 15); px(f.light, 1, 4, 5, 2);
      round(px, C.ink, 41, 3, 7, 17); px(f.mid, 42, 4, 5, 15); px(f.light, 42, 4, 5, 2);
      px(C.ink, 4, 3, 40, 9); px(f.light, 5, 4, 38, 7); px(f.mid, 16, 4, 1, 7); px(f.mid, 32, 4, 1, 7);
      round(px, C.ink, 3, 9, 42, 14); px(f.dark, 4, 10, 40, 12); px(f.mid, 4, 10, 40, 2);
      px(C.woodDeep, 3, 23, 2, 3); px(C.woodDeep, 43, 23, 2, 3);
    });

    // Armchair in four directions (right is the mirrored left).
    make(`hq-armchair-${name}-down`, 18, 22, (px) => {
      round(px, C.ink, 3, 0, 12, 11); px(f.mid, 4, 1, 10, 9); px(f.light, 4, 1, 10, 2);
      px(C.ink, 3, 9, 12, 8); px(f.light, 4, 10, 10, 4); px(f.mid, 4, 14, 10, 2);
      round(px, C.ink, 0, 6, 5, 13); px(f.mid, 1, 7, 3, 11); px(f.light, 1, 7, 3, 1);
      round(px, C.ink, 13, 6, 5, 13); px(f.mid, 14, 7, 3, 11); px(f.light, 14, 7, 3, 1);
      px(C.woodDeep, 2, 19, 2, 3); px(C.woodDeep, 14, 19, 2, 3);
    });
    make(`hq-armchair-${name}-up`, 18, 22, (px) => {
      round(px, C.ink, 0, 3, 5, 13); px(f.mid, 1, 4, 3, 11);
      round(px, C.ink, 13, 3, 5, 13); px(f.mid, 14, 4, 3, 11);
      px(C.ink, 3, 3, 12, 7); px(f.light, 4, 4, 10, 5);
      round(px, C.ink, 2, 8, 14, 12); px(f.dark, 3, 9, 12, 10); px(f.mid, 3, 9, 12, 1);
      px(C.woodDeep, 2, 19, 2, 3); px(C.woodDeep, 14, 19, 2, 3);
    });
    const side = (px: Px) => {
      round(px, C.ink, 12, 0, 6, 18); px(f.mid, 13, 1, 4, 16); px(f.light, 13, 1, 1, 16);
      round(px, C.ink, 1, 9, 14, 9); px(f.light, 2, 10, 12, 3); px(f.mid, 2, 13, 12, 4);
      round(px, C.ink, 2, 6, 13, 5); px(f.mid, 3, 7, 11, 3); px(f.light, 3, 7, 11, 1);
      px(C.woodDeep, 2, 18, 2, 4); px(C.woodDeep, 14, 18, 2, 4);
    };
    make(`hq-armchair-${name}-left`, 18, 22, side);
    make(`hq-armchair-${name}-right`, 18, 22, side, true);

    make(`hq-beanbag-${name}`, 16, 14, (px) => {
      blob(px, C.ink, 8, 8, 7.5, 5.5); blob(px, f.mid, 8, 8, 6.5, 4.5);
      blob(px, f.light, 6.5, 6.5, 3.5, 2); px(f.dark, 5, 10, 6, 1);
    });
  }

  // Long and short meeting tables: notebooks on the far side, laptops on the near side.
  const meetingTable = (seats: number) => (px: Px) => {
    const w = seats * 16;
    px(C.ink, 3, 32, 3, 8); px(C.ink, w - 6, 32, 3, 8);
    px(C.ink, 0, 4, w, 29);
    px(C.woodTop, 1, 5, w - 2, 22); px(C.woodHi, 1, 5, w - 2, 1);
    for (let i = 0; i < seats; i += 2) px(C.wood, 6 + i * 16, 15 + (i % 4), 18, 1);
    px(C.wood, 1, 27, w - 2, 1); px(C.woodEdge, 1, 28, w - 2, 4); px(C.woodDark, 1, 31, w - 2, 1);
    px(C.ink, w / 2 - 4, 13, 8, 4); px(C.greyDark, w / 2 - 3, 14, 6, 2); px(C.cyan, w / 2 - 1, 14, 2, 1);
    for (let i = 0; i < seats; i++) {
      const cx = 8 + i * 16;
      px(C.white, cx - 3, 6, 6, 4); px(C.grey, cx - 2, 7, 4, 1); px(C.grey, cx - 2, 8, 3, 1); px(C.accent, cx + 3, 6, 1, 3);
      px(C.ink, cx - 5, 17, 10, 6); px(C.screen, cx - 4, 18, 8, 4); px(C.screenHi, cx - 4, 18, 8, 1);
      px(C.greyMid, cx - 5, 23, 10, 2); px(C.grey, cx - 5, 23, 10, 1);
      if (i % 2 === 0) { px(C.ink, cx + 5, 11, 3, 4); px(C.screenHi, cx + 6, 12, 1, 2); }
    }
  };
  make("hq-meeting-table", 96, 40, meetingTable(6));
  make("hq-meeting-table-sm", 64, 40, meetingTable(4));

  make("hq-coffee-table", 48, 18, (px) => {
    px(C.woodDeep, 3, 13, 2, 5); px(C.woodDeep, 43, 13, 2, 5);
    px(C.ink, 1, 3, 46, 11); px(C.woodTop, 2, 4, 44, 6); px(C.woodHi, 2, 4, 44, 1);
    px(C.woodEdge, 2, 10, 44, 3); px(C.woodDark, 2, 12, 44, 1);
    px(C.accent, 7, 5, 7, 4); px(C.white, 8, 6, 4, 1); px(C.yellow, 11, 7, 6, 3);
    px(C.ink, 22, 5, 4, 4); px(C.white, 23, 6, 2, 2);
    px(C.ink, 33, 6, 8, 4); px(C.pot, 34, 7, 6, 2);
    blob(px, C.leafDark, 37, 4, 3.5, 2.5); blob(px, C.leaf, 36.5, 3.5, 2, 1.5);
  });

  make("hq-side-table", 14, 18, (px) => {
    px(C.woodDeep, 6, 10, 2, 7); px(C.woodDeep, 4, 16, 6, 2);
    blob(px, C.ink, 7, 9, 6.5, 3); blob(px, C.woodTop, 7, 8.5, 5.5, 2); px(C.woodEdge, 2, 10, 10, 1);
    px(C.ink, 3, 0, 8, 6); px(0xf6e3b8, 4, 1, 6, 4); px(0xfff4dc, 4, 1, 6, 1); px(C.ink, 6, 6, 2, 3);
  });

  make("hq-tv-console", 48, 36, (px) => {
    px(C.ink, 2, 25, 44, 9); px(C.woodTop, 3, 26, 42, 2); px(C.woodEdge, 3, 28, 42, 5);
    px(C.woodDark, 17, 28, 1, 5); px(C.woodDark, 31, 28, 1, 5); px(C.ink, 4, 34, 2, 2); px(C.ink, 42, 34, 2, 2);
    px(C.ink, 6, 1, 36, 22);
    px(0x8fd0f0, 7, 2, 34, 13); px(0xb6e2f5, 7, 2, 34, 4); px(0x5bb36a, 7, 15, 34, 7); px(0x4a9a59, 7, 19, 34, 3);
    blob(px, C.yellow, 33, 7, 2.5); px(C.white, 12, 5, 6, 2); px(C.white, 14, 4, 3, 1);
    px(C.ink, 22, 23, 4, 2);
    px(C.ink, 40, 20, 5, 5); px(C.terra, 41, 21, 3, 3); blob(px, C.leafDark, 42.5, 18, 3, 2.5); blob(px, C.leaf, 42, 17.5, 1.5, 1.5);
  });

  make("hq-bookshelf", 32, 44, (px) => {
    const rand = seeded(5);
    px(C.ink, 0, 0, 32, 44); px(C.woodDark, 1, 1, 30, 42); px(C.woodDeep, 2, 2, 28, 38);
    px(C.woodEdge, 1, 1, 30, 1);
    const colors = [C.red, C.accent, C.yellow, C.green, 0xe9e2d0, C.purple, C.terra, C.cyan, 0x3e4553];
    for (const [shelfTop, shelfBottom] of [[2, 12], [15, 25], [28, 38]] as const) {
      let x = 2;
      while (x < 29) {
        if (rand() < 0.12 && x < 24) {
          px(C.pot, x + 1, shelfBottom - 3, 4, 4); blob(px, C.leaf, x + 3, shelfBottom - 5, 2.5, 2);
          x += 6;
          continue;
        }
        const w = rand() < 0.4 ? 3 : 2;
        const h = 6 + Math.floor(rand() * 4);
        const color = colors[Math.floor(rand() * colors.length)]!;
        px(color, x, shelfBottom - h + 1, Math.min(w, 30 - x), h);
        px(0x1f2229, x, shelfBottom - h + 1, 1, h);
        x += w;
      }
      px(C.woodEdge, 1, shelfBottom + 1, 30, 2);
      px(C.woodEdge, 1, shelfTop - 1, 30, 1);
    }
    px(C.woodDeep, 1, 41, 30, 2);
  });

  make("hq-plant-big", 20, 32, (px) => {
    round(px, C.ink, 4, 20, 12, 12); px(C.pot, 5, 21, 10, 10); px(C.potShade, 12, 21, 3, 10); px(C.white, 5, 21, 10, 1);
    px(C.leafDark, 9, 15, 2, 6);
    leaves(px, [[10, 11, 5], [5, 13, 3.5], [15, 13, 3.5], [7, 6, 3.5], [13, 6, 3.5], [10, 3, 2.5]]);
  });
  make("hq-plant-small", 14, 16, (px) => {
    round(px, C.ink, 3, 9, 8, 7); px(C.terra, 4, 10, 6, 5); px(C.terraDark, 8, 10, 2, 5); px(0xdc8a63, 4, 10, 6, 1);
    leaves(px, [[7, 6, 3.5], [4, 7, 2], [10, 7, 2]]);
  });
  make("hq-plant-tree", 20, 46, (px) => {
    round(px, C.ink, 4, 36, 12, 10); px(C.terra, 5, 37, 10, 8); px(C.terraDark, 12, 37, 3, 8); px(0xdc8a63, 5, 37, 10, 1);
    px(C.woodDeep, 9, 16, 2, 21);
    leaves(px, [[10, 6, 4.5], [5, 12, 3.5], [15, 11, 3.5], [7, 19, 3.5], [14, 20, 3], [10, 26, 2.5], [11, 14, 3]]);
  });

  make("hq-floor-lamp", 12, 36, (px) => {
    px(C.ink, 3, 33, 6, 3); px(C.greyDark, 4, 33, 4, 1);
    px(C.ink, 5, 8, 2, 25);
    px(C.ink, 1, 0, 10, 9); px(0xf6e6c2, 2, 1, 8, 7); px(0xfff4dc, 2, 1, 8, 2); px(0xe7cf9f, 2, 7, 8, 1);
  });

  // Kitchen run: counters share a base, each with something different on top.
  const counter = (top: (px: Px) => void) => (px: Px) => {
    px(C.ink, 0, 10, 16, 22);
    px(0xeceae5, 0, 10, 16, 3); px(C.white, 0, 10, 16, 1); px(0xc9c5bd, 0, 13, 16, 1);
    px(0xd7dde3, 1, 14, 14, 15); px(0xb8c0c9, 8, 14, 1, 15); px(C.greyDark, 6, 17, 1, 3); px(C.greyDark, 10, 17, 1, 3);
    px(0x8c95a1, 1, 29, 14, 2);
    top(px);
  };
  make("hq-counter", 16, 32, counter((px) => {
    blob(px, C.ink, 8, 9, 5, 2.5); blob(px, C.white, 8, 8.5, 4, 1.5);
    blob(px, C.red, 6, 7, 1.5); blob(px, C.yellow, 9, 6.5, 1.5); blob(px, C.green, 11, 7.5, 1.2);
  }));
  make("hq-counter-sink", 16, 32, counter((px) => {
    px(C.greyDark, 3, 10, 10, 2); px(C.greyMid, 4, 10, 8, 1);
    px(C.metal, 7, 4, 2, 6); px(C.metal, 7, 4, 5, 1); px(C.ink, 11, 5, 1, 1);
  }));
  make("hq-counter-micro", 16, 32, counter((px) => {
    px(C.ink, 1, 1, 14, 10); px(0x3a3f4a, 2, 2, 9, 7); px(0x4f5562, 2, 2, 9, 1); px(C.greyMid, 12, 2, 2, 8); px(C.cyan, 12, 3, 2, 1);
  }));
  make("hq-counter-coffee", 16, 32, counter((px) => {
    px(C.ink, 3, 0, 10, 11); px(0x4b4f5a, 4, 1, 8, 9); px(0x5f6471, 4, 1, 8, 1); px(C.ink, 6, 5, 4, 1);
    px(C.white, 6, 7, 4, 3); px(C.terra, 7, 7, 2, 1);
  }));
  make("hq-fridge", 16, 42, (px) => {
    px(C.ink, 0, 0, 16, 42); px(0xe4e9ee, 1, 1, 14, 39); px(0xb9c2cb, 1, 14, 14, 1);
    px(C.greyDark, 12, 5, 1, 6); px(C.greyDark, 12, 17, 1, 12); px(C.white, 2, 1, 1, 38);
    px(C.yellow, 4, 18, 3, 3); px(C.accent, 5, 23, 4, 3); px(C.greyDark, 1, 40, 14, 1);
  });
  make("hq-water-cooler", 12, 30, (px) => {
    px(C.ink, 3, 0, 6, 10); px(0x9fd6f2, 4, 1, 4, 8); px(0xd4effb, 4, 1, 1, 8);
    px(C.ink, 1, 10, 10, 20); px(C.white, 2, 11, 8, 18); px(C.grey, 8, 11, 2, 18);
    px(C.accent, 3, 15, 2, 2); px(C.red, 7, 15, 2, 2); px(C.greyMid, 3, 20, 6, 1);
  });
  make("hq-cafe-table", 32, 20, (px) => {
    px(C.woodDeep, 6, 12, 2, 8); px(C.woodDeep, 24, 12, 2, 8);
    round(px, C.ink, 1, 2, 30, 11); px(C.white, 2, 3, 28, 6); px(C.off, 2, 9, 28, 3);
    px(C.ink, 7, 4, 3, 3); px(C.terra, 8, 5, 1, 1); px(C.ink, 22, 5, 3, 3); px(C.accent, 23, 5, 1, 1);
    blob(px, C.grey, 16, 6, 3, 1.5);
  });
  // Facing you: the backrest stands behind the seat, so it shows above it.
  make("hq-cafe-chair-down", 14, 18, (px) => {
    px(C.ink, 2, 0, 10, 8); px(C.wood, 3, 1, 8, 6); px(C.woodHi, 3, 1, 8, 1);
    px(C.woodDark, 5, 3, 1, 4); px(C.woodDark, 8, 3, 1, 4);
    px(C.ink, 1, 7, 12, 5); px(C.woodTop, 2, 8, 10, 2); px(C.woodHi, 2, 8, 10, 1); px(C.woodEdge, 2, 10, 10, 1);
    px(C.woodDeep, 4, 12, 1, 3); px(C.woodDeep, 9, 12, 1, 3);
    px(C.ink, 2, 12, 1, 6); px(C.ink, 11, 12, 1, 6);
  });
  // Seen from behind: the backrest is nearest you and hides the seat. Only the seat's side
  // edges show beside it, and the legs below it.
  make("hq-cafe-chair-up", 14, 18, (px) => {
    px(C.ink, 0, 8, 14, 4); px(C.woodEdge, 1, 9, 12, 2);
    px(C.woodDeep, 4, 12, 1, 3); px(C.woodDeep, 9, 12, 1, 3);
    px(C.ink, 2, 1, 10, 12); px(C.wood, 3, 2, 8, 10); px(C.woodHi, 3, 2, 8, 1);
    px(C.woodDark, 5, 4, 1, 7); px(C.woodDark, 8, 4, 1, 7); px(C.woodEdge, 3, 11, 8, 1);
    px(C.ink, 2, 13, 2, 5); px(C.ink, 10, 13, 2, 5);
  });

  make("hq-reception-desk", 64, 44, (px) => {
    px(C.ink, 26, 1, 12, 9); px(C.greyMid, 27, 2, 10, 7); px(C.ink, 31, 10, 2, 2);
    px(C.ink, 0, 8, 64, 34);
    px(C.woodTop, 1, 9, 62, 8); px(C.woodHi, 1, 9, 62, 1);
    px(C.woodEdge, 1, 17, 62, 2);
    px(C.white, 1, 19, 62, 19); px(C.off, 1, 35, 62, 3); px(0xffffff, 1, 19, 62, 1);
    // The Clario "C" on the front panel.
    px(C.accent, 29, 22, 6, 2); px(C.accent, 27, 24, 2, 8); px(C.accent, 29, 32, 6, 2); px(C.accent, 35, 23, 2, 2); px(C.accent, 35, 31, 2, 2);
    px(C.greyDark, 1, 38, 62, 3);
    px(C.ink, 51, 10, 7, 6); px(C.pot, 52, 11, 5, 4); blob(px, C.leafDark, 54.5, 7, 4, 3); blob(px, C.leaf, 54, 6.5, 2.5, 2);
    px(C.white, 8, 11, 6, 4); px(C.grey, 9, 12, 4, 1); px(C.accent, 16, 12, 1, 3);
  });

  // Ping-pong table: blue top with white lines, a net across the middle with its posts,
  // a thick apron and steel legs on castors. Two bats and a ball are left on it.
  make("hq-pingpong", 48, 40, (px) => {
    px(C.greyDark, 9, 27, 2, 7); px(C.greyDark, 37, 27, 2, 7); px(C.greyDark, 11, 31, 26, 1);
    px(C.ink, 0, 4, 48, 26);
    px(0x1e3a6e, 1, 5, 46, 21); px(0x284b88, 1, 5, 46, 2); px(0x1a335f, 1, 20, 46, 6);
    px(C.white, 2, 6, 44, 1); px(C.white, 2, 24, 44, 1); px(C.white, 2, 6, 1, 19); px(C.white, 45, 6, 1, 19);
    px(0xcfe0f2, 3, 15, 42, 1);
    px(0x142a50, 1, 26, 46, 3); px(0x0f2040, 1, 28, 46, 1); px(0x2a4f8c, 1, 26, 46, 1);
    // The net and its shadow.
    px(0x152c55, 25, 6, 2, 19);
    px(C.ink, 22, 1, 4, 28); px(0xe9edf2, 23, 2, 2, 25);
    for (let y = 3; y < 26; y += 2) { px(0xaab3c2, 23, y, 1, 1); px(0xaab3c2, 24, y + 1, 1, 1); }
    px(C.white, 23, 2, 2, 1); px(C.greyMid, 22, 0, 4, 2); px(C.greyMid, 22, 27, 4, 2);
    // Bats and ball.
    blob(px, C.ink, 11, 12, 4, 3.5); blob(px, C.red, 11, 11.5, 3, 2.5); px(0xf08a85, 10, 10, 2, 1);
    px(C.ink, 14, 14, 4, 3); px(C.woodTop, 15, 15, 2, 1);
    blob(px, C.ink, 37, 19, 4, 3.5); blob(px, 0x343946, 37, 18.5, 3, 2.5); px(0x5a606e, 36, 17, 2, 1);
    px(C.ink, 30, 20, 4, 3); px(C.woodTop, 31, 21, 2, 1);
    px(0x152c55, 31, 12, 2, 1); px(C.ink, 30, 8, 3, 3); px(C.white, 31, 9, 1, 1);
    // Near legs on castors.
    px(C.ink, 4, 29, 3, 9); px(C.greyMid, 5, 29, 1, 8); px(C.ink, 41, 29, 3, 9); px(C.greyMid, 42, 29, 1, 8);
    px(C.ink, 3, 37, 5, 3); px(C.ink, 40, 37, 5, 3);
  });

  // Arcade cabinets: a lit marquee, a glowing screen with its own game, a control deck that
  // sticks out toward you, and a coin door. The right side is in shade so they read as boxes.
  const ARCADES = [
    { body: 0x3686ff, dark: 0x1f5fd6, light: 0x80b4ff, marquee: C.yellow },
    { body: 0x2b8f8a, dark: 0x1c6763, light: 0x52b8b1, marquee: C.pink },
    { body: 0xc0473f, dark: 0x8e2f2a, light: 0xe36b62, marquee: C.cyan },
  ];
  ARCADES.forEach((style, index) => {
    make(`hq-arcade-${index}`, 16, 42, (px) => {
      px(C.ink, 0, 0, 16, 42);
      px(style.body, 1, 1, 14, 40); px(style.dark, 12, 1, 3, 40); px(style.light, 1, 1, 1, 40);
      // Marquee
      px(style.marquee, 2, 2, 11, 5); px(0xfff6d8, 2, 2, 11, 1); px(style.dark, 4, 4, 7, 1); px(style.dark, 5, 5, 5, 1);
      // Screen
      px(C.ink, 2, 8, 12, 12); px(0x141a30, 3, 9, 10, 10);
      if (index === 0) {
        for (const x of [4, 7, 10]) { px(C.green, x, 10, 2, 1); px(C.green, x, 11, 1, 1); px(C.green, x + 1, 11, 1, 1); }
        px(C.white, 8, 14, 1, 2); px(C.cyan, 7, 17, 3, 1); px(C.cyan, 8, 16, 1, 1);
      } else if (index === 1) {
        px(0x3a6ee8, 3, 9, 10, 1); px(0x3a6ee8, 3, 18, 10, 1); px(0x3a6ee8, 7, 12, 4, 1);
        blob(px, C.yellow, 5.5, 14.5, 1.5); px(0x141a30, 6, 14, 1, 1);
        for (const x of [8, 10, 12]) px(0xf6e3b8, x, 15, 1, 1);
        px(C.red, 10, 10, 2, 2);
      } else {
        px(0x3f4556, 6, 9, 4, 10); px(C.white, 8, 10, 1, 2); px(C.white, 8, 14, 1, 2);
        px(C.yellow, 7, 16, 2, 2); px(C.ink, 7, 18, 2, 1); px(C.green, 3, 9, 3, 10); px(C.green, 10, 9, 3, 10);
      }
      px(0x2a3352, 3, 9, 10, 1);
      // Control deck
      px(C.ink, 0, 20, 16, 6); px(style.light, 1, 21, 14, 2); px(style.body, 1, 23, 13, 2); px(style.dark, 12, 23, 3, 2);
      px(C.ink, 4, 19, 1, 3); px(C.red, 3, 18, 3, 2);
      px(C.yellow, 8, 21, 2, 1); px(C.cyan, 11, 21, 2, 1); px(C.pink, 9, 22, 2, 1);
      // Side-art stripe, coin door (one lit slot over the coin return) and kick plate
      px(style.light, 2, 26, 9, 1); px(style.dark, 2, 27, 9, 1);
      px(C.ink, 5, 29, 6, 7); px(0x3a3f4a, 6, 30, 4, 5); px(0xff9a3c, 7, 31, 2, 1); px(0x22252e, 7, 33, 2, 1);
      px(C.ink, 1, 38, 14, 1); px(0x22252e, 1, 39, 14, 2);
    });
  });

  // Foosball: a wooden box with a striped pitch, goals at both ends and four rods, each
  // with its players and a grip on the near side.
  make("hq-foosball", 32, 26, (px) => {
    px(C.ink, 2, 19, 3, 7); px(C.woodDeep, 3, 19, 1, 6); px(C.ink, 27, 19, 3, 7); px(C.woodDeep, 28, 19, 1, 6);
    px(C.ink, 0, 4, 32, 17); px(C.woodEdge, 1, 5, 30, 15); px(C.woodTop, 1, 5, 30, 1); px(C.woodDark, 1, 17, 30, 3);
    px(0x2f8a4e, 3, 7, 26, 10);
    for (let x = 3; x < 29; x += 6) px(0x37985a, x, 7, 3, 10);
    px(0xe8f3ea, 15, 7, 1, 10); px(0xe8f3ea, 13, 11, 5, 1);
    px(C.white, 2, 10, 1, 4); px(C.white, 29, 10, 1, 4);
    for (const [x, color, grip] of [[7, C.red, C.red], [12, C.accent, C.accent], [19, C.red, C.red], [24, C.accent, C.accent]] as const) {
      px(C.metal, x, 2, 1, 21); px(C.ink, x, 1, 1, 1);
      for (const y of [9, 13]) { px(C.ink, x - 1, y - 1, 3, 3); px(color, x - 1, y, 3, 1); px(0xf1c7a3, x, y - 1, 1, 1); }
      px(C.ink, x - 1, 21, 3, 4); px(grip, x, 22, 1, 2);
    }
    px(C.white, 17, 11, 1, 1);
  });

  // Server rack: a tall black cabinet of servers, each with its own row of status lights.
  make("hq-server-rack", 16, 44, (px) => {
    px(C.ink, 0, 0, 16, 44); px(0x2a2e38, 1, 1, 14, 42); px(0x3a3f4b, 1, 1, 14, 1); px(0x1d2028, 13, 1, 2, 42);
    const lights = [C.green, C.green, 0x4fa3ff, C.green, C.yellow, C.green, 0x4fa3ff, C.green, C.green];
    for (let i = 0; i < 9; i++) {
      const y = 3 + i * 4;
      px(0x353a46, 2, y, 11, 3); px(0x1d2028, 2, y + 2, 11, 1);
      px(lights[i]!, 3, y, 1, 1); px(i % 3 ? C.green : 0x4fa3ff, 5, y, 1, 1);
      for (let v = 8; v < 12; v += 2) px(0x262a33, v, y, 1, 2);
    }
    px(C.metal, 12, 18, 1, 6); px(0x1d2028, 1, 40, 14, 3);
  });

  // 3D printer: an open frame with a part half-printed on the bed and a spool on top.
  make("hq-printer-3d", 16, 30, (px) => {
    px(C.woodDeep, 1, 24, 14, 6); px(C.woodEdge, 1, 24, 14, 1);
    px(C.ink, 1, 4, 2, 20); px(C.ink, 13, 4, 2, 20); px(C.ink, 1, 3, 14, 3); px(C.greyDark, 2, 4, 12, 1);
    blob(px, C.ink, 8, 2, 3, 2); blob(px, 0xe85d4f, 8, 2, 2, 1.2);
    px(C.ink, 6, 8, 4, 3); px(C.metal, 7, 9, 2, 1); px(0xff9a3c, 7, 11, 2, 1);
    px(C.ink, 3, 19, 10, 3); px(C.greyMid, 3, 19, 10, 1);
    px(0xe85d4f, 6, 15, 4, 4); px(0xff8a78, 6, 15, 4, 1);
  });

  // Robot arm: a yellow industrial arm on a grey plinth, reaching forward with its gripper.
  make("hq-robot-arm", 16, 36, (px) => {
    px(C.ink, 2, 26, 12, 10); px(C.greyMid, 3, 27, 10, 8); px(C.grey, 3, 27, 10, 1);
    blob(px, C.ink, 8, 25, 5, 2.5); blob(px, 0xf2b630, 8, 24.5, 4, 1.8);
    px(C.ink, 6, 13, 4, 12); px(0xf2b630, 7, 14, 2, 10); px(0xffd36b, 7, 14, 1, 10);
    blob(px, C.ink, 8, 13, 3); blob(px, C.greyDark, 8, 13, 2);
    px(C.ink, 8, 5, 4, 9); px(0xf2b630, 9, 6, 2, 7); px(0xffd36b, 9, 6, 1, 7);
    blob(px, C.ink, 10, 5, 2.5); px(C.metal, 10, 4, 1, 1);
    px(C.ink, 10, 0, 1, 4); px(C.ink, 13, 0, 1, 4); px(C.metal, 10, 2, 4, 1);
  });

  // Electronics bench: an oscilloscope, a breadboard with wires, and a soldering station.
  make("hq-workbench", 32, 30, (px) => {
    px(C.ink, 2, 22, 2, 8); px(C.ink, 28, 22, 2, 8);
    px(C.ink, 0, 12, 32, 11); px(0x6c7282, 1, 13, 30, 6); px(0x7d8494, 1, 13, 30, 1); px(C.greyDark, 1, 19, 30, 3);
    px(C.ink, 2, 2, 12, 11); px(0x3a3f4a, 3, 3, 10, 9); px(0x0f2a1c, 4, 4, 8, 5);
    for (let x = 0; x < 8; x++) px(0x4ade80, 4 + x, 6 + Math.round(Math.sin(x * 0.9) * 1.5), 1, 1);
    px(C.yellow, 5, 10, 1, 1); px(C.red, 8, 10, 1, 1);
    px(C.white, 16, 14, 8, 4); for (let x = 17; x < 24; x += 2) px(C.grey, x, 15, 1, 2);
    px(C.red, 17, 13, 5, 1); px(0x4fa3ff, 18, 12, 1, 2); px(C.green, 21, 12, 1, 2);
    px(C.ink, 26, 9, 4, 5); px(C.red, 27, 10, 2, 2); px(C.metal, 25, 6, 1, 5);
  });

  // Podium: a wooden lectern with a microphone and an open laptop.
  make("hq-podium", 16, 28, (px) => {
    px(C.ink, 2, 8, 12, 20); px(C.wood, 3, 9, 10, 18); px(C.woodTop, 3, 9, 10, 2); px(C.woodEdge, 3, 25, 10, 2);
    px(C.accent, 6, 15, 4, 4); px(C.white, 7, 16, 2, 2);
    px(C.ink, 3, 4, 7, 5); px(C.screenHi, 4, 5, 5, 3);
    px(C.ink, 11, 1, 1, 8); blob(px, C.ink, 11.5, 1, 1.5);
  });

  // VR station: a headset and two controllers on a stand, over a round play mat.
  make("hq-vr-station", 16, 32, (px) => {
    blob(px, 0x3686ff, 8, 28, 7.5, 3.5); blob(px, 0x5b9bff, 8, 28, 6, 2.5);
    px(C.ink, 7, 10, 2, 18); px(C.metal, 7, 10, 1, 18);
    px(C.ink, 2, 4, 12, 7); px(0x2a2e38, 3, 5, 10, 5); px(0x4fa3ff, 4, 6, 3, 2); px(0x4fa3ff, 9, 6, 3, 2);
    px(C.greyDark, 1, 6, 1, 3); px(C.greyDark, 14, 6, 1, 3);
    px(C.ink, 2, 14, 3, 5); px(0xe85d9b, 3, 15, 1, 2); px(C.ink, 11, 14, 3, 5); px(0x3fc5d6, 12, 15, 1, 2);
  });
}

// ---------------------------------------------------------------------------

export function buildClarioHq(scene: Phaser.Scene, api: HqSceneApi) {
  const walls = hqWallCells();
  for (const cell of walls) {
    const [x, y] = cell.split(",").map(Number) as [number, number];
    api.wall(x, y);
  }
  const isWall = (x: number, y: number) => walls.has(`${x},${y}`);

  scene.add.tileSprite(HQ_PATH.x * TILE, HQ_PATH.y * TILE, HQ_PATH.w * TILE, HQ_PATH.h * TILE, "hq-path").setOrigin(0, 0).setDepth(-1005);
  drawFloors(scene, isWall);
  drawRugs(scene);
  drawTallWalls(scene);
  drawThinWalls(scene, isWall);
  drawWallDecor(scene);
  placeItems(scene, api);
  placeOutdoors(scene, api);
}

function drawFloors(scene: Phaser.Scene, isWall: (x: number, y: number) => boolean) {
  const [base, ...zones] = HQ_FLOORS;
  // The building floor runs to the middle of the outer walls, never past them.
  if (base) {
    scene.add.tileSprite(base.x * TILE + TILE / 2, base.y * TILE, (base.w - 1) * TILE, (base.h - 0.5) * TILE, `hq-floor-${base.kind}`)
      .setOrigin(0, 0).setDepth(-1000);
  }
  const touches = (x: number, y: number, length: number, horizontal: boolean) => {
    for (let i = 0; i < length; i++) if (isWall(horizontal ? x + i : x, horizontal ? y : y + i)) return true;
    return false;
  };
  for (const zone of zones) {
    const left = touches(zone.x - 1, zone.y, zone.h, false) ? 0.5 : 0;
    const right = touches(zone.x + zone.w, zone.y, zone.h, false) ? 0.5 : 0;
    const top = touches(zone.x, zone.y - 1, zone.w, true) ? 0.5 : 0;
    const bottom = touches(zone.x, zone.y + zone.h, zone.w, true) ? 0.5 : 0;
    scene.add.tileSprite(
      (zone.x - left) * TILE, (zone.y - top) * TILE,
      (zone.w + left + right) * TILE, (zone.h + top + bottom) * TILE,
      `hq-floor-${zone.kind}`,
    ).setOrigin(0, 0).setDepth(-998);
  }
}

const RUGS: Record<RugStyle, { border: number; fill: number; line: number; accent: number }> = {
  meeting: { border: 0x46557a, fill: 0x6d7ea6, line: 0x93a3c8, accent: 0x5a6a92 },
  focus: { border: 0xb8964f, fill: 0xe3c88f, line: 0xf2dfb4, accent: 0xc7a35f },
  lounge: { border: 0xc06a47, fill: 0xece0ca, line: 0xd99a7e, accent: 0xd88d6f },
  round: { border: 0x5f8c80, fill: 0x8fb3a8, line: 0xb4d1c8, accent: 0x7aa094 },
  library: { border: 0x7c3b33, fill: 0x9c4f43, line: 0xd8b26a, accent: 0xb5665a },
  game: { border: 0x1f5fd6, fill: 0x3686ff, line: 0x8cbcff, accent: 0xd4e6ff },
  stage: { border: 0x664628, fill: 0xb98451, line: 0xcf9f66, accent: 0x86603a },
};

function drawRugs(scene: Phaser.Scene) {
  for (const rug of HQ_RUGS) {
    const g = scene.add.graphics().setDepth(-996);
    const x = rug.x * TILE, y = rug.y * TILE, w = rug.w * TILE, h = rug.h * TILE;
    const c = RUGS[rug.style];
    // Soft shadow under the rug's edge.
    g.fillStyle(0x1b2130, 0.1);
    if (rug.style === "stage") {
      // A low wooden platform: boards on top, a darker front edge and a shadow on the floor.
      g.fillStyle(0x1b2130, 0.18); g.fillRect(x + 4, y + h, w - 4, 8);
      g.fillStyle(c.border, 1); g.fillRect(x, y, w, h);
      g.fillStyle(c.fill, 1); g.fillRect(x + 2, y + 2, w - 4, h - 12);
      g.fillStyle(c.line, 1);
      for (let by = y + 10; by < y + h - 12; by += 10) g.fillRect(x + 2, by, w - 4, 1);
      g.fillStyle(c.accent, 1); g.fillRect(x + 2, y + h - 10, w - 4, 8);
      continue;
    }
    if (rug.style === "round") {
      g.fillEllipse(x + w / 2, y + h / 2 + 3, w, h);
      g.fillStyle(c.border, 1); g.fillEllipse(x + w / 2, y + h / 2, w, h);
      g.fillStyle(c.fill, 1); g.fillEllipse(x + w / 2, y + h / 2, w - 12, h - 12);
      g.lineStyle(2, c.line, 1); g.strokeEllipse(x + w / 2, y + h / 2, w - 28, h - 26);
      g.lineStyle(2, c.accent, 1); g.strokeEllipse(x + w / 2, y + h / 2, w - 52, h - 48);
      g.fillStyle(c.line, 1); g.fillEllipse(x + w / 2, y + h / 2, w * 0.28, h * 0.26);
      continue;
    }
    g.fillRoundedRect(x, y + 3, w, h, 6);
    g.fillStyle(c.border, 1); g.fillRoundedRect(x, y, w, h, 6);
    g.fillStyle(c.fill, 1); g.fillRect(x + 6, y + 6, w - 12, h - 12);
    g.lineStyle(2, c.line, 1); g.strokeRect(x + 11, y + 11, w - 22, h - 22);
    // Fringe along the short ends.
    g.fillStyle(c.line, 1);
    for (let fy = y + 4; fy < y + h - 4; fy += 4) { g.fillRect(x - 3, fy, 3, 2); g.fillRect(x + w, fy, 3, 2); }

    // A repeating diamond motif across the middle.
    g.fillStyle(c.accent, 1);
    const step = 24;
    for (let mx = x + 22; mx < x + w - 18; mx += step) {
      for (let my = y + 22; my < y + h - 18; my += step) {
        g.fillTriangle(mx, my - 5, mx + 5, my, mx, my + 5);
        g.fillTriangle(mx, my - 5, mx - 5, my, mx, my + 5);
      }
    }
  }
}

const WALL_COLORS: Record<WallStyle, { face: number; shade: number; wainscot: number; trim: number; base: number }> = {
  exterior: { face: 0xeee9df, shade: 0xe0d9cb, wainscot: 0xd8cab0, trim: 0xbca988, base: 0x8a6a45 },
  corridor: { face: 0xe4e8ef, shade: 0xd6dbe4, wainscot: 0xc9d0db, trim: 0xadb6c6, base: 0x6f7686 },
  library: { face: 0xdfe7d6, shade: 0xd0dac5, wainscot: 0x9b7a55, trim: 0x7e5f3e, base: 0x5e4329 },
  game: { face: 0x2b4b91, shade: 0x244283, wainscot: 0x1f3a75, trim: 0x3fc5d6, base: 0x18306a },
};
const CAP = 8;
const CAP_COLOR = 0x4a4f5e;
const CAP_HI = 0x60667a;
const CAP_LO = 0x2f333e;

function drawTallWalls(scene: Phaser.Scene) {
  for (const wall of HQ_TALL_WALLS) {
    const g = scene.add.graphics().setDepth((wall.y + 2) * TILE);
    const shadow = scene.add.graphics().setDepth(-984);
    const c = WALL_COLORS[wall.style];
    const top = wall.y * TILE;
    const bottom = (wall.y + 2) * TILE;

    // Split the run into solid stretches between doors.
    const stretches: [number, number][] = [];
    let start: number | null = null;
    for (let x = wall.x1; x <= wall.x2 + 1; x++) {
      const open = x > wall.x2 || wall.doors.some(([a, b]) => x >= a && x <= b);
      if (!open && start === null) start = x;
      if (open && start !== null) { stretches.push([start, x - 1]); start = null; }
    }

    for (const [a, b] of stretches) {
      const left = a === wall.x1 ? a * TILE + TILE / 2 : a * TILE;
      const right = b === wall.x2 ? b * TILE + TILE / 2 : (b + 1) * TILE;
      const w = right - left;
      g.fillStyle(c.face, 1); g.fillRect(left, top + CAP, w, 2 * TILE - CAP);
      g.fillStyle(c.shade, 1); g.fillRect(left, top + CAP, w, 4);
      g.fillStyle(c.wainscot, 1); g.fillRect(left, bottom - 18, w, 14);
      g.fillStyle(c.trim, 1); g.fillRect(left, bottom - 19, w, 2);
      g.fillStyle(c.trim, 0.45);
      for (let px = left + 16; px < right - 4; px += 32) g.fillRect(px, bottom - 17, 1, 13);
      if (wall.style === "game") {
        g.fillStyle(0x3686ff, 1); g.fillRect(left, top + CAP + 20, w, 2);
      }
      g.fillStyle(c.base, 1); g.fillRect(left, bottom - 4, w, 4);
      g.fillStyle(CAP_COLOR, 1); g.fillRect(left, top, w, CAP);
      g.fillStyle(CAP_HI, 1); g.fillRect(left, top, w, 2);
      g.fillStyle(CAP_LO, 1); g.fillRect(left, top + CAP - 1, w, 1);
      shadow.fillStyle(0x1b2130, 0.13); shadow.fillRect(left, bottom, w, 7);
      shadow.fillStyle(0x1b2130, 0.07); shadow.fillRect(left, bottom + 7, w, 5);
    }

    // Door jambs: the wall's thickness shows at each side of an opening.
    for (const [a, b] of wall.doors) {
      for (const edge of [a * TILE, (b + 1) * TILE]) {
        const isLeft = edge === a * TILE;
        g.fillStyle(CAP_COLOR, 1); g.fillRect(isLeft ? edge - 1 : edge - 5, top, 6, 2 * TILE);
        g.fillStyle(CAP_HI, 1); g.fillRect(isLeft ? edge - 1 : edge - 5, top, 6, 2);
        g.fillStyle(CAP_LO, 1); g.fillRect(isLeft ? edge + 4 : edge - 5, top, 1, 2 * TILE);
      }
      const threshold = scene.add.graphics().setDepth(-980);
      threshold.fillStyle(0xcdb894, 1); threshold.fillRect(a * TILE, bottom - 4, (b - a + 1) * TILE, 4);
      threshold.fillStyle(0xa98f63, 1); threshold.fillRect(a * TILE, bottom, (b - a + 1) * TILE, 1);
    }
  }
}

function drawThinWalls(scene: Phaser.Scene, isWall: (x: number, y: number) => boolean) {
  const tallTop = new Map<string, number>();
  for (const wall of HQ_TALL_WALLS) {
    for (let x = wall.x1; x <= wall.x2; x++) {
      tallTop.set(`${x},${wall.y}`, wall.y);
      tallTop.set(`${x},${wall.y + 1}`, wall.y);
    }
  }
  const strip = (x: number, y: number, w: number, h: number, depth: number, vertical: boolean) => {
    const g = scene.add.graphics().setDepth(depth);
    g.fillStyle(CAP_LO, 1); g.fillRect(x, y, w, h);
    g.fillStyle(CAP_COLOR, 1);
    if (vertical) g.fillRect(x + 1, y, w - 2, h); else g.fillRect(x, y + 1, w, h - 2);
    g.fillStyle(CAP_HI, 1);
    if (vertical) g.fillRect(x + 3, y, 2, h); else g.fillRect(x, y + 2, w, 2);
  };

  for (const wall of HQ_THIN_WALLS) {
    const vertical = wall.x1 === wall.x2;
    for (let x = wall.x1; x <= wall.x2; x++) {
      for (let y = wall.y1; y <= wall.y2; y++) {
        if (!isWall(x, y)) continue;
        const cx = x * TILE + TILE / 2;
        const cy = y * TILE + TILE / 2;
        if (vertical) {
          // Free end at the bottom stops at the front wall's line.
          const bottom = isWall(x, y + 1) ? (y + 1) * TILE : cy + 5;
          strip(cx - 5, y * TILE, 10, bottom - y * TILE, (y + 1) * TILE, true);
          const above = tallTop.get(`${x},${y - 1}`);
          if (above !== undefined) strip(cx - 5, above * TILE, 10, 2 * TILE, (above + 2) * TILE + 1, true);
          const below = tallTop.get(`${x},${y + 1}`);
          if (below !== undefined && below === y + 1) strip(cx - 5, (y + 1) * TILE, 10, CAP, (below + 2) * TILE + 1, true);
        } else {
          // Reach into a corner post so the outline has no gap.
          const left = x === wall.x1 && isWall(x - 1, y) ? (x - 1) * TILE + TILE / 2 - 5 : x * TILE;
          const right = x === wall.x2 && isWall(x + 1, y) ? (x + 1) * TILE + TILE / 2 + 5 : (x + 1) * TILE;
          strip(left, cy - 5, right - left, 10, (y + 1) * TILE + 1, false);
          // The front of the building: a short outer face below the wall line.
          const g = scene.add.graphics().setDepth((y + 1) * TILE + 1);
          g.fillStyle(0xe2d8c6, 1); g.fillRect(left, cy + 5, right - left, 16);
          g.fillStyle(0xcdbfa6, 1); g.fillRect(left, cy + 17, right - left, 4);
          g.fillStyle(0x1b2130, 0.12); g.fillRect(left, cy + 21, right - left, 5);
        }
      }
    }
    // Door posts on either side of a gap in a front wall.
    for (const [a, b] of wall.gaps ?? []) {
      const g = scene.add.graphics().setDepth((wall.y1 + 1) * TILE + 2);
      const cy = wall.y1 * TILE + TILE / 2;
      for (const px of [a * TILE - 3, (b + 1) * TILE - 3]) {
        g.fillStyle(CAP_LO, 1); g.fillRect(px, cy - 7, 6, 28);
        g.fillStyle(CAP_COLOR, 1); g.fillRect(px + 1, cy - 6, 4, 26);
      }
    }
  }
}

function drawWallDecor(scene: Phaser.Scene) {
  for (const decor of HQ_WALL_DECOR) {
    const g = scene.add.graphics().setDepth((decor.wallY + 2) * TILE);
    const x0 = Math.round(decor.x * TILE);
    const W = Math.round(decor.w * TILE);
    const top = decor.wallY * TILE + CAP;
    const r = (x: number, y: number, w: number, h: number, color: number, alpha = 1) => {
      g.fillStyle(color, alpha);
      g.fillRect(x, y, w, h);
    };

    switch (decor.kind) {
      case "window": {
        const y0 = top + 6, H = 30;
        r(x0, y0, W, H, C.ink);
        r(x0 + 2, y0 + 2, W - 4, H - 4, 0xf5f3ee);
        r(x0 + 4, y0 + 4, W - 8, H - 8, 0x9fd3ef);
        r(x0 + 4, y0 + 4, W - 8, 8, 0xbfe3f6);
        r(x0 + 4, y0 + H - 10, W - 8, 6, 0x86c486);
        r(x0 + 4, y0 + H - 7, W - 8, 3, 0x6eae72);
        r(x0 + W / 2 - 1, y0 + 2, 2, H - 4, 0xf5f3ee);
        r(x0 + 8, y0 + 7, 2, 2, 0xffffff, 0.85); r(x0 + 10, y0 + 9, 2, 2, 0xffffff, 0.85); r(x0 + 12, y0 + 11, 2, 2, 0xffffff, 0.6);
        r(x0 - 2, y0 + H, W + 4, 3, 0xd8d2c6); r(x0 - 2, y0 + H + 3, W + 4, 1, 0x000000, 0.18);
        break;
      }
      case "tv": {
        const y0 = top + 6, H = 30;
        r(x0, y0, W, H, C.ink);
        r(x0 + 3, y0 + 3, W - 6, H - 6, 0x2c3e78);
        r(x0 + 3, y0 + 3, W - 6, (H - 6) / 2, 0x3c55a0);
        r(x0 + 8, y0 + 7, W * 0.35, 3, 0xffffff, 0.9);
        r(x0 + 8, y0 + 12, W * 0.22, 2, 0xffffff, 0.5);
        const barsX = x0 + W - 34;
        [8, 12, 6, 14].forEach((bh, i) => r(barsX + i * 6, y0 + H - 5 - bh, 4, bh, [C.cyan, C.yellow, C.pink, C.green][i]!));
        r(x0 + W / 2 - 6, y0 + H, 12, 2, C.ink);
        break;
      }
      case "whiteboard": {
        const y0 = top + 4, H = 32;
        r(x0, y0, W, H, 0x8b919e); r(x0 + 2, y0 + 2, W - 4, H - 4, 0xfbfbf8);
        r(x0 + 6, y0 + 8, W * 0.5, 2, C.accent); r(x0 + 6, y0 + 13, W * 0.35, 2, C.red);
        r(x0 + 6, y0 + 18, W * 0.55, 2, C.accent); r(x0 + W - 20, y0 + 9, 12, 10, C.green, 0.7);
        r(x0 + 2, y0 + H, W - 4, 3, 0x8b919e);
        r(x0 + 8, y0 + H - 1, 6, 2, C.red); r(x0 + 16, y0 + H - 1, 6, 2, C.accent);
        break;
      }
      case "art": {
        const palettes = [
          [0xe85d9b, 0xf2c14e, 0x3fc5d6], [0x3a6ee8, 0xf3efe6, 0xe58f6a], [0x4caf6d, 0xf2c14e, 0x2c6e47],
          [0xd9534f, 0x2a2e38, 0xf3efe6], [0x8a78f0, 0xf2c14e, 0x3fc5d6], [0xe58f6a, 0x3a6ee8, 0xf2c14e],
        ];
        const p = palettes[(decor.variant ?? 0) % palettes.length]!;
        const y0 = top + 8, H = 26;
        r(x0, y0, W, H, (decor.variant ?? 0) % 2 ? C.woodDark : C.ink);
        r(x0 + 3, y0 + 3, W - 6, H - 6, 0xf8f5ee);
        r(x0 + 6, y0 + 6, W - 12, H - 12, p[1]!);
        g.fillStyle(p[0]!, 1); g.fillCircle(x0 + W * 0.38, y0 + H / 2, 6);
        r(x0 + W * 0.55, y0 + 9, W * 0.2, H - 18, p[2]!);
        r(x0, y0 + H, W, 2, 0x000000, 0.15);
        break;
      }
      case "clock": {
        const cx = x0 + W / 2, cy = top + 20;
        g.fillStyle(C.ink, 1); g.fillCircle(cx, cy, 11);
        g.fillStyle(0xfbfaf6, 1); g.fillCircle(cx, cy, 9);
        r(cx - 1, cy - 7, 2, 7, C.ink); r(cx, cy - 1, 6, 2, C.ink); r(cx - 1, cy - 1, 2, 2, C.red);
        break;
      }
      case "cabinets": {
        const y0 = top + 2;
        r(x0, y0, W, 26, C.ink);
        for (let i = 0; i < W / TILE; i++) {
          r(x0 + i * TILE + 2, y0 + 2, TILE - 3, 22, 0xd7dde3);
          r(x0 + i * TILE + 2, y0 + 2, TILE - 3, 2, 0xe9edf1);
          r(x0 + i * TILE + (i % 2 ? 5 : TILE - 8), y0 + 16, 2, 6, C.greyDark);
        }
        r(x0, y0 + 26, W, 3, 0x000000, 0.12);
        // Backsplash tiles between cabinets and counter.
        for (let ty = y0 + 30; ty < top + 2 * TILE - CAP - 6; ty += 6) {
          for (let tx = x0; tx < x0 + W; tx += 8) r(tx, ty, 7, 5, (tx / 8 + ty / 6) % 2 ? 0xf3f1ec : 0xe8f0f2);
        }
        break;
      }
      case "shelf": {
        const y0 = top + 26;
        r(x0, y0, W, 4, C.woodEdge); r(x0, y0 + 4, W, 2, 0x000000, 0.15);
        const pot = (px: number, color: number) => {
          r(px, y0 - 8, 8, 8, color); g.fillStyle(C.leaf, 1); g.fillCircle(px + 4, y0 - 12, 5); g.fillStyle(C.leafHi, 1); g.fillCircle(px + 3, y0 - 13, 2);
        };
        pot(x0 + 6, C.terra);
        [C.accent, C.yellow, C.red, C.green].forEach((color, i) => r(x0 + 22 + i * 5, y0 - 12 - (i % 2) * 2, 4, 12 + (i % 2) * 2, color));
        pot(x0 + W - 16, C.pot);
        break;
      }
      case "neon": {
        // A neon PLAY sign: a blue haze on the wall, a dark board, cyan tube and glowing letters.
        const y0 = top + 6, H = 26;
        g.fillStyle(0x3686ff, 0.22); g.fillRoundedRect(x0 - 5, y0 - 5, W + 10, H + 10, 10);
        g.fillStyle(0x161a2e, 1); g.fillRoundedRect(x0, y0, W, H, 4);
        g.lineStyle(2, C.cyan, 1); g.strokeRoundedRect(x0 + 3, y0 + 3, W - 6, H - 6, 3);
        const text = scene.add.text(x0 + W / 2, y0 + H / 2 + 1, decor.variant === 1 ? "HACK" : "PLAY", { fontFamily: "sans-serif", fontSize: "12px", fontStyle: "800", color: "#dcebff" })
          .setOrigin(0.5, 0.5).setDepth((decor.wallY + 2) * TILE).setLetterSpacing(2);
        text.setShadow(0, 0, "#3686ff", 6, false, true);
        text.setResolution(3);
        break;
      }
      case "logo": {
        const y0 = top + 8, H = 30;
        r(x0, y0, W, H, C.woodEdge); r(x0 + 2, y0 + 2, W - 4, H - 4, C.woodTop);
        r(x0 + 2, y0 + H - 4, W - 4, 2, C.wood);
        const cx = x0 + 18, cy = y0 + H / 2;
        r(cx - 4, cy - 9, 10, 3, C.accent); r(cx - 7, cy - 6, 3, 12, C.accent); r(cx - 4, cy + 6, 10, 3, C.accent);
        const text = scene.add.text(cx + 12, cy, "Clario", { fontFamily: "sans-serif", fontSize: "16px", fontStyle: "800", color: "#2a2e38" })
          .setOrigin(0, 0.5).setDepth((decor.wallY + 2) * TILE);
        text.setResolution(3);
        break;
      }
    }
  }
}

function placeItems(scene: Phaser.Scene, api: HqSceneApi) {
  let arcadeIndex = 0;
  for (const item of HQ_ITEMS) {
    const spec = ITEM_SPECS[item.kind];
    const fabric = item.fabric ?? "grey";
    const dir = item.dir ?? "down";

    if (spec.seat) {
      placeSeat(scene, api, item, fabric, dir);
      continue;
    }

    const key = textureFor(item, arcadeIndex);
    const cx = (item.x + spec.w / 2) * TILE;
    const bottom = (item.y + spec.h) * TILE;
    if (item.kind === "arcade") arcadeIndex++;
    const image = scene.add.image(cx, bottom, key).setOrigin(0.5, 1);
    image.setDepth(bottom);
    api.shadow(cx, bottom - 3, Math.min(image.displayWidth, spec.w * TILE) * 0.9);
    for (let dx = 0; dx < spec.w; dx++) for (let dy = 0; dy < spec.h; dy++) api.block(item.x + dx, item.y + dy);
  }
}

function textureFor(item: HqItem, arcadeIndex: number) {
  switch (item.kind) {
    case "arcade": return `hq-arcade-${arcadeIndex % 3}`;
    default: return `hq-${item.kind}`;
  }
}

function placeSeat(scene: Phaser.Scene, api: HqSceneApi, item: HqItem, fabric: Fabric, dir: Dir) {
  const spec = ITEM_SPECS[item.kind];
  const cx = (item.x + spec.w / 2) * TILE;
  const bottom = (item.y + 1) * TILE + 6;
  const depth = dir === "up" ? (item.y + 1) * TILE + 8 : item.y * TILE - 2;
  let key: string;
  let lift: number | undefined;
  switch (item.kind) {
    case "task-chair": key = `ref-task-dark-${dir}`; lift = dir === "up" ? 10 : 8; break;
    case "meet-chair": key = `hq-meet-chair-${fabric}-${dir === "up" ? "up" : "down"}`; break;
    case "sofa": key = `hq-sofa-${fabric}-${dir === "up" ? "up" : "down"}`; lift = dir === "up" ? 12 : 10; break;
    case "armchair": key = `hq-armchair-${fabric}-${dir}`; lift = 10; break;
    case "beanbag": key = `hq-beanbag-${fabric}`; lift = 4; break;
    case "cafe-chair": key = `hq-cafe-chair-${dir === "up" ? "up" : "down"}`; break;
    default: key = `hq-${item.kind}`;
  }
  api.shadow(cx, (item.y + 1) * TILE + 3, spec.w * TILE * (spec.w > 1 ? 0.9 : 0.7));
  scene.add.image(cx, bottom, key).setOrigin(0.5, 1).setDepth(depth);
  for (let dx = 0; dx < spec.w; dx++) api.seat(item.x + dx, item.y, dir, lift);
}

function placeOutdoors(scene: Phaser.Scene, api: HqSceneApi) {
  const trees = ["tree-green", "tree-lime", "tree-teal", "tree-teal2"];
  HQ_TREES.forEach((tree, i) => {
    scene.add.image(tree.x * TILE, (tree.y + 1) * TILE, trees[i % trees.length]!).setOrigin(0, 1).setDepth((tree.y + 1) * TILE);
    api.block(tree.x, tree.y);
    api.block(tree.x + 1, tree.y);
  });
  const decor = (key: string, x: number, y: number, block: boolean) => {
    scene.add.image((x + 0.5) * TILE, (y + 1) * TILE, key).setOrigin(0.5, 1).setDepth(block ? (y + 1) * TILE : y * TILE);
    if (block) api.block(x, y);
  };
  for (const x of [5, 9, 13, 17, 30, 34, 38, 42, 47, 51, 55]) decor("bush-ball", x, 1, true);
  // Planters either side of the front door.
  for (const x of [20, 27]) {
    scene.add.image((x + 0.5) * TILE, 34 * TILE, "hq-plant-big").setOrigin(0.5, 1).setDepth(34 * TILE);
    api.shadow((x + 0.5) * TILE, 34 * TILE - 3, 26);
    api.block(x, 33);
  }
  for (const [x, y, key] of [[19, 35, "flower-red"], [28, 35, "flower-yellow"], [7, 35, "flower-blue"], [24, 0, "flower-red"], [40, 35, "flower-blue"]] as const) {
    decor(key, x, y, false);
  }
}
