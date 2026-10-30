import { describe, expect, test } from "bun:test";
import {
  bounce, canReturn, isDeuce, matchPointFor, reachFloor, returned, scoreCall, serveRally, serverAt, solveArc, touchNet, winnerOf,
  type Call, type Rally,
} from "./pong-rules";

const rallyOf = (call: Call): Rally => {
  if (call.kind !== "play") throw new Error(`expected play, got ${JSON.stringify(call)}`);
  return call.rally;
};

describe("winning a game", () => {
  test("first to 11 wins", () => {
    expect(winnerOf([11, 0])).toBe(0);
    expect(winnerOf([9, 11])).toBe(1);
    expect(winnerOf([10, 9])).toBeNull();
  });

  test("must win by 2", () => {
    expect(winnerOf([11, 10])).toBeNull();
    expect(winnerOf([12, 10])).toBe(0);
    expect(winnerOf([15, 16])).toBeNull();
    expect(winnerOf([15, 17])).toBe(1);
  });

  test("deuce at 10-all and every tie after", () => {
    expect(isDeuce([10, 10])).toBe(true);
    expect(isDeuce([13, 13])).toBe(true);
    expect(isDeuce([9, 9])).toBe(false);
    expect(isDeuce([11, 10])).toBe(false);
  });

  test("match point is one point from winning", () => {
    expect(matchPointFor([10, 4])).toBe(0);
    expect(matchPointFor([3, 10])).toBe(1);
    expect(matchPointFor([10, 10])).toBeNull();
    expect(matchPointFor([11, 10])).toBe(0);
    expect(matchPointFor([9, 9])).toBeNull();
    expect(matchPointFor([11, 3])).toBeNull(); // already over
  });

  test("the umpire's call", () => {
    const names = ["You", "Computer"] as const;
    expect(scoreCall([10, 10], names)).toBe("Deuce");
    expect(scoreCall([10, 7], names)).toBe("Match point to you");
    expect(scoreCall([11, 12], names)).toBe("Match point Computer");
    expect(scoreCall([4, 2], names)).toBeNull();
  });
});

describe("who serves", () => {
  test("two serves each", () => {
    const order = Array.from({ length: 8 }, (_, played) => serverAt([played, 0], 0));
    expect(order).toEqual([0, 0, 1, 1, 0, 0, 1, 1]);
    expect(serverAt([0, 0], 1)).toBe(1);
    expect(serverAt([1, 1], 1)).toBe(0);
  });

  test("the score, not who won the points, decides", () => {
    expect(serverAt([2, 1], 0)).toBe(1);
    expect(serverAt([1, 2], 0)).toBe(1);
    expect(serverAt([3, 1], 0)).toBe(0);
  });

  test("one serve each from 10-all", () => {
    // 20 points played: ten turns of two, so the first server is back.
    expect(serverAt([10, 10], 0)).toBe(0);
    expect(serverAt([11, 10], 0)).toBe(1);
    expect(serverAt([11, 11], 0)).toBe(0);
    expect(serverAt([12, 11], 0)).toBe(1);
    expect(serverAt([10, 10], 1)).toBe(1);
  });

  test("the two serves before deuce stay in pairs", () => {
    expect(serverAt([9, 9], 0)).toBe(1);
    expect(serverAt([10, 9], 0)).toBe(1);
  });
});

