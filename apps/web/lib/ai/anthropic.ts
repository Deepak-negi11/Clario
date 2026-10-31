// Server only. Claude through Anthropic's SDK, with the visitor's own key (bring your own key).
// The key is used for this one call and never stored or logged.

import Anthropic from "@anthropic-ai/sdk";
import { AiHttpError, type AiCall } from "./ai-call";

// Models that take output_config.effort; low effort keeps chat replies quick.
const EFFORT_MODELS = /^claude-(opus|sonnet|haiku|fable)-5|^claude-opus-4-[678]|^claude-sonnet-4-6/;
// Models that take the server-side refusal fallback ("default" picks the fallback model per refusal).
const FALLBACK_MODELS = new Set(["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);

function client(key: string) {
  return new Anthropic({ apiKey: key, maxRetries: 1 });
}

function asHttpError(error: unknown): unknown {
  return error instanceof Anthropic.APIError && typeof error.status === "number" ? new AiHttpError("anthropic", error.status) : error;
}

export async function askClaude(key: string, model: string, { system, user, signal }: AiCall): Promise<string> {
  try {
    const response = await client(key).beta.messages.create(
      {
        model,
        // Thinking (on by default on current models) counts toward this, so don't set it low.
        max_tokens: 16000,
        system,
        messages: [{ role: "user", content: user }],
        ...(EFFORT_MODELS.test(model) ? { output_config: { effort: "low" as const } } : {}),
        ...(FALLBACK_MODELS.has(model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      },
      { signal },
    );
    if (response.stop_reason === "refusal") throw new Error("Claude declined to answer");
    return response.content.map((block) => (block.type === "text" ? block.text : "")).join("");
  } catch (error) {
    throw asHttpError(error);
  }
}

export async function listClaudeModels(key: string, signal: AbortSignal): Promise<string[]> {
  try {
    const ids: string[] = [];
    for await (const model of client(key).models.list({ limit: 100 }, { signal })) ids.push(model.id);
    return ids;
  } catch (error) {
    throw asHttpError(error);
  }
}
