// Server only. Talks to NVIDIA's hosted models through their OpenAI-compatible chat API and
// returns the raw answer text; the route checks it with readEmailAssist.

import { NvidiaReplySchema } from "@repo/shared";

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
// Answers in about 2 s with thinking off. Many models listed by GET /v1/models return 404 for a
// free key, so check one with a real call before switching NVIDIA_MODEL.
const DEFAULT_MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b";

export type NvidiaSettings = { key: string; model: string };

export function nvidiaSettings(): NvidiaSettings | null {
  const key = process.env.NVIDIA_API_KEY?.trim();
  if (!key) return null;
  return { key, model: process.env.NVIDIA_MODEL?.trim() || DEFAULT_MODEL };
}

export async function askNvidia(
  settings: NvidiaSettings,
  { system, user, maxTokens, signal }: { system: string; user: string; maxTokens: number; signal: AbortSignal },
): Promise<string> {
  const response = await fetch(NVIDIA_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${settings.key}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      model: settings.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.3,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      // Nemotron reasons before answering by default, which costs seconds and tokens a short email
      // doesn't need. Models without this switch ignore it.
      chat_template_kwargs: { enable_thinking: false },
    }),
    signal,
  });
  if (!response.ok) throw new Error(`NVIDIA returned HTTP ${response.status}`);

  const data = NvidiaReplySchema.parse(await response.json());
  return data.choices[0]?.message.content ?? "";
}
