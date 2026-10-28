// The Clario HQ office as plain data. The 2D map (Phaser) and the 3D view (three.js)
// are both drawn from this file, so they always show the same office.
// Units are tiles; x grows to the right, y grows down. Room names and chat zones live
// in @repo/shared (map-templates) because the server needs them too.

export type Dir = "up" | "down" | "left" | "right";

export const HQ_COLS = 62;
export const HQ_ROWS = 36;

export type FloorKind =
  | "wood" | "carpet" | "tile" | "herringbone" | "terrazzo" | "sage" | "arcade" | "sand" | "office"
  | "raised" | "concrete" | "teal";

// Drawn in order, so later floors sit on top of earlier ones. Every area has its own floor, and
// the plain wood left between them is the corridor and the open commons in the middle.
// The Tech Wing (x 46-58) is the east end: Server Room, Maker Lab, Demo Stage and Hack Space.
export const HQ_FLOORS: { x: number; y: number; w: number; h: number; kind: FloorKind }[] = [
  { x: 2, y: 2, w: 58, h: 31, kind: "wood" },
  { x: 3, y: 4, w: 11, h: 8, kind: "carpet" },
  { x: 15, y: 4, w: 6, h: 8, kind: "sand" },
  { x: 22, y: 4, w: 6, h: 8, kind: "sand" },
  { x: 29, y: 4, w: 8, h: 8, kind: "carpet" },
  { x: 38, y: 4, w: 7, h: 8, kind: "tile" },
  { x: 3, y: 15, w: 17, h: 8, kind: "office" },
  { x: 28, y: 15, w: 17, h: 8, kind: "herringbone" },
  { x: 3, y: 26, w: 12, h: 6, kind: "sage" },
  { x: 16, y: 24, w: 16, h: 8, kind: "terrazzo" },
  { x: 33, y: 26, w: 12, h: 6, kind: "arcade" },
  { x: 46, y: 4, w: 6, h: 8, kind: "raised" },
  { x: 53, y: 4, w: 6, h: 8, kind: "concrete" },
  { x: 46, y: 15, w: 13, h: 8, kind: "carpet" },
  { x: 46, y: 26, w: 13, h: 6, kind: "teal" },
];

// Walls seen from the front: two rows deep (rows y and y+1), drawn as a tall face.
// `doors` are inclusive [from, to] column ranges left open.
export type WallStyle = "exterior" | "corridor" | "library" | "game";
export const HQ_TALL_WALLS: { x1: number; x2: number; y: number; doors: [number, number][]; style: WallStyle }[] = [
  { x1: 2, x2: 59, y: 2, doors: [], style: "exterior" },
  { x1: 2, x2: 59, y: 12, doors: [[7, 8], [17, 18], [24, 25], [32, 33], [40, 41], [48, 49], [55, 56]], style: "corridor" },
  { x1: 2, x2: 15, y: 24, doors: [[8, 9]], style: "library" },
  { x1: 32, x2: 45, y: 24, doors: [[38, 39]], style: "game" },
  // Starts on the Game Room's side wall (x 45) so the two runs meet without a gap.
  { x1: 45, x2: 59, y: 24, doors: [[51, 52]], style: "corridor" },
];

// Walls seen from above: one tile wide, drawn as a thin top edge.
export const HQ_THIN_WALLS: { x1: number; y1: number; x2: number; y2: number; gaps?: [number, number][] }[] = [
  { x1: 2, y1: 4, x2: 2, y2: 11 },
  { x1: 2, y1: 14, x2: 2, y2: 23 },
  { x1: 2, y1: 26, x2: 2, y2: 32 },
  { x1: 45, y1: 4, x2: 45, y2: 11 },
  // The Lounge opens onto the Demo Stage.
  { x1: 45, y1: 14, x2: 45, y2: 23, gaps: [[17, 20]] },
  { x1: 45, y1: 26, x2: 45, y2: 31 },
  { x1: 59, y1: 4, x2: 59, y2: 11 },
  { x1: 59, y1: 14, x2: 59, y2: 23 },
  { x1: 59, y1: 26, x2: 59, y2: 32 },
  { x1: 3, y1: 32, x2: 58, y2: 32, gaps: [[22, 25]] },
  { x1: 52, y1: 4, x2: 52, y2: 11 },
  { x1: 14, y1: 4, x2: 14, y2: 11 },
  { x1: 21, y1: 4, x2: 21, y2: 11 },
  { x1: 28, y1: 4, x2: 28, y2: 11 },
  { x1: 37, y1: 4, x2: 37, y2: 11 },
  { x1: 15, y1: 26, x2: 15, y2: 31 },
  { x1: 32, y1: 26, x2: 32, y2: 31 },
];

