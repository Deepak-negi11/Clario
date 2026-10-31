import { FLOOR_CODES, getMapTemplate, type CustomFloor, type CustomMap, type CustomMapItem, type Fabric, type MapTemplateId } from "@repo/shared";
import type { SceneMapInfo } from "../../components/phaser/scene-bridge";
import { CAMPUS_ITEMS, CLASSIC_OFFICE_ITEMS } from "./classic-campus";

// The 2D scene publishes its exact wall tiles and floor regions. Reuse them for the two
// older templates, so opening WebGL keeps the same rooms, doors and furniture positions.
const FLOORS = new Map<number, CustomFloor>([
  [0xe9dcc0, "wood"], [0xb6bedc, "office"], [0xc3d7ca, "sage"], [0xdbcaad, "sand"], [0xe5e0d2, "tile"], [0xcfc9bd, "path"],
]);

function lounge(ox: number, oy: number, fabric: Fabric, beanbags: Fabric[]): CustomMapItem[] {
  return [
    { kind: "loveseat", x: ox + 4, y: oy + 2, fabric, dir: "down" },
    { kind: "loveseat", x: ox + 2, y: oy + 6, fabric, dir: "up" },
    { kind: "loveseat", x: ox + 6, y: oy + 6, fabric, dir: "up" },
    { kind: "coffee-table", x: ox + 4, y: oy + 4 },
    { kind: "cube-shelf", x: ox + 1, y: oy }, { kind: "cube-shelf", x: ox + 7, y: oy },
    { kind: "side-table", x: ox + 3, y: oy + 2 }, { kind: "side-table", x: ox + 6, y: oy + 2, variant: 2 },
    { kind: "side-table", x: ox + 8, y: oy + 6 },
    { kind: "plant-big", x: ox, y: oy + 1 }, { kind: "plant-big", x: ox + 9, y: oy + 1 },
    { kind: "plant-tall", x: ox + 1, y: oy + 6 },
    ...[[2, 3], [2, 4], [7, 3], [7, 4]].map(([x, y], i): CustomMapItem => ({ kind: "beanbag", x: ox + x!, y: oy + y!, fabric: beanbags[i]!, dir: i < 2 ? "right" : "left" })),
  ];
}

export function templateOffice3d(templateId: MapTemplateId, info: SceneMapInfo | null): CustomMap | null {
  if (!info || (templateId !== "classic-office" && templateId !== "coworking-campus")) return null;
  const template = getMapTemplate(templateId), { cols, rows } = info;
  const floor = Array.from({ length: rows }, () => Array<string>(cols).fill("."));
  const walls = Array.from({ length: rows }, () => Array<string>(cols).fill("."));
  for (const region of info.floors) {
    const code = FLOOR_CODES[FLOORS.get(region.color) ?? "wood"];
    for (let y = Math.max(0, Math.floor(region.y)); y < Math.min(rows, region.y + region.h); y++) {
      for (let x = Math.max(0, Math.floor(region.x)); x < Math.min(cols, region.x + region.w); x++) floor[y]![x] = code;
    }
  }
  for (const tile of info.walls) {
    const [x, y] = tile.split(",").map(Number);
    if (x !== undefined && y !== undefined && walls[y]?.[x] !== undefined) walls[y]![x] = "#";
  }
  const campus = templateId === "coworking-campus";
  const items: CustomMapItem[] = [...(campus ? CAMPUS_ITEMS : CLASSIC_OFFICE_ITEMS), ...lounge(campus ? 21 : 22, campus ? 19 : 11,
    campus ? "sage" : "leather", campus ? ["purple", "blue", "pink", "purple"] : ["blue", "pink", "purple", "blue"])];
  if (campus) items.push({ kind: "pond", x: 24, y: 2 },
    { kind: "cafe-chair", x: 22, y: 3, dir: "right" }, { kind: "cafe-chair", x: 29, y: 3, dir: "left" },
    { kind: "cafe-chair", x: 24, y: 6, dir: "up" }, { kind: "cafe-chair", x: 27, y: 6, dir: "up" });
  return { version: 1, cols, rows, floor: floor.map((row) => row.join("")), walls: walls.map((row) => row.join("")),
    items, rooms: template.chatRooms.map(({ id, name, bounds }) => ({ id, name, bounds })), spawn: template.spawn };
}
