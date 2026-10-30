import { describe, expect, test } from "bun:test";
import { createStarterMap, customBlockedTiles, customMapSchema, floorAt, isWallAt, type CustomMap } from "./custom-map";
import { addRoom, eraseAt, paintFloor, placeItem, placementProblem, removeRoom, renameRoom, setSpawn, setWall, type EditResult } from "./custom-map-edits";

const ok = (result: EditResult): CustomMap => {
  if ("error" in result) throw new Error(result.error);
  expect(customMapSchema.safeParse(result.map).success).toBe(true);
  return result.map;
};

describe("map builder edits", () => {
  test("places furniture with its facing and fabric, and refuses overlaps", () => {
    let map = ok(placeItem(createStarterMap(), "sofa", 16, 8, "up", "coral"));
    expect(map.items[0]).toEqual({ kind: "sofa", x: 16, y: 8, dir: "up", fabric: "coral" });
    expect(placeItem(map, "coffee-table", 17, 8)).toEqual({ error: "Sofa is in the way" });
    map = ok(placeItem(map, "coffee-table", 16, 7));
    expect(map.items).toHaveLength(2);
  });

  test("drops a facing or fabric the item doesn't support", () => {
    const map = ok(placeItem(createStarterMap(), "desk-l", 16, 8, "left", "navy"));
    expect(map.items[0]).toEqual({ kind: "desk-l", x: 16, y: 8 });
  });

  test("refuses walls, the map edge and the spawn tile", () => {
    const map = ok(setWall(createStarterMap(), 12, 4, true));
    expect(placementProblem(map, { kind: "plant-big", x: 12, y: 4 })).toBe("There's a wall in the way");
    expect(placementProblem(map, { kind: "office-block", x: 45, y: 30 })).toBe("That goes off the edge of the map");
    expect(placementProblem(map, { kind: "bush", ...map.spawn })).toContain("spawn");
    expect(placementProblem(map, { kind: "bench", ...map.spawn })).toBeNull();
  });

  test("erases furniture before walls, and walls make doors", () => {
    let map = ok(placeItem(createStarterMap(), "plant-big", 14, 6));
    map = ok(eraseAt(map, 14, 6));
    expect(map.items).toHaveLength(0);
    map = ok(eraseAt(ok(setWall(map, 12, 10, true)), 12, 10));
    expect(isWallAt(map, 12, 10)).toBe(false);
    expect(eraseAt(map, 2, 2)).toEqual({ error: "Nothing to remove here" });
  });

  test("builds walls only on free tiles", () => {
    const map = ok(placeItem(createStarterMap(), "plant-big", 14, 6));
    expect(setWall(map, 14, 6, true)).toEqual({ error: "Move the furniture before building a wall here" });
    expect(isWallAt(ok(setWall(map, 15, 6, true)), 15, 6)).toBe(true);
  });

  test("paints floors and grass", () => {
    let map = ok(paintFloor(createStarterMap(), 2, 2, "concrete"));
    expect(floorAt(map, 2, 2)).toBe("concrete");
    map = ok(paintFloor(map, 2, 2, null));
    expect(floorAt(map, 2, 2)).toBeNull();
  });

  test("moves the spawn only to a tile people can stand on", () => {
    const map = ok(setWall(createStarterMap(), 12, 4, true));
    expect(setSpawn(map, 12, 4)).toEqual({ error: "People can't stand there" });
    expect(ok(setSpawn(map, 20, 10)).spawn).toEqual({ x: 20, y: 10 });
  });

  test("adds, renames and removes rooms without overlaps", () => {
    let map = ok(removeRoom(createStarterMap(), "office"));
    map = ok(addRoom(map, "Meeting Room", { x: 20, y: 10 }, { x: 14, y: 6 }));
    expect(map.rooms[0]).toEqual({ id: "meeting-room", name: "Meeting Room", bounds: { x: 14, y: 6, width: 7, height: 5 } });
    expect(addRoom(map, "Nook", { x: 19, y: 9 }, { x: 22, y: 12 })).toEqual({ error: "That overlaps Meeting Room" });
    expect("map" in addRoom(map, "Nook", { x: 15, y: 7 }, { x: 16, y: 8 })).toBe(true);
    map = ok(addRoom(map, "Meeting Room", { x: 25, y: 6 }, { x: 28, y: 8 }));
    expect(map.rooms[1]!.id).toBe("meeting-room-2");
    expect(ok(renameRoom(map, "meeting-room", "Boardroom")).rooms[0]!.name).toBe("Boardroom");
    expect(addRoom(map, "   ", { x: 1, y: 1 }, { x: 2, y: 2 })).toEqual({ error: "Give the room a name" });
  });
});

describe("rugs and flowers", () => {
  test("lie under furniture, which can stand on them, and erase after it", () => {
    let map = ok(placeItem(createStarterMap(), "rug", 15, 7, undefined, undefined, 3));
    expect(map.items[0]).toEqual({ kind: "rug", x: 15, y: 7, variant: 3 });
    map = ok(placeItem(map, "sofa", 15, 8, "up", "sage"));
    expect(placeItem(map, "rug-round", 16, 8)).toEqual({ error: "Rug is in the way" });
    map = ok(eraseAt(map, 16, 8));
    expect(map.items.map((item) => item.kind)).toEqual(["rug"]);
  });

  test("don't block walking or the spawn, and drop a look the piece doesn't have", () => {
    const start = createStarterMap();
    const map = ok(placeItem(start, "flower", start.spawn.x, start.spawn.y, undefined, undefined, 9));
    expect(map.items[0]).toEqual({ kind: "flower", ...start.spawn });
    expect(customBlockedTiles(map).has(`${start.spawn.x},${start.spawn.y}`)).toBe(false);
  });
});
