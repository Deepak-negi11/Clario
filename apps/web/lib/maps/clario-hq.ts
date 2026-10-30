// The Clario HQ office as plain data. The 2D map (Phaser) and the 3D view (three.js)
// are both drawn from this file, so they always show the same office.
// Units are tiles; x grows to the right, y grows down. Room names and chat zones live
// in @repo/shared (map-templates) because the server needs them too.

// Item sizes, floor kinds and fabrics are shared with the map builder and the server.
import { ITEM_SPECS, type AvatarLook, type CoworkerId, type Dir, type Fabric, type FloorKind, type ItemKind } from "@repo/shared";
export { ITEM_SPECS, type Dir, type Fabric, type FloorKind, type ItemKind };

export const HQ_COLS = 88;
export const HQ_ROWS = 36;


// Drawn in order, so later floors sit on top of earlier ones. Every area has its own floor, and
// the plain wood left between them is the corridor and the open commons in the middle.
// The Tech Wing (x 46-58): Server Room, Maker Lab, Demo Stage and Hack Space. The East Wing
// (x 60-83) has two workrooms, a second lounge, a coffee corner and a row of cubicles.
export const HQ_FLOORS: { x: number; y: number; w: number; h: number; kind: FloorKind }[] = [
  { x: 2, y: 2, w: 83, h: 31, kind: "wood" },
  { x: 3, y: 4, w: 11, h: 8, kind: "damask" },
  { x: 15, y: 4, w: 6, h: 8, kind: "sand" },
  { x: 22, y: 4, w: 6, h: 8, kind: "sand" },
  { x: 29, y: 4, w: 8, h: 8, kind: "carpet" },
  { x: 38, y: 4, w: 7, h: 8, kind: "tile" },
  // Open Desks: a brick lounge strip along the corridor wall, then the cubicles' carpet.
  { x: 3, y: 14, w: 17, h: 4, kind: "brick" },
  { x: 3, y: 18, w: 16, h: 5, kind: "lavender" },
  { x: 28, y: 15, w: 17, h: 8, kind: "herringbone" },
  { x: 3, y: 26, w: 12, h: 6, kind: "crosstile" },
  { x: 16, y: 24, w: 16, h: 8, kind: "terrazzo" },
  { x: 33, y: 26, w: 12, h: 6, kind: "arcade" },
  { x: 46, y: 4, w: 6, h: 8, kind: "raised" },
  { x: 53, y: 4, w: 6, h: 8, kind: "concrete" },
  { x: 46, y: 15, w: 13, h: 8, kind: "maple" },
  { x: 46, y: 26, w: 13, h: 6, kind: "teal" },
  // East Wing
  { x: 60, y: 4, w: 11, h: 8, kind: "carpet" },
  { x: 72, y: 4, w: 12, h: 8, kind: "sand" },
  { x: 73, y: 15, w: 11, h: 8, kind: "porcelain" },
  { x: 60, y: 26, w: 24, h: 6, kind: "zigzag" },
];

// Walls seen from the front: two rows deep (rows y and y+1), drawn as a tall face.
// `doors` are inclusive [from, to] column ranges left open.
// "cubicle" is a purple fabric partition: the back panel of a row of cubicles.
export type WallStyle = "exterior" | "corridor" | "library" | "game" | "cubicle";
export const HQ_TALL_WALLS: { x1: number; x2: number; y: number; doors: [number, number][]; style: WallStyle }[] = [
  { x1: 2, x2: 84, y: 2, doors: [], style: "exterior" },
  { x1: 2, x2: 84, y: 12, doors: [[7, 8], [17, 18], [24, 25], [32, 33], [40, 41], [48, 49], [55, 56], [64, 65], [77, 78]], style: "corridor" },
  { x1: 2, x2: 15, y: 24, doors: [[8, 9]], style: "library" },
  { x1: 32, x2: 45, y: 24, doors: [[38, 39]], style: "game" },
  // Starts on the Game Room's side wall (x 45) so the two runs meet without a gap.
  { x1: 45, x2: 59, y: 24, doors: [[51, 52]], style: "corridor" },
  // East Wing: the cubicles' back panel, then the corridor wall again with the door to them.
  { x1: 59, x2: 79, y: 24, doors: [], style: "cubicle" },
  { x1: 79, x2: 84, y: 24, doors: [[81, 82]], style: "corridor" },
];

