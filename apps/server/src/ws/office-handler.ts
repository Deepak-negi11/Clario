import prisma from "@repo/db";
import {
  getMapTemplate, isBookableRoom,
  type ChatRoomZone, type ClientMessage, type OfficeServerPayload, type ServerMessage,
} from "@repo/shared";
import type { Socket } from "./room-manager";
import { broadcast, isInRoom, sendToUser } from "./room-manager";
import { publishRoomEvent } from "./pubsub";
import { isUserOnline } from "./presence";
import { loadSpaceMap, mapSize } from "./space-layout";
import { createOfficeStore, redisKv, type OfficeStore, type Person } from "./office-store";

// Room bookings, whiteboards, lockers and the kitchen shelf (office.schema.ts in @repo/shared; the
// state and its rules in office-store.ts). Bookings, boards and the shelf are the same for everyone
// in the space, so changes go to all of them on every server. A locker is private: only its owner
// is sent what's in it; everyone else just hears that it changed, and the owner asks again.

type OfficePayload = Extract<ClientMessage, { type: "office" }>["payload"];

export type OfficeDeps = {
  store: OfficeStore;
  // The space's rooms (from its template, or its saved layout) and map size.
  rooms: (spaceId: string) => Promise<{ rooms: ChatRoomZone[]; width: number; height: number }>;
  nameOf: (userId: string) => Promise<string>;
  isHere: (spaceId: string, userId: string) => Promise<boolean>;
  // Delivers a message to one person, and to everyone in the space (here and on other servers).
  tellOne: (spaceId: string, userId: string, message: ServerMessage) => void;
  tellAll: (spaceId: string, fromUserId: string, message: ServerMessage) => Promise<void>;
};

const office = (payload: OfficeServerPayload): ServerMessage => ({ type: "office", payload });

// Names and rooms change rarely; a short memory saves a database read per action.
const CACHE_MS = 60_000;
const names = new Map<string, { name: string; at: number }>();
const roomsCache = new Map<string, { value: Awaited<ReturnType<OfficeDeps["rooms"]>>; at: number }>();

