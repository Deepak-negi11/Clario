import { NOTICE_LIST_MAX, POLL_CLOSE_MAX_MS, POLL_CLOSE_MIN_MS, type NoticePost } from "../ws/notice.schema";

// Vote counting and ordering for the notice board (notice.schema.ts), shared by the server and the page.

// How many votes each option has. Votes for options the poll doesn't have are not counted.
export function countVotes(optionCount: number, votes: readonly number[]) {
  const counts = Array.from({ length: optionCount }, () => 0);
  for (const option of votes) {
    if (Number.isInteger(option) && option >= 0 && option < optionCount) counts[option]! += 1;
  }
  return counts;
}

// Each option's share of the votes, in whole percent (0 for all while nobody voted).
export function voteShares(counts: readonly number[]) {
  const total = counts.reduce((sum, count) => sum + count, 0);
  return counts.map((count) => (total ? Math.round((count / total) * 100) : 0));
}

export function pollOpen(post: Pick<NoticePost, "kind" | "closesAt">, now: number) {
  return post.kind === "poll" && (post.closesAt === null || post.closesAt > now);
}

// Why a poll can't close at that time, or null when it can (null: it never closes).
export function pollCloseRefusal(closesAt: number | null, now: number) {
  if (closesAt === null) return null;
  if (closesAt < now + POLL_CLOSE_MIN_MS) return "Pick a closing time at least a minute from now.";
  if (closesAt > now + POLL_CLOSE_MAX_MS) return "Pick a closing time within 30 days.";
  return null;
}

// Pinned posts first, then the newest.
export function sortNotices(posts: NoticePost[]) {
  return [...posts].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt || a.id.localeCompare(b.id));
}

// Adds a new post or replaces a changed one, keeping the board in order and within its size.
export function upsertNotice(posts: NoticePost[], post: NoticePost) {
  return sortNotices([...posts.filter((existing) => existing.id !== post.id), post]).slice(0, NOTICE_LIST_MAX);
}

// Posts by other people since you last opened the board.
export function unreadNotices(posts: NoticePost[], lastSeenAt: number, selfId: string | null) {
  return posts.filter((post) => post.authorId !== selfId && post.createdAt > lastSeenAt).length;
}
