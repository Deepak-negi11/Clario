import { describe, expect, test } from "bun:test";
import { LOCKER_MAX, LockerDraftSchema, lockerProblem } from "./lockers";
import { SHELF_KEEP_MS, SHELF_MAX, SHELF_PER_PERSON, freshShelf, shelfLeaveProblem, shelfTakeProblem, type ShelfItem } from "./shelf";
import {
  BOARD_H, BOARD_STROKES_MAX, BOARD_W, NOTE_LINES_MAX, NOTE_LINE_HEIGHT, NOTE_MARGIN, NOTE_TEXT_MAX, STROKE_POINTS_MAX, StrokeSchema,
  addPoint, isNote, lastStrokeBy, noteLinesMax, placeNote, withStroke, wrapNote, type SavedStroke,
} from "./whiteboard";
import { OfficeBroadcast, OfficeMessage } from "../ws/office.schema";

describe("whiteboard", () => {
  const stroke = (id: string, by = "asha"): SavedStroke => ({ id, by, color: "#1f2430", width: 3, points: [[1, 2]] });

  test("points are whole numbers on the board, close ones dropped", () => {
    const points: [number, number][] = [];
    expect(addPoint(points, 0.5, 0.5)).toBe(true);
    expect(addPoint(points, 0.5005, 0.5)).toBe(false);
    expect(addPoint(points, 2, -1)).toBe(true);
    expect(points).toEqual([[500, 300], [1000, 0]]);
  });

  test("a stroke can't grow past the limit", () => {
    const points: [number, number][] = [];
    for (let index = 0; index < STROKE_POINTS_MAX + 10; index++) addPoint(points, index / 1000, 0, 0);
    expect(points).toHaveLength(STROKE_POINTS_MAX);
  });

  test("the oldest strokes go once a board is full", () => {
    let strokes: SavedStroke[] = [];
    for (let index = 0; index < BOARD_STROKES_MAX + 2; index++) strokes = withStroke(strokes, stroke(`s${index}`));
    expect(strokes).toHaveLength(BOARD_STROKES_MAX);
    expect(strokes[0]!.id).toBe("s2");
  });

  test("undo takes back your own latest stroke", () => {
    const strokes = [stroke("a1"), stroke("b1", "ben"), stroke("a2"), stroke("b2", "ben")];
    expect(lastStrokeBy(strokes, "asha")).toBe("a2");
    expect(lastStrokeBy(strokes, "cleo")).toBeNull();
  });

  test("only real markers, widths and board points are accepted", () => {
    expect(StrokeSchema.safeParse({ id: "x", color: "#1f2430", width: 6, points: [[0, 0]] }).success).toBe(true);
    expect(StrokeSchema.safeParse({ id: "x", color: "eraser", width: 28, points: [[1000, 600]] }).success).toBe(true);
    expect(StrokeSchema.safeParse({ id: "x", color: "#ff00ff", width: 6, points: [[0, 0]] }).success).toBe(false);
    expect(StrokeSchema.safeParse({ id: "x", color: "#1f2430", width: 7, points: [[0, 0]] }).success).toBe(false);
    expect(StrokeSchema.safeParse({ id: "x", color: "#1f2430", width: 6, points: [[1001, 0]] }).success).toBe(false);
  });

  test("typed notes: a marker colour, a set size, on the board, and some words", () => {
    const note = { id: "n", kind: "text", color: "#2563c9", size: 36, at: [40, 50], text: "Stand-up\nat 10" };
    const parsed = StrokeSchema.safeParse(note);
    expect(parsed.success && isNote(parsed.data)).toBe(true);
    expect(StrokeSchema.safeParse({ ...note, color: "eraser" }).success).toBe(false);
    expect(StrokeSchema.safeParse({ ...note, size: 40 }).success).toBe(false);
    expect(StrokeSchema.safeParse({ ...note, at: [0, 601] }).success).toBe(false);
    expect(StrokeSchema.safeParse({ ...note, text: "  \n " }).success).toBe(false);
    expect(StrokeSchema.safeParse({ ...note, text: "x".repeat(NOTE_TEXT_MAX + 1) }).success).toBe(false);
    expect(StrokeSchema.safeParse({ ...note, text: Array(NOTE_LINES_MAX + 1).fill("x").join("\n") }).success).toBe(false);
    // Lines saved before notes existed are still lines.
    expect(isNote(stroke("old"))).toBe(false);
  });

  test("a note goes over the wire like a stroke, and comes back with who wrote it", () => {
    const note = { id: "n", kind: "text" as const, color: "#c8372d" as const, size: 24 as const, at: [10, 20] as [number, number], text: "Ship it" };
    expect(OfficeMessage.safeParse({ type: "office", payload: { action: "draw", board: "3,4", stroke: note } }).success).toBe(true);
    const back = OfficeBroadcast.safeParse({ type: "office", payload: { kind: "stroke", board: "3,4", stroke: { ...note, by: "asha" } } });
    expect(back.success && back.data.payload.kind === "stroke" && isNote(back.data.payload.stroke)).toBe(true);
    // Old saved lines still come through.
    expect(OfficeBroadcast.safeParse({ type: "office", payload: { kind: "board", board: "3,4", strokes: [stroke("a1")] } }).success).toBe(true);
  });

  test("undo counts notes and lines alike", () => {
    const note: SavedStroke = { id: "n1", by: "asha", kind: "text", color: "#1f2430", size: 24, at: [0, 0], text: "hi" };
    expect(lastStrokeBy([stroke("a1"), note, stroke("b1", "ben")], "asha")).toBe("n1");
  });

  test("notes wrap between words, at typed breaks, and inside a word too long for a line", () => {
    // Every letter (and space) is 10 units wide here.
    const measure = (text: string) => text.length * 10;
    expect(wrapNote("plan the demo for friday", 100, measure)).toEqual(["plan the", "demo for", "friday"]);
    expect(wrapNote("one\n\ntwo", 100, measure)).toEqual(["one", "", "two"]);
    expect(wrapNote("abcdefghijklmnop", 50, measure)).toEqual(["abcde", "fghij", "klmno", "p"]);
    expect(wrapNote("ok", 50, measure)).toEqual(["ok"]);
    for (const line of wrapNote("a fairly long sentence with averyveryverylongword in it", 80, measure)) {
      expect(measure(line)).toBeLessThanOrEqual(80);
    }
  });

  test("a note started near an edge moves onto the board", () => {
    expect(placeNote([500, 300], 36).at).toEqual([500, 300]);
    const right = placeNote([990, 20], 36);
    expect(right.at[0] + right.maxWidth).toBe(BOARD_W - NOTE_MARGIN);
    expect(right.maxWidth).toBeGreaterThanOrEqual(36 * 8);
    // Taller notes are lifted off the bottom edge.
    const low = placeNote([100, 590], 56, 3);
    expect(low.at[1] + 3 * 56 * NOTE_LINE_HEIGHT).toBeLessThanOrEqual(BOARD_H - NOTE_MARGIN + 1);
    expect(placeNote([-5, -5], 24).at).toEqual([NOTE_MARGIN, NOTE_MARGIN]);
  });

  test("big notes have room for fewer lines", () => {
    expect(noteLinesMax(24)).toBe(NOTE_LINES_MAX);
    expect(noteLinesMax(56) * 56 * NOTE_LINE_HEIGHT).toBeLessThanOrEqual(BOARD_H - NOTE_MARGIN * 2);
    expect(noteLinesMax(56)).toBeLessThan(noteLinesMax(36));
  });
});

