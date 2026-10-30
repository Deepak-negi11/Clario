import type Phaser from "phaser";
import { BIKES, DRINKS, type Bike, type Drink } from "@repo/shared";
import { PixelSprite, darken } from "./lounge-art";

// Furniture for the auditorium, the study and the conference room, and the corridor pieces
// around them, drawn pixel by pixel in the same style as office-art.ts: one art pixel is 2x2
// world pixels, 16 art pixels span a tile, a lit top, a shaded side and a one-pixel outline.
// Texture keys are what clario-hq-builder.ts places (`hq-<kind>...`).

const METAL = { hi: 0xd3d8df, base: 0x9aa2af, dark: 0x646b78, line: 0x3e434d };
const OAK = { hi: 0xf3d9a8, top: 0xe2b97c, edge: 0xc4955a, dark: 0x9b6e3c, line: 0x5a3c1f };
const CHARCOAL = { hi: 0x5d6270, top: 0x454a57, edge: 0x373b47, dark: 0x2c2f39, line: 0x17191f };
const BRASS = 0xc9a24a;

function line(s: PixelSprite, color: number, x0: number, y0: number, x1: number, y1: number) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= steps; i++) s.set(color, Math.round(x0 + ((x1 - x0) * i) / steps), Math.round(y0 + ((y1 - y0) * i) / steps));
}

function ring(s: PixelSprite, color: number, cx: number, cy: number, r: number, from = 0, to = 360) {
  for (let a = from; a <= to; a += 4) {
    const rad = (a * Math.PI) / 180;
    s.set(color, Math.round(cx + Math.cos(rad) * r), Math.round(cy + Math.sin(rad) * r));
  }
}

// The conference chair and the auditorium seat are drawn in chair-art.ts with the other chairs.

// Tall two-door wardrobe in dark charcoal wood.
function wardrobe() {
  const c = CHARCOAL;
  const s = new PixelSprite(16, 42);
  s.box(c.top, 1, 3, 14, 35, 1);
  s.rect(c.dark, 0, 1, 16, 3);
  s.rect(c.hi, 0, 1, 16, 1);
  s.rect(c.edge, 13, 4, 2, 34);
  s.rect(c.line, 7, 5, 1, 32);
  for (const [x, y] of [[2, 6], [9, 6], [2, 22], [9, 22]] as const) {
    s.rect(c.edge, x, y, 4, 13);
    s.rect(c.hi, x, y, 4, 1);
  }
  s.rect(METAL.hi, 6, 19, 1, 3);
  s.rect(METAL.hi, 8, 19, 1, 3);
  s.rect(c.dark, 1, 38, 14, 2);
  s.rect(c.line, 1, 40, 2, 1);
  s.rect(c.line, 13, 40, 2, 1);
  s.outline(c.line);
  return s;
}

// A desk globe in a brass meridian ring, on a small oak cabinet.
function globe() {
  const s = new PixelSprite(16, 32);
  s.box(OAK.top, 2, 18, 12, 12, 1);
  s.rect(OAK.hi, 2, 18, 12, 2);
  s.rect(OAK.edge, 12, 20, 2, 10);
  s.rect(OAK.dark, 3, 24, 9, 1);
  s.rect(BRASS, 7, 22, 2, 1);
  s.rect(BRASS, 7, 27, 2, 1);
  s.rect(BRASS, 5, 16, 6, 2);
  s.rect(BRASS, 7, 14, 2, 2);
  s.ellipse(0x4a90d9, 8, 8, 5.5, 5.5);
  s.ellipse(0x3a78bf, 9, 9.5, 4, 3.5);
  s.ellipse(0x6fbf73, 6, 6, 2, 1.6);
  s.ellipse(0x6fbf73, 10, 10, 1.6, 2.2);
  s.ellipse(0xe8d39a, 9.5, 5, 1.1, 0.8);
  s.set(0xbfe0fb, 5, 5);
  s.set(0xbfe0fb, 6, 4);
  ring(s, BRASS, 8, 8, 6.6, 110, 300);
  s.outline(0x2c3442);
  return s;
}

