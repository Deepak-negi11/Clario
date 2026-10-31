// Server only. One chat request to whichever AI the visitor picked with their own key, or the
// site's NVIDIA default. Every provider gets the same shape: a system prompt and one user message.
// NVIDIA, OpenAI and OpenRouter speak the OpenAI chat API; Gemini and Claude have their own.

import { AI_KEY_HEADER, AiKeySchema, type AiChoice, type AiProvider } from "@repo/shared";
import { nvidiaSettings } from "../email-assist/nvidia";
import { AiHttpError, type AiCall } from "./ai-call";
import { askClaude, listClaudeModels } from "./anthropic";

export type AiConnection = { provider: AiProvider; model: string; key: string; own: boolean };
const OPENAI_STYLE: Record<"nvidia" | "openai" | "openrouter", string> = {
  nvidia: "https://integrate.api.nvidia.com/v1",
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
};
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * The visitor's own AI (their key from the AI_KEY_HEADER header and their pick of provider and
 * model), else the site's NVIDIA key, else null. "missing-key" when they picked an AI but the key
 * didn't come with it.
 */
export function aiConnection(request: Request, choice: AiChoice | undefined): AiConnection | "missing-key" | null {
  if (choice) {
    const key = AiKeySchema.safeParse(request.headers.get(AI_KEY_HEADER) ?? "");
    return key.success ? { ...choice, key: key.data, own: true } : "missing-key";
  }
  const site = nvidiaSettings();
  return site ? { provider: "nvidia", model: site.model, key: site.key, own: false } : null;
}

async function readJson(response: Response, provider: AiProvider): Promise<unknown> {
  if (!response.ok) throw new AiHttpError(provider, response.status);
  return response.json();
}

type OpenAiReply = { choices?: { message?: { content?: string | null } }[] };

async function askOpenAiStyle(provider: keyof typeof OPENAI_STYLE, key: string, model: string, call: AiCall): Promise<string> {
  // OpenAI's reasoning models spend part of the token budget thinking, and want a different field.
  const reasoning = provider === "openai" && /^(o\d|gpt-5)/.test(model);
  const response = await fetch(`${OPENAI_STYLE[provider]}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: call.system },
        { role: "user", content: call.user },
      ],
      ...(provider === "openai" ? { max_completion_tokens: reasoning ? Math.max(call.maxTokens, 4000) : call.maxTokens } : { max_tokens: call.maxTokens }),
      ...(reasoning ? { reasoning_effort: "low" } : {}),
      // Not every OpenRouter model takes response_format; the prompt asks for JSON anyway.
      ...(call.json && provider !== "openrouter" ? { response_format: { type: "json_object" } } : {}),
      // Same settings as the email assistant: Nemotron answers in ~2 s with thinking off.
      ...(provider === "nvidia" ? { temperature: 0.3, chat_template_kwargs: { enable_thinking: false } } : {}),
    }),
    signal: call.signal,
  });
  const body = (await readJson(response, provider)) as OpenAiReply;
  return body.choices?.[0]?.message?.content ?? "";
}

type GeminiReply = { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };

async function askGoogle(key: string, model: string, call: AiCall): Promise<string> {
  const response = await fetch(`${GEMINI_URL}/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: call.system }] },
      contents: [{ role: "user", parts: [{ text: call.user }] }],
      generationConfig: { maxOutputTokens: Math.max(call.maxTokens, 4000), ...(call.json ? { responseMimeType: "application/json" } : {}) },
    }),
    signal: call.signal,
  });
  const body = (await readJson(response, "google")) as GeminiReply;
  return body.candidates?.[0]?.content?.parts?.filter((part) => !part.thought).map((part) => part.text ?? "").join("") ?? "";
}

export async function askAi({ provider, model, key }: AiConnection, call: AiCall): Promise<string> {
  switch (provider) {
    case "anthropic":
      return askClaude(key, model, call);
    case "google":
      return askGoogle(key, model, call);
    default:
      return askOpenAiStyle(provider, key, model, call);
  }
}

/** The models a key can use; also tells us whether the key works (AiHttpError 401/403 if not). */
export async function listAiModels(provider: AiProvider, key: string, signal: AbortSignal): Promise<string[]> {
  switch (provider) {
    case "anthropic":
      return listClaudeModels(key, signal);
    case "google": {
      const response = await fetch(`${GEMINI_URL}?pageSize=200`, { headers: { "x-goog-api-key": key }, signal });
      const body = (await readJson(response, provider)) as { models?: { name?: string; supportedGenerationMethods?: string[] }[] };
      return (body.models ?? [])
        .filter((model) => model.supportedGenerationMethods?.includes("generateContent"))
        .map((model) => (model.name ?? "").replace(/^models\//, ""));
    }
    case "openrouter": {
      // The model list is public, so check the key on its own first.
      const check = await fetch(`${OPENAI_STYLE.openrouter}/key`, { headers: { authorization: `Bearer ${key}` }, signal });
      if (check.status === 401 || check.status === 403) throw new AiHttpError(provider, check.status);
      const response = await fetch(`${OPENAI_STYLE.openrouter}/models`, { signal });
      const body = (await readJson(response, provider)) as { data?: { id?: string }[] };
      return (body.data ?? []).map((model) => model.id ?? "");
    }
    default: {
      const response = await fetch(`${OPENAI_STYLE[provider]}/models`, { headers: { authorization: `Bearer ${key}` }, signal });
      const body = (await readJson(response, provider)) as { data?: { id?: string }[] };
      const ids = (body.data ?? []).map((model) => model.id ?? "");
      if (provider === "nvidia") await checkNvidiaKey(key, signal);
      return ids;
    }
  }
}

// NVIDIA lists its models to anyone, so the list doesn't prove the key works: a one-token chat
// does. Only a 401/403 counts as a bad key; any other hiccup leaves the check to the first chat.
async function checkNvidiaKey(key: string, signal: AbortSignal) {
  const response = await fetch(`${OPENAI_STYLE.nvidia}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "nvidia/nemotron-3.5-lightning-30b-a3b", messages: [{ role: "user", content: "hi" }], max_tokens: 1 }),
    signal,
  });
  if (response.status === 401 || response.status === 403) throw new AiHttpError("nvidia", response.status);
}
