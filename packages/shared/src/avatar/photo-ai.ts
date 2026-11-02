import * as z from "zod";
import type { AvatarBase, HairShape } from "./avatar-look";

// "Use AI to read my photo": when the player allows it, a small copy of their photo goes through
// our server (apps/web/app/api/avatar/photo) to NVIDIA's vision model, which says what the face
// detector guesses least well: the hairstyle, glasses and a beard. Colours and the 3D face picture
// still come from the photo in the browser (apps/web/lib/avatar). The copy is used for that one
// answer and never stored or logged.

// What the model picks from, each mapped onto the avatar's styles and hair shapes below.
export const PHOTO_AI_HAIR = ["short", "messy", "side-part", "long", "curly", "bun", "shaved"] as const;
export type PhotoAiHair = (typeof PHOTO_AI_HAIR)[number];

const HAIR_LOOK: Record<PhotoAiHair, { style: AvatarBase; hairShape: HairShape | null }> = {
  short: { style: "bob", hairShape: null },
  messy: { style: "adam", hairShape: null },
  "side-part": { style: "alex", hairShape: null },
  long: { style: "amelia", hairShape: null },
  curly: { style: "bob", hairShape: "curly" },
  bun: { style: "amelia", hairShape: "bun" },
  shaved: { style: "bob", hairShape: "bald" },
};

export function lookForAiHair(hair: PhotoAiHair): { style: AvatarBase; hairShape: HairShape | null } {
  return HAIR_LOOK[hair];
}

// A JPEG of at most PHOTO_AI_SIZE pixels on its longest side; ~40 KB is typical, 200 KB is plenty.
export const PHOTO_AI_SIZE = 384;
export const PhotoAiRequestSchema = z.object({
  image: z.string().max(200_000, "That photo is too big to send.").regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/, "Send the photo as a JPEG."),
});
export type PhotoAiRequest = z.infer<typeof PhotoAiRequestSchema>;

// What the model answers, and what the route sends back.
const PhotoAiAnswerSchema = z.object({
  face: z.boolean(),
  hair: z.enum(PHOTO_AI_HAIR).optional(),
  glasses: z.boolean().optional(),
  beard: z.boolean().optional(),
});
export type PhotoAiReading = { hair: PhotoAiHair; glasses: boolean; beard: boolean };

export const PHOTO_AI_PROMPT = [
  "You look at one photo of a person and describe their hair and face for a cartoon avatar.",
  'Answer with one JSON object only: {"face": true|false, "hair": "...", "glasses": true|false, "beard": true|false}.',
  'face: false when there is no single clear human face; then leave out the rest.',
  `hair, the closest of: ${PHOTO_AI_HAIR.join(", ")}. "short" is short and neat, "messy" short and tousled or spiky, "side-part" short with a clear side part or fringe, "long" past the ears or to the shoulders, "curly" curly or afro hair, "bun" tied up in a bun or ponytail, "shaved" shaved or bald.`,
  "glasses: true only for spectacles or sunglasses worn on the face. beard: true for a beard, stubble you can clearly see, or a moustache.",
].join("\n");

/** The model's answer, checked; null when it isn't one or found no face. */
export function readPhotoAi(raw: string): PhotoAiReading | null {
  const text = raw.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, "$1");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let json: unknown;
  try {
    json = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const parsed = PhotoAiAnswerSchema.safeParse(json);
  if (!parsed.success || !parsed.data.face || !parsed.data.hair) return null;
  return { hair: parsed.data.hair, glasses: parsed.data.glasses ?? false, beard: parsed.data.beard ?? false };
}
