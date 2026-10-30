import { describe, expect, test } from "bun:test";
import { FACE_POINTS, affineFrom, parseAvatarLook } from "./avatar-look";

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

  test("keeps a hair shape, and rejects unknown ones", () => {
    expect(parseAvatarLook({ ...look, hairShape: "curly" })?.hairShape).toBe("curly");
    expect(parseAvatarLook(look)?.hairShape).toBeUndefined();
    expect(parseAvatarLook({ ...look, hairShape: "mohawk" })).toBeNull();
  });

  test("rejects unknown characters, bad colours and broken JSON", () => {
    expect(parseAvatarLook({ ...look, base: "zelda" })).toBeNull();
    expect(parseAvatarLook({ ...look, hair: "brown" })).toBeNull();
    expect(parseAvatarLook({ ...look, top: "#12345" })).toBeNull();
    expect(parseAvatarLook("{not json")).toBeNull();
    expect(parseAvatarLook(null)).toBeNull();
  });
});

describe("photo face", () => {
  const look = { base: "adam", skin: "#ffd9c2", hair: "#2b2321", top: "#805e8e" } as const;

  test("keeps a small JPEG face", () => {
    const face = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
    expect(parseAvatarLook({ ...look, face })?.face).toBe(face);
  });

  test("turns down anything else as a face", () => {
    expect(parseAvatarLook({ ...look, face: "https://example.com/me.jpg" })).toBeNull();
    expect(parseAvatarLook({ ...look, face: "data:image/svg+xml;base64,PHN2Zz4=" })).toBeNull();
    expect(parseAvatarLook({ ...look, face: `data:image/jpeg;base64,${"A".repeat(50_000)}` })).toBeNull();
  });
});

describe("affineFrom", () => {
  test("moves three points exactly onto three others", () => {
    const from = [{ x: 10, y: 20 }, { x: 60, y: 25 }, { x: 33, y: 80 }] as const;
    const to = [FACE_POINTS.leftEye, FACE_POINTS.rightEye, FACE_POINTS.mouth] as const;
    const [a, b, c, d, e, f] = affineFrom(from, to)!;
    from.forEach((point, i) => {
      expect(a * point.x + c * point.y + e).toBeCloseTo(to[i]!.x, 6);
      expect(b * point.x + d * point.y + f).toBeCloseTo(to[i]!.y, 6);
    });
  });

  test("gives up on points in a line", () => {
    expect(affineFrom([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }], [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }])).toBeNull();
  });
});
