import { describe, expect, test } from "bun:test";
import { getMapTemplate } from "../maps/map-templates";
import {
  EMPTY_ERRAND_PROGRESS,
  ERRANDS,
  completeErrand,
  enterRoom,
  errandReward,
  getErrand,
  levelFor,
  parseErrandProgress,
  performErrandAction,
  runSeconds,
  startRun,
  visitRoom,
} from "./errands";

const ROOMS = getMapTemplate("clario-hq").chatRooms.map((room) => room.id);
const smallChange = getErrand("small-change")!;

describe("errand content", () => {
  test("every step is a real Clario HQ room", () => {
    for (const errand of ERRANDS)
      for (const step of errand.steps) expect(ROOMS).toContain(step.room);
  });

  test("every message has exactly one best option, with a reason for each", () => {
    for (const errand of ERRANDS) {
      expect(
        errand.message.options.filter((option) => option.best),
      ).toHaveLength(1);
      for (const option of errand.message.options)
        expect(option.why.length).toBeGreaterThan(10);
    }
  });

  test("interactive errands give a concrete action and a workplace communication challenge", () => {
    for (const errand of ERRANDS.filter((item) =>
      item.steps.some((step) => step.action),
    )) {
      expect(errand.steps[0]?.label.length).toBeGreaterThan(10);
      expect(errand.message.prompt.length).toBeGreaterThan(20);
      expect(errand.steps).toHaveLength(2);
    }
  });

  test("ids are unique", () => {
    expect(new Set(ERRANDS.map((errand) => errand.id)).size).toBe(
      ERRANDS.length,
    );
  });
});

describe("a run", () => {
  test("moves on only when you enter the room it is waiting for", () => {
    let run = startRun(smallChange, 0, null);
    run = enterRoom(run, smallChange, "hq-meeting-2", 1000);
    expect(run.step).toBe(0);
    run = enterRoom(run, smallChange, "hq-desks", 2000);
    expect(run.step).toBe(1);
    run = enterRoom(run, smallChange, "hq-meeting-2", 9000);
    expect(run.arrivedAt).toBe(9000);
    expect(runSeconds(run, 60_000)).toBe(9);
  });

  test("counts the first room if you start the errand standing in it", () => {
    expect(startRun(smallChange, 0, "hq-desks").step).toBe(1);
  });
});

describe("actions in a quest", () => {
  test("reading needs a real page action in the Library, then a return to the desk", () => {
    const errand = getErrand("reading-reset")!;
    const waiting = startRun(errand, 0, "hq-library");
    expect(waiting.step).toBe(0);
    expect(enterRoom(waiting, errand, "hq-library", 1000)).toBe(waiting);
    expect(
      performErrandAction(waiting, errand, "read", "hq-focus-1", 2000),
    ).toBe(waiting);
    expect(
      performErrandAction(waiting, errand, "sip", "hq-library", 2000),
    ).toBe(waiting);
    const read = performErrandAction(
      waiting,
      errand,
      "read",
      "hq-library",
      3000,
    );
    expect(read.step).toBe(1);
    expect(read.arrivedAt).toBeNull();
    expect(performErrandAction(read, errand, "read", "hq-library", 3500)).toBe(
      read,
    );
    const done = enterRoom(read, errand, "hq-desks", 5000);
    expect(done.arrivedAt).toBe(5000);
    expect(performErrandAction(done, errand, "read", "hq-library", 6000)).toBe(
      done,
    );
  });

  test("a break needs a sip in the Lounge and cannot be completed by walking through it", () => {
    const errand = getErrand("thoughtful-break")!;
    let run = startRun(errand, 0, null);
    expect(enterRoom(run, errand, "hq-lounge", 1000)).toBe(run);
    expect(performErrandAction(run, errand, "sip", null, 1500)).toBe(run);
    run = performErrandAction(run, errand, "sip", "hq-lounge", 2000);
    expect(run.step).toBe(1);
    expect(
      performErrandAction(
        run,
        getErrand("reading-reset")!,
        "read",
        "hq-library",
        2500,
      ),
    ).toBe(run);
    expect(enterRoom(run, errand, "hq-desks", 4000).arrivedAt).toBe(4000);
  });
});

