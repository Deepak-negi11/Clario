import * as z from "zod";

// A player's look: one of the base pixel characters, with its skin, hair and top recoloured,
// and optionally glasses and a beard painted on. When it comes from a photo, the photo is read
// in the browser and thrown away; only these fields are stored and shared. On 3D maps that
// includes `face`, a small picture of the face cut from the photo, painted on the 3D head.
export const AVATAR_BASES = ["adam", "alex", "amelia", "bob"] as const;

export type AvatarBase = (typeof AVATAR_BASES)[number];

// Changes to the base character's own hair: shaved off, grown into curls, or tied in a bun.
export const HAIR_SHAPES = ["bald", "curly", "bun"] as const;

export type HairShape = (typeof HAIR_SHAPES)[number];

// The face picture: this many pixels square, with the eyes and the middle of the mouth here.
export const FACE_SIZE = 128;
export const FACE_POINTS = {
  leftEye: { x: 42, y: 56 },
  rightEye: { x: 86, y: 56 },
  mouth: { x: 64, y: 94 },
} as const;
// About 12 KB as a data URL at JPEG quality 0.85; room to spare for busy photos.
const MAX_FACE_LENGTH = 40_000;

type Point = { x: number; y: number };

/**
 * The transform taking three points onto three others, as canvas setTransform arguments
 * (x' = a x + c y + e, y' = b x + d y + f), or null if the first three are in a line.
 */
export function affineFrom(from: readonly [Point, Point, Point], to: readonly [Point, Point, Point]) {
  const [p, q, r] = from;
  const det = p.x * (q.y - r.y) - p.y * (q.x - r.x) + (q.x * r.y - r.x * q.y);
  if (Math.abs(det) < 1e-9) return null;
  // Cramer's rule, once for x' and once for y'.
  const solve = (u: number, v: number, w: number) => [
    (u * (q.y - r.y) - p.y * (v - w) + (v * r.y - w * q.y)) / det,
    (p.x * (v - w) - u * (q.x - r.x) + (q.x * w - r.x * v)) / det,
    (p.x * (q.y * w - r.y * v) - p.y * (q.x * w - r.x * v) + u * (q.x * r.y - r.x * q.y)) / det,
  ] as const;
  const [a, c, e] = solve(to[0].x, to[1].x, to[2].x);
  const [b, d, f] = solve(to[0].y, to[1].y, to[2].y);
  return [a, b, c, d, e, f] as [number, number, number, number, number, number];
}

const HexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .transform((value) => value.toLowerCase());

export const AvatarLookSchema = z.object({
  base: z.enum(AVATAR_BASES),
  skin: HexColor,
  hair: HexColor,
  top: HexColor,
  // Optional so looks saved before these existed still parse.
  glasses: z.boolean().optional(),
  beard: z.boolean().optional(),
  // Absent: the base character's own hair.
  hairShape: z.enum(HAIR_SHAPES).optional(),
  // A FACE_SIZE square JPEG (data URL) with the eyes and mouth on FACE_POINTS.
  face: z.string().max(MAX_FACE_LENGTH).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/).optional(),
});

export type AvatarLook = z.infer<typeof AvatarLookSchema>;

/** Reads a look from stored JSON text or a plain object; anything invalid becomes null. */
export function parseAvatarLook(value: unknown): AvatarLook | null {
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const parsed = AvatarLookSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
