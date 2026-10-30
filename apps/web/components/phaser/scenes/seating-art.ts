import type Phaser from "phaser";
import type { Fabric } from "@repo/shared";
import { UPHOLSTERY } from "./office-art";

// Generated, orthographic furniture at the same world sizes as the original pixel art.
// Existing keys and the split rear sofa preserve seating, occlusion and builder previews.
const SOURCE = "office-seating-v2";
const ROOT = "/assets/custom/seating-v2";
const BACK_SPLIT = 16;

export function preloadSeatingArt(scene: Phaser.Scene) {
  scene.load.atlas(SOURCE, `${ROOT}/seating.png`, `${ROOT}/seating.json`);
}

export function makeSeatingTextures(scene: Phaser.Scene) {
  if (!scene.textures.exists(SOURCE)) return;
  const atlas = scene.textures.get(SOURCE);
  const source = atlas.getSourceImage() as HTMLImageElement;

  const canvasFor = (frameName: string, fabric?: Fabric, mirror = false, width?: number, height?: number) => {
    const frame = atlas.get(frameName);
    const canvas = document.createElement("canvas");
    canvas.width = width ?? frame.cutWidth;
    canvas.height = height ?? frame.cutHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return canvas;
    if (mirror) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(source, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight, 0, 0, canvas.width, canvas.height);
    if (fabric) {
      const target = UPHOLSTERY[fabric].base;
      const rgb = [(target >> 16) & 255, (target >> 8) & 255, target & 255];
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < pixels.data.length; i += 4) {
        const r = pixels.data[i]!, g = pixels.data[i + 1]!, b = pixels.data[i + 2]!;
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        // Tint the neutral upholstery while retaining the oak, walnut and dark metal.
        if (!pixels.data[i + 3] || luma < 72 || Math.max(r, g, b) - Math.min(r, g, b) > 38) continue;
        for (let c = 0; c < 3; c++) pixels.data[i + c] = Math.min(255, Math.round(rgb[c]! * luma / 174));
      }
      ctx.putImageData(pixels, 0, 0);
    }
    return canvas;
  };

  const install = (key: string, canvas: HTMLCanvasElement, from = 0, to = canvas.height) => {
    const crop = document.createElement("canvas");
    crop.width = canvas.width;
    crop.height = to - from;
    crop.getContext("2d")?.drawImage(canvas, 0, from, canvas.width, crop.height, 0, 0, crop.width, crop.height);
    if (scene.textures.exists(key)) scene.textures.remove(key);
    scene.textures.addCanvas(key, crop);
  };
  const rear = (key: string, canvas: HTMLCanvasElement, seatKey = `${key}-seat`) => {
    install(key, canvas, BACK_SPLIT);
    install(seatKey, canvas, 0, BACK_SPLIT);
  };

  for (const fabric of Object.keys(UPHOLSTERY) as Fabric[]) {
    for (const kind of ["sofa", "loveseat", "armchair"] as const) {
      install(`hq-${kind}-${fabric}-down`, canvasFor(`${kind}-down`, fabric));
      rear(`hq-${kind}-${fabric}-up`, canvasFor(`${kind}-up`, fabric));
    }
    for (const dir of ["down", "up", "left", "right"] as const) {
      if (dir === "left" || dir === "right") install(`hq-armchair-${fabric}-${dir}`, canvasFor(`armchair-${dir}`, fabric));
      const view = dir === "right" ? "left" : dir;
      // The same upholstered shell suits both workrooms and conference rooms.
      for (const kind of ["meet-chair", "exec-chair"]) install(`hq-${kind}-${fabric}-${dir}`, canvasFor(`meet-chair-${view}`, fabric, dir === "right"));
    }
  }
  for (const dir of ["down", "up", "left", "right"] as const) {
    const view = dir === "right" ? "left" : dir;
    install(`hq-task-chair-${dir}`, canvasFor(`task-chair-${view}`, undefined, dir === "right"));
    install(`hq-cafe-chair-${dir}`, canvasFor(`cafe-chair-${dir}`));
    install(`ref-task-dark-${dir}`, canvasFor(`task-chair-${view}`, undefined, dir === "right", 44, 48));
  }
  for (const dir of ["down", "up"] as const) {
    install(`hq-theatre-seat-${dir}`, canvasFor(`theatre-seat-${dir}`, "coral"));
    install(`campus-conf-red-${dir}`, canvasFor(`meet-chair-${dir}`, "coral", false, 34, 44));
  }
  install("office-chair", canvasFor("task-chair-up", undefined, false, 28, 36));
  install("office-chair-red", canvasFor("meet-chair-down", "coral", false, 28, 36));
  install("office-chair-red-up", canvasFor("meet-chair-up", "coral", false, 28, 36));

  // The classic office/campus lounges use the same layered sofa convention under older keys.
  for (const [color, fabric] of [["tan", "leather"], ["sage", "sage"]] as const) {
    install(`sofa-${color}-2-front`, canvasFor("loveseat-down", fabric, false, 76, 52));
    rear(`sofa-${color}-2-back-rest`, canvasFor("loveseat-up", fabric, false, 76, 46), `sofa-${color}-2-back-seat`);
  }
}
