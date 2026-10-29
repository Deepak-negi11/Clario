import Phaser from "phaser";
import { floorAt, isWallAt, type CustomFloor, type CustomMap } from "@repo/shared";
import type { MinimapFloor } from "../scene-bridge";
import { HQ_FLOOR_COLORS, placeItems, type HqSceneApi } from "./clario-hq-builder";

// Draws a map someone built in the map builder: floors, walls, and everything placed on it.
// The furniture art is Clario HQ's (clario-hq-builder.ts), so both maps look alike.

const TILE = 32;
// A wall's top sits this far above its tile, and its front face shows below that, so a row of
// wall tiles reads as a wall standing up rather than a stripe on the floor.
const WALL_LIFT = 14;
const WALL = { cap: 0x4a4f5e, capHi: 0x60667a, capLo: 0x2f333e, face: 0xe4e8ef, faceShade: 0xd6dbe4, base: 0x6f7686 };
const PATH_COLOR = 0xcfc9bd;

export function customFloorColor(floor: CustomFloor) {
  return floor === "path" ? PATH_COLOR : HQ_FLOOR_COLORS[floor];
}

export function buildCustomMap(scene: Phaser.Scene, map: CustomMap, api: HqSceneApi) {
  drawFloors(scene, map);
  drawWalls(scene, map, api);
  placeItems(scene, api, map.items);
}

// Floors in runs of one kind along each row, so a big room is a handful of sprites. The texture
// offset follows the tile position so patterns line up from one run to the next.
function drawFloors(scene: Phaser.Scene, map: CustomMap) {
  for (let y = 0; y < map.rows; y++) {
    for (let x = 0; x < map.cols;) {
      const floor = floorAt(map, x, y);
      let end = x + 1;
      while (end < map.cols && floorAt(map, end, y) === floor) end++;
      if (floor) {
        scene.add.tileSprite(x * TILE, y * TILE, (end - x) * TILE, TILE, floor === "path" ? "hq-path" : `hq-floor-${floor}`)
          .setOrigin(0, 0).setTilePosition(x * TILE, y * TILE).setDepth(-998);
      }
      x = end;
    }
  }
}

// One graphics object per row of walls, at that row's depth, so people north of a wall stand
// behind it and people south of it in front.
function drawWalls(scene: Phaser.Scene, map: CustomMap, api: HqSceneApi) {
  const shadow = scene.add.graphics().setDepth(-984);
  for (let y = 0; y < map.rows; y++) {
    let g: Phaser.GameObjects.Graphics | null = null;
    for (let x = 0; x < map.cols; x++) {
      if (!isWallAt(map, x, y)) continue;
      api.wall(x, y);
      g ??= scene.add.graphics().setDepth((y + 1) * TILE);
      const left = x * TILE, top = y * TILE - WALL_LIFT;
      if (!isWallAt(map, x, y + 1)) {
        g.fillStyle(WALL.face, 1).fillRect(left, top + TILE, TILE, WALL_LIFT);
        g.fillStyle(WALL.faceShade, 1).fillRect(left, top + TILE, TILE, 3);
        g.fillStyle(WALL.base, 1).fillRect(left, top + TILE + WALL_LIFT - 3, TILE, 3);
        shadow.fillStyle(0x1b2130, 0.14).fillRect(left, (y + 1) * TILE, TILE, 6);
      }
      g.fillStyle(WALL.cap, 1).fillRect(left, top, TILE, TILE);
      if (!isWallAt(map, x, y - 1)) g.fillStyle(WALL.capHi, 1).fillRect(left, top, TILE, 3);
      if (!isWallAt(map, x - 1, y)) g.fillStyle(WALL.capLo, 1).fillRect(left, top, 2, TILE);
      if (!isWallAt(map, x + 1, y)) g.fillStyle(WALL.capLo, 1).fillRect(left + TILE - 2, top, 2, TILE);
    }
  }
}

// Floor rectangles for the minimap: the same runs as drawFloors.
export function customMinimapFloors(map: CustomMap): MinimapFloor[] {
  const floors: MinimapFloor[] = [];
  for (let y = 0; y < map.rows; y++) {
    for (let x = 0; x < map.cols;) {
      const floor = floorAt(map, x, y);
      let end = x + 1;
      while (end < map.cols && floorAt(map, end, y) === floor) end++;
      if (floor) floors.push({ x, y, w: end - x, h: 1, color: customFloorColor(floor) });
      x = end;
    }
  }
  return floors;
}
