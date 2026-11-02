import { beforeEach, describe, expect, test } from "bun:test";
import { SLOT_MS, type ServerMessage } from "@repo/shared";
import { handleOffice, type OfficeDeps } from "./office-handler";
import { createOfficeStore, memoryKv, type OfficeKv } from "./office-store";
import type { Socket } from "./room-manager";

const TEN = Date.UTC(2026, 10, 3, 10, 0);
let clock = TEN + 5 * 60_000;
let ids = 0;
const asha = { id: "asha", name: "Asha" };
const ben = { id: "ben", name: "Ben" };

function storeOn(kv: OfficeKv) {
  return createOfficeStore(kv, { now: () => clock, newId: () => `id${++ids}` });
}

beforeEach(() => {
  clock = TEN + 5 * 60_000;
  ids = 0;
});

describe("bookings", () => {
  test("book, see it, cancel it", async () => {
    const store = storeOn(memoryKv());
    const booked = await store.book("s", asha, { roomId: "meet", start: TEN, end: TEN + 2 * SLOT_MS, title: " Planning " });
    expect(booked.ok && booked.value.map((each) => [each.name, each.title])).toEqual([["Asha", "Planning"]]);
    expect(await store.cancelBooking("s", "ben", "id1")).toEqual({ ok: false, reason: "Only the person who booked it can cancel it." });
    const cancelled = await store.cancelBooking("s", "asha", "id1");
    expect(cancelled.ok && cancelled.value).toEqual([]);
    // The slots are free again.
    expect((await store.book("s", ben, { roomId: "meet", start: TEN, end: TEN + SLOT_MS, title: "" })).ok).toBe(true);
  });

  test("two servers booking the same slot at once: one wins", async () => {
    const kv = memoryKv();
    const here = storeOn(kv);
    const there = storeOn(kv);
    const [first, second] = await Promise.all([
      here.book("s", asha, { roomId: "meet", start: TEN, end: TEN + 2 * SLOT_MS, title: "A" }),
      there.book("s", ben, { roomId: "meet", start: TEN + SLOT_MS, end: TEN + 3 * SLOT_MS, title: "B" }),
    ]);
    expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1);
    const left = await here.bookings("s");
    expect(left).toHaveLength(1);
    // The loser's other slot was given back, so it can still be booked.
    const loserSlot = first.ok ? TEN + 2 * SLOT_MS : TEN;
    expect((await here.book("s", { id: "cleo", name: "Cleo" }, { roomId: "meet", start: loserSlot, end: loserSlot + SLOT_MS, title: "" })).ok).toBe(true);
  });

  test("ended bookings drop off", async () => {
    const store = storeOn(memoryKv());
    await store.book("s", asha, { roomId: "meet", start: TEN, end: TEN + SLOT_MS, title: "" });
    clock = TEN + SLOT_MS + 1;
    expect(await store.bookings("s")).toEqual([]);
  });
});

describe("whiteboards", () => {
  const stroke = (id: string, by: string) => ({ id, by, color: "#1f2430" as const, width: 3 as const, points: [[1, 1]] as [number, number][] });

  test("strokes stay on the board, undo takes back only your own", async () => {
    const store = storeOn(memoryKv());
    await store.draw("s", "3,4", stroke("a1", "asha"));
    await store.draw("s", "3,4", stroke("b1", "ben"));
    expect(await store.undo("s", "3,4", "asha")).toBe("a1");
    expect(await store.undo("s", "3,4", "asha")).toBeNull();
    expect((await store.board("s", "3,4")).map((each) => each.id)).toEqual(["b1"]);
    // Other boards are their own.
    expect(await store.board("s", "9,9")).toEqual([]);
    await store.wipe("s", "3,4");
    expect(await store.board("s", "3,4")).toEqual([]);
  });
});

