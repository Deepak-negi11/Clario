import type { AvatarBase, AvatarLook } from "@repo/shared";
import { HAIR_OUTLINES, shapeHair } from "./hair-shapes";

// Each character sheet is 24 frames of 16x32 pixels in one row. These lists say which of a
// sheet's colours are hair, top and skin. The first colour of each list is its main shade:
// the chosen colour replaces it, and the other shades keep their distance from it in
// lightness, so highlights and shadows survive. Some shades are shared (adam's hair shade is
// also on his trousers, some eyes use a shirt shade), so hair stops and the top starts at a
// given row of the frame.
type Part = { colors: string[]; fromRow?: number; toRow?: number };
type Recipe = { hair: Part; top: Part; skin: Part };

export const FRAME_WIDTH = 16;
export const FRAME_HEIGHT = 32;
export const FRAME_COUNT = 24;

const LIGHT_SKIN = ["#ffcbb0", "#f6ae9f", "#ffb893", "#f69784", "#e19b9b"];

const RECIPES: Record<AvatarBase, Recipe> = {
  adam: {
    hair: { colors: ["#687253", "#959d58", "#5f694a", "#5d6043"], toRow: 23 },
    top: { colors: ["#805e8e", "#9f74a8"], fromRow: 20 },
    skin: { colors: [...LIGHT_SKIN, "#bba386"] },
  },
  alex: {
    hair: { colors: ["#8d7051", "#ba8d5e", "#957350", "#8a6552", "#6f5446"], toRow: 23 },
    top: { colors: ["#a2394b", "#ae4a52", "#6f494d", "#5a444a"], fromRow: 20 },
    skin: { colors: LIGHT_SKIN },
  },
  amelia: {
    hair: { colors: ["#8a6552", "#ba8d5e", "#957350", "#8d7051", "#674d49"], toRow: 26 },
    top: { colors: ["#a85377", "#b95d72"], fromRow: 20 },
    skin: { colors: ["#bf8b78", "#b57972", "#b58472", "#a77a67", "#aa5e56", "#b2736d"] },
  },
  bob: {
    hair: { colors: ["#5d585f", "#716b6e", "#555157"], toRow: 23 },
    top: { colors: ["#6c6e85"], fromRow: 20 },
    skin: { colors: ["#ffcbb0", "#f6ae9f", "#c9a495", "#b59e95", "#e19b9b"] },
  },
};

/** The look each character has with no changes. */
export function originalLook(base: AvatarBase): AvatarLook {
  const recipe = RECIPES[base];
  return { base, skin: recipe.skin.colors[0]!, hair: recipe.hair.colors[0]!, top: recipe.top.colors[0]! };
}

export const sheetUrl = (base: AvatarBase) => `/assets/${base}-run.png`;

/** A stable texture key for a look, so identical looks share one texture. */
export const lookKey = (look: AvatarLook) =>
  `look-${look.base}-${look.skin.slice(1)}-${look.hair.slice(1)}-${look.top.slice(1)}${look.glasses ? "-glasses" : ""}${look.beard ? "-beard" : ""}${look.hairShape ? `-${look.hairShape}` : ""}`;

type Hsl = { h: number; s: number; l: number };

const toRgb = (hex: string): [number, number, number] => {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

function toHsl([r, g, b]: [number, number, number]): Hsl {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === rn ? (gn - bn) / d + (gn < bn ? 6 : 0) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  return { h: h / 6, s, l };
}

function fromHsl({ h, s, l }: Hsl): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255].map(Math.round) as [number, number, number];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (u < 1 / 6) return p + (q - p) * 6 * u;
    if (u < 1 / 2) return q;
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
    return p;
  };
  return [channel(h + 1 / 3), channel(h), channel(h - 1 / 3)].map((v) => Math.round(v * 255)) as [number, number, number];
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const packRgb = (r: number, g: number, b: number) => (r << 16) | (g << 8) | b;

// Old colour -> new colour for one part.
function partColors(part: Part, target: string) {
  const main = toHsl(toRgb(part.colors[0]!));
  const goal = toHsl(toRgb(target));
  const map = new Map<number, [number, number, number]>();
  for (const color of part.colors) {
    const shade = toHsl(toRgb(color));
    const [r, g, b] = toRgb(color);
    map.set(packRgb(r, g, b), fromHsl({
      h: goal.h,
      s: clamp01(goal.s + (shade.s - main.s)),
      l: clamp01(goal.l + (shade.l - main.l)),
    }));
  }
  return map;
}

// Glasses and beards have no pixels of their own in the sheets, so they are painted on. Every
// sheet draws its eyes in the outline colour with skin right above them, which gives each
// frame's eye row and eye columns (two eyes facing down, one facing sideways, none from behind).
const OUTLINE = 0x3a3a50;
const GLASSES_RIM: [number, number, number] = [0x2b, 0x2b, 0x3a];
const GLASSES_GLINT: [number, number, number] = [0xd8, 0xe8, 0xf4];
// The walking-up frames show the back of the head.
const BACK_FRAMES = [6, 11];
// The eyes and the skin below them lie within these rows in every frame of the walk; further
// down is the body, whose hands are skin too.
const FACE_ROWS = [14, 22];