// Wooden coat stand with a mustard coat, a blue scarf and a hat.
function coatRack() {
  const s = new PixelSprite(16, 42);
  s.rect(OAK.dark, 3, 39, 10, 2);
  s.rect(OAK.edge, 2, 40, 2, 1);
  s.rect(OAK.edge, 12, 40, 2, 1);
  s.rect(OAK.top, 7, 4, 2, 36);
  s.rect(OAK.hi, 7, 4, 1, 36);
  s.rect(OAK.top, 4, 6, 8, 1);
  s.set(OAK.dark, 4, 5);
  s.set(OAK.dark, 11, 5);
  s.ellipse(0x3b3f4a, 8, 3, 4, 1.6);
  s.rect(0x2a2d35, 6, 1, 4, 2);
  s.box(0xd6a043, 8, 7, 6, 17, 2);
  s.rect(0xb8842f, 8, 7, 6, 2);
  s.rect(0xb8842f, 12, 9, 1, 14);
  s.rect(0xf0c46a, 9, 10, 1, 9);
  s.rect(0x3a6ee8, 3, 7, 3, 13);
  s.rect(0x2f58bd, 5, 7, 1, 13);
  s.rect(0xf2f2f2, 3, 18, 3, 1);
  s.outline(0x2a2018);
  return s;
}

// Fish tank on a dark stand: plants, gravel, a few fish and the lid light.
function aquarium() {
  const s = new PixelSprite(32, 32);
  s.box(CHARCOAL.top, 1, 20, 30, 11, 1);
  s.rect(CHARCOAL.hi, 1, 20, 30, 1);
  s.rect(CHARCOAL.line, 15, 22, 1, 8);
  s.rect(METAL.hi, 13, 25, 1, 2);
  s.rect(METAL.hi, 17, 25, 1, 2);
  s.rect(0x2f333c, 1, 3, 30, 17);
  s.rect(0x9aa2af, 1, 2, 30, 2);
  s.rect(0xf6f0c8, 3, 3, 26, 1);
  s.rect(0x8fd3ef, 2, 5, 28, 6);
  s.rect(0x63b5df, 2, 11, 28, 6);
  s.rect(0xd8c08a, 2, 17, 28, 2);
  for (const x of [4, 9, 13, 19, 24, 28]) s.set(0xb89d66, x, 18);
  for (const [x, h] of [[4, 8], [6, 6], [23, 9], [26, 7], [28, 5]] as const) {
    s.rect(0x3f9a54, x, 17 - h, 1, h);
    s.set(0x6cc36f, x, 17 - h);
  }
  for (const [x, y, color] of [[9, 8, 0xf5862b], [17, 12, 0xf5862b], [13, 6, 0xf6c945], [21, 9, 0xf0f0f0]] as const) {
    s.rect(color, x, y, 3, 2);
    s.set(color, x + 3, y);
    s.set(color, x + 3, y + 1);
    s.set(0x1d1d1d, x, y);
  }
  for (const [x, y] of [[11, 4], [12, 7], [19, 6]] as const) s.set(0xe4f6fd, x, y);
  s.rect(0xd8f1fb, 3, 6, 1, 9);
  s.outline(0x1d2028);
  return s;
}

