import type Phaser from "phaser";

// Lounge furniture drawn pixel by pixel in code (no image files), in the same chunky
// style as the avatars: one art pixel is 2x2 world pixels, so 16 art pixels span a tile.
const ART_PX = 2;
const EMPTY = -1;

export const darken = (color: number, f: number) =>
    (Math.round(((color >> 16) & 255) * f) << 16) | (Math.round(((color >> 8) & 255) * f) << 8) | Math.round((color & 255) * f);

export class PixelSprite {
    private readonly px: Int32Array;

    constructor(readonly w: number, readonly h: number) {
        this.px = new Int32Array(w * h).fill(EMPTY);
    }

    get(x: number, y: number) {
        if (x < 0 || y < 0 || x >= this.w || y >= this.h) return EMPTY;
        return this.px[y * this.w + x] ?? EMPTY;
    }

    set(color: number, x: number, y: number) {
        if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
        this.px[y * this.w + x] = color;
    }

    rect(color: number, x: number, y: number, w: number, h: number) {
        for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(color, i, j);
    }

    // Rectangle with its corners cut by `r` pixels, so it reads as rounded.
    box(color: number, x: number, y: number, w: number, h: number, r = 1) {
        for (let j = 0; j < h; j++) {
            const inset = Math.max(0, r - Math.min(j, h - 1 - j));
            this.rect(color, x + inset, y + j, w - inset * 2, 1);
        }
    }

    ellipse(color: number, cx: number, cy: number, rx: number, ry: number) {
        for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
            for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
                const dx = (x + 0.5 - cx) / rx;
                const dy = (y + 0.5 - cy) / ry;
                if (dx * dx + dy * dy <= 1) this.set(color, x, y);
            }
        }
    }

    // Recolours only pixels already painted, so shading keeps rounded corners.
    shade(color: number, x: number, y: number, w: number, h: number) {
        for (let j = y; j < y + h; j++) {
            for (let i = x; i < x + w; i++) if (this.get(i, j) !== EMPTY) this.set(color, i, j);
        }
    }

    // A tapered leaf from (x, y) along `angle` (degrees, -90 is straight up), drooping at the
    // tip. Each leaf gets its own edge, so overlapping leaves stay readable.
    leaf(color: number, edge: number, x: number, y: number, angle: number, length: number, width: number, vein?: number) {
        const rad = (angle * Math.PI) / 180;
        const droop = Math.abs(Math.cos(rad)) * length * 0.35;
        const at = (t: number) => ({ cx: x + Math.cos(rad) * length * t, cy: y + Math.sin(rad) * length * t + droop * t * t });
        for (const [fill, grow] of [[edge, 1], [color, 0]] as const) {
            for (let t = 0; t <= 1; t += 0.04) {
                const { cx, cy } = at(t);
                const r = Math.max(0.5, width * Math.sin(Math.PI * Math.min(1, t * 1.15))) + grow;
                this.ellipse(fill, cx, cy, r, r);
            }
        }
        if (vein === undefined) return;
        for (let t = 0.2; t <= 0.75; t += 0.08) {
            const { cx, cy } = at(t);
            this.set(vein, Math.floor(cx), Math.floor(cy));
        }
    }

    // One-pixel outline around everything painted so far. The colour can depend on the
    // pixel it borders, so leaves get a dark green edge and a pot a grey one.
    outline(color: number | ((neighbour: number) => number)) {
        const src = this.px.slice();
        const at = (x: number, y: number) =>
            x < 0 || y < 0 || x >= this.w || y >= this.h ? EMPTY : (src[y * this.w + x] ?? EMPTY);
        for (let y = 0; y < this.h; y++) {
            for (let x = 0; x < this.w; x++) {
                if (at(x, y) !== EMPTY) continue;
                const near = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].find((c) => c !== EMPTY);
                if (near !== undefined) this.set(typeof color === "number" ? color : color(near), x, y);
            }
        }
    }

    // Rows [fromRow, toRow) become a texture; a sofa seen from behind is split in two
    // so the seat draws behind a seated avatar and the backrest in front of it.
    bake(scene: Phaser.Scene, key: string, opts: { mirror?: boolean; fromRow?: number; toRow?: number } = {}) {
        const { mirror = false, fromRow = 0, toRow = this.h } = opts;
        const canvas = document.createElement("canvas");
        canvas.width = this.w * ART_PX;
        canvas.height = (toRow - fromRow) * ART_PX;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        for (let y = fromRow; y < toRow; y++) {
            for (let x = 0; x < this.w; ) {
                const color = this.get(x, y);
                let run = 1;
                while (x + run < this.w && this.get(x + run, y) === color) run++;
                if (color !== EMPTY) {
                    ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
                    const left = mirror ? this.w - x - run : x;
                    ctx.fillRect(left * ART_PX, (y - fromRow) * ART_PX, run * ART_PX, ART_PX);
                }
                x += run;
            }
        }
        if (scene.textures.exists(key)) scene.textures.remove(key);
        scene.textures.addCanvas(key, canvas);
    }
}

