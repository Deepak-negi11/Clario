import Phaser from "phaser";
import { isWallAt, type CustomFloor, type CustomMap } from "@repo/shared";
import { quarterFloor, WALL_THICKNESS, wallBars as tileWallBars } from "../../../lib/maps/custom-walls";
import type { MinimapFloor } from "../scene-bridge";
import { HQ_FLOOR_COLORS, placeItems, type HqSceneApi } from "./clario-hq-builder";
import { rideableRack } from "./props-on-map";

// Draws a map someone built in the map builder: floors, walls, and everything placed on it.
// The furniture art is Clario HQ's (clario-hq-builder.ts), so both maps look alike.

const TILE = 32;
// A wall is a slim one down the middle of its tiles, WALL_THICK across (about a third of a tile,
// as thick as the 3D view's walls), joined to the walls next to it. Its top sits WALL_LIFT above
// the floor and its front face shows below that, so a wall reads as standing up.
const WALL_THICK = WALL_THICKNESS * TILE;
const WALL_IN = (TILE - WALL_THICK) / 2;
const WALL_LIFT = 14;
const WALL = { cap: 0x4a4f5e, capHi: 0x737a8e, capLo: 0x353946, face: 0xeee9df, faceShade: 0xdcd5c8, skirting: 0xd8cab0, base: 0xa8987c };
const PATH_COLOR = 0xcfc9bd;

export function customFloorColor(floor: CustomFloor) {
  return floor === "path" ? PATH_COLOR : HQ_FLOOR_COLORS[floor];
}

export function buildCustomMap(scene: Phaser.Scene, map: CustomMap, api: HqSceneApi) {
  drawFloors(scene, map);
  drawWalls(scene, map, api);
  // Its first bike rack is drawn empty: its bikes are drawn on their own, to be ridden.
  placeItems(scene, api, rideableRack(map.items));
}

type FloorRun = { x: number; y: number; w: number; h: number; floor: CustomFloor };

// Floors in runs of one kind along each half row (a wall tile can show a different floor in each
// half), so a big room is a handful of rectangles. Where both halves of a row match, one run a
// whole tile tall covers them.
function floorRuns(map: CustomMap): FloorRun[] {
  const runs: FloorRun[] = [];
  for (let y = 0; y < map.rows; y++) {
    const halves = [-1, 1].map((dy) => {
      const cells = Array.from({ length: 2 * map.cols }, (_, i) => quarterFloor(map, i >> 1, y, i % 2 ? 1 : -1, dy));
      const found: { start: number; end: number; floor: CustomFloor }[] = [];
      for (let start = 0; start < cells.length;) {
        const floor = cells[start];
        let end = start + 1;
        while (end < cells.length && cells[end] === floor) end++;
        if (floor) found.push({ start, end, floor });
        start = end;
      }
      return found;
    });
    const [upper, lower] = halves as [typeof halves[0], typeof halves[0]];
    const same = (a: typeof upper[0], b: typeof upper[0]) => a.start === b.start && a.end === b.end && a.floor === b.floor;
    for (const run of upper) {
      const whole = lower.some((other) => same(run, other));
      runs.push({ x: run.start / 2, y, w: (run.end - run.start) / 2, h: whole ? 1 : 0.5, floor: run.floor });
    }
    for (const run of lower) {
      if (!upper.some((other) => same(run, other))) runs.push({ x: run.start / 2, y: y + 0.5, w: (run.end - run.start) / 2, h: 0.5, floor: run.floor });
    }
  }
  return runs;
}

// The texture offset follows the position so patterns line up from one run to the next.
function drawFloors(scene: Phaser.Scene, map: CustomMap) {
  for (const { x, y, w, h, floor } of floorRuns(map)) {
    scene.add.tileSprite(x * TILE, y * TILE, w * TILE, h * TILE, floor === "path" ? "hq-path" : `hq-floor-${floor}`)
      .setOrigin(0, 0).setTilePosition(x * TILE, y * TILE).setDepth(-998);
  }
}

type Bar = { x0: number; y0: number; x1: number; y1: number };

// The slim wall on a wall tile (lib/maps/custom-walls.ts), in pixels within the tile.
function wallBars(map: CustomMap, x: number, y: number): Bar[] {
  return tileWallBars(map, x, y).map((bar) => ({ x0: bar.x0 * TILE, y0: bar.y0 * TILE, x1: bar.x1 * TILE, y1: bar.y1 * TILE }));
}

