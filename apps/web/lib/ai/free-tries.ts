// Server only. The free coworker AI replies on the site's NVIDIA key, kept on the user by the
// game server (GET/POST /api/v1/user/free-ai, FREE_AI_REPLIES in @repo/shared). The player's own
// login token goes with each call, so the count is theirs and works on every web server.

import type { FreeAiTries } from "@repo/shared";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
const TIMEOUT_MS = 3_000;

export function loginToken(request: Request): string | null {
  const auth = request.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  return token || null;
}

function readTries(body: unknown): FreeAiTries | null {
  const tries = body as Partial<FreeAiTries> | null;
  return typeof tries?.left === "number" && typeof tries.used === "number" && typeof tries.limit === "number"
    ? { used: tries.used, limit: tries.limit, left: tries.left }
    : null;
}

async function callTries(token: string, method: "GET" | "POST"): Promise<FreeAiTries | "signed-out" | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/user/free-ai`, {
      method,
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 401 || response.status === 403 || response.status === 404) return "signed-out";
    // 409: none were left to count, and the body still says what's left (0).
    if (!response.ok && response.status !== 409) return null;
    return readTries(await response.json().catch(() => null));
  } catch {
    return null;
  }
}

/** What they have left; "signed-out" for a missing or bad token; null when the game server didn't answer. */
export function freeTriesLeft(token: string) {
  return callTries(token, "GET");
}

/** Counts one reply once the AI has answered; returns what's left after it. */
export function countFreeTry(token: string) {
  return callTries(token, "POST");
}