export type Upholstery = { hi: number; base: number; shade: number; deep: number; line: number };

const UPHOLSTERY = {
    tan: { hi: 0xdcaa7c, base: 0xc18b5e, shade: 0xa06c46, deep: 0x845537, line: 0x4f3222 },
    sage: { hi: 0xadc39b, base: 0x8ca57b, shade: 0x708a62, deep: 0x5a714f, line: 0x33432d },
} satisfies Record<string, Upholstery>;

export type SofaColor = keyof typeof UPHOLSTERY;

const PILLOWS: Record<SofaColor, [number, number]> = {
    tan: [0xeeeae2, 0xf08a3c],
    sage: [0xf2c14e, 0xeeeae2],
};

const WOOD = { hi: 0xf4ddb5, top: 0xe6c390, edge: 0xc49a64, dark: 0x8f6a3f, line: 0x5e4228 };
const SHELF = { top: 0x737d8c, base: 0x545d6c, edge: 0x444c59, back: 0x30363f, inner: 0x252a32, line: 0x1e2229 };
const POT = { rim: 0xf8f9fa, base: 0xe7eaee, shade: 0xc5ccd4, soil: 0x6b4a33 };
const LEAF = { back: 0x3f8a4a, front: 0x5aab55, light: 0x7cc56a, vein: 0x9ed98a, edge: 0x2b5a31 };

const RUG_COLORS = {
    gray: { base: 0x9fa7a9, stripe: 0x939b9d, edge: 0x7c8486, inner: 0xb1b8ba },
    blue: { base: 0xa4afbf, stripe: 0x98a3b4, edge: 0x7e899b, inner: 0xb7c0cd },
};
export type RugColor = keyof typeof RUG_COLORS;

const BEANBAGS = {
    blue: { hi: 0x9cc0f4, base: 0x5f92e2, shade: 0x426fc4, line: 0x24407c },
    purple: { hi: 0xc9adf4, base: 0xa07ae2, shade: 0x7d58c2, line: 0x45306f },
    pink: { hi: 0xf7b3d0, base: 0xe877aa, shade: 0xc7548c, line: 0x7a2c55 },
};
export type BeanbagColor = keyof typeof BEANBAGS;

// Seats are 16 art pixels each; the arms reach 3 art pixels past the seats on each side.
const sofaWidth = (seats: number) => seats * 16 + 6;
const seatEdges = (seats: number, from: number, span: number) =>
    Array.from({ length: seats + 1 }, (_, i) => from + Math.round((span * i) / seats));

function pillow(s: PixelSprite, color: number, x: number, y: number) {
    s.box(darken(color, 0.7), x, y, 7, 7, 2);
    s.box(color, x + 1, y + 1, 5, 5, 1);
    s.rect(darken(color, 0.86), x + 1, y + 5, 5, 1);
}

// Sofa seen from the front (people sitting on it face down the screen).
function sofaFront(u: Upholstery, seats: number, pillows: [number, number]) {
    const W = sofaWidth(seats);
    const s = new PixelSprite(W, 26);
    const L = 1, R = W - 2, arm = 5;
    const seatL = L + arm, span = R - arm - seatL + 1;
    const edges = seatEdges(seats, seatL, span);

    s.box(u.shade, L + 1, 1, W - 4, 14, 2);
    for (let i = 0; i < seats; i++) {
        const x0 = edges[i]!, w = edges[i + 1]! - x0;
        s.box(u.base, x0, 2, w, 11, 2);
        s.rect(u.hi, x0 + 1, 3, w - 2, 2);
        s.rect(u.shade, x0 + 1, 11, w - 2, 1);
        s.box(u.hi, x0, 13, w, 3, 1);
        s.rect(u.base, x0, 16, w, 2);
        s.rect(u.shade, x0, 18, w, 1);
        if (i > 0) {
            s.rect(u.deep, x0, 3, 1, 9);
            s.rect(u.deep, x0, 13, 1, 6);
        }
    }
    s.rect(u.shade, seatL, 19, span, 3);
    s.rect(u.deep, seatL, 21, span, 1);
    pillow(s, pillows[0], seatL + 1, 7);
    pillow(s, pillows[1], seatL + span - 8, 7);
    for (const x of [L, R - arm + 1]) {
        s.box(u.base, x, 7, arm, 16, 2);
        s.rect(u.hi, x + 1, 8, arm - 2, 3);
        s.shade(u.shade, x, 19, arm, 4);
    }
    s.rect(u.deep, L + arm - 1, 10, 1, 12);
    s.rect(u.deep, R - arm + 1, 10, 1, 12);
    s.rect(u.line, L + 1, 23, 2, 2);
    s.rect(u.line, R - 2, 23, 2, 2);
    s.outline(u.line);
    return s;
}