// Things hung on a tall wall's face. `x` and `w` may be fractional; `wallY` is the wall's first row.
// A neon sign says PLAY, or HACK with variant 1.
export type WallDecorKind = "window" | "tv" | "whiteboard" | "art" | "clock" | "cabinets" | "logo" | "shelf" | "neon";
export const HQ_WALL_DECOR: { kind: WallDecorKind; x: number; w: number; wallY: number; variant?: number }[] = [
  { kind: "window", x: 3.6, w: 2.2, wallY: 2 },
  { kind: "tv", x: 6.5, w: 3, wallY: 2 },
  { kind: "window", x: 10.2, w: 2.2, wallY: 2 },
  { kind: "window", x: 17.2, w: 1.6, wallY: 2 },
  { kind: "window", x: 24.2, w: 1.6, wallY: 2 },
  { kind: "whiteboard", x: 29.6, w: 1.8, wallY: 2 },
  { kind: "tv", x: 31.5, w: 3, wallY: 2 },
  { kind: "cabinets", x: 39, w: 5, wallY: 2 },
  // The corridor wall faces the open floor, so it stays quiet: two prints and the logo.
  { kind: "art", x: 11.4, w: 2.4, wallY: 12, variant: 1 },
  { kind: "logo", x: 26.6, w: 4.8, wallY: 12 },
  { kind: "art", x: 35.4, w: 2.4, wallY: 12, variant: 2 },
  { kind: "clock", x: 7, w: 1, wallY: 24 },
  { kind: "neon", x: 36, w: 1.9, wallY: 24 },
  { kind: "tv", x: 40.6, w: 3.2, wallY: 24 },
  // Tech Wing
  { kind: "window", x: 54.2, w: 1.6, wallY: 2 },
  { kind: "shelf", x: 56.4, w: 2.4, wallY: 2 },
  { kind: "tv", x: 50.2, w: 4.6, wallY: 12 },
  { kind: "whiteboard", x: 46.4, w: 2.4, wallY: 24 },
  { kind: "neon", x: 54, w: 2.2, wallY: 24, variant: 1 },
];

export type RugStyle = "meeting" | "focus" | "lounge" | "round" | "library" | "game" | "stage";
export const HQ_RUGS: { x: number; y: number; w: number; h: number; style: RugStyle }[] = [
  { x: 4, y: 5, w: 8, h: 6, style: "meeting" },
  { x: 30, y: 5, w: 6, h: 6, style: "meeting" },
  { x: 15.5, y: 8.3, w: 4, h: 2.9, style: "focus" },
  { x: 22.5, y: 8.3, w: 4, h: 2.9, style: "focus" },
  { x: 29, y: 15.5, w: 7, h: 4.5, style: "lounge" },
  { x: 37.5, y: 15.6, w: 6, h: 5.4, style: "round" },
  { x: 6, y: 27.6, w: 6, h: 3.9, style: "library" },
  { x: 33.6, y: 27.4, w: 4.8, h: 3.4, style: "game" },
  { x: 48.5, y: 15, w: 8, h: 2.6, style: "stage" },
];

export type Fabric = "navy" | "coral" | "teal" | "mustard" | "sage" | "grey";

