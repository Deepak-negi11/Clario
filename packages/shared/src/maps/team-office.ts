import type { Dir, Fabric, FloorKind, ItemKind } from "./catalog";
import { CUSTOM_MAP_LIMITS, FLOOR_CODES, type CustomMap, type CustomMapItem } from "./custom-map";

// An office laid out for a team of a given size, saved on the space like a map built in the
// map builder, so everyone who joins sees the same office and its owner can still edit it.
// A bigger team gets more desks, more workrooms and a wider, taller building.
//
// The building has three bands, top to bottom:
//   1. rooms along the back wall: workrooms (a table for eight), focus rooms and a kitchen;
//   2. open desks: rows of white desks facing each other, two people per three tiles;
//   3. the lounge, the reception by the front door (plus a game corner for bigger teams) and
//      the coffee corner.
// Units are tiles; x grows to the right, y grows down.

export const TEAM_SIZE_RANGE = { min: 1, max: 80 } as const;

// Quick choices for the create-space dialog; each one sizes the office for its upper end.
export const TEAM_SIZE_PRESETS = [
  { size: 5, label: "1–5" },
  { size: 12, label: "6–12" },
  { size: 25, label: "13–25" },
  { size: 50, label: "26–50" },
  { size: 80, label: "51–80" },
] as const;

export const TEAM_OFFICE_THUMBNAIL = "/assets/maps/team-office.png";

export function clampTeamSize(size: number) {
  if (!Number.isFinite(size)) return TEAM_SIZE_RANGE.min;
  return Math.min(TEAM_SIZE_RANGE.max, Math.max(TEAM_SIZE_RANGE.min, Math.round(size)));
}

// Grass around the building: columns either side, rows above (bushes) and below (path, trees).
const SIDE = 2;
const TOP = 3;
const BELOW = 5;
const MAX_INNER = CUSTOM_MAP_LIMITS.maxCols - 2 * SIDE - 2;

const LOUNGE_W = 12;
const COFFEE_W = 11;
const WORKROOM_W = 9;
const FOCUS_W = 5;
const KITCHEN_MIN_W = 8;
const BAND_H = 7; // rooms along the back wall
const COMMONS_H = 9; // lounge, reception, coffee corner

const WORKROOMS: { name: string; fabric: Fabric; floor: FloorKind }[] = [
  { name: "Blue Workroom", fabric: "blue", floor: "carpet" },
  { name: "White Workroom", fabric: "white", floor: "sand" },
  { name: "Green Workroom", fabric: "sage", floor: "sage" },
  { name: "Coral Workroom", fabric: "coral", floor: "terrazzo" },
  { name: "Yellow Workroom", fabric: "mustard", floor: "sand" },
];

// The numbers behind a layout, also shown in the create-space dialog.
export function teamOfficePlan(teamSize: number) {
  const people = clampTeamSize(teamSize);
  const seats = Math.max(4, Math.ceil(people * 1.1));
  const workrooms = Math.min(WORKROOMS.length, Math.ceil(people / 10));
  const gameCorner = people >= 26;
  let blocks = 1;
  let columns = Math.ceil(seats / 2);
  while (3 * columns + 2 > MAX_INNER) {
    blocks++;
    columns = Math.ceil(seats / (2 * blocks));
  }
  const roomsWidth = workrooms * (WORKROOM_W + 1) + KITCHEN_MIN_W;
  // The hall between the lounge and the coffee corner holds the front door, and the game corner
  // too when there is one (26 tiles keep its tables clear of the reception).
  const commonsWidth = LOUNGE_W + COFFEE_W + (gameCorner ? 26 : 4);
  const inner = Math.min(MAX_INNER, Math.max(roomsWidth, commonsWidth, 3 * columns + 2));
  let focusRooms = 0;
  let kitchen = inner - workrooms * (WORKROOM_W + 1);
  while (focusRooms < 2 && kitchen - (FOCUS_W + 1) >= KITCHEN_MIN_W) {
    focusRooms++;
    kitchen -= FOCUS_W + 1;
  }
  const cols = inner + 2 + 2 * SIDE;
  const rows = TOP + 1 + BAND_H + 1 + (1 + 5 * blocks) + COMMONS_H + 1 + BELOW;
  return { people, desks: 2 * columns * blocks, workrooms, focusRooms, kitchen, gameCorner, blocks, columns, inner, cols, rows };
}

