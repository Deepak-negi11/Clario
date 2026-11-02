import {
  BOARD_STROKES_MAX, LOCKER_MAX, WELCOME_PACK, bookingProblem, freshShelf, lastStrokeBy, lockerProblem, shelfLeaveProblem,
  shelfTakeProblem, slotsOf, stillRelevant,
  type Booking, type LockerDraft, type LockerItem, type LockerSender, type SavedStroke, type ShelfDraft, type ShelfItem,
  LockerDraftSchema, ShelfDraftSchema,
} from "@repo/shared";
import { redis } from "./redis";

// Room bookings, whiteboards, lockers and the kitchen shelf, kept in Redis per space so they last
// after everyone leaves and every server sees the same thing. Each change that two people could
// race on is a single Redis step:
// - a booking claims each of its half-hour slots with SET NX, so a slot has one owner however many
//   servers try at once
// - taking a thing off the shelf or collecting from a locker is an LREM of that exact entry, so only
//   one person gets it
// The rules themselves are in @repo/shared (office/*.ts).

// The few Redis commands used here, so tests can run on memory instead (memoryKv below).
export type OfficeKv = {
  get(key: string): Promise<string | null>;
  // True when it was set (with `nx`, only when the key was free).
  set(key: string, value: string, options?: { nx?: boolean; ttlMs?: number }): Promise<boolean>;
  del(key: string): Promise<void>;
  rpush(key: string, value: string): Promise<number>;
  lrange(key: string): Promise<string[]>;
  ltrim(key: string, keepLast: number): Promise<void>;
  lrem(key: string, value: string): Promise<number>;
  hset(key: string, field: string, value: string): Promise<void>;
  hdel(key: string, field: string): Promise<void>;
  hvals(key: string): Promise<string[]>;
  expire(key: string, ttlMs: number): Promise<void>;
};

export const redisKv: OfficeKv = {
  get: async (key) => ((await redis.send("GET", [key])) as string | null) ?? null,
  set: async (key, value, options = {}) => {
    const args = [key, value];
    if (options.ttlMs) args.push("PX", String(Math.max(1, Math.round(options.ttlMs))));
    if (options.nx) args.push("NX");
    return (await redis.send("SET", args)) === "OK";
  },
  del: async (key) => void (await redis.send("DEL", [key])),
  rpush: async (key, value) => Number(await redis.send("RPUSH", [key, value])),
  lrange: async (key) => ((await redis.send("LRANGE", [key, "0", "-1"])) as string[] | null) ?? [],
  ltrim: async (key, keepLast) => void (await redis.send("LTRIM", [key, String(-keepLast), "-1"])),
  lrem: async (key, value) => Number(await redis.send("LREM", [key, "1", value])),
  hset: async (key, field, value) => void (await redis.send("HSET", [key, field, value])),
  hdel: async (key, field) => void (await redis.send("HDEL", [key, field])),
  hvals: async (key) => ((await redis.send("HVALS", [key])) as string[] | null) ?? [],
  expire: async (key, ttlMs) => void (await redis.send("PEXPIRE", [key, String(Math.max(1, Math.round(ttlMs)))])),
};

// The same commands on plain memory, for tests (expiry is ignored).
export function memoryKv(): OfficeKv {
  const strings = new Map<string, string>();
  const lists = new Map<string, string[]>();
  const hashes = new Map<string, Map<string, string>>();
  const list = (key: string) => lists.get(key) ?? (lists.set(key, []), lists.get(key)!);
  const hash = (key: string) => hashes.get(key) ?? (hashes.set(key, new Map()), hashes.get(key)!);
  return {
    get: async (key) => strings.get(key) ?? null,
    set: async (key, value, options = {}) => {
      if (options.nx && strings.has(key)) return false;
      strings.set(key, value);
      return true;
    },
    del: async (key) => {
      strings.delete(key);
      lists.delete(key);
      hashes.delete(key);
    },
    rpush: async (key, value) => list(key).push(value),
    lrange: async (key) => [...(lists.get(key) ?? [])],
    ltrim: async (key, keepLast) => {
      const items = list(key);
      if (items.length > keepLast) lists.set(key, items.slice(items.length - keepLast));
    },
    lrem: async (key, value) => {
      const items = list(key);
      const index = items.indexOf(value);
      if (index < 0) return 0;
      items.splice(index, 1);
      return 1;
    },
    hset: async (key, field, value) => void hash(key).set(field, value),
    hdel: async (key, field) => void hash(key).delete(field),
    hvals: async (key) => [...(hashes.get(key)?.values() ?? [])],
    expire: async () => {},
  };
}

