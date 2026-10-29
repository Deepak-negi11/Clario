import type { AvatarBase } from "@repo/shared";

// Reads a look from a photo, entirely in the browser: the photo is drawn small on a canvas,
// sampled, and dropped. Nothing is uploaded or stored.
//
// It assumes a selfie-style photo: a face near the middle, hair above it, clothes below it.
// Skin pixels are found with a standard YCbCr skin-tone range; the face box comes from where
// those pixels sit. Everything else is read at fixed places in that box, the way faces are
// laid out: hair just above and beside it, a glasses bridge between the eyes, a beard on the
// upper lip and the chin, clothes below. This is colour sampling, not face detection, so a
// tilted head, a fringe over the forehead, strong shadows or hair the colour of the background
// can give wrong answers. Results are a starting point the user can adjust.

export type PhotoLook = {
  skin: string;
  hair: string | null;
  top: string | null;
  /** The character whose hair is most like the photo's, or null when the hair can't be told apart. */
  style: AvatarBase | null;
  glasses: boolean;
  beard: boolean;
};

type Rgb = [number, number, number];

const toHex = ([r, g, b]: Rgb) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

type Ycc = [number, number, number];

const toYcc = (r: number, g: number, b: number): Ycc => [
  0.299 * r + 0.587 * g + 0.114 * b,
  128 - 0.168736 * r - 0.331264 * g + 0.5 * b,
  128 + 0.5 * r - 0.418688 * g - 0.081312 * b,
];

function isSkin(r: number, g: number, b: number) {
  const [y, cb, cr] = toYcc(r, g, b);
  return y > 45 && cb >= 77 && cb <= 127 && cr >= 135 && cr <= 178 && r > g && r > b;
}

const distance = (a: Ycc, b: Ycc) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const mean = (points: Ycc[]): Ycc => {
  const sum: Ycc = [0, 0, 0];
  for (const p of points) {
    sum[0] += p[0];
    sum[1] += p[1];
    sum[2] += p[2];
  }
  return [sum[0] / points.length, sum[1] / points.length, sum[2] / points.length];
};

const percentile = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;

// The most common colour among the pixels, by 16-level buckets per channel, averaged within its bucket.
function dominant(pixels: Rgb[]): Rgb | null {
  if (pixels.length < 12) return null;
  const buckets = new Map<number, { n: number; sum: Rgb }>();
  for (const [r, g, b] of pixels) {
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key) ?? { n: 0, sum: [0, 0, 0] };
    bucket.n++;
    bucket.sum[0] += r;
    bucket.sum[1] += g;
    bucket.sum[2] += b;
    buckets.set(key, bucket);
  }
  let best: { n: number; sum: Rgb } | null = null;
  for (const bucket of buckets.values()) if (!best || bucket.n > best.n) best = bucket;
  return best ? [best.sum[0] / best.n, best.sum[1] / best.n, best.sum[2] / best.n] : null;
}

const median = (pixels: Rgb[]): Rgb => {
  const channel = (c: 0 | 1 | 2) => percentile(pixels.map((p) => p[c]).sort((a, b) => a - b), 0.5);
  return [channel(0), channel(1), channel(2)];
};

// Photos are read at this size: enough pixels across a face to see the bridge of a pair of glasses.
const SAMPLE_SIZE = 320;

/** Returns the look a photo suggests, or null when no face-like skin area is found. */
export async function readPhotoLook(file: Blob): Promise<PhotoLook | null> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, SAMPLE_SIZE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    bitmap.close();
    return null;
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return readPixels(ctx.getImageData(0, 0, w, h).data, w, h);
}

