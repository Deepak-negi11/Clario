import type Phaser from "phaser";
import { COFFEES, type Coffee } from "@repo/shared";
import { PixelSprite, darken } from "./lounge-art";

// The kitchen coffee machine's cups, in the pixel style of the drinks cans (reference-art.ts): each
// coffee in its own cup, full and empty. Empty ones sit under the spout while it brews and the full
// one fades in over it; the full one is carried and sipped like a can. Keys: hq-cup-<coffee>[-empty].

const WHITE = 0xf6f4ef;
const SHADE = 0xd9d4ca;
const OUTLINE = 0x2a2d35;
const ESPRESSO = 0x4a2a17;
const CREMA = 0xb8783d;
const MILK = 0xe9d6b8;
const FOAM = 0xfbf7ee;
const CHAI = 0xc89660;
const CLAY = 0xb5552f;
const COCOA = 0x5a2e1a;

// A white cup on a saucer, `w` wide at the brim and `h` tall, its top on row `top`.
function cupOnSaucer(s: PixelSprite, w: number, h: number, top: number) {
  const left = Math.floor((s.w - w) / 2);
  s.rect(SHADE, 0, top + h, s.w, 1);
  s.rect(WHITE, 1, top + h, s.w - 2, 1);
  s.rect(WHITE, left, top, w, h);
  s.rect(SHADE, left + w - 1, top, 1, h);
  // The handle on the right.
  s.rect(WHITE, left + w, top + 1, 1, Math.max(1, h - 2));
  return left;
}

function espresso(full: boolean) {
  const s = new PixelSprite(7, 6);
  const left = cupOnSaucer(s, 4, 3, 2);
  s.rect(full ? CREMA : SHADE, left, 2, 4, 1);
  if (full) s.set(ESPRESSO, left + 3, 2);
  s.outline(OUTLINE);
  return s;
}

function cappuccino(full: boolean) {
  const s = new PixelSprite(9, 7);
  const left = cupOnSaucer(s, 6, 4, 2);
  if (full) {
    s.rect(FOAM, left, 1, 6, 2);
    s.set(COCOA, left + 2, 1);
    s.set(CREMA, left + 4, 2);
  } else s.rect(SHADE, left, 2, 6, 1);
  s.outline(OUTLINE);
  return s;
}

// A tall glass: coffee at the bottom, milk, and foam on top, seen through the glass.
function latte(full: boolean) {
  const s = new PixelSprite(6, 10);
  const glass = 0xdfeaf0;
  s.rect(glass, 1, 1, 4, 9);
  if (full) {
    s.rect(FOAM, 1, 1, 4, 2);
    s.rect(MILK, 1, 3, 4, 3);
    s.rect(CREMA, 1, 6, 4, 2);
    s.rect(ESPRESSO, 1, 8, 4, 2);
  }
  s.rect(0xffffff, 1, 2, 1, 6);
  s.outline(OUTLINE);
  return s;
}

// A kulhad: an unglazed clay cup, wider at the brim, with chai to the top.
function chai(full: boolean) {
  const s = new PixelSprite(7, 7);
  for (let y = 1; y < 7; y++) {
    const inset = y > 4 ? 1 : 0;
    s.rect(CLAY, inset, y, 7 - inset * 2, 1);
  }
  s.rect(darken(CLAY, 0.8), 5, 2, 1, 4);
  s.rect(full ? CHAI : darken(CLAY, 0.6), 1, 1, 5, 1);
  s.outline(0x3a1a0c);
  return s;
}

// A red mug of hot chocolate under whipped cream.
function hotChocolate(full: boolean) {
  const s = new PixelSprite(8, 8);
  const red = 0xc8423f;
  s.rect(red, 1, 2, 5, 6);
  s.rect(darken(red, 0.78), 5, 2, 1, 6);
  s.rect(red, 6, 3, 1, 3);
  if (full) {
    s.rect(FOAM, 1, 1, 5, 2);
    s.rect(0xffffff, 2, 0, 3, 1);
    s.set(COCOA, 3, 1);
  } else s.rect(COCOA, 1, 2, 5, 1);
  s.outline(OUTLINE);
  return s;
}

const DRAW: Record<Coffee, (full: boolean) => PixelSprite> = {
  espresso,
  cappuccino,
  latte,
  chai,
  "hot-chocolate": hotChocolate,
};

export const cupKey = (coffee: Coffee, full = true) => `hq-cup-${coffee}${full ? "" : "-empty"}`;

export function makeCoffeeTextures(scene: Phaser.Scene) {
  for (const coffee of COFFEES) {
    for (const full of [true, false]) {
      if (!scene.textures.exists(cupKey(coffee, full))) DRAW[coffee](full).bake(scene, cupKey(coffee, full));
    }
  }
}