export function generateTeamOffice(teamSize: number): CustomMap {
  const plan = teamOfficePlan(teamSize);
  const { cols, rows, inner } = plan;
  const floor = Array.from({ length: rows }, () => Array<string>(cols).fill("."));
  const walls = Array.from({ length: rows }, () => Array<string>(cols).fill("."));
  const items: CustomMapItem[] = [];
  const rooms: CustomMap["rooms"] = [];

  const paint = (kind: FloorKind | "path", x: number, y: number, w: number, h: number) => {
    for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) floor[ty]![tx] = FLOOR_CODES[kind];
  };
  const wall = (x: number, y: number, w: number, h: number) => {
    for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) walls[ty]![tx] = "#";
  };
  const open = (x: number, y: number, w: number) => {
    for (let tx = x; tx < x + w; tx++) walls[y]![tx] = ".";
  };
  const put = (kind: ItemKind, x: number, y: number, extra: { dir?: Dir; fabric?: Fabric; variant?: number } = {}) => {
    items.push({ kind, x, y, ...extra });
  };
  const room = (id: string, name: string, x: number, y: number, width: number, height: number) => {
    rooms.push({ id, name, bounds: { x, y, width, height } });
  };

  // The building shell: outer walls, wood inside.
  const xL = SIDE, xR = SIDE + inner + 1;
  const yTop = TOP;
  const y1 = yTop + 1; // first row of the back rooms
  const yRoomsWall = y1 + BAND_H;
  const yAisle = yRoomsWall + 1;
  const yCommons = yAisle + 5 * plan.blocks + 1;
  const yFront = yCommons + COMMONS_H;
  paint("wood", xL, yTop, inner + 2, yFront - yTop + 1);
  wall(xL, yTop, inner + 2, 1);
  wall(xL, yFront, inner + 2, 1);
  wall(xL, yTop, 1, yFront - yTop + 1);
  wall(xR, yTop, 1, yFront - yTop + 1);
  wall(xL, yRoomsWall, inner + 2, 1);

  // 1. Rooms along the back wall, left to right, each with a door in the middle of its front wall.
  let a = xL + 1;
  const door = (from: number, width: number) => open(from + Math.floor((width - 2) / 2), yRoomsWall, 2);
  for (let i = 0; i < plan.workrooms; i++) {
    const look = WORKROOMS[i]!;
    paint(look.floor, a, y1, WORKROOM_W, BAND_H);
    if (i % 2 === 0) {
      put("side-table", a, y1, { variant: 1 });
      put("whiteboard", a + 1, y1);
      put("filing-cabinet", a + 3, y1);
      put("side-table", a + 7, y1, { variant: 2 });
      put("plant-big", a + 8, y1);
    } else {
      put("bookshelf", a, y1, { variant: 1 });
      put("whiteboard", a + 2, y1);
      put("flip-chart", a + 6, y1);
      put("side-table", a + 8, y1, { variant: 2 });
    }
    put("meeting-table-md", a + 3, y1 + 2, { variant: i % 2 });
    for (let dx = 3; dx <= 5; dx++) {
      put("meet-chair", a + dx, y1 + 1, { dir: "down", fabric: look.fabric });
      put("meet-chair", a + dx, y1 + 4, { dir: "up", fabric: look.fabric });
    }
    put("meet-chair", a + 2, y1 + 2, { dir: "right", fabric: look.fabric });
    put("meet-chair", a + 6, y1 + 2, { dir: "left", fabric: look.fabric });
    put("plant-small", a, y1 + BAND_H - 1);
    put("plant-small", a + 8, y1 + BAND_H - 1);
    room(`workroom-${i + 1}`, look.name, a, y1, WORKROOM_W, BAND_H);
    door(a, WORKROOM_W);
    wall(a + WORKROOM_W, y1, 1, BAND_H);
    a += WORKROOM_W + 1;
  }
  for (let i = 0; i < plan.focusRooms; i++) {
    paint("sand", a, y1, FOCUS_W, BAND_H);
    put("bookshelf", a, y1);
    put("floor-lamp", a + 3, y1);
    put("plant-big", a + 4, y1);
    put("desk-white", a + 1, y1 + 2);
    put("task-chair", a + 1, y1 + 3, { dir: "up" });
    put("armchair", a, y1 + 5, { dir: "right", fabric: i % 2 ? "teal" : "mustard" });
    put("side-table", a + 1, y1 + 5, { variant: 2 });
    room(`focus-${i + 1}`, `Focus Room ${i + 1}`, a, y1, FOCUS_W, BAND_H);
    door(a, FOCUS_W);
    wall(a + FOCUS_W, y1, 1, BAND_H);
    a += FOCUS_W + 1;
  }
  const k = plan.kitchen;
  paint("tile", a, y1, k, BAND_H);
  (["fridge", "counter", "counter-sink", "counter", "counter-micro", "counter-coffee", "water-cooler"] as const)
    .forEach((kind, i) => put(kind, a + i, y1));
  if (k >= 9) put("plant-big", a + k - 1, y1);
  for (let t = 0; t + 2 < k; t += 4) {
    put("cafe-chair", a + t, y1 + 3, { dir: "right" });
    put("round-table", a + t + 1, y1 + 3, { variant: (t / 4) % 3 });
    put("cafe-chair", a + t + 2, y1 + 3, { dir: "left" });
  }
  room("kitchen", "Kitchen", a, y1, k, BAND_H);
  door(a, k);

  // 2. Open desks: each column is two desks back to back, a chair above and a chair below, with
  // a little tree between every other pair.
  const deskWidth = 3 * plan.columns;
  const xs = xL + 1 + Math.floor((inner - deskWidth) / 2);
  paint("zigzag", xs - 1, yAisle + 1, deskWidth + 2, 5 * plan.blocks - 1);
  for (let b = 0; b < plan.blocks; b++) {
    const r = yAisle + 1 + 5 * b;
    for (let j = 0; j < plan.columns; j++) {
      const x = xs + 3 * j;
      put("task-chair", x, r, { dir: "down" });
      put("desk-white", x, r + 1, { variant: 1 });
      put("desk-white", x, r + 2);
      put("task-chair", x, r + 3, { dir: "up" });
      if (j % 2 === 0) put("plant-tree", x + 2, r + 1);
    }
    room(`desks-${b + 1}`, plan.blocks === 1 ? "Desks" : `Desks ${b + 1}`, xs - 1, r, deskWidth + 2, 4);
  }
  if (xs - 1 > xL + 1) put("plant-big", xL + 1, yAisle + 1);
  if (xs + deskWidth < xR - 1) {
    put("plant-big", xR - 1, yAisle + 1);
    put("water-cooler", xR - 1, yAisle + 2);
  }

  // 3a. Lounge: a sofa facing two more across a coffee table on a grey carpet, beanbags either side.
  const lx = xL + 1, ly = yCommons + 1;
  paint("office", lx + 1, ly + 2, LOUNGE_W - 2, 6);
  put("cube-shelf", lx, ly);
  put("plant-big", lx + 2, ly);
  put("plant-big", lx + 8, ly);
  put("cube-shelf", lx + 9, ly);
  put("plant-small", lx + 11, ly);
  put("side-table", lx + 3, ly + 2);
  put("sofa", lx + 4, ly + 2, { dir: "down", fabric: "sage" });
  put("side-table", lx + 7, ly + 2);
  put("beanbag", lx + 3, ly + 4, { fabric: "purple" });
  put("beanbag", lx + 3, ly + 6, { fabric: "blue" });
  put("beanbag", lx + 7, ly + 4, { fabric: "pink" });
  put("beanbag", lx + 7, ly + 6, { fabric: "purple" });
  put("coffee-table", lx + 4, ly + 5);
  put("plant-small", lx, ly + 7);
  put("sofa", lx + 1, ly + 7, { dir: "up", fabric: "sage" });
  put("sofa", lx + 7, ly + 7, { dir: "up", fabric: "sage" });
  put("side-table", lx + 10, ly + 7);
  room("lounge", "Lounge", lx, yCommons, LOUNGE_W, COMMONS_H);

  // 3b. Coffee corner: leather couches and round cafe tables around the coffee station.
  const cx = xR - COFFEE_W, cy = yCommons;
  paint("porcelain", cx, cy + 1, COFFEE_W, COMMONS_H - 1);
  put("armchair", cx + 1, cy + 1, { dir: "down", fabric: "leather" });
  put("coffee-bar", cx + 2, cy + 1);
  put("sofa", cx + 5, cy + 1, { dir: "down", fabric: "leather" });
  put("plant-big", cx + 9, cy + 1);
  put("cafe-chair", cx + 5, cy + 3, { dir: "right" });
  put("round-table", cx + 6, cy + 3, { variant: 1 });
  put("cafe-chair", cx + 7, cy + 3, { dir: "left" });
  put("sofa", cx + 5, cy + 5, { dir: "up", fabric: "leather" });
  put("armchair", cx + 2, cy + 3, { dir: "down", fabric: "leather" });
  put("cafe-chair", cx + 1, cy + 5, { dir: "right" });
  put("round-table", cx + 2, cy + 5, { variant: 2 });
  put("cafe-chair", cx + 3, cy + 5, { dir: "left" });
  put("armchair", cx + 2, cy + 7, { dir: "up", fabric: "leather" });
  put("cafe-chair", cx + 6, cy + 7, { dir: "right" });
  put("round-table", cx + 7, cy + 7);
  put("cafe-chair", cx + 8, cy + 7, { dir: "left" });
  put("plant-small", cx, cy + 8);
  put("plant-big", cx + 10, cy + 8);
  room("coffee", "Coffee Corner", cx, cy, COFFEE_W, COMMONS_H);

  // 3c. Between them: the reception by the front door, and a game corner when there's room.
  const h0 = lx + LOUNGE_W, h1 = cx - 1;
  const frontDoor = h0 + Math.floor((h1 - h0 - 1) / 2);
  open(frontDoor, yFront, 2);
  const hallEnd = plan.gameCorner ? frontDoor + 1 : h1;
  paint("terrazzo", h0, yCommons + 1, hallEnd - h0 + 1, COMMONS_H - 1);
  if (frontDoor - h0 >= 5) {
    put("task-chair", frontDoor - 4, yCommons + 3, { dir: "down" });
    put("reception-desk", frontDoor - 5, yCommons + 4);
    put("plant-big", h0, yCommons + 8);
  }
  // Waiting sofas where the hall is wide enough to leave room beside the reception desk.
  if (frontDoor - h0 >= 9) {
    put("sofa", h0 + 1, yCommons + 1, { dir: "down", fabric: "navy" });
    put("coffee-table", h0 + 1, yCommons + 2);
    put("floor-lamp", h0 + 4, yCommons + 1);
  }
  if (!plan.gameCorner && h1 - frontDoor >= 9) {
    put("floor-lamp", h1 - 4, yCommons + 1);
    put("sofa", h1 - 3, yCommons + 1, { dir: "down", fabric: "navy" });
    put("coffee-table", h1 - 3, yCommons + 2);
  }
  if (!plan.gameCorner && h1 - frontDoor >= 3) put("plant-big", h1, yCommons + 8);
  room("reception", "Reception", h0, yCommons, hallEnd - h0 + 1, COMMONS_H);
  if (plan.gameCorner) {
    const g0 = frontDoor + 2;
    paint("arcade", g0 + 1, yCommons + 1, h1 - g0, COMMONS_H - 1);
    put("pingpong", g0 + 2, yCommons + 2);
    put("foosball", g0 + 7, yCommons + 3);
    const arcades = Math.min(3, h1 - (g0 + 9));
    for (let i = 0; i < arcades; i++) put("arcade", h1 - i, yCommons + 1);
    put("beanbag", g0 + 2, yCommons + 6, { fabric: "coral" });
    put("beanbag", g0 + 4, yCommons + 6, { fabric: "teal" });
    put("sofa", g0 + 7, yCommons + 7, { dir: "up", fabric: "grey" });
    put("plant-big", h1, yCommons + 8);
    room("game-corner", "Game Corner", g0, yCommons, h1 - g0 + 1, COMMONS_H);
  }

  // Outside: a path from the front door, trees along the edges and bushes behind.
  paint("path", frontDoor, yFront + 1, 2, rows - yFront - 1);
  for (let x = SIDE + 1; x + 1 < cols - SIDE; x += 4) put("bush", x, 1);
  const treeRow = yFront + 3;
  for (let x = 0; x + 1 < cols; x += 4) {
    if (x + 1 >= frontDoor - 1 && x <= frontDoor + 2) continue;
    put("tree", x, treeRow);
  }
  for (let y = yTop + 2; y < yFront; y += 4) {
    put("tree", 0, y);
    put("tree", cols - 2, y);
  }

  return {
    version: 1,
    cols,
    rows,
    floor: floor.map((row) => row.join("")),
    walls: walls.map((row) => row.join("")),
    items,
    rooms,
    spawn: { x: frontDoor, y: yFront - 1 },
  };
}
