import type { AvatarBase, HairShape } from "@repo/shared";

// Turns a face's landmarks and a hair mask (both from MediaPipe, see photo-detect.ts) into a
// look. Pure: it only reads arrays, so tests can feed it drawn pictures.
//
// Landmarks are MediaPipe's 478-point face mesh, as fractions of the photo's width and height.
// Only these points are used:
const P = {
  forehead: 10, // top of the face oval, about the hairline
  chin: 152,
  sideR: 234, // the face's right edge (left in the photo)
  sideL: 454,
  browR: 105,
  browL: 334,
  eyeOuterR: 33,
  eyeInnerR: 133,
  eyeTopR: 159,
  eyeBottomR: 145,
  eyeOuterL: 263,
  eyeInnerL: 362,
  eyeTopL: 386,
  eyeBottomL: 374,
  bridge: 6,
  noseBase: 2,
  lipTop: 0,
  lipBottom: 17,
  mouthR: 61,
  mouthL: 291,
  cheekR: 50,
  cheekL: 280,
  foreheadMid: 151,
} as const;

export type Landmark = { x: number; y: number };

export type Detection = {
  data: Uint8ClampedArray; // RGBA
  width: number;
  height: number;
  landmarks: Landmark[];
  hair: Uint8Array; // 1 where the pixel is hair
};

export type DetectedLook = {
  skin: string;
  hair: string | null;
  top: string | null;
  style: AvatarBase;
  hairShape: HairShape | null;
  glasses: boolean;
  beard: boolean;
};

type Rgb = [number, number, number];

const toHex = ([r, g, b]: Rgb) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
const luma = ([r, g, b]: Rgb) => 0.299 * r + 0.587 * g + 0.114 * b;
const chroma = ([r, g, b]: Rgb): [number, number] => [128 - 0.168736 * r - 0.331264 * g + 0.5 * b, 128 + 0.5 * r - 0.418688 * g - 0.081312 * b];

function median(pixels: Rgb[]): Rgb | null {
  if (!pixels.length) return null;
  const channel = (c: 0 | 1 | 2) => {
    const values = pixels.map((p) => p[c]).sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)]!;
  };
  return [channel(0), channel(1), channel(2)];
}

// The middle of the pixels by brightness: drops highlights and deep shadows before the median.
function trimmedMedian(pixels: Rgb[], low = 0.15, high = 0.85): Rgb | null {
  if (!pixels.length) return null;
  const sorted = [...pixels].sort((a, b) => luma(a) - luma(b));
  return median(sorted.slice(Math.floor(sorted.length * low), Math.max(Math.floor(sorted.length * low) + 1, Math.ceil(sorted.length * high))));
}

// The most common colour, by 16-level buckets per channel, averaged within its bucket.
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

