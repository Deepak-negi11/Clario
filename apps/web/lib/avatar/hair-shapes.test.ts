import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import { AVATAR_BASES, type AvatarBase, type AvatarLook } from "@repo/shared";
import { recolorPixels } from "./recolor";

const sheet = (base: AvatarBase) => PNG.sync.read(readFileSync(join(import.meta.dir, `../../public/assets/${base}-run.png`)));

function render(look: AvatarLook) {
  const png = sheet(look.base);
  const pixels = new Uint8ClampedArray(png.data);
  recolorPixels(pixels, png.width, png.height, look);
  return { pixels, width: png.width, height: png.height };
}

const count = ({ pixels }: { pixels: Uint8ClampedArray }, test: (r: number, g: number, b: number, a: number) => boolean) => {
  let n = 0;
  for (let i = 0; i < pixels.length; i += 4) if (test(pixels[i]!, pixels[i + 1]!, pixels[i + 2]!, pixels[i + 3]!)) n++;
  return n;
};
const opaque = (_r: number, _g: number, _b: number, a: number) => a !== 0;

// The face: pixels in the main skin colour, and eyes (outline colour with skin right above,
// the rule recolor.ts finds eyes by). Returns their positions and colours.
function face({ pixels, width, height }: { pixels: Uint8ClampedArray; width: number; height: number }) {
  const isColor = (i: number, [r, g, b]: number[]) => pixels[i + 3] !== 0 && pixels[i] === r && pixels[i + 1] === g && pixels[i + 2] === b;
  const SKIN = [0xe0, 0xac, 0x69];
  const found: string[] = [];
  for (let y = 1; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const eye = isColor(i, [0x3a, 0x3a, 0x50]) && isColor(i - width * 4, SKIN);
      if (eye || isColor(i, SKIN)) found.push(`${x},${y}`);
    }
  }
  return found;
}

const look = (base: AvatarBase, hairShape?: AvatarLook["hairShape"]): AvatarLook => ({
  base, skin: "#e0ac69", hair: "#8a5a33", top: "#3f6fd8", ...(hairShape ? { hairShape } : {}),
});

describe("hair shapes", () => {
  for (const base of AVATAR_BASES) {
    test(`${base}: curls make the head bigger and keep the eyes`, () => {
      const plain = render(look(base));
      const curly = render(look(base, "curly"));
      expect(count(curly, opaque)).toBeGreaterThan(count(plain, opaque) + 24 * 10);
      expect(face(curly)).toEqual(face(plain));
    });

    test(`${base}: a bun adds a knot on top of every frame`, () => {
      const plain = render(look(base));
      const bun = render(look(base, "bun"));
      expect(count(bun, opaque) - count(plain, opaque)).toBeGreaterThanOrEqual(24 * 8);
    });

    test(`${base}: bald recolours the hair and adds nothing`, () => {
      const plain = render(look(base));
      const bald = render(look(base, "bald"));
      expect(count(bald, opaque)).toBe(count(plain, opaque));
      const hair = (r: number, g: number, b: number) => r === 0x8a && g === 0x5a && b === 0x33;
      expect(count(bald, (r, g, b, a) => a !== 0 && hair(r, g, b))).toBe(0);
    });
  }
});
