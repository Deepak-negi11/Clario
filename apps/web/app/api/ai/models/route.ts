// POST /api/ai/models: checks a visitor's own AI key and lists the chat models it can use, for the
// AI settings picker. The key comes in the x-ai-key header, is used for this one lookup, and is
// never stored or logged.

import {
  AI_KEY_HEADER,
  AI_PROVIDER_INFO,
  AiKeySchema,
  AiModelsRequestSchema,
  chatModels,
  suggestModel,
  type AiModelsResponse,
} from "@repo/shared";
import { AiHttpError } from "../../../../lib/ai/ai-call";
import { listAiModels } from "../../../../lib/ai/providers";
import { takeAiCall } from "../../../../lib/mentor/rate-limit";

const TIMEOUT_MS = 10_000;

function visitorOf(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

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
  const parsed = AiModelsRequestSchema.safeParse(json);
  if (!parsed.success) return fail(400, "Pick a provider first.");
  const key = AiKeySchema.safeParse(request.headers.get(AI_KEY_HEADER) ?? "");
  if (!key.success) return fail(400, key.error.issues[0]?.message ?? "Paste your key first.");
  if (!takeAiCall(`ai-models:${visitorOf(request)}`)) return fail(429, "Too many checks in a short time. Try again in a minute.");

  const { provider } = parsed.data;
  const { label } = AI_PROVIDER_INFO[provider];
  try {
    const models = chatModels(await listAiModels(provider, key.data, AbortSignal.any([request.signal, AbortSignal.timeout(TIMEOUT_MS)])));
    if (!models.length) return fail(502, `${label} accepted the key but listed no chat models.`);
    const body: AiModelsResponse = { models, suggested: suggestModel(provider, models) };
    return Response.json(body);
  } catch (error) {
    if (error instanceof AiHttpError && (error.status === 401 || error.status === 403 || error.status === 400)) {
      return fail(401, `${label} didn't accept that key. Check you copied all of it, and that it's a key from ${label}.`);
    }
    if (error instanceof AiHttpError && error.status === 429) return fail(429, `${label} says this key is over its limit right now.`);
    console.warn("[ai-models] lookup failed:", error instanceof Error ? error.message : error);
    return fail(502, `Couldn't reach ${label}. Try again in a moment.`);
  }
}
