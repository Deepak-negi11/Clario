import { describe, expect, test } from "bun:test";
import { COFFEE_NAMES, COFFEES, PropBroadcast, PropMessage, SIPS_PER_CAN } from "./prop.schema";
import { BOOK_IDS, BOOK_PAGE_COUNT, LIBRARY_BOOKS } from "../maps/library";
import { ClientMessage, ServerMessage } from "./ws.schema";

describe("player props", () => {
  test("accepts a bike, a can and nothing", () => {
    for (const prop of [{ kind: "bike", bike: "teal" }, { kind: "can", drink: "lime", sips: 0 }, null]) {
      expect(PropMessage.safeParse({ type: "prop", payload: { prop } }).success).toBe(true);
    }
  });

  test("books are bounded catalog IDs and valid pages, including for late joiners", () => {
    for (const book of BOOK_IDS) {
      expect(LIBRARY_BOOKS[book].pages).toHaveLength(BOOK_PAGE_COUNT);
      const prop = { kind: "book", book, page: BOOK_PAGE_COUNT - 1 };
      expect(ClientMessage.safeParse({ type: "prop", payload: { prop } }).success).toBe(true);
      expect(ServerMessage.safeParse({ type: "space-joined", payload: { userId: "me", spawn: { x: 1, y: 1 }, users: [{ id: "reader", x: 2, y: 1, prop }] } }).success).toBe(true);
    }
    for (const prop of [
      { kind: "book", book: "<script>", page: 0 },
      { kind: "book", book: "small-wins", page: -1 },
      { kind: "book", book: "small-wins", page: BOOK_PAGE_COUNT },
      { kind: "book", book: "small-wins", page: 0.5 },
    ]) expect(PropMessage.safeParse({ type: "prop", payload: { prop } }).success).toBe(false);
  });

  test("refuses bikes and drinks that don't exist, and more sips than a can holds", () => {
    for (const prop of [
      { kind: "bike", bike: "red" },
      { kind: "can", drink: "beer", sips: 0 },
      { kind: "can", drink: "cola", sips: SIPS_PER_CAN + 1 },
      { kind: "can", drink: "cola", sips: 1.5 },
      { kind: "skateboard" },
    ]) {
      expect(PropMessage.safeParse({ type: "prop", payload: { prop } }).success).toBe(false);
    }
  });

  test("is part of the client and server messages", () => {
    expect(ClientMessage.safeParse({ type: "prop", payload: { prop: { kind: "bike", bike: "orange" } } }).success).toBe(true);
    const broadcast = { type: "prop", payload: { userId: "u1", prop: null } };
    expect(PropBroadcast.safeParse(broadcast).success).toBe(true);
    expect(ServerMessage.safeParse(broadcast).success).toBe(true);
  });

  test("tells people who join what everyone already has", () => {
    const joined = {
      type: "space-joined",
      payload: { userId: "me", spawn: { x: 1, y: 1 }, users: [{ id: "u1", x: 2, y: 2, prop: { kind: "can", drink: "berry", sips: 2 } }] },
    };
    expect(ServerMessage.safeParse(joined).success).toBe(true);
  });
});

describe("coffee cups", () => {
  test("accepts every coffee, from full to empty", () => {
    for (const coffee of COFFEES) {
      for (const sips of [0, SIPS_PER_CAN]) {
        expect(PropMessage.safeParse({ type: "prop", payload: { prop: { kind: "cup", coffee, sips } } }).success).toBe(true);
      }
      expect(COFFEE_NAMES[coffee].length).toBeGreaterThan(0);
    }
  });

  test("turns down an unknown coffee or too many sips", () => {
    expect(PropMessage.safeParse({ type: "prop", payload: { prop: { kind: "cup", coffee: "mocha", sips: 0 } } }).success).toBe(false);
    expect(PropMessage.safeParse({ type: "prop", payload: { prop: { kind: "cup", coffee: "latte", sips: SIPS_PER_CAN + 1 } } }).success).toBe(false);
  });
});