// One graphics object per row of walls, at that row's depth, so people north of a wall stand
// behind it and people south of it in front. Front faces go down first, then the tops over them.
function drawWalls(scene: Phaser.Scene, map: CustomMap, api: HqSceneApi) {
  const shadow = scene.add.graphics().setDepth(-984);
  for (let y = 0; y < map.rows; y++) {
    let g: Phaser.GameObjects.Graphics | null = null;
    const tops: [number, number, Bar[]][] = [];
    for (let x = 0; x < map.cols; x++) {
      if (!isWallAt(map, x, y)) continue;
      api.wall(x, y);
      g ??= scene.add.graphics().setDepth((y + 1) * TILE);
      const bars = wallBars(map, x, y);
      tops.push([x, y, bars]);
      const left = x * TILE, top = y * TILE;
      const south = isWallAt(map, x, y + 1);
      for (const bar of bars) {
        // A bar running on into the tile below shows no face: the wall carries on there.
        if (bar.y1 === TILE && south) continue;
        const width = bar.x1 - bar.x0, faceTop = top + bar.y1 - WALL_LIFT;
        g.fillStyle(WALL.face, 1).fillRect(left + bar.x0, faceTop, width, WALL_LIFT);
        g.fillStyle(WALL.faceShade, 1).fillRect(left + bar.x0, faceTop, width, 2);
        g.fillStyle(WALL.skirting, 1).fillRect(left + bar.x0, faceTop + WALL_LIFT - 4, width, 3);
        g.fillStyle(WALL.base, 1).fillRect(left + bar.x0, faceTop + WALL_LIFT - 1, width, 1);
        shadow.fillStyle(0x1b2130, 0.16).fillRect(left + bar.x0, top + bar.y1, width, 4);
      }
      // A soft shadow east of north-south walls, as if lit from the north-west.
      for (const bar of bars) if (bar.x1 - bar.x0 === WALL_THICK) shadow.fillStyle(0x1b2130, 0.1).fillRect(left + bar.x1, top + bar.y0, 3, bar.y1 - bar.y0);
    }
    if (!g) continue;
    for (const [x, , bars] of tops) {
      const left = x * TILE, top = y * TILE - WALL_LIFT;
      const n = isWallAt(map, x, y - 1);
      for (const bar of bars) g.fillStyle(WALL.cap, 1).fillRect(left + bar.x0, top + bar.y0, bar.x1 - bar.x0, bar.y1 - bar.y0);
      for (const bar of bars) {
        const width = bar.x1 - bar.x0, height = bar.y1 - bar.y0;
        // The lit top edge, broken where a wall comes in from the north.
        if (bar.y0 === WALL_IN || !n) {
          if (n && width > WALL_THICK) {
            g.fillStyle(WALL.capHi, 1).fillRect(left + bar.x0, top + bar.y0, WALL_IN - bar.x0, 2);
            g.fillStyle(WALL.capHi, 1).fillRect(left + WALL_IN + WALL_THICK, top + bar.y0, bar.x1 - WALL_IN - WALL_THICK, 2);
          } else if (!n || width > WALL_THICK) {
            g.fillStyle(WALL.capHi, 1).fillRect(left + bar.x0, top + bar.y0, width, 2);
          }
        }
        // North-south walls get a lit west edge and a dark east one.
        if (width === WALL_THICK && height > WALL_THICK) {
          g.fillStyle(WALL.capHi, 1).fillRect(left + bar.x0, top + bar.y0, 1, height);
          g.fillStyle(WALL.capLo, 1).fillRect(left + bar.x1 - 1, top + bar.y0, 1, height);
        }
      }
      // The top's south edge, where it meets the front face.
      for (const bar of bars) if (bar.y1 !== TILE || !isWallAt(map, x, y + 1)) g.fillStyle(WALL.capLo, 1).fillRect(left + bar.x0, top + bar.y1 - 1, bar.x1 - bar.x0, 1);
    }
  }
}

// Floor rectangles for the minimap: the same runs as drawFloors.
export function customMinimapFloors(map: CustomMap): MinimapFloor[] {
  return floorRuns(map).map(({ x, y, w, h, floor }) => ({ x, y, w, h, color: customFloorColor(floor) }));
}
