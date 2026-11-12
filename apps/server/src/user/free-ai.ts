import prisma from "@repo/db";
import { FREE_AI_REPLIES, freeAiTries } from "@repo/shared";
import { guestRefusal, isGuest } from "../auth/guest";
import { requireAuth } from "../middleware/auth";

// The free coworker AI replies on the site's NVIDIA key (FREE_AI_REPLIES, @repo/shared). The web
// app's chat route checks what's left before asking the AI, and counts a reply once the AI has
// answered, with the player's own login token. Counting needs a reply left, so it stops at the
// limit even when two replies finish at once. Guests get none (403): they'd get 3 more per link.

async function usedBy(userId: string): Promise<number | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { freeAiRepliesUsed: true } });
  return user ? user.freeAiRepliesUsed : null;
}

// GET /api/v1/user/free-ai: { used, limit, left }.
export async function handleGetFreeAi(req: Request): Promise<Response> {
  const auth = requireAuth(req);
  if (auth instanceof Response) return auth;
  if (await isGuest(auth.userId)) return guestRefusal("chat with the AI coworkers");
  const used = await usedBy(auth.userId);
  if (used === null) return Response.json({ message: "User not found" }, { status: 404 });
  return Response.json(freeAiTries(used));
}

// POST /api/v1/user/free-ai: counts one reply. 409 with { left: 0 } when none were left.
export async function handleUseFreeAi(req: Request): Promise<Response> {
  const auth = requireAuth(req);
  if (auth instanceof Response) return auth;
  if (await isGuest(auth.userId)) return guestRefusal("chat with the AI coworkers");
  const { count } = await prisma.user.updateMany({
    where: { id: auth.userId, freeAiRepliesUsed: { lt: FREE_AI_REPLIES } },
    data: { freeAiRepliesUsed: { increment: 1 } },
  });
  const used = await usedBy(auth.userId);
  if (used === null) return Response.json({ message: "User not found" }, { status: 404 });
  return Response.json(freeAiTries(used), { status: count ? 200 : 409 });
}
