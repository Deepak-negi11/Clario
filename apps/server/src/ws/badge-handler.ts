import prisma from "@repo/db";
import { ATTENDANCE_LIST_MAX, ATTENDANCE_LOOKBACK_MS, clampSince, type AttendanceEntry, type ClientMessage, type ServerMessage } from "@repo/shared";
import type { Socket } from "./room-manager";
import { broadcast, isCurrentSocket, isInRoom, sendToUser } from "./room-manager";
import { publishRoomEvent } from "./pubsub";
import { isUserOnline } from "./presence";

type BadgePayload = Extract<ClientMessage, { type: "badge" }>["payload"];

// The front-door badge reader (badge.schema.ts in @repo/shared). Each visit is a row: who, when
// they badged in, when they badged out or left. Only people who joined the space hear about them.

// A closed tab badges you out this long after it closed, unless you are back by then (a reload or a
// dropped connection). The visit ends at the moment the tab closed.
export const LEAVE_GRACE_MS = 30_000;
let leaveGraceMs = LEAVE_GRACE_MS;

// Tests shorten the grace time so they don't wait 30 seconds.
export function setLeaveGrace(ms: number) {
  leaveGraceMs = ms;
}

const NAME_MAX = 64;
const withName = { user: { select: { username: true } } } as const;

type VisitRow = { id: string; userId: string; inAt: Date; outAt: Date | null; user: { username: string } };

function send(ws: Socket, message: unknown) {
  ws.send(JSON.stringify(message));
}

function toEntry(row: VisitRow): AttendanceEntry {
  return {
    id: row.id,
    userId: row.userId,
    name: row.user.username.slice(0, NAME_MAX),
    inAt: row.inAt.getTime(),
    outAt: row.outAt ? row.outAt.getTime() : null,
  };
}

// To everyone in the space, the person it is about included, on every server.
async function tellSpace(spaceId: string, userId: string, message: ServerMessage) {
  sendToUser(spaceId, userId, message);
  broadcast(spaceId, userId, message);
  await publishRoomEvent(spaceId, userId, message);
}

// A person's badge actions run one at a time, so two quick taps can't open two visits.
const queues = new Map<string, Promise<unknown>>();

function oneAtATime<T>(key: string, work: () => Promise<T>): Promise<T> {
  const run = (queues.get(key) ?? Promise.resolve()).then(work, work);
  const settled = run.catch(() => undefined);
  queues.set(key, settled);
  void settled.then(() => {
    if (queues.get(key) === settled) queues.delete(key);
  });
  return run;
}

export async function handleBadge(ws: Socket, payload: BadgePayload) {
  const { spaceId, userId } = ws.data;
  if (!spaceId || !userId) {
    return send(ws, { type: "error", message: "Join a space first" });
  }
  if (!isCurrentSocket(spaceId, userId, ws)) return;

  switch (payload.action) {
    case "in":
      return oneAtATime(`${spaceId}:${userId}`, () => badgeIn(ws, spaceId, userId));
    case "out":
      return oneAtATime(`${spaceId}:${userId}`, () => badgeOut(spaceId, userId, new Date()));
    case "today":
      return sendToday(ws, spaceId, payload.since);
  }
}

async function badgeIn(ws: Socket, spaceId: string, userId: string) {
  const open = await prisma.attendance.findFirst({
    where: { spaceId, userId, outAt: null },
    orderBy: { inAt: "desc" },
    include: withName,
  });
  // Already in: only you hear it, so the reader can say since when.
  if (open) return send(ws, { type: "badge", payload: { event: "in", entry: toEntry(open), fresh: false } });

  const visit = await prisma.attendance.create({ data: { spaceId, userId }, include: withName });
  await tellSpace(spaceId, userId, { type: "badge", payload: { event: "in", entry: toEntry(visit), fresh: true } });
}

// Ends every open visit of theirs in this space at `at` (never before it started).
async function badgeOut(spaceId: string, userId: string, at: Date) {
  const open = await prisma.attendance.findMany({ where: { spaceId, userId, outAt: null }, include: withName });
  for (const visit of open) {
    const outAt = at < visit.inAt ? visit.inAt : at;
    const { count } = await prisma.attendance.updateMany({ where: { id: visit.id, outAt: null }, data: { outAt } });
    if (count) await tellSpace(spaceId, userId, { type: "badge", payload: { event: "out", entry: toEntry({ ...visit, outAt }) } });
  }
}

// Visits that started since the start of the asker's day, plus anyone still in from before it.
async function sendToday(ws: Socket, spaceId: string, since: number) {
  const now = Date.now();
  const from = new Date(clampSince(since, now));
  const rows = await prisma.attendance.findMany({
    where: {
      spaceId,
      OR: [{ inAt: { gte: from } }, { outAt: null, inAt: { gte: new Date(now - ATTENDANCE_LOOKBACK_MS) } }],
    },
    orderBy: { inAt: "desc" },
    take: ATTENDANCE_LIST_MAX,
    include: withName,
  });
  if (ws.readyState !== WebSocket.OPEN) return;
  send(ws, { type: "badge", payload: { event: "today", since: from.getTime(), entries: rows.reverse().map(toEntry) } });
}

// Their tab closed: badge them out at that moment, once the grace time shows they aren't back.
export function badgeOutOnLeave(spaceId: string, userId: string) {
  const leftAt = new Date();
  const timer = setTimeout(() => {
    void (async () => {
      if (isInRoom(spaceId, userId) || (await isUserOnline(spaceId, userId))) return;
      await oneAtATime(`${spaceId}:${userId}`, () => badgeOut(spaceId, userId, leftAt));
    })().catch((error) => console.error("[badge] badge-out failed:", error));
  }, leaveGraceMs);
  // Doesn't keep the process (or a test run) alive.
  timer.unref?.();
}
