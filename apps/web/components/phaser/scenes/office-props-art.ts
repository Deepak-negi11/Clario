import type Phaser from "phaser";
import { BIKES } from "@repo/shared";
import { BIKE_SIDE_HUB, RACK_SIZE, RACK_SLOTS } from "./reference-art";

const SOURCE = "office-props-v2";
const ROOT = "/assets/custom/office-props-v2";

// Center of a can resting inside the generated machine's pickup opening, above its feet.
export const vendingPickupOffset = (scene: Phaser.Scene) => scene.textures.exists(SOURCE) ? 12 : 18;
export const vendingPickupScale = (scene: Phaser.Scene) => scene.textures.exists(SOURCE) ? 0.28 : 0.6;

export function preloadOfficePropsArt(scene: Phaser.Scene) {
  scene.load.atlas(SOURCE, `${ROOT}/props.png`, `${ROOT}/props.json`);
}

// Keep the original texture keys, dimensions and anchors: the prop interaction code and
// map-builder previews then use the same artwork as the furniture placed on the map.
export function makeOfficePropTextures(scene: Phaser.Scene) {
  if (!scene.textures.exists(SOURCE)) return;
  const atlas = scene.textures.get(SOURCE);
  const source = atlas.getSourceImage() as HTMLImageElement;
  for (const key of atlas.getFrameNames()) {
    const frame = atlas.get(key);
    const canvas = document.createElement("canvas");
    canvas.width = frame.cutWidth;
    canvas.height = frame.cutHeight;
    canvas.getContext("2d")?.drawImage(source, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight, 0, 0, canvas.width, canvas.height);
    if (scene.textures.exists(key)) scene.textures.remove(key);
    scene.textures.addCanvas(key, canvas);
  }

  // A rack placed from the builder can have fixed bikes. The interactive rack places its
  // bikes separately in props-on-map.ts; use the very same hub coordinates here.
  if (!scene.textures.exists("hq-bike-rack-empty")) return;
  const rack = document.createElement("canvas");
  rack.width = RACK_SIZE.w * 2;
  rack.height = RACK_SIZE.h * 2;
  const ctx = rack.getContext("2d");
  if (!ctx) return;
  ctx.drawImage(scene.textures.get("hq-bike-rack-empty").getSourceImage() as HTMLCanvasElement, 0, 0);
  for (const bike of BIKES) {
    const slot = RACK_SLOTS[bike];
    ctx.drawImage(scene.textures.get(`hq-ride-${bike}-side`).getSourceImage() as HTMLCanvasElement, (slot.x - BIKE_SIDE_HUB.x) * 2, (slot.y - BIKE_SIDE_HUB.y) * 2);
  }
  if (scene.textures.exists("hq-bike-rack")) scene.textures.remove("hq-bike-rack");
  scene.textures.addCanvas("hq-bike-rack", rack);
}