describe("lockers", () => {
  const asha = { kind: "person" as const, id: "asha", name: "Asha" };

  test("people send as themselves to anyone", () => {
    expect(lockerProblem(0, asha, "ben", "asha")).toBeNull();
    expect(lockerProblem(0, asha, "ben", "mallory")).toMatch(/as yourself/);
  });

  test("coworkers only fill your own locker", () => {
    expect(lockerProblem(0, { kind: "coworker", id: "priya" }, "asha", "asha")).toBeNull();
    expect(lockerProblem(0, { kind: "coworker", id: "priya" }, "ben", "asha")).toMatch(/own locker/);
  });

  test("a full locker takes nothing more", () => {
    expect(lockerProblem(LOCKER_MAX, asha, "ben", "asha")).toMatch(/full/);
  });

  test("a draft needs a title", () => {
    expect(LockerDraftSchema.safeParse({ kind: "parcel", title: "  " }).success).toBe(false);
    expect(LockerDraftSchema.parse({ kind: "parcel", title: "Spare charger" }).body).toBe("");
  });
});

describe("the kitchen shelf", () => {
  const now = 1_800_000_000_000;
  const item = (over: Partial<ShelfItem>): ShelfItem => ({
    id: "i", thing: "cookies", note: "", for: null, by: { id: "asha", name: "Asha" }, at: now - 1000, ...over,
  });

  test("anyone takes things left for everyone", () => {
    expect(shelfTakeProblem(item({}), "ben")).toBeNull();
  });

  test("things left for one person are theirs (or the giver's) to take", () => {
    const forBen = item({ for: { id: "ben", name: "Ben" } });
    expect(shelfTakeProblem(forBen, "ben")).toBeNull();
    expect(shelfTakeProblem(forBen, "asha")).toBeNull();
    expect(shelfTakeProblem(forBen, "cleo")).toBe("That's left for Ben.");
  });

  test("a full shelf, or six things of yours, takes no more", () => {
    const full = Array.from({ length: SHELF_MAX }, (_, index) => item({ id: `i${index}`, by: { id: `p${index}`, name: "P" } }));
    expect(shelfLeaveProblem(full, "asha", now)).toMatch(/full/);
    const mine = Array.from({ length: SHELF_PER_PERSON }, (_, index) => item({ id: `m${index}` }));
    expect(shelfLeaveProblem(mine, "asha", now)).toMatch(/already have 6/);
    expect(shelfLeaveProblem(mine, "ben", now)).toBeNull();
  });

  test("things left more than 3 days ago are cleared", () => {
    const items = [item({ id: "old", at: now - SHELF_KEEP_MS - 1 }), item({ id: "new" })];
    expect(freshShelf(items, now).map((each) => each.id)).toEqual(["new"]);
    // Old ones don't take up room either.
    const stale = Array.from({ length: SHELF_MAX }, (_, index) => item({ id: `s${index}`, at: now - SHELF_KEEP_MS - 1 }));
    expect(shelfLeaveProblem(stale, "asha", now)).toBeNull();
  });
});