// Rows above this belong to the seat (drawn behind a seated avatar); the rest is the backrest.
const SOFA_BACK_SPLIT = 8;

// Sofa seen from behind (people sitting on it face up the screen).
function sofaBack(u: Upholstery, seats: number) {
    const W = sofaWidth(seats);
    const s = new PixelSprite(W, 23);
    const L = 1, R = W - 2, arm = 5;
    const seatL = L + arm, span = R - arm - seatL + 1;
    const edges = seatEdges(seats, seatL, span);

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
    // Backrest: a rounded top roll over a panel, with the arm ends a shade darker.
    const B = SOFA_BACK_SPLIT;
    s.box(u.base, L, B, W - 2, 12, 2);
    s.shade(u.hi, L, B, W - 2, 3);
    s.shade(u.shade, L, B + 3, W - 2, 1);
    s.shade(u.shade, L, B + 4, arm, 6);
    s.shade(u.shade, R - arm + 1, B + 4, arm, 6);
    for (const x of edges.slice(1, -1)) s.shade(u.shade, x, B + 5, 1, 4);
    s.shade(u.shade, L, B + 9, W - 2, 2);
    s.shade(u.deep, L, B + 11, W - 2, 1);
    s.rect(u.line, L + 1, 20, 2, 2);
    s.rect(u.line, R - 2, 20, 2, 2);
    s.outline(u.line);
    return s;
}

function beanbag(c: (typeof BEANBAGS)[BeanbagColor]) {
    const s = new PixelSprite(16, 14);
    s.ellipse(c.base, 8, 8, 7, 5);
    s.ellipse(c.base, 5.5, 6, 4.5, 4);
    s.ellipse(c.hi, 5, 4.5, 2.6, 1.5);
    s.ellipse(c.shade, 10, 8.4, 3.2, 2.1);
    s.shade(c.shade, 0, 11, 16, 2);
    s.outline(c.line);
    return s;
}

function coffeeTable() {
    const s = new PixelSprite(36, 16);
    s.rect(WOOD.dark, 8, 10, 2, 5);
    s.rect(WOOD.dark, 26, 10, 2, 5);
    s.ellipse(WOOD.edge, 18, 8.2, 16.5, 5.4);
    s.ellipse(WOOD.top, 18, 6.8, 16.5, 5);
    s.ellipse(WOOD.hi, 12, 5, 6, 1.4);
    // A book and a small potted succulent on top.
    s.rect(0x5f86d0, 7, 6, 6, 3);
    s.rect(0x8fb0ec, 7, 6, 6, 1);
    s.rect(0xb26a3f, 21, 5, 4, 3);
    s.rect(0x8c4f2d, 21, 7, 4, 1);
    s.ellipse(LEAF.front, 23, 4, 2.4, 1.6);
    s.set(LEAF.light, 22, 3);
    s.outline((near) => (near === LEAF.front || near === LEAF.light ? 0x2d5a33 : WOOD.line));
    return s;
}

function sideTable(item: "lamp" | "vase") {
    const s = new PixelSprite(14, 17);
    s.rect(WOOD.dark, 2, 11, 2, 5);
    s.rect(WOOD.dark, 10, 11, 2, 5);
    s.box(WOOD.edge, 1, 7, 12, 6, 1);
    s.box(WOOD.top, 1, 7, 12, 4, 1);
    s.rect(WOOD.hi, 2, 8, 5, 1);
    if (item === "lamp") {
        s.rect(0x8a8f99, 5, 6, 4, 1);
        s.rect(0x6d727c, 6, 4, 2, 2);
        s.rect(0xf6e7c8, 5, 1, 4, 1);
        s.rect(0xf6e7c8, 4, 2, 6, 2);
        s.rect(0xe3cfa6, 4, 3, 6, 1);
    } else {
        s.ellipse(POT.base, 7, 5, 2.3, 2.2);
        s.rect(POT.rim, 6, 2, 2, 2);
        s.set(POT.shade, 8, 6);
        s.set(LEAF.front, 6, 1);
        s.set(LEAF.light, 8, 0);
        s.set(LEAF.front, 5, 0);
        s.set(0xe56b6f, 7, 0);
    }
    s.outline((near) => darken(near, 0.55));
    return s;
}

