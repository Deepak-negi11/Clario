// Server only. One Gemini request, as plain text or as JSON that follows a schema.
// The key stays on the server (GEMINI_API_KEY, never NEXT_PUBLIC_).

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";

export type GeminiSettings = { key: string; model: string };
export type GeminiTurn = { role: "user" | "model"; text: string };

export function geminiSettings(): GeminiSettings | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return null;
  return { key, model: process.env.GEMINI_MODEL?.trim() || "gemini-flash-latest" };
}

export async function askGemini(
  settings: GeminiSettings,
  request: { system: string; turns: GeminiTurn[]; jsonSchema?: object; signal: AbortSignal },
): Promise<string> {
  const response = await fetch(`${GEMINI_URL}/${encodeURIComponent(settings.model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": settings.key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: request.system }] },
      contents: request.turns.map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] })),
      generationConfig: request.jsonSchema
        ? { responseMimeType: "application/json", responseJsonSchema: request.jsonSchema, temperature: 0.2 }
        : { temperature: 0.7 },
    }),
    signal: request.signal,
  });
  if (!response.ok) throw new Error(`Gemini answered ${response.status}`);
  const body = (await response.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  if (!text.trim()) throw new Error("Gemini returned no text");
  return text;
}
