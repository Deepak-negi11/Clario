import { describe, expect, test } from "bun:test";
import { AiChoiceSchema, AiKeySchema, chatModels, cleanAiKey, detectAiProvider, suggestModel } from "./ai-providers";

describe("detectAiProvider", () => {
  test("spots each provider from its key prefix", () => {
    expect(detectAiProvider("nvapi-abc123")).toBe("nvidia");
    expect(detectAiProvider("AIzaSyD-example")).toBe("google");
    expect(detectAiProvider("sk-ant-api03-example")).toBe("anthropic");
    expect(detectAiProvider("sk-or-v1-example")).toBe("openrouter");
    expect(detectAiProvider("sk-proj-example")).toBe("openai");
    expect(detectAiProvider("  sk-example  ")).toBe("openai");
  });

  test("longer prefixes win over sk-", () => {
    expect(detectAiProvider("sk-ant-admin01-example")).toBe("anthropic");
    expect(detectAiProvider("sk-or-v1-0123456789abcdef")).toBe("openrouter");
    expect(detectAiProvider("sk-svcacct-example")).toBe("openai");
  });

  test("still spots the key when pasted with an env name, quotes or Bearer", () => {
    expect(detectAiProvider('NVIDIA_API_KEY="nvapi-abc123"')).toBe("nvidia");
    expect(detectAiProvider("Bearer sk-ant-api03-example")).toBe("anthropic");
    expect(detectAiProvider("'AIzaSyD-example'")).toBe("google");
  });

  test("anything else is unknown", () => {
    expect(detectAiProvider("hello")).toBeNull();
    expect(detectAiProvider("")).toBeNull();
    expect(detectAiProvider("gsk_groqkeyexample")).toBeNull();
  });
});

describe("cleanAiKey", () => {
  test("keeps just the key", () => {
    const key = "sk-proj-abcdefghijklmnopqrstuvwxyz";
    for (const pasted of [key, `  ${key}\n`, `"${key}"`, `'${key}';`, `Bearer ${key}`, `OPENAI_API_KEY=${key}`, `OPENAI_KEY: ${key}`]) {
      expect(cleanAiKey(pasted)).toBe(key);
    }
    expect(AiKeySchema.safeParse(cleanAiKey(`OPENAI_API_KEY="${key}"`)).success).toBe(true);
  });

  test("leaves keys that merely contain those characters alone", () => {
    expect(cleanAiKey("nvapi-AbC_123-xyz")).toBe("nvapi-AbC_123-xyz");
    expect(cleanAiKey("AIzaSyD-ab_cd")).toBe("AIzaSyD-ab_cd");
  });
});

describe("AiKeySchema", () => {
  test("accepts key-like strings only", () => {
    expect(AiKeySchema.safeParse("sk-ant-api03-abcdefghijklmnopqrstuvwxyz").success).toBe(true);
    expect(AiKeySchema.safeParse("short").success).toBe(false);
    expect(AiKeySchema.safeParse("sk-ant-api03 with spaces in it okay").success).toBe(false);
    expect(AiKeySchema.safeParse("sk-ant-api03-abcdefghij\nInjected: header").success).toBe(false);
  });
});

describe("AiChoiceSchema", () => {
  test("model ids like the providers use", () => {
    for (const model of ["claude-opus-5-5", "gemini-flash-latest", "nvidia/nemotron-3.5-lightning-30b-a3b", "openai/gpt-5-mini:free", "gpt-4.1-mini"]) {
      expect(AiChoiceSchema.safeParse({ provider: "openrouter", model }).success).toBe(true);
    }
    expect(AiChoiceSchema.safeParse({ provider: "openai", model: "../../etc" }).success).toBe(true); // just a model string; never a path
    expect(AiChoiceSchema.safeParse({ provider: "openai", model: "a b" }).success).toBe(false);
  });
});

describe("chatModels", () => {
  test("drops models that can't chat, de-duplicates and sorts", () => {
    expect(chatModels(["text-embedding-3-small", "gpt-5-mini", "whisper-1", "gpt-4.1", "gpt-5-mini", "dall-e-3", "tts-1", "omni-moderation-latest"])).toEqual([
      "gpt-4.1",
      "gpt-5-mini",
    ]);
  });
});

describe("suggestModel", () => {
  test("prefers the listed default, then a partial match, then the first model", () => {
    expect(suggestModel("anthropic", ["claude-haiku-5-5", "claude-opus-5-5"])).toBe("claude-opus-5-5");
    expect(suggestModel("google", ["gemini-2.5-pro", "gemini-2.5-flash-lite"])).toBe("gemini-2.5-flash-lite");
    expect(suggestModel("openai", ["o4", "zzz"])).toBe("o4");
    expect(suggestModel("openai", [])).toBe("");
  });
});
