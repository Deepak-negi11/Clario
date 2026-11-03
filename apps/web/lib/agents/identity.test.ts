import { expect, test } from "bun:test";
import { agentArtPath, agentKind, AGENT_IDENTITY } from "./identity";

test("connected agents get distinct identities and legacy hooks still show Claude", () => {
  expect(agentKind(undefined)).toBe("claude-code");
  expect(agentKind("claude")).toBe("claude-code");
  expect(agentKind("codex")).toBe("codex");
  expect(agentKind("cursor-agent")).toBe("cursor-agent");
  expect(agentKind("cursor")).toBe("cursor-agent");
  expect(
    new Set(
      ["claude-code", "codex", "cursor-agent"].map(
        (id) => AGENT_IDENTITY[agentKind(id)].file,
      ),
    ).size,
  ).toBe(3);
});
test("unknown activity identities cannot select arbitrary images or masquerade as Claude", () => {
  for (const id of [
    "unknown",
    "https://example.com/x.svg",
    "../../secret",
    "<script>",
  ]) {
    expect(agentKind(id)).toBe("agent");
    expect(agentArtPath(agentKind(id), true)).toBe(
      "/assets/agents/agent-working.svg",
    );
  }
});
test("standby and working assets exist for every identity", async () => {
  for (const kind of ["claude-code", "codex", "cursor-agent", "agent"] as const)
    for (const working of [true, false]) {
      const path = agentArtPath(kind, working);
      const file = Bun.file(new URL(`../../public${path}`, import.meta.url));
      expect(await file.exists()).toBe(true);
      const text = await file.text();
      expect(text).toContain('viewBox="0 0 96 96"');
      expect(text).toContain("prefers-reduced-motion");
      expect(text).not.toContain('href="http');
    }
});
