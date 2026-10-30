import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { sprite } from "./raster-sprite.mjs";

// Pack the generated artwork at its actual world size. Area sampling uses premultiplied
// alpha so transparent edges cannot leave pale fringes on dark office floors.
const root = new URL("./", import.meta.url);
const output = new URL("../../apps/web/public/assets/custom/seating-v2/", root);
const entries = [];


function add(name, file, columns, rows, column, row, width, height) {
  entries.push({ name, png: sprite(file, columns, rows, column, row, width, height) });
}

for (const [row, name, width] of [[0, "sofa", 96], [1, "loveseat", 68]]) {
  add(`${name}-down`, "sofas", 2, 2, 0, row, width, 52);
  add(`${name}-up`, "sofas", 2, 2, 1, row, width, 46);
}
for (const [i, dir] of ["down", "up", "left", "right"].entries()) {
  add(`armchair-${dir}`, "armchairs", 2, 2, i % 2, Math.floor(i / 2), 40, dir === "up" ? 46 : 52);
  add(`cafe-chair-${dir}`, "cafe-chairs", 2, 2, i % 2, Math.floor(i / 2), 32, 44);
}
for (const [row, kind, height] of [[0, "task-chair", 48], [1, "meet-chair", 44], [2, "theatre-seat", 40]]) {
  for (const [column, dir] of ["down", "up", "left"].entries()) add(`${kind}-${dir}`, "office-chairs", 3, 3, column, row, 32, height);
}

const atlas = new PNG({ width: 512, height: 208 });
const frames = {}; let x = 1, y = 1, lineHeight = 0;
for (const { name, png } of entries) {
  if (x + png.width + 1 > atlas.width) { x = 1; y += lineHeight + 2; lineHeight = 0; }
  if (y + png.height >= atlas.height) throw new Error("Atlas overflow");
  PNG.bitblt(png, atlas, 0, 0, png.width, png.height, x, y);
  frames[name] = { frame: { x, y, w: png.width, h: png.height }, rotated: false, trimmed: false, sourceSize: { w: png.width, h: png.height }, spriteSourceSize: { x: 0, y: 0, w: png.width, h: png.height } };
  x += png.width + 2; lineHeight = Math.max(lineHeight, png.height);
}
writeFileSync(new URL("seating.png", output), PNG.sync.write(atlas));
writeFileSync(new URL("seating.json", output), JSON.stringify({ frames, meta: { image: "seating.png", size: { w: atlas.width, h: atlas.height }, scale: "1" } }, null, 2) + "\n");
console.log(`Packed ${entries.length} seating views into ${fileURLToPath(new URL("seating.png", output))}`);