export type ItemKind =
  | "desk-l" | "desk-r" | "task-chair"
  | "meeting-table" | "meeting-table-sm" | "meet-chair"
  | "sofa" | "armchair" | "beanbag" | "coffee-table" | "side-table" | "tv-console"
  | "bookshelf" | "plant-big" | "plant-small" | "plant-tree" | "floor-lamp"
  | "fridge" | "counter" | "counter-sink" | "counter-micro" | "counter-coffee" | "water-cooler"
  | "cafe-table" | "cafe-chair"
  | "reception-desk" | "pingpong" | "arcade" | "foosball"
  | "server-rack" | "printer-3d" | "robot-arm" | "workbench" | "podium" | "vr-station";

// w/h: the tiles the item stands on. Seats are walkable and let you sit; everything else blocks.
export const ITEM_SPECS: Record<ItemKind, { w: number; h: number; seat?: boolean }> = {
  "desk-l": { w: 2, h: 1 },
  "desk-r": { w: 2, h: 1 },
  "task-chair": { w: 1, h: 1, seat: true },
  "meeting-table": { w: 6, h: 2 },
  "meeting-table-sm": { w: 4, h: 2 },
  "meet-chair": { w: 1, h: 1, seat: true },
  sofa: { w: 3, h: 1, seat: true },
  armchair: { w: 1, h: 1, seat: true },
  beanbag: { w: 1, h: 1, seat: true },
  "coffee-table": { w: 3, h: 1 },
  "side-table": { w: 1, h: 1 },
  "tv-console": { w: 3, h: 1 },
  bookshelf: { w: 2, h: 1 },
  "plant-big": { w: 1, h: 1 },
  "plant-small": { w: 1, h: 1 },
  "plant-tree": { w: 1, h: 1 },
  "floor-lamp": { w: 1, h: 1 },
  fridge: { w: 1, h: 1 },
  counter: { w: 1, h: 1 },
  "counter-sink": { w: 1, h: 1 },
  "counter-micro": { w: 1, h: 1 },
  "counter-coffee": { w: 1, h: 1 },
  "water-cooler": { w: 1, h: 1 },
  "cafe-table": { w: 2, h: 1 },
  "cafe-chair": { w: 1, h: 1, seat: true },
  "reception-desk": { w: 4, h: 2 },
  pingpong: { w: 3, h: 2 },
  arcade: { w: 1, h: 1 },
  foosball: { w: 2, h: 1 },
  "server-rack": { w: 1, h: 1 },
  "printer-3d": { w: 1, h: 1 },
  "robot-arm": { w: 1, h: 1 },
  workbench: { w: 2, h: 1 },
  podium: { w: 1, h: 1 },
  "vr-station": { w: 1, h: 1 },
};

export type HqItem = { kind: ItemKind; x: number; y: number; dir?: Dir; fabric?: Fabric };

const row = (kind: ItemKind, xs: number[], y: number, dir: Dir, fabric?: Fabric): HqItem[] =>
  xs.map((x) => ({ kind, x, y, dir, fabric }));

const pod = (x: number, y: number): HqItem[] => [
  { kind: "desk-l", x, y },
  { kind: "desk-r", x: x + 2, y },
  { kind: "task-chair", x, y: y + 1, dir: "up" },
  { kind: "task-chair", x: x + 3, y: y + 1, dir: "up" },
];

const readingNook = (x: number, y: number, fabric: Fabric): HqItem[] => [
  { kind: "armchair", x, y, dir: "right", fabric },
  { kind: "side-table", x: x + 1, y },
  { kind: "armchair", x: x + 2, y, dir: "left", fabric },
];

