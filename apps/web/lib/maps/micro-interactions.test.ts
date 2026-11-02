import { expect, test } from "bun:test";
import {
  microApproach,
  microInReach,
  microSpotsFor,
  nearestMicroSpot,
} from "./micro-spots";
import { damp, sipLift } from "./micro-motion";
import {
  FEED_GAP_MS,
  FEED_LENGTH,
  RACK_TASKS,
  RETRY_MS,
  lastAt,
  startFeed,
  stepFeed,
  type RackTaskId,
} from "./server-rack";
import { CLASSIC_OFFICE_ITEMS, CAMPUS_ITEMS } from "./classic-campus";
import { HQ_ITEMS } from "./clario-hq";
import { generateTeamOffice } from "@repo/shared";

test("library interactions are found in every office catalog and generated team offices", () => {
  for (const items of [
    CLASSIC_OFFICE_ITEMS,
    CAMPUS_ITEMS,
    HQ_ITEMS,
    generateTeamOffice(25).items,
  ]) {
    expect(microSpotsFor(items).some((spot) => spot.kind === "shelf")).toBe(
      true,
    );
  }
});
test("only the live rack and first vending machine supply props; all shelves are readable", () => {
  const spots = microSpotsFor([
    { kind: "bike-rack", x: 1, y: 1 },
    { kind: "bike-rack", x: 5, y: 1, variant: 1 },
    { kind: "vending-machine", x: 8, y: 1 },
    { kind: "vending-machine", x: 9, y: 1 },
    { kind: "bookshelf", x: 1, y: 5 },
    { kind: "cube-shelf", x: 4, y: 5 },
  ]);
  expect(
    spots.filter((spot) => spot.kind === "rack").map((spot) => spot.x),
  ).toEqual([5]);
  expect(
    spots.filter((spot) => spot.kind === "vending").map((spot) => spot.x),
  ).toEqual([8]);
  expect(spots.filter((spot) => spot.kind === "shelf")).toHaveLength(2);
});
test("vending needs its front; a shelf can be reached at a clear side, never from far away", () => {
  const machine = { kind: "vending" as const, x: 5, y: 5, w: 1, h: 1 };
  expect(microInReach(machine, 5, 6)).toBe(true);
  expect(microInReach(machine, 4, 5)).toBe(false);
  expect(microInReach(machine, 4, 6)).toBe(false);
  const shelf = { ...machine, kind: "shelf" as const, w: 2 };
  expect(microInReach(shelf, 4, 5)).toBe(true);
  expect(nearestMicroSpot([shelf], 2, 5)).toBeNull();
  expect(microInReach(shelf, 5, 5)).toBe(false);
});
test("click-to-use approaches stay on the map and off walls and furniture", () => {
  const spot = { kind: "shelf" as const, x: 0, y: 0, w: 2, h: 1 };
  const blocked = new Set(["0,0", "1,0", "0,1", "1,1"]);
  const at = microApproach(spot, { x: 4, y: 4 }, blocked, 5, 5)!;
  expect(blocked.has(`${at.x},${at.y}`)).toBe(false);
  expect(microInReach(spot, at.x, at.y)).toBe(true);
  expect(
    microApproach(
      spot,
      { x: 4, y: 4 },
      new Set([...blocked, "2,0", "2,1"]),
      5,
      5,
    ),
  ).toBeNull();
});
test("a sip gently rises, holds, lowers and ends at rest", () => {
  expect(sipLift(-Infinity)).toBe(0);
  expect(sipLift(0)).toBe(0);
  expect(sipLift(1)).toBe(0);
  expect(sipLift(Infinity)).toBe(0);
  expect(sipLift(0.3)).toBe(1);
  expect(sipLift(0.5)).toBe(1);
  expect(sipLift(0.7)).toBe(1);
  expect(sipLift(0.15)).toBeCloseTo(0.5);
  expect(sipLift(0.85)).toBeCloseTo(0.5);
  for (let i = 0; i <= 100; i++) {
    expect(sipLift(i / 100)).toBeGreaterThanOrEqual(0);
    expect(sipLift(i / 100)).toBeLessThanOrEqual(1);
  }
});
test("mounting/reading transitions take the same time at different frame rates", () => {
  const step = (hz: number) => {
    let x = 0;
    for (let i = 0; i < hz; i++) x = damp(x, 1, 8, 1 / hz);
    return x;
  };
  expect(step(30)).toBeCloseTo(step(144), 10);
  expect(damp(0.4, 1, 8, 0)).toBe(0.4);
});

test("office printers are available in every template and new team offices", () => {
  for (const items of [
    CLASSIC_OFFICE_ITEMS,
    CAMPUS_ITEMS,
    HQ_ITEMS,
    generateTeamOffice(5).items,
  ]) {
    expect(microSpotsFor(items).some((spot) => spot.kind === "printer")).toBe(
      true,
    );
  }
});

