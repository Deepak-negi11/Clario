// Server only. Who is asking, checked with the game server (it holds the JWT secret), so only
// signed-in players can spend the AI key and the rate limit counts per person, not per network.
// Answers are kept for a few minutes so a pause in typing doesn't cost a game-server call.

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
const KEEP_MS = 5 * 60_000;
const MAX_KEPT = 500;
const CHECK_TIMEOUT_MS = 3_000;

const known = new Map<string, { userId: string; at: number }>();

export async function signedInUserId(request: Request): Promise<string | null> {
  const auth = request.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return null;

  const now = Date.now();
  const kept = known.get(token);
  if (kept && now - kept.at < KEEP_MS) return kept.userId;
  known.delete(token);

  const response = await fetch(`${API_BASE_URL}/api/v1/user/profile`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
  });
  if (!response.ok) return null;
  const profile = (await response.json().catch(() => null)) as { userId?: unknown } | null;
  if (typeof profile?.userId !== "string") return null;

  // Oldest first, so the first key is the one to drop.
  if (known.size >= MAX_KEPT) known.delete(known.keys().next().value ?? "");
  known.set(token, { userId: profile.userId, at: now });
  return profile.userId;
}