// One idea per room, with open floor around it. Desks, tables and sofas stand on rugs or
// against walls; plants mark corners and doors instead of filling every gap.
export const HQ_ITEMS: HqItem[] = [
  // Meeting Room 1: one table for eight.
  { kind: "meeting-table-sm", x: 6, y: 7 },
  ...row("meet-chair", [6, 7, 8, 9], 6, "down", "navy"),
  ...row("meet-chair", [6, 7, 8, 9], 9, "up", "navy"),
  { kind: "plant-big", x: 3, y: 4 },
  { kind: "plant-big", x: 13, y: 4 },

  // Focus Room 1: a desk under the window wall and a reading corner.
  { kind: "desk-l", x: 15, y: 4 },
  { kind: "task-chair", x: 15, y: 5, dir: "up" },
  { kind: "bookshelf", x: 19, y: 4 },
  ...readingNook(16, 9, "teal"),
  { kind: "plant-small", x: 20, y: 11 },

  // Focus Room 2 (Maya stands in the middle, at 24,7).
  { kind: "bookshelf", x: 22, y: 4 },
  { kind: "desk-r", x: 26, y: 4 },
  { kind: "task-chair", x: 27, y: 5, dir: "up" },
  ...readingNook(23, 9, "mustard"),
  { kind: "plant-small", x: 27, y: 11 },

  // Meeting Room 2
  { kind: "meeting-table-sm", x: 31, y: 7 },
  ...row("meet-chair", [31, 32, 33, 34], 6, "down", "coral"),
  ...row("meet-chair", [31, 32, 33, 34], 9, "up", "coral"),
  { kind: "plant-big", x: 36, y: 4 },

  // Kitchen: the counter run on the back wall and one table.
  { kind: "fridge", x: 38, y: 4 },
  { kind: "counter", x: 39, y: 4 },
  { kind: "counter-sink", x: 40, y: 4 },
  { kind: "counter", x: 41, y: 4 },
  { kind: "counter-micro", x: 42, y: 4 },
  { kind: "counter-coffee", x: 43, y: 4 },
  { kind: "water-cooler", x: 44, y: 4 },
  { kind: "cafe-table", x: 40, y: 8 },
  ...row("cafe-chair", [40, 41], 7, "down"),
  ...row("cafe-chair", [40, 41], 9, "up"),
  { kind: "plant-big", x: 44, y: 10 },

  // Open Desks: four pods with wide aisles between them.
  ...pod(6, 16), ...pod(13, 16),
  ...pod(6, 20), ...pod(13, 20),
  { kind: "plant-tree", x: 3, y: 15 },
  { kind: "water-cooler", x: 19, y: 22 },

  // The commons between Open Desks and the Lounge stays open; two trees mark it.
  { kind: "plant-tree", x: 20, y: 15 },
  { kind: "plant-tree", x: 27, y: 15 },

  // Lounge: a TV corner and a round conversation rug.
  { kind: "tv-console", x: 31, y: 15 },
  { kind: "coffee-table", x: 31, y: 17 },
  { kind: "sofa", x: 31, y: 18, dir: "up", fabric: "coral" },
  { kind: "armchair", x: 30, y: 17, dir: "right", fabric: "mustard" },
  { kind: "armchair", x: 34, y: 17, dir: "left", fabric: "mustard" },
  { kind: "sofa", x: 39, y: 16, dir: "down", fabric: "teal" },
  { kind: "side-table", x: 40, y: 18 },
  { kind: "armchair", x: 38, y: 18, dir: "right", fabric: "sage" },
  { kind: "armchair", x: 42, y: 18, dir: "left", fabric: "sage" },
  { kind: "floor-lamp", x: 36, y: 16 },
  { kind: "plant-big", x: 44, y: 15 },

  // Library: shelves either side of the door and a study table.
  { kind: "bookshelf", x: 3, y: 26 },
  { kind: "bookshelf", x: 5, y: 26 },
  { kind: "bookshelf", x: 11, y: 26 },
  { kind: "bookshelf", x: 13, y: 26 },
  { kind: "cafe-table", x: 8, y: 29 },
  ...row("cafe-chair", [8, 9], 28, "down"),
  ...row("cafe-chair", [8, 9], 30, "up"),
  { kind: "floor-lamp", x: 3, y: 29 },
  { kind: "plant-big", x: 14, y: 30 },

  // Reception
  { kind: "reception-desk", x: 22, y: 26 },
  { kind: "task-chair", x: 23, y: 25, dir: "down" },
  { kind: "sofa", x: 17, y: 27, dir: "down", fabric: "navy" },
  { kind: "coffee-table", x: 17, y: 28 },
  { kind: "sofa", x: 28, y: 27, dir: "down", fabric: "navy" },
  { kind: "coffee-table", x: 28, y: 28 },
  { kind: "plant-big", x: 16, y: 25 },
  { kind: "plant-big", x: 31, y: 25 },

  // Game Room: arcade row on the back wall, ping-pong on its rug, foosball, and a sofa for the TV.
  { kind: "arcade", x: 33, y: 26 },
  { kind: "arcade", x: 34, y: 26 },
  { kind: "arcade", x: 35, y: 26 },
  { kind: "pingpong", x: 34, y: 28 },
  { kind: "foosball", x: 39, y: 28 },
  { kind: "sofa", x: 41, y: 30, dir: "up", fabric: "grey" },
  { kind: "beanbag", x: 44, y: 29, dir: "left", fabric: "coral" },
  { kind: "plant-big", x: 44, y: 26 },

  // Server Room: two rows of racks with a cold aisle between, and the console by the door.
  ...row("server-rack", [46, 47, 48, 50, 51], 4, "down"),
  ...row("server-rack", [46, 47, 48, 50, 51], 7, "down"),
  { kind: "desk-r", x: 46, y: 10 },
  { kind: "task-chair", x: 47, y: 11, dir: "up" },

  // Maker Lab: printers and the electronics bench on the back wall, the robot arm in the middle.
  { kind: "printer-3d", x: 53, y: 4 },
  { kind: "printer-3d", x: 54, y: 4 },
  { kind: "workbench", x: 57, y: 6 },
  { kind: "task-chair", x: 57, y: 7, dir: "up" },
  { kind: "robot-arm", x: 55, y: 8 },
  { kind: "plant-small", x: 53, y: 11 },

  // Demo Stage: a podium on the stage under the big screen, and two rows of seats.
  { kind: "podium", x: 52, y: 16 },
  ...row("meet-chair", [48, 49, 50, 54, 55, 56], 19, "up", "navy"),
  ...row("meet-chair", [48, 49, 50, 54, 55, 56], 21, "up", "navy"),
  { kind: "plant-tree", x: 46, y: 15 },
  { kind: "plant-tree", x: 58, y: 15 },

  // Hack Space: two hack pods, a VR station and somewhere to sprawl.
  ...pod(47, 27), ...pod(52, 27),
  { kind: "vr-station", x: 57, y: 27 },
  { kind: "beanbag", x: 48, y: 30, dir: "up", fabric: "coral" },
  { kind: "beanbag", x: 50, y: 30, dir: "up", fabric: "teal" },
  { kind: "plant-big", x: 58, y: 31 },
];

