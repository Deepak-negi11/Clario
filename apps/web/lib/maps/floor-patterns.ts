// Floors drawn the same way on the 2D map (clario-hq-builder.ts) and in the 3D view
// (office-scene.ts): a 64 x 64 square covering two tiles, repeated. `fill` paints a rectangle in a
// colour (0xRRGGBB), with an optional opacity.
export type Fill = (color: number, x: number, y: number, w: number, h: number, alpha?: number) => void;

export const PATTERNED_FLOORS = ["maple", "crosstile", "damask", "brick", "lavender"] as const;
export type PatternedFloor = (typeof PATTERNED_FLOORS)[number];

export const isPatternedFloor = (kind: string): kind is PatternedFloor => (PATTERNED_FLOORS as readonly string[]).includes(kind);

export function drawFloorPattern(kind: PatternedFloor, fill: Fill) {
  if (kind === "maple") {
    // Light basket-weave parquet (the auditorium): half-tile blocks of four planks, turning
    // ninety degrees from block to block.
    const planks = [0xead5ae, 0xe2caa0, 0xeedcb8, 0xe6d0a7];
    for (let bx = 0; bx < 4; bx++) for (let by = 0; by < 4; by++) {
      const across = (bx + by) % 2 === 0;
      for (let s = 0; s < 4; s++) {
        const color = planks[(bx * 3 + by * 2 + s) % 4]!;
        if (across) {
          fill(color, bx * 16, by * 16 + s * 4, 16, 4);
          fill(0xd4b98c, bx * 16, by * 16 + s * 4 + 3, 16, 1, 0.7);
        } else {
          fill(color, bx * 16 + s * 4, by * 16, 4, 16);
          fill(0xd4b98c, bx * 16 + s * 4 + 3, by * 16, 1, 16, 0.7);
        }
      }
      fill(0xc9ab7c, bx * 16, by * 16, 16, 1, 0.6);
      fill(0xc9ab7c, bx * 16, by * 16, 1, 16, 0.6);
    }
  } else if (kind === "crosstile") {
    // Cream tiles, one a tile, each with a sunken square and a soft X from corner to corner (the study).
    for (let tx = 0; tx < 2; tx++) for (let ty = 0; ty < 2; ty++) {
      const x0 = tx * 32;
      const y0 = ty * 32;
      fill(0xefe3c8, x0, y0, 32, 32);
      fill(0xf6eedb, x0 + 3, y0 + 3, 26, 26);
      fill(0xe8dabb, x0 + 5, y0 + 5, 22, 22);
      for (let i = 0; i < 22; i++) {
        fill(0xdcc9a3, x0 + 5 + i, y0 + 5 + i, 2, 1, 0.8);
        fill(0xdcc9a3, x0 + 25 - i, y0 + 5 + i, 2, 1, 0.8);
      }
      fill(0xd6c39c, x0, y0 + 31, 32, 1);
      fill(0xd6c39c, x0 + 31, y0, 1, 32);
      fill(0xfaf4e6, x0, y0, 32, 1, 0.8);
    }
  } else if (kind === "brick") {
    // Cream bricks, 16 x 8 with staggered joints, a lit top edge and tan mortar (Open Desks' lounge).
    const bricks = [0xf4e8d3, 0xf1e3cc, 0xf6ecd9, 0xf0e2ca];
    for (let row = 0; row < 8; row++) {
      const y = row * 8;
      const shift = row % 2 ? 8 : 0;
      for (let col = -1; col < 4; col++) {
        const x = col * 16 + shift;
        fill(bricks[(row * 5 + col * 3 + 8) % bricks.length]!, x, y, 16, 8);
        fill(0xfbf5ea, x + 1, y, 14, 1);
        fill(0xe5d1b1, x, y + 7, 16, 1);
        fill(0xe5d1b1, x + 15, y, 1, 8);
      }
    }
  } else if (kind === "lavender") {
    // Lavender carpet with darker zigzag bands and a soft fleck (Open Desks' cubicles).
    fill(0x8e91d9, 0, 0, 64, 64);
    for (let i = 0; i < 160; i++) fill(i % 2 ? 0x878ad3 : 0x989be0, (i * 37) % 64, (i * 23 + Math.floor(i / 8)) % 64, 1, 1);
    for (let row = 0; row < 4; row++) {
      for (let x = 0; x < 64; x++) {
        const t = x % 16;
        const y = row * 16 + 4 + Math.floor((t < 8 ? t : 16 - t) / 2);
        fill(0x7c7fca, x, y, 1, 4);
        fill(0xa1a4e6, x, y + 4, 1, 1);
      }
    }
  } else {
    // Light grey carpet with a woven medallion every half tile (the conference room).
    fill(0xd9dce6, 0, 0, 64, 64);
    for (let cx = 8; cx < 64; cx += 16) for (let cy = 8; cy < 64; cy += 16) {
      const odd = ((cx - 8) / 16 + (cy - 8) / 16) % 2 === 1;
      for (let d = 0; d <= 5; d++) {
        for (const [x, y] of [[cx - d, cy - 5 + d], [cx + d, cy - 5 + d], [cx - d, cy + 5 - d], [cx + d, cy + 5 - d]] as const) {
          fill(odd ? 0xcdd1dd : 0xc6cad8, x, y, 1, 1);
        }
      }
      fill(odd ? 0xe4e6ee : 0xcdd1dd, cx - 1, cy - 1, 2, 2);
    }
    for (let i = 0; i < 64; i += 4) {
      fill(0xe2e4ec, i, 0, 2, 1, 0.7);
      fill(0xe2e4ec, 0, i, 1, 2, 0.7);
    }
  }
}
