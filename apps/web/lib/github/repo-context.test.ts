import { expect, spyOn, test } from "bun:test";
import { repoContext } from "./repo-context";

test("a broad operator token cannot expose a private repo through coworker chat", async () => {
  const fetch = spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ private: true, full_name: "secret/project", description: "private project details" }));
  try {
    const result = await repoContext({ owner: "review", repo: crypto.randomUUID(), kind: "repo" }, new AbortController().signal);
    expect(result).toContain("only public repos");
    expect(result).not.toContain("private project details");
    expect(result).not.toContain("secret/project");
    expect(fetch).toHaveBeenCalledTimes(1); // No README, directory or file request.
    expect(fetch.mock.calls[0]?.[1]?.redirect).toBe("error");
  } finally { fetch.mockRestore(); }
});