function paintFace(pixels: Uint8ClampedArray, width: number, skin: Uint8Array, look: AvatarLook) {
  const hair = toHsl(toRgb(look.hair));
  const beard = fromHsl({ ...hair, l: clamp01(hair.l - 0.06) });
  const isSkin = (x: number, y: number) => skin[y * width + x] === 1;
  const isOutline = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return pixels[i + 3] !== 0 && packRgb(pixels[i]!, pixels[i + 1]!, pixels[i + 2]!) === OUTLINE;
  };
  const paint = (x: number, y: number, [r, g, b]: [number, number, number]) => {
    const i = (y * width + x) * 4;
    [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]] = [r, g, b, 255];
  };

  for (let frame = 0; frame < width / FRAME_WIDTH; frame++) {
    if (frame >= BACK_FRAMES[0]! && frame <= BACK_FRAMES[1]!) continue;
    const left = frame * FRAME_WIDTH;
    const right = left + FRAME_WIDTH - 1;
    let eyeRow = -1;
    const eyes: number[] = [];
    for (let y = FACE_ROWS[0]!; y <= FACE_ROWS[1]! && eyeRow < 0; y++) {
      for (let x = left + 1; x < right; x++) {
        if (!isOutline(x, y) || !isSkin(x, y - 1) || !(isSkin(x - 1, y) || isSkin(x + 1, y))) continue;
        eyeRow = y;
        eyes.push(x);
      }
    }
    if (!eyes.length) continue;
    const facingDown = eyes.length > 1;
    const facingRight = !facingDown && eyes[0]! - left >= FRAME_WIDTH / 2;
    const firstEye = Math.min(...eyes);
    const lastEye = Math.max(...eyes);

    if (look.beard) {
      // Sideburns down the jaw (only the back one when facing sideways), then everything below
      // the eyes except the cheek right under each eye.
      for (let y = eyeRow - 1; y <= eyeRow + 1; y++) {
        let first = -1;
        let last = -1;
        for (let x = left; x <= right; x++) {
          if (!isSkin(x, y)) continue;
          if (first < 0) first = x;
          last = x;
        }
        if (first < 0) continue;
        if (facingDown || facingRight) paint(first, y, beard);
        if (facingDown || !facingRight) paint(last, y, beard);
      }
      for (let y = eyeRow + 1; y <= FACE_ROWS[1]!; y++) {
        for (let x = left; x <= right; x++) {
          if (!isSkin(x, y) || (y === eyeRow + 1 && eyes.some((eye) => Math.abs(eye - x) <= 1))) continue;
          paint(x, y, beard);
        }
      }
    }

    if (look.glasses) {
      // A rim across the top of the eyes, a glint either side of each eye, and from the side
      // the arm running back to the ear.
      for (let x = firstEye - 1; x <= lastEye + 1; x++) paint(x, eyeRow - 1, GLASSES_RIM);
      for (const eye of eyes) for (const x of [eye - 1, eye + 1]) if (isSkin(x, eyeRow)) paint(x, eyeRow, GLASSES_GLINT);
      if (!facingDown) {
        for (let step = 1; step <= 3; step++) {
          const x = facingRight ? firstEye - 1 - step : lastEye + 1 + step;
          if (x >= left && x <= right) paint(x, eyeRow - 1, GLASSES_RIM);
        }
      }
    }
  }
}

/** Returns a copy of a character sheet with the look's colours, face details and hair shape. */
export function recolorSheet(sheet: CanvasImageSource, width: number, height: number, look: AvatarLook) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return canvas;
  ctx.drawImage(sheet, 0, 0);
  const image = ctx.getImageData(0, 0, width, height);
  recolorPixels(image.data, width, height, look);
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** recolorSheet's work on a sheet's RGBA pixels, in place, so it can run without a canvas. */
export function recolorPixels(pixels: Uint8ClampedArray, width: number, height: number, look: AvatarLook) {
  const recipe = RECIPES[look.base];
  // A shaved head is the hair recoloured to a scalp, a little darker than the face.
  const skinHsl = toHsl(toRgb(look.skin));
  const scalp = fromHsl({ ...skinHsl, l: clamp01(skinHsl.l - 0.05) });
  const hairTarget = look.hairShape === "bald" ? `#${scalp.map((v) => v.toString(16).padStart(2, "0")).join("")}` : look.hair;
  const parts = ([["hair", hairTarget], ["top", look.top], ["skin", look.skin]] as const).map(([name, color]) => ({
    name,
    part: recipe[name],
    colors: partColors(recipe[name], color),
  }));
  // Where the skin and hair were before recolouring, for painting the face and hair shape afterwards.
  const skinColors = new Set(recipe.skin.colors.map((color) => packRgb(...toRgb(color))));
  const skin = look.glasses || look.beard ? new Uint8Array(width * height) : null;
  const hair = look.hairShape && look.hairShape !== "bald" ? new Uint8Array(width * height) : null;
  for (let y = 0; y < height; y++) {
    const row = y % FRAME_HEIGHT;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (pixels[i + 3] === 0) continue;
      const key = packRgb(pixels[i]!, pixels[i + 1]!, pixels[i + 2]!);
      if (skin && skinColors.has(key)) skin[y * width + x] = 1;
      for (const { name, part, colors } of parts) {
        if ((part.fromRow !== undefined && row < part.fromRow) || (part.toRow !== undefined && row > part.toRow)) continue;
        const next = colors.get(key);
        if (!next) continue;
        [pixels[i], pixels[i + 1], pixels[i + 2]] = next;
        if (hair && name === "hair") hair[y * width + x] = 1;
        break;
      }
    }
  }
  if (skin) paintFace(pixels, width, skin, look);
  if (hair && look.hairShape) {
    const main = toHsl(toRgb(look.hair));
    shapeHair(pixels, width, height, hair, look.hairShape, {
      main: toRgb(look.hair),
      dark: fromHsl({ ...main, l: clamp01(main.l - 0.12) }),
      light: fromHsl({ ...main, l: clamp01(main.l + 0.12) }),
      outline: HAIR_OUTLINES[0]!,
    });
  }
}