describe("rewards", () => {
  test("fast and right first time earns the most", () => {
    expect(errandReward(smallChange, 10, 0, false)).toEqual({
      xp: 80,
      coins: 20,
      fast: true,
      firstTry: true,
      repeat: false,
    });
  });

  test("slow with a wrong pick still earns the base", () => {
    expect(errandReward(smallChange, 999, 2, false)).toMatchObject({
      xp: 40,
      coins: 10,
      fast: false,
      firstTry: false,
    });
  });

  test("replays earn half", () => {
    expect(errandReward(smallChange, 10, 0, true)).toMatchObject({
      xp: 40,
      coins: 10,
      repeat: true,
    });
  });

  test("completing records the best time and adds XP and coins", () => {
    const first = completeErrand(
      EMPTY_ERRAND_PROGRESS,
      smallChange,
      20,
      0,
      ROOMS,
    );
    const second = completeErrand(first.progress, smallChange, 12, 1, ROOMS);
    expect(second.progress.xp).toBe(80 + 30);
    expect(second.progress.done["small-change"]).toEqual({
      runs: 2,
      bestSeconds: 12,
      firstTry: true,
      fast: true,
    });
  });

  test("levels come every 100 XP", () => {
    expect(levelFor(0)).toEqual({ level: 1, into: 0, needed: 100 });
    expect(levelFor(250)).toEqual({ level: 3, into: 50, needed: 100 });
    expect(
      completeErrand(
        { ...EMPTY_ERRAND_PROGRESS, xp: 90 },
        smallChange,
        10,
        0,
        ROOMS,
      ).levelUp,
    ).toBe(true);
  });
});

describe("badges", () => {
  test("a fast run earns Speedy Runner once", () => {
    const first = completeErrand(
      EMPTY_ERRAND_PROGRESS,
      smallChange,
      10,
      0,
      ROOMS,
    );
    expect(first.newBadges).toEqual(["speedy-runner"]);
    expect(
      completeErrand(first.progress, smallChange, 10, 0, ROOMS).newBadges,
    ).toEqual([]);
  });

  test("three best-first-time errands earn Right Words", () => {
    let progress = EMPTY_ERRAND_PROGRESS;
    const earned: string[] = [];
    for (const errand of ERRANDS.slice(0, 3)) {
      const result = completeErrand(progress, errand, 999, 0, ROOMS);
      progress = result.progress;
      earned.push(...result.newBadges);
    }
    expect(earned).toEqual(["right-words"]);
  });

  test("visiting every room earns Office Explorer", () => {
    let progress = EMPTY_ERRAND_PROGRESS;
    const earned: string[] = [];
    for (const room of ROOMS) {
      const result = visitRoom(progress, room, ROOMS);
      progress = result.progress;
      earned.push(...result.newBadges);
    }
    expect(earned).toEqual(["office-explorer"]);
    expect(visitRoom(progress, ROOMS[0]!, ROOMS).progress).toBe(progress);
  });

  test("finishing every errand earns Errand Pro", () => {
    let progress = EMPTY_ERRAND_PROGRESS;
    for (const errand of ERRANDS)
      progress = completeErrand(progress, errand, 999, 1, ROOMS).progress;
    expect(progress.badges).toContain("errand-pro");
  });
});

describe("saved progress", () => {
  test("anything malformed starts fresh", () => {
    expect(parseErrandProgress(null)).toEqual(EMPTY_ERRAND_PROGRESS);
    expect(
      parseErrandProgress({
        xp: -5,
        coins: 0,
        done: {},
        visited: [],
        badges: [],
      }),
    ).toEqual(EMPTY_ERRAND_PROGRESS);
    expect(parseErrandProgress("{}")).toEqual(EMPTY_ERRAND_PROGRESS);
  });

  test("valid progress round-trips through JSON", () => {
    const { progress } = completeErrand(
      EMPTY_ERRAND_PROGRESS,
      smallChange,
      15,
      0,
      ROOMS,
    );
    expect(parseErrandProgress(JSON.parse(JSON.stringify(progress)))).toEqual(
      progress,
    );
  });
});