// Snack and drink machine: a blue header, a glass front with rows of snacks, the keypad and the tray.
function vendingMachine() {
  const s = new PixelSprite(16, 42);
  s.box(0xe9edf3, 0, 1, 16, 38, 1);
  s.rect(0x3a7bd5, 0, 1, 16, 5);
  s.rect(0x8cb8f2, 1, 2, 14, 1);
  s.rect(0xffffff, 4, 3, 8, 1);
  s.rect(0xc9cfd9, 14, 6, 2, 33);
  s.rect(0x2c3a52, 2, 7, 9, 22);
  const snacks = [0xe5484d, 0xf6c945, 0x4caf6d, 0x3a6ee8, 0xf29b38, 0xb37fe0];
  for (let r = 0; r < 5; r++) {
    const y = 8 + r * 4;
    for (let i = 0; i < 4; i++) s.rect(snacks[(r * 2 + i) % snacks.length]!, 3 + i * 2, y, 2, 3);
    s.rect(0x4a5a78, 2, y + 3, 9, 1);
  }
  s.rect(0x5f6f8f, 3, 8, 1, 18);
  s.rect(0xcfd5df, 12, 8, 2, 12);
  for (let y = 9; y < 18; y += 2) s.rect(0x6c7486, 12, y, 2, 1);
  s.rect(0x2f333c, 12, 21, 2, 1);
  s.rect(0x1d2433, 2, 31, 10, 4);
  s.rect(0x3a4256, 2, 31, 10, 1);
  s.rect(0x2f333c, 1, 39, 2, 2);
  s.rect(0x2f333c, 13, 39, 2, 2);
  s.outline(0x354055);
  return s;
}

export const BIKE_FRAMES: Record<Bike, number> = { orange: 0xf28a2e, teal: 0x2fb3a6 };
const TYRE = 0x2a2d35;

// A bicycle seen from the side, facing right, its back wheel's hub at (x, y).
function drawBike(s: PixelSprite, x: number, y: number, frame: number) {
  ring(s, TYRE, x, y, 4.5);
  ring(s, TYRE, x + 12, y, 4.5);
  s.set(METAL.base, x, y);
  s.set(METAL.base, x + 12, y);
  line(s, frame, x, y, x + 5, y - 5);
  line(s, frame, x + 5, y - 5, x + 10, y - 5);
  line(s, frame, x + 10, y - 5, x + 12, y);
  line(s, frame, x + 5, y - 5, x + 6, y);
  line(s, frame, x, y, x + 6, y);
  line(s, frame, x + 6, y, x + 10, y - 5);
  s.rect(TYRE, x + 3, y - 7, 4, 1);
  line(s, METAL.dark, x + 10, y - 5, x + 11, y - 8);
  s.rect(TYRE, x + 10, y - 8, 3, 1);
}

// Where each bike stands in the rack (its back hub, in the rack sprite's art pixels), and where
// that hub is in a lone side-view bike, so a bike drawn on its own lines up with the rack.
export const RACK_SLOTS: Record<Bike, { x: number; y: number }> = { orange: { x: 3, y: 15 }, teal: { x: 14, y: 19 } };
export const RACK_SIZE = { w: 32, h: 26 };
export const BIKE_SIDE_HUB = { x: 4, y: 11 };

// A low steel rack, with its two bicycles (orange and teal) or empty. On Clario HQ the bikes can
// be ridden, so the rack is drawn empty and each bike on its own (props-on-map.ts).
function bikeRack(withBikes: boolean) {
  const s = new PixelSprite(RACK_SIZE.w, RACK_SIZE.h);
  s.rect(METAL.dark, 1, 23, 30, 2);
  s.rect(METAL.base, 1, 23, 30, 1);
  for (const x of [4, 15, 26]) {
    s.rect(METAL.base, x, 13, 1, 10);
    s.rect(METAL.base, x + 2, 13, 1, 10);
    s.rect(METAL.base, x, 13, 3, 1);
  }
  if (withBikes) for (const bike of BIKES) drawBike(s, RACK_SLOTS[bike].x, RACK_SLOTS[bike].y, BIKE_FRAMES[bike]);
  return s;
}

// One bike from the side (facing right), from the front (coming towards you) and from behind,
// for the rack and for someone riding it.
function bikeSide(frame: number) {
  const s = new PixelSprite(22, 16);
  drawBike(s, BIKE_SIDE_HUB.x, BIKE_SIDE_HUB.y, frame);
  return s;
}

