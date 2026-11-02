import prisma from "@repo/db";
import {
  NOTICE_LIST_MAX, countVotes, pollCloseRefusal, pollOpen,
  type ClientMessage, type NoticePost, type ServerMessage,
} from "@repo/shared";
import type { Socket } from "./room-manager";
import { broadcast, isCurrentSocket, sendToUser } from "./room-manager";
import { publishRoomEvent } from "./pubsub";
import { requestBudget } from "../utils/security";

type NoticePayload = Extract<ClientMessage, { type: "notice" }>["payload"];

// The notice board (notice.schema.ts in @repo/shared). The schema has already cleaned and limited
// the text; here the server checks who may change what, rate-limits, saves, and tells the space.
// Votes are counted per option: nobody is told who voted for what, only you hear your own choice.

// Posts and edits per person per minute, and votes per person per minute (on this server).
const postBudget = requestBudget(5, 60_000);
const voteBudget = requestBudget(30, 60_000);

const NAME_MAX = 64;
const withAuthor = { author: { select: { username: true } } } as const;

type NoticeRow = {
  id: string;
  kind: "Announcement" | "Poll";
  authorId: string;
  title: string;
  body: string;
  pinned: boolean;
  options: string[];
  closesAt: Date | null;
  createdAt: Date;
  editedAt: Date | null;
  author: { username: string };
};

function send(ws: Socket, message: unknown) {
  ws.send(JSON.stringify(message));
}

function refuse(ws: Socket, reason: string) {
  send(ws, { type: "notice", payload: { event: "refused", reason } });
}

function toPost(row: NoticeRow, votes: number[]): NoticePost {
  const isPoll = row.kind === "Poll";
  return {
    id: row.id,
    kind: isPoll ? "poll" : "announcement",
    authorId: row.authorId,
    authorName: row.author.username.slice(0, NAME_MAX),
    title: row.title,
    body: row.body,
    pinned: row.pinned,
    options: isPoll ? row.options : [],
    votes: isPoll ? countVotes(row.options.length, votes) : [],
    closesAt: row.closesAt ? row.closesAt.getTime() : null,
    createdAt: row.createdAt.getTime(),
    editedAt: row.editedAt ? row.editedAt.getTime() : null,
  };
}

// Every vote's option, per poll.
async function votesFor(noticeIds: string[]) {
  const byNotice = new Map<string, number[]>();
  if (!noticeIds.length) return byNotice;
  const groups = await prisma.noticeVote.groupBy({
    by: ["noticeId", "option"],
    where: { noticeId: { in: noticeIds } },
    _count: { _all: true },
  });
  for (const group of groups) {
    const list = byNotice.get(group.noticeId) ?? [];
    for (let i = 0; i < group._count._all; i++) list.push(group.option);
    byNotice.set(group.noticeId, list);
  }
  return byNotice;
}

async function postView(row: NoticeRow) {
  const votes = row.kind === "Poll" ? (await votesFor([row.id])).get(row.id) ?? [] : [];
  return toPost(row, votes);
}

// To everyone in the space, the sender included, on every server.
async function tellSpace(spaceId: string, userId: string, message: ServerMessage) {
  sendToUser(spaceId, userId, message);
  broadcast(spaceId, userId, message);
  await publishRoomEvent(spaceId, userId, message);
}

