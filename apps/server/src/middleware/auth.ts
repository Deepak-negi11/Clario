import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret";

export type AuthUser = {
  userId: string;
};

export function getUserIdFromToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId?: unknown };
    return typeof payload.userId === "string" ? payload.userId : null;
  } catch {
    return null;
  }
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
