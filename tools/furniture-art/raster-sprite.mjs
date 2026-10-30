import { readFileSync } from "node:fs";
import { PNG } from "pngjs";

// Crop isolated generated sprites and area-sample with premultiplied alpha.
const root = new URL("./", import.meta.url);
const sheets = new Map();

export function sprite(file, columns, rows, column, row, width, height, opts = {}) {
  if (!sheets.has(file)) sheets.set(file, PNG.sync.read(readFileSync(new URL(`source/${file}.png`, root))));
  const sheet = sheets.get(file);
  const [rx, ry, rw, rh] = opts.region ?? [column / columns, row / rows, 1 / columns, 1 / rows];
  const left = Math.round(rx * sheet.width);
  const top = Math.round(ry * sheet.height);
  const cw = Math.round((rx + rw) * sheet.width) - left;
  const ch = Math.round((ry + rh) * sheet.height) - top;
  const mask = new Uint8Array(cw * ch);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const i = ((y + top) * sheet.width + x + left) * 4;
    const rgb = sheet.data.subarray(i, i + 3);
    // Reject detached generation specks and highly saturated matte debris.
    mask[y * cw + x] = Number(sheet.data[i + 3] >= 180 && Math.max(...rgb) - Math.min(...rgb) < (opts.maxChroma ?? 170));
  }
  const seen = new Uint8Array(mask.length);
  let largest = [];
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p] || seen[p]) continue;
    const component = [p];
    seen[p] = 1;
    for (let n = 0; n < component.length; n++) {
      const at = component[n], x = at % cw, y = Math.floor(at / cw);
      for (const next of [x > 0 ? at - 1 : -1, x + 1 < cw ? at + 1 : -1, y > 0 ? at - cw : -1, y + 1 < ch ? at + cw : -1]) {
        if (next >= 0 && mask[next] && !seen[next]) { seen[next] = 1; component.push(next); }
      }
    }
    if (component.length > largest.length) largest = component;
  }
  if (largest.length < 1000) throw new Error(`Missing sprite: ${file} ${column},${row}`);
  mask.fill(0);
  let x0 = cw, y0 = ch, x1 = 0, y1 = 0;
  for (const p of largest) {
    mask[p] = 1;
    const x = p % cw, y = Math.floor(p / cw);
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  const sourceW = x1 - x0 + 1, sourceH = y1 - y0 + 1;
  const scale = Math.min((width - 2) / sourceW, (height - 2) / sourceH);
  const dw = Math.round(sourceW * scale), dh = Math.round(sourceH * scale);
  const dx = Math.floor((width - dw) / 2), dy = height - dh - 1;
  const png = new PNG({ width, height });
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    const sx0 = x0 + x * sourceW / dw, sx1 = x0 + (x + 1) * sourceW / dw;
    const sy0 = y0 + y * sourceH / dh, sy1 = y0 + (y + 1) * sourceH / dh;
    const sum = [0, 0, 0]; let alpha = 0;
    for (let sy = Math.floor(sy0); sy < Math.ceil(sy1); sy++) for (let sx = Math.floor(sx0); sx < Math.ceil(sx1); sx++) {
      if (!mask[sy * cw + sx]) continue;
      const weight = (Math.min(sx + 1, sx1) - Math.max(sx, sx0)) * (Math.min(sy + 1, sy1) - Math.max(sy, sy0));
      const index = ((sy + top) * sheet.width + sx + left) * 4;
      alpha += weight;
      for (let c = 0; c < 3; c++) sum[c] += sheet.data[index + c] * weight;
    }
    const index = ((y + dy) * width + x + dx) * 4;
    for (let c = 0; c < 3; c++) png.data[index + c] = alpha ? Math.round(sum[c] / alpha) : 0;
    png.data[index + 3] = Math.round(255 * alpha / ((sx1 - sx0) * (sy1 - sy0)));
  }
  return png;
}