// Walls seen from above: one tile wide, drawn as a thin top edge. A "cubicle" one is a purple
// partition between two cubicles; a "partition" one is Open Desks' dark grey-green cubicle panel.
export type ThinWallStyle = "cubicle" | "partition";
export const HQ_THIN_WALLS: { x1: number; y1: number; x2: number; y2: number; gaps?: [number, number][]; style?: ThinWallStyle }[] = [
  { x1: 2, y1: 4, x2: 2, y2: 11 },
  { x1: 2, y1: 14, x2: 2, y2: 23 },
  // Open Desks' cubicles: a divider between each pair and a run along the front.
  ...[6, 10, 14, 18].map((x) => ({ x1: x, y1: 18, x2: x, y2: 22, style: "partition" as const })),
  { x1: 3, y1: 22, x2: 17, y2: 22, style: "partition" },
  { x1: 2, y1: 26, x2: 2, y2: 32 },
  { x1: 45, y1: 4, x2: 45, y2: 11 },
  // The Lounge opens onto the Demo Stage.
  { x1: 45, y1: 14, x2: 45, y2: 23, gaps: [[17, 20]] },
  { x1: 45, y1: 26, x2: 45, y2: 31 },
  { x1: 59, y1: 4, x2: 59, y2: 11 },
  // The Demo Stage opens onto the East Lounge.
  { x1: 59, y1: 14, x2: 59, y2: 23, gaps: [[17, 20]] },
  { x1: 59, y1: 26, x2: 59, y2: 32 },
  { x1: 3, y1: 32, x2: 58, y2: 32, gaps: [[22, 25]] },
  // East Wing: outer walls, the wall between the workrooms, and the cubicle partitions.
  { x1: 84, y1: 4, x2: 84, y2: 11 },
  { x1: 84, y1: 14, x2: 84, y2: 23 },
  { x1: 84, y1: 26, x2: 84, y2: 32 },
  { x1: 60, y1: 32, x2: 83, y2: 32 },
  { x1: 71, y1: 4, x2: 71, y2: 11 },
  ...[63, 67, 71, 75, 79].map((x) => ({ x1: x, y1: 26, x2: x, y2: 28, style: "cubicle" as const })),
  // Low fronts either side of each cubicle's opening.
  { x1: 59, y1: 28, x2: 60, y2: 28, style: "cubicle" },
  ...[63, 67, 71, 75, 79].map((x) => ({ x1: x - 1, y1: 28, x2: x + 1, y2: 28, style: "cubicle" as const })),
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
  // The conference room: windows, a clock and a framed print between them, no screen.
  { kind: "window", x: 5, w: 2.2, wallY: 2 },
  { kind: "clock", x: 7.5, w: 1, wallY: 2 },
  { kind: "window", x: 8.8, w: 2.2, wallY: 2 },
  { kind: "art", x: 11.2, w: 0.9, wallY: 2, variant: 3 },
  { kind: "window", x: 17.2, w: 1.6, wallY: 2 },
  { kind: "window", x: 24.2, w: 1.6, wallY: 2 },
  { kind: "whiteboard", x: 29.6, w: 1.8, wallY: 2 },
  { kind: "tv", x: 31.5, w: 3, wallY: 2 },
  { kind: "cabinets", x: 39, w: 5, wallY: 2 },
  // The corridor wall faces the open floor, so it stays quiet: two prints and the logo.
  { kind: "art", x: 4.1, w: 1.8, wallY: 12, variant: 3 },
  { kind: "art", x: 10.3, w: 2.4, wallY: 12, variant: 1 },
  { kind: "logo", x: 26.6, w: 4.8, wallY: 12 },
  { kind: "art", x: 35.4, w: 2.4, wallY: 12, variant: 2 },
  // The study: windows behind the plants, and the clock by the door.
  { kind: "window", x: 4.95, w: 2.1, wallY: 24 },
  { kind: "clock", x: 7, w: 1, wallY: 24 },
  { kind: "window", x: 10.95, w: 2.1, wallY: 24 },
  { kind: "neon", x: 36, w: 1.9, wallY: 24 },
  { kind: "tv", x: 40.6, w: 3.2, wallY: 24 },
  // Tech Wing
  { kind: "window", x: 54.2, w: 1.6, wallY: 2 },
  { kind: "shelf", x: 56.4, w: 2.4, wallY: 2 },
  { kind: "tv", x: 50.2, w: 4.6, wallY: 12 },
  { kind: "whiteboard", x: 46.4, w: 2.4, wallY: 24 },
  { kind: "neon", x: 54, w: 2.2, wallY: 24, variant: 1 },
  // East Wing
  { kind: "window", x: 64.4, w: 2.2, wallY: 2 },
  { kind: "clock", x: 67.6, w: 1, wallY: 2 },
  { kind: "window", x: 76.9, w: 2.2, wallY: 2 },
  { kind: "clock", x: 79.6, w: 1, wallY: 2 },
  { kind: "art", x: 66.4, w: 1.8, wallY: 12, variant: 4 },
  { kind: "art", x: 74.2, w: 2.2, wallY: 12, variant: 5 },
  { kind: "shelf", x: 80.2, w: 2.4, wallY: 12 },
];