export const defaultOfficeDeps: OfficeDeps = {
  store: createOfficeStore(redisKv),
  rooms: async (spaceId) => {
    const hit = roomsCache.get(spaceId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
    const space = await prisma.space.findUnique({ where: { id: spaceId }, select: { mapTemplate: true } });
    const map = await loadSpaceMap(spaceId, space?.mapTemplate, { remember: false });
    const rooms = map.layout ? map.layout.rooms : getMapTemplate(map.mapTemplate).chatRooms;
    const value = { rooms, ...mapSize(map) };
    roomsCache.set(spaceId, { value, at: Date.now() });
    return value;
  },
  nameOf: async (userId) => {
    const hit = names.get(userId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.name;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
    const name = (user?.username ?? "Someone").slice(0, 40);
    names.set(userId, { name, at: Date.now() });
    if (names.size > 2000) names.delete(names.keys().next().value!);
    return name;
  },
  isHere: async (spaceId, userId) => isInRoom(spaceId, userId) || (await isUserOnline(spaceId, userId)),
  tellOne: (spaceId, userId, message) => sendToUser(spaceId, userId, message),
  tellAll: async (spaceId, fromUserId, message) => {
    sendToUser(spaceId, fromUserId, message);
    broadcast(spaceId, fromUserId, message);
    await publishRoomEvent(spaceId, fromUserId, message);
  },
};

// Each person gets 60 actions per 10 seconds: plenty for drawing, too few to flood a board.
const BUDGET = 60;
const BUDGET_MS = 10_000;
const budgets = new Map<string, { until: number; used: number }>();

function withinBudget(userId: string, now = Date.now()) {
  const budget = budgets.get(userId);
  if (!budget || budget.until <= now) {
    budgets.set(userId, { until: now + BUDGET_MS, used: 1 });
    return true;
  }
  budget.used++;
  return budget.used <= BUDGET;
}

export function forgetOfficeBudget(userId: string) {
  budgets.delete(userId);
}

function onTheMap(board: string, size: { width: number; height: number }) {
  const [x, y] = board.split(",").map(Number);
  return x! < size.width && y! < size.height;
}

export async function handleOffice(ws: Socket, payload: OfficePayload, deps: OfficeDeps = defaultOfficeDeps) {
  const { spaceId, userId } = ws.data;
  if (!spaceId || !userId) {
    ws.send(JSON.stringify({ type: "error", message: "Join a space first" }));
    return;
  }
  const notice = (ok: boolean, text: string) => deps.tellOne(spaceId, userId, office({ kind: "notice", ok, text }));
  if (!withinBudget(userId)) return notice(false, "Slow down a little.");
  // Redis or the database can be away for a moment: say so, rather than leave it unanswered.
  try {
    await act(spaceId, userId, payload, deps, notice);
  } catch (error) {
    console.error(`[office] ${payload.action} failed:`, error instanceof Error ? error.message : error);
    notice(false, "That didn't go through. Try again in a moment.");
  }
}

async function act(spaceId: string, userId: string, payload: OfficePayload, deps: OfficeDeps, notice: (ok: boolean, text: string) => void) {
  const { store } = deps;
  const me = async (): Promise<Person> => ({ id: userId, name: await deps.nameOf(userId) });

  switch (payload.action) {
    case "sync": {
      deps.tellOne(spaceId, userId, office({ kind: "bookings", bookings: await store.bookings(spaceId) }));
      deps.tellOne(spaceId, userId, office({ kind: "shelf", items: await store.shelf(spaceId) }));
      deps.tellOne(spaceId, userId, office({ kind: "locker", items: await store.locker(spaceId, userId) }));
      return;
    }

    case "book": {
      const { rooms } = await deps.rooms(spaceId);
      const room = rooms.find((each) => each.id === payload.roomId);
      if (!room || !isBookableRoom(room.name)) return notice(false, "That room can't be booked.");
      const result = await store.book(spaceId, await me(), payload);
      if (!result.ok) return notice(false, result.reason);
      await deps.tellAll(spaceId, userId, office({ kind: "bookings", bookings: result.value }));
      return notice(true, `${room.name} is yours.`);
    }

    case "cancel-booking": {
      const result = await store.cancelBooking(spaceId, userId, payload.id);
      if (!result.ok) return notice(false, result.reason);
      await deps.tellAll(spaceId, userId, office({ kind: "bookings", bookings: result.value }));
      return notice(true, "Booking cancelled.");
    }

    case "board-open": {
      if (!onTheMap(payload.board, await deps.rooms(spaceId))) return;
      return deps.tellOne(spaceId, userId, office({ kind: "board", board: payload.board, strokes: await store.board(spaceId, payload.board) }));
    }

    case "draw": {
      if (!onTheMap(payload.board, await deps.rooms(spaceId))) return;
      const stroke = { ...payload.stroke, by: userId };
      await store.draw(spaceId, payload.board, stroke);
      return deps.tellAll(spaceId, userId, office({ kind: "stroke", board: payload.board, stroke }));
    }

    case "undo": {
      const id = await store.undo(spaceId, payload.board, userId);
      if (id) await deps.tellAll(spaceId, userId, office({ kind: "unstroke", board: payload.board, id }));
      return;
    }

    case "wipe": {
      await store.wipe(spaceId, payload.board);
      return deps.tellAll(spaceId, userId, office({ kind: "wiped", board: payload.board, by: await deps.nameOf(userId) }));
    }

    case "send": {
      if (payload.to === userId) return notice(false, "Pick someone else to send it to.");
      if (!(await deps.isHere(spaceId, payload.to))) return notice(false, "They've left the space. Send it when they're back.");
      const result = await store.deliver(spaceId, userId, { kind: "person", ...(await me()) }, payload.to, payload.item);
      if (!result.ok) return notice(false, result.reason);
      await deps.tellAll(spaceId, userId, office({ kind: "locker-ping", userId: payload.to }));
      return notice(true, `Sent. It's waiting in ${await deps.nameOf(payload.to)}'s locker.`);
    }

    case "coworker-drop": {
      const result = await store.deliver(spaceId, userId, { kind: "coworker", id: payload.coworker }, userId, payload.item);
      if (!result.ok) return notice(false, result.reason);
      return deps.tellOne(spaceId, userId, office({ kind: "locker", items: await store.locker(spaceId, userId) }));
    }

    case "collect": {
      const result = await store.collect(spaceId, userId, payload.id);
      if (!result.ok) return notice(false, result.reason);
      return deps.tellOne(spaceId, userId, office({ kind: "locker", items: await store.locker(spaceId, userId) }));
    }

    case "leave": {
      const result = await store.leave(spaceId, await me(), payload.item);
      if (!result.ok) return notice(false, result.reason);
      await deps.tellAll(spaceId, userId, office({ kind: "shelf", items: result.value }));
      return notice(true, "Left on the shelf.");
    }

    case "take": {
      const result = await store.take(spaceId, userId, payload.id);
      if (!result.ok) return notice(false, result.reason);
      await deps.tellAll(spaceId, userId, office({ kind: "shelf", items: result.value.shelf }));
      return notice(true, "It's yours.");
    }
  }
}