describe("the referee", () => {
  test("a good serve bounces on each half once", () => {
    let rally = serveRally(0);
    rally = rallyOf(bounce(rally, 0));
    rally = rallyOf(bounce(rally, 1));
    expect(canReturn(rally, 1)).toBe(true);
    expect(canReturn(rally, 0)).toBe(false);
  });

  test("a serve straight onto the far half is a fault", () => {
    expect(bounce(serveRally(0), 1)).toEqual({ kind: "point", winner: 1, reason: "fault" });
  });

  test("a serve that bounces twice on the server's half is a fault", () => {
    const rally = rallyOf(bounce(serveRally(1), 1));
    expect(bounce(rally, 1)).toEqual({ kind: "point", winner: 0, reason: "fault" });
  });

  test("a serve that clips the net and lands is a let", () => {
    let rally = rallyOf(bounce(serveRally(0), 0));
    rally = touchNet(rally);
    expect(bounce(rally, 1)).toEqual({ kind: "let" });
  });

  test("a serve into the net that falls back is a fault, not a let", () => {
    let rally = rallyOf(bounce(serveRally(0), 0));
    rally = touchNet(rally);
    expect(bounce(rally, 0)).toEqual({ kind: "point", winner: 1, reason: "fault" });
  });

  test("a return that clips the net and lands plays on", () => {
    const rally = touchNet(returned(1));
    expect(rallyOf(bounce(rally, 0)).farBounces).toBe(1);
  });

  test("a return that falls back off the net loses the point", () => {
    expect(bounce(touchNet(returned(1)), 1)).toEqual({ kind: "point", winner: 0, reason: "net" });
  });

  test("a ball that bounces twice on the receiver's half is theirs to lose", () => {
    let rally = returned(0);
    rally = rallyOf(bounce(rally, 1));
    expect(bounce(rally, 1)).toEqual({ kind: "point", winner: 0, reason: "missed" });
  });

  test("a good ball that reaches the floor is a miss", () => {
    const rally = rallyOf(bounce(returned(0), 1));
    expect(reachFloor(rally)).toEqual({ kind: "point", winner: 0, reason: "missed" });
  });

  test("a ball that never lands on the table is out", () => {
    expect(reachFloor(returned(0))).toEqual({ kind: "point", winner: 1, reason: "out" });
    expect(reachFloor(touchNet(returned(1)))).toEqual({ kind: "point", winner: 0, reason: "net" });
  });

  test("a serve that misses the table is a fault", () => {
    expect(reachFloor(serveRally(1))).toEqual({ kind: "point", winner: 0, reason: "fault" });
    const halfway = rallyOf(bounce(serveRally(1), 1));
    expect(reachFloor(halfway)).toEqual({ kind: "point", winner: 0, reason: "fault" });
  });

  test("no volleys: the ball must bounce before it's returned", () => {
    expect(canReturn(returned(0), 1)).toBe(false);
    expect(canReturn(rallyOf(bounce(serveRally(0), 0)), 1)).toBe(false);
  });
});

describe("shot arcs", () => {
  const g = 9.81;

  // Where the arc is at x, from the solved speeds.
  const heightAt = (x0: number, z0: number, arc: { vx: number; vz: number }, x: number) => {
    const t = (x - x0) / arc.vx;
    return z0 + arc.vz * t - 0.5 * g * t * t;
  };

  test("passes through the net point and lands where aimed", () => {
    const arc = solveArc(-1.6, 0.25, 0, 0.3, 0.95, 0.03, g)!;
    expect(arc).not.toBeNull();
    expect(arc.vx).toBeGreaterThan(0);
    expect(heightAt(-1.6, 0.25, arc, 0)).toBeCloseTo(0.3, 6);
    expect(heightAt(-1.6, 0.25, arc, 0.95)).toBeCloseTo(0.03, 6);
    expect(arc.time).toBeCloseTo(2.55 / arc.vx, 6);
  });

  test("works in both directions", () => {
    const arc = solveArc(1.6, 0.2, 0, 0.25, -0.9, 0.03, g)!;
    expect(arc.vx).toBeLessThan(0);
    expect(heightAt(1.6, 0.2, arc, -0.9)).toBeCloseTo(0.03, 6);
  });

  test("a lower net point means a faster shot", () => {
    const loop = solveArc(-1.6, 0.2, 0, 0.45, 0.9, 0.03, g)!;
    const drive = solveArc(-1.6, 0.2, 0, 0.22, 0.9, 0.03, g)!;
    expect(Math.abs(drive.vx)).toBeGreaterThan(Math.abs(loop.vx));
  });

  test("a shot too flat for the top speed is lifted over the net instead", () => {
    // From high up, a net point this low would need the ball to curve upwards.
    const arc = solveArc(-1.6, 0.6, 0, 0.16, 1, 0.03, g, 12)!;
    expect(arc).not.toBeNull();
    expect(Math.abs(arc.vx)).toBeLessThanOrEqual(12 + 1e-9);
    expect(heightAt(-1.6, 0.6, arc, 0)).toBeGreaterThan(0.16);
    expect(heightAt(-1.6, 0.6, arc, 1)).toBeCloseTo(0.03, 6);
  });

  test("no arc when the net isn't between the ends", () => {
    expect(solveArc(-1.6, 0.2, 0, 0.3, -0.5, 0.03, g)).toBeNull();
  });
});
