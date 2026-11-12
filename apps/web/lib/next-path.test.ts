import { describe, expect, test } from "bun:test";
import { authLink, safeNextPath } from "./next-path";

describe("safeNextPath", () => {
  test("keeps paths on this site", () => {
    expect(safeNextPath("/space/abc123")).toBe("/space/abc123");
    expect(safeNextPath("/spaces")).toBe("/spaces");
  });

  test("refuses other sites and odd input", () => {
    for (const raw of ["https://evil.example", "//evil.example", "/\\evil.example", "space/abc", "/space/a b", "", null, undefined]) {
      expect(safeNextPath(raw)).toBeNull();
    }
  });
});

describe("authLink", () => {
  test("carries the path to come back to", () => {
    expect(authLink("/signin", "/space/abc123")).toBe("/signin?next=%2Fspace%2Fabc123");
    expect(authLink("/signup", null)).toBe("/signup");
  });
});
