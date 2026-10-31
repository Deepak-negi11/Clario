import { describe, expect, test } from "bun:test";
import { findGithubLink, githubLabel, parseGithubLink } from "./github-link";

describe("parseGithubLink", () => {
  test("a repo link", () => {
    expect(parseGithubLink("look at https://github.com/vercel/next.js please")).toEqual({ owner: "vercel", repo: "next.js", kind: "repo" });
    expect(parseGithubLink("https://www.github.com/acme/app.git")).toEqual({ owner: "acme", repo: "app", kind: "repo" });
  });

  test("trailing punctuation from the sentence is not part of the repo", () => {
    expect(parseGithubLink("Is it https://github.com/acme/app?")).toEqual({ owner: "acme", repo: "app", kind: "repo" });
    expect(parseGithubLink("see https://github.com/acme/app.")).toEqual({ owner: "acme", repo: "app", kind: "repo" });
  });

  test("a file or folder link keeps its branch and path", () => {
    expect(parseGithubLink("https://github.com/acme/app/blob/main/src/auth/login.ts#L10")).toEqual({
      owner: "acme",
      repo: "app",
      kind: "blob",
      ref: "main",
      path: "src/auth/login.ts",
    });
    expect(parseGithubLink("https://github.com/acme/app/tree/dev")).toEqual({ owner: "acme", repo: "app", kind: "tree", ref: "dev" });
  });

  test("a path that tries to climb out falls back to the repo", () => {
    expect(parseGithubLink("https://github.com/acme/app/blob/main/../../secrets")).toEqual({ owner: "acme", repo: "app", kind: "repo" });
  });

  test("anything else is not a GitHub link", () => {
    expect(parseGithubLink("https://gitlab.com/acme/app")).toBeNull();
    expect(parseGithubLink("https://github.com/acme")).toBeNull();
    expect(parseGithubLink("https://evil.com/?u=https:/github.com/acme/app")).toBeNull();
    expect(parseGithubLink("no link here")).toBeNull();
  });
});

describe("findGithubLink", () => {
  test("the link in this message wins, else the learner's most recent one", () => {
    const history = [
      { role: "user" as const, text: "https://github.com/old/one" },
      { role: "coworker" as const, text: "https://github.com/not/mine" },
      { role: "user" as const, text: "https://github.com/acme/app what does it do?" },
      { role: "coworker" as const, text: "It's an app." },
    ];
    expect(findGithubLink("and how do I run it?", history)).toEqual({ owner: "acme", repo: "app", kind: "repo" });
    expect(findGithubLink("now https://github.com/new/two", history)?.repo).toBe("two");
    expect(findGithubLink("hello", [])).toBeNull();
  });
});

test("githubLabel", () => {
  expect(githubLabel({ owner: "acme", repo: "app", kind: "blob", ref: "main", path: "src/a.ts" })).toBe("acme/app/src/a.ts");
});
