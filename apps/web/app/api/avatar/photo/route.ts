// POST /api/avatar/photo: "Use AI to read my photo" in the avatar picker. A small JPEG of the
// player's photo goes to NVIDIA's vision model on the site key, which says their hairstyle,
// glasses and beard (PHOTO_AI_PROMPT, @repo/shared). Signed-in players only, rate limited per
// person, and free: it doesn't use their free coworker AI replies. The photo is used for this one
// answer and never stored or logged. On any failure the picker keeps what the browser read.

import { PHOTO_AI_PROMPT, PhotoAiRequestSchema, readPhotoAi, type PhotoAiReading } from "@repo/shared";
import { nvidiaSettings } from "../../../../lib/email-assist/nvidia";
import { signedInUserId } from "../../../../lib/email-assist/signed-in-user";
import { takeAiCall } from "../../../../lib/mentor/rate-limit";

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
// Answers a photo in about a second with thinking off. Text-only NVIDIA_MODEL can't see images.
const DEFAULT_VISION_MODEL = "nvidia/nemotron-3.5-super-vl-120b-a12b";
const TIMEOUT_MS = 15_000;

function fail(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return fail(400, "The request was not valid JSON.");
  }
  const parsed = PhotoAiRequestSchema.safeParse(json);
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "Invalid request.");

  const settings = nvidiaSettings();
  if (!settings) return fail(503, "Reading photos with AI is off: no NVIDIA_API_KEY is set.");
  let userId: string | null;
  try {
    userId = await signedInUserId(request);
  } catch {
    return fail(503, "Couldn't check who you are. Try again in a moment.");
  }
  if (!userId) return fail(401, "Sign in to read your photo with AI.");
  if (!takeAiCall(`avatar-photo:${userId}`)) return fail(429, "Too many photos in a short time. Try again in a minute.");

  try {
    const response = await fetch(NVIDIA_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${settings.key}`, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        model: process.env.NVIDIA_VISION_MODEL?.trim() || DEFAULT_VISION_MODEL,
        messages: [
          { role: "system", content: PHOTO_AI_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: "Describe this person's hair, glasses and beard as the JSON object." },
              { type: "image_url", image_url: { url: parsed.data.image } },
            ],
          },
        ],
        temperature: 0,
        max_tokens: 200,
        chat_template_kwargs: { enable_thinking: false },
      }),
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(TIMEOUT_MS)]),
    });
    if (!response.ok) {
      console.warn(`[avatar-photo] NVIDIA returned HTTP ${response.status}`);
      return fail(502, "The AI couldn't read that photo.");
    }
    const body = (await response.json()) as { choices?: { message?: { content?: string | null } }[] };
    const reading: PhotoAiReading | null = readPhotoAi(body.choices?.[0]?.message?.content ?? "");
    if (!reading) return fail(422, "The AI didn't find one clear face in that photo.");
    return Response.json(reading);
  } catch (error) {
    if (request.signal.aborted) return fail(499, "The picker stopped waiting.");
    console.warn("[avatar-photo] NVIDIA call failed:", error instanceof Error ? error.message : error);
    return fail(502, "The AI couldn't read that photo.");
  }
}
