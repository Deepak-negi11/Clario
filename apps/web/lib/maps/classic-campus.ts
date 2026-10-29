// Furniture for the Classic Office and Coworking Campus maps, drawn with the same pieces as Clario HQ
// (office-art.ts) and placed by placeItems, so seats, blocked tiles and shadows work the same way.
// Walls, floors and the lounges of these maps are still drawn in arena-scene.ts.
// Units are tiles; `x, y` is an item's top-left tile.

import type { Fabric } from "@repo/shared";
import type { HqItem } from "./clario-hq";

// Two desks in a row with their chairs, for a chair below each desk (facing up).
const deskRow = (xs: number[], y: number): HqItem[] => xs.flatMap((x) => [
  { kind: "desk-white", x, y } as HqItem,
  { kind: "task-chair", x, y: y + 1, dir: "up" } as HqItem,
]);

// A pod of four desks: two facing two across the middle, with their chairs.
const pod = (x: number, y: number): HqItem[] => [
  { kind: "task-chair", x: x + 1, y, dir: "down" },
  { kind: "task-chair", x: x + 3, y, dir: "down" },
  { kind: "desk-white", x: x + 1, y: y + 1, variant: 1 },
  { kind: "desk-white", x: x + 3, y: y + 1, variant: 1 },
  { kind: "desk-white", x: x + 1, y: y + 2 },
  { kind: "desk-white", x: x + 3, y: y + 2 },
  { kind: "task-chair", x: x + 1, y: y + 3, dir: "up" },
  { kind: "task-chair", x: x + 3, y: y + 3, dir: "up" },
];

// A table for eight to ten: `seats` chairs a side on the rows above and below it, one at each end.
const meeting = (x: number, y: number, seats: number, fabric: Fabric): HqItem[] => {
  const xs = Array.from({ length: seats }, (_, i) => x + i);
  return [
    { kind: seats === 3 ? "meeting-table-md" : "meeting-table-sm", x, y },
    ...xs.map((cx): HqItem => ({ kind: "meet-chair", x: cx, y: y - 1, dir: "down", fabric })),
    ...xs.map((cx): HqItem => ({ kind: "meet-chair", x: cx, y: y + 2, dir: "up", fabric })),
    { kind: "meet-chair", x: x - 1, y, dir: "right", fabric },
    { kind: "meet-chair", x: x + seats, y, dir: "left", fabric },
  ];
};

// A round cafe table with a wooden chair either side.
const cafeTable = (x: number, y: number, variant = 0): HqItem[] => [
  { kind: "cafe-chair", x: x - 1, y, dir: "right" },
  { kind: "round-table", x, y, variant },
  { kind: "cafe-chair", x: x + 1, y, dir: "left" },
];

// These maps have thin walls with another room (or the outside) just behind them, so anything
// standing against a north wall must be low: tall pieces (bookshelves, whiteboards, potted trees,
// arcades, the fridge) would poke over the wall into the next room. They go by a south wall.

// Kitchen run along a back wall: counters, sink, coffee, microwave.
const kitchenRun = (x: number, y: number): HqItem[] => [
  { kind: "counter", x, y },
  { kind: "counter-sink", x: x + 1, y },
  { kind: "counter-coffee", x: x + 2, y },
  { kind: "counter-micro", x: x + 3, y },
  { kind: "counter", x: x + 4, y },
];

// A private office for one, 6 x 6 tiles from (x, y): desk, cabinet and lamp against the back
// wall, a reading chair and a plant. `flip` mirrors it for offices with the door on the left.
function privateOffice(x: number, y: number, flip: boolean): HqItem[] {
  const at = (dx: number, w = 1) => (flip ? x + 5 - dx - (w - 1) : x + dx);
  return [
    { kind: "filing-cabinet", x: at(0), y, variant: 1 },
    { kind: "desk-white", x: at(2, 2), y },
    { kind: "side-table", x: at(4), y },
    { kind: "plant-small", x: at(5), y },
    { kind: "task-chair", x: flip ? at(3) : at(2), y: y + 1, dir: "up" },
    { kind: "armchair", x: at(0), y: y + 4, dir: flip ? "left" : "right", fabric: "teal" },
    { kind: "side-table", x: at(1), y: y + 4, variant: 2 },
    { kind: "plant-big", x: at(5), y: y + 5 },
  ];
}