/** Reads a look from a detected face; null when the landmarks don't describe a usable face. */
export function lookFromDetection({ data, width: w, height: h, landmarks, hair }: Detection): DetectedLook | null {
  if (landmarks.length < 468) return null;
  const pt = (index: number) => ({ x: landmarks[index]!.x * w, y: landmarks[index]!.y * h });
  const at = (x: number, y: number): Rgb => {
    const i = (y * w + x) * 4;
    return [data[i]!, data[i + 1]!, data[i + 2]!];
  };
  const isHair = (x: number, y: number) => hair[y * w + x] === 1;

  const top = pt(P.forehead).y;
  const chin = pt(P.chin).y;
  const sideR = pt(P.sideR).x;
  const sideL = pt(P.sideL).x;
  const faceW = Math.abs(sideL - sideR);
  const faceH = chin - top;
  if (faceW < 12 || faceH < 12) return null;
  const cx = (sideR + sideL) / 2;
  const leftEdge = Math.min(sideR, sideL);
  const rightEdge = Math.max(sideR, sideL);

  // Calls `visit` for each pixel of a box, clipped to the photo.
  const each = (x0: number, x1: number, y0: number, y1: number, visit: (x: number, y: number) => void) => {
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(h, Math.ceil(y1)); y++) {
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(w, Math.ceil(x1)); x++) visit(x, y);
    }
  };
  const collect = (x0: number, x1: number, y0: number, y1: number, keep: (x: number, y: number) => boolean) => {
    const out: Rgb[] = [];
    each(x0, x1, y0, y1, (x, y) => {
      if (keep(x, y)) out.push(at(x, y));
    });
    return out;
  };
  // The share of a box's pixels that pass a test, and how many pixels of the box are on the photo.
  const share = (x0: number, x1: number, y0: number, y1: number, test: (x: number, y: number) => boolean) => {
    let all = 0;
    let hits = 0;
    each(x0, x1, y0, y1, (x, y) => {
      all++;
      if (test(x, y)) hits++;
    });
    return { share: all ? hits / all : 0, pixels: all };
  };

  // Skin: the whole face oval, leaving out hair, eyes, brows and the mouth, and then the middle
  // of it by brightness. Light falls on one side of a face and the other is in shade (a studio
  // portrait's forehead can be twice as bright as a cheek); the middle is the skin tone.
  const midY = (top + chin) / 2;
  const inBox = (x: number, y: number, x0: number, x1: number, y0: number, y1: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  const feature = (x: number, y: number) => {
    for (const [outer, inner] of [[P.eyeOuterR, P.eyeInnerR], [P.eyeOuterL, P.eyeInnerL]] as const) {
      const a = pt(outer), b = pt(inner);
      if (inBox(x, y, Math.min(a.x, b.x) - faceW * 0.04, Math.max(a.x, b.x) + faceW * 0.04, a.y - faceH * 0.07, a.y + faceH * 0.06)) return true;
    }
    for (const brow of [P.browR, P.browL]) {
      const b = pt(brow);
      if (inBox(x, y, b.x - faceW * 0.16, b.x + faceW * 0.16, b.y - faceH * 0.04, b.y + faceH * 0.04)) return true;
    }
    const mouthA = pt(P.mouthR), mouthB = pt(P.mouthL);
    return inBox(x, y, Math.min(mouthA.x, mouthB.x) - faceW * 0.03, Math.max(mouthA.x, mouthB.x) + faceW * 0.03, pt(P.lipTop).y - faceH * 0.02, pt(P.lipBottom).y + faceH * 0.02);
  };
  const inFace = (x: number, y: number) => ((x - cx) / (faceW / 2)) ** 2 + ((y - midY) / (faceH / 2)) ** 2 <= 0.8;
  const skinRgb = trimmedMedian(collect(leftEdge, rightEdge, top, chin, (x, y) => inFace(x, y) && !isHair(x, y) && !feature(x, y)), 0.3, 0.7);
  if (!skinRgb) return null;
  const skinLuma = luma(skinRgb);
  const [skinCb, skinCr] = chroma(skinRgb);
  const skinLike = (x: number, y: number) => {
    const rgb = at(x, y);
    const [cb, cr] = chroma(rgb);
    return Math.abs(luma(rgb) - skinLuma) < 45 && Math.hypot(cb - skinCb, cr - skinCr) < 14;
  };
  const dark = (x: number, y: number) => !skinLike(x, y) && luma(at(x, y)) < skinLuma - 35;

  // Hair: the hair mask above the eyes (lower down it can be a beard).
  const eyeY = (pt(P.eyeTopR).y + pt(P.eyeTopL).y) / 2;
  const hairPixels: Rgb[] = [];
  let hairCount = 0;
  each(0, w, 0, h, (x, y) => {
    if (!isHair(x, y)) return;
    hairCount++;
    if (y < eyeY) hairPixels.push(at(x, y));
  });
  const hairRgb = trimmedMedian(hairPixels.length >= 40 ? hairPixels : collect(0, w, 0, h, isHair), 0.2, 0.8);

  // Clothes: below the chin, leaving out skin (the neck) and hair.
  const topRgb = dominant(collect(cx - faceW * 0.9, cx + faceW * 0.9, chin + faceH * 0.45, chin + faceH * 1.2, (x, y) => !isHair(x, y) && !skinLike(x, y)));

  // Hair shape, measured against the face.
  const aboveHead = share(leftEdge - faceW * 0.1, rightEdge + faceW * 0.1, top - faceH * 0.45, top + faceH * 0.05, isHair);
  const bald = hairCount < faceW * faceH * 0.05 || (aboveHead.pixels > faceW * faceH * 0.1 && aboveHead.share < 0.12);
  const mouthY = (pt(P.lipTop).y + pt(P.lipBottom).y) / 2;
  const besideChin =
    (share(leftEdge - faceW * 0.45, leftEdge + faceW * 0.02, mouthY, chin + faceH * 0.5, isHair).share +
      share(rightEdge - faceW * 0.02, rightEdge + faceW * 0.45, mouthY, chin + faceH * 0.5, isHair).share) /
    2;
  // How high the hair rises over the middle of the forehead, and how far it reaches sideways.
  const hairRow = (y: number) => share(cx - faceW * 0.25, cx + faceW * 0.25, y, y + 1, isHair).share > 0.3;
  let crown = Math.floor(top);
  while (crown > 0 && crown > top - faceH * 0.15 && !hairRow(crown - 1)) crown--;
  while (crown > 0 && hairRow(crown - 1)) crown--;
  const cutOff = crown <= 0;
  const rise = (top - crown) / faceH;
  let hairLeft = cx;
  let hairRight = cx;
  each(0, w, crown, eyeY, (x, y) => {
    if (!isHair(x, y)) return;
    hairLeft = Math.min(hairLeft, x);
    hairRight = Math.max(hairRight, x);
  });
  const spread = (hairRight - hairLeft) / faceW;
  const browY = (pt(P.browR).y + pt(P.browL).y) / 2;
  const fringe = share(cx - faceW * 0.3, cx + faceW * 0.3, top + (browY - top) * 0.3, browY, isHair).share;

  let style: AvatarBase = "bob";
  let hairShape: HairShape | null = null;
  if (bald) {
    style = "bob";
    hairShape = "bald";
  } else if (besideChin > 0.25) {
    style = "amelia";
  } else if (spread > 1.55 && rise > 0.32) {
    style = "bob";
    hairShape = "curly";
  } else if (fringe > 0.45) {
    style = "alex";
  } else if (rise > 0.42 && !cutOff) {
    style = "adam";
  }

  // Glasses: a frame shows as dark lines where there is normally skin: across the bridge of the
  // nose between the eyes, and along the cheek just under each eye. Both must show; rimless
  // glasses don't, and the user can turn glasses on by hand.
  const eyeSpan = Math.abs(pt(P.eyeInnerL).x - pt(P.eyeInnerR).x);
  const bridgeX = (pt(P.eyeInnerR).x + pt(P.eyeInnerL).x) / 2;
  const bridgeDark = share(bridgeX - eyeSpan * 0.12, bridgeX + eyeSpan * 0.12, eyeY - faceH * 0.04, eyeY + faceH * 0.06, dark).share;
  // A rim is a dark run across most of a row in the band under the eye.
  const rimUnder = (outer: number, inner: number, bottom: number) => {
    const x0 = Math.min(pt(outer).x, pt(inner).x);
    const x1 = Math.max(pt(outer).x, pt(inner).x);
    const from = pt(bottom).y + faceH * 0.02;
    for (let y = from; y < from + faceH * 0.1; y++) if (share(x0, x1, y, y + 1, dark).share > 0.5) return true;
    return false;
  };
  const glasses = bridgeDark > 0.12 && rimUnder(P.eyeOuterR, P.eyeInnerR, P.eyeBottomR) && rimUnder(P.eyeOuterL, P.eyeInnerL, P.eyeBottomL);

  // A beard: hair or dark, non-skin pixels over the chin, under the lower lip; or a moustache
  // over most of the upper lip.
  const mouthLeft = Math.min(pt(P.mouthR).x, pt(P.mouthL).x);
  const mouthRight = Math.max(pt(P.mouthR).x, pt(P.mouthL).x);
  const facial = (x: number, y: number) => isHair(x, y) || dark(x, y);
  const chinCover = share(mouthLeft, mouthRight, pt(P.lipBottom).y + faceH * 0.03, chin - faceH * 0.02, facial).share;
  const moustache = share(mouthLeft, mouthRight, pt(P.noseBase).y + faceH * 0.01, pt(P.lipTop).y, facial).share;
  const beard = chinCover > 0.35 || moustache > 0.5;

  return {
    skin: toHex(skinRgb),
    hair: hairRgb ? toHex(hairRgb) : null,
    top: topRgb ? toHex(topRgb) : null,
    style,
    hairShape,
    glasses,
    beard,
  };
}