export async function handleNotice(ws: Socket, payload: NoticePayload) {
  const { spaceId, userId } = ws.data;
  if (!spaceId || !userId) {
    return send(ws, { type: "error", message: "Join a space first" });
  }
  if (!isCurrentSocket(spaceId, userId, ws)) return;

  if (payload.action === "list") return sendBoard(ws, spaceId, userId);
  if (payload.action === "vote") return vote(ws, spaceId, userId, payload.postId, payload.option);

  const wait = postBudget(`${spaceId}:${userId}`);
  if (wait) return refuse(ws, `You're posting a lot. Try again in ${wait} s.`);
  const now = Date.now();

  switch (payload.action) {
    case "announce":
    case "poll": {
      const isPoll = payload.action === "poll";
      const closesAt = isPoll ? payload.closesAt : null;
      const refusal = pollCloseRefusal(closesAt, now);
      if (refusal) return refuse(ws, refusal);
      const row = await prisma.notice.create({
        data: {
          spaceId,
          authorId: userId,
          kind: isPoll ? "Poll" : "Announcement",
          title: payload.title,
          body: payload.body,
          pinned: payload.pinned,
          options: isPoll ? payload.options : [],
          closesAt: closesAt === null ? null : new Date(closesAt),
        },
        include: withAuthor,
      });
      return tellSpace(spaceId, userId, { type: "notice", payload: { event: "saved", post: toPost(row, []) } });
    }
    case "edit": {
      const existing = await prisma.notice.findFirst({ where: { id: payload.postId, spaceId }, select: { authorId: true, kind: true } });
      if (!existing) return refuse(ws, "That post is gone.");
      if (existing.authorId !== userId) return refuse(ws, "Only the person who posted it can change it.");
      // A poll's closing time changes only when one is sent; announcements never have one.
      const closesAt = existing.kind === "Poll" ? payload.closesAt : undefined;
      if (closesAt !== undefined) {
        const refusal = pollCloseRefusal(closesAt, now);
        if (refusal) return refuse(ws, refusal);
      }
      const row = await prisma.notice.update({
        where: { id: payload.postId },
        data: {
          title: payload.title,
          body: payload.body,
          pinned: payload.pinned,
          editedAt: new Date(now),
          ...(closesAt !== undefined ? { closesAt: closesAt === null ? null : new Date(closesAt) } : {}),
        },
        include: withAuthor,
      });
      return tellSpace(spaceId, userId, { type: "notice", payload: { event: "saved", post: await postView(row) } });
    }
    case "delete": {
      const { count } = await prisma.notice.deleteMany({ where: { id: payload.postId, spaceId, authorId: userId } });
      if (!count) {
        const exists = await prisma.notice.findFirst({ where: { id: payload.postId, spaceId }, select: { id: true } });
        return refuse(ws, exists ? "Only the person who posted it can delete it." : "That post is gone.");
      }
      return tellSpace(spaceId, userId, { type: "notice", payload: { event: "removed", postId: payload.postId } });
    }
  }
}

async function sendBoard(ws: Socket, spaceId: string, userId: string) {
  const rows = await prisma.notice.findMany({
    where: { spaceId },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    take: NOTICE_LIST_MAX,
    include: withAuthor,
  });
  const pollIds = rows.filter((row) => row.kind === "Poll").map((row) => row.id);
  const [votes, mine] = await Promise.all([
    votesFor(pollIds),
    pollIds.length
      ? prisma.noticeVote.findMany({ where: { userId, noticeId: { in: pollIds } }, select: { noticeId: true, option: true } })
      : Promise.resolve([]),
  ]);
  if (ws.readyState !== WebSocket.OPEN) return;
  send(ws, {
    type: "notice",
    payload: {
      event: "list",
      posts: rows.map((row) => toPost(row, votes.get(row.id) ?? [])),
      myVotes: Object.fromEntries(mine.map((vote) => [vote.noticeId, vote.option])),
    },
  });
}

async function vote(ws: Socket, spaceId: string, userId: string, postId: string, option: number) {
  const wait = voteBudget(`${spaceId}:${userId}`);
  if (wait) return refuse(ws, `Too many votes. Try again in ${wait} s.`);

  const row = await prisma.notice.findFirst({ where: { id: postId, spaceId }, include: withAuthor });
  if (!row) return refuse(ws, "That poll is gone.");
  if (row.kind !== "Poll") return refuse(ws, "That post isn't a poll.");
  if (!pollOpen({ kind: "poll", closesAt: row.closesAt?.getTime() ?? null }, Date.now())) return refuse(ws, "That poll has closed.");
  if (option >= row.options.length) return refuse(ws, "That option isn't in the poll.");

  // One vote per person: voting again changes it.
  await prisma.noticeVote.upsert({
    where: { noticeId_userId: { noticeId: postId, userId } },
    create: { noticeId: postId, userId, option },
    update: { option },
  });
  send(ws, { type: "notice", payload: { event: "voted", postId, option } });
  await tellSpace(spaceId, userId, { type: "notice", payload: { event: "saved", post: await postView(row) } });
}