function bikeFront(frame: number) {
  const s = new PixelSprite(14, 20);
  s.rect(TYRE, 5, 2, 4, 2);
  s.rect(frame, 6, 4, 2, 3);
  s.rect(METAL.dark, 1, 7, 12, 1);
  s.rect(TYRE, 0, 7, 2, 2);
  s.rect(TYRE, 12, 7, 2, 2);
  s.rect(frame, 6, 8, 2, 3);
  s.rect(METAL.dark, 5, 11, 1, 3);
  s.rect(METAL.dark, 8, 11, 1, 3);
  s.rect(TYRE, 6, 10, 2, 9);
  s.rect(METAL.base, 6, 14, 2, 1);
  s.rect(0xf4f4f4, 6, 11, 2, 1);
  s.outline(0x1b1d22);
  return s;
}

function bikeBack(frame: number) {
  const s = new PixelSprite(14, 20);
  s.rect(METAL.dark, 2, 2, 10, 1);
  s.rect(TYRE, 1, 2, 2, 2);
  s.rect(TYRE, 11, 2, 2, 2);
  s.rect(frame, 6, 3, 2, 4);
  s.rect(TYRE, 5, 6, 4, 2);
  s.rect(frame, 5, 8, 1, 4);
  s.rect(frame, 8, 8, 1, 4);
  s.rect(TYRE, 6, 10, 2, 9);
  s.rect(0xd9534f, 6, 11, 2, 2);
  s.rect(METAL.base, 6, 15, 2, 1);
  s.outline(0x1b1d22);
  return s;
}

// A drinks can: its colour, a white label band and a silver top.
const CAN_COLORS: Record<Drink, number> = { orange: 0xf28a2e, cola: 0xc0392b, lime: 0x7cc243, berry: 0x8e44ad };
function can(drink: Drink) {
  const c = CAN_COLORS[drink];
  const s = new PixelSprite(6, 10);
  s.rect(0xd3d8df, 1, 0, 4, 1);
  s.rect(c, 1, 1, 4, 8);
  s.rect(0xf8f8f8, 1, 4, 4, 2);
  s.rect(darken(c, 0.75), 4, 1, 1, 8);
  s.rect(0xffffff, 1, 1, 1, 3);
  s.rect(0x9aa2af, 1, 9, 4, 1);
  s.outline(0x2a2d35);
  return s;
}

// Orange cone with a reflective band on a square rubber base.
function trafficCone() {
  const s = new PixelSprite(16, 20);
  s.rect(0x2f333c, 2, 17, 12, 2);
  s.rect(0x464b56, 2, 17, 12, 1);
  for (let y = 2; y < 17; y++) {
    const half = Math.round(1 + (y - 2) * 0.36);
    s.rect(0xf26a1b, 8 - half, y, half * 2, 1);
    s.set(0xffa25a, 8 - half, y);
    s.set(0xc8521a, 7 + half, y);
  }
  s.shade(0xf4f4f4, 0, 8, 16, 3);
  s.shade(0xffffff, 0, 8, 16, 1);
  s.outline(0x5a2a0c);
  return s;
}

export function makeReferenceTextures(scene: Phaser.Scene) {
  wardrobe().bake(scene, "hq-wardrobe");
  globe().bake(scene, "hq-globe");
  coatRack().bake(scene, "hq-coat-rack");
  aquarium().bake(scene, "hq-aquarium");
  vendingMachine().bake(scene, "hq-vending-machine");
  bikeRack(true).bake(scene, "hq-bike-rack");
  bikeRack(false).bake(scene, "hq-bike-rack-empty");
  for (const bike of BIKES) {
    bikeSide(BIKE_FRAMES[bike]).bake(scene, `hq-ride-${bike}-side`);
    bikeFront(BIKE_FRAMES[bike]).bake(scene, `hq-ride-${bike}-front`);
    bikeBack(BIKE_FRAMES[bike]).bake(scene, `hq-ride-${bike}-back`);
  }
  for (const drink of DRINKS) can(drink).bake(scene, `hq-can-${drink}`);
  trafficCone().bake(scene, "hq-traffic-cone");
}