describe("lockers", () => {
  test("a welcome pack waits the first time only", async () => {
    const store = storeOn(memoryKv());
    const first = await store.locker("s", "asha");
    expect(first.map((item) => [item.from.kind, item.title])).toEqual([["coworker", "Welcome pack: your first week"]]);
    await store.collect("s", "asha", first[0]!.id);
    expect(await store.locker("s", "asha")).toEqual([]);
  });

  test("things wait for their owner, and can be collected once", async () => {
    const store = storeOn(memoryKv());
    const sent = await store.deliver("s", "asha", { kind: "person", ...asha }, "ben", { kind: "parcel", title: "Spare charger" });
    expect(sent.ok).toBe(true);
    const id = sent.ok ? sent.value.id : "";
    expect((await store.locker("s", "ben")).some((item) => item.id === id)).toBe(true);
    // Not in anyone else's locker, and only Ben can collect it.
    expect((await store.locker("s", "asha")).some((item) => item.id === id)).toBe(false);
    expect((await store.collect("s", "asha", id)).ok).toBe(false);
    expect((await store.collect("s", "ben", id)).ok).toBe(true);
    expect((await store.collect("s", "ben", id)).ok).toBe(false);
  });

  test("no sending in someone else's name or a coworker's", async () => {
    const store = storeOn(memoryKv());
    expect((await store.deliver("s", "mallory", { kind: "person", ...asha }, "ben", { kind: "document", title: "Hi" })).ok).toBe(false);
    expect((await store.deliver("s", "asha", { kind: "coworker", id: "priya" }, "ben", { kind: "document", title: "Hi" })).ok).toBe(false);
    expect((await store.deliver("s", "asha", { kind: "coworker", id: "priya" }, "asha", { kind: "document", title: "Notes" })).ok).toBe(true);
  });
});

describe("the kitchen shelf", () => {
  test("leave something, someone takes it, only once", async () => {
    const kv = memoryKv();
    const store = storeOn(kv);
    const left = await store.leave("s", asha, { thing: "cookies", note: "From my trip" });
    const id = left.ok ? left.value[0]!.id : "";
    const [one, two] = await Promise.all([store.take("s", "ben", id), storeOn(kv).take("s", "cleo", id)]);
    expect([one.ok, two.ok].filter(Boolean)).toHaveLength(1);
    expect(await store.shelf("s")).toEqual([]);
  });

  test("left for one person", async () => {
    const store = storeOn(memoryKv());
    const left = await store.leave("s", asha, { thing: "umbrella", for: ben });
    const id = left.ok ? left.value[0]!.id : "";
    expect(await store.take("s", "cleo", id)).toEqual({ ok: false, reason: "That's left for Ben." });
    expect((await store.take("s", "ben", id)).ok).toBe(true);
    expect((await store.leave("s", asha, { thing: "mug", for: asha })).ok).toBe(false);
  });
});