export type RugStyle = "meeting" | "focus" | "lounge" | "round" | "library" | "game" | "stage" | "grey";
// The rugs the map builder offers: a "rug" item's `variant` picks one of these styles.
export const RUG_LOOKS: RugStyle[] = ["lounge", "meeting", "focus", "library", "game", "grey"];
export const HQ_RUGS: { x: number; y: number; w: number; h: number; style: RugStyle }[] = [
  { x: 30, y: 5, w: 6, h: 6, style: "meeting" },
  { x: 15.5, y: 8.3, w: 4, h: 2.9, style: "focus" },
  { x: 22.5, y: 8.3, w: 4, h: 2.9, style: "focus" },
  { x: 29, y: 15.5, w: 7, h: 4.5, style: "lounge" },
  { x: 37.5, y: 15.6, w: 6, h: 5.4, style: "round" },
  { x: 33.6, y: 27.4, w: 4.8, h: 3.4, style: "game" },
  { x: 61, y: 16, w: 10, h: 7, style: "grey" },
];

// `variant` picks one of a piece's looks where it has several (see textureFor in
// clario-hq-builder.ts), such as a side table's lamp or books.
export type HqItem = { kind: ItemKind; x: number; y: number; dir?: Dir; fabric?: Fabric; variant?: number };

const row = (kind: ItemKind, xs: number[], y: number, dir: Dir, fabric?: Fabric): HqItem[] =>
  xs.map((x) => ({ kind, x, y, dir, fabric }));

const pod = (x: number, y: number): HqItem[] => [
  { kind: "desk-l", x, y },
  { kind: "desk-r", x: x + 2, y },
  { kind: "task-chair", x, y: y + 1, dir: "up" },
  { kind: "task-chair", x: x + 3, y: y + 1, dir: "up" },
];

// A workroom table for eight: three chairs a side and one at each end. `x, y` is the top row of
// chairs; the table is the two rows below it.
function workroom(x: number, y: number, fabric: Fabric, variant: number): HqItem[] {
  return [
    { kind: "meeting-table-md", x, y: y + 1, variant },
    ...row("meet-chair", [x, x + 1, x + 2], y, "down", fabric),
    ...row("meet-chair", [x, x + 1, x + 2], y + 3, "up", fabric),
    { kind: "meet-chair", x: x - 1, y: y + 1, dir: "right", fabric },
    { kind: "meet-chair", x: x + 3, y: y + 1, dir: "left", fabric },
  ];
}

