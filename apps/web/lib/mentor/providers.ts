// Server only. Talks to the AI that answers as Maya: Gemini (hosted) or Ollama (local).
// Both are asked for JSON in the coaching format (COACHED_REPLY_JSON_SCHEMA) and return it as raw
// text; the route reads it with readCoachedReply and falls back to saved tips on any error.

import {
  COACHED_REPLY_JSON_SCHEMA,
  GeminiReplySchema,
  OllamaReplySchema,
  type MentorMessage,
  type MentorRequest,
  type MentorSource,
} from "@repo/shared";
import { mentorSystemPrompt } from "./prompt";

type InputMode = MentorRequest["inputMode"];

export type MentorProvider = {
  source: Exclude<MentorSource, "saved-tips">;
  ask: (history: MentorMessage[], message: string, inputMode: InputMode, signal: AbortSignal) => Promise<string>;
};

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";

// Which AI is configured, or why none is (shown to the learner as a notice).
export function getMentorProvider(): MentorProvider | { missing: string } {
  if (process.env.AI_PROVIDER === "ollama") {
    const model = process.env.OLLAMA_MODEL?.trim();
    if (!model) return { missing: "OLLAMA_MODEL is not set" };
    const baseUrl = (process.env.OLLAMA_URL?.trim() || "http://localhost:11434").replace(/\/+$/, "");
    return {
      source: "local",
      ask: (history, message, inputMode, signal) => askOllama(baseUrl, model, history, message, inputMode, signal),
    };
  }

  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return { missing: "no GEMINI_API_KEY is set" };
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-flash-latest";
  return {
    source: "gemini",
    ask: (history, message, inputMode, signal) => askGemini(key, model, history, message, inputMode, signal),
  };
}

// Gemini expects the conversation to start with the learner, so drop any leading mentor turns.
function fromFirstUserTurn(history: MentorMessage[]): MentorMessage[] {
  const first = history.findIndex((turn) => turn.role === "user");
  return first === -1 ? [] : history.slice(first);
}

async function askGemini(
  key: string,
  model: string,
  history: MentorMessage[],
  message: string,
  inputMode: InputMode,
  signal: AbortSignal,
) {
  const response = await fetch(`${GEMINI_URL}/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: mentorSystemPrompt(inputMode) }] },
      contents: [
        ...fromFirstUserTurn(history).map((turn) => ({
          role: turn.role === "user" ? "user" : "model",
          parts: [{ text: turn.text }],
        })),
        { role: "user", parts: [{ text: message }] },
      ],
      // Thinking tokens count toward this limit, so leave room beyond the ~80-word answer and hints.
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
        responseJsonSchema: COACHED_REPLY_JSON_SCHEMA,
      },
    }),
    signal,
  });
  if (!response.ok) throw new Error(`Gemini returned HTTP ${response.status}`);

  const data = GeminiReplySchema.parse(await response.json());
  const parts = data.candidates[0]?.content?.parts ?? [];
  return parts.filter((part) => !part.thought).map((part) => part.text ?? "").join("");
}

async function askOllama(
  baseUrl: string,
  model: string,
  history: MentorMessage[],
  message: string,
  inputMode: InputMode,
  signal: AbortSignal,
) {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      format: COACHED_REPLY_JSON_SCHEMA,
      messages: [
        { role: "system", content: mentorSystemPrompt(inputMode) },
        ...history.map((turn) => ({ role: turn.role === "user" ? "user" : "assistant", content: turn.text })),
        { role: "user", content: message },
      ],
      options: { temperature: 0.6 },
    }),
    signal,
  });
  if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}`);

  return OllamaReplySchema.parse(await response.json()).message.content;
}