// What a change came to: done (with what to tell people), or why not.
export type Outcome<T> = { ok: true; value: T } | { ok: false; reason: string };
const no = (reason: string): Outcome<never> => ({ ok: false, reason });
const yes = <T>(value: T): Outcome<T> => ({ ok: true, value });

const DAY_MS = 24 * 60 * 60_000;
// A board nobody has drawn on for this long is forgotten.
const BOARD_KEEP_MS = 120 * DAY_MS;

function parseAll<T>(values: string[]): { raw: string; value: T }[] {
  const out: { raw: string; value: T }[] = [];
  for (const raw of values) {
    try {
      out.push({ raw, value: JSON.parse(raw) as T });
    } catch {
      // A broken entry is skipped rather than breaking the whole list.
    }
  }
  return out;
}

export type Person = { id: string; name: string };

export function createOfficeStore(kv: OfficeKv, options: { now?: () => number; newId?: () => string } = {}) {
  const now = options.now ?? Date.now;
  const newId = options.newId ?? (() => crypto.randomUUID());
  const key = (spaceId: string, ...parts: string[]) => ["office", spaceId, ...parts].join(":");

  // ----- Bookings

  async function bookings(spaceId: string): Promise<Booking[]> {
    const all = parseAll<Booking>(await kv.hvals(key(spaceId, "bookings")));
    const at = now();
    // Ended bookings are tidied away as they're read.
    for (const { value } of all) if (value.end <= at) await kv.hdel(key(spaceId, "bookings"), value.id);
    return stillRelevant(all.map(({ value }) => value), at).sort((a, b) => a.start - b.start);
  }

  async function book(spaceId: string, who: Person, request: { roomId: string; start: number; end: number; title: string }): Promise<Outcome<Booking[]>> {
    const current = await bookings(spaceId);
    const problem = bookingProblem(current, { ...request, userId: who.id }, now());
    if (problem) return no(problem);
    const booking: Booking = { id: newId(), ...request, userId: who.id, name: who.name, title: request.title.trim() || "Booked" };
    // Claim every slot, or none: a slot someone else just took (on any server) undoes the rest.
    const claimed: string[] = [];
    for (const slot of slotsOf(booking)) {
      const slotKey = key(spaceId, "slot", booking.roomId, String(slot));
      if (!(await kv.set(slotKey, booking.id, { nx: true, ttlMs: booking.end - now() + DAY_MS }))) {
        for (const taken of claimed) await kv.del(taken);
        return no("Someone booked that just now. Pick another slot.");
      }
      claimed.push(slotKey);
    }
    await kv.hset(key(spaceId, "bookings"), booking.id, JSON.stringify(booking));
    return yes(await bookings(spaceId));
  }

  async function cancelBooking(spaceId: string, userId: string, id: string): Promise<Outcome<Booking[]>> {
    const booking = (await bookings(spaceId)).find((each) => each.id === id);
    if (!booking) return no("That booking has already ended or been cancelled.");
    if (booking.userId !== userId) return no("Only the person who booked it can cancel it.");
    await kv.hdel(key(spaceId, "bookings"), id);
    for (const slot of slotsOf(booking)) {
      const slotKey = key(spaceId, "slot", booking.roomId, String(slot));
      if ((await kv.get(slotKey)) === id) await kv.del(slotKey);
    }
    return yes(await bookings(spaceId));
  }

  // ----- Whiteboards

  async function board(spaceId: string, boardId: string): Promise<SavedStroke[]> {
    return parseAll<SavedStroke>(await kv.lrange(key(spaceId, "board", boardId))).map(({ value }) => value);
  }

  async function draw(spaceId: string, boardId: string, stroke: SavedStroke) {
    const boardKey = key(spaceId, "board", boardId);
    await kv.rpush(boardKey, JSON.stringify(stroke));
    await kv.ltrim(boardKey, BOARD_STROKES_MAX);
    await kv.expire(boardKey, BOARD_KEEP_MS);
  }

  // Takes back `userId`'s latest stroke on the board; the id of the stroke that went, or null.
  async function undo(spaceId: string, boardId: string, userId: string): Promise<string | null> {
    const boardKey = key(spaceId, "board", boardId);
    const entries = parseAll<SavedStroke>(await kv.lrange(boardKey));
    const id = lastStrokeBy(entries.map(({ value }) => value), userId);
    const entry = entries.find(({ value }) => value.id === id);
    if (!entry || !(await kv.lrem(boardKey, entry.raw))) return null;
    return entry.value.id;
  }

  const wipe = (spaceId: string, boardId: string) => kv.del(key(spaceId, "board", boardId));

  // ----- Lockers

  async function locker(spaceId: string, userId: string): Promise<LockerItem[]> {
    const lockerKey = key(spaceId, "locker", userId);
    // The first time someone opens their locker in a space, Priya's welcome pack is waiting.
    if (await kv.set(key(spaceId, "welcomed", userId), "1", { nx: true })) {
      const welcome: LockerItem = {
        id: newId(), kind: "document", title: WELCOME_PACK.title, body: WELCOME_PACK.body,
        from: { kind: "coworker", id: WELCOME_PACK.from }, to: userId, at: now(),
      };
      await kv.rpush(lockerKey, JSON.stringify(welcome));
    }
    return parseAll<LockerItem>(await kv.lrange(lockerKey)).map(({ value }) => value);
  }

  async function deliver(spaceId: string, senderId: string, from: LockerSender, to: string, draft: LockerDraft): Promise<Outcome<LockerItem>> {
    const parsed = LockerDraftSchema.safeParse(draft);
    if (!parsed.success) return no("Give it a title.");
    const lockerKey = key(spaceId, "locker", to);
    const waiting = (await kv.lrange(lockerKey)).length;
    const problem = lockerProblem(waiting, from, to, senderId);
    if (problem) return no(problem);
    const item: LockerItem = { id: newId(), ...parsed.data, from, to, at: now() };
    await kv.rpush(lockerKey, JSON.stringify(item));
    await kv.ltrim(lockerKey, LOCKER_MAX);
    return yes(item);
  }

  async function collect(spaceId: string, userId: string, id: string): Promise<Outcome<LockerItem>> {
    const lockerKey = key(spaceId, "locker", userId);
    const entry = parseAll<LockerItem>(await kv.lrange(lockerKey)).find(({ value }) => value.id === id);
    if (!entry || !(await kv.lrem(lockerKey, entry.raw))) return no("That's already been collected.");
    return yes(entry.value);
  }

  // ----- The kitchen shelf

  async function shelf(spaceId: string): Promise<ShelfItem[]> {
    const shelfKey = key(spaceId, "shelf");
    const entries = parseAll<ShelfItem>(await kv.lrange(shelfKey));
    const fresh = new Set(freshShelf(entries.map(({ value }) => value), now()));
    for (const entry of entries) if (!fresh.has(entry.value)) await kv.lrem(shelfKey, entry.raw);
    return entries.map(({ value }) => value).filter((value) => fresh.has(value));
  }

  async function leave(spaceId: string, who: Person, draft: ShelfDraft): Promise<Outcome<ShelfItem[]>> {
    const parsed = ShelfDraftSchema.safeParse(draft);
    if (!parsed.success) return no("Pick what you're leaving.");
    if (parsed.data.for?.id === who.id) return no("Leave it for someone else, or for anyone.");
    const problem = shelfLeaveProblem(await shelf(spaceId), who.id, now());
    if (problem) return no(problem);
    const item: ShelfItem = { id: newId(), ...parsed.data, by: who, at: now() };
    await kv.rpush(key(spaceId, "shelf"), JSON.stringify(item));
    return yes(await shelf(spaceId));
  }

  async function take(spaceId: string, userId: string, id: string): Promise<Outcome<{ item: ShelfItem; shelf: ShelfItem[] }>> {
    const shelfKey = key(spaceId, "shelf");
    const entry = parseAll<ShelfItem>(await kv.lrange(shelfKey)).find(({ value }) => value.id === id);
    if (!entry) return no("Someone already took that.");
    const problem = shelfTakeProblem(entry.value, userId);
    if (problem) return no(problem);
    if (!(await kv.lrem(shelfKey, entry.raw))) return no("Someone already took that.");
    return yes({ item: entry.value, shelf: await shelf(spaceId) });
  }

  return { bookings, book, cancelBooking, board, draw, undo, wipe, locker, deliver, collect, shelf, leave, take };
}

export type OfficeStore = ReturnType<typeof createOfficeStore>;