// A reading corner: two armchairs facing each other across a lamp table.
const readingCorner = (x: number, y: number, fabric: Fabric): HqItem[] => [
  { kind: "armchair", x, y, dir: "right", fabric },
  { kind: "side-table", x: x + 1, y },
  { kind: "armchair", x: x + 2, y, dir: "left", fabric },
];

export const CLASSIC_OFFICE_ITEMS: HqItem[] = [
  // Offices 1-3 (door on the right) and 6-8 (door on the left).
  ...[3, 10, 17].flatMap((y) => [...privateOffice(4, y, false), ...privateOffice(34, y, true)]),

  // Office 4 (door at the bottom, x 14-15).
  { kind: "plant-small", x: 12, y: 3 },
  { kind: "desk-white", x: 14, y: 3 },
  { kind: "task-chair", x: 14, y: 4, dir: "up" },
  { kind: "filing-cabinet", x: 17, y: 3, variant: 1 },
  { kind: "side-table", x: 18, y: 3, variant: 1 },
  ...readingCorner(16, 6, "navy"),
  { kind: "bookshelf", x: 11, y: 8 },

  // Office 5 (door at the bottom, x 26-27).
  { kind: "filing-cabinet", x: 24, y: 3, variant: 1 },
  { kind: "side-table", x: 25, y: 3, variant: 1 },
  { kind: "desk-white", x: 27, y: 3 },
  { kind: "task-chair", x: 27, y: 4, dir: "up" },
  { kind: "plant-small", x: 30, y: 3 },
  ...readingCorner(28, 6, "mustard"),
  { kind: "bookshelf", x: 24, y: 8, variant: 1 },

  // Coffee Corner: the coffee station, water and one round table. The room is too narrow for its
  // sign anywhere but the top-left tile, so the top row stays clear.
  { kind: "coffee-bar", x: 20, y: 5 },
  { kind: "water-cooler", x: 22, y: 5 },
  ...cafeTable(21, 7, 1),

  // Meeting Room: a table for ten, a whiteboard, a filing cabinet and a flip chart.
  ...meeting(14, 14, 4, "blue"),
  { kind: "side-table", x: 13, y: 12, variant: 1 },
  { kind: "filing-cabinet", x: 19, y: 12 },
  { kind: "flip-chart", x: 13, y: 18 },
  { kind: "plant-big", x: 19, y: 18 },

  // Work Area: two rows of desks with little trees between them.
  ...deskRow([13, 17], 22),
  ...deskRow([13, 17], 25),
  ...[15, 19].flatMap((x): HqItem[] => [{ kind: "plant-tree", x, y: 22 }, { kind: "plant-tree", x, y: 25 }]),
  { kind: "water-cooler", x: 21, y: 21 },
  { kind: "plant-small", x: 21, y: 26 },

  // Game Room
  { kind: "pingpong", x: 34, y: 24 },
  { kind: "foosball", x: 37, y: 24 },
  { kind: "beanbag", x: 34, y: 27, dir: "right", fabric: "coral" },
  { kind: "arcade", x: 38, y: 28 },
  { kind: "arcade", x: 39, y: 28 },

  // Kitchen: the counter run on the back wall, the fridge by the front wall, two round tables.
  ...kitchenRun(4, 24),
  { kind: "water-cooler", x: 9, y: 24 },
  ...cafeTable(5, 26, 1),
  ...cafeTable(8, 26, 2),
  { kind: "fridge", x: 4, y: 28 },
  { kind: "plant-small", x: 9, y: 28 },

  // Hall
  { kind: "floor-lamp", x: 25, y: 26 },
  { kind: "plant-small", x: 11, y: 24 },
  { kind: "plant-big", x: 32, y: 22 },
];

