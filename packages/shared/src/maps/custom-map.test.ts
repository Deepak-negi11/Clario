import { describe, expect, test } from "bun:test";
import { ITEM_KINDS, itemSpec } from "./catalog";
import {
  createStarterMap, customBlockedTiles, customMapSchema, customRoomAt, customSeats, floorAt, isWallAt, parseCustomMap,
  type CustomMap,
} from "./custom-map";

const starter = () => createStarterMap();
const errors = (map: unknown) => {
  const result = customMapSchema.safeParse(map);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
};

describe("the starter map", () => {
  test("is valid, with walls, a wood floor, a door and a path", () => {
    const map = starter();
    expect(errors(map)).toEqual([]);
    expect(isWallAt(map, 12, 4)).toBe(true);
    expect(floorAt(map, 20, 10)).toBe("wood");
    expect(isWallAt(map, 24, 21)).toBe(false);
    expect(floorAt(map, 24, 30)).toBe("path");
    expect(floorAt(map, 2, 2)).toBeNull();
  });

  test("a room inside another wins for the tiles it covers", () => {
    const map = starter();
    const nested = { ...map, rooms: [...map.rooms, { id: "nook", name: "Nook", bounds: { x: 14, y: 6, width: 3, height: 3 } }] };
    expect(errors(nested)).toEqual([]);
    expect(customRoomAt(nested, { x: 15, y: 7 })?.id).toBe("nook");
    expect(customRoomAt(nested, { x: 25, y: 12 })?.id).toBe("office");
  });

  test("spawns outside the front door, inside no room", () => {
    const map = starter();
    expect(customBlockedTiles(map).has(`${map.spawn.x},${map.spawn.y}`)).toBe(false);
    expect(customRoomAt(map, map.spawn)).toBeNull();
    expect(customRoomAt(map, { x: 20, y: 10 })?.id).toBe("office");
  });
});

describe("validation", () => {
  const withItems = (items: CustomMap["items"]): CustomMap => ({ ...starter(), items });

  test("accepts furniture inside the office", () => {
    expect(errors(withItems([{ kind: "sofa", x: 16, y: 8 }, { kind: "armchair", x: 15, y: 8, dir: "right", fabric: "teal" }]))).toEqual([]);
  });

  test("rejects overlapping, off-map and on-wall items", () => {
    expect(errors(withItems([{ kind: "sofa", x: 16, y: 8 }, { kind: "coffee-table", x: 17, y: 8 }])).join()).toContain("overlaps");
    expect(errors(withItems([{ kind: "house", x: 46, y: 2 }])).join()).toContain("off the map");
    expect(errors(withItems([{ kind: "plant-big", x: 12, y: 4 }])).join()).toContain("on a wall");
  });

  test("rejects a facing the item has no art for, and fabric on hard furniture", () => {
    expect(errors(withItems([{ kind: "sofa", x: 16, y: 8, dir: "left" }])).join()).toContain("can't face left");
    expect(errors(withItems([{ kind: "desk-l", x: 16, y: 8, fabric: "navy" }])).join()).toContain("has no fabric");
  });

  test("rejects overlapping rooms, a blocked spawn and ragged rows", () => {
    const map = starter();
    expect(errors({ ...map, rooms: [...map.rooms, { id: "porch", name: "Porch", bounds: { x: 30, y: 18, width: 10, height: 6 } }] }).join()).toContain("overlap");
    expect(errors({ ...map, rooms: [...map.rooms, { id: "twin", name: "Twin", bounds: { ...map.rooms[0]!.bounds } }] }).join()).toContain("overlap");
    expect(errors({ ...map, spawn: { x: 12, y: 4 } }).join()).toContain("spawn");
    expect(errors({ ...map, floor: [...map.floor.slice(1), "w"] }).join()).toContain("floor must have");
  });

  test("parseCustomMap returns null for anything that isn't a valid map", () => {
    expect(parseCustomMap(null)).toBeNull();
    expect(parseCustomMap({ ...starter(), version: 2 })).toBeNull();
    expect(parseCustomMap(JSON.parse(JSON.stringify(starter())))).not.toBeNull();
  });
});

describe("tiles", () => {
  test("seats are walkable and remember which way they face", () => {
    const map: CustomMap = { ...starter(), items: [{ kind: "sofa", x: 16, y: 8, dir: "up" }, { kind: "desk-l", x: 16, y: 6 }] };
    const blocked = customBlockedTiles(map);
    expect(blocked.has("16,8")).toBe(false);
    expect(blocked.has("17,6")).toBe(true);
    expect(customSeats(map).get("18,8")).toBe("up");
  });

  test("every catalogue item fits the starter office and has a label", () => {
    for (const kind of ITEM_KINDS) {
      const spec = itemSpec(kind);
      expect(spec.label.length).toBeGreaterThan(1);
      expect(errors({ ...starter(), items: [{ kind, x: 13, y: 5 }] })).toEqual(spec.w <= 22 && spec.h <= 16 ? [] : expect.anything());
    }
  });
});