test("every server rack is a spot, reachable from the aisle beside it", () => {
  const servers = microSpotsFor(HQ_ITEMS).filter(
    (spot) => spot.kind === "server",
  );
  expect(servers).toHaveLength(
    HQ_ITEMS.filter((item) => item.kind === "server-rack").length,
  );
  // Clario HQ's Server Room: racks on rows 4 and 7, the cold aisle on rows 5 and 6.
  expect(nearestMicroSpot(servers, 47, 5)).toMatchObject({ x: 47, y: 4 });
  expect(nearestMicroSpot(servers, 50, 6)).toMatchObject({ x: 50, y: 7 });
  expect(nearestMicroSpot(servers, 47, 9)).toBeNull();
  const spot = servers.find((each) => each.x === 46 && each.y === 4)!;
  const blocked = new Set(
    HQ_ITEMS.map((item) => `${item.x},${item.y}`).concat("46,3", "45,4"),
  );
  const at = microApproach(spot, { x: 48, y: 10 }, blocked, 60, 40)!;
  expect(microInReach(spot, at.x, at.y)).toBe(true);
  expect(blocked.has(`${at.x},${at.y}`)).toBe(false);
});

test("the rack feed fails once, retries, then passes, and stays short", () => {
  const now = new Date(2026, 10, 2, 14, 0).getTime();
  let jobs = startFeed(now);
  expect(jobs.find((job) => job.task === "backup")).toMatchObject({
    status: "done",
    at: new Date(2026, 10, 2, 2, 0).getTime(),
  });
  // An early-morning visit shows last night's 02:00 backup, from yesterday.
  expect(lastAt(2, 0, new Date(2026, 10, 2, 1, 30).getTime())).toBe(
    new Date(2026, 10, 1, 2, 0).getTime(),
  );
  // The first roll picks the CI build (the health check just ran, so it is skipped); a 0.1 roll
  // makes a job that can fail fail once.
  const free = (Object.keys(RACK_TASKS) as RackTaskId[]).filter(
    (task) => RACK_TASKS[task].live && task !== "health",
  );
  const rolls = [free.indexOf("ci") / free.length + 0.01, 0.1];
  jobs = stepFeed(jobs, now + FEED_GAP_MS, () => rolls.shift() ?? 0.99);
  const build = jobs[0]!;
  expect(build).toMatchObject({ task: "ci", status: "running", fails: true });
  const seen = (at: number) =>
    (jobs = stepFeed(jobs, at, () => 0.99)).find((job) => job.id === build.id);
  let t = build.until;
  expect(seen(t)).toMatchObject({ status: "failed", retried: false });
  t += RETRY_MS;
  expect(seen(t)).toMatchObject({ status: "running", retried: true });
  t += RACK_TASKS.ci.ms;
  expect(seen(t)).toMatchObject({ status: "done", retried: true });
  for (let i = 0; i < 40; i++) {
    jobs = stepFeed(jobs, t + i * 1000);
    expect(jobs.length).toBeLessThanOrEqual(FEED_LENGTH);
    expect(new Set(jobs.map((job) => job.id)).size).toBe(jobs.length);
    expect(jobs[1]?.task).not.toBe(jobs[0]!.task);
    expect(
      jobs.some((job) => job.task === "backup" && job.status === "running"),
    ).toBe(false);
  }
});

test("every office template and generated team office has a server rack to look inside", () => {
  const near = (
    items: Parameters<typeof microSpotsFor>[0],
    x: number,
    y: number,
  ) =>
    nearestMicroSpot(
      microSpotsFor(items).filter((spot) => spot.kind === "server"),
      x,
      y,
    );
  // From the walkway in front of each map's racks.
  expect(near(CLASSIC_OFFICE_ITEMS, 29, 27)).toMatchObject({ x: 29, y: 28 });
  expect(near(CAMPUS_ITEMS, 46, 26)).toMatchObject({ x: 46, y: 27 });
  expect(near(HQ_ITEMS, 47, 5)).toMatchObject({ x: 47, y: 4 });
  for (const size of [1, 5, 12, 25, 50, 80]) {
    const office = generateTeamOffice(size);
    const racks = microSpotsFor(office.items).filter(
      (spot) => spot.kind === "server",
    );
    expect(racks.length).toBeGreaterThanOrEqual(1);
    // Reachable: a free tile next to each rack, and never in the front door's way.
    const blocked = new Set(office.items.map((item) => `${item.x},${item.y}`));
    office.walls.forEach((row, y) =>
      [...row].forEach((cell, x) => {
        if (cell !== ".") blocked.add(`${x},${y}`);
      }),
    );
    for (const rack of racks) {
      expect(rack.x).toBeLessThan(office.spawn.x);
      const at = microApproach(
        rack,
        office.spawn,
        blocked,
        office.cols,
        office.rows,
      );
      expect(at).not.toBeNull();
    }
  }
});
