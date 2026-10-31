import * as z from "zod";

// Bring your own AI key: a visitor can power the AI coworkers with their own key from one of these
// providers instead of the site's free default (NVIDIA). The key stays in their browser. Each
// request carries it in the AI_KEY_HEADER header; the server uses it for that one call and never
// stores or logs it. We guess the provider from the key's prefix, then list that key's models.

export const AI_PROVIDERS = ["nvidia", "google", "anthropic", "openai", "openrouter"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export const AI_KEY_HEADER = "x-ai-key";

export const AI_PROVIDER_INFO: Record<AiProvider, { label: string; keyUrl: string; keyHint: string }> = {
  nvidia: { label: "NVIDIA", keyUrl: "https://build.nvidia.com/", keyHint: "nvapi-…" },
  google: { label: "Google Gemini", keyUrl: "https://aistudio.google.com/app/apikey", keyHint: "AIza…" },
  anthropic: { label: "Anthropic Claude", keyUrl: "https://platform.claude.com/settings/keys", keyHint: "sk-ant-…" },
  openai: { label: "OpenAI", keyUrl: "https://platform.openai.com/api-keys", keyHint: "sk-…" },
  openrouter: { label: "OpenRouter", keyUrl: "https://openrouter.ai/settings/keys", keyHint: "sk-or-…" },
};

/** The provider a key belongs to, from its prefix, or null when it doesn't look like any of them. */
export function detectAiProvider(key: string): AiProvider | null {
  const trimmed = key.trim();
  if (trimmed.startsWith("nvapi-")) return "nvidia";
  if (trimmed.startsWith("AIza")) return "google";
  if (trimmed.startsWith("sk-ant-")) return "anthropic";
  if (trimmed.startsWith("sk-or-")) return "openrouter";
  if (trimmed.startsWith("sk-")) return "openai";
  return null;
}

export const AiKeySchema = z.string().trim().regex(/^[\w.-]{20,400}$/, "That doesn't look like an API key.");
export const AiModelSchema = z.string().trim().regex(/^[\w.:/@-]{1,160}$/, "Pick a model from the list.");

// Which AI to use for a request; the key itself travels in the AI_KEY_HEADER header.
export const AiChoiceSchema = z.object({ provider: z.enum(AI_PROVIDERS), model: AiModelSchema });
export type AiChoice = z.infer<typeof AiChoiceSchema>;

// POST /api/ai/models: checks a key and lists the models it can use.
export const AiModelsRequestSchema = z.object({ provider: z.enum(AI_PROVIDERS) });
export type AiModelsResponse = { models: string[]; suggested: string };

// Models that can't chat (embeddings, images, speech, moderation and the like).
const NOT_CHAT =
  /embed|tts|whisper|dall-e|image|audio|realtime|transcribe|moderation|search|similarity|edit|babbage|davinci|rerank|guard|safety|reward|aqa|imagen|veo|lyria|computer-use|clip|parse|detector|deplot|kosmos|calibration|riva|neva|vila|fuyu|starcoder|cosmos/i;

// What we pre-select, in order of preference; the first one the key can use wins.
const PREFERRED: Record<AiProvider, string[]> = {
  nvidia: ["nvidia/nemotron-3.5-lightning-30b-a3b", "nemotron", "llama"],
  google: ["gemini-flash-latest", "gemini-2.5-flash", "flash"],
  anthropic: ["claude-opus-5-5", "claude-opus", "claude"],
  openai: ["gpt-5-mini", "mini", "gpt"],
  openrouter: ["anthropic/claude-opus-5-5", "google/gemini-flash", "openai/gpt-5-mini", "free"],
};

/** Chat models only, de-duplicated and sorted, so the picker isn't flooded. */
export function chatModels(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter((id) => id && AiModelSchema.safeParse(id).success && !NOT_CHAT.test(id)))]
    .sort((a, b) => a.localeCompare(b));
}

export function suggestModel(provider: AiProvider, models: string[]): string {
  for (const preferred of PREFERRED[provider]) {
    const exact = models.find((model) => model === preferred);
    if (exact) return exact;
    const partial = models.find((model) => model.includes(preferred));
    if (partial) return partial;
  }
  return models[0] ?? "";
}