// Dark cube shelf, 4 x 3 cubbies with books, plants, boxes and a globe.
function cubeShelf() {
    const s = new PixelSprite(33, 31);
    s.box(SHELF.base, 1, 1, 31, 28, 1);
    s.shade(SHELF.top, 1, 1, 31, 3);
    s.shade(SHELF.edge, 1, 28, 31, 1);
    const cols = [3, 10, 17, 24];
    const rows = [5, 13, 21];
    const books = (x: number, y: number, colors: number[]) =>
        colors.forEach((color, i) => {
            const tall = 4 + ((i * 7 + x) % 3);
            s.rect(color, x + i, y + 7 - tall, 1, tall);
        });
    const items: ((x: number, y: number) => void)[] = [
        (x, y) => books(x + 1, y, [0x5b8de0, 0xe9edf2, 0x8f9aab, 0x4fb3a5]),
        (x, y) => { s.rect(POT.base, x + 2, y + 4, 3, 3); s.ellipse(LEAF.front, x + 3.5, y + 3, 2.4, 1.8); s.set(LEAF.light, x + 2, y + 2); },
        (x, y) => { s.rect(0xd6dce3, x + 1, y + 3, 4, 4); s.rect(0xf1f4f7, x + 1, y + 3, 4, 1); },
        (x, y) => books(x, y, [0xe0a14a, 0x5b8de0, 0xe9edf2, 0x5a6476, 0x8fb0ec]),
        (x, y) => { s.ellipse(0x5b9bd5, x + 3, y + 3.5, 2, 2); s.set(LEAF.front, x + 2, y + 3); s.set(LEAF.front, x + 3, y + 2); s.rect(0x9aa3b2, x + 2, y + 6, 3, 1); },
        (x, y) => books(x + 2, y, [0x4fb3a5, 0xe9edf2, 0x5b8de0]),
        (x, y) => { s.rect(0xe6d6ae, x + 1, y + 2, 4, 5); s.rect(0x8fb4d8, x + 2, y + 3, 2, 3); },
        (x, y) => { s.rect(POT.base, x + 2, y + 4, 3, 3); s.ellipse(LEAF.back, x + 3.5, y + 2.6, 2.6, 2); s.set(LEAF.light, x + 4, y + 2); },
        (x, y) => books(x, y, [0x8f9aab, 0xe9edf2, 0xe0a14a, 0x5b8de0]),
        (x, y) => { s.rect(0xd6dce3, x, y + 4, 6, 3); s.rect(0xf1f4f7, x, y + 4, 6, 1); s.rect(0x5b8de0, x + 1, y + 2, 4, 2); },
        (x, y) => books(x + 1, y, [0x5a6476, 0x4fb3a5, 0xe9edf2, 0x8fb0ec]),
        (x, y) => { s.rect(0xe9edf2, x + 2, y + 4, 2, 3); s.rect(0x4fb3a5, x + 1, y + 3, 4, 1); },
    ];
    rows.forEach((y, r) => cols.forEach((x, c) => {
        s.rect(SHELF.back, x, y, 6, 7);
        s.rect(SHELF.inner, x, y, 6, 1);
        items[r * cols.length + c]?.(x, y);
    }));
    s.outline(SHELF.line);
    return s;
}

