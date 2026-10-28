import * as z from "zod";

// A player's look: one of the base pixel characters, with its skin, hair and top recoloured,
// and optionally glasses and a beard painted on. When it comes from a photo, the photo is read
// in the browser and thrown away; only these fields are stored and shared.
export const AVATAR_BASES = ["adam", "alex", "amelia", "bob"] as const;

export type AvatarBase = (typeof AVATAR_BASES)[number];

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
