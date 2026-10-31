import { AI_KEY_HEADER, AI_PROVIDERS, type AiChoice, type AiProvider } from "@repo/shared";

// The visitor's own AI key (bring your own key), kept in this browser only: localStorage when
// they tick "Remember on this device", otherwise sessionStorage, so it is gone when the tab
// closes. It is sent with each coworker chat in the x-ai-key header, never in a URL or a body,
// and our server never saves it. Saving or removing it tells open panels with an "ai-key" event.

export type StoredAi = { provider: AiProvider; model: string; key: string; remember: boolean };

const STORAGE_KEY = "clario:ai-key:v1";
export const AI_CHANGED_EVENT = "clario:ai-key";

function readFrom(storage: Storage): Omit<StoredAi, "remember"> | null {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) ?? "null") as Partial<StoredAi> | null;
    if (!parsed || typeof parsed.key !== "string" || typeof parsed.model !== "string") return null;
    if (!AI_PROVIDERS.includes(parsed.provider as AiProvider)) return null;
    return { provider: parsed.provider as AiProvider, model: parsed.model, key: parsed.key };
  } catch {
    return null;
  }
}

export function readStoredAi(): StoredAi | null {
  const session = readFrom(sessionStorage);
  if (session) return { ...session, remember: false };
  const local = readFrom(localStorage);
  return local ? { ...local, remember: true } : null;
}

export function saveStoredAi({ remember, ...ai }: StoredAi) {
  try {
    (remember ? localStorage : sessionStorage).setItem(STORAGE_KEY, JSON.stringify(ai));
    (remember ? sessionStorage : localStorage).removeItem(STORAGE_KEY);
  } catch {
    // Private mode or full storage: it works until the page reloads.
  }
  window.dispatchEvent(new Event(AI_CHANGED_EVENT));
}

export function clearStoredAi() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing stored.
  }
  window.dispatchEvent(new Event(AI_CHANGED_EVENT));
}

/** The header and body field a coworker chat needs to run on this AI. */
export function aiRequestParts(ai: StoredAi | null): { headers: Record<string, string>; choice?: AiChoice } {
  if (!ai) return { headers: {} };
  return { headers: { [AI_KEY_HEADER]: ai.key }, choice: { provider: ai.provider, model: ai.model } };
}