// One cubicle, three tiles wide between partitions: a white desk, its chair and a potted tree.
const cubicle = (x: number, y: number): HqItem[] => [
  { kind: "desk-white", x, y },
  { kind: "plant-tree", x: x + 2, y },
  { kind: "task-chair", x, y: y + 1, dir: "up" },
];

// Open Desks' cubicles, three tiles wide between partitions (x is each one's left tile): a
// potted tree by the right-hand post, Claude's chair facing you, and the white desk in front of
// it (its screen facing Claude) with a filing cabinet.
const OPEN_DESKS_CUBICLES = [3, 7, 11, 15];
const openDesksCubicle = (x: number): HqItem[] => [
  { kind: "plant-tree", x: x + 2, y: 18 },
  { kind: "task-chair", x, y: 20, dir: "down" },
  { kind: "desk-white", x, y: 21, variant: 1 },
  { kind: "filing-cabinet", x: x + 2, y: 21, variant: 1 },
];

// Claude works in every Open Desks cubicle chair (components/phaser/scenes/claude-npcs.ts on the
// 2D map, space-3d/claude-3d.ts in 3D). These tiles are blocked, so nobody sits on Claude.
export const HQ_CLAUDE_SEATS = OPEN_DESKS_CUBICLES.map((x) => ({ x, y: 20 }));

const readingNook = (x: number, y: number, fabric: Fabric): HqItem[] => [
  { kind: "armchair", x, y, dir: "right", fabric },
  { kind: "side-table", x: x + 1, y },
  { kind: "armchair", x: x + 2, y, dir: "left", fabric },
];

