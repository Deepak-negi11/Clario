import { describe, expect, test } from "bun:test";
import { WORK_LEVELS, canAssignTask, parseWorkLevel, workLevelRank, type WorkLevel } from "./work-level";

describe("work levels", () => {
  test("rank runs from Fresher (1) to Lead / Manager (5)", () => {
    expect(WORK_LEVELS.map(workLevelRank)).toEqual([1, 2, 3, 4, 5]);
    expect(workLevelRank("fresher")).toBe(1);
    expect(workLevelRank("lead")).toBe(5);
  });

  test("parseWorkLevel accepts only the five ids", () => {
    expect(parseWorkLevel("senior")).toBe("senior");
    expect(parseWorkLevel("Senior")).toBeNull();
    expect(parseWorkLevel("manager")).toBeNull();
    expect(parseWorkLevel(4)).toBeNull();
    expect(parseWorkLevel(null)).toBeNull();
  });
});

describe("canAssignTask", () => {
  test("a higher level can assign to every lower level", () => {
    expect(canAssignTask("senior", "junior")).toBe(true);
    expect(canAssignTask("lead", "fresher")).toBe(true);
    expect(canAssignTask("junior", "fresher")).toBe(true);
  });

  test("the same level and upward are refused", () => {
    expect(canAssignTask("senior", "senior")).toBe(false);
    expect(canAssignTask("junior", "senior")).toBe(false);
    expect(canAssignTask("fresher", "lead")).toBe(false);
  });

  test("an unknown level on either side is refused", () => {
    expect(canAssignTask(null, "fresher")).toBe(false);
    expect(canAssignTask("lead", null)).toBe(false);
    expect(canAssignTask(null, null)).toBe(false);
  });

  test("only strictly-downward pairs are allowed: 10 of the 25", () => {
    const allowed: string[] = [];
    for (const assigner of WORK_LEVELS) {
      for (const assignee of WORK_LEVELS) {
        if (canAssignTask(assigner as WorkLevel, assignee as WorkLevel)) allowed.push(`${assigner}>${assignee}`);
      }
    }
    // Same-level assignment would make this 15.
    expect(allowed).toHaveLength(10);
    expect(allowed).not.toContain("mid>mid");
    expect(allowed).toContain("mid>junior");
  });
});
