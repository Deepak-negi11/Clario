// Free AI replies: each signed-in user gets a few coworker replies on the site's NVIDIA key, then
// adds their own key (AI settings) to keep chatting with the AI. The count lives on the user in
// Postgres (apps/server, /api/v1/user/free-ai), so it survives reloads and is the same on every
// web server. Replies on the visitor's own key, saved lines and movement commands don't count.

export const FREE_AI_REPLIES = 20;

export type FreeAiTries = { used: number; limit: number; left: number };

/** What a user has left after `used` free replies. */
export function freeAiTries(used: number): FreeAiTries {
  const counted = Math.max(0, Math.floor(used));
  return { used: counted, limit: FREE_AI_REPLIES, left: Math.max(0, FREE_AI_REPLIES - counted) };
}

export function freeTriesUsedUpNotice(): string {
  return `You've used your ${FREE_AI_REPLIES} free AI replies, add your own API key to keep chatting.`;
}
