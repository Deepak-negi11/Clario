import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret";

export type AuthUser = {
  userId: string;
};

// Agent keys outlive login tokens (180 days vs 7), so they carry a scope and only
// the agent-activity endpoint accepts them (requireAgentAuth).
const AGENT_SCOPE = "agent";
export const AGENT_KEY_TTL_DAYS = 180;

type TokenPayload = { userId?: unknown; scope?: unknown };

function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
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

/** A long-lived key for the Claude Code hook that can only post agent activity. */
export function signAgentKey(userId: string): { key: string; expiresAt: Date } {
  const key = jwt.sign({ userId, scope: AGENT_SCOPE }, JWT_SECRET, { expiresIn: `${AGENT_KEY_TTL_DAYS}d` });
  const { exp } = jwt.decode(key) as { exp: number };
  return { key, expiresAt: new Date(exp * 1000) };
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
