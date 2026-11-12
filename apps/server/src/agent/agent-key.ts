import prisma from "@repo/db";
import { guestRefusal, isGuest } from "../auth/guest";
import { requireAuth, signAgentKey } from "../middleware/auth";

// POST /api/v1/agent-key: the signed-in user's key for the Claude Code hook. The space
// sidebar shows it as `npx clario-agent setup --key …`. It's the same key every time for
// the same user. Needs a login token: an agent key can't be used to fetch keys. Not for guests.
export async function handleCreateAgentKey(req: Request): Promise<Response> {
  const auth = requireAuth(req);
  if (auth instanceof Response) return auth;
  if (await isGuest(auth.userId)) return guestRefusal("connect a coding agent");

  return Response.json({ key: signAgentKey(auth.userId) });
}

// GET /api/v1/agent-key: whether the signed-in user's agent hook has reached the server,
// so the space sidebar hides the setup once it has.
export async function handleAgentKeyStatus(req: Request): Promise<Response> {
  const auth = requireAuth(req);
  if (auth instanceof Response) return auth;

  const user = await prisma.user.findUnique({ where: { id: auth.userId }, select: { agentConnectedAt: true } });
  if (!user) return Response.json({ message: "User not found" }, { status: 404 });
  return Response.json({ connected: user.agentConnectedAt !== null, connectedAt: user.agentConnectedAt?.toISOString() ?? null });
}

// Users whose agentConnectedAt is already set, so it's written once per process, not per event.
const connected = new Set<string>();

/** Remember that this user's agent hook reached the server. Only the first time is stored. */
export async function markAgentConnected(userId: string): Promise<void> {
  if (connected.has(userId)) return;
  await prisma.user.updateMany({ where: { id: userId, agentConnectedAt: null }, data: { agentConnectedAt: new Date() } });
  connected.add(userId);
}