// One idea per room, with open floor around it. Desks, tables and sofas stand on rugs or
// against walls; plants mark corners and doors instead of filling every gap.
export const HQ_ITEMS: HqItem[] = [
  // Meeting Room 1, the conference room: a long table in three parts with leather executive chairs
  // on every side, each drawn facing the table. A wardrobe, the globe, a lamp and a cabinet stand
  // along the window wall.
  { kind: "meeting-table-md", x: 4, y: 7 },
  { kind: "meeting-table-md", x: 7, y: 7 },
  { kind: "meeting-table-md", x: 10, y: 7 },
  ...row("exec-chair", [4, 5, 6, 7, 8, 9, 10, 11, 12], 6, "down", "leather"),
  ...row("exec-chair", [4, 5, 6, 7, 8, 9, 10, 11, 12], 9, "up", "leather"),
  ...[7, 8].flatMap((y): HqItem[] => [
    { kind: "exec-chair", x: 3, y, dir: "right", fabric: "leather" },
    { kind: "exec-chair", x: 13, y, dir: "left", fabric: "leather" },
  ]),
  { kind: "wardrobe", x: 3, y: 4 },
  { kind: "globe", x: 4, y: 4 },
  { kind: "floor-lamp", x: 12, y: 4 },
  { kind: "filing-cabinet", x: 13, y: 4, variant: 1 },

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

  // Open Desks, after the user's reference: a lounge strip along the corridor wall (a sofa under
  // the print, the bookshelf with a ping-pong table in front, plants in the corners), then four
  // cubicles behind dark partitions with Claude at work in each (HQ_CLAUDE_SEATS).
  { kind: "plant-big", x: 3, y: 14 },
  { kind: "sofa", x: 10, y: 14, dir: "down", fabric: "grey" },
  { kind: "cube-shelf", x: 14, y: 14 },
  { kind: "plant-big", x: 16, y: 14 },
  { kind: "pingpong", x: 13, y: 15, variant: 1 },
  ...OPEN_DESKS_CUBICLES.flatMap(openDesksCubicle),

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

  // Library, the study: shelves and big plants under the windows, and one table with green chairs
  // facing it from every side. The tiles below the door stay clear.
  { kind: "bookshelf", x: 3, y: 26 },
  { kind: "plant-big", x: 5, y: 26 },
  { kind: "plant-tree", x: 6, y: 26 },
  { kind: "plant-tree", x: 11, y: 26 },
  { kind: "plant-big", x: 12, y: 26 },
  { kind: "bookshelf", x: 13, y: 26, variant: 1 },
  { kind: "meeting-table-sm", x: 7, y: 28 },
  ...row("meet-chair", [8, 9], 27, "down", "sage"),
  ...row("meet-chair", [8, 9], 30, "up", "sage"),
  ...[28, 29].flatMap((y): HqItem[] => [
    { kind: "meet-chair", x: 6, y, dir: "right", fabric: "sage" },
    { kind: "meet-chair", x: 11, y, dir: "left", fabric: "sage" },
  ]),
  { kind: "floor-lamp", x: 3, y: 31 },
  { kind: "plant-small", x: 14, y: 31 },

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

  // Demo Stage, the auditorium: two lecterns at the front, three blocks of theatre seats facing
  // them in rows with a walkway behind each, and aisles that join the openings on either side. A flip chart and a side table stand in
  // one front corner and the aquarium in the other; the tiles below the two doors stay clear.
  { kind: "podium", x: 51, y: 16 },
  { kind: "podium", x: 53, y: 16 },
  ...[18, 20, 22].flatMap((y) => row("theatre-seat", [47, 48, 49, 51, 52, 53, 55, 56, 57], y, "up")),
  { kind: "flip-chart", x: 46, y: 15 },
  { kind: "side-table", x: 47, y: 15, variant: 1 },
  { kind: "aquarium", x: 57, y: 15 },

  // The commons under the Focus Room doors: bikes in their rack, a snack machine and a stray cone.
  // The bikes can be ridden (variant 1: the rack is drawn empty and each bike on its own) and the
  // machine gives you a drink (props-on-map.ts).
  { kind: "bike-rack", x: 21, y: 14, variant: 1 },
  { kind: "vending-machine", x: 23, y: 14 },
  { kind: "traffic-cone", x: 26, y: 14 },

  // Hack Space: two hack pods, a VR station and somewhere to sprawl.
  ...pod(47, 27), ...pod(52, 27),
  { kind: "vr-station", x: 57, y: 27 },
  { kind: "beanbag", x: 48, y: 30, dir: "up", fabric: "coral" },
  { kind: "beanbag", x: 50, y: 30, dir: "up", fabric: "teal" },
  { kind: "plant-big", x: 58, y: 31 },

  // ---- East Wing ----
  // Blue Workroom: a table for eight, a whiteboard, a filing cabinet and a desk lamp.
  { kind: "side-table", x: 60, y: 4, variant: 1 },
  { kind: "whiteboard", x: 61, y: 4 },
  { kind: "filing-cabinet", x: 63, y: 4 },
  { kind: "side-table", x: 69, y: 4, variant: 2 },
  { kind: "plant-big", x: 70, y: 4 },
  ...workroom(64, 6, "blue", 0),
  { kind: "plant-small", x: 60, y: 11 },
  { kind: "plant-small", x: 70, y: 11 },

  // White Workroom: the same table in walnut, with a bookshelf and a flip chart.
  { kind: "bookshelf", x: 72, y: 4, variant: 1 },
  { kind: "whiteboard", x: 74, y: 4 },
  { kind: "flip-chart", x: 81, y: 4 },
  { kind: "side-table", x: 83, y: 4, variant: 2 },
  ...workroom(76, 6, "white", 1),
  { kind: "filing-cabinet", x: 83, y: 10, variant: 1 },
  { kind: "plant-big", x: 72, y: 11 },

  // East Lounge: a sofa facing two more across a coffee table, beanbags either side, on a grey rug.
  { kind: "cube-shelf", x: 60, y: 14 },
  { kind: "plant-big", x: 62, y: 14 },
  { kind: "plant-big", x: 68, y: 14 },
  { kind: "cube-shelf", x: 69, y: 14 },
  { kind: "side-table", x: 63, y: 16 },
  { kind: "sofa", x: 64, y: 16, dir: "down", fabric: "sage" },
  { kind: "side-table", x: 67, y: 16 },
  { kind: "beanbag", x: 63, y: 18, dir: "right", fabric: "purple" },
  { kind: "beanbag", x: 63, y: 20, dir: "right", fabric: "blue" },
  { kind: "beanbag", x: 67, y: 18, dir: "left", fabric: "pink" },
  { kind: "beanbag", x: 67, y: 20, dir: "left", fabric: "purple" },
  { kind: "coffee-table", x: 64, y: 19 },
  { kind: "sofa", x: 61, y: 22, dir: "up", fabric: "sage" },
  { kind: "sofa", x: 67, y: 22, dir: "up", fabric: "sage" },
  { kind: "plant-small", x: 60, y: 22 },
  { kind: "side-table", x: 70, y: 22 },

  // Coffee Corner: leather couches and round cafe tables around the coffee station.
  { kind: "armchair", x: 74, y: 15, dir: "down", fabric: "leather" },
  { kind: "coffee-bar", x: 75, y: 15 },
  { kind: "sofa", x: 78, y: 15, dir: "down", fabric: "leather" },
  { kind: "plant-big", x: 82, y: 15 },
  { kind: "cafe-chair", x: 78, y: 17, dir: "right" },
  { kind: "round-table", x: 79, y: 17, variant: 1 },
  { kind: "cafe-chair", x: 80, y: 17, dir: "left" },
  { kind: "sofa", x: 78, y: 19, dir: "up", fabric: "leather" },
  { kind: "armchair", x: 75, y: 17, dir: "down", fabric: "leather" },
  { kind: "cafe-chair", x: 74, y: 19, dir: "right" },
  { kind: "round-table", x: 75, y: 19, variant: 2 },
  { kind: "cafe-chair", x: 76, y: 19, dir: "left" },
  { kind: "armchair", x: 75, y: 21, dir: "up", fabric: "leather" },
  { kind: "cafe-chair", x: 79, y: 21, dir: "right" },
  { kind: "round-table", x: 80, y: 21 },
  { kind: "cafe-chair", x: 81, y: 21, dir: "left" },
  { kind: "plant-small", x: 73, y: 22 },
  { kind: "plant-big", x: 83, y: 22 },

  // Cubicles: five desks against the purple back panel, each with a chair and a little tree.
  ...[60, 64, 68, 72, 76].flatMap((x) => cubicle(x, 26)),
  { kind: "plant-tree", x: 80, y: 26 },
  { kind: "plant-tree", x: 83, y: 26 },
  { kind: "plant-big", x: 60, y: 31 },
  { kind: "water-cooler", x: 70, y: 31 },
  { kind: "filing-cabinet", x: 71, y: 31, variant: 1 },
  { kind: "plant-big", x: 77, y: 31 },
  { kind: "plant-big", x: 83, y: 31 },
];

