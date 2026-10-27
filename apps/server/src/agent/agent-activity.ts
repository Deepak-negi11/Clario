import { requireAuth } from "../middleware/auth";
import { broadcast } from "../ws/room-manager";
import { publishRoomEvent } from "../ws/pubsub";
import {
  clearAgentActivity,
  getCurrentSpace,
  setAgentActivity,
} from "../ws/presence";

type AgentActivityBody = {
  text?: unknown;
  state?: unknown;
};

const MAX_TEXT_LENGTH = 200;
const THROTTLE_MS = 1500;

const lastActivityAt = new Map<string, number>();




export async function handleAgentActivity(req: Request): Promise<Response> {
  const auth = requireAuth(req);
  if (auth instanceof Response) return auth;

  const userId = auth.userId;

  const body = (await req.json().catch(() => null)) as AgentActivityBody | null;
  if (!body || typeof body.text !== "string" || typeof body.state !== "string") {
    return Response.json({ message: "text and state are required" }, { status: 400 });
  }

  const state = body.state === "done" ? "done" : "cooking";
  const text = body.text.trim().slice(0, MAX_TEXT_LENGTH);
  if (!text && state === "cooking") {
    return Response.json({ message: "text is required" }, { status: 400 });
  }

  const now = Date.now();
  const last = lastActivityAt.get(userId) ?? 0;
  if (now - last < THROTTLE_MS) {
    return Response.json({ delivered: false, reason: "throttled" });
  }
  lastActivityAt.set(userId, now);

  const spaceId = await getCurrentSpace(userId);
  if (!spaceId) {
    return Response.json({ delivered: false, reason: "not-in-space" });
  }

  if (state === "done") {
    await clearAgentActivity(spaceId, userId);
  } else {
    await setAgentActivity(spaceId, userId, { text, state, at: now });
  }

  const message = {
    type: "agent-activity",
    payload: {
      userId,
      text: state === "done" ? "" : text,
      state,
      at: now,
    },
  } as const;

  broadcast(spaceId, "", message);
  await publishRoomEvent(spaceId, "", message);

  return Response.json({ delivered: true });
}
