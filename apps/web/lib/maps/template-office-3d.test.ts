import { expect, test } from "bun:test";
import { customSeats, getMapTemplate } from "@repo/shared";
import { templateOffice3d } from "./template-office-3d";
import type { SceneMapInfo } from "../../components/phaser/scene-bridge";

const info: SceneMapInfo = { cols: 52, rows: 38, walls: ["3,8", "4,8", "3,9"], blocked: ["8,12"],
  floors: [{ x: 3, y: 8, w: 46, h: 27, color: 0xe9dcc0 }, { x: 4, y: 9, w: 11, h: 8, color: 0xc3d7ca }] };

test("WebGL preserves the live map's walls, floor boundaries, rooms and spawn", () => {
  const map = templateOffice3d("coworking-campus", info)!;
  expect(map.walls[8]![3]).toBe("#"); expect(map.walls[8]![5]).toBe(".");
  expect(map.floor[8]![4]).toBe("w"); expect(map.floor[9]![4]).toBe("s");
  expect(map.floor[7]![4]).toBe(".");
  expect(map.rooms).toHaveLength(getMapTemplate("coworking-campus").chatRooms.length);
  expect(map.spawn).toEqual(getMapTemplate("coworking-campus").spawn);
});

test("legacy lounges and pond chairs keep their 2D seating tiles and directions", () => {
  const classic = customSeats(templateOffice3d("classic-office", info)!);
  const campus = customSeats(templateOffice3d("coworking-campus", info)!);
  expect(classic.get("26,13")).toBe("down");
  expect(classic.get("24,17")).toBe("up");
  expect(campus.get("25,21")).toBe("down");
  expect(campus.get("22,3")).toBe("right");
  expect(campus.get("29,3")).toBe("left");
});

test("HQ and saved custom layouts keep their own builders", () => {
  expect(templateOffice3d("classic-office", null)).toBeNull();
  expect(templateOffice3d("clario-hq", info)).toBeNull();
  expect(templateOffice3d("clario-hq-3d", info)).toBeNull();
  expect(templateOffice3d("custom-office", info)).toBeNull();
});
