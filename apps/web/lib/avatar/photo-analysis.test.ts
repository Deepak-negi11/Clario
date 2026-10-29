import { describe, expect, test } from "bun:test";
import { lookFromDetection, type Landmark } from "./photo-analysis";

// Drawn "photos": a 200x300 picture with a face box from x 70 to 130 and y 80 to 160 (60 wide,
// 80 tall), a shirt below it, and hair drawn per test. Landmarks sit where a real face's would.
const W = 200;
const H = 300;
const SKIN: [number, number, number] = [224, 172, 105];
const HAIR: [number, number, number] = [43, 35, 33];
const SHIRT: [number, number, number] = [63, 111, 216];
const DARK: [number, number, number] = [25, 25, 30];

const POINTS: Record<number, [number, number]> = {
  10: [100, 80], 152: [100, 160], 234: [70, 115], 454: [130, 115],
  105: [85, 96], 334: [115, 96],
  33: [78, 104], 133: [92, 104], 159: [85, 101], 145: [85, 107],
  263: [122, 104], 362: [108, 104], 386: [115, 101], 374: [115, 107],
  6: [100, 110], 2: [100, 128], 0: [100, 134], 17: [100, 144], 61: [90, 139], 291: [110, 139],
  50: [82, 122], 280: [118, 122], 151: [100, 88],
};

function photo() {
  const data = new Uint8ClampedArray(W * H * 4).fill(221);
  const hair = new Uint8Array(W * H);
  const fill = (x0: number, x1: number, y0: number, y1: number, [r, g, b]: [number, number, number], isHair = false) => {
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * W + x) * 4;
        [data[i], data[i + 1], data[i + 2], data[i + 3]] = [r, g, b, 255];
        hair[y * W + x] = isHair ? 1 : 0;
      }
    }
  };
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  fill(70, 130, 75, 162, SKIN);
  fill(90, 110, 160, 175, SKIN);
  fill(40, 160, 175, 300, SHIRT);
  const landmarks: Landmark[] = Array.from({ length: 478 }, (_, index) => {
    const [x, y] = POINTS[index] ?? [100, 120];
    return { x: x / W, y: y / H };
  });
  return {
    fill,
    hairBox: (x0: number, x1: number, y0: number, y1: number) => fill(x0, x1, y0, y1, HAIR, true),
    read: () => lookFromDetection({ data, width: W, height: H, landmarks, hair }),
  };
}

const hex = ([r, g, b]: [number, number, number]) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;

describe("lookFromDetection", () => {
  test("reads skin, hair and clothes colours, and short hair", () => {
    const p = photo();
    p.hairBox(66, 134, 55, 80);
    expect(p.read()).toEqual({ skin: hex(SKIN), hair: hex(HAIR), top: hex(SHIRT), style: "bob", hairShape: null, glasses: false, beard: false });
  });

  test("a face lit from one side reads as its mid tone, not the lit or the shaded side", () => {
    const p = photo();
    p.hairBox(66, 134, 55, 80);
    p.fill(70, 90, 75, 162, [240, 190, 150]);
    p.fill(90, 110, 75, 162, [190, 130, 100]);
    p.fill(110, 130, 75, 162, [150, 95, 70]);
    expect(p.read()?.skin).toBe(hex([190, 130, 100]));
  });

  test("no hair above the head is a shaved head", () => {
    const look = photo().read();
    expect(look?.hairShape).toBe("bald");
    expect(look?.hair).toBeNull();
  });

  test("hair hanging beside the chin is long hair", () => {
    const p = photo();
    p.hairBox(66, 134, 55, 80);
    p.hairBox(50, 70, 80, 220);
    p.hairBox(130, 150, 80, 220);
    expect(p.read()?.style).toBe("amelia");
  });

  test("hair much wider than the face and high above it is curly", () => {
    const p = photo();
    p.hairBox(35, 165, 40, 80);
    p.hairBox(35, 70, 80, 100);
    p.hairBox(130, 165, 80, 100);
    expect(p.read()).toMatchObject({ style: "bob", hairShape: "curly" });
  });

  test("hair over the forehead is a fringe, and hair rising high is big hair", () => {
    const fringe = photo();
    fringe.hairBox(66, 134, 55, 80);
    fringe.hairBox(72, 128, 80, 95);
    expect(fringe.read()?.style).toBe("alex");

    const big = photo();
    big.hairBox(66, 134, 30, 80);
    expect(big.read()?.style).toBe("adam");
  });

  test("a dark bridge between the eyes and rims under them are glasses", () => {
    const p = photo();
    p.hairBox(66, 134, 55, 80);
    p.fill(96, 104, 103, 109, DARK);
    p.fill(78, 92, 109, 111, DARK);
    p.fill(108, 122, 109, 111, DARK);
    expect(p.read()?.glasses).toBe(true);
  });

  test("a bridge alone, like a shadow, is not glasses", () => {
    const p = photo();
    p.hairBox(66, 134, 55, 80);
    p.fill(96, 104, 103, 109, DARK);
    expect(p.read()?.glasses).toBe(false);
  });

  test("hair over the chin is a beard", () => {
    const p = photo();
    p.hairBox(66, 134, 55, 80);
    p.hairBox(88, 112, 146, 159);
    expect(p.read()?.beard).toBe(true);
  });

  test("no face landmarks, no look", () => {
    expect(lookFromDetection({ data: new Uint8ClampedArray(16), width: 2, height: 2, landmarks: [], hair: new Uint8Array(4) })).toBeNull();
  });
});