// Outdoor dressing for the 2D map (the 3D view draws its own simple trees).
export const HQ_TREES: { x: number; y: number }[] = [
  ...[4, 8, 12, 16, 20, 24, 28].flatMap((y) => [{ x: 0, y }, { x: 86, y }]),
  ...[3, 7, 11, 15, 30, 34, 38, 42, 46, 50, 54, 58, 62, 66, 70, 74, 78, 82].map((x) => ({ x, y: 34 })),
];
export const HQ_PATH = { x: 22, y: 33, w: 4, h: 3 };

// Maya, the Practice Session mentor, stands in Focus Room 2.
export const HQ_MENTOR = { x: 24, y: 7 };

// Where the AI coworkers (COWORKERS in @repo/shared) stand, and how they look. Arjun is in the
// Server Room going through logs, Priya just outside Meeting Room 2 between meetings, and Rahul
// at the end of the conference table in Meeting Room 1 after the team sync.
export const HQ_COWORKERS: { id: CoworkerId; x: number; y: number; look: AvatarLook }[] = [
  { id: "arjun", x: 50, y: 9, look: { base: "adam", skin: "#c68642", hair: "#2b2321", top: "#2f9d6a", glasses: true, beard: true } },
  { id: "priya", x: 34, y: 14, look: { base: "alex", skin: "#e0ac69", hair: "#2b2321", top: "#805e8e" } },
  { id: "rahul", x: 12, y: 10, look: { base: "bob", skin: "#8d5524", hair: "#2b2321", top: "#e0a43a" } },
];

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
