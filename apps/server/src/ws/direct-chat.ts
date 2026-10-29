// Private 1-on-1 chat inside a space. Someone asks first; messages only flow once the other
// person accepts. Kept in memory like the rest of the room state, so it resets on restart.

// After a "no", the same person can't ask again for this long (stops request spam).
export const ASK_AGAIN_AFTER_MS = 60_000;

type SpaceChats = {
  pending: Set<string>;
  open: Set<string>;
  declinedAt: Map<string, number>;
};

const spaces = new Map<string, SpaceChats>();

// Keys hold user ids, which never contain ">" or "|".
const requestKey = (fromUserId: string, toUserId: string) => `${fromUserId}>${toUserId}`;
const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

function chatsFor(spaceId: string) {
  let chats = spaces.get(spaceId);
  if (!chats) {
    chats = { pending: new Set(), open: new Set(), declinedAt: new Map() };
    spaces.set(spaceId, chats);
  }
  return chats;
}

export type RequestResult = "sent" | "declined-recently";

// Each request carries the asker's newest public key (the chat is end-to-end encrypted), so asking
// again is always passed on. It also ends a chat that was still open: the asker has lost its keys
// (a reload or a dropped connection), so the old chat can't be read on their side anymore.
export function requestDirectChat(spaceId: string, fromUserId: string, toUserId: string, now = Date.now()): RequestResult {
  const chats = chatsFor(spaceId);
  const key = requestKey(fromUserId, toUserId);
  const declinedAt = chats.declinedAt.get(key);
  if (declinedAt !== undefined && now - declinedAt < ASK_AGAIN_AFTER_MS) return "declined-recently";
  chats.open.delete(pairKey(fromUserId, toUserId));
  chats.pending.add(key);
  return "sent";
}

// The person who was asked answers. False when there is no open request to answer.
export function answerDirectChat(
  spaceId: string,
  responderId: string,
  requesterId: string,
  accept: boolean,
  now = Date.now(),
) {
  const chats = spaces.get(spaceId);
  const key = requestKey(requesterId, responderId);
  if (!chats?.pending.delete(key)) return false;
  // A request each way can be pending at once; one answer settles both.
  chats.pending.delete(requestKey(responderId, requesterId));
  if (accept) {
    chats.open.add(pairKey(requesterId, responderId));
    chats.declinedAt.delete(key);
  } else {
    chats.declinedAt.set(key, now);
  }
  return true;
}

export function canDirectMessage(spaceId: string, a: string, b: string) {
  return spaces.get(spaceId)?.open.has(pairKey(a, b)) ?? false;
}

// Someone left the space: drop their requests and conversations.
export function forgetDirectChats(spaceId: string, userId: string) {
  const chats = spaces.get(spaceId);
  if (!chats) return;
  for (const key of chats.pending) {
    if (key.split(">").includes(userId)) chats.pending.delete(key);
  }
  for (const key of chats.open) {
    if (key.split("|").includes(userId)) chats.open.delete(key);
  }
  for (const key of chats.declinedAt.keys()) {
    if (key.split(">").includes(userId)) chats.declinedAt.delete(key);
  }
  if (chats.pending.size === 0 && chats.open.size === 0 && chats.declinedAt.size === 0) {
    spaces.delete(spaceId);
  }
}