describe("the socket handler", () => {
  function setup() {
    const sent: { to: string; message: ServerMessage }[] = [];
    const deps: OfficeDeps = {
      store: storeOn(memoryKv()),
      rooms: async () => ({
        rooms: [
          { id: "meet", name: "Meeting Room 1", bounds: { x: 0, y: 0, width: 5, height: 5 } },
          { id: "kitchen", name: "Kitchen", bounds: { x: 6, y: 0, width: 5, height: 5 } },
        ],
        width: 40,
        height: 30,
      }),
      nameOf: async (userId) => (userId === "asha" ? "Asha" : userId === "ben" ? "Ben" : "Someone"),
      isHere: async (_space, userId) => userId !== "gone",
      tellOne: (_space, to, message) => void sent.push({ to, message }),
      tellAll: async (_space, from, message) => void sent.push({ to: `everyone (from ${from})`, message }),
    };
    const socket = (userId: string) => ({ data: { spaceId: "s", userId, x: 0, y: 0 }, send: () => 0 }) as unknown as Socket;
    const notices = () => sent.flatMap(({ message }) => (message.type === "office" && message.payload.kind === "notice" ? [message.payload.text] : []));
    return { sent, deps, socket, notices };
  }

  test("only meeting-type rooms that exist can be booked", async () => {
    const { deps, socket, notices } = setup();
    await handleOffice(socket("asha"), { action: "book", roomId: "kitchen", start: TEN, end: TEN + SLOT_MS, title: "" }, deps);
    await handleOffice(socket("asha"), { action: "book", roomId: "nowhere", start: TEN, end: TEN + SLOT_MS, title: "" }, deps);
    expect(notices()).toEqual(["That room can't be booked.", "That room can't be booked."]);
  });

  test("a booking goes to everyone, with the name from the server", async () => {
    const { deps, socket, sent } = setup();
    await handleOffice(socket("asha"), { action: "book", roomId: "meet", start: TEN, end: TEN + SLOT_MS, title: "1:1" }, deps);
    const update = sent.find(({ message }) => message.type === "office" && message.payload.kind === "bookings");
    expect(update?.to).toBe("everyone (from asha)");
    expect(update?.message.type === "office" && update.message.payload.kind === "bookings" && update.message.payload.bookings[0]?.name).toBe("Asha");
  });

  test("a locker's contents only go to its owner; everyone else hears a ping", async () => {
    const { deps, socket, sent } = setup();
    await handleOffice(socket("asha"), { action: "send", to: "ben", item: { kind: "document", title: "Notes", body: "Hello" } }, deps);
    expect(sent.some(({ message }) => message.type === "office" && message.payload.kind === "locker")).toBe(false);
    expect(sent.some(({ to, message }) => to.startsWith("everyone") && message.type === "office" && message.payload.kind === "locker-ping" && message.payload.userId === "ben")).toBe(true);
    sent.length = 0;
    await handleOffice(socket("ben"), { action: "sync" }, deps);
    const locker = sent.find(({ message }) => message.type === "office" && message.payload.kind === "locker");
    expect(locker?.to).toBe("ben");
  });

  test("can't send to someone who left, or to yourself", async () => {
    const { deps, socket, notices } = setup();
    await handleOffice(socket("asha"), { action: "send", to: "gone", item: { kind: "parcel", title: "Box", body: "" } }, deps);
    await handleOffice(socket("asha"), { action: "send", to: "asha", item: { kind: "parcel", title: "Box", body: "" } }, deps);
    expect(notices()).toEqual(["They've left the space. Send it when they're back.", "Pick someone else to send it to."]);
  });

  test("boards off the map are ignored", async () => {
    const { deps, socket, sent } = setup();
    await handleOffice(socket("asha"), { action: "draw", board: "99,99", stroke: { id: "x", color: "#1f2430", width: 3, points: [[0, 0]] } }, deps);
    expect(sent).toEqual([]);
    await handleOffice(socket("asha"), { action: "draw", board: "3,4", stroke: { id: "x", color: "#1f2430", width: 3, points: [[0, 0]] } }, deps);
    expect(sent[0]?.message.type === "office" && sent[0].message.payload.kind).toBe("stroke");
  });

  test("too many actions too fast are refused", async () => {
    const { deps, socket, notices } = setup();
    for (let index = 0; index < 61; index++) await handleOffice(socket("flood"), { action: "undo", board: "1,1" }, deps);
    expect(notices()).toEqual(["Slow down a little."]);
  });
});

describe("when Redis is away", () => {
  test("the person is told, and nothing is thrown", async () => {
    const broken = memoryKv();
    broken.hvals = async () => {
      throw new Error("connection closed");
    };
    const sent: ServerMessage[] = [];
    const deps: OfficeDeps = {
      store: storeOn(broken),
      rooms: async () => ({ rooms: [], width: 10, height: 10 }),
      nameOf: async () => "Asha",
      isHere: async () => true,
      tellOne: (_space, _to, message) => void sent.push(message),
      tellAll: async (_space, _from, message) => void sent.push(message),
    };
    const socket = { data: { spaceId: "s", userId: "redis-test", x: 0, y: 0 }, send: () => 0 } as unknown as Socket;
    const errors = console.error;
    console.error = () => {};
    await handleOffice(socket, { action: "sync" }, deps);
    console.error = errors;
    expect(sent.at(-1)).toEqual({ type: "office", payload: { kind: "notice", ok: false, text: "That didn't go through. Try again in a moment." } });
  });
});
