import { describe, expect, test } from "bun:test";
import { AgentActivityBroadcastMessage } from "@repo/shared";
import { parseAgentGitInfo } from "./git-info";

describe("parseAgentGitInfo", () => {
  test("keeps project, branch and a 7-character commit", () => {
    expect(parseAgentGitInfo({ project: "graphite", branch: "feat/missions", commit: "4e6ee7efb7ea8c5e484930aac48c2caec2dcb76e" })).toEqual({
      project: "graphite",
      branch: "feat/missions",
      commit: "4e6ee7e",
    });
  });

  test("older hooks send none of them", () => {
    expect(parseAgentGitInfo({ text: "Claude is using Edit", state: "cooking" })).toEqual({});
  });

  test("drops values that don't fit instead of trimming them into something else", () => {
    expect(
      parseAgentGitInfo({
        project: "x".repeat(81),
        branch: 42,
        commit: "not-a-commit",
      }),
    ).toEqual({});
    expect(parseAgentGitInfo({ commit: "4E6EE7E" })).toEqual({});
    expect(parseAgentGitInfo({ commit: "4e6ee7" })).toEqual({});
    expect(parseAgentGitInfo({ project: "   " })).toEqual({});
  });

  test("strips control characters and bidi overrides that could disguise the text", () => {
    expect(parseAgentGitInfo({ project: "gra\u0007phite", branch: "main‮gnp.exe" })).toEqual({
      project: "graphite",
      branch: "maingnp.exe",
    });
  });
});

describe("agent-activity broadcast schema", () => {
  test("keeps project, branch and commit, so the client doesn't drop them", () => {
    const parsed = AgentActivityBroadcastMessage.parse({
      type: "agent-activity",
      payload: { userId: "u1", text: "Claude is using Edit page.tsx", state: "cooking", at: 1, project: "graphite", branch: "main", commit: "4e6ee7e" },
    });
    expect(parsed.payload).toMatchObject({ project: "graphite", branch: "main", commit: "4e6ee7e" });
  });

  test("still accepts messages without them", () => {
    expect(AgentActivityBroadcastMessage.safeParse({ type: "agent-activity", payload: { userId: "u1", text: "", state: "done", at: 1 } }).success).toBe(true);
  });
});