// Outdoor dressing for the 2D map (the 3D view draws its own simple trees).
export const HQ_TREES: { x: number; y: number }[] = [
  ...[4, 8, 12, 16, 20, 24, 28].flatMap((y) => [{ x: 0, y }, { x: 60, y }]),
  ...[3, 7, 11, 15, 30, 34, 38, 42, 46, 50, 54].map((x) => ({ x, y: 34 })),
];
export const HQ_PATH = { x: 22, y: 33, w: 4, h: 3 };

// Every blocked tile: walls plus furniture that isn't a seat.
export function hqWallCells() {
  const cells = new Set<string>();
  for (const wall of HQ_TALL_WALLS) {
    for (let x = wall.x1; x <= wall.x2; x++) {
      if (wall.doors.some(([a, b]) => x >= a && x <= b)) continue;
      cells.add(`${x},${wall.y}`);
      cells.add(`${x},${wall.y + 1}`);
    }
  }
  for (const wall of HQ_THIN_WALLS) {
    for (let x = wall.x1; x <= wall.x2; x++) {
      for (let y = wall.y1; y <= wall.y2; y++) {
        const along = wall.x1 === wall.x2 ? y : x;
        if (wall.gaps?.some(([a, b]) => along >= a && along <= b)) continue;
        cells.add(`${x},${y}`);
      }
    }
  }
  return cells;
}

export function itemCells(item: HqItem) {
  const spec = ITEM_SPECS[item.kind];
  const cells: string[] = [];
  for (let dx = 0; dx < spec.w; dx++) {
    for (let dy = 0; dy < spec.h; dy++) cells.push(`${item.x + dx},${item.y + dy}`);
  }
  return cells;
}
