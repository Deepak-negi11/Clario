import { describe, expect, test } from "bun:test";
import { parseAvatarLook } from "./avatar-look";

const look = { base: "amelia", skin: "#C68E6E", hair: "#3b2a20", top: "#2f5fb3" } as const;

describe("parseAvatarLook", () => {
  test("accepts an object and lowercases colours", () => {
    expect(parseAvatarLook(look)).toEqual({ ...look, skin: "#c68e6e" });
  });

  test("accepts the JSON text stored in the database", () => {
    expect(parseAvatarLook(JSON.stringify(look))?.base).toBe("amelia");
  });

  test("keeps face details, and accepts looks saved without them", () => {
    expect(parseAvatarLook({ ...look, glasses: true, beard: false })).toMatchObject({ glasses: true, beard: false });
    expect(parseAvatarLook(look)?.glasses).toBeUndefined();
    expect(parseAvatarLook({ ...look, glasses: "yes" })).toBeNull();
  });

  test("rejects unknown characters, bad colours and broken JSON", () => {
    expect(parseAvatarLook({ ...look, base: "zelda" })).toBeNull();
    expect(parseAvatarLook({ ...look, hair: "brown" })).toBeNull();
    expect(parseAvatarLook({ ...look, top: "#12345" })).toBeNull();
    expect(parseAvatarLook("{not json")).toBeNull();
    expect(parseAvatarLook(null)).toBeNull();
  });
});
