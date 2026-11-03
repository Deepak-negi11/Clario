import { requireAgentAuth } from "../middleware/auth";
import { broadcast } from "../ws/room-manager";
import { publishRoomEvent } from "../ws/pubsub";
import {
  clearAgentActivity,
  getCurrentSpace,
  getAgentActivities,
  setAgentActivity,
} from "../ws/presence";
import { parseAgentGitInfo, parseAgentName } from "./git-info";
import { markAgentConnected } from "./agent-key";

type AgentActivityBody = {
  text?: unknown;
  state?: unknown;
  project?: unknown;
  branch?: unknown;
  commit?: unknown;
  agent?: unknown;
};

const MAX_TEXT_LENGTH = 200;
const THROTTLE_MS = 1500;

const lastActivityAt = new Map<string, number>();




export async function handleAgentActivity(req: Request): Promise<Response> {
  // The hook sends a long-lived agent key (setup.mjs) or, from older setups, a login token.
  const auth = requireAgentAuth(req);
  if (auth instanceof Response) return auth;

  const userId = auth.userId;
  // Any authenticated update means the hook is set up (setup's own check counts too).
  // Never let this fail the update itself.
  await markAgentConnected(userId).catch(() => {});

  const body = (await req.json().catch(() => null)) as AgentActivityBody | null;
  if (!body || typeof body.text !== "string" || typeof body.state !== "string") {
    return Response.json({ message: "text and state are required" }, { status: 400 });
  }

  const state = body.state === "done" ? "done" : "cooking";
  const text = body.text.trim().slice(0, MAX_TEXT_LENGTH);
  if (!text && state === "cooking") {
    return Response.json({ message: "text is required" }, { status: 400 });
  }

  // Only "cooking" updates are throttled, and only by earlier "cooking" ones. A "done" usually
  // arrives right after the last tool call (dropping it would leave the badge stuck on), and the
  // next turn's first update often comes right after a "done" (dropping it would hide the agent).
  const agent = parseAgentName(body.agent);
  const throttleKey = `${userId}:${agent ?? "claude-code"}`;
  const now = Date.now();
  if (state === "cooking") {
    if (now - (lastActivityAt.get(throttleKey) ?? 0) < THROTTLE_MS) {
      return Response.json({ delivered: false, reason: "throttled" });
    }
    lastActivityAt.set(throttleKey, now);
  }

  const spaceId = await getCurrentSpace(userId);
  if (!spaceId) {
    return Response.json({ delivered: false, reason: "not-in-space" });
  }

  // Which agent, and its project, branch and commit, only describe a running agent; "done" clears them.
  const git = state === "cooking" ? { ...parseAgentGitInfo(body), ...(agent ? { agent } : {}) } : {};

  if (state === "done") {
    lastActivityAt.delete(throttleKey);
    const current = (await getAgentActivities(spaceId))[userId];
    if (agent && current?.agent && current.agent !== agent) {
      return Response.json({ delivered: false, reason: "different-agent-active" });
    }
    await clearAgentActivity(spaceId, userId);
  } else {
    await setAgentActivity(spaceId, userId, { text, state, at: now, ...git });
  }

  const message = {
    type: "agent-activity",
    payload: {
      userId,
      text: state === "done" ? "" : text,
      state,
      at: now,
      ...git,
    },
  } as const;

  broadcast(spaceId, "", message);
  await publishRoomEvent(spaceId, "", message);

  return Response.json({ delivered: true });
}
