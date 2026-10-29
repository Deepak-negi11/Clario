import { AGENT_KEY_TTL_DAYS, requireAuth, signAgentKey } from "../middleware/auth";

// POST /api/v1/agent-key: a signed-in user gets a long-lived key for the Claude Code
// hook (tools/agent-hook/setup.mjs saves it). Needs a login token: an agent key
// can't be used to make more keys.
export function handleCreateAgentKey(req: Request): Response {
  const auth = requireAuth(req);
  if (auth instanceof Response) return auth;

  const { key, expiresAt } = signAgentKey(auth.userId);
  return Response.json({ key, expiresAt: expiresAt.toISOString(), validDays: AGENT_KEY_TTL_DAYS });
}