export const CAMPUS_ITEMS: HqItem[] = [
  // Conference Room (doors: right x 15 rows 12-13, bottom x 9-10).
  ...meeting(6, 12, 4, "blue"),
  { kind: "side-table", x: 4, y: 9, variant: 1 },
  { kind: "filing-cabinet", x: 13, y: 9 },
  { kind: "plant-small", x: 14, y: 9 },
  { kind: "whiteboard", x: 4, y: 16 },
  { kind: "flip-chart", x: 12, y: 16 },
  { kind: "plant-big", x: 14, y: 16 },

  // Meeting Room (doors: left x 36 rows 12-13, bottom x 41-42).
  ...meeting(40, 12, 4, "white"),
  { kind: "side-table", x: 37, y: 9, variant: 1 },
  { kind: "filing-cabinet", x: 39, y: 9, variant: 1 },
  { kind: "plant-small", x: 47, y: 9 },
  { kind: "bookshelf", x: 37, y: 16, variant: 1 },
  { kind: "whiteboard", x: 44, y: 16 },
  { kind: "flip-chart", x: 46, y: 16 },
  { kind: "plant-big", x: 47, y: 16 },

  // Café: leather couches along the back wall, round tables, the coffee station. x 24-27 stays
  // clear (the way in from the courtyard), and so does x 21-22 on the top row (the room's sign).
  { kind: "coffee-bar", x: 16, y: 9 },
  { kind: "sofa", x: 18, y: 9, dir: "down", fabric: "leather" },
  { kind: "side-table", x: 28, y: 9 },
  { kind: "aquarium", x: 29, y: 9 },
  { kind: "sofa", x: 31, y: 9, dir: "down", fabric: "leather" },
  { kind: "armchair", x: 34, y: 9, dir: "down", fabric: "leather" },
  { kind: "plant-small", x: 35, y: 9 },
  ...cafeTable(18, 12, 1),
  ...cafeTable(22, 14, 2),
  ...cafeTable(30, 12, 1),
  ...cafeTable(33, 14),
  { kind: "water-cooler", x: 35, y: 15 },
  { kind: "plant-small", x: 16, y: 16 },

  // Work Areas: two rows of four-desk pods each, with trees and cabinets between them. The
  // columns in front of the doors to the bottom rooms (x 12-13 and 38-39) stay clear.
  ...[5, 14, 33, 40].flatMap((x) => [...pod(x, 19), ...pod(x, 24)]),
  ...[4, 11, 19, 32, 46].flatMap((x): HqItem[] => [
    { kind: "plant-tree", x, y: 20 },
    { kind: "filing-cabinet", x, y: 21, variant: 1 },
    { kind: "plant-tree", x, y: 25 },
  ]),

  // Kitchen
  ...kitchenRun(4, 29),
  { kind: "water-cooler", x: 9, y: 29 },
  ...cafeTable(6, 31, 1),
  ...cafeTable(10, 32, 2),
  { kind: "fridge", x: 4, y: 33 },
  { kind: "plant-small", x: 16, y: 29 },

  // Reception: the desk with its chair behind it, and a sofa for visitors. x 24-27 is the way in.
  { kind: "plant-big", x: 18, y: 29 },
  { kind: "task-chair", x: 20, y: 29, dir: "down" },
  { kind: "reception-desk", x: 19, y: 30 },
  { kind: "plant-small", x: 28, y: 29 },
  { kind: "sofa", x: 29, y: 30, dir: "down", fabric: "navy" },
  { kind: "coffee-table", x: 29, y: 31 },
  { kind: "plant-big", x: 33, y: 29 },

  // Game Room (door at the top, x 38-39). Arcades and the bookshelf stand by the front wall.
  { kind: "pingpong", x: 35, y: 30 },
  { kind: "foosball", x: 40, y: 30 },
  { kind: "beanbag", x: 44, y: 30, dir: "down", fabric: "coral" },
  { kind: "beanbag", x: 46, y: 30, dir: "down", fabric: "teal" },
  { kind: "plant-small", x: 47, y: 29 },
  { kind: "bookshelf", x: 42, y: 33 },
  { kind: "arcade", x: 44, y: 33 },
  { kind: "arcade", x: 45, y: 33 },
  { kind: "arcade", x: 46, y: 33 },
];
