import { writeFileSync } from "node:fs";
import { PNG } from "pngjs";
import { sprite } from "./raster-sprite.mjs";

const output = new URL("../../apps/web/public/assets/custom/office-props-v2/", import.meta.url);
const entries = [];
const add = (name, file, columns, column, width, height, opts = {}) => {
  entries.push({ name, png: sprite(file, columns, 1, column, 0, width, height, { maxChroma: 256, ...opts }) });
};
add("hq-vending-machine", "vending", 1, 0, 32, 84);
add("hq-bookshelf-0", "bookshelves", 2, 0, 64, 92);
add("hq-bookshelf-1", "bookshelves", 2, 1, 64, 92);
// The wide side profile uses the left half of the source, then front and rear views.
for (const [view, region, width, height] of [
  ["side", [0, 0, 0.515, 1], 44, 32],
  ["front", [0.52, 0, 0.22, 1], 28, 40],
  ["back", [0.76, 0, 0.24, 1], 28, 40],
]) {
  const orange = sprite("bicycles", 1, 1, 0, 0, width, height, { region, maxChroma: 256 });
  const teal = new PNG({ width, height }); orange.data.copy(teal.data);
  for (let i = 0; i < teal.data.length; i += 4) {
    const r = teal.data[i], g = teal.data[i + 1], b = teal.data[i + 2];
    if (!teal.data[i + 3] || r < 1.2 * g || g < 1.3 * b || r - b < 45) continue;
    const light = r / 242;
    teal.data[i] = Math.round(47 * light);
    teal.data[i + 1] = Math.min(255, Math.round(179 * light));
    teal.data[i + 2] = Math.min(255, Math.round(166 * light));
  }
  entries.push({ name: `hq-ride-orange-${view}`, png: orange }, { name: `hq-ride-teal-${view}`, png: teal });
}

const atlas = new PNG({ width: 256, height: 144 });
const frames = {}; let x = 1, y = 1, lineHeight = 0;
for (const { name, png } of entries) {
  if (x + png.width + 1 > atlas.width) { x = 1; y += lineHeight + 2; lineHeight = 0; }
  if (y + png.height >= atlas.height) throw new Error("Props atlas overflow");
  PNG.bitblt(png, atlas, 0, 0, png.width, png.height, x, y);
  frames[name] = { frame: { x, y, w: png.width, h: png.height }, rotated: false, trimmed: false, sourceSize: { w: png.width, h: png.height }, spriteSourceSize: { x: 0, y: 0, w: png.width, h: png.height } };
  x += png.width + 2; lineHeight = Math.max(lineHeight, png.height);
}
writeFileSync(new URL("props.png", output), PNG.sync.write(atlas));
writeFileSync(new URL("props.json", output), JSON.stringify({ frames, meta: { image: "props.png", size: { w: atlas.width, h: atlas.height }, scale: "1" } }, null, 2) + "\n");
console.log(`Packed ${entries.length} office prop views`);
