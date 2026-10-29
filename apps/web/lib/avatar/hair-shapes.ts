import type { HairShape } from "@repo/shared";

// Hair shapes are painted on a recoloured character sheet (24 frames of 16x32 pixels in one row),
// using where the base character's hair was. Bald needs no painting: its hair is recoloured to
// the skin colour instead (see recolor.ts).

type Rgb = [number, number, number];

export type HairColors = { main: Rgb; dark: Rgb; light: Rgb; outline: Rgb };

const FRAME_WIDTH = 16;
const FRAME_HEIGHT = 32;

// The sheets outline the hair in these shades; the first one is drawn for new outline.
export const HAIR_OUTLINES: Rgb[] = [[0x46, 0x46, 0x5e], [0x56, 0x59, 0x72], [0x3a, 0x3a, 0x50]];

// Frames by the way the character faces (the walk animations in the map).
type Facing = "right" | "up" | "left" | "down";
const facingOf = (frame: number): Facing => (["right", "up", "left", "down"] as const)[Math.floor(frame / 6) % 4]!;

export function shapeHair(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  hair: Uint8Array,
  shape: HairShape,
  colors: HairColors,
) {
  if (shape === "bald") return;
  const frames = Math.floor(width / FRAME_WIDTH);
  for (let frame = 0; frame < frames; frame++) {
    for (let top = 0; top + FRAME_HEIGHT <= height; top += FRAME_HEIGHT) {
      const box = { left: frame * FRAME_WIDTH, top, facing: facingOf(frame) };
      if (shape === "curly") curl(pixels, width, hair, colors, box);
      else bun(pixels, width, hair, colors, box);
    }
  }
}

type Box = { left: number; top: number; facing: Facing };

function painter(pixels: Uint8ClampedArray, width: number) {
  const index = (x: number, y: number) => (y * width + x) * 4;
  return {
    opaque: (x: number, y: number) => pixels[index(x, y) + 3] !== 0,
    is: (x: number, y: number, [r, g, b]: Rgb) => {
      const i = index(x, y);
      return pixels[i + 3] !== 0 && pixels[i] === r && pixels[i + 1] === g && pixels[i + 2] === b;
    },
    paint: (x: number, y: number, [r, g, b]: Rgb) => {
      const i = index(x, y);
      [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]] = [r, g, b, 255];
    },
  };
}

// The rows and columns the hair covers in one frame, or null when the frame shows none.
function hairBounds(width: number, hair: Uint8Array, { left, top }: Box) {
  let minX = Infinity, maxX = -1, minY = Infinity, maxY = -1;
  for (let y = top; y < top + FRAME_HEIGHT; y++) {
    for (let x = left; x < left + FRAME_WIDTH; x++) {
      if (!hair[y * width + x]) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  return maxY < 0 ? null : { minX, maxX, minY, maxY };
}

// Curls: the hair grows one pixel outwards (over the old outline, which moves out with it), and
// a darker pixel every other step across it reads as curls at this size.
function curl(pixels: Uint8ClampedArray, width: number, hair: Uint8Array, colors: HairColors, box: Box) {
  const bounds = hairBounds(width, hair, box);
  if (!bounds) return;
  const { opaque, is, paint } = painter(pixels, width);
  const right = box.left + FRAME_WIDTH - 1;
  // Only beside and above the head, down to about the eyes: lower down, long hair meets the
  // chin and the shoulders.
  const lastRow = Math.min(bounds.maxY - 2, box.top + 19);
  const inFrame = (x: number, y: number) => x >= box.left && x <= right && y >= box.top && y <= lastRow;
  const isHair = (x: number, y: number) => inFrame(x, y) && hair[y * width + x] === 1;
  const near = (x: number, y: number, reach: number) => {
    for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) if (isHair(x + dx, y + dy)) return true;
    return false;
  };
  // The outer outline touches empty space; eyes are drawn in the outline colour too, but sit in skin.
  const onEdge = (x: number, y: number) =>
    [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].some(([nx, ny]) => nx! < box.left || nx! > right || !opaque(nx!, ny!));

  const grown: [number, number][] = [];
  for (let y = box.top; y <= lastRow; y++) {
    for (let x = box.left; x <= right; x++) {
      // The old outline (next to the hair) becomes hair, and so does the empty ring past it.
      if (hair[y * width + x]) continue;
      const outline = HAIR_OUTLINES.some((color) => is(x, y, color));
      if (opaque(x, y) ? outline && onEdge(x, y) && near(x, y, 1) : near(x, y, 2)) grown.push([x, y]);
    }
  }
  for (const [x, y] of grown) {
    paint(x, y, colors.main);
    hair[y * width + x] = 1;
  }
  // A new outline around the grown hair.
  for (const [x, y] of grown) {
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1]] as const) {
      if (nx >= box.left && nx <= right && ny >= box.top && !opaque(nx, ny)) paint(nx, ny, colors.outline);
    }
  }
  // Small curls in a brick pattern: a dark pixel with a light one beside it, rows offset.
  for (let y = bounds.minY - 1; y <= lastRow; y++) {
    for (let x = box.left; x <= right; x++) {
      if (!hair[y * width + x]) continue;
      const step = (x - box.left + (Math.floor((y - box.top) / 2) % 2) * 2) % 4;
      if ((y - box.top) % 2 === 0 && step === 0) paint(x, y, colors.dark);
      else if ((y - box.top) % 2 === 1 && step === 1) paint(x, y, colors.light);
    }
  }
}

// A bun on top of the head, towards the back of it when the character faces sideways.
function bun(pixels: Uint8ClampedArray, width: number, hair: Uint8Array, colors: HairColors, box: Box) {
  const bounds = hairBounds(width, hair, box);
  if (!bounds) return;
  const { opaque, paint } = painter(pixels, width);
  const center = Math.round((bounds.minX + bounds.maxX) / 2);
  const shift = box.facing === "right" ? -3 : box.facing === "left" ? 3 : 0;
  const bunLeft = center + shift - 2;
  const bunTop = bounds.minY - 3;
  if (bunTop - 1 < box.top) return;
  // 4 wide and 3 tall, corners cut, sitting one row into the hair.
  const cells: [number, number][] = [];
  for (let dy = 0; dy < 4; dy++) {
    for (let dx = 0; dx < 4; dx++) {
      if (dy === 0 && (dx === 0 || dx === 3)) continue;
      cells.push([bunLeft + dx, bunTop + dy]);
    }
  }
  const inside = new Set(cells.map(([x, y]) => `${x},${y}`));
  for (const [x, y] of cells) {
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x - 1, y - 1], [x + 1, y - 1]] as const) {
      if (inside.has(`${nx},${ny}`) || nx < box.left || nx >= box.left + FRAME_WIDTH || opaque(nx, ny)) continue;
      paint(nx, ny, colors.outline);
    }
  }
  for (const [x, y] of cells) paint(x, y, colors.main);
  paint(bunLeft + 1, bunTop, colors.light);
  paint(bunLeft + 1, bunTop + 1, colors.light);
}