// Leafy plant in a white ceramic pot. `scale` 1 is the big lounge plant.
export function leafyPlant(w: number, h: number, scale: number) {
    const s = new PixelSprite(w, h);
    const cx = w / 2;
    const potW = Math.max(4, Math.round(8 * scale));
    const potH = Math.max(3, Math.round(7 * scale));
    // Rim (2 rows), then the pot body, then one free row for the outline.
    const potTop = h - 3 - potH;
    const potL = Math.round(cx - potW / 2);
    const thick = Math.max(0.7, scale);
    // [angle, length, width, colour], back leaves first so the front ones overlap them.
    const big: [number, number, number, number][] = [
        [-148, 12, 2.6, LEAF.back], [-32, 12, 2.6, LEAF.back], [-106, 14, 2.6, LEAF.back], [-74, 14, 2.6, LEAF.back],
        [-172, 11, 2.4, LEAF.front], [-8, 11, 2.4, LEAF.front],
        [-130, 14, 2.8, LEAF.front], [-50, 14, 2.8, LEAF.front], [-90, 15, 2.6, LEAF.light],
    ];
    const small: [number, number, number, number][] = [
        [-150, 9, 2.6, LEAF.back], [-30, 9, 2.6, LEAF.back],
        [-118, 11, 3, LEAF.front], [-62, 11, 3, LEAF.front], [-90, 10, 2.8, LEAF.light],
    ];
    for (const [angle, length, width, color] of scale < 0.6 ? small : big) {
        // Shorten a leaf rather than let the canvas edge cut its tip off.
        const rad = (angle * Math.PI) / 180;
        const fit = Math.min(
            (w / 2 - 2.5) / Math.max(0.2, Math.abs(Math.cos(rad))),
            (potTop - 2) / Math.max(0.2, Math.abs(Math.sin(rad))),
        );
        s.leaf(color, LEAF.edge, cx, potTop + 1, angle, Math.min(length * scale, fit), width * thick, color === LEAF.back ? undefined : LEAF.vein);
    }
    const potLine = 0x8f99a3;
    s.box(potLine, potL - 1, potTop + 1, potW + 2, potH + 2, 1);
    s.box(POT.base, potL, potTop + 2, potW, potH, 1);
    s.shade(POT.shade, potL + potW - 2, potTop + 2, 2, potH);
    s.box(potLine, potL - 2, potTop - 1, potW + 4, 4, 1);
    s.rect(POT.rim, potL - 1, potTop, potW + 2, 2);
    s.rect(POT.soil, potL, potTop, potW, 1);
    return s;
}

function rug(tilesW: number, tilesH: number, c: (typeof RUG_COLORS)[RugColor]) {
    const W = tilesW * 16, H = tilesH * 16;
    const s = new PixelSprite(W, H);
    s.box(c.edge, 0, 0, W, H, 1);
    s.box(c.base, 1, 1, W - 2, H - 2, 1);
    s.rect(c.inner, 3, 3, W - 6, 1);
    s.rect(c.inner, 3, H - 4, W - 6, 1);
    s.rect(c.inner, 3, 3, 1, H - 6);
    s.rect(c.inner, W - 4, 3, 1, H - 6);
    // Woven look: thin vertical stripes with a one-pixel zigzag.
    for (let y = 5; y < H - 5; y++) {
        for (let x = 8; x < W - 6; x += 6) s.set(c.stripe, x + ((y >> 1) & 1), y);
    }
    return s;
}

export const sofaKey = (color: SofaColor, seats: number, view: "front" | "back-seat" | "back-rest") => `sofa-${color}-${seats}-${view}`;
export const beanbagKey = (color: BeanbagColor, facing: "left" | "right") => `beanbag-${color}-${facing}`;
export const rugKey = (color: RugColor) => `rug-${color}`;

// Textures that replace the old plant images: same heights, one tile wide (the old images
// were a few pixels narrower), so layouts don't move.
export const GENERATED_PLANT_KEYS = ["plant-tall", "plant-fern"];

export function makeLoungeTextures(scene: Phaser.Scene) {
    for (const color of Object.keys(UPHOLSTERY) as SofaColor[]) {
        const u = UPHOLSTERY[color];
        sofaFront(u, 2, PILLOWS[color]).bake(scene, sofaKey(color, 2, "front"));
        const back = sofaBack(u, 2);
        back.bake(scene, sofaKey(color, 2, "back-seat"), { toRow: SOFA_BACK_SPLIT });
        back.bake(scene, sofaKey(color, 2, "back-rest"), { fromRow: SOFA_BACK_SPLIT });
    }
    for (const color of Object.keys(BEANBAGS) as BeanbagColor[]) {
        const bag = beanbag(BEANBAGS[color]);
        bag.bake(scene, beanbagKey(color, "right"));
        bag.bake(scene, beanbagKey(color, "left"), { mirror: true });
    }
    for (const color of Object.keys(RUG_COLORS) as RugColor[]) rug(8, 7, RUG_COLORS[color]).bake(scene, rugKey(color));
    coffeeTable().bake(scene, "coffee-oval");
    sideTable("lamp").bake(scene, "side-table-lamp");
    sideTable("vase").bake(scene, "side-table-vase");
    cubeShelf().bake(scene, "cube-shelf");
    leafyPlant(26, 30, 1).bake(scene, "plant-leafy");
    leafyPlant(16, 22, 0.72).bake(scene, "plant-tall");
    leafyPlant(16, 14, 0.5).bake(scene, "plant-fern");
}