describe("documents from coworkers", () => {
  test("a usable answer is read, with markdown stripped and lengths capped", async () => {
    const { readCoworkerDoc } = await import("./coworker-docs");
    const doc = readCoworkerDoc('Sure! {"title": "**Deploy** checklist", "body": "## Before\\n- **Tests** green on main and reviewed"}');
    expect(doc).toEqual({ title: "Deploy checklist", body: "Before\n- Tests green on main and reviewed" });
    expect(readCoworkerDoc("no json here")).toBeNull();
    expect(readCoworkerDoc('{"title": "", "body": "long enough body text here"}')).toBeNull();
    expect(readCoworkerDoc('{"title": "Short", "body": "too short"}')).toBeNull();
    expect(readCoworkerDoc(`{"title": "${"t".repeat(200)}", "body": "${"b".repeat(5000)}"}`)?.title.length).toBe(80);
  });

  test("without AI, the saved document that fits the ask", async () => {
    const { savedCoworkerDoc } = await import("./coworker-docs");
    expect(savedCoworkerDoc("arjun", "Can I get your deploy checklist?").title).toBe("Deploy checklist");
    expect(savedCoworkerDoc("rahul", "notes from the sync please").title).toBe("Team sync notes");
    expect(savedCoworkerDoc("priya", "anything at all").title).toBe("Friday release plan");
  });
});
