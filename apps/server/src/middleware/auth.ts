import jwt from "jsonwebtoken";
import { jwtSecret } from "../utils/security";

const JWT_SECRET = jwtSecret();

export type AuthUser = {
  userId: string;
};

// Agent keys outlive login tokens, so they carry a scope and only the agent-activity
// endpoint accepts them (requireAgentAuth).
const AGENT_SCOPE = "agent";

type TokenPayload = { userId?: unknown; scope?: unknown };

function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] }) as TokenPayload;
  } catch {
    return null;
  }
}

export function getUserIdFromToken(token: string): string | null {
  const payload = verifyToken(token);
  // Only login tokens (no scope): an agent key can't open a socket or call any other endpoint.
  if (!payload || payload.scope !== undefined) return null;
  return typeof payload.userId === "string" ? payload.userId : null;
}

/**
 * The user's key for the Claude Code hook; it can only post agent activity. One per user and
 * always the same: no issue time and no expiry, so HS256 signs the same text every time.
 * Changing JWT_SECRET cancels every key (and every login). Older keys with an expiry still work.
 */
export function signAgentKey(userId: string): string {
  return jwt.sign({ userId, scope: AGENT_SCOPE }, JWT_SECRET, { algorithm: "HS256", noTimestamp: true });
}

/** Agent activity accepts a login token or an agent key. */
export function requireAgentAuth(req: Request): AuthUser | Response {
  const auth = req.headers.get("authorization") ?? req.headers.get("Authorization");
  const payload = auth?.startsWith("Bearer ") ? verifyToken(auth.slice(7)) : null;
  if (!payload || (payload.scope !== undefined && payload.scope !== AGENT_SCOPE) || typeof payload.userId !== "string") {
    return Response.json({ message: "Unauthorized" }, { status: 403 });
  }
  return { userId: payload.userId };
}

export function getUserId(req: Request): string | null {
  const auth = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return getUserIdFromToken(auth.slice(7));
}

export function requireAuth(req: Request): AuthUser | Response {
  const userId = getUserId(req);
  if (!userId) return Response.json({ message: "Unauthorized" }, { status: 403 });
  return { userId };
}