/** The reading itself, on a photo's RGBA pixels, so it can run without a canvas. */
export function readPixels(data: Uint8ClampedArray, w: number, h: number): PhotoLook | null {
  const at = (x: number, y: number): Rgb => {
    const i = (y * w + x) * 4;
    return [data[i]!, data[i + 1]!, data[i + 2]!];
  };
  const x0 = Math.floor(w * 0.15), x1 = Math.ceil(w * 0.85);
  const y0 = Math.floor(h * 0.05), y1 = Math.ceil(h * 0.85);

  // Brown and blond hair fall inside the skin-tone range too. Split the skin-coloured pixels
  // into two colour groups (2-means, started from the upper and lower parts of the photo); if
  // the groups clearly differ, the upper one is hair and only the lower one counts as skin.
  // Long hair and beards put hair beside and below the face too; when the two groups sit at
  // about the same height, the clearly darker one is hair.
  const candidates: { ycc: Ycc; row: number }[] = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const rgb = at(x, y);
      if (isSkin(...rgb)) candidates.push({ ycc: toYcc(...rgb), row: y });
    }
  }
  let skinCenter: Ycc | null = null;
  let hairCenter: Ycc | null = null;
  if (candidates.length > 20) {
    const rows = candidates.map((c) => c.row).sort((a, b) => a - b);
    const upperRow = percentile(rows, 0.3), lowerRow = percentile(rows, 0.7);
    let upper = mean(candidates.filter((c) => c.row <= upperRow).map((c) => c.ycc));
    let lower = mean(candidates.filter((c) => c.row >= lowerRow).map((c) => c.ycc));
    let upperGroup = candidates;
    let lowerGroup = candidates;
    for (let round = 0; round < 8; round++) {
      upperGroup = candidates.filter((c) => distance(c.ycc, upper) < distance(c.ycc, lower));
      lowerGroup = candidates.filter((c) => distance(c.ycc, upper) >= distance(c.ycc, lower));
      if (!upperGroup.length || !lowerGroup.length) break;
      upper = mean(upperGroup.map((c) => c.ycc));
      lower = mean(lowerGroup.map((c) => c.ycc));
    }
    const sizable = Math.min(upperGroup.length, lowerGroup.length) > candidates.length * 0.1;
    const rowOf = (group: typeof candidates) => group.reduce((sum, c) => sum + c.row, 0) / group.length;
    const rowGap = rowOf(lowerGroup) - rowOf(upperGroup);
    const sameHeight = Math.abs(rowGap) <= (percentile(rows, 0.9) - percentile(rows, 0.1)) * 0.15;
    if (sizable && distance(upper, lower) > 25) {
      if (sameHeight && Math.abs(upper[0] - lower[0]) > 40) {
        [skinCenter, hairCenter] = upper[0] > lower[0] ? [upper, lower] : [lower, upper];
      } else if (rowGap > 0) {
        skinCenter = lower;
        hairCenter = upper;
      }
    }
  }
  const skinAt = (x: number, y: number) => {
    const rgb = at(x, y);
    if (!isSkin(...rgb)) return false;
    if (!skinCenter || !hairCenter) return true;
    const ycc = toYcc(...rgb);
    return distance(ycc, skinCenter) <= distance(ycc, hairCenter);
  };
  const notSkin = (x: number, y: number) => !skinAt(x, y);

  // Skin in the middle of the photo, where a selfie's face is.
  const xs: number[] = [];
  const ys: number[] = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (skinAt(x, y)) {
        xs.push(x);
        ys.push(y);
      }
    }
  }
  if (xs.length < (x1 - x0) * (y1 - y0) * 0.02) return null;
  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);
  const left = percentile(xs, 0.1);
  const right = percentile(xs, 0.9);
  const top = percentile(ys, 0.04);
  const faceW = Math.max(4, right - left);
  const faceH = faceW * 1.3;
  const bottom = top + faceH;

  // Calls `visit` for each pixel of a box, clipped to the photo.
  const each = (fromX: number, toX: number, fromY: number, toY: number, visit: (x: number, y: number) => void) => {
    for (let y = Math.max(0, Math.floor(fromY)); y < Math.min(h, Math.ceil(toY)); y++) {
      for (let x = Math.max(0, Math.floor(fromX)); x < Math.min(w, Math.ceil(toX)); x++) visit(x, y);
    }
  };
  const collect = (fromX: number, toX: number, fromY: number, toY: number, keep: (x: number, y: number) => boolean) => {
    const out: Rgb[] = [];
    each(fromX, toX, fromY, toY, (x, y) => {
      if (keep(x, y)) out.push(at(x, y));
    });
    return out;
  };
  // The share of a box's pixels that pass a test (0 for a box off the photo).
  const share = (fromX: number, toX: number, fromY: number, toY: number, test: (x: number, y: number) => boolean) => {
    let all = 0;
    let hits = 0;
    each(fromX, toX, fromY, toY, (x, y) => {
      all++;
      if (test(x, y)) hits++;
    });
    return all ? hits / all : 0;
  };

  const skin = median(collect(left, right, top, bottom, skinAt));
  // A thin band right above the forehead and within the face's width: wider or higher
  // bands pick up the background around the head.
  const hair =
    dominant(collect(left, right, top - faceH * 0.15, top + faceH * 0.05, notSkin)) ??
    dominant([
      ...collect(left - faceW * 0.25, left, top, top + faceH * 0.6, notSkin),
      ...collect(right, right + faceW * 0.25, top, top + faceH * 0.6, notSkin),
    ]);
  const clothes = dominant(collect(left - faceW * 0.4, right + faceW * 0.4, bottom + faceH * 0.25, bottom + faceH * 1.1, notSkin));

  // The face's real size and its hairline, for finding its features. The box above is narrower
  // than the face, as its sides are percentiles, and its top is below the hairline, as a
  // forehead is rounded. The widest row of skin (the cheeks, maybe with the ears) is closer to
  // the width; the hairline is the first row with skin across half of that. Faces are about
  // 1.25 to 1.35 times as tall, hairline to chin, as that width.
  const skinInRow = (y: number) => {
    let count = 0;
    each(left - faceW * 0.5, right + faceW * 0.5, y, y + 1, (x) => {
      if (skinAt(x, y)) count++;
    });
    return count;
  };
  let faceWidth = 0;
  for (let y = top; y < Math.min(h, top + faceW * 1.6); y++) faceWidth = Math.max(faceWidth, skinInRow(y));
  let hairline = ys[0]!;
  while (hairline < top && skinInRow(hairline) < faceWidth * 0.5) hairline++;
  const cx = percentile(xs, 0.5);
  const faceHeight = faceWidth * 1.25;
  // Where the face narrows below the cheeks: the jaw, or the top of a beard. Measured as the
  // span of skin, so eyes and a mouth (holes in the skin) don't count as narrowing.
  const skinSpan = (y: number) => {
    let first = -1;
    let last = -1;
    each(cx - faceWidth * 0.75, cx + faceWidth * 0.75, y, y + 1, (x) => {
      if (!skinAt(x, y)) return;
      if (first < 0) first = x;
      last = x;
    });
    return first < 0 ? 0 : last - first + 1;
  };
  let jaw = Math.round(hairline + faceHeight * 0.45);
  while (jaw < h && skinSpan(jaw) >= faceWidth * 0.7) jaw++;

  // Long hair hangs beside the face down to the chin; otherwise how high the hair rises above
  // the forehead tells short from big hair. Hair the colour of the background can't be measured.
  const readStyle = (hairRgb: Rgb): AvatarBase | null => {
    const hairYcc = toYcc(...hairRgb);
    const corner = Math.max(2, Math.min(w, h) * 0.1);
    const backdrop = dominant([...collect(0, corner, 0, corner, () => true), ...collect(w - corner, w, 0, corner, () => true)]);
    if (backdrop && distance(hairYcc, toYcc(...backdrop)) < 30) return null;
    const hairAt = (x: number, y: number) => {
      if (skinAt(x, y)) return false;
      const [luma, cb, cr] = toYcc(...at(x, y));
      return Math.abs(luma - hairYcc[0]) < 45 && Math.hypot(cb - hairYcc[1], cr - hairYcc[2]) < 15;
    };
    const besideFace =
      (share(cx - faceWidth * 0.8, cx - faceWidth * 0.52, hairline + faceHeight * 0.55, hairline + faceHeight, hairAt) +
        share(cx + faceWidth * 0.52, cx + faceWidth * 0.8, hairline + faceHeight * 0.55, hairline + faceHeight, hairAt)) /
      2;
    if (besideFace > 0.3) return "amelia";
    // The jaw is normally about 0.8 of a face height below the hairline. Much less means the
    // "hairline" found is the edge of a fringe, which is the side-part character's hair.
    if ((jaw - hairline) / faceHeight < 0.55) return "alex";

    const hairRow = (y: number) => share(cx - faceWidth * 0.25, cx + faceWidth * 0.25, y, y + 1, hairAt) > 0.4;
    let y = Math.floor(hairline);
    // Skip the hairline itself, where skin and hair mix.
    while (y > 0 && y > hairline - faceHeight * 0.1 && !hairRow(y - 1)) y--;
    while (y > 0 && hairRow(y - 1)) y--;
    // The top of the skull is about 0.25 of a face height above the hairline, so short hair
    // rises about 0.3 and big hair well over 0.5. These limits come from face proportions,
    // not from testing on a set of photos.
    const rise = (hairline - y) / faceHeight;
    if (rise > 0.5) return "adam";
    // A photo cut off at the top of the hair says nothing about how short it is.
    if (rise < 0.34 && y > 0) return "bob";
    return "alex";
  };

  // Glasses: a thin dark bridge across the top of the nose, where there is normally skin, with
  // darker eye areas either side of it (a mouth, met by mistake, has cheeks either side).
  // A beard: much of the area below the jaw line darker than the skin (without one, that area
  // is the chin and neck). Both need a face big enough in the photo to show them, and the
  // search areas allow for the face size being a little off.
  const readFeatures = () => {
    if (faceWidth < 32) return { glasses: false, beard: false };
    const skinLuma = toYcc(...skin)[0];
    const darkAt = (x: number, y: number) => notSkin(x, y) && toYcc(...at(x, y))[0] < skinLuma - 40;
    const row = (fraction: number) => hairline + faceHeight * fraction;

    const bridge = Math.max(1.5, faceWidth * 0.035);
    let bridgeRows = 0;
    let bridgeAt = -1;
    for (let y = Math.round(row(0.25)); y < row(0.55); y++) {
      if (share(cx - bridge, cx + bridge, y, y + 1, darkAt) < 0.6) continue;
      bridgeRows++;
      if (bridgeAt < 0) bridgeAt = y;
    }
    const eyeArea = (from: number, to: number) =>
      share(cx + faceWidth * from, cx + faceWidth * to, bridgeAt - faceHeight * 0.06, bridgeAt + faceHeight * 0.06, darkAt);
    const glasses =
      bridgeRows >= 1 && bridgeRows <= Math.max(2, faceHeight * 0.07) && eyeArea(-0.42, -0.12) > 0.08 && eyeArea(0.12, 0.42) > 0.08;

    const beard = share(cx - faceWidth * 0.3, cx + faceWidth * 0.3, jaw, jaw + faceHeight * 0.3, darkAt) > 0.3;
    return { glasses, beard };
  };

  return {
    skin: toHex(skin),
    hair: hair ? toHex(hair) : null,
    top: clothes ? toHex(clothes) : null,
    style: hair ? readStyle(hair) : null,
    ...readFeatures(),
  };
}
